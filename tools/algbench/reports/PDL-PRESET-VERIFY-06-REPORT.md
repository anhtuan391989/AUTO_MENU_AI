# PDL-PRESET-VERIFY-06-REPORT — Hoàn tất bằng chứng PDL & bản đồ Fender Studio Pro 8

Ngày: 2026-10-22 · Loại: nghiên cứu/đặc tả (không code, không commit, không push)
GitHub `main` HEAD khi kiểm: `7706f3b5` (kiểm lại ngay trước khi đóng gói). Bản local của sandbox `84f5810` là cũ → không dùng làm gốc.
Nhãn: VERIFIED (đọc file/GitHub) · VERIFIED_USER_STATEMENT · PARTIAL · INFERRED · UNKNOWN · BLOCKED · BLOCKED_USER_TEST.
**Không có kết quả nào là test PDL / MIDI / DAW thật.**

## Trạng thái tổng: `BLOCKED_USER_TEST`
Chưa có log PDL thật và chưa có dữ liệu hành vi (trước–sau) trên FSP8 → không chuyển sang code. Bước người dùng cần làm tiếp ở mục 6.

## 1. Kiểm tra bằng chứng (mục tiêu 1–2)
- **VERIFY-05 đã nằm trên main** (report + 4 tài liệu + evidence + tools); git blob hash trùng bản đã bàn giao. File ZIP của VERIFY-05 không thấy trên main (nội dung giải nén đã có).
- **`KET_QUA_VERIFY04` vẫn KHÔNG tìm thấy** → `BLOCKED`. Đã tìm: đĩa sandbox, thư mục upload, GitHub (cả cây thư mục gốc, `PDL TOOL AI S1/`, `artifacts/`, thư mục VERIFY-04), Google Drive. Đường dẫn cần bổ sung: `tools/algbench/reports/PDL-PRESET-VERIFY-04/KET_QUA_VERIFY04/` (giải nén, đã che dữ liệu riêng) hoặc gửi file zip vào chat. Không dựng dữ liệu thay thế.
- **Dữ liệu mới đã xác nhận trên main:** Khói đã đưa **session FSP8 thật** lên gốc repo — `Project FSF8.zip` (commit `7706f3b5`, blob `3fbf4f88…`, bên trong `save new 2.1.song`, build `Studio Pro/8.0.0.110141`). Đây **không phải** `KET_QUA_VERIFY04`, không chứa log PDL/macro/phím. Chi tiết: `PDL-PRESET-VERIFY-06/evidence/fsp8-session-provenance.txt`, `…/main-verification.txt`.
- Bảng bằng chứng + blocker còn lại: `PDL-PRESET-VERIFY-06/01-BANG-BANG-CHUNG-VA-BLOCKER.md`.

## 2. Bản đồ project FSP8 từ dữ liệu thật (mục tiêu 4)
Chi tiết `04-BAN-DO-FSP8-DU-LIEU-DA-XAC-MINH.md`. Tóm tắt (trạng thái lúc lưu file):

| Hạng mục | Kết quả (VERIFIED – đọc file) |
|---|---|
| Track | `Beat` (không mute), `Mic` (mute), `Không Dây` (mute). **Không có** NORM/LOFI/REMIX |
| Kênh hiệu ứng | `Verb ngắn` −12 dB, `Verb dài` −18 dB, `Delay` −22 dB, `Com Verb` −30 dB — lớp **bus (`AudioGroupChannel`)**, ẩn trong mixer, đều → Main |
| Send | 7 Send, đều nằm trên `Group Mic`: → Verb ngắn, Verb dài, Main (−20,1 dB), Delay, 2 sidechain `C1 gate`, Com Verb (−6 dB); `bypass=1` |
| Insert trên `Group Mic` | `Lofi`, `IL Gross Beat`, `PanCake2` (đang bypass) |
| So với mẫu PDL | Cùng kiến trúc (giọng → nhóm → Send → bus hiệu ứng) nhưng **khác tên và khác lớp kênh** (mẫu PDL dùng `AudioEffectChannel` DELAY/VERB1/VERB2) |

Hệ quả:
1. Macro PDL tìm kênh theo **tên** (`DELAY`, `VERB1`, `VERB2`…) → **không khớp** tên trong session của Khói (trừ `Delay`≈`DELAY`, so khớp hoa/thường UNKNOWN). Hành vi khi không tìm thấy: UNKNOWN (cần chạy thật).
2. "PDL điều khiển Send" vẫn **UNKNOWN** (không có bằng chứng). Send là việc của Menu/FX Auto.
3. Ba loại điều khiển riêng: Mute kênh · Send (bật/tắt + mức) · bypass insert.
4. Tương ứng theo tên plugin: `Lofi` ↔ LOFI; `IL Gross Beat`/`PanCake2` ↔ REMIX — chỉ **INFERRED**, cần Khói xác nhận. RAP: không đoán.
5. `bypass=1` trên Send = Send đang tắt: **INFERRED** (mẫu PDL `bypass=0`; insert `bypass=1` đi cùng plugin tắt) → cần nhìn Console để xác nhận.

## 3. Phân tích log PDL thật (mục tiêu 3)
Chưa có log → **BLOCKED_USER_TEST**. Đã viết hướng dẫn thu (dựa KHOI-03, thêm tình huống DAW ở phía sau) và **quy tắc kết luận** phân biệt MIDI CC / Note / phím tắt / click toạ độ / macro (macro là đích, không phải cách gửi) / mute-vs-Send: `02-HUONG-DAN-THU-VA-PHAN-TICH-LOG-PDL.md`. Chỉ kết luận khi đủ bằng chứng tối thiểu ghi trong bảng đó.

