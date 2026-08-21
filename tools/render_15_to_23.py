import sqlite3
import json
import os
import asyncio
import edge_tts
import subprocess
import wave
import shutil
import time

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

concise_map = {
    15: "Hồi chiêu 10 giây, làm choáng kẻ địch xung quanh. Đây đúng là thần kỹ giúp tăng mạnh khả năng giữ mạng! Sáng hôm sau, Thẩm Thành dậy sớm đến lớp. Dọc đường, học sinh xôn xao bàn tán chuyện tối qua. Thấy Thẩm Thành, ai nấy đều kính sợ né đường. Cậu chỉ khẽ gật đầu, hiểu rằng ở nơi tàn khốc này chỉ có thực lực mới là chân lý.",
    16: "Vào lớp, mọi người nhìn Thẩm Thành đầy kính sợ và tò mò. Vương Tử Hàm liền sấn tới mỉa mai: Làm màu gì chứ, may mắn nhặt được rương thôi! Sao đồ ngon toàn rơi vào tay bọn con trai thế? Ả ta ghen ăn tức ở, lải nhải không ngừng.",
    17: "Thẩm Thành bước tới tát thẳng vào mặt Vương Tử Hàm: Mày nói cái gì? Cậu rút rìu kề sát cổ ả, lạnh lùng đe dọa: Tao ngứa mắt mày lâu rồi. Giờ không có luật pháp, tao chém chết mày lúc nào cũng được! Thấy sát khí ngập tràn, Vương Tử Hàm khóc thét van xin. Cả lớp sợ hãi im phăng phắc.",
    18: "Đang muốn dùng kỹ năng mới để thị uy thì ả lại tự đâm đầu vào họng súng. Cất rìu đi, Thẩm Thành bồi thêm vài bạt tai.",
    19: "Đánh gãy răng ả mới dừng tay, Diệp Uyển Hân khuyên: Muốn xử cô ta nên chọn chỗ vắng, ở lớp không tiện. Thẩm Thành đáp: Tùy biểu hiện của ả. Tớ không dại giết người công khai đâu. Về chỗ ngồi, hệ thống vang lên: Hôm nay thứ Ba, lớp trưởng Thẩm Thành hãy chọn bài tập. Bài tập 1: Lâm Dao, Thẩm Thành, Tô Dương, Mã Hiểu Lệ, Diệp...",
    20: "Uyển Hân làm bài tập đào tẩu trong 10 tiếng, một người truy sát, còn lại chạy trốn.",
    21: "Kẻ truy sát phải hạ hai người; người chạy trốn cần diệt kẻ truy sát hoặc sống sót.",
    22: "Tiếng đầu tiên cấm giết người. Thất bại sẽ bị xóa sổ. Bài tập 2: Thẩm Thành, Gia Hào, Hoàng Phàm, Lý Na, Thanh Tuyết quyết đấu sinh tử 10 tiếng, chỉ hai người được sống.",
    23: "Hết giờ chưa đạt chuẩn sẽ bị xóa sổ. Nhìn chữ máu trên bảng, mọi người chết lặng. Thẩm Thành u ám chọn Bài tập 1. Vì nếu chọn Bài tập 2 đấu sinh tử thì chỉ có cậu và Gia Hào sống sót. Diệp Uyển Hân cũng ở Bài tập 1, cậu sẽ hỗ trợ nếu cô không phải kẻ truy sát. Lựa chọn hoàn tất."
}

async def render_single(idx, text):
    mp3 = os.path.join(STORAGE_DIR, f"final_mp3_{idx}.mp3")
    trim = os.path.join(STORAGE_DIR, f"final_trim_{idx}.wav")
    final = os.path.join(STORAGE_DIR, f"final_wav_{idx}.wav")
    dst_seg = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    dst_000 = os.path.join(STORAGE_DIR, f"segment-{idx:03d}-voice.wav")
    dst_num = os.path.join(STORAGE_DIR, f"segment-{idx}-voice.wav")
    
    for attempt in range(1, 6):
        try:
            comm = edge_tts.Communicate(text, 'vi-VN-HoaiMyNeural')
            await comm.save(mp3)
            if os.path.exists(mp3) and os.path.getsize(mp3) > 500:
                break
        except Exception as e:
            if attempt == 5: raise e
            await asyncio.sleep(1.5 * attempt)
            
    subprocess.run(['ffmpeg', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse', '-ar', '24000', '-ac', '1', trim], capture_output=True, check=True)
    subprocess.run(['ffmpeg', '-y', '-i', trim, '-filter:a', 'atempo=1.0000', '-ar', '24000', '-ac', '1', final], capture_output=True, check=True)
    
    shutil.copy2(final, dst_seg)
    shutil.copy2(final, dst_000)
    shutil.copy2(final, dst_num)
    
    with wave.open(dst_seg, 'rb') as wf:
        dur = wf.getnframes() / wf.getframerate()
        
    for p in [mp3, trim, final]:
        try:
            if os.path.exists(p): os.remove(p)
        except Exception: pass
        
    print(f"Seg {idx:02d} DONE: {dur:.2f}s")
    return dur

async def main():
    for idx, text in concise_map.items():
        await render_single(idx, text)
    print("ALL REMAINING SEGMENTS (15 to 23) PROCESSED!")

if __name__ == "__main__":
    asyncio.run(main())
