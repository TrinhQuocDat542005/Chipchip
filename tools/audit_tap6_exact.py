import sqlite3
import json
import os
import wave

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

print("==============================================================================================================")
print(f"{'Seg':<5} | {'Slot (s)':<9} | {'WAV Đĩa (s)':<12} | {'DB Duration (s)':<16} | {'Độ Lệch':<10} | {'Trạng Thái UI Timeline':<22} | {'Text Rút Gọn'}")
print("==============================================================================================================")

has_discrepancy = False
timeline_blocks = []

for idx, seg in enumerate(segments, 1):
    orig_dur = max(0.1, seg["end"] - seg["start"])
    voice_url = seg.get("voice_url") or f"segment-seg-{idx}-voice.wav"
    wav_path = os.path.join(STORAGE_DIR, os.path.basename(voice_url))
    
    if not os.path.exists(wav_path):
        wav_path = os.path.join(STORAGE_DIR, f"segment-{idx:03d}-voice.wav")
        
    with wave.open(wav_path, 'rb') as wf:
        actual_wav_dur = wf.getnframes() / wf.getframerate()
        
    db_dur = seg.get("voice_duration", 0)
    diff = abs(actual_wav_dur - db_dur)
    
    # Sync if discrepancy > 0.005s
    if diff > 0.005:
        has_discrepancy = True
        seg["voice_duration"] = round(actual_wav_dur, 3)
        
    is_fit = actual_wav_dur <= (orig_dur + 0.05)
    ui_status = "🟢 Sẵn Sàng (Vừa)" if is_fit else f"🔴 Tràn (+{actual_wav_dur-orig_dur:.2f}s)"
    diff_str = f"{diff:.4f}s" if diff > 0.0001 else "0.0000s (Khớp 100%)"
    
    timeline_blocks.append({
        "seg": idx,
        "slot": orig_dur,
        "wav": actual_wav_dur,
        "db": db_dur,
        "status": ui_status,
        "text": seg.get("translated_text", "")
    })
    
    txt = seg.get("translated_text", "")[:35]
    print(f"{idx:02d}    | {orig_dur:6.2f}s   | {actual_wav_dur:8.3f}s    | {db_dur:10.3f}s     | {diff_str:<10} | {ui_status:<22} | {txt}...")

if has_discrepancy:
    cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = 'dub-1786897570201'", (json.dumps(data, ensure_ascii=False),))
    conn.commit()
    print("\n✅ ĐÃ ĐỒNG BỘ TUYỆT ĐỐI TOÀN BỘ GIÁ TRỊ voice_duration VÀO SQLITE DATABASE!")
else:
    print("\n✅ TẤT CẢ 23 ĐOẠN KHỚP 100% GIỮA FILE ĐĨA VÀ DATABASE!")
