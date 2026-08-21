import sqlite3
import json
import os
import wave
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

print("================================================================================")
print(f"=== ĐIỀU TRA CHI TIẾT 23 PHÂN ĐOẠN DỰ ÁN: {data.get('title', 'Thành phố Hư Hóa — Tập 6')} ===")
print("================================================================================\n")

overflow_segments = []
all_stats = []

for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    voice_url = seg.get("voice_url")
    db_voice_dur = seg.get("voice_duration")
    voice_speed = seg.get("voice_speed", 1.0)
    trans = seg.get("translated_text", "").strip()
    words = [w for w in trans.split() if w]
    word_count = len(words)
    wps = word_count / max(0.1, orig_dur)
    
    # Check physical audio file on disk
    audio_file = None
    if voice_url:
        fn = os.path.basename(voice_url)
        p_cand = os.path.join(STORAGE_DIR, fn)
        if os.path.exists(p_cand):
            audio_file = p_cand
    if not audio_file:
        for ptn in [f"segment-seg-{idx}-voice.wav", f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(STORAGE_DIR, ptn)
            if os.path.exists(p_cand):
                audio_file = p_cand
                break
                
    disk_dur = None
    if audio_file and os.path.exists(audio_file):
        try:
            with wave.open(audio_file, 'rb') as wf:
                disk_dur = wf.getnframes() / max(1, wf.getframerate())
        except Exception:
            disk_dur = None
            
    actual_dub_dur = disk_dur if disk_dur is not None else (db_voice_dur or orig_dur)
    
    # Overflow definition: actual_dub_dur > orig_dur * 1.05 (hoặc > orig_dur)
    is_overflow = actual_dub_dur > (orig_dur + 0.05)
    overflow_sec = max(0.0, actual_dub_dur - orig_dur)
    overflow_pct = (actual_dub_dur - orig_dur) / orig_dur * 100.0 if orig_dur > 0 else 0.0
    
    stat = {
        "idx": idx,
        "id": seg.get("id"),
        "start": round(seg["start"], 2),
        "end": round(seg["end"], 2),
        "orig_dur": round(orig_dur, 2),
        "db_voice_dur": round(db_voice_dur, 2) if db_voice_dur else None,
        "disk_dur": round(disk_dur, 2) if disk_dur else None,
        "actual_dub_dur": round(actual_dub_dur, 2),
        "voice_speed": voice_speed,
        "word_count": word_count,
        "wps": round(wps, 2),
        "is_overflow": is_overflow,
        "overflow_sec": round(overflow_sec, 2),
        "overflow_pct": round(overflow_pct, 2),
        "trans": trans,
        "audio_file": os.path.basename(audio_file) if audio_file else None
    }
    all_stats.append(stat)
    if is_overflow:
        overflow_segments.append(stat)

print(f"Tổng số phân đoạn: {len(segments)}")
print(f"Số phân đoạn BỊ TRÀN THỜI GIAN (Đỏ): {len(overflow_segments)} / {len(segments)} ({len(overflow_segments)/len(segments)*100:.1f}%)\n")

print(f"{'STT':<4} | {'Thời gian':<16} | {'Slot(s)':<7} | {'Audio(s)':<8} | {'Tràn (s)':<8} | {'Tràn (%)':<8} | {'Speed':<6} | {'Từ/s':<6} | {'Bản dịch':<35}")
print("-" * 115)
for s in overflow_segments:
    time_str = f"[{s['start']:5.2f}s -> {s['end']:5.2f}s]"
    print(f"{s['idx']:<4} | {time_str:<16} | {s['orig_dur']:<7.2f} | {s['actual_dub_dur']:<8.2f} | {s['overflow_sec']:<8.2f} | {s['overflow_pct']:<7.1f}% | {s['voice_speed']:<6.2f} | {s['wps']:<6.2f} | {s['trans'][:35]}")

with open("D:/AutoDub Sub/ai-video-factory/tools/investigate_tap6_overflow.json", "w", encoding="utf-8") as f:
    json.dump(all_stats, f, indent=2, ensure_ascii=False)
