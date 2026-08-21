import os
import wave

storage_dir = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786900777961'

for i in range(1, 113):
    fn = f"segment-{i:03d}-voice.wav"
    p = os.path.join(storage_dir, fn)
    if os.path.exists(p):
        with wave.open(p, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        print(f"Old Seg {i:3d}: {fn} | Dur: {dur:5.2f}s")
    else:
        print(f"Old Seg {i:3d}: {fn} | NOT FOUND")
