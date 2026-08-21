import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

found_lines = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "Đúng vậy, có chọn" in line or "nhiệm vụ 2 hoặc nhiệm vụ 3" in line or "Seg 100" in line:
            print(f"Match at line {idx}: {line[:200]}...")
            found_lines.append(idx)
