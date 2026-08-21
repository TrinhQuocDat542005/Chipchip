import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

pids = ["dub-1786900777961", "dub-1786897570201", "dub-1786899653642", "dub-1786898959225", "dub-1786732340533-part-01"]

long_segments = []

for pid in pids:
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row or not row[1]:
        continue
    data = json.loads(row[1])
    segments = data.get("segments", [])
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        raw_dur = seg.get("voice_duration") or orig_dur
        target_max = orig_dur * 1.05
        if raw_dur > target_max:
            speed_needed = raw_dur / (orig_dur * 1.02)
            if speed_needed > 1.35:
                long_segments.append({
                    "pid": pid,
                    "idx": idx,
                    "id": seg.get("id"),
                    "start": round(seg["start"], 2),
                    "end": round(seg["end"], 2),
                    "orig_dur": round(orig_dur, 2),
                    "raw_dur": round(raw_dur, 2),
                    "speed_needed": round(speed_needed, 2),
                    "src_text": seg.get("source_text", ""),
                    "trans_text": seg.get("translated_text", "")
                })

print(f"Tìm thấy {len(long_segments)} đoạn dài vượt trần 1.35x:")
print(json.dumps(long_segments, indent=2, ensure_ascii=False))
