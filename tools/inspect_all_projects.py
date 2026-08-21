import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()
print(f"Tổng số dự án trong DB: {len(rows)}")

for r in rows:
    pid = r[0]
    data = json.loads(r[1])
    name = data.get("name", "No name")
    segs = data.get("segments", [])
    media_url = data.get("media_url", "")
    print(f"\n- Project ID: {pid}")
    print(f"  Name: {name}")
    print(f"  Media URL: {media_url}")
    print(f"  Số đoạn: {len(segs)}")

# Also check storage directory
storage_dir = "d:/AutoDub Sub/ai-video-factory/storage"
if os.path.exists(storage_dir):
    print(f"\n--- Thư mục storage ({storage_dir}) ---")
    for item in os.listdir(storage_dir):
        item_path = os.path.join(storage_dir, item)
        if os.path.isdir(item_path):
            files = os.listdir(item_path)
            print(f"Folder: {item} ({len(files)} files/folders) -> {files[:5]}")
