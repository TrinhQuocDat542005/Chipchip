import sqlite3
import json

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
segs = data.get('segments', [])

for idx in range(40, len(segs)):
    s = segs[idx]
    print(f"Seg {idx+1} ({s['start']:.2f}s -> {s['end']:.2f}s, {s['end']-s['start']:.2f}s):")
    print(f"  src:   {s.get('source_text')}")
    print(f"  trans: {s.get('translated_text')}")
    print()
