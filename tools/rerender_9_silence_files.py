import sqlite3
import json
import os
import subprocess

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
storage_dir = "d:/AutoDub Sub/ai-video-factory/storage"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 9 target files identified:
target_items = [
    ("dub-1786732340533", 35, "segment-035-voice.wav"),
    ("dub-1786732340533", 240, "segment-035-voice.wav"),
    ("dub-1786732340533", 110, "segment-110-voice.wav"),
    ("dub-1786732340533", 17, "segment-017-voice.wav"),
    ("dub-1786732340533", 19, "segment-019-voice.wav"),
    ("dub-1786732340533", 157, "segment-019-voice.wav"),
    ("dub-1786899653642", 18, "segment-018-voice.wav"),
    ("dub-1786732340533-part-02", 123, "segment-123-voice.wav"),
    ("dub-1786451618263", 4, "segment-4-voice.wav")
]

print("================================================================================")
print("=== TIẾN HÀNH FIX & RE-RENDER 9 FILE DÍNH SILENCE RÁC ===")
print("================================================================================\n")

for pid, seg_idx, filename in target_items:
    file_path = os.path.join(storage_dir, pid, filename)
    if not os.path.exists(file_path):
        print(f"Không tìm thấy {file_path}")
        continue
        
    temp_clean = os.path.join(storage_dir, pid, f"temp_{filename}")
    filter_str = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-38dB,areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-38dB,areverse,apad=pad_dur=0.18"
    
    subprocess.run(["ffmpeg", "-y", "-i", file_path, "-af", filter_str, temp_clean], capture_output=True)
    
    if os.path.exists(temp_clean) and os.path.getsize(temp_clean) > 0:
        # Get new duration
        res = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', temp_clean], capture_output=True, text=True)
        new_dur = float(res.stdout.strip()) if res.stdout.strip() else 0.0
        
        # Replace original file
        import shutil
        shutil.move(temp_clean, file_path)
        
        # Update database
        cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
        row = cur.fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            segs = data.get("segments", [])
            if seg_idx <= len(segs):
                old_dur = segs[seg_idx - 1].get("voice_duration")
                segs[seg_idx - 1]["voice_duration"] = round(new_dur, 3)
                cur.execute("UPDATE dubbing_projects SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), pid))
                conn.commit()
                print(f"✅ Đã fix [{pid}] Đoạn {seg_idx:03d} ({filename}): Thời lượng cũ = {old_dur}s -> Mới = {new_dur:.3f}s")
                
print("\nHoàn tất re-render & cập nhật database cho 9 file!")
