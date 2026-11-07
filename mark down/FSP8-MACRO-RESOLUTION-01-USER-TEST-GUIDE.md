# FSP8-MACRO-RESOLUTION-01 — MỘT phép thử duy nhất (SEL-1), ~3 phút

> Bạn **không phải** làm lại D1–D5, không cài lại macro cũ, không chạy 8 CC.
> Phép thử này trả lời đúng một câu: **khi track đã được CHỌN chắc chắn bằng chuột, lệnh Mute trong macro có tác dụng không?** → tách "lệnh không hoạt động" khỏi "tìm track theo tên không chọn được".
> Làm trên bản sao `LIVE_TEST.song`, không lưu đè project gốc. Không đụng Send/gain/routing/plugin.

## Chuẩn bị (1 file)
1. Chép **1 file** `tools\algbench\reports\FSP8-MACRO-RESOLUTION-01\macros\DIAG_D1_MUTE_SELECTED_TOGGLE.studioonemacro` vào `C:\Users\Khoi\Documents\Studio One\Macros` (cùng chỗ với các macro khác).
2. Trong **Macro Organizer** bấm **Refresh** (nếu chưa thấy macro thì tắt/mở lại Studio One). Macro nằm trong nhóm **DIAG_TEST**.

## Thực hiện
1. Mở `LIVE_TEST.song`. **Bấm chuột vào tên track `Mic`** (header track hoặc tên kênh trong Mixer) cho nó **sáng/được chọn**. Đừng chọn track khác.
2. 📷 **Ảnh 1 (trước):** chụp màn hình thấy track `Mic` đang được chọn và nút **M** của `Mic`, `Beat`, `Không Dây`.
3. Chạy macro bằng nút **Action** trên **Macro Toolbar** → nhóm **DIAG_TEST** → **DIAG_D1_MUTE_SELECTED_TOGGLE** (bấm đúng 1 lần).
   - Nếu chưa thấy Macro Toolbar/nút Action: 📷 chụp menu **View** (Xem) và gửi, **dừng** ở đây.
4. 📷 **Ảnh 2 (sau lần 1):** cùng khung như ảnh 1.
5. Chạy macro **thêm 1 lần nữa**. 📷 **Ảnh 3 (sau lần 2).**

## PASS / FAIL
- **PASS:** nút **M của `Mic` đổi trạng thái mỗi lần chạy** (ví dụ ảnh 2 sáng, ảnh 3 tắt), **Beat và Không Dây không đổi.**
  → Lệnh Mute trong macro **có tác dụng**; lỗi ở các test trước nằm ở `Find Track`/`Find Channel`/cách chọn đối tượng hoặc cách chạy. Claude sẽ thiết kế bước tiếp theo từ kết quả này.
- **FAIL:** nút M **không đổi** ở cả hai lần.
  → Lệnh Mute chạy từ macro **không có tác dụng trên máy này** (hoặc macro chưa thực sự được chạy). Claude sẽ chuyển sang phương án dự phòng (gán phím/lệnh trực tiếp), **không** tạo thêm macro tương tự.
- **Đổi sai chỗ** (track khác đổi, hoặc nhiều track đổi): PASS một phần — ghi lại track nào đổi; 📷 gửi ảnh.

## Gửi lại (đúng những thứ này)
1. 3 ảnh (trước, sau lần 1, sau lần 2).
2. Một dòng chữ: **cách bạn đã chạy các macro ở lần thử trước** (nút Action / phím F / chạy từ Macro Organizer / cách khác).
