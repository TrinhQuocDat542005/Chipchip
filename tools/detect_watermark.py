import os
import subprocess
import numpy as np
from PIL import Image

STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
OUT_DIR = "D:/AutoDub Sub/ai-video-factory/tools/watermark_analysis"
os.makedirs(OUT_DIR, exist_ok=True)

# Test on 3 projects
pids = ["dub-1786897570201", "dub-1786900777961", "dub-1786732340533-part-01"]

for pid in pids:
    src_path = os.path.join(STORAGE_DIR, pid, "source.mp4")
    if not os.path.exists(src_path):
        continue
        
    frames = []
    # Extract 5 frames at 5s, 15s, 25s, 35s, 45s
    for t in [5, 15, 25, 35, 45]:
        out_f = os.path.join(OUT_DIR, f"{pid}_{t}s.png")
        cmd = ["ffmpeg", "-y", "-ss", str(t), "-i", src_path, "-vframes", "1", "-q:v", "2", out_f]
        subprocess.run(cmd, capture_output=True)
        if os.path.exists(out_f):
            img = Image.open(out_f).convert("RGB")
            # Crop top-left (350x150)
            crop = img.crop((0, 0, 350, 150))
            frames.append(np.array(crop, dtype=np.float32))
            
    if len(frames) >= 2:
        # Standard deviation across frames: static logo will have lower variance or high minimum brightness
        stack = np.stack(frames, axis=0) # (N, H, W, C)
        var = np.std(stack, axis=0).mean(axis=-1) # (H, W)
        
        # Save visualization
        min_f = np.min(stack, axis=0).astype(np.uint8)
        Image.fromarray(min_f).save(os.path.join(OUT_DIR, f"{pid}_min.png"))
        
        print(f"--- Project {pid} (1280x720) ---")
        # Find where logo exists by examining pixel brightness in min frame
        # Bilibili logo is usually white/translucent with text at top-left
        # Let's check non-zero pixels or inspect image
