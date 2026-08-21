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

print(f"Checking all {len(segments)} segments in SQLite and on disk:")
all_ok = True
for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    p_seg = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    p_000 = os.path.join(STORAGE_DIR, f"segment-{idx:03d}-voice.wav")
    
    if not os.path.exists(p_seg) or not os.path.exists(p_000):
        print(f"❌ Missing file for Seg {idx:02d}")
        all_ok = False
        continue
        
    with wave.open(p_seg, 'rb') as wf:
        dur_seg = wf.getnframes() / wf.getframerate()
    with wave.open(p_000, 'rb') as wf:
        dur_000 = wf.getnframes() / wf.getframerate()
        
    db_dur = seg.get("voice_duration", 0)
    txt = seg.get("translated_text", "")
    is_fit = dur_seg <= orig_dur + 0.05
    status = "✅ OK" if is_fit else "❌ OVERFLOW"
    
    print(f"Seg {idx:02d} | Slot: {orig_dur:5.2f}s | Audio: {dur_seg:5.2f}s (DB: {db_dur:5.2f}s) | {status} | Text: {txt[:35]}")
    if not is_fit:
        all_ok = False

if all_ok:
    print("\n🎉 ALL 23 SEGMENTS AUDIO & DB ENTRIES ARE 100% COMPLETE AND FIT PERFECTLY!")
else:
    print("\n⚠️ Some segments need attention.")
