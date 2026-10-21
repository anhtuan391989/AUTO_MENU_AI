# PDL-PRESET-VERIFY-05-REPORT — Giải mã preset PDL & bản đồ chức năng Fender Studio Pro 8

Ngày: 2026-10-21 · Loại: nghiên cứu/đặc tả (không code, không commit, không push)
GitHub `main` HEAD khi kiểm tra: `1a38571d` (bản local `84f5810` cũ — không dùng làm gốc).
Nhãn: VERIFIED (đọc file) · PARTIAL · INFERRED · UNKNOWN · BLOCKED · BLOCKED_USER_TEST.
**Không có kết quả nào là test trên DAW thật / PDL thật / MIDI thật.**

## 1. Kết luận chính
1. **Cơ chế PDL kích hoạt preset NORM/LOFI/RAP/REMIX = UNKNOWN.** Logic nằm trong `core_logic.pyd` (Cython, không đọc được thân hàm); `config.ini` (mặc định và của tác giả) không chứa lệnh preset; `mode_overrides` chỉ là chuỗi định danh.
2. **Cái đã chứng minh (VERIFIED, đọc file):**
   - Studio One: 4 macro preset chỉ đặt **Mute track NORM/LOFI/REMIX** và **Mute kênh FX DELAY/VERB1/VERB2** (RAP là preset duy nhất tắt VERB1). Không có lệnh Send, không bypass plugin, **không gắn phím** (phím chỉ có cho BatMic/TatMic/BatVang4/TatVang4 = F6/F5/F8/F7).
   - Cubase 13–15: F9 NORMC, F10 LOFIC, F11 RAP, F12 RAPC; **REMIX không có phím**. PLE `RAP`/`RAPC` chỉ khác `Val` 0/1.
   - MIDI Remote trong 3 project Cubase mẫu: CC chỉ điều khiển **Volume kênh** (kể cả kênh FX, tag 1025), **Mute 1 kênh** (tag 1027, CC24), tham số plugin (Auto-Tune, SoundShifter, sMax, 1 EQ). **Không có Send. Không có REMIX. Không CC nào cho NORM/LOFI/RAP.**
3. **"PDL điều khiển Send" = KHÔNG được kết luận** (không có bằng chứng). Send là phần của Menu/FX Auto.
4. **Project FSP8 của Khói:** không có track preset → preset kiểu "đổi track" không áp dụng nguyên trạng; phần ánh xạ được (Mute/Volume kênh FX, Mic/Vang) cần tên kênh thật = **BLOCKED**.
5. **FSP8 và Cubase 13 khác cơ chế** (macro vs PLE+Key Command; tên vs vị trí/đường dẫn). Đề xuất: logic preset dùng chung + driver riêng từng DAW/phiên bản (chỉ đặc tả).

## 2. Bằng chứng & nơi xem
| Nội dung | File (trong gói) | Nhãn |
|---|---|---|
| Bảng từng preset + giả thuyết H1–H5 | `PDL-PRESET-VERIFY-05/01-BANG-CHUC-NANG-TUNG-PRESET.md` | VERIFIED/INFERRED/UNKNOWN |
| PDL ↔ project FSP8 của Khói | `PDL-PRESET-VERIFY-05/02-BAN-DO-PDL-SANG-PROJECT-FSP8-CUA-KHOI.md` | PARTIAL/BLOCKED |
| Ma trận FSP8 vs Cubase 13 | `PDL-PRESET-VERIFY-05/03-MA-TRAN-CO-CHE-DIEU-KHIEN-FSP8-VS-CUBASE13.md` | PARTIAL |
| Kiến trúc đề xuất | `PDL-PRESET-VERIFY-05/04-DE-XUAT-KIEN-TRUC-PRESET-DUNG-CHUNG-VA-DRIVER-THEO-DAW.md` | Đặc tả |
| Giải mã MIDI Remote trong project (CC → đích) | `PDL-PRESET-VERIFY-05/evidence/cubase-midiremote-project-mapping-PJ01/02/03.txt` | VERIFIED |
| Công cụ giải mã chạy lại được | `PDL-PRESET-VERIFY-05/tools/cprmr.py`, `cprjoin.py` | — |
| Đính chính & giới hạn | `PDL-PRESET-VERIFY-05/evidence/corrections-and-limits.txt` | — |
| Bảng trạng thái macro gốc | `PDL-PRESET-VERIFY-03/studioone-macro-state-table.txt` (không sửa) | VERIFIED |

