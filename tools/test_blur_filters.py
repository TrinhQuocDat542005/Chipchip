import subprocess
import os

SAMPLE_FRAME = "D:/AutoDub Sub/ai-video-factory/tools/sample_frames/frame_dub-1786897570201.png"
OUT_DIR = "D:/AutoDub Sub/ai-video-factory/tools/blur_tests"
os.makedirs(OUT_DIR, exist_ok=True)

# 1. Test Delogo Filter
out_delogo = os.path.join(OUT_DIR, "test_delogo.png")
subprocess.run([
    "ffmpeg", "-y", "-i", SAMPLE_FRAME,
    "-vf", "delogo=x=15:y=15:w=295:h=95:show=0",
    out_delogo
], capture_output=True)

# 2. Test Boxblur Filter (Crop + Boxblur + Overlay)
out_boxblur = os.path.join(OUT_DIR, "test_boxblur.png")
subprocess.run([
    "ffmpeg", "-y", "-i", SAMPLE_FRAME,
    "-filter_complex", "[0:v]split=2[vbase][vlogo];[vlogo]crop=w=310:h=105:x=10:y=10,boxblur=luma_radius=20:luma_power=2:chroma_radius=10:chroma_power=1[vblur];[vbase][vblur]overlay=x=10:y=10",
    out_boxblur
], capture_output=True)

# 3. Test Smooth Masked Blur (No hard border edges)
# We can create a soft-edged mask or use gblur/boxblur
out_smooth = os.path.join(OUT_DIR, "test_smooth_boxblur.png")
subprocess.run([
    "ffmpeg", "-y", "-i", SAMPLE_FRAME,
    "-filter_complex", "[0:v]split=2[vbase][vlogo];[vlogo]crop=w=320:h=110:x=8:y=8,boxblur=luma_radius=16:luma_power=3[vblur];[vbase][vblur]overlay=x=8:y=8",
    out_smooth
], capture_output=True)

print("Rendered blur tests!")
