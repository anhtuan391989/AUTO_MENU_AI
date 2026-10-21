# 04 — Bản đồ Fender Studio Pro 8 (chỉ dùng dữ liệu thực tế đã xác minh)

Thay thế cách trình bày của `PDL-PRESET-VERIFY-05/02` (không xoá file đó).
**Dữ liệu mới so với VERIFY-05:** Khói đã đưa session FSP8 thật lên main (`Project FSF8.zip`, commit `7706f3b5`) — xem `evidence/fsp8-session-provenance.txt`. Đây **không** phải `KET_QUA_VERIFY04` và **không** có log PDL/MIDI.
Quy tắc: chỉ ghi điều có nguồn; ô còn lại = `BLOCKED`. Không tạo track giả, không yêu cầu đổi tên track/kênh, không sửa cấu hình DAW. Mọi số liệu dưới đây là **trạng thái lúc Khói lưu file** (đọc file, chưa chạy DAW).

## A. Dữ liệu đã xác minh từ file session (VERIFIED — đọc file)

Nguồn: `evidence/fsp8-session-analysis.txt` (sinh bằng `tools/fsp8_session_dump.py`, chỉ đọc).

| # | Dữ kiện | Giá trị |
|---|---|---|
| F1 | Phiên bản ghi trong file | `Studio Pro/8.0.0.110141`, FormatVersion 9 (tên `.exe` thật: **chưa biết**) |
| F2 | Track thật trong session | `Beat` (không mute, → Main), `Mic` (**mute**, → Group Mic), `Không Dây` (**mute**, → Group Mic). **Không có** track NORM/LOFI/REMIX (khớp lời Khói) |
| F3 | Kênh loại bus (`AudioGroupChannel`) | `Group Mic` (→ Main, hiện trong mixer), `Verb ngắn` (−12 dB), `Verb dài` (−18 dB), `Delay` (−22 dB), `Com Verb` (−30 dB) — 4 kênh sau **ẩn** trong mixer (`visible=0`), đều → Main, không mute |
| F4 | Send (chỉ nằm trên `Group Mic`) | Send01→Verb ngắn (≈0 dB) · Send02→Verb dài (−0,2 dB) · Send03→Main (−20,1 dB) · Send04→Delay (≈0 dB) · Send05→sidechain của `C1 gate` trong Verb ngắn (+0,1 dB) · Send06→sidechain của `C1 gate` trong Verb dài (+0,1 dB) · Send08→Com Verb (−6 dB). Không có Send07. Tất cả `prefader=0`, `bypass=1` |
| F5 | Insert đáng chú ý trên `Group Mic` | `Tạo màu`, `Silk Vocal Live Mono` (không bypass); **`Lofi`, `IL Gross Beat`, `PanCake2` (bypass=1)** |
| F6 | Thiết bị ngoài khai báo trong session | `loop`, `AUTO MENU AI`, `Studio Control`, `Control`, `New Keyboard`, `New Control Surface` — **không có lệnh nào được gán** trong file session (nơi lưu gán thật nếu có: UNKNOWN) |
| F7 | Macro / phím tắt | Không nằm trong file session → không biết (xem B6) |

### Khác biệt với session mẫu của PDL (`evidence/pdl-sample-song-analysis.txt`, Studio One 5.3)
| Điểm | Mẫu PDL | Session của Khói |
|---|---|---|
| Track preset | `NORM`, `LOFI`, `REMIX` (+`Beat`, `LIVE`) | **Không có** |
| Kênh hiệu ứng | `DELAY`, `VERB1`, `VERB2` — lớp **`AudioEffectChannel`** | `Verb ngắn`, `Verb dài`, `Delay`, `Com Verb` — lớp **`AudioGroupChannel`** (bus), tên khác |
| Nơi đặt Send | `Master Vocal` (nhóm) → DELAY/VERB1/VERB2, `bypass=0` | `Group Mic` (nhóm) → 4 kênh + 2 sidechain, `bypass=1` |
| Cấu trúc | track giọng → nhóm → Send → kênh hiệu ứng | giống cấu trúc (Mic/Không Dây → Group Mic → Send → bus hiệu ứng) |

Ý nghĩa của `bypass` trên Send: mẫu PDL `bypass=0`, session Khói `bypass=1`; với insert, `bypass=1` đi cùng plugin đang tắt (VD: toàn bộ chain `Không Dây` đang tắt khi track mute) → **INFERRED**: Send `bypass=1` = Send đang tắt ở trạng thái lưu. **Cần Khói nhìn nút Send On/Off trong Console để xác nhận** (B6).

