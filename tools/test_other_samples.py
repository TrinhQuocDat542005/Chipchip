import sqlite3
import json
import os
import math

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

test_pids = [
    "dub-1786900777961", # 112 segments
    "dub-1786897570201", # 86 segments
    "dub-1786899653642", # 59 segments
    "dub-1786898959225", # 50 segments
]

print("================================================================================")
print("=== KIỂM THỬ THUẬT TOÁN VÒNG 2 TRÊN CÁC VIDEO MẪU KHÁC CHƯA DÙNG TINH CHỈNH ===")
print("================================================================================\n")

for pid in test_pids:
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row:
        print(f"Không tìm thấy {pid}")
        continue
        
    data = json.loads(row[1])
    segments = data.get("segments", [])
    if not segments:
        continue
        
    print(f"--------------------------------------------------------------------------------")
    print(f"📊 DỰ ÁN: {pid} (Tổng số đoạn: {len(segments)})")
    print(f"--------------------------------------------------------------------------------")
    
    # 1. Đo Raw trước khi áp dụng thuật toán Vòng 2
    raw_pass = 0
    raw_fail = 0
    raw_devs = []
    
    # 2. Đo Sau khi áp dụng thuật toán Vòng 2 (Dynamic 2-Way Speed Fit 0.88x - 1.35x)
    fitted_pass = 0
    fitted_fail = 0
    fitted_devs = []
    
    samples_detail = []
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        raw_dur = seg.get("voice_duration") or orig_dur
        raw_dev = abs(raw_dur - orig_dur) / orig_dur * 100
        raw_devs.append(raw_dev)
        
        if raw_dev <= 10.0:
            raw_pass += 1
        else:
            raw_fail += 1
            
        # Thuật toán Vòng 2: Dynamic 2-Way Speed Fit (0.88x - 1.35x)
        target_min = orig_dur * 0.92
        target_max = orig_dur * 1.05
        
        if raw_dur > target_max:
            # speed up up to 1.35x
            speed = min(1.35, raw_dur / (orig_dur * 1.02))
            fitted_dur = raw_dur / speed
        elif raw_dur < target_min:
            # speed down up to 0.88x
            speed = max(0.88, raw_dur / (orig_dur * 0.96))
            fitted_dur = raw_dur / speed
        else:
            fitted_dur = raw_dur
            
        fitted_dev = abs(fitted_dur - orig_dur) / orig_dur * 100
        fitted_devs.append(fitted_dev)
        
        if fitted_dev <= 10.0:
            fitted_pass += 1
        else:
            fitted_fail += 1
            
        if idx <= 5 or fitted_dev > 10.0:
            samples_detail.append({
                "idx": idx,
                "orig": orig_dur,
                "raw": raw_dur,
                "raw_dev": raw_dev,
                "fitted": fitted_dur,
                "fitted_dev": fitted_dev,
                "text_src": seg.get("source_text", "")[:40],
                "text_vi": seg.get("translated_text", "")[:40]
            })

    print(f"🔹 KẾT QUẢ TRƯỚC VÒNG 2 (Raw TTS chưa qua Dynamic Speed Fit):")
    print(f"   - Số đoạn PASS (lệch <= 10%): {raw_pass}/{len(segments)} ({raw_pass/len(segments)*100:.1f}%)")
    print(f"   - Số đoạn FAIL (lệch > 10%):  {raw_fail}/{len(segments)} ({raw_fail/len(segments)*100:.1f}%)")
    print(f"   - Độ lệch cực đại (Max Dev):  {max(raw_devs):.2f}%\n")
    
    print(f"🔹 KẾT QUẢ SAU KHI ÁP DỤNG THUẬT TOÁN VÒNG 2 (Dynamic 2-Way Speed Fit):")
    print(f"   - Số đoạn PASS (lệch <= 10%): {fitted_pass}/{len(segments)} ({fitted_pass/len(segments)*100:.1f}%)")
    print(f"   - Số đoạn FAIL (lệch > 10%):  {fitted_fail}/{len(segments)} ({fitted_fail/len(segments)*100:.1f}%)")
    print(f"   - Độ lệch cực đại (Max Dev):  {max(fitted_devs):.2f}%")
    print(f"   - Độ lệch trung bình (Avg Dev): {sum(fitted_devs)/len(fitted_devs):.2f}%\n")
    
    print(f"--- 5 ĐOẠN ĐẦU TIÊN CỦA {pid} ---")
    for s in samples_detail[:5]:
        print(f"Đoạn {s['idx']:02d}: Gốc={s['orig']:.2f}s | Raw={s['raw']:.2f}s (Lệch {s['raw_dev']:.1f}%) -> Fitted={s['fitted']:.2f}s (Lệch {s['fitted_dev']:.1f}%) | {'PASS' if s['fitted_dev'] <= 10 else 'FAIL'}")
        print(f"   + Trung: {s['text_src']}...")
        print(f"   + Việt:  {s['text_vi']}...\n")
