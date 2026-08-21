import sqlite3
import json

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute('SELECT id, data FROM dubbing_projects')
rows = cur.fetchall()
for pid, data_str in rows:
    d = json.loads(data_str)
    segs = d.get('segments', [])
    print(f"Project ID: {pid:30s} | Segments: {len(segs):4d} | Name: {d.get('name')}")
