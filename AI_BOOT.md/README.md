# AUTO_MENU_AI

Ứng dụng desktop (Electron) tự động dò Key/BPM/Modulation từ audio đang phát trực tiếp và
gửi lệnh xuống các plugin xử lý giọng hát (AutoTune, SoundShifter, AutoKey, Melodyne) qua
MIDI/AutoHotkey — dành cho ca sĩ/nhạc công biểu diễn trực tiếp.

**Branch chính thức: `main`.**
**`main` là Single Source of Truth (SSOT)** — mọi tài liệu, mọi trạng thái dự án đều dựa trên
nhánh này, không dùng `develop` hay branch song song nào khác cho công việc chính thức.

## 📖 Xem trạng thái đầy đủ của dự án

👉 **[`AI_PROJECT_GUIDE.md`](./AI_PROJECT_GUIDE.md)** — điểm bắt đầu bắt buộc, có trạng thái
module, pipeline tổng quát, và quy tắc làm việc.

Các tài liệu liên quan khác ở thư mục gốc:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — pipeline chi tiết + trạng thái từng module
- [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) — giới hạn/lỗi đã biết (bao gồm 1 lỗi
  đang chặn ứng dụng khởi động — đọc trước khi debug bất kỳ vấn đề gì)
- [`ROADMAP.md`](./ROADMAP.md) — các phase đã hoàn thành và kế hoạch tiếp theo
- [`DECISIONS.md`](./DECISIONS.md) — các quyết định kiến trúc đã áp dụng, kèm lý do
- [`TASKS.md`](./TASKS.md) — việc đang làm / cần làm tiếp theo
- [`AI_RULES.md`](./AI_RULES.md) — quy tắc bắt buộc cho AI làm việc trên repo này
- [`CODE_STANDARDS.md`](./CODE_STANDARDS.md) — quy chuẩn code
- [`PERFORMANCE_TARGET.md`](./PERFORMANCE_TARGET.md) — mục tiêu hiệu năng
- [`VERSION.md`](./VERSION.md) — trạng thái phiên bản hiện tại
- [`CHANGELOG_AI.md`](./CHANGELOG_AI.md) — nhật ký thay đổi do AI thực hiện

## Cài đặt / chạy thử

```bash
npm install
npm start
```

> ⚠️ Tại thời điểm viết README này, ứng dụng **chưa khởi động được** do lỗi cú pháp trong
> `core/ai/AIBootstrap.js`/`core/ai/AIContext.js` — xem chi tiết và cách xác nhận trong
> [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) mục 1.
