import sqlite3
import json
import os
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

total_segments = 0
speed_buckets = {
    "<= 1.00x (Bình thường / Giãn nhẹ)": 0,
    "1.01x - 1.15x (Hơi nhanh nhẹ - Tự nhiên)": 0,
    "1.16x - 1.30x (Nhanh rõ rệt)": 0,
    "1.31x - 1.40x (Rất nhanh - Dễ mất tự nhiên)": 0,
    "> 1.40x (Gần trần 1.45x / Ép tốc độ cao)": 0
}

wps_buckets = {
    "< 2.8 wps (Chậm / Rất tự nhiên)": 0,
    "2.8 - 3.4 wps (Vùng chuẩn tự nhiên)": 0,
    "3.5 - 4.0 wps (Nhanh)": 0,
    "> 4.0 wps (Rất nhanh / Dễ nuốt chữ)": 0
}

high_speed_segments = []
all_data = []

for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    
    for idx, seg in enumerate(data.get("segments", []), 1):
        total_segments += 1
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
        
        # Calculate natural uncompressed duration at standard speaking rate (3.0 wps)
        estimated_raw_tts_dur = w_count / 3.0
        
        # voice_speed recorded in DB or calculated from duration ratio
        speed_db = seg.get("voice_speed") or 1.0
        
        # Effective speaking rate (WPS on actual audio duration)
        actual_wps = round(w_count / max(0.1, actual_dur), 2)
        
        # Categorize speed_db
        if speed_db <= 1.00:
            speed_buckets["<= 1.00x (Bình thường / Giãn nhẹ)"] += 1
        elif speed_db <= 1.15:
            speed_buckets["1.01x - 1.15x (Hơi nhanh nhẹ - Tự nhiên)"] += 1
        elif speed_db <= 1.30:
            speed_buckets["1.16x - 1.30x (Nhanh rõ rệt)"] += 1
        elif speed_db <= 1.40:
            speed_buckets["1.31x - 1.40x (Rất nhanh - Dễ mất tự nhiên)"] += 1
        else:
            speed_buckets["> 1.40x (Gần trần 1.45x / Ép tốc độ cao)"] += 1
            
        # Categorize WPS
        if actual_wps < 2.8:
            wps_buckets["< 2.8 wps (Chậm / Rất tự nhiên)"] += 1
        elif actual_wps <= 3.4:
            wps_buckets["2.8 - 3.4 wps (Vùng chuẩn tự nhiên)"] += 1
        elif actual_wps <= 4.0:
            wps_buckets["3.5 - 4.0 wps (Nhanh)"] += 1
        else:
            wps_buckets["> 4.0 wps (Rất nhanh / Dễ nuốt chữ)"] += 1
            
        seg_info = {
            "pid": pid,
            "idx": idx,
            "speed_db": speed_db,
            "actual_wps": actual_wps,
            "orig_dur": round(orig_dur, 2),
            "actual_dur": round(actual_dur, 2),
            "words": w_count,
            "text": trans_text,
            "audio_file": audio_file
        }
        all_data.append(seg_info)
        
        if speed_db > 1.30 or actual_wps >= 3.8:
            high_speed_segments.append(seg_info)

print("=" * 80)
print(f"=== BÁO CÁO THỐNG KÊ PHÂN BỐ TỐC ĐỘ (SPEED & WPS) TRÊN {total_segments} PHÂN ĐOẠN ===")
print("=" * 80)

print("\n1. Phân bố theo Hệ số Tốc độ Speed (voice_speed):")
for k, v in speed_buckets.items():
    pct = v / total_segments * 100
    print(f"   • {k}: {v:3d} đoạn ({pct:5.1f}%)")

gt_115 = sum(v for k, v in speed_buckets.items() if not k.startswith("<=") and not k.startswith("1.01x"))
gt_130 = speed_buckets["1.31x - 1.40x (Rất nhanh - Dễ mất tự nhiên)"] + speed_buckets["> 1.40x (Gần trần 1.45x / Ép tốc độ cao)"]
gt_140 = speed_buckets["> 1.40x (Gần trần 1.45x / Ép tốc độ cao)"]

print(f"\n   >>> TỔNG HỢP THEO YÊU CẦU NGƯỜI DÙNG:")
print(f"   - Tốc độ > 1.15x (Nghe rõ rệt là nhanh): {gt_115:3d} / {total_segments} đoạn ({gt_115/total_segments*100:5.1f}%)")
print(f"   - Tốc độ > 1.30x (Rất nhanh / Dễ nuốt chữ): {gt_130:3d} / {total_segments} đoạn ({gt_130/total_segments*100:5.1f}%)")
print(f"   - Tốc độ > 1.40x (Gần trần 1.45x):          {gt_140:3d} / {total_segments} đoạn ({gt_140/total_segments*100:5.1f}%)")

print("\n2. Phân bố theo Mật độ từ thực tế (WPS - Words Per Second):")
for k, v in wps_buckets.items():
    pct = v / total_segments * 100
    print(f"   • {k}: {v:3d} đoạn ({pct:5.1f}%)")

print(f"\n3. Danh sách Top 10 đoạn có Speed cao nhất / WPS cao nhất:")
sorted_high = sorted(high_speed_segments, key=lambda x: (x['speed_db'], x['actual_wps']), reverse=True)
for i, s in enumerate(sorted_high[:10], 1):
    print(f"   [{i:02d}] {s['pid']} Đoạn {s['idx']:02d} | Speed: {s['speed_db']:.2f}x | WPS: {s['actual_wps']:.2f} wps | Dur: {s['actual_dur']}s / Cảnh: {s['orig_dur']}s ({s['words']} từ)")
    print(f"        Text: \"{s['text']}\"")
