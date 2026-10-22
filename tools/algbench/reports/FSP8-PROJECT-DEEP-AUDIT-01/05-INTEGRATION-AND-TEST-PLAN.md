# 05 — Tích hợp với AUTO_MENU_AI (driver/adapter) và kế hoạch thử nghiệm tối thiểu

Chỉ **đặc tả và kế hoạch**. Không đề xuất ứng dụng thay thế Menu; chỉ mở rộng cách Menu gọi DAW qua driver riêng.
Nhãn: `VERIFIED_FILE` · `INFERRED` · `UNKNOWN` · `BLOCKED_USER_TEST`. Chưa có `VERIFIED_RUNTIME`.

## A. Bản đồ điều khiển theo driver

Trạng thái kết quả dùng: `APPLIED` (có xác nhận từ DAW) · `SENT_UNCONFIRMED` (đã gửi, không có phản hồi) · `FAILED` · `NOT_CONFIGURED` · `NO_DEVICE`.
Tương ứng với Menu hiện tại (`actionRegistry.js`): `ok:true`→`SENT_UNCONFIRMED` (không bao giờ `APPLIED` nếu DAW không phản hồi); `reason NOT_CONFIGURED`→`NOT_CONFIGURED`; `NO_DEVICE`→`NO_DEVICE`; `ERROR`/`TIMEOUT`→`FAILED`. `MOUSE_DISABLED` giữ như hiện có.

### A1. Driver `fsp8` (Fender Studio Pro 8, session `save new 2.1`)
| Lệnh Menu | Đối tượng đích (định danh) | Cơ chế cần kiểm | Xác nhận | Đối tượng thiếu / đổi tên | Rủi ro |
|---|---|---|---|---|---|
| `FX_SEND_REVERB` On/Off | Send trên `Group Mic` do Khói chỉ định (gợi ý: Send01 `{451C4A28…}` / Send02 `{66B086E2…}`; sidechain Send05/06 nếu cần) | M-a macro, M-b key, M-c MIDI External, M-e click (`04`) — **chưa cái nào xác minh** | `SENT_UNCONFIRMED` | Khoá chính = **tên hiển thị + chủ + đích** (`Group Mic/Send01→Verb ngắn`); UID chỉ là gợi ý. Không tìm thấy → `NOT_CONFIGURED` + liệt kê đối tượng hiện có | Send08 **không có UID**; đổi tên bus làm gãy khoá tên |
| `FX_SEND_DELAY` On/Off | Send04 `{22F658C8…}` (→ bus `Delay`) | như trên | `SENT_UNCONFIRMED` | như trên | như trên |
| Mức Send (mới; hiện **chưa có** action) | `Send.level` (hệ số tuyến tính) | M-c (CC tuyệt đối) nếu hỗ trợ | `SENT_UNCONFIRMED` | như trên | chuyển CC→dB chưa biết (UNKNOWN) |
| Mute bus (mới) | `Verb ngắn`/`Verb dài`/`Delay`/`Com Verb` (UID ở `01`) | macro `Mute` (category Track; tác động bus: UNKNOWN), key, MIDI | `SENT_UNCONFIRMED` | tên | bus ẩn trong mixer → click toạ độ không dùng được |
| Bypass insert (mới) | `Group Mic/FX09 Lofi`, `FX05 IL Gross Beat`, `FX08 PanCake2` (UID deviceData ở `evidence/inserts.md`) | macro/key/MIDI; automation `vstp1652125811` đã thấy cho VST3 | `SENT_UNCONFIRMED` | tên hiển thị do người dùng sửa được ("Lofi" ≠ plugin) | VST2 (Gross Beat/PanCake2) có thể khác tham số bypass |
| Volume bus (mới) | `gain` bus | MIDI CC (UNKNOWN) | `SENT_UNCONFIRMED` | tên | — |
| Preset NORM/LOFI/RAP/REMIX | danh sách bước (`03` mục D) do Khói định nghĩa | `trigger` hoặc chuỗi bước | `SENT_UNCONFIRMED` / dừng ở bước FAILED đầu tiên | bước có đối tượng thiếu → `NOT_CONFIGURED` | xung đột FX Auto (`03` mục C) |

