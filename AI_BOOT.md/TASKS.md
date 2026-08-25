# TASKS — AUTO_MENU_AI

> Cập nhật file này khi bắt đầu/hoàn thành 1 nhiệm vụ có ảnh hưởng tới trạng thái dự án.
> Không cần cập nhật cho việc chỉ đọc/audit không sửa gì.

## IN PROGRESS

- *(chưa có nhiệm vụ code nào đang chạy dở tại thời điểm viết file này — chỉ vừa hoàn thành
  chuẩn hoá tài liệu)*

## NEXT (ưu tiên cao, nên làm ngay sau tài liệu này)

1. **Sửa lỗi chặn boot** — `core/ai/AIBootstrap.js` (khai báo `WorkflowManager` lặp) và
   `core/ai/AIContext.js` (dấu conflict Git chưa giải quyết). Cần Developer xác nhận nội dung
   đúng của từng đoạn bị conflict trước khi sửa (không tự đoán ý định ban đầu của 2 nhánh bị
   conflict). Xem `KNOWN_LIMITATIONS.md` mục 1.
2. **Xác nhận app boot lại được bình thường** sau khi sửa mục 1 (chạy thật, không chỉ
   `node --check`).

## TODO (cần làm nhưng chưa cấp bách)

- Sửa 3 file `core/ai/kernel/Kernel.js`/`Registry.js`/`BootLoader.js` (cùng loại lỗi cú pháp,
  hiện là dead code) — có thể gộp chung với nhiệm vụ 1 ở trên.
- Bắt đầu kế hoạch thu thập 500 bài hát telemetry thật (100×5 thể loại).
- Quyết định kiến trúc cho Adaptive Lock (đặt trong `keyEngine.js` hay mở rộng đường truyền
  dữ liệu lên Core) — xem `DECISIONS.md` D6.
- Bổ sung test smoke-boot cho toàn bộ `core/ai/**`.
- Viết hàm gửi BPM thật xuống plugin trong `vocalCommandRouter.js` (nếu tính năng này thật sự
  cần) — hiện `UPDATE_BPM` chỉ log, không hành động.
- Sửa `ControlSource.isAiControl()` (hiện trả sai giá trị, dead code nhưng nên sửa cho đúng).
- Định nghĩa `Events.PLUGIN_COMMAND` thật trong `core/events/Events.js` thay vì để 2 phía dùng
  chung giá trị `undefined`.

## LOW PRIORITY

- Quyết định giữ/xoá/hợp nhất các nhánh kiến trúc trùng lặp: `core/kernel/*` vs
  `core/ai/kernel/*`, `core/ai/events/*` (nội dung sai/thiếu so với `core/events/*`),
  `modules/*` (scaffold 8 byte, không dùng), `core/command-engine-ts/` (không nối vào app
  thật), `app/bootstrap.js`/`app/ipc.js`/`app/windows.js` (dead/rỗng).
- Đối chiếu lại các phím tắt placeholder trong `core/command-engine-ts/hotkey.driver.ts` với
  Key Command thật trong Studio One — chỉ cần thiết nếu quyết định hồi sinh nhánh
  `command-engine-ts`.
