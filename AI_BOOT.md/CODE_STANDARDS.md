# CODE STANDARDS — AUTO_MENU_AI

Quy tắc viết code áp dụng cho mọi thay đổi trên `main`, dành cho cả người và AI.

1. **Không duplicate code.** Nếu logic đã tồn tại ở nơi khác (ví dụ: cách tách nốt nhạc từ tên
   Key trong `renderer.js`, hay cách publish/subscribe qua `EventBus`), tái sử dụng thay vì
   viết lại.
2. **Không duplicate EventBus.** Chỉ có đúng 1 EventBus thật: `core/events/EventBus.js`. Không
   tạo thêm bản EventBus khác trong bất kỳ thư mục con nào (dự án từng có 1 bản trùng, sai nội
   dung, gây nhầm lẫn — xem `ARCHITECTURE.md`).
3. **Không polling mới nếu không cần.** Ưu tiên event-driven (EventBus, IPC event) hoặc timer
   cố định có lý do rõ ràng (ví dụ: cửa sổ gom 400ms của `ResultQueue`). Tránh `setInterval`
   kiểm tra trạng thái liên tục khi có thể dùng callback/event.
4. **Single Responsibility.** Mỗi file/class trong `core/ai/` chỉ nên làm đúng 1 việc, đúng
   như comment đầu file mô tả. Nếu 1 nhiệm vụ đòi hỏi 1 file làm thêm việc ngoài phạm vi khai
   báo, đó là dấu hiệu cần tách file mới, không phải nhét thêm logic vào file cũ.
5. **Backward compatibility.** Mọi thay đổi trên tầng Core (`core/ai/`) không được làm hỏng
   đường Legacy (`ui/js/vocalCommandRouter.js` + `renderer.js` gửi lệnh trực tiếp) đang chạy
   thật. Kiểm tra `ControlSource` hiện đang ở chế độ nào trước khi thử nghiệm bất kỳ thay đổi
   nào có thể ảnh hưởng đường gửi lệnh xuống Plugin.
6. **Test trước khi commit.** Nếu có test liên quan (`tests/unit/*.verify.js`), chạy bằng
   `node tests/unit/<tên file>.verify.js` và xác nhận PASS trước khi commit. Nếu thay đổi
   không có test tương ứng, cân nhắc viết thêm test theo đúng mô hình đã có (dùng `vm` module
   để sandbox mã nguồn thật, dùng `assert` gốc của Node, không cần framework ngoài).
7. **Luôn `node --check` file vừa sửa/tạo trước khi commit** — cách rẻ nhất để tránh lặp lại
   tình huống lỗi cú pháp bị commit thẳng vào `main` (đã từng xảy ra, xem
   `KNOWN_LIMITATIONS.md` mục 1).
8. **Không để lại dấu vết merge Git chưa giải quyết** (`<<<<<<<`, `=======`, `>>>>>>>`) trong
   bất kỳ commit nào. Nếu gặp file có dấu này, dừng lại, xác nhận với Developer nội dung đúng
   trước khi tự ý chọn 1 bên.
9. **Comment giải thích lý do, không chỉ mô tả code làm gì.** Theo đúng phong cách đã có trong
   `keyEngine.js`/`TelemetryLogger.js` — mỗi hằng số/quyết định thiết kế nên có 1–2 dòng giải
   thích "vì sao", để người đọc sau (người hoặc AI khác) không phải đoán lại.