### A2. Driver `cubase13` (mở rộng sau: Cubase 10–15)
| Lệnh | Cơ chế | Bằng chứng hiện có | Nhãn |
|---|---|---|---|
| Preset | Key Command → PLE (F9 `NORMC`, F10 `LOFIC`, F11 `RAP`, F12 `RAPC` ở 13–15; REMIX không phím) | VERIFY-04/05 | `VERIFIED_FILE` (file PDL) |
| Volume/Mute kênh, tham số insert | MIDI Remote gắn **theo đường dẫn đối tượng** (`VST Mixer\Channels\FxChannel 5`, tag 1025=volume, 1027=mute) | PJ 01/02/03 | `VERIFIED_FILE` |
| Send | không có đích Send trong dữ liệu PDL | VERIFY-05 | `UNKNOWN` |
Cubase 10–15 và Studio One 5–7: **tương thích chưa xác minh** (key command khác nhau giữa 10–12 và 13–15; session mẫu PDL là Studio One 5.3, FormatVersion 6, của Khói là 8.0 FormatVersion 9) → mỗi phiên bản là một driver riêng, bật khi có bằng chứng.

### A3. Giao diện chung (đặc tả)
```
Driver.capabilities() -> { trigger, mute, send_onoff, send_level, plugin_bypass, plugin_param, fx_volume }  // true/false
Driver.listObjects()  -> danh sách đối tượng người dùng chọn (đọc từ session hoặc do người dùng nhập)
Driver.apply(step)    -> { status, detail }
```
- Khoá đối tượng = **tên hiển thị + loại + chủ** (người dùng đọc được); UID là gợi ý phụ (đổi theo project). Khi tên đổi: không đoán, báo `NOT_CONFIGURED` kèm danh sách.
- Nạp danh sách đối tượng bằng cách đọc file `.song` (chỉ đọc; là **ảnh chụp lúc lưu**, cần cảnh báo "có thể cũ").
- `APPLIED` chỉ khi có phản hồi từ DAW (hiện chưa có đường phản hồi nào được biết) → v1 dừng ở `SENT_UNCONFIRMED`.
- Mất cổng MIDI → `NO_DEVICE`; đổi project/phiên bản → đối tượng không khớp → `NOT_CONFIGURED`.

## B. FX Auto — hiện trạng và việc cần có để đúng yêu cầu (bật ≤1 s, tắt sau 1 s, giữ thủ công 1 phút)
| Yêu cầu | Mã Menu hiện tại (đọc mã) | Đã đo thật? |
|---|---|---|
| Bật trong ≈1 s khi có nhạc | cửa sổ xác nhận 500 ms (≥80% khung > −45 dBFS) + tick 100 ms ⇒ ≈0,5–0,7 s | **Chưa** (log chỉ có thời điểm chuyển trạng thái) |
| Tắt sau 1 s im lặng | `confirmSilenceMs=1000` (≤2% khung > −52 dBFS) ⇒ ≈1,0–1,15 s | **Chưa** |
| Giữ thủ công 1 phút | `manualHoldMs=60000`; hết hạn → theo trạng thái nhạc hiện tại | **Chưa** đo độ dài |
| Lệnh thật tới DAW | `NOT_CONFIGURED` trong **mọi** log đã đọc (`evidence/menu-fx-auto-log-summary.txt`) ⇒ chưa lệnh Send nào được gửi | — |
Điều **thiếu** để hoàn tất không phải logic thời gian mà là **đường gửi Send tới FSP8** (chưa có mapping/cơ chế xác minh) và chọn Send nào thuộc "Reverb/Delay" (`03` mục C). Chế độ `absolute` (CC 127/0) phù hợp hơn `toggle` vì không đảo trạng thái khi mất đồng bộ — **nếu** FSP8 nhận được CC tuyệt đối cho Send On/Off (chưa biết).

