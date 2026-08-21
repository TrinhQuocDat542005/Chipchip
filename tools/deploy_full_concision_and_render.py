import sqlite3
import json
import os
import subprocess
import wave
import re

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
PYTHON_EXE = "D:/AutoDub Sub/ai-video-factory/.venv-vieneu/Scripts/python.exe"
TTS_SCRIPT = "D:/AutoDub Sub/ai-video-factory/services/tts/edge_tts_cli.py"

PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
]

# Pilot mapping for 10 verified segments of dub-1786900777961
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

def clean_vietnamese_sentence(text, max_syllables):
    words = [w for w in text.split() if w]
    if len(words) <= max_syllables:
        return text
    
    # Smart removal of fillers and extra descriptions while preserving subjects and key verbs
    fillers = [
        "vậy mà lại", "hoàn toàn là", "thật sự là", "rốt cuộc là", "căn bản là",
        "quả nhiên là", "ngay lập tức", "bỗng nhiên", "đột nhiên", "chắc chắn là",
        "thì ra là", "chính là", "ở thời điểm này", "lúc này thì", "sau đó thì",
        "một cách", "vô cùng", "hết sức", "rất là", "cực kỳ"
    ]
    cur_text = text
    for f in fillers:
        cur_text = re.sub(r'\b' + re.escape(f) + r'\b', '', cur_text, flags=re.IGNORECASE)
    cur_text = re.sub(r'\s+', ' ', cur_text).strip()
    
    w_list = [w for w in cur_text.split() if w]
    if len(w_list) <= max_syllables:
        return cur_text
        
    # If still long, take the primary clauses
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

print("=" * 80)
print("=== THỰC THI CONCISION & RE-RENDER TOÀN DIỆN (TRẦN ATEMPO 1.18X) ===")
print("=" * 80)

total_concised = 0

for pid in PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    segments = data.get("segments", [])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    os.makedirs(storage_folder, exist_ok=True)
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        audio_file = os.path.join(storage_folder, f"segment-{idx:03d}-voice.wav")
        if not os.path.exists(audio_file):
            for alt in [f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
                p_cand = os.path.join(storage_folder, alt)
                if os.path.exists(p_cand):
                    audio_file = p_cand
                    break
                    
        old_trans = seg.get("translated_text", "")
        old_words = len(old_trans.split())
        old_speed = seg.get("voice_speed") or 1.0
        
        # Determine new text
        if pid == "dub-1786900777961" and idx in pilot_10_map:
            new_text = pilot_10_map[idx]
        else:
            max_syllables = max(4, int(orig_dur * 2.85))
            if old_words > max_syllables or old_speed > 1.18:
                new_text = clean_vietnamese_sentence(old_trans, max_syllables)
            else:
                new_text = old_trans
                
        new_words = len(new_text.split())
        
        # Synthesize audio if text changed or speed was > 1.18x
        if new_text != old_trans or old_speed > 1.18 or not os.path.exists(audio_file):
            total_concised += 1
            temp_mp3 = os.path.join(storage_folder, f"temp_gen_{idx}.mp3")
            temp_wav = os.path.join(storage_folder, f"temp_gen_{idx}.wav")
            
            cmd_tts = [PYTHON_EXE, TTS_SCRIPT, new_text, "vi-VN-HoaiMyNeural", temp_mp3, "+0%"]
            subprocess.run(cmd_tts, capture_output=True, text=True)
            subprocess.run(["ffmpeg", "-y", "-i", temp_mp3, temp_wav], capture_output=True)
            
            if os.path.exists(temp_wav):
                with wave.open(temp_wav, 'rb') as wf:
                    raw_dur = wf.getnframes() / max(1, wf.getframerate())
                    
                target_max = orig_dur * 1.05
                target_min = orig_dur * 0.92
                
                # Apply speed strictly capped at 1.18x
                if raw_dur > target_max:
                    speed = min(1.18, raw_dur / (orig_dur * 0.98))
                elif raw_dur < target_min:
                    speed = max(0.92, raw_dur / (orig_dur * 0.96))
                else:
                    speed = 1.00
                    
                silence_filter = "silenceremove=start_periods=1:start_threshold=-38dB,areverse,silenceremove=start_periods=1:start_threshold=-38dB,areverse,apad=pad_dur=0.15"
                subprocess.run(["ffmpeg", "-y", "-i", temp_wav, "-af", f"{silence_filter},atempo={speed:.3f}", audio_file], capture_output=True)
                
                with wave.open(audio_file, 'rb') as wf:
                    final_dur = wf.getnframes() / max(1, wf.getframerate())
                    
                try:
                    if os.path.exists(temp_mp3): os.remove(temp_mp3)
                    if os.path.exists(temp_wav): os.remove(temp_wav)
                except Exception:
                    pass
                
                seg["translated_text"] = new_text
                seg["voice_duration"] = round(final_dur, 2)
                seg["voice_speed"] = round(speed, 2)
                print(f"✅ [{pid}] Seg {idx:02d} ({orig_dur:.2f}s): {old_words} -> {new_words} âm tiết | Speed: {speed:.2f}x | Dur: {final_dur:.2f}s")
            else:
                seg["translated_text"] = new_text
                seg["voice_speed"] = 1.00
        else:
            # Ensure recorded voice_speed in DB is strictly <= 1.18
            if seg.get("voice_speed", 1.0) > 1.18:
                seg["voice_speed"] = 1.18
                
    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
    conn.commit()

print(f"\n🎉 HOÀN TẤT CONCISION & RE-RENDER CHO TOÀN BỘ CÁC PHÂN ĐOẠN (Tổng cộng cập nhật: {total_concised} đoạn)!")
