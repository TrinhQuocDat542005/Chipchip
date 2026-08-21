import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

test_pids = [
    "dub-1786900777961", # 112 segments
    "dub-1786897570201", # 86 segments
    "dub-1786899653642", # 59 segments
    "dub-1786898959225", # 50 segments
    "dub-1786732340533-part-01", # 37 segments
]

print("================================================================================")
print("=== ĐO LƯỜNG DURATION DEVIATION BẰNG CÔNG THỨC CŨ SAU KHI SỬA MISMATCH ===")
print("================================================================================\n")

total_all_segs = 0
total_all_pass_old_formula = 0
total_all_fail_old_formula = 0

project_summaries = []

for pid in test_pids:
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row or not row[1]:
        continue
    data = json.loads(row[1])
    segments = data.get("segments", [])
    if not segments:
        continue
        
    p_total = len(segments)
    p_pass = 0
    p_fail = 0
    p_devs = []
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        # Voice duration currently in DB or fitted
        raw_dur = seg.get("voice_duration") or orig_dur
        
        # Công thức CŨ: abs(dur - orig) / orig * 100
        # Check with Dynamic Speed fit applied (0.88x - 1.35x)
        target_min = orig_dur * 0.92
        target_max = orig_dur * 1.05
        if raw_dur > target_max:
            speed = min(1.35, raw_dur / (orig_dur * 1.02))
            fitted_dur = raw_dur / speed
        elif raw_dur < target_min:
            speed = max(0.88, raw_dur / (orig_dur * 0.96))
            fitted_dur = raw_dur / speed
        else:
            fitted_dur = raw_dur
            
        dev = abs(fitted_dur - orig_dur) / orig_dur * 100
        p_devs.append(dev)
        
        if dev <= 10.0:
            p_pass += 1
            total_all_pass_old_formula += 1
        else:
            p_fail += 1
            total_all_fail_old_formula += 1
            
        total_all_segs += 1
        
    summary = {
        "pid": pid,
        "total": p_total,
        "pass_count": p_pass,
        "fail_count": p_fail,
        "pass_pct": round(p_pass / p_total * 100, 1),
        "fail_pct": round(p_fail / p_total * 100, 1),
        "max_dev": round(max(p_devs), 2),
        "avg_dev": round(sum(p_devs) / p_total, 2)
    }
    project_summaries.append(summary)
    print(f"📊 Dự án: {pid:26s} | Tổng: {p_total:3d} | PASS: {p_pass:3d} ({summary['pass_pct']:5.1f}%) | FAIL: {p_fail:2d} ({summary['fail_pct']:5.1f}%) | Max Dev: {summary['max_dev']:5.2f}%")

print("\n================================================================================")
print("=== TỔNG HỢP TOÀN BỘ 344 PHÂN ĐOẠN (CÔNG THỨC CŨ) ===")
print("================================================================================")
print(f"Tổng số đoạn: {total_all_segs}")
print(f"Số đoạn PASS (Lệch <= 10%): {total_all_pass_old_formula} ({total_all_pass_old_formula/total_all_segs*100:.1f}%)")
print(f"Số đoạn FAIL (Lệch > 10%):  {total_all_fail_old_formula} ({total_all_fail_old_formula/total_all_segs*100:.1f}%)")
