# AI-ALG-01-REVERSE-REPORT

## 1. Phạm vi và giới hạn
Chỉ kiểm tra METADATA của `app_youtube.pyd`: header PE, import, chuỗi định danh. KHÔNG dịch ngược/tháo mã máy, không chạy file, không sao chép logic gốc. Mọi thuật toán ở Giai đoạn B sẽ viết theo tài liệu công khai (Krumhansl–Schmuckler, Temperley, chroma, Pearson, onset/beat tracking).

## 2. Bằng chứng (đã đo thật)
- Loại file: PE32+ DLL x86-64 cho Windows, 5 section, 2 327 552 byte. SHA256 = 3ec7fb4c4543c7d97abd9b859872f91328b8b04b77603a9af5ebc5944d9d6466
- Python ABI: import `python312.dll`, export `PyInit_app_youtube` => chỉ nạp được bằng CPython 3.12 x64 trên Windows. Phụ thuộc: VCRUNTIME140, api-ms-win-crt-*, KERNEL32.
- Đóng gói: Nuitka (`__nuitka_version__`, `__nuitka__`). Với Nuitka, tên/hằng số còn thấy được nhưng logic là mã máy đã biên dịch => KHÔNG khôi phục được mã Python gốc bằng bytecode; không có bytecode để giải.
- Phụ thuộc runtime (tên module xuất hiện): librosa (core, beat, feature, util), numpy.
- Chuỗi liên quan phân tích: chroma_cens, chroma_cqt, chroma_mean, chroma_bass, bass_mean, bass_bonus, MAJOR_PROFILE, MINOR_PROFILE, TEMPERLEY_MAJ, TEMPERLEY_MIN, is_relative, get_smart_key, detected_key, extracted_key, beat_track, tempo, rms_energy.
- Phần còn lại của module là giao diện/tự động hoá (AutoGUI, send_chromatic_midi, set_beat_mode, các nút Beat, phím nóng) — NGOÀI phạm vi, không port.
- Có 11 chuỗi dạng "api_key/token/secret/password" trong binary: chỉ đếm, KHÔNG in/ghi lại nội dung, KHÔNG đưa vào source/log. Khuyến nghị chủ file kiểm tra và thu hồi nếu là khoá thật.

## 3. Chứng cứ vs giả thuyết
| Mục | Mức |
|---|---|
| Dùng librosa chroma (CENS/CQT) | Bằng chứng (tên hàm) |
| Có 2 bộ hồ sơ Major/Minor + Temperley | Bằng chứng (tên hằng) |
| Chấm 24 ứng viên bằng corrcoef | Bằng chứng một phần (có `corrcoef`) |
| bass_bonus, xét relative key | Bằng chứng tên; công thức/trọng số = KHÔNG BIẾT |
| Giá trị số của profile, trọng số, ngưỡng, thứ tự các bước | KHÔNG BIẾT — không đoán |
| beat_track + tempo + rms để lọc im lặng | Bằng chứng tên; tham số = KHÔNG BIẾT |
| Hiệu quả thực tế hơn engine hiện tại | CHƯA CHỨNG MINH |

## 4. Khả năng gọi trực tiếp
Không dùng. Cần Windows + CPython 3.12 + librosa/numpy, chữ ký hàm chưa xác minh, và còn mang UI/AutoGUI + khoá nhúng. Cũng không có điều kiện phân phối rõ => KHÔNG commit binary, KHÔNG gọi trực tiếp. Sandbox là Linux nên cũng không chạy được.

## 5. Kế hoạch (clean-room, theo tài liệu công khai)
Repo đã có: ui/js/engines/keyEngine.js (hồ sơ Krumhansl–Kessler + cosine + bass boost + Pearson), bpmEngine.js, core/ai/engines/*. Cần bổ sung, đo trước khi nối:
1. Module offline độc lập (JS, chạy bằng node) nhận PCM Float32: chroma, chấm 24 ứng viên (KK + Temperley), bass, relative key, trả {key, mode, confidence, status: INSUFFICIENT|AMBIGUOUS|OK}.
2. Beat/BPM: onset envelope -> autocorrelation, kiểm chứng gấp đôi/một nửa bằng đo, báo thời gian hội tụ.
3. Đo offline với audio tổng hợp có đáp án (cần thêm bài thật có nhãn từ bạn để hiệu chuẩn confidence).
4. Chỉ sau khi POC thắng engine hiện tại trên cùng dữ liệu mới nối vào SYSTEM_AUDIO (không mở MIC thứ hai, không đổi ngưỡng BPM hiện tại).

## 6. Trạng thái
Giai đoạn A: HOÀN TẤT ở mức metadata. Giai đoạn B/C: CHƯA BẮT ĐẦU. Không có thay đổi nào trong repo.
