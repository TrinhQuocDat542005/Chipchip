import sqlite3
import json
import os
import subprocess
import re

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
storage_dir = "d:/AutoDub Sub/ai-video-factory/storage"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()

print("================================================================================")
print("=== QUÉT SILENCE RÁC (>1.5S) TRÊN TOÀN BỘ FILE AUDIO CỦA HỆ THỐNG ===")
print("================================================================================\n")

total_scanned_files = 0
silence_detected_files = []
project_stats = {}

def check_silence_ffmpeg(audio_path, min_silence_sec=1.5, noise_thresh_db="-38dB"):
    """Dùng ffmpeg silencedetect để phát hiện khoảng im lặng > min_silence_sec."""
    cmd = [
        "ffmpeg", "-i", audio_path,
        "-af", f"silencedetect=noise={noise_thresh_db}:d={min_silence_sec}",
        "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    output = res.stderr
    
    silence_starts = [float(m) for m in re.findall(r"silence_start:\s*([\d\.]+)", output)]
    silence_ends = [float(m) for m in re.findall(r"silence_end:\s*([\d\.]+)", output)]
    silence_durs = [float(m) for m in re.findall(r"silence_duration:\s*([\d\.]+)", output)]
    
    # Check total audio duration
    dur_match = re.search(r"Duration:\s*(\d{2}):(\d{2}):([\d\.]+)", output)
    total_dur = 0.0
    if dur_match:
        h, m, s = dur_match.groups()
        total_dur = int(h) * 3600 + int(m) * 60 + float(s)
        
    has_trailing_silence = False
    max_silence_dur = max(silence_durs) if silence_durs else 0.0
    
    # Trailing silence check: silence started within last 2s of file
    if silence_starts and total_dur > 0:
        last_start = silence_starts[-1]
        if total_dur - last_start >= min_silence_sec:
            has_trailing_silence = True
            
    return {
        "has_silence": len(silence_starts) > 0,
        "max_silence_dur": max_silence_dur,
        "silence_count": len(silence_starts),
        "has_trailing_silence": has_trailing_silence,
        "total_dur": total_dur,
        "silence_durs": silence_durs
    }

for r in rows:
    pid = r[0]
    data_str = r[1]
    if not data_str:
        continue
    data = json.loads(data_str)
    segments = data.get("segments", [])
    storage_folder = os.path.join(storage_dir, pid)
    
    p_scanned = 0
    p_silence_count = 0
    p_max_silence = 0.0
    
    for idx, seg in enumerate(segments, 1):
        voice_url = seg.get("voice_url")
        audio_file = None
        if voice_url:
            fn = os.path.basename(voice_url)
            possible = os.path.join(storage_folder, fn)
            if os.path.exists(possible):
                audio_file = possible
        if not audio_file:
            # check preview or segment files
            for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav", f"dub-work/preview-raw-{idx:03d}.wav"]:
                p = os.path.join(storage_folder, pattern)
                if os.path.exists(p):
                    audio_file = p
                    break
                    
        if audio_file and os.path.exists(audio_file):
            total_scanned_files += 1
            p_scanned += 1
            
            silence_info = check_silence_ffmpeg(audio_file)
            if silence_info["has_silence"]:
                p_silence_count += 1
                if silence_info["max_silence_dur"] > p_max_silence:
                    p_max_silence = silence_info["max_silence_dur"]
                    
                silence_detected_files.append({
                    "pid": pid,
                    "seg_idx": idx,
                    "id": seg.get("id"),
                    "file": os.path.relpath(audio_file, storage_dir),
                    "total_dur": round(silence_info["total_dur"], 2),
                    "max_silence_dur": round(silence_info["max_silence_dur"], 2),
                    "silence_durs": [round(d, 2) for d in silence_info["silence_durs"]],
                    "trailing": silence_info["has_trailing_silence"],
                    "text_vi": seg.get("translated_text", "")[:50],
                    "word_count": len(seg.get("translated_text", "").split())
                })
                
    if p_scanned > 0:
        project_stats[pid] = {
            "scanned": p_scanned,
            "silence_count": p_silence_count,
            "silence_pct": round(p_silence_count / p_scanned * 100, 1),
            "max_silence": round(p_max_silence, 2)
        }
        print(f"📊 Dự án {pid:28s} | Đã quét: {p_scanned:3d} file | Dính silence rác: {p_silence_count:2d} file ({project_stats[pid]['silence_pct']:5.1f}%) | Max silence: {p_max_silence:.2f}s")

print("\n================================================================================")
print(f"=== TỔNG KẾT TOÀN HỆ THỐNG ===")
print("================================================================================")
print(f"Tổng số file audio đã quét: {total_scanned_files}")
print(f"Số file dính silence rác (>1.5s): {len(silence_detected_files)} ({len(silence_detected_files)/max(1,total_scanned_files)*100:.2f}%)")

print("\n--- MẪU 10 FILE DÍNH SILENCE RÁC LỚN NHẤT ---")
silence_detected_files.sort(key=lambda x: x["max_silence_dur"], reverse=True)
for s in silence_detected_files[:10]:
    print(f"[{s['pid']}] Đoạn {s['seg_idx']:02d} ({s['file']}) | Tổng dài: {s['total_dur']}s | Silence rác: {s['max_silence_dur']}s | Trailing: {s['trailing']}")
    print(f"   Văn bản ({s['word_count']} từ): {s['text_vi']}...\n")
