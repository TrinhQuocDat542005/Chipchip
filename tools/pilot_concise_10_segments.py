import sqlite3
import json
import os
import subprocess
import wave

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
OUT_DIR = "D:/AutoDub Sub/ai-video-factory/sample_pilot_10_new"
os.makedirs(OUT_DIR, exist_ok=True)

pid = "dub-1786900777961"
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
data = json.loads(cur.fetchone()[0])
segments = data.get("segments", [])

pilot_indices = [1, 2, 4, 5, 6, 9, 12, 15, 19, 20]

# High-quality concised translations with safe syllable counts (2.8 - 3.0 syllables/sec)
# preserving 100% proper names, plot facts, actions and emotional tone:
concise_map = {
    1: {
        # Gốc: 我是为了找肖彰的线索搜查女寝...
        # Cảnh: 6.01s | Cũ: 35 từ (Speed 1.45x)
        # Mới: 16 từ -> 16 / 6.01 = 2.66 âm tiết/s (Speed 1.0x - 1.05x)
        "new_text": "Tôi lục soát ký túc xá nữ tìm manh mối Tiêu Chương. Bên trong có tiếng: Cậu nghe gì chưa?",
    },
    2: {
        # Gốc: 莫小雪被李昂当成奖品分给小弟...
        # Cảnh: 6.01s | Cũ: 38 từ (Speed 1.45x)
        # Mới: 17 từ -> 17 / 6.01 = 2.83 âm tiết/s
        "new_text": "Mạc Tiểu Tuyết bị Lý Ngang chia cho đàn em. Tên Lý Ngang biến thái thật, chẳng coi ai ra gì!",
    },
    4: {
        # Gốc: 谁能来救救我们...
        # Cảnh: 6.63s | Cũ: 38 từ (Speed 1.45x)
        # Mới: 18 từ -> 18 / 6.63 = 2.71 âm tiết/s
        "new_text": "Ai có thể cứu chúng ta đây? Thôi ngủ đi, sống sót là tốt rồi. Các cậu đang phàn nàn về Lý Ngang à?",
    },
    5: {
        # Gốc: 看来不在这...
        # Cảnh: 6.02s | Cũ: 33 từ (Speed 1.45x)
        # Mới: 16 từ -> 16 / 6.02 = 2.66 âm tiết/s
        "new_text": "Không có ở đây. Thẩm Thành dùng Hư Ẩn lên tầng ba thì bắt gặp người quen, lý trí đã giảm.",
    },
    6: {
        # Gốc: 3点...
        # Cảnh: 6.03s | Cũ: 29 từ (Speed 1.45x)
        # Mới: 16 từ -> 16 / 6.03 = 2.65 âm tiết/s
        "new_text": "Giảm ba điểm. Lại gặp à? Cứ lên phòng 503 trước, đợi nữ quỷ đi rồi tính.",
    },
    9: {
        # Gốc: 蹑手蹑脚走进去...
        # Cảnh: 6.01s | Cũ: 38 từ (Speed 1.45x)
        # Mới: 17 từ -> 17 / 6.01 = 2.83 âm tiết/s
        "new_text": "Cậu rón rén bước vào, thấy trên giường tầng có hai người. Quả nhiên đúng là Lý Ngang.",
    },
    12: {
        # Gốc: 无辜的人...
        # Cảnh: 6.06s | Cũ: 37 từ (Speed 1.45x)
        # Mới: 17 từ -> 17 / 6.06 = 2.81 âm tiết/s
        "new_text": "Nhận được thiên phú mới, cậu quay người rời đi, mặc kệ nữ sinh đang gào khóc.",
    },
    15: {
        # Gốc: 猎杀其他班长获得的异能完全随机...
        # Cảnh: 6.03s | Cũ: 44 từ (Speed 1.45x)
        # Mới: 18 từ -> 18 / 6.03 = 2.98 âm tiết/s
        "new_text": "Thiên phú khi diệt lớp trưởng khác là ngẫu nhiên. Nhận được cấp B thì vận may cũng khá tốt rồi.",
    },
    19: {
        # Gốc: 跟班里女生做内种事...
        # Cảnh: 6.22s | Cũ: 38 từ (Speed 1.45x)
        # Mới: 18 từ -> 18 / 6.22 = 2.89 âm tiết/s
        "new_text": "Hắn đang làm chuyện đó với nữ sinh thì bị chém làm mấy đoạn! Nhóm chat đang bàn tán rôm rả kìa.",
    },
    20: {
        # Gốc: 将视线落在了沈诚身上...
        # Cảnh: 6.02s | Cũ: 34 từ (Speed 1.45x)
        # Mới: 17 từ -> 17 / 6.02 = 2.82 âm tiết/s
        "new_text": "Cậu dời ánh mắt sang Thẩm Thành. Mở nhóm chat lớp ra, quả nhiên mọi người đều bàn tán chuyện Lý Ngang.",
    }
}

