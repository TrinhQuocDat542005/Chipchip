import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Inspect dub-1786732340533-part-01 around segment 30
cur.execute("SELECT id, data FROM dubbing_projects WHERE id = 'dub-1786732340533-part-01'")
row = cur.fetchone()
if row:
    pid, data_str = row
    data = json.loads(data_str)
    segments = data.get("segments", [])
    print("================================================================================")
    print(f"=== ĐIỀU TRA CHI TIẾT CÁC ĐOẠN 25 -> 35 CỦA {pid} ===")
    print("================================================================================")
    for idx in range(24, min(len(segments), 35)):
        seg = segments[idx]
        orig_dur = seg["end"] - seg["start"]
        src = seg.get("source_text", "").strip()
        trans = seg.get("translated_text", "").strip()
        ratio = len(trans.split()) / max(1, len(src))
        print(f"Index {idx+1:02d} (ID: {seg.get('id')}) | {seg['start']:.2f}s -> {seg['end']:.2f}s ({orig_dur:.2f}s) | Ratio: {ratio:.2f} w/ch")
        print(f"   [GỐC] : {src}")
        print(f"   [DỊCH]: {trans}\n")

# 2. Also check parent project dub-1786732340533
cur.execute("SELECT id, data FROM dubbing_projects WHERE id = 'dub-1786732340533'")
row_parent = cur.fetchone()
if row_parent:
    pid, data_str = row_parent
    data = json.loads(data_str)
    segments = data.get("segments", [])
    print("================================================================================")
    print(f"=== ĐIỀU TRA PROJECT GỐC {pid} (TỔNG {len(segments)} ĐOẠN) ===")
    print("================================================================================")
    for idx, seg in enumerate(segments[:35], 1):
        if "体力" in seg.get("source_text", "") or "Vẫn chưa ngủ à" in seg.get("translated_text", "") or idx in range(28, 35):
            orig_dur = seg["end"] - seg["start"]
            src = seg.get("source_text", "").strip()
            trans = seg.get("translated_text", "").strip()
            ratio = len(trans.split()) / max(1, len(src))
            print(f"Parent Seg {idx:03d} (ID: {seg.get('id')}) | {seg['start']:.2f}s -> {seg['end']:.2f}s ({orig_dur:.2f}s) | Ratio: {ratio:.2f}")
            print(f"   [GỐC] : {src}")
            print(f"   [DỊCH]: {trans}\n")
