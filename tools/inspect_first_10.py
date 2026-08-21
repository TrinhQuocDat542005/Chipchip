import sqlite3
import json
import re

conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

for i, s in enumerate(current_49[:10], 1):
    txt = s.get('translated_text', '')
    no_space_len = len(re.sub(r'\s+', '', txt))
    print(f"Seg {i:02d} ({no_space_len} chars): {txt}")
