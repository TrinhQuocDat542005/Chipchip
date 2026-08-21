import sqlite3
import json
import os
import subprocess
import wave
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'
PYTHON_EXE = 'D:/AutoDub Sub/ai-video-factory/.venv-vieneu/Scripts/python.exe'
TTS_SCRIPT = 'D:/AutoDub Sub/ai-video-factory/services/tts/edge_tts_cli.py'

concise_map = {
    1: "Tại đây, ai cũng phải làm bài tập quỷ dị mỗi ngày, xong việc sẽ nhận được rương báu.",
    2: "Thấy Long Hải đã chết dám chửi đại ca, cô ta tag hắn: \"Long Hải, an phận chút đi!\"",
    3: "Không thì tao cũng giết mày! Lũ người chết tụi mày nên ngoan ngoãn nằm dưới mồ đi!\"",
    4: "Long Hải nhắn lại: \"Mày cũng không thoát được đâu.\" Lâm Dao sợ hãi run rẩy. Thẩm Thành nhìn nhóm chat khẽ hừ lạnh: \"Tên hề Lý Na, sớm muộn gì tao cũng xử mày.\" Cậu tiếp tục theo dõi các nhóm lớp khác.",
    5: "Quả nhiên học sinh chết ở các lớp khác cũng đang quấy phá, trò chơi ngày càng quái dị.",
    6: "Tắt chat, Thẩm Thành về giường nghỉ ngơi, đợi 11 giờ đêm sẽ bật Hư Ẩn sang ký túc nữ.",
    7: "Thể lực có 9 điểm, đủ dùng Hư Ẩn 4 lần để diệt Tiêu Chương. Giết hắn sẽ nhận được kỹ năng gì đây? Thật đáng mong đợi. 11 giờ đêm, nhìn xuống sân trường vắng tanh không một bóng người, Thẩm Thành kích hoạt Hư Ẩn, lao nhanh về phía ký túc xá nữ. Vừa bước vào hành lang, một luồng âm khí lạnh thấu xương ập tới. Cậu cảnh giác quan sát xung quanh.",
    8: "Không thấy người sống, con quỷ quay đi lang thang. May mà có Hư Ẩn, không thì đêm nay toi mạng. Cần tới phòng 508 trước khi hết chiêu, Thẩm Thành lao vội lên tầng 5. Bất ngờ, một nữ quỷ xõa tóc bước tới. Cậu nín thở lách qua người ả. Đột nhiên, nữ quỷ dừng bước, từ từ ngoảnh đầu nhìn thẳng về phía cậu đứng.",
    9: "Nữ quỷ muốn xuống tầng 5 phải qua tầng thượng. Làm sao đây? Thấy cửa sổ gần đó, Thẩm Thành quyết định trèo ra ngoài, bám vào gờ tường leo lên tầng. Gió đêm thấu xương rít từng cơn lạnh buốt.",
    10: "Thông báo tuyên dương toàn trường khiến học sinh sống sót chấn động: \"Thẩm Thành giết được lớp trưởng khác sao? Mọi người đang chật vật sống sót, vậy mà cậu ta đã đi săn người rồi!\" Các nhóm lớp bùng nổ bàn tán: \"Thẩm Thành là thần thánh phương nào? Tuyệt đối đừng đắc tội với kẻ tàn nhẫn này!\"",
    11: "Tiếng hét từ phòng Lý Na vang lên xé toạc màn đêm. Thẩm Thành cười lạnh: Tiêu Chương đã đắc thủ, mình cũng nên về. Đúng lúc này, tiếng bước chân dồn dập truyền tới. Mấy học sinh người đầy máu hoảng loạn tháo chạy tới đây sau trận sinh tử.",
    12: "Sao lại có thông báo toàn trường? Rốt cuộc là ai làm? Chẳng lẽ là Thẩm Thành?",
    13: "\"Được biểu dương toàn trường kìa! Thằng ranh đó thức tỉnh năng lực gì thế?\"",
    14: "Ba người nhìn nhau đầy kinh sợ trước sức mạnh của Thẩm Thành. Về đến phòng, Thẩm Thành nằm nghỉ ngơi. Dù nguy hiểm nhưng cậu đã hoàn thành nhiệm vụ và nhận được kỹ năng cực mạnh.",
    15: "Hồi chiêu 10 giây, làm choáng kẻ địch xung quanh. Đây đúng là thần kỹ giúp tăng mạnh khả năng giữ mạng! Sáng hôm sau, Thẩm Thành dậy sớm đến lớp. Dọc đường, học sinh xôn xao bàn tán chuyện tối qua. Thấy Thẩm Thành, ai nấy đều kính sợ né đường. Cậu chỉ khẽ gật đầu, hiểu rằng ở nơi tàn khốc này chỉ có thực lực mới là chân lý.",
    16: "Vào lớp, mọi người nhìn Thẩm Thành đầy kính sợ và tò mò. Vương Tử Hàm liền sấn tới mỉa mai: \"Làm màu gì chứ, may mắn nhặt được rương thôi! Sao đồ ngon toàn rơi vào tay bọn con trai thế?\" Ả ta ghen ăn tức ở, lải nhải không ngừng.",
    17: "Thẩm Thành bước tới tát thẳng vào mặt Vương Tử Hàm: \"Mày nói cái gì?\" Cậu rút rìu kề sát cổ ả, lạnh lùng đe dọa: \"Tao ngứa mắt mày lâu rồi. Giờ không có luật pháp, tao chém chết mày lúc nào cũng được!\" Thấy sát khí ngập tràn, Vương Tử Hàm khóc thét van xin. Cả lớp sợ hãi im phăng phắc.",
    18: "Đang muốn dùng kỹ năng mới để thị uy thì ả lại tự đâm đầu vào họng súng. Cất rìu đi, Thẩm Thành bồi thêm vài bạt tai.",
    19: "Đánh gãy răng ả mới dừng tay, Diệp Uyển Hân khuyên: \"Muốn xử cô ta nên chọn chỗ vắng, ở lớp không tiện.\" Thẩm Thành đáp: \"Tùy biểu hiện của ả. Tớ không dại giết người công khai đâu.\" Về chỗ ngồi, hệ thống vang lên: \"Hôm nay thứ Ba, lớp trưởng Thẩm Thành hãy chọn bài tập. Bài tập 1: Lâm Dao, Thẩm Thành, Tô Dương, Mã Hiểu Lệ, Diệp...",
    20: "Uyển Hân làm bài tập đào tẩu trong 10 tiếng, một người truy sát, còn lại chạy trốn.",
    21: "Kẻ truy sát phải hạ hai người; người chạy trốn cần diệt kẻ truy sát hoặc sống sót.",
    22: "Tiếng đầu tiên cấm giết người. Thất bại sẽ bị xóa sổ. Bài tập 2: Thẩm Thành, Gia Hào, Hoàng Phàm, Lý Na, Thanh Tuyết quyết đấu sinh tử 10 tiếng, chỉ hai người được sống.",
    23: "Hết giờ chưa đạt chuẩn sẽ bị xóa sổ. Nhìn chữ máu trên bảng, mọi người chết lặng. Thẩm Thành u ám chọn Bài tập 1. Vì nếu chọn Bài tập 2 đấu sinh tử thì chỉ có cậu và Gia Hào sống sót. Diệp Uyển Hân cũng ở Bài tập 1, cậu sẽ hỗ trợ nếu cô không phải kẻ truy sát. Lựa chọn hoàn tất."
}

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

