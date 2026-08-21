import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx in [730, 740, 772, 782, 811, 817, 927, 957, 987, 1031, 1073]:
            d = json.loads(line)
            c = d.get('content', '')
            print(f"Line {idx} content length: {len(c)}")
