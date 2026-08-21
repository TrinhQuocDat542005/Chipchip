# AI Video Factory

**Hệ thống tự động hóa dịch thuật và lồng tiếng video (Automated Video Dubbing & Subtitling Pipeline)**

Chuyển đổi video tiếng Trung sang tiếng Việt hoàn chỉnh — từ nhận diện thoại, dịch thuật, tổng hợp giọng đọc, đến kiểm định chất lượng đầu ra tự động — với mục tiêu tạo ra bản lồng tiếng tự nhiên, đồng bộ khung hình, sẵn sàng xuất bản.

---

## Giới thiệu

AI Video Factory là một pipeline xử lý video end-to-end, giải quyết bài toán cốt lõi của auto-dubbing: làm sao để bản dịch vừa **đúng nghĩa**, vừa **đọc tự nhiên**, vừa **khớp khít với thời lượng cảnh gốc** — ba yêu cầu thường mâu thuẫn nhau khi tiếng Việt diễn đạt dài hơn tiếng Trung cho cùng một ý.

Hệ thống được xây dựng và tinh chỉnh qua nhiều vòng kiểm thử thực tế trên dữ liệu sản xuất, với một bộ benchmark riêng để đo lường khách quan thay vì chỉ đánh giá bằng cảm tính.

---

## Tính năng chính

### 1. Pipeline dịch & lồng tiếng
- **Nhận diện thoại (ASR)**: tách câu thoại gốc theo timestamp chính xác, có cơ chế gộp các đoạn bị cắt quá vụn thành câu hoàn chỉnh theo ngữ nghĩa.
- **Dịch tự động**: sử dụng LLM (Gemini Pro) để dịch, giữ nguyên tên riêng, ngữ cảnh nhân vật, khẩu khí đối thoại.
- **Auto LLM-Concision**: tự động rút gọn câu dịch quá dài về mật độ đọc tự nhiên (2.8–3.2 âm tiết/giây), bảo toàn 100% nội dung và tình tiết cốt truyện thay vì cắt xén cơ học.
- **Tổng hợp giọng đọc (TTS)**: dùng Edge-TTS với giọng đọc tiếng Việt tự nhiên (Neural Voices), hỗ trợ nhiều giọng theo nhân vật (Multi-Speaker).

### 2. Đồng bộ thời lượng thông minh (Dynamic Speed Fit)
- Tự động điều chỉnh tốc độ audio hai chiều (tăng tốc khi thoại dài, giãn nhẹ khi thoại ngắn) trong khung an toàn **0.88x–1.18x**, tránh hiện tượng nuốt chữ hay biến dạng giọng ("chipmunk effect") thường gặp khi ép tốc độ quá cao.
- Cơ chế lọc **silence rác** phát sinh từ lỗi mô hình TTS (trailing silence do trượt điều kiện dừng), chỉ cắt phần im lặng dư ở đầu/cuối audio, không đụng vào khoảng lặng có chủ đích giữa câu thoại.
- Giữ nguyên 100% nhạc nền và hiệu ứng âm thanh (SFX) gốc của video thông qua kỹ thuật lọc tần số chọn lọc, không thay thế toàn bộ track âm thanh.

### 3. Xử lý phụ đề
- Cân bằng tốc độ đọc (CPS – Characters Per Second) theo thuật toán 2-pass, đảm bảo phụ đề không vượt ngưỡng đọc kịp của người xem.
- Tự động chèn khoảng nghỉ tối thiểu giữa các dòng, loại bỏ hiện tượng dính/chồng phụ đề.
- Hỗ trợ ghép câu bị cắt, tách đoạn quá dài, dịch lại đoạn còn thiếu ngay trên giao diện.

### 4. Xử lý hình ảnh nguồn
- Bộ lọc làm mờ có chọn vùng (feathered blur) để xử lý watermark/logo ở nguồn video đầu vào, với vùng và cường độ mờ có thể cấu hình theo tỷ lệ khung hình.
- Không gian sạch để chèn logo/watermark thương hiệu riêng.

### 5. Hệ thống kiểm định chất lượng (Two-Tier Validator)
Điểm khác biệt cốt lõi của dự án: một bộ benchmark độc lập, chạy trực tiếp trên dữ liệu đĩa (không cache), đo lường khách quan thay vì chỉ dựa vào báo cáo tự đánh giá:

