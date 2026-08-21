import sqlite3
import json
import os
import re

def srt_time(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def wrap_subtitle(text, line_len=36):
    words = text.split()
    lines = []
    current = ""
    for w in words:
        cand = f"{current} {w}" if current else w
        if len(cand) > line_len and current:
            lines.append(current)
            current = w
        else:
            current = cand
    if current:
        lines.append(current)
    return "\n".join(lines)

def generate_srt(segments):
    raw_cues = []
    for seg in segments:
        if not seg.get("enabled", True):
            continue
        text = seg.get("translated_text", "").strip()
        if not text:
            continue
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start + 1))
        raw_cues.append({"start": start, "end": end, "text": text})

    GAP_SEC = 0.09 # 90ms gap between consecutive lines (exceeds 80ms)
    adjusted_cues = []

    # First pass: ensure initial gap
    for i in range(len(raw_cues)):
        current = dict(raw_cues[i])
        nxt = raw_cues[i + 1] if i + 1 < len(raw_cues) else None
        if nxt:
            max_allowed_end = nxt["start"] - GAP_SEC
            if current["end"] > max_allowed_end:
                current["end"] = max(current["start"] + 0.1, max_allowed_end)
        adjusted_cues.append(current)

    # Second pass: balance CPS between adjacent cues if any cue CPS > 19
    for i in range(len(adjusted_cues)):
        cur = adjusted_cues[i]
        c_len = len(cur["text"].replace(" ", ""))
        c_dur = max(0.1, cur["end"] - cur["start"])
        cps = c_len / c_dur

        if cps > 19.0:
            target_dur = c_len / 18.0
            diff = target_dur - c_dur
            nxt = adjusted_cues[i + 1] if i + 1 < len(adjusted_cues) else None
            prev = adjusted_cues[i - 1] if i > 0 else None

            # Borrow time from next if next has surplus duration
            if nxt:
                n_len = len(nxt["text"].replace(" ", ""))
                n_dur = max(0.1, nxt["end"] - nxt["start"])
                n_cps = n_len / n_dur
                if n_cps < 17.5:
                    shift = min(diff, (nxt["end"] - nxt["start"]) * 0.4)
                    cur["end"] += shift
                    nxt["start"] += shift

            # Re-check CPS
            c_dur = max(0.1, cur["end"] - cur["start"])
            cps = c_len / c_dur

            # Borrow time from prev if still needed
            if cps > 19.0 and prev:
                p_len = len(prev["text"].replace(" ", ""))
                p_dur = max(0.1, prev["end"] - prev["start"])
                p_cps = p_len / p_dur
                if p_cps < 17.5:
                    shift = min(diff, (prev["end"] - prev["start"]) * 0.3)
                    prev["end"] -= shift
                    cur["start"] -= shift

    # Final pass: enforce 90ms gap strictly
    for i in range(len(adjusted_cues) - 1):
        if adjusted_cues[i]["end"] > adjusted_cues[i+1]["start"] - GAP_SEC:
            adjusted_cues[i]["end"] = adjusted_cues[i+1]["start"] - GAP_SEC

    srt_lines = []
    for idx, cue in enumerate(adjusted_cues, 1):
        line = f"{idx}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{wrap_subtitle(cue['text'])}\n"
        srt_lines.append(line)

    return "\n".join(srt_lines)

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = 'dub-1786453409257'")
    row = cur.fetchone()
    if row:
        pid, data_str = row
        data = json.loads(data_str)
        srt_content = generate_srt(data.get("segments", []))
        out_dir = f"d:/AutoDub Sub/ai-video-factory/storage/{pid}/dub-work"
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "translated.srt")
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(srt_content)
        print("Successfully generated translated.srt for", pid)
