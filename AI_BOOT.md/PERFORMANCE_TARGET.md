# PERFORMANCE TARGET — AUTO_MENU_AI

> **Lưu ý quan trọng:** các con số dưới đây là MỤC TIÊU đề xuất dựa trên bối cảnh sử dụng thật
> của app (biểu diễn trực tiếp, không được phép trễ/giật), **không phải số liệu đã đo được
> bằng công cụ profiling thật**. Chưa có phép đo CPU/Memory/latency thật nào được thực hiện
> trong lần audit gần nhất — cần đo thật trước khi coi các số này là đã xác nhận. Đánh dấu
> "Đã đo" / "Chưa đo" cho từng mục khi có kết quả thật.

| Mục tiêu | Giá trị đề xuất | Trạng thái đo | Ghi chú |
|---|---|---|---|
| **Key detection latency** (từ lúc đủ dữ liệu chroma tới lúc chốt Key lần đầu) | ≤ 20 giây | Chưa đo | Bị chi phối bởi `MIN_ELAPSED_BEFORE_LOCK_MS = 15000ms` (cố định trong `keyEngine.js`) + thời gian tích luỹ chroma vector ban đầu (~2s theo `setTimeout` trong `renderer.js`). |
| **CPU (Signal Engine, tổng 3 engine Key/BPM/Mod)** | Không gây giật UI/audio trên máy cấu hình trung bình khi chạy `requestAnimationFrame` liên tục | Chưa đo | Điểm tốn CPU nhất theo đọc code: `updateChromaVector()` trong `keyEngine.js` (FFT `fftSize=8192`, chạy ~60 lần/giây). |
| **Memory (chạy liên tục nhiều giờ, ví dụ 1 buổi thu 500 bài)** | Không tăng dần không kiểm soát (no unbounded growth) | Chưa đo | Đã biết 1 điểm rò rỉ nhẹ: `TaskQueue` (xem `KNOWN_LIMITATIONS.md` mục 5) — cần theo dõi khi đo thật. |
| **Pipeline latency (ResultQueue → PluginController, khi Core đang hoạt động)** | ≈ 400ms (bằng đúng cửa sổ gom của `ResultQueue`, xem `DECISIONS.md` D2) | Đã xác nhận bằng đọc code (cấu hình cố định), chưa đo bằng đồng hồ thật | Không tính thời gian mạng/IPC (nhỏ, cùng máy). |
| **Plugin response (gửi lệnh MIDI/AHK tới lúc Plugin phản hồi)** | Cảm nhận tức thời với người biểu diễn (không có ngưỡng số cụ thể đã thống nhất) | Chưa đo | Phụ thuộc phần cứng MIDI/độ trễ AutoHotkey, ngoài phạm vi kiểm soát của code app. |
| **Accuracy (Key detection đúng thể loại thật)** | Chưa có mục tiêu số cụ thể — sẽ định lượng được sau khi có dữ liệu 500 bài | Chưa đo | Đây chính là lý do cần thu thập telemetry thật trước khi đặt mục tiêu accuracy chính xác theo từng thể loại (Pop/EDM/Rock/Ballad/Live). |

## Việc cần làm để các mục tiêu trên có ý nghĩa thật

1. Sửa lỗi chặn boot (`KNOWN_LIMITATIONS.md` mục 1) — không thể đo bất cứ gì trong khi app
   không mở được.
2. Dùng công cụ profiling thật (Chromium DevTools Performance tab cho renderer, Node
   `--prof`/Task Manager cho main process) để có số liệu CPU/Memory thật, thay vì suy đoán từ
   đọc code.
3. Thu thập dữ liệu 500 bài hát — vừa phục vụ Adaptive Lock, vừa cho phép tính Accuracy thật
   theo từng thể loại.
