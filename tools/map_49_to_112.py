import sqlite3
import json
import os
import wave
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

# Load old 112 segments if found, or map them based on timestamp / storage wav / text
storage_dir = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786900777961'

# Let's inspect the files and check audio durations
print(f"Total current segments: {len(current_49)}")

# Let's examine how each 49 segment covers the video timeline
for i, s in enumerate(current_49, 1):
    st = s['start']
    en = s['end']
    dur = en - st
    src = s.get('source_text', '')
    trans = s.get('translated_text', '')
    
    # check corresponding old wav files that fall into [st, en]
    # For example, in old 112 layout, what was the index?
    print(f"Seg {i:02d} | [{st:6.2f}s -> {en:6.2f}s] ({dur:5.2f}s)")
    print(f"   ZH: {src}")
    print(f"   VI: {trans}\n")
