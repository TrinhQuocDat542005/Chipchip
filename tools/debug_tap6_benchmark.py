import sys
sys.path.insert(0, 'D:/AutoDub Sub/ai-video-factory/tools')
from benchmark import evaluate_two_tier_segment, parse_srt_timestamps, detect_wav_silence_realtime
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
print("=== CHI TIẾT TỪNG PHÂN ĐOẠN DỰ ÁN TẬP 6 TRONG BENCHMARK ===")
print("================================================================================\n")

for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    voice_url = seg.get("voice_url")
    audio_file = None
    if voice_url:
        fn = os.path.basename(voice_url)
        p_cand = os.path.join(STORAGE_DIR, fn)
        if os.path.exists(p_cand):
            audio_file = p_cand
    if not audio_file:
        for pattern in [f"segment-seg-{idx}-voice.wav", f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(STORAGE_DIR, pattern)
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
            
    trans = seg.get("translated_text", "")
    res = evaluate_two_tier_segment(orig_dur, actual_dub_dur, trans, audio_file or "")
    
    status = "🟢 PASS" if res["passed"] else "🔴 FAIL"
    print(f"Seg {idx:02d} | Slot: {orig_dur:5.2f}s | Voice: {actual_dub_dur:5.2f}s | AudioFile: {os.path.basename(audio_file) if audio_file else 'None'} | {status} | Lý do: {res['reason']}")

# Subtitle check
srt_file = os.path.join(STORAGE_DIR, "dub-work", "translated.srt")
srt_cues = parse_srt_timestamps(srt_file)
print(f"\nSubtitle Cues count: {len(srt_cues)}")
for i in range(len(srt_cues) - 1):
    gap_ms = (srt_cues[i+1][0] - srt_cues[i][1]) * 1000.0
    if gap_ms < 80.0:
        print(f"  [GAP VIOLATION] Cue {i+1} ({srt_cues[i][1]:.3f}s) -> Cue {i+2} ({srt_cues[i+1][0]:.3f}s) | Gap: {gap_ms:.1f}ms (< 80ms)")
