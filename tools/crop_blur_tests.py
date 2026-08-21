from PIL import Image
import os

OUT_DIR = "D:/AutoDub Sub/ai-video-factory/tools/blur_tests"
for name in ["test_delogo.png", "test_boxblur.png", "test_smooth_boxblur.png"]:
    p = os.path.join(OUT_DIR, name)
    img = Image.open(p)
    crop = img.crop((0, 0, 400, 160))
    crop.save(os.path.join(OUT_DIR, f"crop_{name}"))
print("Saved comparison crops!")
