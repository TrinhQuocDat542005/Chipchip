import sqlite3
import json
import os
import wave

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

print("Syncing SQLite database with actual WAV files on disk...")
for idx, seg in enumerate(segments, 1):
    wav_file = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    if os.path.exists(wav_file):
        with wave.open(wav_file, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        seg['voice_duration'] = round(dur, 3)
        seg['voice_url'] = f"segment-seg-{idx}-voice.wav"
        print(f"Seg {idx:02d} | Slot: {seg['end']-seg['start']:.2f}s | Voice: {dur:.2f}s")

cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = 'dub-1786897570201'", (json.dumps(data, ensure_ascii=False),))
conn.commit()
print("✅ Committed updated voice_duration to SQLite!")
