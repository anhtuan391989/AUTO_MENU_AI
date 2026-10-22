# 04 — Bằng chứng về điều khiển bên ngoài (Macro / MIDI / phím / External Device)

Nhãn: `VERIFIED_FILE` · `INFERRED` · `UNKNOWN` · `BLOCKED`. Chưa có `VERIFIED_RUNTIME`.
Quét tự động mọi file `.xml/.txt` của session: `evidence/external-control-scan.txt`, `evidence/control-surfaces.md`.

## A. Project thực sự lưu gì về điều khiển ngoài

| Hạng mục | Tìm thấy trong session | Nhãn |
|---|---|---|
| **Macro** (macro toolbar, `.studioonemacro`) | **Không có.** Macro là cài đặt ứng dụng, không nằm trong file session. Chỉ thấy khối `MacroControls` (12 khối, mọi giá trị mặc định `color=0`) — đó là **macro điều khiển insert** của kênh, không phải macro lệnh — và 2 khung `DetachedMacroPanel` (ẩn) trong bố cục cửa sổ | `VERIFIED_FILE` |
| **Key command / phím tắt** | Không có (0 kết quả cho `KeyCommand`, `Shortcut`) | `VERIFIED_FILE` |
| **MIDI mapping (CC / Note / Program Change)** | Không có (0 kết quả `ControlChange`, `MidiBinding`, `ProgramChange`) | `VERIFIED_FILE` |
| **External Device** | `surfacemanager.xml` khai báo 9 thiết bị: `New Keyboard`×2, **`loop`**, **`AUTO MENU AI`**, `New Control Surface`×3, `Control`, `Studio Control`. **Không thiết bị nào có lệnh/điều khiển được gán** (3 thiết bị có 1 "trang gán" rỗng) | `VERIFIED_FILE` |
| Tên cổng MIDI / địa chỉ / ID mapping | Không có (`musiciomanager.xml`, `musicdevicemanager.xml` rỗng). Tên thiết bị `loop`, `AUTO MENU AI` chỉ là tên do người dùng đặt | `VERIFIED_FILE` |
| Cửa sổ `MidiMonitor` | Có trong bố cục cửa sổ (`perspective.xml`) → từng mở MIDI Monitor; **không** cho biết lệnh nào | `VERIFIED_FILE` (chỉ là trạng thái cửa sổ) |
| `RemoteBank` | Có: 8 kênh (gồm 4 bus ẩn) — danh sách kênh dành cho thiết bị điều khiển ngoài | `INFERRED` (ý nghĩa), `VERIFIED_FILE` (nội dung) |

## B. Kết luận cho việc "PDL dùng gì"
- **Không được** khẳng định PDL dùng MIDI CC hay Note dựa trên session FSP8 — session **không chứa** ánh xạ MIDI/macro/phím nào.
- Sự có mặt của thiết bị `loop`, `AUTO MENU AI` chỉ cho biết Khói **từng khai báo** hai External Device với các tên đó. Nơi lưu **ánh xạ lệnh** của chúng (nếu có): `UNKNOWN` (không nằm trong file session; vị trí cài đặt người dùng chưa kiểm).
- PDL: vẫn `UNKNOWN` (VERIFY-06 `02`). Cần log thật.

## C. Cấu hình ≠ đã chạy — cách phân biệt
| Loại bằng chứng | Chứng minh được gì | Có trong dữ liệu hiện tại? |
|---|---|---|
| Cấu hình (macro/gán MIDI/phím) | lệnh **có thể** được gọi | Không (UNKNOWN) |
| Log MIDI ngoài (MIDI-OX/MIDIberry/MIDI Monitor) | Menu/PDL **đã gửi** message nào, khi nào | Không |
| Log telemetry của Menu (`FX_AUTO`, `FX_AUTO_DIAG`) | Menu **đã gọi** lệnh gửi, kết quả `ok/NOT_CONFIGURED/NO_DEVICE` — **không** nói DAW đã đổi | Có sẵn cơ chế, chưa có log của Khói |
| Trạng thái DAW trước–sau (ảnh Console, hoặc lưu bản sao rồi so XML) | DAW **đã đổi** thật | Không (cần test) |
Chỉ khi có **ba lớp**: log gửi + log nhận (hoặc ảnh sau) + trạng thái trước–sau, mới được gắn `VERIFIED_RUNTIME`.

## D. Cơ chế điều khiển ứng viên (CHƯA kiểm — chỉ để lập test)
| # | Cơ chế | Điều biết | Điều chưa biết |
|---|---|---|---|
| M-a | Macro (Macro Organizer) gán phím hoặc MIDI qua panel External | Macro tồn tại; PDL dùng macro lệnh `Mute` (category Track) | Có lệnh **Send On/Off / bypass insert** trong danh sách lệnh macro không? `Mute` có tác động bus (`AudioGroupChannel`) không? |
| M-b | Key command gán trực tiếp | FSP8 có Keyboard Shortcuts | Có phím cho Send/bypass không? |
| M-c | MIDI CC/Note qua External Device (`Assign Command`) | Tài liệu: gán lệnh qua External | Có gán được CC tuyệt đối cho Send/bypass không? (tài liệu im lặng) |
| M-d | Điều khiển bề mặt (Mackie/HUI-kiểu) qua `RemoteBank` | Session có `RemoteBank` 8 kênh | Có hỗ trợ Send On/Off không? |
| M-e | Click toạ độ chuột (đường có sẵn trong Menu: `getMouseCoordinate`) | Menu có cơ chế | Mong manh: phụ thuộc bố cục Console, bus bị ẩn |
Tài liệu hãng **không** mô tả điều khiển ngoài cho Send (`evidence/manual-excerpts.txt`) → mọi dòng "có thể" ở trên là **`UNKNOWN`** cho tới khi test T4–T6 (`05`).

## E. Cách thu thêm (Khói; chỉ nhìn/chụp/lưu bản sao)
1. Macro Organizer: danh sách macro, cột Shortcut; thử ô tìm lệnh gõ `Send`, `Bypass`, `Mute` xem có lệnh nào (chụp).
2. Panel External: thiết bị `loop` và `AUTO MENU AI` có lệnh gán không (chụp).
3. Keyboard Shortcuts: tìm `send`, `bypass`, `mute`.
4. Mở MIDI Monitor trong FSP8 (đã có cửa sổ) khi bấm 1 nút trong Menu/PDL → chụp.
