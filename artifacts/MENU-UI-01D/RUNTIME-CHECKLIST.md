# RUNTIME-CHECKLIST — MENU-UI-01D (kiểm thử Windows/Electron THẬT)

**Hướng dẫn:** chạy `npm start` rồi làm từng mục. Sau khi thử xong mỗi mục, **chỉ sửa dòng `KET_QUA:`** thành `PASS` hoặc `FAIL` (giữ đúng chữ in hoa). Mặc định là `NOT RUN` — chưa thử thì để nguyên, đừng tự điền PASS.
Nếu FAIL: điền "Thực tế" và "Lỗi/ảnh/log" (chụp ảnh màn hình, hoặc mở DevTools `Ctrl+Shift+I` chép chữ đỏ ở tab Console). **Không tự sửa code.**
Sau khi điền xong, chạy lại: `powershell -ExecutionPolicy Bypass -File scripts\verify-menu-ui-01d.ps1`

---

### A1 — Khởi động mới: công tắc Always on Top hiện ON
KET_QUA: NOT RUN
- Các bước: tắt hẳn Menu (nếu đang chạy) → `npm start` → nhìn công tắc cạnh nút Settings.
- Mong đợi: công tắc ban đầu mờ (đang kiểm tra) rồi sáng màu cyan = ON; rê chuột thấy tooltip "ĐANG BẬT".
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### A2 — ON: Menu vẫn nổi khi app khác ở phía trước
KET_QUA: NOT RUN
- Các bước: mở Notepad hoặc Chrome, bấm vào cho nó lên trước, kéo nó đè lên vùng Menu.
- Mong đợi: Menu vẫn nằm trên cửa sổ Notepad/Chrome.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### A3 — Gạt OFF: app khác che được Menu
KET_QUA: NOT RUN
- Các bước: bấm công tắc để OFF (núm chuyển sang trái, màu xám) → bấm vào Notepad/Chrome đang đè lên Menu.
- Mong đợi: Notepad/Chrome nằm trên Menu (Menu bị che).
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### A4 — Gạt ON lại: Menu nổi lên
KET_QUA: NOT RUN
- Các bước: từ trạng thái OFF, bấm công tắc để ON.
- Mong đợi: công tắc sáng cyan; Menu nổi lên trên Notepad/Chrome và giữ ở trên.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### A5 — Gạt OFF → đóng Menu → mở lại → phải ON
KET_QUA: NOT RUN
- Các bước: gạt OFF → đóng Menu bằng nút ✕ → `npm start` lại.
- Mong đợi: công tắc ON (không nhớ lựa chọn OFF của phiên trước).
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### A6 — Gạt nhanh nhiều lần: không kẹt, không hiển thị sai
KET_QUA: NOT RUN
- Các bước: bấm công tắc liên tục khoảng 10–20 lần, dừng lại, rồi thử chứng minh trạng thái bằng cách để Notepad đè lên Menu.
- Mong đợi: công tắc không bị kẹt/khóa; trạng thái công tắc (ON/OFF) khớp với việc Menu có nổi trên Notepad hay không.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### B1 — Nút Thu nhỏ: cửa sổ xuống taskbar
KET_QUA: NOT RUN
- Các bước: bấm nút `—` ở góc phải header.
- Mong đợi: cửa sổ Menu biến mất khỏi màn hình và còn biểu tượng trên taskbar.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### B2 — Khôi phục Menu từ taskbar
KET_QUA: NOT RUN
- Các bước: bấm biểu tượng Menu trên taskbar.
- Mong đợi: Menu hiện lại, bình thường, công tắc vẫn đúng trạng thái trước khi thu nhỏ.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### B3 — Không có lỗi IPC / JavaScript
KET_QUA: NOT RUN
- Các bước: trong Menu nhấn `Ctrl+Shift+I` (nếu mở được DevTools) → tab Console → làm lại B1, B2 và gạt công tắc vài lần; cũng xem cửa sổ PowerShell đang chạy `npm start`.
- Mong đợi: không có dòng chữ đỏ liên quan `minimizeWindow`, `AlwaysOnTop`, `IPC`, `No handler registered`.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### C1 — Mở Settings khi Menu đang ON: Setup hiển thị đầy đủ
KET_QUA: NOT RUN
- Các bước: công tắc đang ON → bấm nút ⚙ Settings.
- Mong đợi: cửa sổ Setup mở ra, thấy đủ nội dung, bấm được.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### C2 — Chuyển qua lại giữa Setup và Menu
KET_QUA: NOT RUN
- Các bước: bấm vào Menu, rồi bấm lại vào Setup, lặp vài lần.
- Mong đợi: chuyển qua lại bình thường, không đứng hình.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### C3 — Setup không bị Menu che, vẫn nhận thao tác
KET_QUA: NOT RUN
- Các bước: kéo Setup chồng lên Menu, thử bấm nút/ô nhập trong Setup; thử cả khi công tắc ON và OFF.
- Mong đợi: Setup nằm phía trên Menu, nhận chuột và bàn phím bình thường.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### C4 — Đóng Setup: Menu vẫn hoạt động đúng
KET_QUA: NOT RUN
- Các bước: đóng Setup → thử công tắc, nút Thu nhỏ, nút ⚙ mở lại Setup.
- Mong đợi: tất cả vẫn hoạt động.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:

### D — Chức năng header hiện có: kéo cửa sổ, đóng Menu, mở Settings
KET_QUA: NOT RUN
- Các bước: kéo cửa sổ Menu bằng thanh header; bấm ⚙ mở Settings; bấm ✕ đóng Menu.
- Mong đợi: kéo được, Settings mở được, ✕ đóng được; bố cục header (công tắc, ⚙, —, ✕) không chồng lấn, không bị cắt.
- Thực tế (bạn điền):
- Lỗi / ảnh / log:
