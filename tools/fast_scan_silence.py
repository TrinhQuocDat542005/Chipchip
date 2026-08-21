import sqlite3
import json
import os
import wave
import struct
import math

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
storage_dir = "d:/AutoDub Sub/ai-video-factory/storage"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()

def analyze_wav_silence(filepath, threshold_db=-38.0, min_silence_sec=1.5):
    """Phân tích khoảng im lặng trong file WAV bằng Python thuần siêu nhanh."""
    try:
        with wave.open(filepath, 'rb') as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            
            if n_frames == 0 or framerate == 0:
                return None
                
            total_dur = n_frames / framerate
            # Read in chunks of 0.1 sec
            chunk_frames = int(framerate * 0.1)
            thresh_amplitude = 32768.0 * (10 ** (threshold_db / 20.0))
            
            silence_spans = []
            cur_silence_start = None
            
            for frame_idx in range(0, n_frames, chunk_frames):
                cur_chunk_len = min(chunk_frames, n_frames - frame_idx)
                raw_bytes = wf.readframes(cur_chunk_len)
                
                # Unpack 16-bit PCM
                if sampwidth == 2:
                    fmt = f"<{cur_chunk_len * n_channels}h"
                    samples = struct.unpack(fmt, raw_bytes)
                    max_amp = max(abs(s) for s in samples) if samples else 0
                else:
                    max_amp = 32768
                    
                t = frame_idx / framerate
                is_silent = (max_amp < thresh_amplitude)
                
                if is_silent:
                    if cur_silence_start is None:
                        cur_silence_start = t
                else:
                    if cur_silence_start is not None:
                        dur = t - cur_silence_start
                        if dur >= min_silence_sec:
                            silence_spans.append((cur_silence_start, t, dur))
                        cur_silence_start = None
                        
            if cur_silence_start is not None:
                dur = total_dur - cur_silence_start
                if dur >= min_silence_sec:
                    silence_spans.append((cur_silence_start, total_dur, dur))
                    
            max_silence = max((s[2] for s in silence_spans), default=0.0)
            trailing_silence = 0.0
            if silence_spans and abs(silence_spans[-1][1] - total_dur) < 0.2:
                trailing_silence = silence_spans[-1][2]
                
            return {
                "total_dur": round(total_dur, 2),
                "silence_spans": silence_spans,
                "max_silence": round(max_silence, 2),
                "trailing_silence": round(trailing_silence, 2),
                "has_silence": len(silence_spans) > 0
            }
    except Exception as e:
        return None

print("================================================================================")
print("=== QUÉT SILENCE RÁC TOÀN BỘ FILE AUDIO WAV BẰNG PYTHON THUẦN ===")
print("================================================================================\n")

total_scanned = 0
total_silence = 0
silence_items = []
project_summary = {}

for r in rows:
    pid = r[0]
    data_str = r[1]
    if not data_str:
        continue
    data = json.loads(data_str)
    segments = data.get("segments", [])
    storage_folder = os.path.join(storage_dir, pid)
    
    p_scanned = 0
    p_silence = 0
    p_max_sil = 0.0
    
    for idx, seg in enumerate(segments, 1):
        voice_url = seg.get("voice_url")
        audio_file = None
        if voice_url:
            fn = os.path.basename(voice_url)
            possible = os.path.join(storage_folder, fn)
            if os.path.exists(possible):
                audio_file = possible
        if not audio_file:
            for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav", f"dub-work/preview-raw-{idx:03d}.wav"]:
                p = os.path.join(storage_folder, pattern)
                if os.path.exists(p):
                    audio_file = p
                    break
                    
        if audio_file and os.path.exists(audio_file):
            res = analyze_wav_silence(audio_file)
            if res:
                total_scanned += 1
                p_scanned += 1
                if res["has_silence"]:
                    total_silence += 1
                    p_silence += 1
                    if res["max_silence"] > p_max_sil:
                        p_max_sil = res["max_silence"]
                    silence_items.append({
                        "pid": pid,
                        "seg_idx": idx,
                        "file": os.path.basename(audio_file),
                        "total_dur": res["total_dur"],
                        "max_silence": res["max_silence"],
                        "trailing_silence": res["trailing_silence"],
                        "words": len(seg.get("translated_text", "").split()),
                        "text": seg.get("translated_text", "")[:45]
                    })
                    
    if p_scanned > 0:
        project_summary[pid] = {
            "scanned": p_scanned,
            "silence": p_silence,
            "pct": round(p_silence / p_scanned * 100, 1),
            "max_sil": round(p_max_sil, 2)
        }
        print(f"📊 Dự án {pid:28s} | Scanned: {p_scanned:3d} | Dính silence >1.5s: {p_silence:2d} ({project_summary[pid]['pct']:5.1f}%) | Max: {p_max_sil:.2f}s")

print("\n================================================================================")
print(f"=== TỔNG KẾT TOÀN HỆ THỐNG ===")
print("================================================================================")
print(f"Tổng số file WAV đã quét: {total_scanned}")
print(f"Số file dính silence rác (>1.5s): {total_silence} / {total_scanned} ({total_silence/max(1, total_scanned)*100:.2f}%)")

print("\n--- TOP 10 FILE DÍNH SILENCE LỚN NHẤT ---")
silence_items.sort(key=lambda x: x["max_silence"], reverse=True)
for s in silence_items[:10]:
    print(f"[{s['pid']}] Đoạn {s['seg_idx']:02d} ({s['file']}) | Dài: {s['total_dur']}s | Silence rác: {s['max_silence']}s (Đuôi: {s['trailing_silence']}s)")
    print(f"   Văn bản ({s['words']} từ): {s['text']}...\n")
