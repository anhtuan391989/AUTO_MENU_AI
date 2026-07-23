# KNOWN LIMITATIONS — AUTO_MENU_AI

> Danh sách này phản ánh trạng thái THẬT của `main` tại lần audit gần nhất (xác nhận bằng
> đọc mã nguồn qua GitHub API + `node --check`, không suy đoán). Cập nhật lại mục nào đã
> được giải quyết, và thêm mục mới nếu phát hiện thêm — không xoá lịch sử, chỉ đánh dấu
> "Đã giải quyết" kèm ngày/commit.

## 🔴 Nghiêm trọng — chặn toàn bộ ứng dụng

### 1. `core/ai/AIBootstrap.js` và `core/ai/AIContext.js` có lỗi cú pháp (SyntaxError)

- **Hiện trạng:** cả 2 file còn sót dấu vết merge Git chưa giải quyết hết:
  - `AIBootstrap.js`: khai báo `const WorkflowManager` bị lặp lại 2 lần liên tiếp (dòng 3–4).
  - `AIContext.js`: còn nguyên dấu `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main`
    (khoảng dòng 106–150).
- **Bằng chứng:** `node --check` báo `SyntaxError` thật cho cả 2 file. Đã xác nhận bằng
  `git show HEAD:<file>` — nội dung lỗi này **đã nằm trong chính commit HEAD trên `main`**,
  không phải lỗi máy cục bộ của ai đó.
- **Ảnh hưởng:** `app/main.js` require 2 file này trực tiếp ở top-level (trước cả
  `app.whenReady()`) → toàn bộ tiến trình Electron main **crash ngay khi mở ứng dụng**.
  Không chỉ ảnh hưởng phần AI — ảnh hưởng cả app.
- **Trạng thái:** CHƯA giải quyết tại thời điểm viết file này.

### 2. `core/ai/kernel/Kernel.js`, `Registry.js`, `BootLoader.js` cũng có SyntaxError tương tự

- Cùng loại lỗi (dấu conflict Git chưa giải quyết).
- **Không** nằm trên đường chạy thật (không được `require` ở bất kỳ đâu) nên **không** gây
  crash ứng dụng ở thời điểm hiện tại — nhưng vẫn nên sửa/dọn cùng lúc với mục 1 vì cùng
  nguồn gốc lỗi.

## 🟡 Chức năng chưa hoàn thiện / chưa nối đủ

### 3. Adaptive Lock chưa triển khai

Xem `DECISIONS.md` và `TASKS.md`. Cần: (a) sửa mục 1 để app boot được, (b) thu thập dữ liệu
telemetry thật (mục 6 bên dưới), (c) quyết định kiến trúc nơi đặt logic Adaptive Lock
(trong `keyEngine.js`, nơi Margin/Stability/ConfidenceV2 đã có sẵn — nhưng đây là thuật
toán khoá, cần giải thích & xác nhận trước khi sửa — hay mở rộng đường truyền dữ liệu lên
Core, tốn thêm công sức nhưng giữ nguyên tắc "không sửa thuật toán Key Engine").

### 4. `UPDATE_BPM` chưa gửi xuống plugin thật

`vocalCommandRouter.js` không có hàm nào gửi giá trị BPM xuống plugin — chỉ có các hàm
liên quan đến Key/Tone (`sendKeyToAutotune`, `sendToneStep`, `sendToneStepToSoundShifter`,
`setSoundShifterPower`). Renderer Bridge (`ui/js/renderer.js`, case `"UPDATE_BPM"`) tự nhận
điều này trong code (comment) và chỉ log lại, không hành động. Nếu cần chức năng này, phải
viết hàm gửi BPM mới trong `vocalCommandRouter.js` trước — nằm ngoài phạm vi "chỉ tài liệu".

### 5. TaskQueue chưa có consumer thực thi thật

