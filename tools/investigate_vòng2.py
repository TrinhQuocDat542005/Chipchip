import sqlite3
import json
import os

db_path = "d:/AutoDub Sub/ai-video-factory/data/video-factory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Check dub-1786453409257
cur.execute("SELECT id, data FROM dubbing_projects WHERE id = 'dub-1786453409257'")
row = cur.fetchone()
if row:
    pid, data_str = row
    data = json.loads(data_str)
    segments = data.get("segments", [])
    print(f"\n=======================================================")
    print(f"=== BẢNG ĐIỀU TRA 16 ĐOẠN DỰ ÁN {pid} ===")
    print(f"=======================================================")
    
    over_10 = 0
    shorter = 0
    longer = 0
    
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        dub_dur = seg.get("voice_duration") or orig_dur
        dev = abs(dub_dur - orig_dur) / orig_dur * 100
        diff = dub_dur - orig_dur
        status = "KHỚP (<=10%)" if dev <= 10 else "LỆCH (>10%)"
        if dev > 10:
            over_10 += 1
            if diff < 0:
                shorter += 1
            else:
                longer += 1
        print(f"[{idx:02d}] Gốc: {orig_dur:6.3f}s | Dub: {dub_dur:6.3f}s | Lệch: {diff:+6.3f}s ({dev:5.2f}%) | {status}")
        print(f"     Trung ({len(seg.get('source_text','')):2d} ch): {seg.get('source_text','')}")
        print(f"     Việt  ({len(seg.get('translated_text','').split()):2d} w ): {seg.get('translated_text','')}\n")

    print(f"--- TỔNG KẾT DỰ ÁN {pid} ---")
    print(f"Tổng số đoạn: {len(segments)}")
    print(f"Số đoạn lệch > 10%: {over_10}/{len(segments)} ({over_10/len(segments)*100:.1f}%)")
    print(f"  + Đoạn Dub NGẮN HƠN Gốc (kết thúc sớm): {shorter}")
    print(f"  + Đoạn Dub DÀI HƠN Gốc  (bị tràn câu):   {longer}")


# 2. Check CapCap 857 segments
p1 = "D:/AutoDub Sub/CapCap/projects/thanh_pho_hu_hoa_615eed34/analysis/transcript_segments.json"
p2 = "D:/AutoDub Sub/CapCap/projects/thanh_pho_hu_hoa_615eed34/audio/voice_segments.json"

if os.path.exists(p1) and os.path.exists(p2):
    s1 = json.load(open(p1, encoding="utf-8"))
    s2 = json.load(open(p2, encoding="utf-8"))
    print(f"\n=======================================================")
    print(f"=== ĐIỀU TRA TOÀN BỘ 857 ĐOẠN CỦA CAPCAP ===")
    print(f"=======================================================")
    cap_over_10 = 0
    cap_shorter = 0
    cap_longer = 0
    max_cap_dev = 0
    
    for i in range(min(len(s1), len(s2))):
        orig_dur = max(0.1, s1[i]["end"] - s1[i]["start"])
        metrics = s2[i].get("_tts_metrics", {})
        # Note: In CapCap, voice_segments.json has "start" and "end" which are the target window (16.224s)
        # while _audio_end or tts_duration is raw TTS before fitting!
        raw_tts_dur = metrics.get("tts_duration") or metrics.get("duration_sec") or (s2[i].get("_audio_end", s2[i]["end"]) - s2[i]["start"])
        fitted_dur = s2[i]["end"] - s2[i]["start"]
        
        dev = abs(raw_tts_dur - orig_dur) / orig_dur * 100
        if dev > max_cap_dev:
            max_cap_dev = dev
        if dev > 10:
            cap_over_10 += 1
            if raw_tts_dur < orig_dur:
                cap_shorter += 1
            else:
                cap_longer += 1

    print(f"Tổng số đoạn CapCap: {len(s1)}")
    print(f"Số đoạn Raw TTS lệch > 10% trước khi fit: {cap_over_10}/{len(s1)} ({cap_over_10/len(s1)*100:.1f}%)")
    print(f"  + Raw TTS ngắn hơn gốc: {cap_shorter}")
    print(f"  + Raw TTS dài hơn gốc:  {cap_longer}")
    print(f"Max Raw TTS Deviation: {max_cap_dev:.2f}%")
    print(f"Kỹ thuật của CapCap: CapCap dùng time-stretch / speed-rescue trong timeline.py để ép audio khớp 100% vào slot gốc!")
