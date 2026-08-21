import sqlite3
import json
import os
import sys

sys.path.insert(0, "D:/AutoDub Sub/ai-video-factory/tools")
from benchmark import evaluate_two_tier_segment, BENCHMARK_PROJECTS, DB_PATH, STORAGE_DIR

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

fail_reasons = {}

for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    segments = data.get("segments", [])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        audio_file = None
        for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(storage_folder, pattern)
            if os.path.exists(p_cand):
                audio_file = p_cand
                break
        actual_dub_dur = seg.get("voice_duration") or orig_dur
        trans_text = seg.get("translated_text", "")
        
        res = evaluate_two_tier_segment(orig_dur, actual_dub_dur, trans_text, audio_file)
        if not res["passed"]:
            r = res["reason"]
            cat = r.split("(")[0].strip()
            fail_reasons[cat] = fail_reasons.get(cat, 0) + 1
            if fail_reasons[cat] <= 2:
                print(f"[{pid}] Đoạn {idx:02d} | Gốc: {orig_dur:.2f}s, Dub: {actual_dub_dur:.2f}s | Reason: {res['reason']}")
                print(f"   Text: '{trans_text}'\n")

print("\n--- TỔNG KẾT NGUYÊN NHÂN FAIL CỦA 251 ĐOẠN ---")
for k, v in fail_reasons.items():
    print(f"  - {k}: {v} đoạn ({v/251*100:.1f}%)")
