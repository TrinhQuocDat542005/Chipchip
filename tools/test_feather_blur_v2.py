import subprocess
import os
import numpy as np
from PIL import Image

OUT_DIR = "D:/AutoDub Sub/ai-video-factory/tools/blur_tests"
SAMPLE_FRAME = "D:/AutoDub Sub/ai-video-factory/tools/sample_frames/frame_dub-1786897570201.png"

# Generate a smooth gradient feather alpha mask image (1280x720)
mask_img = np.zeros((720, 1280), dtype=np.uint8)

box_w = 425
box_h = 135
feather = 30

for y in range(720):
    for x in range(1280):
        if x < box_w and y < box_h:
            alpha_x = 1.0
            if x > box_w - feather:
                alpha_x = (box_w - x) / feather
            alpha_y = 1.0
            if y > box_h - feather:
                alpha_y = (box_h - y) / feather
            alpha = alpha_x * alpha_y
            mask_img[y, x] = int(alpha * 255)

mask_path = os.path.join(OUT_DIR, "feather_mask_v2.png")
Image.fromarray(mask_img).save(mask_path)

out_feathered = os.path.join(OUT_DIR, "test_feathered_blur_v2.png")
subprocess.run([
    "ffmpeg", "-y", "-i", SAMPLE_FRAME, "-i", mask_path,
    "-filter_complex",
    "[0:v]boxblur=luma_radius=24:luma_power=3:chroma_radius=12:chroma_power=2[vblur];[0:v][vblur][1:v]maskedmerge[vout]",
    "-map", "[vout]",
    out_feathered
], capture_output=True)

res = Image.open(out_feathered).crop((0, 0, 480, 180))
res.save(os.path.join(OUT_DIR, "crop_feathered_blur_v2.png"))
print("Saved crop_feathered_blur_v2.png!")
