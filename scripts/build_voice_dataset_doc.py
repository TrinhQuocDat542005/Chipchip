from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path
import random
import shutil

OUT = Path('artifacts')
OUT.mkdir(exist_ok=True)
DOCX = OUT / 'bo-cau-thu-giong-nu-hoat-ngon.docx'
TXT = OUT / 'bo-cau-thu-giong-nu-hoat-ngon.txt'
BATCH_DIR = OUT / 'capcut-batches-250-ky-tu'

openers = [
    'Không ngờ', 'Thật ra', 'Ngay lúc ấy', 'Chỉ trong chớp mắt', 'Vừa bước qua cánh cửa',
    'Sau khi bình tĩnh lại', 'Đúng vào thời khắc quan trọng', 'Từ phía cuối hành lang',
    'Khi mọi người còn đang do dự', 'Giữa lúc không ai để ý', 'Sáng hôm sau',
    'Đến tận bây giờ', 'Theo lời của người trong cuộc', 'Trước khi trời tối', 'May mắn thay',
]
subjects = [
    'cô gái nhỏ', 'người đàn ông áo đen', 'Tiêu Y Bạch', 'Lâm Nguyệt', 'cậu thiếu niên',
    'người quản gia già', 'cả nhóm', 'vị khách bí ẩn', 'người chị cả', 'đứa trẻ đứng bên cửa sổ',
    'đội trưởng Trần', 'bà chủ quán', 'người bạn thân của tôi', 'con mèo trắng', 'chiếc xe màu bạc',
]
actions = [
    'đã phát hiện một dấu vết rất lạ', 'bỗng quay đầu nhìn về phía sau', 'nhận được một cuộc gọi khẩn cấp',
    'tìm thấy lá thư bị giấu trong ngăn kéo', 'quyết định quay lại căn phòng cũ',
    'nghe thấy tiếng bước chân ngày càng gần', 'nhìn thấy ánh đèn trên tầng ba bật sáng',
    'vội vàng kéo mọi người rời khỏi đó', 'nhận ra chiếc chìa khóa đã biến mất',
    'nói ra bí mật mà mình che giấu bấy lâu', 'chợt nhớ đến lời cảnh báo tối qua',
    'phát hiện thời gian trên đồng hồ đang chạy ngược', 'đặt chiếc hộp gỗ xuống giữa bàn',
    'mở điện thoại và xem lại đoạn video', 'nhận ra người trước mặt không hề nói dối',
]
endings = [
    'nhưng mọi chuyện vẫn chưa kết thúc.', 'và đó mới chỉ là khởi đầu.', 'khiến tất cả đều sững sờ.',
    'song không ai dám bước thêm một bước.', 'rồi căn phòng đột nhiên im bặt.',
    'như thể đã có người chuẩn bị từ trước.', 'khiến kế hoạch ban đầu hoàn toàn thay đổi.',
    'nhưng câu trả lời lại nằm ở một nơi khác.', 'và sự thật còn đáng sợ hơn họ tưởng.',
    'trước khi cánh cửa tự động đóng lại.', 'khi đồng hồ vừa điểm đúng mười hai giờ.',
    'rồi mỉm cười như chưa từng có chuyện gì xảy ra.', 'mặc dù bên ngoài trời vẫn đang mưa lớn.',
    'vì chẳng ai biết người tiếp theo sẽ là ai.', 'và lần này họ không còn đường lui nữa.',
]

