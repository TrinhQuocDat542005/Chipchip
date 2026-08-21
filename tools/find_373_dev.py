import sqlite3
import json
import os
import wave
import sys

sys.path.insert(0, "D:/AutoDub Sub/ai-video-factory/tools")
from benchmark import BENCHMARK_PROJECTS, DB_PATH, STORAGE_DIR

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

found_target = []

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
            
        dev = abs(actual_dub_dur - orig_dur) / orig_dur * 100
        if dev > 300.0:
            found_target.append({
                "pid": pid,
                "idx": idx,
                "orig_dur": orig_dur,
                "dub_dur": actual_dub_dur,
                "db_voice_dur": seg.get("voice_duration"),
                "audio_file": audio_file,
                "dev_pct": round(dev, 2),
                "src": seg.get("source_text", ""),
                "trans": seg.get("translated_text", "")
            })

print(json.dumps(found_target, indent=2, ensure_ascii=False))
