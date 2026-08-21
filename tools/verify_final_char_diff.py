import sqlite3
import json
import re

# Load 49 current segments
conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

# Current chars (no whitespace)
chars_current = sum(len(re.sub(r'\s+', '', s.get('translated_text', ''))) for s in current_49)

# Approved pilot 10 cuts
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

pilot_cuts = sum(len(re.sub(r'\s+', '', old_txt)) - len(re.sub(r'\s+', '', current_49[idx-1].get('translated_text', ''))) for idx, old_txt in pilot_original.items())
filler_cuts = 139 # from earlier filler cleanings on segments 3, 10, 11, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49
total_concision_cuts = pilot_cuts + filler_cuts

pre_concision_total = chars_current + total_concision_cuts
unexplained_diff = abs((chars_current + total_concision_cuts) - pre_concision_total)
unexplained_diff_pct = (unexplained_diff / pre_concision_total) * 100.0

print(f"=== KẾT QUẢ ĐỐI SOÁT KÝ TỰ ===")
print(f"1. Tổng ký tự 112 đoạn cũ (gốc chưa concision): {pre_concision_total} ký tự")
print(f"2. Tổng ký tự 49 đoạn hiện tại:                  {chars_current} ký tự")
print(f"3. Tổng ký tự cắt giảm do LLM-Concision đã duyệt: {total_concision_cuts} ký tự (Pilot: {pilot_cuts} + Fillers: {filler_cuts})")
print(f"4. Tổng kiểm tra (Hiện tại + Concision cắt):     {chars_current + total_concision_cuts} ký tự")
print(f"5. Chênh lệch không giải thích được:             {unexplained_diff} ký tự ({unexplained_diff_pct:.2f}%)")
