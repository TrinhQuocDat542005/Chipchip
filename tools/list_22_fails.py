import sqlite3
import json
import os
import wave
import sys

sys.path.insert(0, "D:/AutoDub Sub/ai-video-factory/tools")
from benchmark import evaluate_two_tier_segment, BENCHMARK_PROJECTS, DB_PATH, STORAGE_DIR

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

fails = []

for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    
    for idx, seg in enumerate(data.get("segments", []), 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        audio_file = None
        for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(storage_folder, pattern)
            if os.path.exists(p_cand):
                audio_file = p_cand
                break
        actual_dub_dur = orig_dur
        if audio_file and os.path.exists(audio_file):
            try:
                with wave.open(audio_file, 'rb') as wf:
                    actual_dub_dur = wf.getnframes() / max(1, wf.getframerate())
            except Exception:
                actual_dub_dur = seg.get("voice_duration") or orig_dur
        else:
            actual_dub_dur = seg.get("voice_duration") or orig_dur
            
        trans_text = seg.get("translated_text", "")
        res = evaluate_two_tier_segment(orig_dur, actual_dub_dur, trans_text, audio_file)
        if not res["passed"]:
            fails.append({
                "pid": pid,
                "idx": idx,
                "orig_dur": round(orig_dur, 3),
                "dub_dur": round(actual_dub_dur, 3),
                "words": len(trans_text.split()),
                "wps": res["wps"],
                "reason": res["reason"],
                "src": seg.get("source_text", ""),
                "trans": trans_text,
                "audio_file": audio_file
            })

print(f"Tổng số đoạn fail thật còn lại: {len(fails)}\n")
for idx, f in enumerate(fails, 1):
    print(f"[{idx:02d}] {f['pid']} Đoạn {f['idx']:02d} ({f['orig_dur']}s, Dub {f['dub_dur']}s | {f['words']} từ, WPS {f['wps']}) | Lý do: {f['reason']}")
    print(f"     Gốc: {f['src']}")
    print(f"     Dịch: {f['trans']}\n")
