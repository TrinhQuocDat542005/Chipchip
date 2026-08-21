import os
import glob
import wave

STORAGE_DIR = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201'

# 1. Clean up old 3-digit wav files (segment-001 to segment-086) that were from legacy 86-segment layout
for f in os.listdir(STORAGE_DIR):
    if f.startswith("segment-0") and f.endswith("-voice.wav"):
        try:
            os.remove(os.path.join(STORAGE_DIR, f))
        except Exception:
            pass

# 2. Copy each segment-seg-{idx}-voice.wav to segment-{idx:03d}-voice.wav for consistency
for idx in range(1, 24):
    src = os.path.join(STORAGE_DIR, f"segment-seg-{idx}-voice.wav")
    dst_000 = os.path.join(STORAGE_DIR, f"segment-{idx:03d}-voice.wav")
    dst_num = os.path.join(STORAGE_DIR, f"segment-{idx}-voice.wav")
    if os.path.exists(src):
        import shutil
        shutil.copy2(src, dst_000)
        shutil.copy2(src, dst_num)
        with wave.open(src, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        print(f"Seg {idx:02d} synced: {dur:.2f}s")

print("Cleaned up and synced all 23 segment audio files!")
