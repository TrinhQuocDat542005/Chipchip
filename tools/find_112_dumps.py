import json
import re

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

# Search for where 112 segments texts of dub-1786900777961 were dumped or evaluated
found_steps = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line:
            if "total_scanned" in line or "suspect_segments" in line or "clean_sentence" in line or "candidates" in line:
                print(f"Line {idx} (len={len(line)})")
