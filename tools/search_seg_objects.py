import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

found = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line:
            # check if line has start and end and translated_text
            if '"start"' in line and '"end"' in line and '"translated_text"' in line:
                print(f"Line {idx} has full segment records (len {len(line)})")
                found.append(idx)
            elif 'seg-112' in line or 'idx": 112' in line or 'idx": 100' in line:
                print(f"Line {idx} has high idx (len {len(line)})")
                found.append(idx)

print("Total found lines:", len(found))
