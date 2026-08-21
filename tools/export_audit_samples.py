import sqlite3
import json
import os
import subprocess

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
out_dir = "d:/AutoDub Sub/ai-video-factory/storage/audit-audio-samples"
os.makedirs(out_dir, exist_ok=True)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

def format_tc(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"

# 3 samples to extract:
samples_config = [
    {
        "name": "sample_1_fast_1.35x",
        "title": "Đoạn 1 — Tăng tốc tối đa (1.35x)",
        "pid": "dub-1786732340533-part-01",
        "seg_idx": 30, # 1-indexed
    },
    {
        "name": "sample_2_fast_1.20x",
        "title": "Đoạn 2 — Tăng tốc vừa (1.20x)",
        "pid": "dub-1786453409257",
        "seg_idx": 2,
    },
    {
        "name": "sample_3_slow_0.88x",
        "title": "Đoạn 3 — Giảm tốc tối đa (0.88x)",
        "pid": "dub-1786453409257",
        "seg_idx": 3,
    }
]

exported_results = []

for sc in samples_config:
    pid = sc["pid"]
    seg_idx = sc["seg_idx"]
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row:
        continue
    data = json.loads(row[0])
    segments = data.get("segments", [])
    if seg_idx > len(segments):
        continue
    seg = segments[seg_idx - 1]
    
    start = seg["start"]
    end = seg["end"]
    orig_dur = max(0.1, end - start)
    
    storage_folder = os.path.join("d:/AutoDub Sub/ai-video-factory/storage", pid)
    source_mp4 = os.path.join(storage_folder, "source.mp4")
    
    # Locate raw audio file
    raw_voice = os.path.join(storage_folder, "dub-work", f"preview-raw-{seg_idx:03d}.wav")
    if not os.path.exists(raw_voice):
        raw_voice = os.path.join(storage_folder, f"segment-{seg_idx:03d}-voice.wav")
    if not os.path.exists(raw_voice):
        raw_voice = os.path.join(storage_folder, f"segment-{seg_idx}-voice.wav")
        
    orig_wav_out = os.path.join(out_dir, f"{sc['name']}_original.wav")
    raw_wav_out = os.path.join(out_dir, f"{sc['name']}_raw_1.0x.wav")
    adjusted_wav_out = os.path.join(out_dir, f"{sc['name']}_adjusted.wav")
    
    # 1. Cut original audio
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start), "-to", str(end),
        "-i", source_mp4, "-q:a", "0", "-map", "a", orig_wav_out
    ], capture_output=True)
    
    # 2. Get raw audio duration
    ffprobe_res = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", raw_voice
    ], capture_output=True, text=True)
    raw_dur = float(ffprobe_res.stdout.strip()) if ffprobe_res.stdout.strip() else (seg.get("voice_duration") or orig_dur)
    
    # Copy raw voice
    import shutil
    if os.path.exists(raw_voice):
        shutil.copyfile(raw_voice, raw_wav_out)
        
    # 3. Apply exact dynamic atempo adjustment
    target_min = orig_dur * 0.92
    target_max = orig_dur * 1.05
    if raw_dur > target_max:
        speed = min(1.35, raw_dur / (orig_dur * 1.02))
    elif raw_dur < target_min:
        speed = max(0.88, raw_dur / (orig_dur * 0.96))
    else:
        speed = 1.0
        
    subprocess.run([
        "ffmpeg", "-y", "-i", raw_voice, "-filter:a", f"atempo={speed:.2f}", adjusted_wav_out
    ], capture_output=True)
    
    # Get adjusted duration
    ffprobe_res2 = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", adjusted_wav_out
    ], capture_output=True, text=True)
    adj_dur = float(ffprobe_res2.stdout.strip()) if ffprobe_res2.stdout.strip() else (raw_dur / speed)
    
    exported_results.append({
        "title": sc["title"],
        "project_id": pid,
        "segment_index": seg_idx,
        "start_sec": start,
        "end_sec": end,
        "timecode": f"{format_tc(start)} --> {format_tc(end)}",
        "orig_duration": orig_dur,
        "raw_duration": raw_dur,
        "adjusted_duration": adj_dur,
        "speed": round(speed, 2),
        "src_text": seg.get("source_text", ""),
        "vi_text": seg.get("translated_text", ""),
        "original_file": orig_wav_out,
        "adjusted_file": adjusted_wav_out,
        "raw_file": raw_wav_out
    })

print(json.dumps(exported_results, indent=2, ensure_ascii=False))