| Tiêu chí | Ngưỡng đạt |
|---|---|
| Tốc độ đọc phụ đề (CPS) | ≤ 20 ký tự/giây |
| Khoảng nghỉ giữa 2 dòng phụ đề | ≥ 80ms |
| Độ lệch timestamp phụ đề | ≤ 150ms |
| Độ lệch thời lượng dub vs gốc | Two-Tier: phân biệt "tràn cảnh" (nghiêm ngặt) và "câu ngắn tự nhiên có đệm silence" (không phạt oan) |
| Drift cộng dồn cuối video | ≤ 300ms |
| Đồng nhất âm lượng (LUFS) | Chênh lệch ≤ 1.0 LU |
| Giữ nhạc nền/SFX gốc | Bắt buộc, không méo/mất |
| Nhất quán giọng đọc theo nhân vật | Bắt buộc |
| Độ ổn định (chạy lại nhiều lần) | Dao động ≤ 5% |

Mô hình **Two-Tier** xử lý đúng một vấn đề thường gặp trong lồng tiếng phim: câu thoại ngắn kết thúc sớm hơn cảnh quay là hiện tượng tự nhiên (nhân vật ngừng nói, cảnh vẫn tiếp diễn), không nên bị đánh trượt như lỗi kỹ thuật thật.

---

## Kiến trúc & Công nghệ

```
Video nguồn (.mp4)
   │
   ▼
[ASR] ── tách câu thoại theo timestamp
   │
   ▼
[Translation] ── Gemini Pro + Auto LLM-Concision
   │
   ▼
[TTS] ── Edge-TTS + Dynamic Speed Fit + Silence Cleanup
   │
   ▼
[Subtitle Export] ── 2-pass CPS balancing
   │
   ▼
[Video Compositing] ── logo blur + audio mix + phụ đề
   │
   ▼
[Two-Tier Benchmark] ── kiểm định trước khi xuất bản
   │
   ▼
Video hoàn chỉnh (.mp4)
```

**Stack công nghệ:**
- **Backend/Core**: TypeScript, Node.js
- **Xử lý audio/video**: Python, FFmpeg
- **TTS Engine**: Edge-TTS (Neural Voices tiếng Việt)
- **Dịch thuật**: Gemini Pro API
- **Lưu trữ dữ liệu**: SQLite
- **Giao diện**: Web app (React/Next.js), quản lý dự án dạng studio

---

## Cấu trúc dự án

```
ai-video-factory/
├── src/
│   ├── services/
│   │   └── dubbingService.ts      # Lõi xử lý dub/sub, speed fit, blur logo
│   └── types.ts                    # Định nghĩa kiểu dữ liệu dự án
├── tools/
│   ├── benchmark.py                 # Two-Tier Validator — công cụ đo lường chính
│   └── ...                          # Script hỗ trợ (re-export SRT, sync DB...)
├── services/
│   └── tts/                         # Wrapper gọi Edge-TTS
├── storage/                         # Dữ liệu audio/video theo từng dự án
├── data/                            # Database SQLite
├── server.js                        # Entry point ứng dụng
├── PROGRESS.md                      # Nhật ký các vòng cải tiến & benchmark
├── SUCCESS_CRITERIA.md              # Tiêu chí chất lượng chuẩn
└── ANALYSIS.md                      # Phân tích kỹ thuật, đối chiếu tham khảo
```

---

## Bắt đầu sử dụng

```bash
# Cài đặt dependency
npm install
pip install -r requirements.txt --break-system-packages

# Cấu hình biến môi trường (API key dịch thuật, TTS...)
cp .env.example .env.local

# Chạy ứng dụng
npm run dev
```

Ứng dụng chạy tại `http://localhost:3000`.

### Chạy benchmark kiểm định chất lượng

```bash
python tools/benchmark.py --system my-project
```

Kết quả trả về báo cáo JSON chi tiết theo từng tiêu chí, cùng exit code (0 = đạt chuẩn, 1 = có tiêu chí chưa đạt) — phù hợp tích hợp vào quy trình CI/CD.

---

## Trạng thái dự án

Xem chi tiết lịch sử phát triển, số liệu benchmark qua từng vòng cải tiến, và các vấn đề kỹ thuật đã xử lý tại [`PROGRESS.md`](./PROGRESS.md).

---

## Giấy phép

*(Điền loại giấy phép phù hợp — MIT / Private / Proprietary...)*

---

## Ghi chú

Dự án đang trong giai đoạn phát triển tích cực. Các thông số kỹ thuật (trần tốc độ, ngưỡng CPS, mật độ âm tiết...) được hiệu chỉnh dựa trên kiểm thử thực tế và có thể thay đổi khi mở rộng sang các cặp ngôn ngữ hoặc thể loại nội dung khác.
