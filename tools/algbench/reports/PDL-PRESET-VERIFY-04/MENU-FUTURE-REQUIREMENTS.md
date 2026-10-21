# Ghi nhận yêu cầu tích hợp Menu cho GIAI ĐOẠN SAU (chỉ ghi nhận — KHÔNG triển khai)
Nguồn: PDL-PRESET-VERIFY-03/04. Chưa quyết định Mute, Send hay kết hợp: cần bằng chứng DAW thật và quyết định của Khói.

## 1. Tách logic dùng chung khỏi điều khiển riêng từng DAW

| Lớp | Nội dung (đề xuất để nghiên cứu, chưa chốt) | Hiện trạng trong mã (đã đọc, VERIFIED) |
|---|---|---|
| Dùng chung (không phụ thuộc DAW) | Mô hình 4 preset NORM/LOFI/RAP/REMIX; trạng thái "mong muốn" và trạng thái "đã xác nhận gửi"; kết quả gửi (SUCCESS/NOT_CONFIGURED/NO_DEVICE); quy tắc loại trừ lẫn nhau; chính sách khi mở lại ứng dụng; quy tắc nhường quyền với FX Auto | Một phần: `ActionRegistry.executeAction` + enum trạng thái (`actionRegistry.js:147-246`); nút preset ở `renderer.js:504-519`; chưa có mô hình trạng thái preset riêng; chưa có REMIX |
| Riêng Studio One / Fender Studio Pro | Cách gọi macro NORM/LOFI/RAP/REMIX (nút/phím/MIDI qua device map — chưa biết PDL dùng cách nào); tên track/kênh phải khớp; tên tiến trình DAW | Chưa có. `dawMidiOutMappings["studio-one"]` chỉ lưu CC/Note người dùng khai báo |
| Riêng Cubase | Gọi lệnh Key Command (PLE theo TÊN track/kênh) hoặc CC qua Generic Remote (theo VỊ TRÍ kênh mixer) hoặc MIDI Remote; khác biệt giữa Cubase 10–12 và 13–15 (F11/F12, REMIX) | Chưa có đường gửi phím preset (VERIFIED, VERIFY-03 R3) |
| Cấu hình theo DAW/phiên bản | Khai báo mapping theo (DAW, phiên bản); không đặt số CC/Note/phím mặc định chưa kiểm | Có `dawMidiOutMappings[daw][action]` với `source: USER_DEFINED` |

## 2. Điểm cần nghiên cứu thêm (chưa trả lời được bằng đọc file)
1. PDL thật sự gửi gì cho từng preset (MIDI/phím/macro/khác) — CHECKLIST-A.
2. Macro Studio One chạy trên Fender Studio Pro 8 có giữ nguyên hành vi không (macro tạo trên Studio One 5.3); lệnh `Mute` sau `Find Channel` có tác động kênh FX không.
3. Cubase 13: F9–F12 và PLE thật (ý nghĩa Function/Type/Val hiển thị trong cột Action); RAP khác RAPC thế nào; REMIX/REMIXC trên Cubase 13–15 có lệnh nào không.
4. MIDI: có cổng/ánh xạ nào trên máy Khói đã nhận CC từ loopMIDI (Generic Remote ở Cubase; device map External ở Studio One).
5. Mute FX và Send FX: hai cơ chế khác nhau; cần đo hành vi âm thanh và trạng thái hiển thị riêng cho từng cơ chế.
6. Giá trị CC → dB cho Send (phụ thuộc DAW; chưa có số liệu).

## 3. Xung đột Mute FX (macro PDL) vs FX Send tự động (Menu) — ghi nhận
- Macro Studio One đặt Mute tường minh cho DELAY/VERB1/VERB2 (RAP: Mute VERB1); không đụng Send (VERIFIED, đọc file).
- FX Auto của Menu điều khiển **Send** (`FX_SEND_REVERB/FX_SEND_DELAY`, `renderer.js:573-656`); registry **chưa có** action Mute FX (VERIFIED, đọc mã).
- Rủi ro (INFERRED): preset Mute một kênh FX trong khi FX Auto vẫn đẩy Send → trạng thái hiển thị của Menu (FX đang bật) khác với nghe thực tế (kênh FX bị Mute) và ngược lại. Chưa có bằng chứng DAW.
- Cần Khói quyết định sau khi có bằng chứng: Mute, Send, hay cả hai; và quy tắc ưu tiên khi cùng lúc.

## 4. Chưa được làm trong task này
Không sửa Menu/UI/FX Auto/MIDI mapping; không thêm REMIX; không đặt số CC/Note/phím; không commit/push.
