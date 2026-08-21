import os
import shutil
import sqlite3
import json
import wave

STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
OUT_DIR = "D:/AutoDub Sub/ai-video-factory/sample_final_5_across_projects"
os.makedirs(OUT_DIR, exist_ok=True)

samples = [
    {"pid": "dub-1786897570201", "idx": 54, "label": "sample_01_dub-1786897570201_seg54.wav"},
    {"pid": "dub-1786897570201", "idx": 76, "label": "sample_02_dub-1786897570201_seg76.wav"},
    {"pid": "dub-1786899653642", "idx": 38, "label": "sample_03_dub-1786899653642_seg38.wav"},
    {"pid": "dub-1786899653642", "idx": 44, "label": "sample_04_dub-1786899653642_seg44.wav"},
    {"pid": "dub-1786732340533-part-01", "idx": 15, "label": "sample_05_dub-1786732340533-p1_seg15.wav"}
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

results = []

for s in samples:
    pid = s["pid"]
    idx = s["idx"]
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    d = json.loads(cur.fetchone()[0])
    seg = d["segments"][idx - 1]
    
    storage_folder = os.path.join(STORAGE_DIR, pid)
    src_file = None
    for pat in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"segment-seg-{idx}-voice.wav"]:
        cand = os.path.join(storage_folder, pat)
        if os.path.exists(cand):
            src_file = cand
            break
            
    dst_file = os.path.join(OUT_DIR, s["label"])
    if src_file and os.path.exists(src_file):
        shutil.copy2(src_file, dst_file)
        with wave.open(dst_file, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
    else:
        dur = seg.get("voice_duration", 0)
        
    orig_dur = max(0.1, seg["end"] - seg["start"])
    text = seg.get("translated_text", "")
    words = len(text.split())
    speed = seg.get("voice_speed", 1.0)
    
    results.append({
        "pid": pid,
        "idx": idx,
        "orig_dur": round(orig_dur, 2),
        "dur": round(dur, 2),
        "words": words,
        "speed": speed,
        "text": text,
        "file": dst_file
    })

print(f"=== ĐÃ TRÍCH XUẤT XONG 5 MẪU AUDIO ĐA DỰ ÁN VÀO: {OUT_DIR} ===\n")
for r in results:
    print(f"• [{r['pid']}] Đoạn {r['idx']:02d} (Cảnh: {r['orig_dur']}s | Audio: {r['dur']}s | Speed: {r['speed']}x | {r['words']} âm tiết):")
    print(f"   Văn bản: \"{r['text']}\"")
    print(f"   File: {os.path.basename(r['file'])}\n")
