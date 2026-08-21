import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx in [952, 953, 957]:
            d = json.loads(line)
            print(f"=== Line {idx} ===")
            content = d.get('content') or ''
            if content:
                print(content[:1500])
            for tc in d.get('tool_calls', []):
                print("Tool call:", tc.get('name'))
                print(str(tc.get('args', {}))[:1500])
