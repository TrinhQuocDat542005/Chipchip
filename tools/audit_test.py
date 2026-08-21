import json
import os

p1 = "D:/AutoDub Sub/CapCap/projects/thanh_pho_hu_hoa_615eed34/analysis/transcript_segments.json"
p2 = "D:/AutoDub Sub/CapCap/projects/thanh_pho_hu_hoa_615eed34/audio/voice_segments.json"

if os.path.exists(p1) and os.path.exists(p2):
    s1 = json.load(open(p1, encoding="utf-8"))
    s2 = json.load(open(p2, encoding="utf-8"))
    print(f"CapCap segments: {len(s1)} original, {len(s2)} dubbed.")
    print("\n--- 5 Cặp (Câu gốc, Câu dub, % Lệch) đầu tiên của CapCap ---")
    for i in range(min(5, len(s1), len(s2))):
        orig_dur = s1[i]["end"] - s1[i]["start"]
        metrics = s2[i].get("_tts_metrics", {})
        dub_dur = metrics.get("duration_sec") or metrics.get("tts_duration") or s2[i].get("tts_duration") or (s2[i].get("_audio_end", s2[i]["end"]) - s2[i]["start"])
        dev = abs(dub_dur - orig_dur) / orig_dur * 100
        orig_text = s1[i].get("original_text", "")
        dub_text = s2[i].get("dubbing_vi", s2[i].get("text", ""))
        print(f"Cặp {i+1}:")
        print(f"  - Câu gốc ({orig_dur:.3f}s): {orig_text}")
        print(f"  - Câu dub ({dub_dur:.3f}s): {dub_text}")
        print(f"  - % Lệch thời lượng: {dev:.2f}%\n")
