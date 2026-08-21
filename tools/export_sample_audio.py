import sqlite3
import json
import os
import subprocess

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()

candidates_fast = [] # speed near 1.35x
candidates_slow = [] # speed near 0.88x

for r in rows:
    pid = r[0]
    data = json.loads(r[1])
    segs = data.get("segments", [])
    storage_folder = os.path.join("d:/AutoDub Sub/ai-video-factory/storage", pid)
    
    for idx, seg in enumerate(segs, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        raw_dur = seg.get("voice_duration") or orig_dur
        target_min = orig_dur * 0.92
        target_max = orig_dur * 1.05
        
        speed = 1.0
        if raw_dur > target_max:
            speed = min(1.35, raw_dur / (orig_dur * 1.02))
        elif raw_dur < target_min:
            speed = max(0.88, raw_dur / (orig_dur * 0.96))
            
        voice_url = seg.get("voice_url", "")
        # Find local voice file
        voice_file = None
        if voice_url:
            filename = os.path.basename(voice_url)
            possible = os.path.join(storage_folder, filename)
            if os.path.exists(possible):
                voice_file = possible
        if not voice_file:
            # check preview or segment files
            p1 = os.path.join(storage_folder, f"segment-{idx:03d}-voice.wav")
            p2 = os.path.join(storage_folder, f"segment-{idx}-voice.wav")
            p3 = os.path.join(storage_folder, "dub-work", f"preview-{idx:03d}.wav")
            for p in [p1, p2, p3]:
                if os.path.exists(p):
                    voice_file = p
                    break
                    
        source_media = os.path.join(storage_folder, "source.mp4")
        if not os.path.exists(source_media):
            # check project media_url or source files
            for sf in ["source.mp4", "source.wav", "input.mp4"]:
                sp = os.path.join(storage_folder, sf)
                if os.path.exists(sp):
                    source_media = sp
                    break

        item = {
            "pid": pid,
            "seg_idx": idx,
            "start": seg["start"],
            "end": seg["end"],
            "orig_dur": orig_dur,
            "raw_dur": raw_dur,
            "speed": speed,
            "src_text": seg.get("source_text", ""),
            "vi_text": seg.get("translated_text", ""),
            "voice_file": voice_file,
            "source_media": source_media if os.path.exists(source_media) else None
        }
        
        if speed >= 1.25 and voice_file:
            candidates_fast.append(item)
        elif speed <= 0.92 and voice_file:
            candidates_slow.append(item)

print(f"Tìm thấy {len(candidates_fast)} đoạn tăng tốc mạnh (>=1.25x), {len(candidates_slow)} đoạn giảm tốc mạnh (<=0.92x)")

# Sort to pick the most extreme
candidates_fast.sort(key=lambda x: x["speed"], reverse=True)
candidates_slow.sort(key=lambda x: x["speed"])

print("\nTop 3 Fast:")
for c in candidates_fast[:3]:
    print(f"  {c['pid']} Đoạn {c['seg_idx']} | Speed={c['speed']:.2f}x | Gốc={c['orig_dur']:.2f}s | Voice: {c['voice_file']}")

print("\nTop 3 Slow:")
for c in candidates_slow[:3]:
    print(f"  {c['pid']} Đoạn {c['seg_idx']} | Speed={c['speed']:.2f}x | Gốc={c['orig_dur']:.2f}s | Voice: {c['voice_file']}")
