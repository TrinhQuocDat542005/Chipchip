import sqlite3
import json
import os
import asyncio
import edge_tts
import subprocess
import wave
import shutil

STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

concise_map = {
    17: "Thẩm Thành bước tới tát thẳng vào mặt Vương Tử Hàm: Mày nói cái gì? Cậu rút rìu kề sát cổ ả, lạnh lùng đe dọa: Tao ngứa mắt mày lâu rồi. Giờ không có luật pháp, tao chém chết mày lúc nào cũng được! Thấy sát khí ngập tràn, Vương Tử Hàm khóc thét van xin. Cả lớp sợ hãi im phăng phắc.",
    18: "Đang muốn dùng kỹ năng mới để thị uy thì ả lại tự đâm đầu vào họng súng. Cất rìu đi, Thẩm Thành bồi thêm vài bạt tai.",
    19: "Đánh gãy răng ả mới dừng tay, Diệp Uyển Hân khuyên: Muốn xử cô ta nên chọn chỗ vắng, ở lớp không tiện. Thẩm Thành đáp: Tùy biểu hiện của ả. Tớ không dại giết người công khai đâu. Về chỗ ngồi, hệ thống vang lên: Hôm nay thứ Ba, lớp trưởng Thẩm Thành hãy chọn bài tập. Bài tập 1: Lâm Dao, Thẩm Thành, Tô Dương, Mã Hiểu Lệ, Diệp...",
    20: "Uyển Hân làm bài tập đào tẩu trong 10 tiếng, một người truy sát, còn lại chạy trốn.",
    21: "Kẻ truy sát phải hạ hai người; người chạy trốn cần diệt kẻ truy sát hoặc sống sót.",
    22: "Tiếng đầu tiên cấm giết người. Thất bại sẽ bị xóa sổ. Bài tập 2: Thẩm Thành, Gia Hào, Hoàng Phàm, Lý Na, Thanh Tuyết quyết đấu sinh tử 10 tiếng, chỉ hai người được sống.",
    23: "Hết giờ chưa đạt chuẩn sẽ bị xóa sổ. Nhìn chữ máu trên bảng, mọi người chết lặng. Thẩm Thành u ám chọn Bài tập 1. Vì nếu chọn Bài tập 2 đấu sinh tử thì chỉ có cậu và Gia Hào sống sót. Diệp Uyển Hân cũng ở Bài tập 1, cậu sẽ hỗ trợ nếu cô không phải kẻ truy sát. Lựa chọn hoàn tất."
}

async def render_17_23():
    for idx, text in sorted(concise_map.items()):
        mp3 = f"D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201/gen_{idx}.mp3"
        dst1 = f"D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201/segment-seg-{idx}-voice.wav"
        dst2 = f"D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201/segment-{idx:03d}-voice.wav"
        dst3 = f"D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201/segment-{idx}-voice.wav"
        
        for attempt in range(1, 6):
            try:
                comm = edge_tts.Communicate(text, 'vi-VN-HoaiMyNeural')
                await comm.save(mp3)
                if os.path.exists(mp3) and os.path.getsize(mp3) > 500:
                    break
            except Exception as e:
                if attempt == 5: raise e
                await asyncio.sleep(1.0 * attempt)
                
        # Convert directly to dst1
        subprocess.run(['ffmpeg', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse', '-ar', '24000', '-ac', '1', dst1], capture_output=True, check=True)
        shutil.copy2(dst1, dst2)
        shutil.copy2(dst1, dst3)
        
        with wave.open(dst1, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        print(f"Seg {idx:02d} written: {dur:.2f}s")
        if os.path.exists(mp3): os.remove(mp3)

asyncio.run(render_17_23())
