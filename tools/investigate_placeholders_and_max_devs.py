import sqlite3
import json
import os
import subprocess

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Investigate the 41 placeholder segments
print("================================================================================")
print("=== 1. ĐIỀU TRA 41 PHÂN ĐOẠN PLACEHOLDER RỖNG TRONG DATABASE ===")
print("================================================================================\n")

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()

placeholders = []
for r in rows:
    pid = r[0]
    data = json.loads(r[1])
    segs = data.get("segments", [])
    for idx, s in enumerate(segs, 1):
        trans = s.get("translated_text", "").strip()
        src = s.get("source_text", "").strip()
        if trans in [".", '"', "'", "…", ""]:
            placeholders.append({
                "pid": pid,
                "idx": idx,
                "id": s.get("id"),
                "start": s["start"],
                "end": s["end"],
                "dur": round(s["end"] - s["start"], 3),
                "src": src,
                "trans": trans,
                "voice_url": s.get("voice_url"),
                "voice_duration": s.get("voice_duration")
            })

print(f"Tổng số đoạn có translated_text là dấu câu/rỗng: {len(placeholders)}")
print("\n--- 10 Đoạn Placeholder Tiêu Biểu ---")
for p in placeholders[:10]:
    print(f"[{p['pid']}] Đoạn {p['idx']:02d} (ID: {p['id']}) | {p['start']:.2f}s -> {p['end']:.2f}s ({p['dur']}s)")
    print(f"   [GỐC]: {p['src'][:60]}")
    print(f"   [DỊCH]: '{p['trans']}' | Voice Dur: {p['voice_duration']}")
    print(f"   [Voice URL]: {p['voice_url']}\n")

# 2. Extract and inspect the 3 Max Deviation segments (362.25%, 193.89%, 81.91%)
print("\n================================================================================")
print("=== 2. ĐIỀU TRA CHI TIẾT 3 ĐOẠN CÓ MAX DEVIATION CAO NHẤT ===")
print("================================================================================\n")

target_pids = ["dub-1786899653642", "dub-1786900777961", "dub-1786898959225"]
max_dev_cases = []

for pid in target_pids:
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row:
        continue
    data = json.loads(row[1])
    segs = data.get("segments", [])
    
    highest_dev = 0
    highest_item = None
    
    for idx, s in enumerate(segs, 1):
        orig_dur = max(0.1, s["end"] - s["start"])
        raw_dur = s.get("voice_duration") or orig_dur
        dev = abs(raw_dur - orig_dur) / orig_dur * 100
        
        # Check fitted duration with dynamic atempo
        target_min = orig_dur * 0.92
        target_max = orig_dur * 1.05
        if raw_dur > target_max:
            speed = min(1.35, raw_dur / (orig_dur * 1.02))
            fitted_dur = raw_dur / speed
        elif raw_dur < target_min:
            speed = max(0.88, raw_dur / (orig_dur * 0.96))
            fitted_dur = raw_dur / speed
        else:
            speed = 1.0
            fitted_dur = raw_dur
            
        fitted_dev = abs(fitted_dur - orig_dur) / orig_dur * 100
        
        if fitted_dev > highest_dev:
            highest_dev = fitted_dev
            highest_item = {
                "pid": pid,
                "idx": idx,
                "id": s.get("id"),
                "start": round(s["start"], 3),
                "end": round(s["end"], 3),
                "orig_dur": round(orig_dur, 3),
                "raw_dur": round(raw_dur, 3),
                "fitted_dur": round(fitted_dur, 3),
                "speed": round(speed, 2),
                "fitted_dev": round(fitted_dev, 2),
                "src_text": s.get("source_text", ""),
                "trans_text": s.get("translated_text", ""),
                "voice_url": s.get("voice_url")
            }
    if highest_item:
        max_dev_cases.append(highest_item)

print(json.dumps(max_dev_cases, indent=2, ensure_ascii=False))
