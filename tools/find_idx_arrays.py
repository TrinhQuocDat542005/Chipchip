import json
import re

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line and "idx" in line:
            # search for patterns like "idx": 1, "idx": 2, ...
            matches = re.findall(r'"idx":\s*(\d+)', line)
            if len(matches) > 10:
                print(f"Line {idx} has {len(matches)} idx matches: min={min(map(int, matches))}, max={max(map(int, matches))}")
