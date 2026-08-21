import sqlite3
import json
import re

# Load current 49 segments
conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

# 1. Current post-concision characters (no spaces)
chars_current_no_space = sum(len(re.sub(r'\s+', '', s.get('translated_text', ''))) for s in current_49)
words_current = sum(len(s.get('translated_text', '').split()) for s in current_49)

# 2. Pilot 10 diffs:
pilot_original = {
    1: "Để giải quyết Tiêu Chương, lúc này tôi đang lục soát trong ký túc xá nữ. Bên trong phòng truyền ra âm thanh: \"Cậu đã nghe thấy gì chưa?\"",
    2: "Mạc Tiểu Tuyết lại bị Lý Ngang coi như chiến lợi phẩm phân phát cho bọn đàn em rồi. Tên Lý Ngang này đúng là một tên biến thái chết tiệt, hoàn toàn không coi chúng ta ra gì!",
    4: "Ai có thể tới cứu chúng ta đây? Thôi đi ngủ đi, còn sống sót đã là may mắn lắm rồi. Các cậu đang phàn nàn về chuyện của tên Lý Ngang đó à?",
    5: "Không có ở đây rồi. Thẩm Thành bật kỹ năng Hư Ẩn đi lên tầng ba thì lại chạm mặt người quen cũ, điểm lý trí lại tiếp tục bị giảm sút.",
    6: "Điểm lý trí bị giảm mất ba điểm. Lại chạm mặt nữa rồi à? Thôi cứ đi lên phòng 503 trước đã, đợi cho con nữ quỷ kia rời đi rồi tính tiếp.",
    9: "Thẩm Thành nhẹ nhàng bước vào bên trong phòng, nhìn thấy trên chiếc giường tầng có hai người đang nằm. Quả nhiên đúng thật là tên Lý Ngang.",
    12: "Sau khi nhận được điểm thiên phú mới, Thẩm Thành lập tức quay người rời đi ngay, mặc kệ cho cô nữ sinh kia đang ngồi đó gào khóc thảm thiết.",
    15: "Việc tiêu diệt lớp trưởng của lớp khác để nhận thiên phú mới hoàn toàn là ngẫu nhiên. Nhận được một kỹ năng cấp B thì vận may cũng coi như khá tốt rồi.",
    28: "Thẩm Thành, cậu làm quả thật quá xuất sắc và đỉnh cao đấy. Toàn bộ cả lớp chỉ có duy nhất một mình Hoàng Gia Hào là biết được toàn bộ sự thật.",
    43: "Bằng không nếu mà rút thăm trúng tớ thì coi như tớ toi đời luôn đấy. Đúng vậy, nếu có chọn thì cũng phải chọn bài tập hai hoặc là bài tập ba chứ!"
}

# Calculate diffs for pilot segments
pilot_char_cuts = 0
for idx, old_txt in pilot_original.items():
    cur_txt = current_49[idx-1].get('translated_text', '')
    old_c = len(re.sub(r'\s+', '', old_txt))
    cur_c = len(re.sub(r'\s+', '', cur_txt))
    diff = max(0, old_c - cur_c)
    pilot_char_cuts += diff
    print(f"Pilot Seg {idx:02d}: Old={old_c} -> Cur={cur_c} (Cut {diff} chars)")

print(f"\nTổng ký tự cắt giảm từ 10 đoạn pilot đã duyệt: {pilot_char_cuts} ký tự")
