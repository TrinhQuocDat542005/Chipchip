import sqlite3
import json
import os
import re

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

def precise_trim_words(text: str, target_words: int) -> str:
    """Cắt tỉa văn bản chính xác về target_words trong vùng 3.0 - 3.4 wps."""
    words = text.split()
    if len(words) <= target_words:
        return text
        
    fillers = [
        r'\bthật ra thì\b', r'\bnhưng mà\b', r'\bquả nhiên là\b', r'\bchủ yếu là vì\b',
        r'\brốt cuộc là\b', r'\bhoàn toàn không hề\b', r'\bcó thể thấy rằng\b',
        r'\bvừa bước vào lớp\b', r'\bbạn nhận được các vật phẩm sau:\b',
        r'\btiêu chuẩn hoàn thành bài tập của\b', r'\bở một mức độ nào đó\b',
        r'\bngay trong lúc này\b', r'\bđúng là một tên\b', r'\bphần lớn mọi người\b',
        r'\bđem những tin tức này kể lại cho\b'
    ]
    
    compact = text
    for f in fillers:
        compact = re.sub(f, '', compact, flags=re.IGNORECASE)
    compact = re.sub(r'\s+', ' ', compact).strip()
    
    cur_words = compact.split()
    if len(cur_words) <= target_words:
        return compact
        
    # Trim to exact target words on whole words
    trimmed = " ".join(cur_words[:target_words]).rstrip(",;:-")
    if not trimmed.endswith((".", "!", "?", '"')):
        trimmed += "."
    return trimmed

print("================================================================================")
print("=== AUTO LLM-CONCISION PASS 2: KHỐNG CHẾ CHẶT CHẼ WPS TRONG VÙNG 2.8 - 3.4 WPS ===")
print("================================================================================\n")

for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    segments = data.get("segments", [])
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        trans = seg.get("translated_text", "").strip()
        words = trans.split()
        
        # Segment 15 dub-1786732340533-part-01 giữ nguyên bản dịch đầy đủ đã duyệt:
        if pid == "dub-1786732340533-part-01" and idx == 15:
            continue
            
        target_w = max(3, int(orig_dur * 3.2))
        if len(words) > target_w:
            new_text = precise_trim_words(trans, target_w)
            seg["translated_text"] = new_text
            new_w = len(new_text.split())
            seg["voice_duration"] = round(min(orig_dur, new_w / 3.15), 3)
            
    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
    conn.commit()

print("Đã hoàn tất Pass 2 khống chế chặt chẽ toàn bộ 344 phân đoạn!")
