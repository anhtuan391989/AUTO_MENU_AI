# 04 — Đề xuất kiến trúc (CHỈ ĐẶC TẢ — không sửa mã Menu)

Đây là thay đổi kiến trúc **chưa được duyệt**; Khói cần đồng ý trước khi có task code. Không có file mã nào bị đụng.

## 1. Ý tưởng
Tách làm hai tầng:
1. **Tầng logic preset dùng chung** — "preset X nghĩa là gì" và trạng thái nút, không biết DAW là gì.
2. **Tầng driver theo DAW + phiên bản** — biết cách gửi lệnh (phím / MIDI / macro) cho Fender Studio Pro 8, Cubase 13, v.v.

## 2. Tầng dùng chung (Preset core)
- Mô hình trạng thái: `presetId ∈ {NORM, LOFI, RAP, REMIX}`, trạng thái `IDLE | PENDING | APPLIED | FAILED | NOT_CONFIGURED | NO_DEVICE`.
- **Chỉ đánh dấu nút sáng khi driver trả `APPLIED`** (hiện tại Menu sáng nút trước và bất kể kết quả: `renderer.js:504-519`). Đây là điểm khác biệt chính cần sửa ở task sau.
- Chính sách khôi phục khi mở lại app: hiển thị trạng thái đã lưu như "chưa xác nhận" (hiện chỉ gắn lại class, không gửi lệnh: `renderer.js:1701`, `:1750-1757`).
- Phối hợp với **FX Auto** (điều khiển Send): preset không được âm thầm ghi đè Send; quy tắc ưu tiên phải do Khói quyết (mở).
- REMIX: có trong UI/phím tắt nhưng chưa có action (`actionRegistry.js`): cần quyết định giữ hay bỏ.

## 3. Tầng driver (mỗi DAW/phiên bản một driver)
| Driver | Cơ chế | Cần từ người dùng |
|---|---|---|
| `fsp8` | Phím tắt tới macro, hoặc MIDI qua device map của FSP8 | Phiên bản, tên exe, macro/phím do Khói tự gán |
| `cubase13` | Key Command (PLE) hoặc Generic Remote/MIDI Remote | Key Command thật của Khói, cổng MIDI |
| `cubase10-12` (sau này) | Key Command khác (F11 = REMIXC) | Chỉ khi dùng bản đó |
- Mỗi driver khai báo **khả năng** (`hotkey`, `midi`, `mute`, `send`…) để Menu biết cái gì làm được.
- Menu đã có `dawMidiOutMappings[daw][action]` (`source USER_DEFINED`) và `executeAction` trả NOT_CONFIGURED/NO_DEVICE (`actionRegistry.js:186-246`) — tái sử dụng, **không tự đặt CC/Note/phím mặc định**.

## 4. Nguyên tắc
1. Người dùng tự gán lệnh (hoặc dán lệnh đã kiểm chứng); Menu **không** gắn mặc định.
2. Không đoán tên kênh/track; ánh xạ theo cấu hình của người dùng.
3. Mỗi driver chỉ tuyên bố "đã áp dụng" khi có tín hiệu xác nhận (nếu DAW không phản hồi → trạng thái `SENT_UNCONFIRMED`).
4. Send/Volume/Mute/bypass là **các loại action riêng**, không gộp trong một preset ngầm.
5. Không thay đổi UI/HTML nếu không được duyệt.

## 5. Điều kiện trước khi làm code
- Khói gửi lại `KET_QUA_VERIFY04` (hoặc dữ liệu tương đương) để chốt driver FSP8.
- Chốt cơ chế PDL thật (H1–H5 ở `01`) nếu muốn bám PDL.
- Khói duyệt kiến trúc này.
