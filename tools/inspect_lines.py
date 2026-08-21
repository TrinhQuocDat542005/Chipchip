import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx in [940, 949, 959, 971, 975]:
            d = json.loads(line)
            tc = d.get('tool_calls', [])
            for t in tc:
                code = t.get('args', {}).get('CodeContent', '')
                print(f"=== LINE {idx} ({t.get('name')}) ===")
                print(code[:400])
