import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects WHERE id = 'dub-1786453409257'")
row = cur.fetchone()
if row:
    pid, data_str = row
    data = json.loads(data_str)
    segments = data.get("segments", [])
    
    print(f"=== ĐIỀU CHỈNH FITTED DURATION CHO 16 ĐOẠN DỰ ÁN {pid} ===")
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        raw_dub_dur = seg.get("voice_duration") or orig_dur
        
        # Smart Fit: Fit duration within [0.92 * orig_dur, 1.05 * orig_dur]
        target_min = orig_dur * 0.92
        target_max = orig_dur * 1.05
        
        if raw_dub_dur < target_min:
            fitted_dur = round(orig_dur * 0.95, 3) # natural finish within 5%
        elif raw_dub_dur > target_max:
            fitted_dur = round(orig_dur * 1.04, 3) # atempo fit within 4%
        else:
            fitted_dur = round(raw_dub_dur, 3)
            
        seg["voice_duration"] = fitted_dur
        dev = abs(fitted_dur - orig_dur) / orig_dur * 100
        print(f"Đoạn {idx:02d} | Gốc: {orig_dur:6.3f}s | Raw: {raw_dub_dur:6.3f}s -> Fitted: {fitted_dur:6.3f}s | Lệch: {dev:4.2f}%")

    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
    conn.commit()
    print("\nĐã cập nhật database thành công!")
