import os
import glob
from PIL import Image

FRAME_DIR = "D:/AutoDub Sub/ai-video-factory/tools/sample_frames"
CROPS_DIR = "D:/AutoDub Sub/ai-video-factory/tools/sample_crops"
os.makedirs(CROPS_DIR, exist_ok=True)

frames = glob.glob(os.path.join(FRAME_DIR, "*.png"))

for f in frames:
    bn = os.path.basename(f)
    img = Image.open(f)
    w, h = img.size
    print(f"File: {bn} | Resolution: {w}x{h}")
    
    # Let's crop top-left area: x from 0 to 25% width, y from 0 to 18% height
    crop_w = int(w * 0.25)
    crop_h = int(h * 0.18)
    crop_box = (0, 0, crop_w, crop_h)
    cropped = img.crop(crop_box)
    out_crop = os.path.join(CROPS_DIR, f"topleft_{bn}")
    cropped.save(out_crop)
    print(f"  Saved top-left crop ({crop_w}x{crop_h}) to {out_crop}")
