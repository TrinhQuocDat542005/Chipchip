import json
import re

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

# In Line 768 / 771:
# Let's inspect the code that iterated over dub-1786900777961
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx in [768, 771, 778, 781, 802, 804, 940, 949, 959]:
            d = json.loads(line)
            c = d.get('content', '')
            if 'Project dub-1786900777961' in c or 'dub-1786900777961' in str(d):
                print(f"=== Line {idx} ===")
                print(c[:400])
