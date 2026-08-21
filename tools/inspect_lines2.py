import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx in [1244, 1246, 1295, 1317, 1325, 1370, 1396, 1426]:
            d = json.loads(line)
            tc = d.get('tool_calls', [])
            print(f"=== LINE {idx} ({d.get('type')}) ===")
            content = d.get('content') or d.get('thinking') or ''
            print(content[:300])
            for t in tc:
                code = t.get('args', {}).get('CodeContent') or t.get('args', {}).get('CommandLine') or ''
                print(f"  Tool: {t.get('name')} -> {code[:200]}")
