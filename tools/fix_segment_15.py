import os
import subprocess
import wave
import struct

f15 = "D:/AutoDub Sub/ai-video-factory/storage/dub-1786732340533-part-01/segment-015-voice.wav"
if not os.path.exists(f15):
    # check preview file
    f15 = "D:/AutoDub Sub/ai-video-factory/storage/dub-1786732340533-part-01/dub-work/preview-015.wav"

print("Inspecting file:", f15)
if os.path.exists(f15):
    res = subprocess.run([
        "ffmpeg", "-i", f15,
        "-af", "silencedetect=noise=-38dB:d=1.0",
        "-f", "null", "-"
    ], capture_output=True, text=True)
    print("FFmpeg silencedetect output:\n", res.stderr)
    
    # Clean silence using 2-ended filter with -35dB threshold and 0.5s pause limit
    clean_out = "D:/AutoDub Sub/ai-video-factory/storage/dub-1786732340533-part-01/segment-015-voice-clean.wav"
    filter_str = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-35dB,areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-35dB,areverse,apad=pad_dur=0.18"
    subprocess.run(["ffmpeg", "-y", "-i", f15, "-af", filter_str, clean_out], capture_output=True)
    
    import shutil
    shutil.move(clean_out, f15)
    print("Cleaned and replaced:", f15)
