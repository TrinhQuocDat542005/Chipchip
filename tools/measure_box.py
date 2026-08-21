import os
from PIL import Image

# Let's inspect the bounding box of the watermark
# The crop was (0, 0, 320, 129) on 1280x720 video

# In topleft_frame_dub-1786897570201.png:
# Let's check where the text starts and ends
img = Image.open("D:/AutoDub Sub/ai-video-factory/tools/sample_crops/topleft_frame_dub-1786897570201.png")
w, h = img.size

# Let's test a bounding box on the original 1280x720 frame:
# Left X: starts around 18px - 25px
# Right X: ends around 280px - 310px
# Top Y: starts around 15px - 25px
# Bottom Y: ends around 95px - 110px

# Let's create multiple candidate bounding boxes:
# Box 1 (Tight): x=15, y=15, w=290, h=95 (in percent: x=1.2%, y=2.1%, w=22.7%, h=13.2%)
# Box 2 (Comfortable): x=10, y=10, w=310, h=105 (in percent: x=0.8%, y=1.4%, w=24.2%, h=14.6%)
# Box 3 (Generous): x=0, y=0, w=330, h=120 (in percent: x=0%, y=0%, w=25.8%, h=16.7%)

print("Calculated candidate boxes for 1280x720:")
print("Tight: x=15, y=15, w=290, h=95")
print("Comfortable: x=10, y=10, w=310, h=105")
print("Generous: x=0, y=0, w=330, h=120")
