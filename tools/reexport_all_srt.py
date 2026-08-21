import sqlite3
import json
import os
import re

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"

BENCHMARK_PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

def srt_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        ms = 999
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def wrap_subtitle(text: str, max_chars=36) -> str:
    if len(text) <= max_chars:
        return text
    words = text.split()
    lines = []
    cur = []
    cur_len = 0
    for w in words:
        if cur_len + len(w) + (1 if cur else 0) <= max_chars:
            cur.append(w)
            cur_len += len(w) + (1 if cur else 0)
        else:
            lines.append(" ".join(cur))
            cur = [w]
            cur_len = len(w)
    if cur:
        lines.append(" ".join(cur))
    return "\n".join(lines[:2])

def build_readable_srt(segments: list) -> str:
    raw_cues = []
    for seg in segments:
        text = seg.get("translated_text", "").strip()
        if not text:
            continue
        start = seg["start"]
        end = seg["end"]
        dur = max(0.6, end - start)
        
        # Nếu câu dài > 70 ký tự và dur > 4.0s thì mới tách làm đôi, ngược lại giữ nguyên 1 cue 2 dòng
        if len(text) > 70 and dur >= 4.0:
            words = text.split()
            mid = len(words) // 2
            p1 = " ".join(words[:mid])
            p2 = " ".join(words[mid:])
            t_split = start + dur * 0.5
            raw_cues.append({"start": start, "end": t_split, "text": p1})
            raw_cues.append({"start": t_split, "end": end, "text": p2})
        else:
            raw_cues.append({"start": start, "end": end, "text": text})

    GAP_SEC = 0.09
    adjusted = []
    for i in range(len(raw_cues)):
        cur_c = dict(raw_cues[i])
        if i + 1 < len(raw_cues):
            max_allowed = raw_cues[i+1]["start"] - GAP_SEC
            if cur_c["end"] > max_allowed:
                cur_c["end"] = max(cur_c["start"] + 0.1, max_allowed)
        adjusted.append(cur_c)

    # 2-pass CPS balancing
    for i in range(len(adjusted)):
        c = adjusted[i]
        c_len = len(re.sub(r'\s+', '', c["text"]))
        c_dur = max(0.1, c["end"] - c["start"])
        cps = c_len / c_dur
        if cps > 19.0:
            target_dur = c_len / 18.0
            diff = target_dur - c_dur
            if i + 1 < len(adjusted):
                nxt = adjusted[i+1]
                n_len = len(re.sub(r'\s+', '', nxt["text"]))
                n_dur = max(0.1, nxt["end"] - nxt["start"])
                if n_len / n_dur < 17.5:
                    shift = min(diff, (nxt["end"] - nxt["start"]) * 0.4)
                    c["end"] += shift
                    nxt["start"] += shift
            c_dur = max(0.1, c["end"] - c["start"])
            cps = c_len / c_dur
            if cps > 19.0 and i > 0:
                prev = adjusted[i-1]
                p_len = len(re.sub(r'\s+', '', prev["text"]))
                p_dur = max(0.1, prev["end"] - prev["start"])
                if p_len / p_dur < 17.5:
                    shift = min(diff, (prev["end"] - prev["start"]) * 0.3)
                    prev["end"] -= shift
                    c["start"] -= shift

    # Final gap enforcement
    for i in range(len(adjusted) - 1):
        if adjusted[i]["end"] > adjusted[i+1]["start"] - GAP_SEC:
            adjusted[i]["end"] = adjusted[i+1]["start"] - GAP_SEC

    srt_lines = []
    for idx, cue in enumerate(adjusted, 1):
        srt_lines.append(f"{idx}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{wrap_subtitle(cue['text'], 36)}\n")
    return "\n".join(srt_lines)

for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row or not row[0]:
        continue
    data = json.loads(row[0])
    segments = data.get("segments", [])
    if not segments:
        continue
        
    srt_content = build_readable_srt(segments)
    out_dir = os.path.join(STORAGE_DIR, pid, "dub-work")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "translated.srt")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(srt_content)
    print(f"✅ Re-exported SRT chuẩn cho {pid}")
