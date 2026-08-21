import sqlite3
import json
import os
import subprocess
import wave
import sys
from google import genai

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

# Initialize Gemini client if key available
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

def concise_with_llm(orig_text, trans_text, orig_dur):
    max_syllables = max(4, int(orig_dur * 3.0))
    current_syllables = len(trans_text.split())
    if current_syllables <= max_syllables:
        return trans_text
        
    prompt = f"""Rút gọn câu dịch phụ đề/lồng tiếng tiếng Việt sau đây sao cho thật tự nhiên, lưu loát, TUYỆT ĐỐI KHÔNG QUÁ {max_syllables} âm tiết (từ).
Yêu cầu bắt buộc:
1. Giữ nguyên 100% tên nhân vật, địa danh, con số và diễn biến hành động chính.
2. Lược bỏ từ đệm, từ thừa, câu rườm rà.
3. Độ dài tối đa: {max_syllables} từ (âm tiết).
4. Chỉ trả về duy nhất câu đã rút gọn, không giải thích gì thêm.

Câu gốc tiếng Trung: {orig_text}
Bản dịch hiện tại: {trans_text}
Câu rút gọn:"""
    
    if client:
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            res_text = response.text.strip().strip('"').strip("'")
            if res_text and len(res_text.split()) <= max_syllables + 2:
                return res_text
        except Exception as e:
            print(f"  [LLM Error]: {e}, using heuristic truncation")
            
    # Heuristic fallback if LLM is unreachable
    words = trans_text.split()
    return " ".join(words[:max_syllables])

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

print("=" * 80)
print("=== TIẾN HÀNH CONCISION VÀ RE-RENDER TOÀN BỘ CÁC ĐOẠN > 1.15X (TRẦN 1.18X) ===")
print("=" * 80)

total_processed = 0

for pid in PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    segments = data.get("segments", [])
    storage_folder = os.path.join(STORAGE_DIR, pid)
    os.makedirs(storage_folder, exist_ok=True)
    
    project_updated = False
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        audio_file = None
        for pattern in [f"segment-{idx:03d}-voice.wav", f"segment-{idx}-voice.wav", f"dub-work/preview-{idx:03d}.wav"]:
            p_cand = os.path.join(storage_folder, pattern)
            if os.path.exists(p_cand):
                audio_file = p_cand
                break
        if not audio_file:
            audio_file = os.path.join(storage_folder, f"segment-{idx:03d}-voice.wav")
            
        trans_text = seg.get("translated_text", "")
        words = len(trans_text.split())
        wps = words / max(0.1, orig_dur)
        speed = seg.get("voice_speed") or 1.0
        
        # Target for concision: if wps > 3.2 or speed > 1.15
        if wps > 3.2 or speed > 1.15:
            total_processed += 1
            src_text = seg.get("source_text", "")
            
            # Step 1: Concise text
            concised_text = concise_with_llm(src_text, trans_text, orig_dur)
            new_words = len(concised_text.split())
            
            # Step 2: Render audio with Edge-TTS
            temp_mp3 = os.path.join(storage_folder, f"temp_pilot_{idx}.mp3")
            temp_wav = os.path.join(storage_folder, f"temp_pilot_{idx}.wav")
            
            cmd_tts = [PYTHON_EXE, TTS_SCRIPT, concised_text, "vi-VN-HoaiMyNeural", temp_mp3, "+0%"]
            subprocess.run(cmd_tts, capture_output=True, text=True)
            subprocess.run(["ffmpeg", "-y", "-i", temp_mp3, temp_wav], capture_output=True)
            
            if os.path.exists(temp_wav):
                with wave.open(temp_wav, 'rb') as wf:
                    raw_dur = wf.getnframes() / max(1, wf.getframerate())
                    
                target_max = orig_dur * 1.05
                target_min = orig_dur * 0.92
                
                # Apply strictly capped 1.18x speed
                if raw_dur > target_max:
                    applied_speed = min(1.18, raw_dur / (orig_dur * 0.98))
                elif raw_dur < target_min:
                    applied_speed = max(0.92, raw_dur / (orig_dur * 0.96))
                else:
                    applied_speed = 1.00
                    
                silence_filter = "silenceremove=start_periods=1:start_threshold=-38dB,areverse,silenceremove=start_periods=1:start_threshold=-38dB,areverse,apad=pad_dur=0.15"
                subprocess.run(["ffmpeg", "-y", "-i", temp_wav, "-af", f"{silence_filter},atempo={applied_speed:.3f}", audio_file], capture_output=True)
                
                with wave.open(audio_file, 'rb') as wf:
                    final_dur = wf.getnframes() / max(1, wf.getframerate())
                    
                if os.path.exists(temp_mp3): os.remove(temp_mp3)
                if os.path.exists(temp_wav): os.remove(temp_wav)
                
                seg["translated_text"] = concised_text
                seg["voice_duration"] = round(final_dur, 2)
                seg["voice_speed"] = round(applied_speed, 2)
                project_updated = True
                
                print(f"[{pid}] Seg {idx:02d} ({orig_dur:.2f}s): {words} -> {new_words} âm tiết | Speed: {applied_speed:.2f}x | Final Dur: {final_dur:.2f}s")
                print(f"   Dịch mới: \"{concised_text}\"\n")
                
    if project_updated:
        cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
        conn.commit()

print(f"\n✅ ĐÃ HOÀN TẤT CONCISION VÀ RE-RENDER CHO TOÀN BỘ {total_processed} PHÂN ĐOẠN!")