print("================================================================================")
print("=== THỰC THI CONCISION, TTS & DYNAMIC SPEED FIT (<=1.18X) CHO TẬP 6 ===")
print("================================================================================\n")

for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    new_text = concise_map.get(idx, seg.get("translated_text", ""))
    seg["translated_text"] = new_text
    
    # Render TTS
    temp_mp3 = os.path.join(STORAGE_DIR, f"temp_tap6_{idx}.mp3")
    out_wav = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    
    cmd_tts = [PYTHON_EXE, TTS_SCRIPT, new_text, "vi-VN-HoaiMyNeural", temp_mp3, "+0%"]
    subprocess.run(cmd_tts, capture_output=True, check=True)
    
    # Trim silence to wav
    temp_trim = os.path.join(STORAGE_DIR, f"temp_trim_{idx}.wav")
    subprocess.run([
        "ffmpeg", "-y", "-i", temp_mp3,
        "-af", "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse",
        "-ar", "24000", "-ac", "1", temp_trim
    ], capture_output=True, check=True)
    
    with wave.open(temp_trim, 'rb') as wf:
        raw_dur = wf.getnframes() / wf.getframerate()
        
    # Calculate speed factor with ceiling 1.18x
    # Target max is orig_dur * 1.00 (khớp khít, không tràn khung)
    target_dur = orig_dur
    if raw_dur > target_dur:
        speed_factor = raw_dur / target_dur
        # Cap speed factor at 1.18x max
        speed_factor = min(1.18, max(1.0, speed_factor))
    else:
        speed_factor = 1.00
        
    subprocess.run([
        "ffmpeg", "-y", "-i", temp_trim,
        "-filter:a", f"atempo={speed_factor:.4f}",
        "-ar", "24000", "-ac", "1", out_wav
    ], capture_output=True, check=True)
    
    with wave.open(out_wav, 'rb') as wf:
        final_dur = wf.getnframes() / wf.getframerate()
        
    seg["voice_duration"] = round(final_dur, 3)
    seg["voice_speed"] = round(speed_factor, 2)
    seg["voice_url"] = f"segment-seg-{idx}-voice.wav"
    
    # Cleanup temp
    if os.path.exists(temp_mp3): os.remove(temp_mp3)
    if os.path.exists(temp_trim): os.remove(temp_trim)
    
    status = "✅ VỪA VẶN" if final_dur <= orig_dur + 0.05 else f"❌ TRÀN ({final_dur-orig_dur:.2f}s)"
    print(f"Seg {idx:02d} | Slot: {orig_dur:5.2f}s | Audio: {final_dur:5.2f}s | Speed: {speed_factor:4.2f}x | {status} | Text: {new_text[:40]}")

cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = 'dub-1786897570201'", (json.dumps(data, ensure_ascii=False),))
conn.commit()
print("\n🎉 Đã cập nhật xong SQLite database!")
