# 01 — Bản đồ track, bus và định tuyến (session `save new 2.1.song`)

Nhãn: `VERIFIED_FILE` (đọc trực tiếp từ file) · `INFERRED` · `UNKNOWN`. **Không có mục nào là `VERIFIED_RUNTIME`.**
Đây là **trạng thái lúc Khói lưu file** (file nén ghi 2026-10-20 16:34, build `Studio Pro/8.0.0.110141`), không phải trạng thái đang chạy.
Bảng đầy đủ do script đọc-chỉ (`tools/fsp8_audit_dump.py`) sinh ra: `evidence/channels.md`, `evidence/record-inputs-and-audio-io.md`.

## A. Đối tượng tìm thấy (loại = tên thẻ XML trong `Devices/audiomixer.xml`)

| # | Tên chính xác (`label`) | Loại (thẻ XML) | ID nội bộ (`UID`) | Mute | Solo | Gain (dB) | → Đích |
|---|---|---|---|---|---|---|---|
| 1 | `Beat` | `AudioTrackChannel` (stereo) | `{9178B3CE-64D9-400F-A52D-14B342CF50F9}` | 0 | 0 | 0 | `Main` |
| 2 | `Mic` | `AudioTrackChannel` (mono) | `{ABB57F27-49C9-46EC-B5BD-E7E87258BAEE}` | **1** | 0 | 0 | `Group Mic` |
| 3 | `Không Dây` | `AudioTrackChannel` (mono) | `{18B01056-BE4A-4A28-9F2C-4D5006D05921}` | **1** | 0 | 0 | `Group Mic` |
| 4 | `Group Mic` | `AudioGroupChannel` | `{1877C4FD-9F1F-4ADE-8118-0CEAEA31DD0D}` | 0 | 0 | 0 | `Main` |
| 5 | `Verb ngắn` | `AudioGroupChannel` | `{11375C89-070B-441D-B720-29D8CA5FA7C4}` | 0 | 0 | −12 | `Main` |
| 6 | `Verb dài` | `AudioGroupChannel` | `{94208E07-FC35-434C-A7FE-42DCF8AADD77}` | 0 | 0 | −18 | `Main` |
| 7 | `Delay` | `AudioGroupChannel` | `{C408C505-BD70-46A1-A963-A9DD3C273747}` | 0 | 0 | −22 | `Main` |
| 8 | `Com Verb` | `AudioGroupChannel` | `{CDB25440-EE1A-4E7D-B755-4D768255B0BC}` | 0 | 0 | −30 | `Main` |
| 9 | `Main` | `AudioOutputChannel` | `{EECFAF83-D060-424A-8F31-B9DD1235C8A5}` | 0 | 0 | 0 | thiết bị ASIO |
| 10–12 | `Input L+R`, `Input L`, `Input R` | `AudioInputChannel` | `{DE69ED88-…}`, `{BD624AA4-…}`, `{16EE81C1-…}` | – | – | 0 | – |

Ghi chú:
- Không có kênh loại **FX Channel** (`AudioEffectChannel`) và không có track nhạc cụ (instrument). **Bốn kênh `Verb ngắn / Verb dài / Delay / Com Verb` là kênh loại bus/group (`AudioGroupChannel`)**, dùng như "đường trả hiệu ứng". Session mẫu của PDL thì dùng `AudioEffectChannel`. Tài liệu hãng nói Send tới Bus "ít phổ biến hơn" nhưng được phép (`evidence/manual-excerpts.txt`).
- Tên nội bộ (`name="Channel07"`…) khác nhãn hiển thị; macro/lệnh theo **tên hiển thị** (`label`).
- 4 bus hiệu ứng **ẩn** trong mixer (`mixerconsole.xml`: `visible="0"`), nhưng có trong `RemoteBank` (8 kênh: Beat, Mic, Không Dây, Group Mic, Delay, Verb ngắn, Verb dài, Com Verb). Ý nghĩa của `RemoteBank` (kênh hiện cho thiết bị điều khiển ngoài): **INFERRED**, chưa có tài liệu.
- Số liệu `gain` là hệ số tuyến tính (0,251 = −12 dB). Tên trường: `gain`, đơn vị lưu = hệ số, không phải dB.
- Track nằm trong `Song/song.xml` chỉ có 3 (`Beat`, `Mic`, `Không Dây`); `Com Verb` có thêm một `AutomationTrack` ẩn (xem `02`).

## B. Tín hiệu đi đâu (routing)

```
Mic (Input R) ──┐
                ├─► Group Mic ─► Main ─► thiết bị ASIO
Không Dây (Input L) ┘     │
                          ├─ Send01 ─► Verb ngắn ─► Main
                          ├─ Send02 ─► Verb dài ─► Main
                          ├─ Send03 ─► Main (−20 dB)
                          ├─ Send04 ─► Delay ─► Main
                          ├─ Send05 ─► sidechain "C1 gate" trong Verb ngắn
                          ├─ Send06 ─► sidechain "C1 gate" trong Verb dài
                          └─ Send08 ─► Com Verb ─► Main
Beat (Input L+R) ─► Main            (Beat KHÔNG qua Group Mic, KHÔNG có Send)
```
- Đầu vào (`RecordUnit/recordPort`): `Beat` ← `Input L+R`; `Không Dây` ← `Input L`; `Mic` ← `Input R`. Cả 3 `recordArmed=1`, `monitorActive=1`. (`VERIFIED_FILE`)
- Ánh xạ cổng thiết bị (`Devices/audioiomanager.xml`): `Input L+R` ↔ cổng 02/03, `Input L` ↔ 00, `Input R` ↔ 01 của thiết bị ASIO; có 3 cấu hình thiết bị: **"Link Pro"** (64 vào/64 ra), **"Focusrite USB"** (4/2), **"Windows Audio"** (2/2) — cùng ánh xạ cổng; thiết bị nào đang dùng khi chạy: `UNKNOWN`.
- Nhận tín hiệu **Mic** (giọng) = `Mic`, `Không Dây`; **Music/Beat** = `Beat`. Đây là suy ra từ **tên track** (`INFERRED`: file không ghi "đây là nhạc/giọng"). `Main` nhận tổng `Beat` + `Group Mic` + các bus hiệu ứng + `Send03`.
- Số liệu Send07 **không tồn tại** (đánh số nhảy 06 → 08): `VERIFIED_FILE`; lý do: `UNKNOWN`.

## C. Không xác minh được từ file
| Điều | Vì sao |
|---|---|
| Thiết bị âm thanh đang dùng khi chạy | file chỉ liệt kê 3 cấu hình, không ghi cấu hình đang bật |
| Trạng thái hiện tại trong DAW (Mute/Send đang bật hay tắt) | file chỉ có trạng thái lúc lưu |
| Tên `.exe` của FSP8 | không có trong file |
| Có phải `Beat` là "nhạc" thật từ hệ thống (Link Pro) | file chỉ cho tên cổng, không cho nguồn |
