import sqlite3
import json
import os

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786899653642'")
data = json.loads(cur.fetchone()[0])
segments = data.get("segments", [])

print("================================================================================")
print("=== KIỂM TRA CHUỖI PHÂN ĐOẠN 38 -> 46 CỦA DỰ ÁN dub-1786899653642 ===")
print("================================================================================\n")

for idx in range(38, min(len(segments)+1, 47)):
    seg = segments[idx-1]
    orig_dur = round(seg["end"] - seg["start"], 3)
    voice_dur = seg.get("voice_duration")
    print(f"--- Đoạn {idx:02d} (ID: {seg.get('id')}) | {seg['start']:.3f}s -> {seg['end']:.3f}s ({orig_dur}s) | Voice Dur: {voice_dur}s ---")
    print(f"  [GỐC]: {seg.get('source_text')}")
    print(f"  [DỊCH]: {seg.get('translated_text')}\n")
