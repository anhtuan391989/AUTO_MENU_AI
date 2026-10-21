# 01 — Bảng bằng chứng & danh sách blocker còn lại (sau VERIFY-05)

Nhãn: VERIFIED (đọc file/GitHub) · VERIFIED_USER_STATEMENT (Khói tự nói, chưa có ảnh/file) · PARTIAL · INFERRED · UNKNOWN · BLOCKED · BLOCKED_USER_TEST.
Không có dòng nào là kết quả chạy PDL/MIDI/DAW thật. Xem `evidence/main-verification.txt` cho phần kiểm GitHub/Drive.

## A. Bằng chứng ĐÃ CÓ (xác nhận trên main HEAD `7cbb22f4`)

| # | Bằng chứng | Vị trí trong repo | Nhãn | Dùng để kết luận gì |
|---|---|---|---|---|
| E1 | Macro Studio One (10 file) → trạng thái Mute từng preset | `PDL-PRESET-VERIFY-03/studioone-macro-state-table.txt` | VERIFIED | Preset = Mute track NORM/LOFI/REMIX + kênh FX DELAY/VERB1/VERB2; RAP tắt VERB1 |
| E2 | Phím gắn macro trong `user.keyscheme` mẫu | `PDL-PRESET-VERIFY-03/f-key-conflict-scan.txt` | VERIFIED | Macro preset KHÔNG có phím; chỉ BatMic/TatMic/BatVang4/TatVang4 (F6/F5/F8/F7) |
| E3 | Cubase Key Commands 10–15 | `PDL-PRESET-VERIFY-04/version-evidence-inventory.txt` | VERIFIED | 13–15: F9 NORMC, F10 LOFIC, F11 RAP, F12 RAPC; REMIX không phím |
| E4 | Cubase PLE `RAP`/`RAPC` | VERIFY-03/04 | VERIFIED (file) / UNKNOWN (ý nghĩa `Val`) | Khác nhau duy nhất ở `Val` 0/1 |
| E5 | `config.ini` mặc định vs tác giả | `PDL-PRESET-VERIFY-03/config-default-vs-author.txt` | VERIFIED | Không chứa lệnh preset; `midi_port`, `daw` có |
| E6 | MIDI Remote nhúng trong 3 project Cubase (CC → đích host) | `PDL-PRESET-VERIFY-05/evidence/cubase-midiremote-project-mapping-PJ0x.txt` | VERIFIED | CC chỉ điều khiển Volume (kênh/kênh FX), Mute 1 kênh, tham số plugin. Không Send, không REMIX, không preset |
| E7 | Chuỗi trong `core_logic.pyd` (capability) | `PDL-PRESET-RESEARCH-0x`, `corrections-and-limits.txt` | PARTIAL | PDL **có khả năng** gửi CC (`send_midi_cc`), phím tới cửa sổ DAW, click toạ độ; **không** cho biết preset dùng cái nào |
| E8 | Menu: preset sáng nút bất kể kết quả; REMIX không có action; FX Auto điều khiển Send | `PDL-PRESET-VERIFY-03` probe, `-05/04` | VERIFIED (mock/đọc mã) | Hành vi của Menu, không phải của PDL |
| E9 | Tài liệu hãng FSP8/Cubase | `PDL-PRESET-VERIFY-04/web-sources-v4.txt` | PARTIAL | Cơ chế macro/PLE/Generic Remote/MIDI Remote; chưa test máy Khói |
| E11 | **Session FSP8 thật của Khói** (`save new 2.1.song` trong `Project FSF8.zip`, gốc repo, commit `7706f3b5`): 3 track, 5 kênh bus, 7 Send, insert Lofi/Gross Beat/PanCake2, build 8.0.0.110141 | `Project FSF8.zip` (main) → `PDL-PRESET-VERIFY-06/evidence/fsp8-session-analysis.txt` | VERIFIED (đọc file; trạng thái lúc lưu) | Bản đồ project ở `04`. KHÔNG phải KET_QUA_VERIFY04, KHÔNG có log PDL/macro/phím |
| E10 | Khói: project FSP8 không có track preset kiểu PDL, nhưng có kênh FX và Send riêng | tin nhắn VERIFY-05 (không có file/ảnh) | VERIFIED_USER_STATEMENT | Chỉ ở mức khẳng định chung, không có tên |