## C. Kế hoạch thử tối thiểu (trước khi viết code)
Mọi bước "Khói làm" chỉ trên **bản sao** `TEST_PRESET`, đã che dữ liệu riêng (KHOI-00). Claude không gửi lệnh DAW, không đổi cấu hình.

| # | Test | Ai / Cách làm | Bằng chứng nộp | Trả lời câu hỏi |
|---|---|---|---|---|
| T0 | Tên `.exe` + phiên bản FSP8 | Khói: Task Manager → Details; Help→About (che mã) | ảnh | M1 |
| T1 | Console trước khi chạm gì | Khói: ảnh Console: 7 Send của `Group Mic` (nút On/Off, mức), 4 bus (Mute), 3 insert (bypass) | ảnh | Send `bypass=1` hiển thị thế nào |
| T2 | **Send On/Off ↔ trường nào** | Khói: trên bản sao chỉ bật/tắt Send04; Lưu thành `T2.song`; gửi | file `.song` | **Q1**: Claude so `bypass` (VERIFIED nếu trường đổi đúng) |
| T3 | Mức Send độc lập | Khói: chỉ đổi mức Send04; lưu `T3.song` | file | **Q2**: chỉ `level` đổi? |
| T4 | Mute bus / bypass insert | Khói: mute `Delay`; bypass `Lofi`; lưu `T4a/T4b.song` | file | **Q3**: `mute` / `bypass` đổi riêng |
| T5 | Sidechain Send05/06 | Khói: nghe reverb khi chỉ bật Send01/02, rồi bật thêm Send05/06 | ghi chú nghe | gate có mở không |
| T6 | Lệnh có sẵn trong Macro | Khói: Macro Organizer → tìm lệnh `Send`, `Bypass`, `Mute` | ảnh | M-a |
| T7 | Gán sẵn trong External/Shortcuts | Khói: External (`loop`, `AUTO MENU AI`), Keyboard Shortcuts (`send`,`bypass`) | ảnh | M-b/M-c |
| T8 | Đường MIDI ra của Menu (không cần DAW) | Khói: Menu gửi lệnh đã cấu hình tới cổng `loop`; MIDI-OX ghi message | ảnh/log | Menu có gửi đúng byte; `toggle` vs `absolute` |
| T9 | FX Auto thời gian | Khói: bật/tắt nhạc 3 lần + bấm tay 1 lần; gửi `logs/*.jsonl` | log | **Q4**: đo ≤1 s / 1 s / 60 s |
| T10 | Log PDL thật | theo `PDL-PRESET-VERIFY-06/02` | log | **Q6** |
Chỉ khi T2–T4 hoàn tất mới được coi trường On/Off/Mute/bypass là `VERIFIED_RUNTIME`; T6–T8 quyết định cơ chế gửi nào dùng được.

## D. Cập nhật 22/10 theo lời Khói và T2b/T2c
- Khói bật/tắt FX bằng **Send trên `Group Mic`, không dùng Mute kênh FX** (`VERIFIED_USER_STATEMENT`) ⇒ trong driver `fsp8`, các lệnh FX mặc định là **`send_onoff` trên `Group Mic`**; hàng "Mute bus (mới)" ở mục A1 là **tuỳ chọn phụ**, không dùng cho preset/FX Auto mặc định.
- T2 đã nhận (không sạch); **T2b/T2c đã nhận (sạch)**: trường điều khiển = `Send.bypass` (chiều 0=bật `INFERRED`), cả 7 Send đổi cùng lúc; mute bus độc lập (`06`). **T2 = xong một phần**, còn: xác nhận chiều, T2d/T2e (từng Send riêng), T3 (mức Send), T4 (bypass insert), T6–T10.
- Vẫn **chưa** biết cách gửi lệnh Send On/Off từ ngoài tới FSP8 (không có macro/phím/MIDI mapping trong cả 3 file).
