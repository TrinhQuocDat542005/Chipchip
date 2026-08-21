import sqlite3
import json

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
segs = data.get('segments', [])

mapping_table = []

for idx, s in enumerate(segs, 1):
    st = s['start']
    en = s['end']
    dur = round(en - st, 2)
    src = s.get('source_text', '').strip()
    trans = s.get('translated_text', '').strip()
    
    mapping_table.append({
        "new_idx": idx,
        "time_range": f"{st:6.2f}s -> {en:6.2f}s",
        "dur": f"{dur:4.2f}s",
        "source_zh": src,
        "translated_vi": trans
    })

print(f"Total mapped: {len(mapping_table)}")
with open("D:/AutoDub Sub/ai-video-factory/tools/full_mapping_49.json", "w", encoding="utf-8") as out:
    json.dump(mapping_table, out, indent=2, ensure_ascii=False)
print("Saved full_mapping_49.json!")