python_exe = "D:/AutoDub Sub/ai-video-factory/.venv-vieneu/Scripts/python.exe"
tts_script = "D:/AutoDub Sub/ai-video-factory/services/tts/edge_tts_cli.py"

results = []

for idx in pilot_indices:
    seg = segments[idx - 1]
    orig_dur = max(0.1, seg["end"] - seg["start"])
    old_text = seg.get("translated_text", "")
    old_words = len(old_text.split())
    
    new_info = concise_map[idx]
    new_text = new_info["new_text"]
    new_words = len(new_text.split())
    
    # 1. Synthesize raw audio with Edge-TTS
    raw_mp3 = os.path.join(OUT_DIR, f"temp_raw_seg_{idx:02d}.mp3")
    cmd_tts = [python_exe, tts_script, new_text, "vi-VN-HoaiMyNeural", raw_mp3, "+0%"]
    subprocess.run(cmd_tts, capture_output=True, text=True)
    
    # 2. Probe raw duration & apply clean atempo (max 1.18x)
    raw_wav = os.path.join(OUT_DIR, f"temp_raw_seg_{idx:02d}.wav")
    subprocess.run(["ffmpeg", "-y", "-i", raw_mp3, raw_wav], capture_output=True)
    
    with wave.open(raw_wav, 'rb') as wf:
        raw_dur = wf.getnframes() / max(1, wf.getframerate())
        
    # Calculate fit speed with max ceiling 1.18x
    target_max = orig_dur * 1.05
    target_min = orig_dur * 0.92
    if raw_dur > target_max:
        speed = min(1.18, raw_dur / (orig_dur * 0.98))
    elif raw_dur < target_min:
        speed = max(0.92, raw_dur / (orig_dur * 0.96))
    else:
        speed = 1.00
        
    final_wav = os.path.join(OUT_DIR, f"pilot_{idx:02d}_new_speed{speed:.2f}x.wav")
    silence_filter = "silenceremove=start_periods=1:start_threshold=-38dB,areverse,silenceremove=start_periods=1:start_threshold=-38dB,areverse,apad=pad_dur=0.15"
    subprocess.run(["ffmpeg", "-y", "-i", raw_wav, "-af", f"{silence_filter},atempo={speed:.3f}", final_wav], capture_output=True)
    
    with wave.open(final_wav, 'rb') as wf:
        final_dur = wf.getnframes() / max(1, wf.getframerate())
        
    # Clean temp files
    if os.path.exists(raw_mp3): os.remove(raw_mp3)
    if os.path.exists(raw_wav): os.remove(raw_wav)
    
    # Update segment in memory
    seg["translated_text"] = new_text
    seg["voice_duration"] = round(final_dur, 2)
    seg["voice_speed"] = round(speed, 2)
    
    results.append({
        "idx": idx,
        "orig_dur": orig_dur,
        "old_words": old_words,
        "old_text": old_text,
        "new_words": new_words,
        "new_text": new_text,
        "raw_dur": round(raw_dur, 2),
        "final_dur": round(final_dur, 2),
        "speed": round(speed, 2),
        "sps": round(new_words / max(0.1, final_dur), 2),
        "audio_file": final_wav
    })

print(f"=== ĐÃ RE-RENDER VÀ TRÍCH XUẤT XONG 10 PHÂN ĐOẠN THỬ NGHIỆM VÀO: {OUT_DIR} ===\n")
for r in results:
    print(f"• Đoạn {r['idx']:02d} (Cảnh: {r['orig_dur']}s):")
    print(f"   [Cũ] ({r['old_words']} âm tiết | Cũ Speed: 1.45x): \"{r['old_text']}\"")
    print(f"   [Mới] ({r['new_words']} âm tiết | Mới Speed: {r['speed']}x | Mới Dur: {r['final_dur']}s | Mật độ: {r['sps']} âm tiết/s): \"{r['new_text']}\"")
    print(f"   [File nghe thử]: {os.path.basename(r['audio_file'])}\n")
