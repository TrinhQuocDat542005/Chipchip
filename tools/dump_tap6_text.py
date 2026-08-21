import sqlite3
import json
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

print(f"Tổng số phân đoạn Tập 6: {len(segments)}")
for idx, seg in enumerate(segments, 1):
    dur = seg['end'] - seg['start']
    src = seg.get('source_text', '')
    trans = seg.get('translated_text', '')
    w_cnt = len(trans.split())
    target_w = int(dur * 2.85)
    print(f"--- Seg {idx:02d} [{seg['start']:.2f}s -> {seg['end']:.2f}s] (Slot: {dur:.2f}s) | Từ hiện tại: {w_cnt} | Mục tiêu: <= {target_w} từ ---")
    print(f"  ZH: {src}")
    print(f"  VI: {trans}\n")
