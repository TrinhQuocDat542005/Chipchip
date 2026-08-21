import json
import re

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line and ("trans_text" in line or "translated_text" in line):
            # check number of segments in this line
            cnt = len(re.findall(r'"translated_text"|"trans_text"|"trans"', line))
            if cnt > 10:
                print(f"Line {idx}: {cnt} text matches, total length: {len(line)}")