## B. Bản đồ chức năng PDL → session của Khói

| Chức năng PDL (VERIFIED trong file PDL) | Đối tượng trong session Khói | Kết quả | Nhãn |
|---|---|---|---|
| Mute track `NORM`/`LOFI`/`REMIX` (macro) | Không có (F2) | **Không áp dụng** | VERIFIED |
| Mute kênh `DELAY`/`VERB1`/`VERB2` (macro, tìm theo **tên**) | Tên khác: `Verb ngắn`/`Verb dài`/`Delay`/`Com Verb`; lớp khác (F3) | Macro PDL **không thể khớp theo tên** trừ khả năng `Delay`≈`DELAY` (so khớp hoa/thường: UNKNOWN). Hành vi khi không tìm thấy kênh: UNKNOWN (cần chạy thật) | VERIFIED (tên/lớp) · UNKNOWN (hành vi) |
| Mute/Unmute một kênh | `Mute` có ở mọi kênh (F3, `mute=0/1`) | Có đối tượng; chưa biết lệnh DAW nào do PDL/Menu gọi | VERIFIED (đối tượng) |
| Volume kênh hiệu ứng (MIDI Remote Cubase) | Gain của 4 bus hiệu ứng (F3) | Có đối tượng tương ứng về chức năng | VERIFIED (đối tượng) · UNKNOWN (cách FSP8 điều khiển bằng MIDI) |
| **Send** | 7 Send trên `Group Mic` (F4) | Có đối tượng; PDL **không** có bằng chứng điều khiển Send → "PDL điều khiển Send" vẫn **UNKNOWN**. Send là phạm vi của Menu/FX Auto | VERIFIED (đối tượng) |
| "Chất lofi" (insert trên track LOFI ở mẫu) | Insert `Lofi` trên `Group Mic`, đang bypass (F5) | Ứng viên tương ứng theo **tên plugin** | INFERRED — Khói xác nhận (M4) |
| "Chất remix" (insert trên track REMIX ở mẫu) | `IL Gross Beat`, `PanCake2` trên `Group Mic`, đang bypass (F5) | Ứng viên theo tên plugin | INFERRED — Khói xác nhận |
| RAP (tắt VERB1) | Chưa rõ kênh nào của Khói | Không ghi tương ứng (không đoán theo tên) | UNKNOWN |
| Mic/Vang bật–tắt (BatMic/TatMic…) | Track `Mic`, `Không Dây` (mute) + bus hiệu ứng | Có đối tượng; phím/macro tương ứng trên máy Khói: BLOCKED (B5) | VERIFIED (đối tượng) · BLOCKED |
| Preset REMIX | — | UNKNOWN (PDL không có đường kích hoạt trong file) | UNKNOWN |

## C. Điều có thể kết luận ngay
1. Session của Khói cùng **kiểu kiến trúc** với mẫu PDL (nhóm giọng → Send → bus hiệu ứng) nhưng **khác tên và khác lớp kênh**, nên macro PDL (tìm theo tên) không thể dùng nguyên trạng.
2. Ba loại điều khiển có đối tượng riêng, cần ghi riêng: **Mute kênh**, **Send (mức/bật-tắt)**, **bypass insert** (`Lofi`/`Gross Beat`/`PanCake2`).
3. Preset kiểu "đổi track" không áp dụng (không có track NORM/LOFI/REMIX).
4. Không tạo track giả hay đổi tên là hướng đúng: ánh xạ phải dùng tên thật của Khói (`targetRef` do người dùng khai báo).

## D. Chưa thể kết luận (BLOCKED / UNKNOWN)
| ID | Thiếu | Cách bổ sung |
|---|---|---|
| B4 | Tên `.exe` FSP8 (phiên bản đã có ở F1) | KHOI-01 bước 1 (Task Manager > Details) |
| B5 | Macro Organizer: có macro nào? cột Shortcut? Macro Toolbar? External | KHOI-01 bước 2 |
| B6 | Trạng thái **trước–sau** khi bấm từng nút; nút Send On/Off khớp `bypass`; Mute macro có tác động bus hiệu ứng | KHOI-01 bước 3–4 (ảnh Console) |
| B2/B3 | Log PDL/MIDI thật | `02` |
| B1 | `KET_QUA_VERIFY04` | `01` |
