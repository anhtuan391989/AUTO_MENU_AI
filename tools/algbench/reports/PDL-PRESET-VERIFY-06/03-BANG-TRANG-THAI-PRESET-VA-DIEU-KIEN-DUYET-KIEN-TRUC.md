# 03 — Bảng trạng thái NORM / LOFI / RAP / REMIX & điều kiện tối thiểu trước khi duyệt kiến trúc

Cập nhật từ `PDL-PRESET-VERIFY-05/01`. Dữ liệu mới: session FSP8 thật (E11) → các ô "ánh xạ sang project" chuyển từ BLOCKED sang kết luận từng phần (xem `04`). Chưa có log PDL/macro/phím nên **không có ô nào lên mức "đã test thật"**.

## A. Bảng trạng thái từng preset

| Hạng mục | NORM | LOFI | RAP | REMIX |
|---|---|---|---|---|
| Macro Studio One tồn tại (đọc file) | VERIFIED | VERIFIED | VERIFIED | VERIFIED |
| Hiệu ứng macro: Mute track NORM/LOFI/REMIX | 0 / 1 / 1 | 1 / 0 / 1 | 0 / 1 / 1 | 1 / 1 / 0 |
| Hiệu ứng macro: Mute FX DELAY/VERB1/VERB2 | 0/0/0 | 0/0/0 | 0/**1**/0 | 0/0/0 |
| (ý nghĩa `State 1 = Mute`) | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Send trong macro/PLE | Không có (VERIFIED) | Không có | Không có | Không có |
| Phím gắn macro (Studio One mẫu) | Không | Không | Không | Không |
| Cubase 13–15 Key Command | F9 `NORMC` | F10 `LOFIC` | F11 `RAP`, F12 `RAPC` | **không có** |
| Gán MIDI CC/Note trong file PDL | Không thấy | Không thấy (chỉ EQ CC20 ở PJ 01 = INFERRED) | Không thấy | Không thấy (CC21 không gán) |
| PDL kích hoạt bằng CC | **UNKNOWN** | UNKNOWN | UNKNOWN | UNKNOWN |
| PDL kích hoạt bằng Note | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| PDL kích hoạt bằng phím tắt | INFERRED (khả năng) | INFERRED | INFERRED | UNKNOWN (Cubase không có phím) |
| PDL kích hoạt bằng click toạ độ | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| `mode_overrides` | UNKNOWN (chỉ tên) | UNKNOWN | UNKNOWN | UNKNOWN |
| Menu hiện tại có action | `PRESET_NORM` | `PRESET_LOFI` | `PRESET_RAP` | **không có** (chỉ cảnh báo) |
| Menu: nút sáng chỉ khi lệnh thành công? | Không (sáng trước, bất kể kết quả) — VERIFIED (probe mock) | Không | Không | n/a |
| Ánh xạ sang session FSP8 của Khói (`04`) | Track `NORM` không có; mute track không áp dụng | `Lofi` insert trên Group Mic (bypass) = ứng viên, INFERRED | Không đoán theo tên (UNKNOWN) | `IL Gross Beat`/`PanCake2` = ứng viên, INFERRED |
| Test trên DAW/PDL/MIDI thật | **BLOCKED_USER_TEST** | BLOCKED_USER_TEST | BLOCKED_USER_TEST | BLOCKED_USER_TEST |

## B. Điều kiện tối thiểu TRƯỚC KHI duyệt kiến trúc (spec ở `05`)

"Duyệt kiến trúc" = Khói cho phép mở task code. Cần đạt **M1–M5**; M6–M7 tuỳ chọn.

| ID | Điều kiện | Cách đạt | Hiện tại |
|---|---|---|---|
| M1 | DAW mục tiêu đã chốt (FSP8 và/hoặc Cubase 13) + phiên bản + tên `.exe` | B4 (KHOI-01/02) | ◐ FSP8 8.0.0.110141 có trong file; thiếu tên `.exe` |
| M2 | Với DAW mục tiêu: đã biết **đường gọi preset có sẵn trên máy Khói** (phím gán macro/Key Command hoặc ánh xạ MIDI) — chụp ảnh | B5 (KHOI-01 bước 2 / KHOI-02) | ✗ |
| M3 | Đã biết tên kênh FX và Send **thật** của project Khói + trạng thái trước–sau khi chạy macro/phím (Mute vs Send tách riêng) | B6 | ◐ Tên/Send/mức tĩnh **đã có** (E11); thiếu trước–sau và nghĩa của `bypass` trên Send |
| M4 | Quyết định của Khói: "preset" nghĩa là gì trên project không có track preset (ví dụ bật/tắt insert `Lofi`/`Gross Beat`/`PanCake2`? mute bus hiệu ứng? bật/tắt Send? bỏ NORM/LOFI/REMIX-track?) | Khói trả lời (dựa trên `04`) | ✗ chờ Khói |
| M5 | Quy tắc ưu tiên giữa preset và **FX Auto** (ai được ghi Send) | Khói quyết | ✗ |
| M6 | Log PDL thật cho ít nhất RAP hoặc NORM (chốt CC/Note/phím) | B2, B3 | ✗ (chỉ cần nếu muốn **bám y PDL**) |
| M7 | Quyết định REMIX: giữ (cần đường kích hoạt) hay bỏ | Khói quyết | ✗ |

**Trạng thái tổng: `BLOCKED_USER_TEST`** — M1, M3 đạt một phần; M2, M4, M5 chưa đạt.
Lý do tách M6/M7 tuỳ chọn: Menu có thể có cơ chế riêng (user tự gán lệnh) mà không cần biết PDL gửi gì; M6 chỉ cần khi mục tiêu là sao chép hành vi PDL.
