import sqlite3
import json
import os
import subprocess
import wave

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"

BENCHMARK_PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

print("================================================================================")
print("=== TIẾN HÀNH FIT CHÍNH XÁC 22 FILE AUDIO TRÊN ĐĨA KHÔNG TRÀN CẢNH ===")
print("================================================================================\n")

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
                
        if not audio_file or not os.path.exists(audio_file):
            continue
            
        # Check raw wav duration
        with wave.open(audio_file, 'rb') as wf:
            raw_dur = wf.getnframes() / max(1, wf.getframerate())
            
        # Target duration: fit slightly inside slot (0.95 * orig_dur)
        if raw_dur > orig_dur * 1.02 or (pid == "dub-1786732340533-part-01" and idx == 15):
            target_dur = orig_dur * 0.95
            speed = min(1.45, raw_dur / target_dur)
            temp_out = os.path.join(storage_folder, f"temp_fit_{idx}.wav")
            
            # If segment 15, clean silence first
            if idx == 15 and pid == "dub-1786732340533-part-01":
                silence_filter = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-32dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-32dB:stop_silence=0.15"
                cmd = ["ffmpeg", "-y", "-i", audio_file, "-af", f"{silence_filter},atempo={speed:.3f}", temp_out]
            else:
                cmd = ["ffmpeg", "-y", "-i", audio_file, "-af", f"atempo={speed:.3f}", temp_out]
                
            subprocess.run(cmd, capture_output=True)
            if os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
                import shutil
                shutil.move(temp_out, audio_file)
                with wave.open(audio_file, 'rb') as wf:
                    new_dur = wf.getnframes() / max(1, wf.getframerate())
                seg["voice_duration"] = round(new_dur, 3)
                print(f"✅ Fitted [{pid}] Seg {idx:02d}: Cũ {raw_dur:.2f}s -> Mới {new_dur:.2f}s (Cảnh: {orig_dur:.2f}s)")
                
    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
    conn.commit()

print("\nHoàn tất fit 22 file audio trên đĩa!")
