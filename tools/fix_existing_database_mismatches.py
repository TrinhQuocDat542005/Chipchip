import sqlite3
import json
import os
import re

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT id, data FROM dubbing_projects")
rows = cur.fetchall()

print(f"Bắt đầu sửa chữa dữ liệu cho {len(rows)} dự án...")

for r in rows:
    pid = r[0]
    data_str = r[1]
    if not data_str:
        continue
    data = json.loads(data_str)
    segments = data.get("segments", [])
    if not segments:
        continue
        
    modified = False
    
    # 1. Fix Cơ chế 1: Sub-segments having duplicate source_text
    i = 0
    while i < len(segments):
        curr_src = segments[i].get("source_text", "").strip()
        if not curr_src:
            i += 1
            continue
            
        # Find group of consecutive segments with identical source_text
        j = i + 1
        group = [segments[i]]
        while j < len(segments) and segments[j].get("source_text", "").strip() == curr_src:
            group.append(segments[j])
            j += 1
            
        if len(group) > 1:
            total_trans_len = sum(len(s.get("translated_text", "").strip()) for s in group)
            if total_trans_len > 0:
                cur_pos = 0
                for k, s in enumerate(group):
                    trans_len = len(s.get("translated_text", "").strip())
                    weight = trans_len / total_trans_len
                    next_pos = len(curr_src) if k == len(group) - 1 else int(round(cur_pos + len(curr_src) * weight))
                    sliced_src = curr_src[cur_pos:next_pos].strip()
                    if sliced_src:
                        s["source_text"] = sliced_src
                    cur_pos = next_pos
                modified = True
        i = j

    # 2. Fix Cơ chế 2 for dub-1786732340533-part-01 (Segment 30 & 31 cascade shift)
    if pid == "dub-1786732340533-part-01":
        if len(segments) >= 31:
            seg30 = segments[29] # index 29 is seg 30
            seg31 = segments[30] # index 30 is seg 31
            
            if "体力我最多只有七点" in seg30.get("source_text", ""):
                seg30["translated_text"] = "Thể lực tôi có tối đa 7 điểm, dùng tàng hình được 21 phút."
                seg30["voice_duration"] = 3.15
                seg30["voice_speed"] = 1.0
                modified = True
                
            if "还没睡不着好像听说死了不少人" in seg31.get("source_text", ""):
                if not seg31["translated_text"].startswith('"Vẫn chưa ngủ à?'):
                    seg31["translated_text"] = '"Vẫn chưa ngủ à? Tớ ngủ không được, hình như nghe nói chết không ít người, đáng sợ quá, tớ sợ lắm... Tiểu Thành, chúng ta nhất định phải ' + seg31["translated_text"]
                    modified = True

    if modified:
        cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
        print(f"  -> Đã sửa data cho dự án: {pid}")

conn.commit()
print("Hoàn tất sửa chữa database!")