special = [
    'Khoan đã, phía trước hình như có người!',
    'Trời ơi, chuyện này sao có thể xảy ra được chứ?',
    'Đừng lo, chúng ta vẫn còn đủ thời gian để nghĩ cách.',
    'Cậu chắc chắn muốn mở cánh cửa đó ngay bây giờ sao?',
    'Nếu đã tới đây rồi thì chúng ta vào xem thử nhé.',
    'Này, đừng tự ý chạm vào đồ của người khác!',
    'Tốt quá rồi, cuối cùng mọi người cũng bình an trở về.',
    'Hóa ra từ đầu đến cuối, người bị lừa lại chính là tôi.',
    'Một, hai, ba, chuẩn bị xong thì chúng ta cùng bắt đầu!',
    'Hôm nay là ngày mười bốn tháng tám năm hai nghìn không trăm hai mươi sáu.',
    'Tổng chi phí là hai triệu ba trăm năm mươi nghìn đồng, đã bao gồm thuế.',
    'Chuyến tàu số không bảy ba sẽ khởi hành lúc tám giờ bốn mươi lăm phút.',
    'Nhiệt độ ngoài trời hiện là ba mươi hai độ C, độ ẩm khoảng bảy mươi phần trăm.',
    'Mật mã gồm sáu chữ số: bốn, chín, hai, bảy, một, tám.',
    'Địa chỉ cần tìm là số một trăm hai mươi tám, đường Nguyễn Văn Linh, quận Bảy.',
    'Theo báo cáo, doanh thu quý ba tăng mười hai phẩy năm phần trăm.',
    'Cô ấy khẽ hỏi: Anh thực sự không nhớ em là ai sao?',
    'Anh ta bật cười: Chỉ bằng chút bản lĩnh đó mà cũng muốn ngăn tôi à?',
    'Người mẹ dịu dàng nói: Về nhà thôi con, cả nhà đang chờ con đấy.',
    'Cậu bé reo lên: Tuyệt vời, ngày mai chúng ta được đi biển rồi!',
    'Xin chào, tôi có thể giúp gì cho bạn trong ngày hôm nay?',
    'Cảm ơn bạn đã kiên nhẫn chờ đợi, yêu cầu của bạn đã được xử lý.',
    'Rất tiếc, sản phẩm này hiện đã hết hàng và sẽ có lại vào tuần sau.',
    'Bạn vui lòng kiểm tra email để xác nhận thông tin đăng ký nhé.',
    'Đừng quên nhấn theo dõi để xem phần tiếp theo của câu chuyện!',
    'Các bạn đoán xem, bên trong chiếc hộp bí ẩn này có gì nào?',
    'Chỉ cần bỏ lỡ một chi tiết nhỏ, bạn sẽ không thể hiểu được đoạn kết.',
    'Và rồi điều không ai ngờ tới cuối cùng cũng xuất hiện.',
    'Liệu cô ấy có kịp thay đổi số phận trước khi quá muộn?',
    'Câu trả lời sẽ được tiết lộ ngay trong phần tiếp theo.',
]

def make_sentences():
    random.seed(20260814)
    generated = []
    combos = [(o, s, a, e) for o in openers for s in subjects for a in actions for e in endings]
    random.shuffle(combos)
    for o, s, a, e in combos:
        sentence = f'{o}, {s} {a}, {e}'
        if sentence not in generated:
            generated.append(sentence)
        if len(generated) >= 150:
            break
    # Interleave handcrafted expressive/numeric lines throughout instead of clustering them.
    for index, sentence in enumerate(special):
        generated.insert(min(index * 6 + 3, len(generated)), sentence)
    return generated[:180]

def set_font(run, size=11, bold=False, color='1F2937'):
    run.font.name = 'Calibri'
    run._element.get_or_add_rPr().rFonts.set(qn('w:ascii'), 'Calibri')
    run._element.get_or_add_rPr().rFonts.set(qn('w:hAnsi'), 'Calibri')
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)

def shade_paragraph(paragraph, fill):
    ppr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    ppr.append(shd)

def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run('Trang ')
    set_font(run, 9, color='6B7280')
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), 'PAGE')
    paragraph._p.append(fld)

sentences = make_sentences()

def pack_batches(items, limit=250):
    batches, current, current_chars = [], [], 0
    for sentence in items:
        added = len(sentence) + (1 if current else 0)
        if current and current_chars + added > limit:
            batches.append(current)
            current, current_chars = [], 0
            added = len(sentence)
        current.append(sentence)
        current_chars += added
    if current:
        batches.append(current)
    return batches

batches = pack_batches(sentences)
doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Inches(8.5), Inches(11)
section.top_margin = section.right_margin = section.bottom_margin = section.left_margin = Inches(1)
section.header_distance = section.footer_distance = Inches(0.492)

styles = doc.styles
normal = styles['Normal']
normal.font.name, normal.font.size = 'Calibri', Pt(11)
normal._element.rPr.rFonts.set(qn('w:ascii'), 'Calibri')
normal._element.rPr.rFonts.set(qn('w:hAnsi'), 'Calibri')
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.25
for name, size, color, before, after in [
    ('Heading 1', 16, '2E74B5', 18, 10), ('Heading 2', 13, '2E74B5', 14, 7), ('Heading 3', 12, '1F4D78', 10, 5)
]:
    style = styles[name]
    style.font.name, style.font.size, style.font.bold = 'Calibri', Pt(size), True
    style.font.color.rgb = RGBColor.from_string(color)
    style._element.rPr.rFonts.set(qn('w:ascii'), 'Calibri')
    style._element.rPr.rFonts.set(qn('w:hAnsi'), 'Calibri')
    style.paragraph_format.space_before, style.paragraph_format.space_after = Pt(before), Pt(after)

header = section.header.paragraphs[0]
header.text = 'BỘ CÂU THỬ GIỌNG · NỮ HOẠT NGÔN'
header.alignment = WD_ALIGN_PARAGRAPH.LEFT
for run in header.runs: set_font(run, 9, True, '6B7280')
add_page_number(section.footer.paragraphs[0])

