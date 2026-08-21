import os
import wave

p = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786900777961'
files = sorted(os.listdir(p))

seg_files = [f for f in files if f.startswith('segment-') and f.endswith('.wav')]
print(f"Total segment-*.wav files: {len(seg_files)}")
print("Files:", seg_files[:20])
print("Last files:", seg_files[-20:])
