import os
import wave
import json
import sqlite3

# 1. Load 49 segments from DB
conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49_segs = data.get('segments', [])

print(f"Current DB segments count: {len(current_49_segs)}")

# 2. Inspect the 112 wav files in storage
storage_dir = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786900777961'
wav_112_files = []
for i in range(1, 113):
    fn1 = f"segment-{i:03d}-voice.wav"
    fn2 = f"segment-{i}-voice.wav"
    p1 = os.path.join(storage_dir, fn1)
    p2 = os.path.join(storage_dir, fn2)
    
    actual_path = None
    if os.path.exists(p1):
        actual_path = p1
    elif os.path.exists(p2):
        actual_path = p2
        
    if actual_path:
        with wave.open(actual_path, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        wav_112_files.append((i, os.path.basename(actual_path), dur))
    else:
        # check in dub-work/preview-XXX.wav
        pw = os.path.join(storage_dir, "dub-work", f"preview-{i:03d}.wav")
        if os.path.exists(pw):
            with wave.open(pw, 'rb') as wf:
                dur = wf.getnframes() / wf.getframerate()
            wav_112_files.append((i, f"dub-work/preview-{i:03d}.wav", dur))
        else:
            wav_112_files.append((i, "MISSING", 0.0))

print(f"Total old wav files indexed: {len(wav_112_files)}")
print(f"Sample old wavs: {wav_112_files[:10]}")
print(f"Seg 100 wav: {[x for x in wav_112_files if x[0] == 100]}")
