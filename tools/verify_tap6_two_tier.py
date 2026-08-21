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
print("=== KIỂM CHỨNG TOÀN DIỆN TWO-TIER VALIDATOR CHO TẬP 6 (23 ĐOẠN) ===")
print("================================================================================\n")

passed = 0
failed = 0
details = []

for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    audio_file = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    
    with wave.open(audio_file, 'rb') as wf:
        actual_dub_dur = wf.getnframes() / wf.getframerate()
        
    trans = seg.get("translated_text", "")
    res = evaluate_two_tier_segment(orig_dur, actual_dub_dur, trans, audio_file)
    
    is_overflow = actual_dub_dur > (orig_dur + 0.05)
    overflow_sec = max(0.0, actual_dub_dur - orig_dur)
    
    if res["passed"] and not is_overflow:
        passed += 1
        status = "🟢 SẴN SÀNG (PASS)"
    else:
        failed += 1
        status = f"🔴 TRÀN ({overflow_sec:.2f}s)"
        
    print(f"Seg {idx:02d} | Slot: {orig_dur:5.2f}s | Voice: {actual_dub_dur:5.2f}s | Speed: {seg.get('voice_speed', 1.0):4.2f}x | {status} | Lý do: {res['reason']}")

print(f"\n================================================================================")
print(f"KẾT QUẢ: {passed} / {len(segments)} ĐOẠN ĐẠT ({passed/len(segments)*100:.1f}%) | THẤT BẠI: {failed}")
print("================================================================================")

# Subtitle check
srt_path = os.path.join(STORAGE_DIR, "dub-work", "translated.srt")
cues = parse_srt_timestamps(srt_path)
max_cps = 0.0
min_gap = 9999.0
for st, en, txt in cues:
    dur = max(0.1, en - st)
    chars = len(re.sub(r'\s+', '', txt))
    cps = chars / dur
    if cps > max_cps: max_cps = cps
for i in range(len(cues) - 1):
    gap_ms = (cues[i+1][0] - cues[i][1]) * 1000.0
    if gap_ms < min_gap: min_gap = gap_ms

print(f"Subtitle: {len(cues)} cues | Max CPS: {max_cps:.2f} (<= 20) | Min Gap: {min_gap:.1f}ms (>= 80ms)")