Bảng tóm tắt trạng thái macro (1 = Mute BẬT):

| Preset | NORM trk | LOFI trk | REMIX trk | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | 0 | 1 | 1 | 0 | 0 | 0 |
| LOFI | 1 | 0 | 1 | 0 | 0 | 0 |
| RAP | 0 | 1 | 1 | 0 | 1 | 0 |
| REMIX | 1 | 1 | 0 | 0 | 0 | 0 |

## 3. Đính chính so với suy luận cũ
Nhận định "định danh f2,f5…" trong chuỗi PDL **bị rút lại** (bảng chuỗi không có dấu phân cách); F9 gắn với Sonar, F12/F3/F5/F7 trong JS là chặn phím trình duyệt. Không dùng làm bằng chứng preset. Chi tiết: `evidence/corrections-and-limits.txt`.

## 4. BLOCKED — dữ liệu còn thiếu (chính xác)
`KET_QUA_VERIFY04` **không tìm thấy** (đĩa, GitHub, Google Drive). Cần Khói gửi lại, đã che dữ liệu riêng:
1. Phiên bản FSP8 + tên file chạy.
2. Danh sách macro, phím tắt, Macro Toolbar, External panel (device map).
3. Ảnh mixer: kênh FX, Send (tên + mức) trước/sau khi bấm từng nút.
4. Kết quả Mute của macro có tác động đúng kênh FX không.
5. Cubase 13: Key Commands, PLE, Generic Remote, kết quả F9–F12.
6. Log PDL thật khi bấm từng preset (MIDI capture / log) và nội dung `mode_overrides`.
7. Tên kênh FX/Send của project Khói.
Không tự tạo dữ liệu thay thế.

## 5. Bước tiếp theo (chờ Khói duyệt)
1. Khói gửi lại `KET_QUA_VERIFY04` → cập nhật `02`.
2. Chạy bắt lệnh PDL thật (hướng dẫn `PDL-PRESET-VERIFY-04/khoi-guides/KHOI-03`) để chốt H1–H5.
3. Khói duyệt kiến trúc ở `04` → mới mở task code.
Không cần cài đặt/copy gì vào DAW hay Menu; gói ZIP chỉ chứa tài liệu.

## 6. Xác nhận phạm vi
- **Tạo mới:** `tools/algbench/reports/PDL-PRESET-VERIFY-05-REPORT.md` và thư mục `tools/algbench/reports/PDL-PRESET-VERIFY-05/` (4 tài liệu, 4 file evidence, 2 script, ZIP).
- **Sửa:** không file nào. Báo cáo/checklist cũ giữ nguyên.
- **Mã Menu, UI/HTML, MIDI mapping, FX Auto, cấu hình/preset DAW, session/project của Khói: không đổi.** Không commit, không push, không áp dụng macro.
- ZIP: `tools/algbench/reports/PDL-PRESET-VERIFY-05/PDL-PRESET-VERIFY-05-HANDOVER.zip` (đường dẫn tương đối repo bên trong).

---
**Claude A : Task A: PDL-PRESET-VERIFY-05**
1. **File nào đã sửa:** không sửa file nào. Chỉ tạo mới: báo cáo `.md`, thư mục `PDL-PRESET-VERIFY-05/` (4 tài liệu, evidence, tools) và ZIP bàn giao.
2. **Vì sao sửa:** (không sửa) — tạo tài liệu để giải mã preset PDL, tách Mute/FX/Send/phím/CC, lập bản đồ sang FSP8 và so với Cubase 13, theo yêu cầu task.
3. **Có ảnh hưởng module nào không:** Không. Menu, UI, MIDI mapping, FX Auto, cấu hình DAW không đổi.
4. **Còn việc gì chưa làm:** (a) `KET_QUA_VERIFY04` thiếu → bản đồ project của Khói còn BLOCKED; (b) cơ chế PDL gửi lệnh preset vẫn UNKNOWN, cần bắt lệnh PDL thật; (c) chưa test trên DAW thật; (d) kiến trúc chờ Khói duyệt trước khi làm code; (e) REMIX chưa có đường kích hoạt/action.
