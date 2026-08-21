import sqlite3
import json
import os
import re

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
]

pilot_10_map = {
    1: "Tôi lục soát ký túc xá nữ tìm manh mối Tiêu Chương. Bên trong có tiếng: Cậu nghe gì chưa?",
    2: "Mạc Tiểu Tuyết bị Lý Ngang chia cho đàn em. Tên Lý Ngang biến thái thật, chẳng coi ai ra gì!",
    4: "Ai có thể cứu chúng ta đây? Thôi ngủ đi, sống sót là tốt rồi. Các cậu đang phàn nàn về Lý Ngang à?",
    5: "Không có ở đây. Thẩm Thành dùng Hư Ẩn lên tầng ba thì bắt gặp người quen, lý trí đã giảm.",
    6: "Giảm ba điểm. Lại gặp à? Cứ lên phòng 503 trước, đợi nữ quỷ đi rồi tính.",
    9: "Cậu rón rén bước vào, thấy trên giường tầng có hai người. Quả nhiên đúng là Lý Ngang.",
    12: "Nhận được thiên phú mới, cậu quay người rời đi, mặc kệ nữ sinh đang gào khóc.",
    15: "Thiên phú khi diệt lớp trưởng khác là ngẫu nhiên. Nhận được cấp B thì vận may cũng khá tốt rồi.",
    19: "Hắn đang làm chuyện đó với nữ sinh thì bị chém làm mấy đoạn! Nhóm chat đang bàn tán rôm rả kìa.",
    20: "Cậu dời ánh mắt sang Thẩm Thành. Mở nhóm chat lớp ra, quả nhiên mọi người đều bàn tán chuyện Lý Ngang."
}

def clean_text(text, max_syllables):
    words = [w for w in text.split() if w]
    if len(words) <= max_syllables:
        return text
    fillers = [
        "vậy mà lại", "hoàn toàn là", "thật sự là", "rốt cuộc là", "căn bản là",
        "quả nhiên là", "ngay lập tức", "bỗng nhiên", "đột nhiên", "chắc chắn là",
        "thì ra là", "chính là", "ở thời điểm này", "lúc này thì", "sau đó thì",
        "một cách", "vô cùng", "hết sức", "rất là", "cực kỳ", "đang liên tục"
    ]
    cur_text = text
    for f in fillers:
        cur_text = re.sub(r'\b' + re.escape(f) + r'\b', '', cur_text, flags=re.IGNORECASE)
    cur_text = re.sub(r'\s+', ' ', cur_text).strip()
    w_list = [w for w in cur_text.split() if w]
    if len(w_list) <= max_syllables:
        return cur_text
        
    sentences = re.split(r'[.!?]\s*', cur_text)
    shortened = []
    accum = 0
    for s in sentences:
        s_words = [w for w in s.split() if w]
        if not s_words: continue
        if accum + len(s_words) <= max_syllables:
            shortened.append(s.strip())
            accum += len(s_words)
        else:
            needed = max_syllables - accum
            if needed >= 3:
                shortened.append(" ".join(s_words[:needed]))
            break
    res = ". ".join(shortened).strip()
    if not res.endswith(('.', '!', '?')):
        res += "."
    return res

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

for pid in PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    for idx, seg in enumerate(data.get("segments", []), 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        old_trans = seg.get("translated_text", "")
        if pid == "dub-1786900777961" and idx in pilot_10_map:
            new_text = pilot_10_map[idx]
        else:
            max_syllables = max(4, int(orig_dur * 2.80))
            new_text = clean_text(old_trans, max_syllables)
        seg["translated_text"] = new_text
        words = len(new_text.split())
        seg["voice_duration"] = round(min(orig_dur, words / 3.0), 2)
        seg["voice_speed"] = 1.05
        
    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
    conn.commit()
    print(f"✅ Committed project {pid} with {len(data.get('segments', []))} segments.")

print("ALL PROJECTS COMMITTED TO DB SUCCESSFULLY!")
