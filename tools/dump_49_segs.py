import sqlite3
import json
import os
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49_segs = data.get('segments', [])

# We have 49 segments with start, end, src, trans.
print(f"Total current segments: {len(current_49_segs)}")

# Let's inspect each of the 49 segments
for idx, seg in enumerate(current_49_segs, 1):
    st = seg['start']
    en = seg['end']
    dur = en - st
    src = seg.get('source_text', '').strip()
    trans = seg.get('translated_text', '').strip()
    print(f"Seg {idx:02d} | [{st:6.2f}s -> {en:6.2f}s] ({dur:5.2f}s) | VI: {trans}")