## B. Bằng chứng CÒN THIẾU (blocker) — chính xác

| ID | Thiếu gì | Vì sao cần | Đường dẫn/cách bổ sung | Trạng thái |
|---|---|---|---|---|
| B1 | **`KET_QUA_VERIFY04`** (zip/thư mục) | Nguồn duy nhất cho dữ liệu máy Khói | Đã kiểm lại 21/10: không có trên đĩa, GitHub, Drive. Bổ sung tại `tools/algbench/reports/PDL-PRESET-VERIFY-04/KET_QUA_VERIFY04/` (giải nén, đã che dữ liệu riêng) **hoặc** gửi `KET_QUA_VERIFY04.zip` vào chat | **BLOCKED** |
| B2 | Log PDL thật khi bấm NORM/LOFI/RAP/REMIX: nhật ký MIDI, cửa sổ phía trước, DAW đổi gì | Chốt PDL dùng CC / Note / phím / cách khác | `KET_QUA_VERIFY04/PDL/` (KHOI-03) + bảng ở `02` | **BLOCKED_USER_TEST** |
| B3 | File PDL đổi giờ sửa sau khi bấm (`mode`/`override`), `config_da_che.ini` | Nội dung `mode_overrides` | `KET_QUA_VERIFY04/PDL/` | **BLOCKED_USER_TEST** |
| B4 | Tên `.exe` FSP8 (phiên bản **đã có**: 8.0.0.110141 trong file session, E11) | Cờ `daw=`, nhận diện cửa sổ | KHOI-01 bước 1 (Task Manager > Details) | **BLOCKED_USER_TEST** (một phần) |
| B5 | Macro Organizer: có đủ 4 macro? cột Shortcut? Macro Toolbar? External panel? thư mục macro | Biết macro nào tồn tại và đường gọi nào có sẵn trên máy Khói | KHOI-01 bước 2 | **BLOCKED_USER_TEST** |
| B6 | Trạng thái **trước–sau** khi bấm từng nút trong Console (tên kênh/Send/mức tĩnh **đã có** ở E11); nút Send On/Off khớp `bypass`? Mute macro có tác động bus hiệu ứng? | Biết điều khiển nào thật sự đổi gì | KHOI-01 bước 3–4 | **BLOCKED_USER_TEST** (một phần) |
| B7 | Cubase 13: Key Commands F9–F12 thật, PLE, Generic Remote | Driver Cubase 13 | KHOI-02 | **BLOCKED_USER_TEST** (chỉ cần nếu Khói dùng Cubase 13) |
| B8 | Nội dung hàm `core_logic` (Cython) | Cách khác để biết preset gửi gì | Không đọc được bằng file tĩnh; thay bằng B2/B3 | UNKNOWN (không có cách tĩnh) |
| B9 | Ý nghĩa `Function=335 / Type=4012 / Val` trong PLE | Hiểu RAP/RAPC | Cần Cubase 13 mở PLE xem (KHOI-02) | BLOCKED_USER_TEST |

## C. Điều đã đạt thêm so với VERIFY-05
- Tên kênh bus/Send/mức tĩnh và phiên bản FSP8 của Khói giờ có bằng chứng file (E11) → bản đồ project không còn ở mức "chỉ lời Khói".
- Vẫn thiếu: hành vi động (trước–sau), macro/phím/External thật, log PDL.

## D. Điều đã loại bỏ/đính chính
- Không dùng chuỗi `f2,f5…` trong `core_logic.pyd` làm bằng chứng (VERIFY-05 `corrections-and-limits.txt`).
- File đính kèm chat không phải bằng chứng trong repo nếu chưa thấy trên main — áp dụng cho `KET_QUA_VERIFY04`.
- `logs/` trên main là log của Menu, không phải log PDL.
