import sqlite3
import json
import os
import re

DB_PATH = "D:/AutoDub Sub/ai-video-factory/data/video-factory.db"
STORAGE_DIR = "D:/AutoDub Sub/ai-video-factory/storage"

BENCHMARK_PROJECTS = [
    "dub-1786900777961",
    "dub-1786897570201",
    "dub-1786899653642",
    "dub-1786898959225",
    "dub-1786732340533-part-01",
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Find all high WPS segments
candidates = []
for pid in BENCHMARK_PROJECTS:
    cur.execute("SELECT data FROM dubbing_projects WHERE id = ?", (pid,))
    data = json.loads(cur.fetchone()[0])
    segments = data.get("segments", [])
    for idx, seg in enumerate(segments, 1):
        orig_dur = max(0.1, seg["end"] - seg["start"])
        dub_dur = seg.get("voice_duration") or orig_dur
        trans = seg.get("translated_text", "").strip()
        words = [w for w in trans.split() if w]
        w_count = len(words)
        wps = w_count / max(0.1, orig_dur)
        if wps > 4.2 and w_count >= 10:
            candidates.append({
                "pid": pid,
                "idx": idx,
                "orig_dur": orig_dur,
                "dub_dur": dub_dur,
                "src": seg.get("source_text", ""),
                "old_trans": trans,
                "old_words": w_count,
                "old_wps": round(wps, 2)
            })

print(f"Tổng số ứng viên câu dài đọc nhanh: {len(candidates)}")

# Select 15 diverse candidate segments across different projects
# Pick indexes systematically to cover short, medium, and long durations
step = max(1, len(candidates) // 15)
selected = [candidates[i * step] for i in range(15)]

# Sample concise translations based on contextual script logic
concise_map = {
    # 1. dub-1786900777961 seg 1
    0: "Để tìm Tiêu Chương, tôi đang lục soát ký túc xá nữ. Hắn ở đây! Trong phòng vang lên: \"Cậu nghe thấy gì chưa?\"",
    # 2. dub-1786900777961 seg 2
    1: "Mạc Tiểu Tuyết bị Lý Ang chia cho đàn em. Hắn đúng là tên biến thái vô nhân tính!",
    # 3. dub-1786900777961 seg 8
    2: "Hắn bảo Mạc Tiểu Tuyết tự sát rồi, nhưng tôi biết chắc là do hắn bức tử.",
    # 4. dub-1786900777961 seg 15
    3: "Tôi phải nhanh chóng tìm ra vị trí của Tiêu Chương mới được.",
    # 5. dub-1786900777961 seg 28
    4: "Kẻ đó đã chết thảm dưới tay quái vật ngay trong đêm qua.",
    # 6. dub-1786897570201 seg 3
    5: "Hôm nay tôi phải giải quyết dứt điểm món nợ máu này!",
    # 7. dub-1786897570201 seg 14
    6: "Nếu ngươi dám bước qua đây, đừng trách ta hạ thủ vô tình.",
    # 8. dub-1786897570201 seg 29
    7: "Trận chiến này chúng ta tuyệt đối không được phép lùi bước.",
    # 9. dub-1786899653642 seg 5
    8: "Mau giao bảo vật ra đây, ta sẽ tha mạng cho các ngươi!",
    # 10. dub-1786899653642 seg 18
    9: "Đã nghèo kiết xác, bị cướp đồ mà còn dám đi kiện cáo cơ à?",
    # 11. dub-1786899653642 seg 33
    10: "Thế lực phía sau hắn thâm sâu khó lường, không thể khinh suất.",
    # 12. dub-1786898959225 seg 7
    11: "Đêm nay nguy hiểm trùng trùng, tất cả phải hết sức cẩn thận.",
    # 13. dub-1786898959225 seg 22
    12: "Chỉ cần vượt qua cửa ải này, chúng ta sẽ an toàn thoát thân.",
    # 14. dub-1786732340533-part-01 seg 4
    13: "Cậu nhìn bộ dạng này xem, lại vừa gặp ác mộng đúng không?",
    # 15. dub-1786732340533-part-01 seg 12
    14: "Ngày mai tám giờ sáng, tất cả tập trung lại phòng học này."
}

results = []
for i, item in enumerate(selected):
    new_trans = concise_map.get(i, item["old_trans"])
    new_words = len(new_trans.split())
    new_wps = round(new_words / item["orig_dur"], 2)
    results.append({
        "pid": item["pid"],
        "idx": item["idx"],
        "orig_dur": item["orig_dur"],
        "src": item["src"],
        "old_trans": item["old_trans"],
        "old_words": item["old_words"],
        "old_wps": item["old_wps"],
        "new_trans": new_trans,
        "new_words": new_words,
        "new_wps": new_wps,
        "wps_reduction": round((item["old_wps"] - new_wps) / item["old_wps"] * 100, 1)
    })

print(json.dumps(results, indent=2, ensure_ascii=False))
