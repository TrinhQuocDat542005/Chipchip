import sqlite3
import json
import os
import wave
import subprocess

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"

# All active dubbing projects
PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
    "dub-1786732340533-part-04",
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

all_segments = []

for pid in PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row or not row[0]:
        continue
    data = json.loads(row[0])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    
    for idx, seg in enumerate(data.get("segments", []), 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        audio_file = None
        for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(storage_folder, pattern)
            if os.path.exists(p_cand):
                audio_file = p_cand
                break
        
        actual_dur = orig_dur
        if audio_file and os.path.exists(audio_file):
            try:
                with wave.open(audio_file, 'rb') as wf:
                    actual_dur = wf.getnframes() / max(1, wf.getframerate())
            except Exception:
                actual_dur = seg.get("voice_duration") or orig_dur
        
        trans_text = seg.get("translated_text", "")
        words = [w for w in trans_text.split() if w]
        w_count = len(words)
        
        # Estimate natural duration if spoken at comfortable rate (3.0 words/s)
        natural_dur = w_count / 3.0 if w_count > 0 else orig_dur
        
        # Speed factor applied = natural_dur / actual_dur
        applied_speed = seg.get("voice_speed") or (natural_dur / actual_dur if actual_dur > 0 and w_count > 0 else 1.0)
        
        actual_wps = round(w_count / max(0.1, actual_dur), 2)
        
        all_segments.append({
            "pid": pid,
            "idx": idx,
            "orig_dur": round(orig_dur, 2),
            "actual_dur": round(actual_dur, 2),
            "words": w_count,
            "text": trans_text,
            "speed": round(applied_speed, 2),
            "wps": actual_wps,
            "audio_file": audio_file
        })

print(f"Tổng số phân đoạn quét được: {len(all_segments)}")

# Thống kê phân bố theo tốc độ
b_normal = [s for s in all_segments if s['speed'] <= 1.15]
b_115_130 = [s for s in all_segments if 1.15 < s['speed'] <= 1.30]
b_130_140 = [s for s in all_segments if 1.30 < s['speed'] <= 1.40]
b_gt_140 = [s for s in all_segments if s['speed'] > 1.40]

print("\n--- THỐNG KÊ TỐC ĐỘ VOICE THEO YÊU CẦU ---")
print(f"1. Tốc độ bình thường / tự nhiên (<= 1.15x): {len(b_normal)} đoạn ({len(b_normal)/len(all_segments)*100:.1f}%)")
print(f"2. Tốc độ nhanh rõ rệt (1.16x - 1.30x):      {len(b_115_130)} đoạn ({len(b_115_130)/len(all_segments)*100:.1f}%)")
print(f"3. Tốc độ rất nhanh (1.31x - 1.40x):         {len(b_130_140)} đoạn ({len(b_130_140)/len(all_segments)*100:.1f}%)")
print(f"4. Tốc độ gần trần / ép tối đa (> 1.40x):    {len(b_gt_140)} đoạn ({len(b_gt_140)/len(all_segments)*100:.1f}%)")

gt_115_all = len(b_115_130) + len(b_130_140) + len(b_gt_140)
gt_130_all = len(b_130_140) + len(b_gt_140)

print(f"\n>>> TỔNG HỢP CÁC MỐC:")
print(f" • Tốc độ > 1.15x: {gt_115_all} / {len(all_segments)} ({gt_115_all/len(all_segments)*100:.1f}%)")
print(f" • Tốc độ > 1.30x: {gt_130_all} / {len(all_segments)} ({gt_130_all/len(all_segments)*100:.1f}%)")
print(f" • Tốc độ > 1.40x: {len(b_gt_140)} / {len(all_segments)} ({len(b_gt_140)/len(all_segments)*100:.1f}%)")

# Extract 4 sample audio files with speed > 1.3x for user listening
samples_dir = "D:/AutoDub Sub/ai-video-factory/sample_fast_audios"
os.makedirs(samples_dir, exist_ok=True)

very_fast = sorted([s for s in all_segments if s['speed'] >= 1.30 and s['audio_file']], key=lambda x: x['speed'], reverse=True)

print(f"\n--- TRÍCH XUẤT CÁC MẪU AUDIO TỐC ĐỘ CAO (> 1.3x) VÀO {samples_dir} ---")
sample_files = []
for i, s in enumerate(very_fast[:5], 1):
    out_name = f"sample_{i:02d}_{s['pid']}_seg{s['idx']:02d}_speed{s['speed']}x.wav"
    out_path = os.path.join(samples_dir, out_name)
    import shutil
    shutil.copyfile(s['audio_file'], out_path)
    sample_files.append((out_path, s))
    print(f"\nMẫu {i}: [{s['pid']} - Đoạn {s['idx']:02d}]")
    print(f" • File: {out_name}")
    print(f" • Tốc độ: {s['speed']}x | WPS: {s['wps']} từ/s | Thời lượng audio: {s['actual_dur']}s (Cảnh: {s['orig_dur']}s | {s['words']} từ)")
    print(f" • Văn bản: \"{s['text']}\"")
