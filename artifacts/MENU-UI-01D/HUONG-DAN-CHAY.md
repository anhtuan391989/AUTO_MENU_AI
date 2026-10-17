# HƯỚNG DẪN CHẠY — MENU-UI-01D (dành cho người không lập trình)

Cần làm đúng 6 bước. Toàn bộ mất khoảng 10 phút.

1. **Chép file vào dự án.** Giải nén `MENU-UI-01D-bundle.zip`, chép thư mục `scripts` và `artifacts` vào `G:\AUTO_MENU_AI` (chọn Merge/Replace nếu hỏi). Không có file nào của code Menu bị ghi đè.
2. **Mở PowerShell trong thư mục dự án:** `cd G:\AUTO_MENU_AI`
3. **Cài thư viện nếu chưa có** (chỉ cần nếu script báo `electron: False`): `npm install`
4. **Chạy kiểm tra tự động:**
   `powershell -ExecutionPolicy Bypass -File scripts\verify-menu-ui-01d.ps1`
   Lần đầu kết quả cuối sẽ là **BLOCKED** — đó là đúng, vì bạn chưa thử giao diện thật.
5. **Thử Menu thật:** chạy `npm start`, mở file `artifacts\MENU-UI-01D\RUNTIME-CHECKLIST.md` bằng Notepad, làm lần lượt 14 mục (A1–A6, B1–B3, C1–C4, D). Sau mỗi mục, sửa dòng `KET_QUA: NOT RUN` thành `KET_QUA: PASS` hoặc `KET_QUA: FAIL`. **Chỉ điền PASS khi bạn đã thấy tận mắt.** Mục nào FAIL: điền thêm "Thực tế" và chụp ảnh. Không tự sửa code.
6. **Chạy lại script ở bước 4.** Kết quả:
   - `RELEASE READY` — khi 14/14 mục bạn tự điền PASS và test tự động đạt (script không tự kiểm tra được giao diện nên dựa vào bạn).
   - `BLOCKED` — còn mục chưa thử (NOT RUN).
   - `FAIL` — có test tự động hoặc mục runtime không đạt.

Kết quả mỗi lần chạy được lưu ở `artifacts\MENU-UI-01D\run-<giờ>\results.md` và `results.log`. Gửi 2 file này (cộng RUNTIME-CHECKLIST.md đã điền) cho Claude để cập nhật báo cáo. Nếu muốn lưu vào GitHub, tự commit và push.

**Lưu ý:** `AutoSongCollector` và `NowPlayingResolver` chỉ PASS khi chưa có file cũ nào bị sửa chưa commit. Nếu hai test này FAIL, hãy commit trước rồi chạy lại.