`core/ai/workflow/TaskQueue.js` chỉ được `enqueue()`; không có nơi nào gọi `dequeue()`.
`PluginController` đọc trực tiếp từ payload sự kiện `WORKFLOW_READY`, bỏ qua TaskQueue hoàn
toàn. Hệ quả: mảng nội bộ của TaskQueue lớn dần không giới hạn trong suốt vòng đời tiến
trình (rò rỉ bộ nhớ nhẹ, không nghiêm trọng ở tần suất hiện tại nhưng đáng lưu ý nếu app
chạy liên tục nhiều giờ). Bản thân file tự nhận đây là "hạ tầng chờ sẵn cho tầng thực thi
chưa xây" — không phải lỗi thiết kế, nhưng hiện KHÔNG được dùng thật.

### 6. Chưa có dữ liệu telemetry thật nào được thu thập

Thư mục `logs/` không tồn tại trong repo tại thời điểm audit gần nhất (đúng theo
`.gitignore`, không phải lỗi). Kế hoạch thu thập 500 bài hát thật (100 bài × 5 thể loại:
Pop/EDM/Rock/Ballad/Live) để chọn ngưỡng Adaptive Lock bằng thực nghiệm — **chưa bắt đầu
hoặc chưa được đồng bộ vào `main`**.

### 7. Một số driver plugin/target chưa hoàn thiện

`core/command-engine-ts/hotkey.driver.ts` có các phím tắt Studio One được đánh dấu là
placeholder (comment tự nhận), cần đối chiếu lại với Key Command thật trong Studio One.
`mcu.driver.ts`/`midiDriver` cũng còn ở dạng chưa hiện thực đầy đủ theo mô tả trong README
cũ. Lưu ý: `core/command-engine-ts/` hiện **không được nối vào app thật** (xem
`ARCHITECTURE.md` — dead code), nên đây là giới hạn của một nhánh thiết kế chưa dùng, không
ảnh hưởng hệ thống đang chạy.

### 8. Offline analysis (`scripts/analyzeTelemetry.js`) dùng ngưỡng bất thường tạm thời

`ANOMALY_THRESHOLDS` trong file tự nhận là giá trị tạm, sẽ cần điều chỉnh lại sau khi có đủ
dữ liệu thật (mục 6) để không báo sai "bất thường" trên dữ liệu thực tế bình thường.

### 9. `ControlSource.isAiControl()` trả về sai giá trị

`core/shared/ControlSource.js`: hàm `isAiControl()` hiện trả về
`CURRENT_MODE === MODES.LEGACY_CONTROL` (đáng lẽ phải so `=== MODES.AI_CONTROL`) — khiến
`isAiControl()` và `isLegacyControl()` luôn trả về cùng giá trị. Hiện **không được gọi ở
bất kỳ đâu** trong codebase (renderer tự so sánh chuỗi độc lập qua IPC, không gọi hàm này)
nên chưa gây hậu quả runtime — nhưng là lỗi tiềm ẩn nếu sau này có ai dùng hàm này.

### 10. `Events.PLUGIN_COMMAND` không được định nghĩa trong `core/events/Events.js`

`PluginController.js` và `app/main.js` đều dùng `Events.PLUGIN_COMMAND` để publish/subscribe,
nhưng hằng số này không tồn tại trong file định nghĩa event — cả 2 phía đang "ăn may" vì
cùng nhận về `undefined` và trùng khớp nhau. Hoạt động đúng ở hiện tại, nhưng dễ vỡ nếu chỉ
một phía được sửa để dùng tên event thật mà phía kia không được cập nhật theo — kênh sẽ
câm lặng mà không báo lỗi nào.

### 11. Không có test nào cho toàn bộ tầng `core/ai/`

`AIContext`, `AIBootstrap`, `AnalysisState`, `InferenceEngine`, `ResultQueue`,
`DecisionEngine`, `WorkflowManager`, `TaskQueue`, `PluginController`, `ControlSource`,
`EventBus` — 0 file test. Đây là lý do mục 1 (lỗi chặn boot) tồn tại được qua nhiều commit
mà không ai phát hiện.

## 📝 Ghi chú khác

- `config/`, `assets/`, `database/songLibrary.json` — khung thư mục/file rỗng, chưa có dữ
  liệu thật (theo README cũ; chưa xác minh lại độc lập trong lần audit này).
- Toàn bộ danh sách "kiến trúc trùng lặp/dead code" chi tiết nằm ở `ARCHITECTURE.md`, không
  lặp lại ở đây để tránh 2 nguồn dễ lệch nhau.
