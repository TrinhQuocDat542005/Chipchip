import sqlite3
import json

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786732340533-part-01'")
data = json.loads(cur.fetchone()[0])
segments = data.get("segments", [])

print(f"=== CHI TIẾT TỪNG ĐOẠN 20 -> 37 CỦA dub-1786732340533-part-01 ===")
for i in range(19, len(segments)):
    s = segments[i]
    print(f"Segment {i+1:02d} | ID: {s.get('id')} | {s['start']:.2f}s -> {s['end']:.2f}s ({s['end']-s['start']:.2f}s):")
    print(f"  [GỐC]: {s.get('source_text')}")
    print(f"  [DỊCH]: {s.get('translated_text')}\n")
