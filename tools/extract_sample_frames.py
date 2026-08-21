import os
import subprocess
import glob

STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"
OUT_FRAME_DIR = "D:/AutoDub Sub/ai-video-factory/tools/sample_frames"
os.makedirs(OUT_FRAME_DIR, exist_ok=True)

# Find several sample source videos
sample_sources = [
    "dub-1786897570201/source.mp4",
    "dub-1786898959225/source.mp4",
    "dub-1786899653642/source.mp4",
    "dub-1786900777961/source.mp4",
    "dub-1786732340533-part-01/source.mp4",
]

for src_rel in sample_sources:
    src_path = os.path.join(STORAGE_DIR, src_rel)
    if not os.path.exists(src_path):
        continue
    pid = src_rel.split("/")[0]
    out_img = os.path.join(OUT_FRAME_DIR, f"frame_{pid}.png")
    # extract frame at 5.0s
    cmd = [
        "ffmpeg", "-y", "-ss", "00:00:05", "-i", src_path,
        "-vframes", "1", "-q:v", "2", out_img
    ]
    subprocess.run(cmd, capture_output=True)
    print(f"Extracted: {out_img}")

print("Done extracting sample frames!")
