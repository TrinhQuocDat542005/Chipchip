import sqlite3
import json

conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

for idx, seg in enumerate(segments, 1):
    w = seg.get('translated_text', '').split()
    print(f"Seg {idx:02d} ({len(w)} words): {seg.get('translated_text', '')[:60]}")
