import edge_tts
import asyncio
import subprocess
import wave
import os
import shutil

STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

concise_map = {
    21: "Kẻ truy sát phải hạ hai người; người chạy trốn cần diệt kẻ truy sát hoặc sống sót.",
    22: "Tiếng đầu tiên cấm giết người. Thất bại sẽ bị xóa sổ. Bài tập 2: Thẩm Thành, Gia Hào, Hoàng Phàm, Lý Na, Thanh Tuyết quyết đấu sinh tử 10 tiếng, chỉ hai người được sống.",
    23: "Hết giờ chưa đạt chuẩn sẽ bị xóa sổ. Nhìn chữ máu trên bảng, mọi người chết lặng. Thẩm Thành u ám chọn Bài tập 1. Vì nếu chọn Bài tập 2 đấu sinh tử thì chỉ có cậu và Gia Hào sống sót. Diệp Uyển Hân cũng ở Bài tập 1, cậu sẽ hỗ trợ nếu cô không phải kẻ truy sát. Lựa chọn hoàn tất."
}

async def render_21_23():
    for idx, text in sorted(concise_map.items()):
        temp_mp3 = f"temp_{idx}.mp3"
        dst1 = f"{STORAGE_DIR}/segment-seg-{idx}-voice.wav"
        dst2 = f"{STORAGE_DIR}/segment-{idx:03d}-voice.wav"
        dst3 = f"{STORAGE_DIR}/segment-{idx}-voice.wav"
        
        for attempt in range(1, 10):
            try:
                comm = edge_tts.Communicate(text, 'vi-VN-HoaiMyNeural')
                await comm.save(temp_mp3)
                if os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 500:
                    break
            except Exception as e:
                print(f"Retry {attempt} for Seg {idx}...")
                await asyncio.sleep(2.0 * attempt)
                
        subprocess.run([
            'ffmpeg', '-y', '-i', temp_mp3,
            '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:detection=peak,areverse',
            '-ar', '24000', '-ac', '1', dst1
        ], check=True)
        
        shutil.copy2(dst1, dst2)
        shutil.copy2(dst1, dst3)
        
        with wave.open(dst1) as wf:
            dur = wf.getnframes() / 24000
        print(f"Seg {idx:02d} rendered: {dur:.2f}s")
        if os.path.exists(temp_mp3): os.remove(temp_mp3)

asyncio.run(render_21_23())
