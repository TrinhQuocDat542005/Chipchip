import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

def evaluate_project(pid):
    cur.execute("SELECT id, data FROM dubbing_projects WHERE id = ?", (pid,))
    row = cur.fetchone()
    if not row:
        return None
    data = json.loads(row[1])
    segments = data.get("segments", [])
    if not segments:
        return None
        
    total = len(segments)
    raw_pass = 0
    raw_devs = []
    
    fitted_pass = 0
    fitted_devs = []
    
    reasons = {
        "short_dialogue_finish_early": 0, # Câu thoại ngắn, kết thúc tự nhiên trước khi hết cảnh
        "long_dialogue_over_ceiling": 0,  # Câu thoại dịch quá dài vượt trần 1.35x
        "speech_rate_mismatch": 0         # Tốc độ đọc diễn viên gốc quá nhanh hoặc quá chậm
    }
    
    distribution = {
        "<= 5% (Rất chuẩn)": 0,
        "5% - 10% (Chuẩn)": 0,
        "10% - 20% (Lệch nhẹ)": 0,
        "20% - 50% (Lệch trung bình)": 0,
        "> 50% (Lệch nhiều)": 0
    }
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        raw_dur = seg.get("voice_duration") or orig_dur
        raw_dev = abs(raw_dur - orig_dur) / orig_dur * 100
        raw_devs.append(raw_dev)
        if raw_dev <= 10.0:
            raw_pass += 1
            
        # Vòng 2 dynamic 2-way speed fit
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
        fitted_devs.append(dev)
        if dev <= 10.0:
            fitted_pass += 1
        else:
            if raw_dur < orig_dur:
                reasons["short_dialogue_finish_early"] += 1
            elif raw_dur > orig_dur:
                reasons["long_dialogue_over_ceiling"] += 1
            else:
                reasons["speech_rate_mismatch"] += 1
                
        if dev <= 5.0:
            distribution["<= 5% (Rất chuẩn)"] += 1
        elif dev <= 10.0:
            distribution["5% - 10% (Chuẩn)"] += 1
        elif dev <= 20.0:
            distribution["10% - 20% (Lệch nhẹ)"] += 1
        elif dev <= 50.0:
            distribution["20% - 50% (Lệch trung bình)"] += 1
        else:
            distribution["> 50% (Lệch nhiều)"] += 1
            
    return {
        "pid": pid,
        "total": total,
        "raw_pass": raw_pass,
        "raw_pass_pct": raw_pass / total * 100,
        "raw_max_dev": max(raw_devs),
        "fitted_pass": fitted_pass,
        "fitted_pass_pct": fitted_pass / total * 100,
        "fitted_max_dev": max(fitted_devs),
        "fitted_avg_dev": sum(fitted_devs) / total,
        "reasons": reasons,
        "distribution": distribution
    }

pids = ["dub-1786900777961", "dub-1786897570201", "dub-1786899653642", "dub-1786898959225", "dub-1786732340533-part-01"]
print(json.dumps([evaluate_project(p) for p in pids if evaluate_project(p)], indent=2, ensure_ascii=False))
