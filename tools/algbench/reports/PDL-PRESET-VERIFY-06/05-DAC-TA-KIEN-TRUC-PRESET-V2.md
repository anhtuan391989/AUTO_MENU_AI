# 05 — Đặc tả kiến trúc: logic preset dùng chung + driver theo DAW (v2, CHỈ ĐẶC TẢ)

Bổ sung cho `PDL-PRESET-VERIFY-05/04` (không xoá/viết đè). Đây là **thay đổi kiến trúc → cần Khói duyệt trước khi có task code** (xem điều kiện M1–M5 ở `03`). Không file mã nào bị đụng.

## 1. Thay đổi so với v1
| Điểm | v1 (VERIFY-05) | v2 (VERIFY-06) |
|---|---|---|
| Cổng duyệt | Nêu chung | Gắn với M1–M5 (`03`) |
| Mô hình lệnh | Mỗi preset → 1 lệnh | Preset = **danh sách bước** (step) có loại: `mute`, `fx_volume`, `send_level`, `plugin_param`, `trigger` (gọi macro/key command có sẵn) |
| Phân loại | Nêu nguyên tắc | Bảng "khả năng" của driver (§3) và quy tắc không gộp Mute/Send/Volume |
| Trạng thái | `APPLIED/FAILED…` | Thêm `SENT_UNCONFIRMED` (DAW không phản hồi → mặc định cho MIDI/phím) |

## 2. Tầng dùng chung (Preset core) — không biết DAW
- Dữ liệu cấu hình do người dùng sở hữu (không có mặc định CC/Note/phím):
  `preset{ id, label, steps[] }`, `step{ kind, targetRef, value }`; `targetRef` là **tên do người dùng nhập** (không đoán).
- Máy trạng thái: `IDLE → SENDING → (APPLIED | SENT_UNCONFIRMED | FAILED | NOT_CONFIGURED | NO_DEVICE)`.
- Quy tắc UI (cần Khói duyệt vì chạm hành vi nút): chỉ sáng nút khi `APPLIED`/`SENT_UNCONFIRMED` rõ ràng; khi `FAILED/NOT_CONFIGURED/NO_DEVICE` hiển thị lỗi thay vì sáng (hiện: sáng trước, bất kể kết quả — `renderer.js:504-519`).
- Khôi phục khi mở app: không gửi lại lệnh; đánh dấu "chưa xác nhận" (hiện chỉ gắn class — `renderer.js:1701`, `:1750-1757`).
- Trọng tài với **FX Auto**: preset **không ghi Send** trừ khi bước `send_level` được cấu hình rõ và FX Auto ở trạng thái OFF (quy tắc cuối do Khói quyết — M5).
- REMIX: tồn tại như một preset trống cho tới khi có đường kích hoạt (M7); UI hiện không đổi.

## 3. Tầng driver (mỗi DAW/phiên bản một driver)

| Driver | Cơ chế gọi | Khả năng khai báo | Điều kiện đưa vào dùng |
|---|---|---|---|
| `fsp8` | Phím tắt tới macro **do Khói tự gán** hoặc lệnh MIDI qua External map của FSP8 | `trigger`; `mute`/`send_level` chỉ khi có đường gọi (macro/MIDI) đã kiểm | M1, M2, M3 |
| `cubase13` | Key Command (PLE) hoặc MIDI Remote/Generic Remote do Khói gán | `trigger`; `fx_volume`/`mute`/`plugin_param` qua MIDI Remote (đã thấy trong file PDL) | M1, M2 (+ KHOI-02) |
| `cubase10-12` (sau) | Key Command bộ khác (F11 = REMIXC) | `trigger` | Chỉ khi dùng bản đó |

- Từ session thật của Khói (`04`): đích điều khiển gồm **mute kênh**, **bật/tắt + mức Send** (7 Send trên `Group Mic`), **bypass insert** (`Lofi`, `IL Gross Beat`, `PanCake2`), và kênh hiệu ứng là lớp bus (`AudioGroupChannel`), khác lớp `AudioEffectChannel` của mẫu PDL → `targetRef` phải gắn với **loại đối tượng** (`channel`/`send`/`insert`) chứ không chỉ tên.
- Driver chỉ **gửi** và báo kết quả; không biết tên preset hay giao diện.
- Phiên bản DAW khác nhau → driver khác nhau, **không** chia sẻ bảng phím/CC.
- `targetRef` được driver phân giải theo kiểu của DAW (tên với Studio One/FSP; đường dẫn/vị trí với Cubase) — người dùng không phải biết kiểu.

## 4. Giao diện hợp đồng (pseudo, không phải code cam kết)
```
Driver.capabilities() -> { trigger, mute, fx_volume, send_level, plugin_param }   // true/false từng khả năng
Driver.apply(step)    -> { status: APPLIED | SENT_UNCONFIRMED | FAILED | NOT_CONFIGURED | NO_DEVICE, detail }
PresetCore.run(preset) -> chạy steps tuần tự; dừng và báo lỗi tại bước đầu tiên FAILED
```
Menu đã có `dawMidiOutMappings[daw][action]` (`source USER_DEFINED`) và `executeAction` trả `NOT_CONFIGURED/NO_DEVICE` (`actionRegistry.js:186-246`) → tái sử dụng, không thêm mặc định.

## 5. Nguyên tắc cứng
1. Không tự đặt CC/Note/phím mặc định; không đoán tên track/kênh.
2. Mute, Send, Volume, plugin bypass là các `step.kind` riêng; không gộp ngầm.
3. Không sửa UI/HTML khi chưa được duyệt; không sửa cấu hình/preset DAW — Menu chỉ **gọi** lệnh người dùng đã tự gán.
4. Không kết luận "đã áp dụng" nếu DAW không phản hồi → dùng `SENT_UNCONFIRMED`.
5. Mọi hành vi mới phải có test mock + một bước người dùng kiểm trên DAW thật (đánh dấu `BLOCKED_USER_TEST` đến khi làm).

## 6. Cổng quyết định
`BLOCKED_USER_TEST` cho tới khi M1–M5 đạt (`03`). Sau đó Khói duyệt → mới mở task code (tách nhỏ: driver `fsp8` trước, core sau, UI chỉ khi được duyệt).
