import sqlite3
import json
import os
import re

DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786897570201'")
data = json.loads(cur.fetchone()[0])
segments = data.get('segments', [])

def srt_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

GAP_SEC = 0.090 # 90ms gap rule

raw_cues = []
for seg in segments:
    st = seg['start']
    en = seg['end']
    dur = max(0.1, en - st)
    txt = seg.get('translated_text', '').strip()
    words = [w for w in txt.split() if w]
    
    # If short, 1 cue
    if len(words) <= 12 or dur <= 5.5:
        raw_cues.append({'start': st, 'end': en, 'text': txt})
    else:
        # Split into 2 or 3 parts
        part_count = max(2, min(4, int(len(words) / 10)))
        step = len(words) // part_count
        parts = []
        for p_idx in range(part_count):
            if p_idx == part_count - 1:
                parts.append(" ".join(words[p_idx * step:]))
            else:
                parts.append(" ".join(words[p_idx * step:(p_idx + 1) * step]))
                
        w_lens = [len(p.split()) for p in parts]
        tot_w = sum(w_lens)
        
        cur_st = st
        for i, p in enumerate(parts):
            p_dur = (w_lens[i] / tot_w) * dur
            p_en = cur_st + p_dur
            raw_cues.append({'start': cur_st, 'end': p_en, 'text': p})
            cur_st = p_en

# Enforce strict 90ms gap between ALL consecutive cues
for i in range(len(raw_cues) - 1):
    cur = raw_cues[i]
    nxt = raw_cues[i+1]
    if cur['end'] > nxt['start'] - GAP_SEC:
        cur['end'] = max(cur['start'] + 0.1, nxt['start'] - GAP_SEC)

# 2-pass CPS balancing
for i in range(len(raw_cues)):
    cur = raw_cues[i]
    c_len = len(re.sub(r'\s+', '', cur['text']))
    c_dur = max(0.1, cur['end'] - cur['start'])
    cps = c_len / c_dur
    if cps > 19.0:
        target_dur = c_len / 18.0
        diff = target_dur - c_dur
        if i + 1 < len(raw_cues):
            nxt = raw_cues[i+1]
            n_len = len(re.sub(r'\s+', '', nxt['text']))
            n_dur = max(0.1, nxt['end'] - nxt['start'])
            if (n_len / n_dur) < 17.5:
                shift = min(diff, (nxt['end'] - nxt['start']) * 0.3)
                cur['end'] += shift
                nxt['start'] += shift
        if i > 0 and (c_len / max(0.1, cur['end'] - cur['start'])) > 19.0:
            prv = raw_cues[i-1]
            p_len = len(re.sub(r'\s+', '', prv['text']))
            p_dur = max(0.1, prv['end'] - prv['start'])
            if (p_len / p_dur) < 17.5:
                shift = min(diff, (prv['end'] - prv['start']) * 0.3)
                prv['end'] -= shift
                cur['start'] -= shift

# Final gap enforcement
for i in range(len(raw_cues) - 1):
    if raw_cues[i]['end'] > raw_cues[i+1]['start'] - GAP_SEC:
        raw_cues[i]['end'] = max(raw_cues[i]['start'] + 0.1, raw_cues[i+1]['start'] - GAP_SEC)

srt_path = 'D:/AutoDub Sub/ai-video-factory/storage/dub-1786897570201/dub-work/translated.srt'
with open(srt_path, 'w', encoding='utf-8') as f:
    for idx, cue in enumerate(raw_cues, 1):
        w_list = cue['text'].split()
        if len(w_list) > 8:
            mid = len(w_list) // 2
            formatted_txt = " ".join(w_list[:mid]) + "\n" + " ".join(w_list[mid:])
        else:
            formatted_txt = cue['text']
        f.write(f"{idx}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{formatted_txt}\n\n")

print(f"✅ Re-exported translated.srt with {len(raw_cues)} cues and strict >= 90ms gaps!")
