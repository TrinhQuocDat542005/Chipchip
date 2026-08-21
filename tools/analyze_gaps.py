import sqlite3
import json

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute('SELECT data FROM dubbing_projects WHERE id = ?', ('dub-1786900777961',))
data = json.loads(cur.fetchone()[0])
segs = data.get('segments', [])

print(f"Total segments: {len(segs)}")
gaps = []
total_speech_time = 0
for i in range(len(segs)):
    dur = segs[i]['end'] - segs[i]['start']
    total_speech_time += dur
    if i > 0:
        gap = segs[i]['start'] - segs[i-1]['end']
        if gap > 0.5:
            gaps.append((i, segs[i-1]['end'], segs[i]['start'], gap))

print(f"Total speech duration: {total_speech_time:.2f}s across {segs[-1]['end']:.2f}s video")
print(f"Number of gaps > 0.5s: {len(gaps)}")
for g in gaps:
    print(f"  Gap after seg {g[0]}: {g[1]:.2f}s -> {g[2]:.2f}s ({g[3]:.2f}s gap)")