title = doc.add_paragraph()
title.paragraph_format.space_after = Pt(6)
r = title.add_run('Bộ câu thử giọng “Nữ hoạt ngôn”')
set_font(r, 24, True, '17365D')
subtitle = doc.add_paragraph()
subtitle.paragraph_format.space_after = Pt(16)
r = subtitle.add_run(f'180 câu tiếng Việt · {len(batches)} batch dưới 250 ký tự · ước tính 15–20 phút audio')
set_font(r, 12, False, '4B6478')

note = doc.add_paragraph()
note.paragraph_format.left_indent = Inches(.15)
note.paragraph_format.right_indent = Inches(.15)
note.paragraph_format.space_before = Pt(4)
note.paragraph_format.space_after = Pt(14)
shade_paragraph(note, 'EEF4FA')
r = note.add_run('Cách dùng nhanh: ')
set_font(r, 11, True, '17365D')
r = note.add_run('Khuyên dùng các file TXT riêng trong thư mục capcut-batches: mỗi file chỉ chứa lời đọc, không có tiêu đề hay thống kê. Mỗi batch được giữ dưới 250 ký tự để tránh cách CapCut tính ký tự tiếng Việt và xuống dòng.')
set_font(r, 11, False, '1F2937')

doc.add_heading('Thiết lập xuất đề nghị', level=1)
for text in [
    'Giọng: Cô gái hoạt ngôn.',
    'Tốc độ và cao độ: giữ mặc định của CapCut.',
    'Xuất WAV nếu có; nếu không, dùng AAC hoặc MP3 chất lượng cao nhất.',
    f'Mỗi batch xuất thành một file riêng, từ batch-01 đến batch-{len(batches):02d}.',
    'Không thu lại bằng loa hoặc quay màn hình; ưu tiên xuất audio trực tiếp.',
]:
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(4)
    p.add_run(text)

for batch_index, batch_sentences in enumerate(batches):
    doc.add_page_break()
    heading = doc.add_paragraph(style='Heading 1')
    heading.paragraph_format.keep_with_next = True
    batch_chars = sum(len(s) for s in batch_sentences) + max(0, len(batch_sentences) - 1)
    run = heading.add_run(f'BATCH {batch_index + 1:02d} · {len(batch_sentences)} CÂU')
    set_font(run, 16, True, '2E74B5')
    info = doc.add_paragraph()
    info.paragraph_format.space_after = Pt(12)
    run = info.add_run(f'Xuất file: batch-{batch_index + 1:02d}.wav · {batch_chars}/500 ký tự')
    set_font(run, 9.5, False, '6B7280')
    for sentence in batch_sentences:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.line_spacing = 1.25
        p.paragraph_format.keep_together = True
        r = p.add_run(sentence)
        set_font(r, 11, False, '111827')

doc.core_properties.title = 'Bộ câu thử giọng Nữ hoạt ngôn'
doc.core_properties.subject = 'Dữ liệu thử nghiệm TTS tiếng Việt'
doc.core_properties.author = 'AI Video Factory'
doc.save(DOCX)

with TXT.open('w', encoding='utf-8', newline='\n') as handle:
    handle.write('BỘ CÂU THỬ GIỌNG NỮ HOẠT NGÔN\n')
    handle.write('Mỗi batch dưới 250 ký tự. Không đọc dòng BATCH hoặc dòng thống kê.\n\n')
    for batch_index, batch_sentences in enumerate(batches):
        batch_chars = sum(len(s) for s in batch_sentences) + max(0, len(batch_sentences) - 1)
        handle.write(f'===== BATCH {batch_index + 1:02d} · {batch_chars}/500 KÝ TỰ =====\n')
        for sentence in batch_sentences:
            handle.write(sentence + '\n\n')

if BATCH_DIR.exists():
    shutil.rmtree(BATCH_DIR)
BATCH_DIR.mkdir()
for batch_index, batch_sentences in enumerate(batches):
    # One newline only; no heading, numbering, BOM, or hidden formatting.
    content = '\n'.join(batch_sentences)
    (BATCH_DIR / f'batch-{batch_index + 1:03d}.txt').write_text(content, encoding='utf-8', newline='\n')
shutil.make_archive(str(OUT / 'capcut-batches-250-ky-tu'), 'zip', BATCH_DIR)

print(DOCX.resolve())
print(TXT.resolve())
print((OUT / 'capcut-batches-250-ky-tu.zip').resolve())
print(f'{len(sentences)} sentences, {len(batches)} batches, max {max(sum(len(s) for s in b) + len(b) - 1 for b in batches)} chars')
