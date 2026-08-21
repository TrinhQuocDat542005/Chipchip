import json

log_path = r"C:\Users\ASUS\.gemini\antigravity\brain\43c36dcd-b003-4f43-a20c-f349526edf3c\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "dub-1786900777961" in line:
            # check if line has start and end
            if "二和作业三" in line:
                print(f"Line {idx} has Chinese text '二和作业三'")
                # let's write to file to inspect
                with open("D:/AutoDub Sub/ai-video-factory/tools/found_seg100_line.json", "w", encoding="utf-8") as out:
                    out.write(line)
                break
