with open("d:/AutoDub Sub/ai-video-factory/src/services/dubbingService.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if any(k in line for k in ["transcribe", "translate", "split", "sub-segment", "source_text", "segments.map"]):
        print(f"L{i:03d}: {line.strip()[:100]}")
