import sqlite3
import json
import os
import re

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

pids = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
    "dub-1786732340533-part-02",
    "dub-1786732340533-part-03",
    "dub-1786732340533-part-04",
    "dub-1786453409257"
]

total_scanned_segments = 0
suspect_segments = []

# Heuristics:
# 1. Extreme Ratio: len(vi_words) / len(zh_chars) < 0.35 (too short / lost text) or > 3.5 (too long / absorbed next text)
# 2. Duplicate source text across consecutive segments with split translations
# 3. Next segment text appearing in current translation (merged translation)

for pid in pids:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row:
        continue
    data = json.loads(row[0])
    segments = data.get("segments", [])
    if not segments:
        continue
        
    project_suspects = []
    
    for idx, seg in enumerate(segments):
        total_scanned_segments += 1
        src = seg.get("source_text", "").strip()
        trans = seg.get("translated_text", "").strip()
        zh_chars = len(re.sub(r'[^\u4e00-\u9fff]', '', src))
        if zh_chars == 0:
            zh_chars = len(src)
        vi_words = len(trans.split())
        
        ratio = vi_words / max(1, zh_chars)
        
        is_suspect = False
        reason = ""
        
        # Check if identical source text repeated
        if idx > 0 and src and src == segments[idx-1].get("source_text", "").strip():
            is_suspect = True
            reason = "Duplicate source_text across split segments"
        elif zh_chars >= 8 and ratio > 3.5:
            is_suspect = True
            reason = f"Extreme high ratio ({ratio:.2f} w/ch, {zh_chars} zh -> {vi_words} vi words)"
        elif zh_chars >= 15 and ratio < 0.35:
            is_suspect = True
            reason = f"Extreme low ratio ({ratio:.2f} w/ch, {zh_chars} zh -> {vi_words} vi words)"
            
        # Check if next segment source keywords appear in current translation
        if idx + 1 < len(segments):
            next_src = segments[idx+1].get("source_text", "").strip()
            # if next_src has distinctive numbers/words that appear in current translation
            # e.g. "七点" (7 điểm) / "二十一分钟" (21 phút) in current trans but next source
            if "七点" in next_src and ("7 điểm" in trans or "bảy điểm" in trans):
                is_suspect = True
                reason = "Next segment keywords found in current translation (Shift/Merge)"
                
        if is_suspect:
            suspect_item = {
                "pid": pid,
                "idx": idx + 1,
                "id": seg.get("id"),
                "start": seg["start"],
                "end": seg["end"],
                "dur": round(seg["end"] - seg["start"], 2),
                "zh_chars": zh_chars,
                "vi_words": vi_words,
                "ratio": round(ratio, 2),
                "src": src[:40] + ("..." if len(src) > 40 else ""),
                "trans": trans[:40] + ("..." if len(trans) > 40 else ""),
                "reason": reason
            }
            project_suspects.append(suspect_item)
            suspect_segments.append(suspect_item)
            
    print(f"Project {pid:28s} | Tổng: {len(segments):3d} đoạn | Nghi lệch: {len(project_suspects):2d} đoạn ({len(project_suspects)/len(segments)*100:5.1f}%)")

print("\n================================================================================")
print(f"=== TỔNG KẾT QUÉT TOÀN BỘ {total_scanned_segments} PHÂN ĐOẠN ===")
print("================================================================================")
print(f"Tổng số đoạn bị nghi lệch cặp gốc-dịch: {len(suspect_segments)} / {total_scanned_segments} ({len(suspect_segments)/total_scanned_segments*100:.2f}%)")

print("\n--- MẪU 10 ĐOẠN NGHI LỆCH TIÊU BIỂU ---")
for s in suspect_segments[:10]:
    print(f"[{s['pid']}] Seg {s['idx']:02d} ({s['dur']}s) | Ratio: {s['ratio']} w/ch | Lý do: {s['reason']}")
    print(f"   ZH ({s['zh_chars']} ch): {s['src']}")
    print(f"   VI ({s['vi_words']} w ): {s['trans']}\n")
