import subprocess
import os

STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201"
SRC_VIDEO = os.path.join(STORAGE_DIR, "source.mp4")
OUT_SAMPLE = os.path.join(STORAGE_DIR, "sample_watermark_blurred.mp4")
OUT_FRAME_SAMPLE = "D:/AutoDub Sub/ai-video-factory/tools/blur_tests/sample_blurred_output_frame.png"

# Filter:
# 1. Blur top-left logo (x=0%, y=0%, w=34%, h=20%)
# 2. Blur bottom subtitles (x=0%, y=70%, w=100%, h=30%)
# 3. Burn Vietnamese subtitles from translated.srt (if needed)

# Let's test on 30 seconds of video
w = 1280
h = 720
logo_w = int(w * 0.34) # 435px
logo_h = int(h * 0.20) # 144px
logo_strength = 24

sub_y = int(h * 0.70) # 504px
sub_h = int(h * 0.30) # 216px
sub_strength = 12

filter_complex = (
    f"[0:v]split=2[vbase][vlogo];"
    f"[vlogo]crop=w={logo_w}:h={logo_h}:x=0:y=0,boxblur=luma_radius={logo_strength}:luma_power=3:chroma_radius=12:chroma_power=2[vlogo_blur];"
    f"[vbase][vlogo_blur]overlay=x=0:y=0[vclean_logo];"
    f"[vclean_logo]split=2[vclean_base][vsub];"
    f"[vsub]crop=w={w}:h={sub_h}:x=0:y={sub_y},boxblur=luma_radius={sub_strength}:luma_power=2[vsub_blur];"
    f"[vclean_base][vsub_blur]overlay=x=0:y={sub_y}[vclean_all]"
)

cmd = [
    "ffmpeg", "-y", "-ss", "00:00:00", "-to", "00:00:20",
    "-i", SRC_VIDEO,
    "-filter_complex", filter_complex,
    "-map", "[vclean_all]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "copy",
    OUT_SAMPLE
]

print("Rendering sample video with top-left watermark blur...")
subprocess.run(cmd, check=True)
print(f"Rendered: {OUT_SAMPLE}")

# Extract sample frame at 5.0s
subprocess.run([
    "ffmpeg", "-y", "-ss", "00:00:05", "-i", OUT_SAMPLE,
    "-vframes", "1", "-q:v", "2", OUT_FRAME_SAMPLE
], check=True)
print(f"Extracted sample frame: {OUT_FRAME_SAMPLE}")
