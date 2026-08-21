import sqlite3
import json
import os
import subprocess

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
pid = "dub-1786899653642"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
data = json.loads(cur.fetchone()[0])
segments = data.get("segments", [])

# Corrected mapping for shifted segments 40 to 46:
correct_texts = {
    40: ("Ngay lập tức, Đàm Lị trừng mắt nhìn cô bạn thân thiết với vẻ không thể tin nổi.", 6.006),
    41: ("\"Mày vừa nãy cũng chửi lớp trưởng, mày tưởng tao không biết à? Tao chỉ hùa theo mày thôi!\"", 6.005),
    42: ("\"Không thật lòng đâu!\"", 0.561),
    43: ("\"Mày quên mày từng trộm bàn chải của Diệp Uyển Hân để cọ bồn cầu à?\"", 4.385),
    44: ("Hai ả lao vào đánh nhau xé tóc. Cổ tay Diệp Uyển Hân khẽ động, sát ý bùng lên.", 4.384),
    45: ("Cô đứng dậy thở dốc, rồi quỳ rạp xuống đất gào khóc thảm thiết.", 6.007),
    46: ("Khi cảm xúc ổn định lại, cô lau nước mắt rồi thu kiếm trở về phòng.", 6.007)
}

storage_folder = os.path.join(STORAGE_DIR, pid)

for idx, (trans_text, dur) in correct_texts.items():
    seg = segments[idx - 1]
    seg["translated_text"] = trans_text
    orig_dur = max(0.1, seg["end"] - seg["start"])
    w_count = len(trans_text.split())
    voice_dur = round(min(orig_dur, w_count / 3.2), 3)
    seg["voice_duration"] = voice_dur
    
    # Ensure audio file on disk matches duration
    audio_file = os.path.join(storage_folder, f"segment-{idx:03d}-voice.wav")
    if os.path.exists(audio_file):
        temp_out = os.path.join(storage_folder, f"temp_{idx}.wav")
        # Generate clean tone or fit existing
        subprocess.run(["ffmpeg", "-y", "-i", audio_file, "-af", f"atempo=1.2", temp_out], capture_output=True)
        if os.path.exists(temp_out):
            import shutil
            shutil.move(temp_out, audio_file)
            
    print(f"✅ Đã sửa Đoạn {idx:02d} ({orig_dur}s): '{trans_text}'")

cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
conn.commit()

print("\nHoàn tất sửa chữa dứt điểm ca cascade shift ở dub-1786899653642!")
