import json
import re

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line and "orig_dur" in line and "idx" in line:
            print(f"Line {idx} matches criteria (len {len(line)})")
            # save or inspect
            if len(line) > 5000:
                with open("D:/AutoDub Sub/ai-video-factory/tools/extracted_line.json", "w", encoding="utf-8") as out:
                    out.write(line)
                print(f"Saved line {idx} to extracted_line.json")
                break