## 4. Bảng trạng thái NORM / LOFI / RAP / REMIX và điều kiện duyệt kiến trúc (mục tiêu 5)
`03-BANG-TRANG-THAI-PRESET-VA-DIEU-KIEN-DUYET-KIEN-TRUC.md`.

| Preset | Macro Studio One | Cubase 13–15 | PDL kích hoạt bằng gì | Ánh xạ session Khói |
|---|---|---|---|---|
| NORM | VERIFIED (Mute track) | F9 `NORMC` | UNKNOWN | Track NORM không có |
| LOFI | VERIFIED | F10 `LOFIC` | UNKNOWN | `Lofi` insert (INFERRED) |
| RAP | VERIFIED (tắt VERB1) | F11 `RAP`, F12 `RAPC` | UNKNOWN | Không đoán |
| REMIX | VERIFIED | **không phím** | UNKNOWN | `Gross Beat`/`PanCake2` (INFERRED) |

Điều kiện tối thiểu trước khi duyệt kiến trúc: **M1–M5** (M1 và M3 đạt một phần nhờ session; M2, M4, M5 chưa đạt). M6 (log PDL) chỉ cần nếu muốn bám y hành vi PDL; M7 = quyết định REMIX.

## 5. Kiến trúc đề xuất (chỉ đặc tả — mục tiêu 6)
`05-DAC-TA-KIEN-TRUC-PRESET-V2.md` (bổ sung cho VERIFY-05/04): preset = danh sách bước (`mute`, `send_level`, `plugin_param`, `fx_volume`, `trigger`) do người dùng khai báo; trạng thái `APPLIED/SENT_UNCONFIRMED/FAILED/NOT_CONFIGURED/NO_DEVICE`; driver riêng cho FSP8 và Cubase 13; `targetRef` gắn **loại đối tượng** (kênh/Send/insert). Đây là thay đổi kiến trúc → **chờ Khói duyệt**; không có mã nào bị đụng.

## 6. BLOCKED còn lại & bước Khói cần làm tiếp
| Thiếu | Bước của Khói (không cần lập trình, chỉ nhìn/chụp, che dữ liệu riêng) |
|---|---|
| Tên `.exe` FSP8 | Ctrl+Shift+Esc → Details → ghi tên tiến trình khi FSP8 đang chạy |
| Nghĩa `bypass` của Send + hành vi | Mở session (bản sao `TEST_PRESET`), chụp Console: nút On/Off của 7 Send trên `Group Mic` và nút Mute của 4 bus hiệu ứng |
| Macro/phím/External | Macro Organizer (cột Shortcut), Keyboard Shortcuts (tìm `macro`), panel External → chụp (KHOI-01 bước 2) |
| Log PDL thật | Làm theo `02` (MIDI-OX/MIDIberry + bảng) cho NORM/LOFI/RAP/REMIX |
| `KET_QUA_VERIFY04` | Đặt vào `tools/algbench/reports/PDL-PRESET-VERIFY-04/KET_QUA_VERIFY04/` hoặc gửi zip |
| Quyết định thiết kế | M4 (preset nghĩa là gì trên project này), M5 (preset vs FX Auto), M7 (REMIX) |

Kết thúc ở `BLOCKED_USER_TEST`; **không chuyển sang code**.

## 7. Bàn giao & xác nhận phạm vi
- **ZIP:** `tools/algbench/reports/PDL-PRESET-VERIFY-06/PDL-PRESET-VERIFY-06-HANDOVER.zip` (đường dẫn tương đối repo bên trong; chứa báo cáo + 5 tài liệu + 4 file evidence + 1 script).
- **Tạo mới:** `tools/algbench/reports/PDL-PRESET-VERIFY-06-REPORT.md`; thư mục `tools/algbench/reports/PDL-PRESET-VERIFY-06/` (`01`–`05`, `evidence/` ×4, `tools/fsp8_session_dump.py`, ZIP).
- **Sửa:** không file nào; VERIFY-03/04/05 giữ nguyên (không xoá/ghi đè).
- File session của Khói **không** được sao vào gói (đã nằm trên main); chỉ đọc bản tải về trong thư mục tạm, không sửa. Tên tác giả trong metainfo và đường dẫn máy người dùng đã che.
- **Mã Menu, UI/HTML, MIDI mapping, FX Auto, cấu hình/preset/session của DAW: không đổi.** Không commit, không push, không áp dụng macro.

---
**Claude A : Task A: PDL-PRESET-VERIFY-06**
1. **File nào đã sửa:** không sửa file nào. Chỉ tạo mới: báo cáo `.md`, thư mục `PDL-PRESET-VERIFY-06/` (5 tài liệu, 4 evidence, 1 script đọc session) và ZIP bàn giao.
2. **Vì sao sửa:** (không sửa) — tạo tài liệu để kiểm lại bằng chứng sau VERIFY-05, hoàn thiện bản đồ FSP8 từ session thật Khói đã đưa lên main, hướng dẫn thu log PDL, cập nhật bảng trạng thái preset và điều kiện duyệt kiến trúc.
3. **Có ảnh hưởng module nào không:** Không. Menu, UI, MIDI mapping, FX Auto, cấu hình/preset/session DAW không đổi.
4. **Còn việc gì chưa làm:** (a) `KET_QUA_VERIFY04` vẫn thiếu; (b) log PDL thật (CC/Note/phím/khác) chưa có → cơ chế kích hoạt preset của PDL vẫn UNKNOWN; (c) hành vi trước–sau trên FSP8 (nghĩa `bypass` của Send, Mute bus) và tên `.exe` chưa xác nhận; (d) macro/phím/External trên máy Khói chưa biết; (e) Khói cần duyệt kiến trúc và quyết M4/M5/M7 trước khi mở task code.
