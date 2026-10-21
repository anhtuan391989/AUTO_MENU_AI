# 01 — Bảng chức năng từng preset PDL (NORM / LOFI / RAP / REMIX)

Nhãn: **VERIFIED** = đọc trực tiếp từ file (chưa phải chạy DAW thật) · **PARTIAL** · **INFERRED** · **UNKNOWN** · **BLOCKED**.
Không có dòng nào trong tài liệu này là kết quả test trên DAW thật.

## A. Quy ước phân biệt 6 loại "điều khiển" (không được gộp)

| Loại | Là gì | PDL có bằng chứng dùng cho preset? |
|---|---|---|
| Mute/Unmute kênh | Tắt/bật tiếng một track hoặc kênh FX | **Có** — macro Studio One (VERIFIED, file) |
| Volume kênh FX | Fader của kênh FX (Cubase tag 1025) | Có trong MIDI Remote của PJ 01/02/03 nhưng là **núm tay**, không phải preset (VERIFIED, file) |
| Send (mức gửi từ track sang kênh FX) | Núm Send của từng track | **KHÔNG tìm thấy** ở bất kỳ file PDL nào → "PDL điều khiển Send" = **UNKNOWN, không được kết luận** |
| Insert plugin (bypass / tham số) | Ví dụ EQ trên track LOFI | Chỉ thấy 1 núm CC20 → EQ slot 11 (PJ 01), nằm ở vị trí núm LOFI theo MAPPING.png (INFERRED) |
| Phím tắt (hotkey) | Studio One: F5–F8 (Mic/Vang); Cubase: F9–F12 | Có file key-command; **chưa có bằng chứng PDL gửi các phím này** |
| MIDI CC | CC tay của MIDI Remote (CC1–CC24) | Có, nhưng không có CC nào gán cho NORM/LOFI/RAP/REMIX (xem B) |

## B. Bảng từng preset

Trạng thái macro Studio One (`State` 1 = Mute BẬT, 0 = Mute TẮT; "1 = mute" là PARTIAL vì chưa có tài liệu trong gói xác nhận).

| Mục | NORM | LOFI | RAP | REMIX |
|---|---|---|---|---|
| Macro Studio One có không? | Có (`NORM.studioonemacro`) VERIFIED | Có VERIFIED | Có VERIFIED | Có VERIFIED |
| Mute track NORM | 0 (bật tiếng) | 1 | 0 | 1 |
| Mute track LOFI | 1 | 0 | 1 | 1 |
| Mute track REMIX | 1 | 1 | 1 | 0 |
| Mute kênh FX DELAY | 0 | 0 | 0 | 0 |
| Mute kênh FX VERB1 | 0 | 0 | **1** | 0 |
| Mute kênh FX VERB2 | 0 | 0 | 0 | 0 |
| Send trong macro | không có lệnh Send | không có | không có | không có |
| Plugin bypass trong macro | không có | không có | không có | không có |
| Phím tắt Studio One gắn macro | **Không** (`user.keyscheme` chỉ có BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7) | Không | Không | Không |
| Cubase 13–15 Key Command | F9 = `NORMC` (VERIFIED) | F10 = `LOFIC` (VERIFIED) | F11 = `RAP`, F12 = `RAPC` (VERIFIED) | **không có phím** cho `REMIX`/`REMIXC` (VERIFIED) |
| Cubase 10–12 Key Command | F9 NORMC | F10 LOFIC | F12 RAPC | F11 REMIXC |
| Cubase PLE preset trong gói | thiếu | thiếu | `RAP.xml`/`RAPC.xml` có; khác nhau duy nhất ở `Val` 0/1; đích: kênh Verb1/Delay/Verb3 (ý nghĩa Function/Type/Val = **UNKNOWN**) | thiếu |
| Gán MIDI CC cho preset | **UNKNOWN** — không có trong `config.ini` (cả bản mặc định lẫn bản tác giả), không có trong MIDI Remote | UNKNOWN | UNKNOWN | UNKNOWN (REMIX CC21 **không gán** ở cả 3 project mẫu) |
| `mode_overrides` | chỉ là chuỗi log/định danh trong `core_logic.pyd` (`_nt_mode_overrides`); **không đọc được nội dung** | cùng | cùng | cùng |
| Cơ chế kích hoạt PDL → DAW | **UNKNOWN** (không giải mã được thân hàm Cython) | UNKNOWN | UNKNOWN | UNKNOWN |

### Lưu ý riêng từng preset
- **NORM**: chỉ khác LOFI/REMIX ở chỗ bật track NORM, tắt 2 track kia; FX không đổi (INFERRED từ bảng trạng thái).
- **LOFI**: chất "lofi" nằm ở **insert của track LOFI** (EQ), không nằm trong macro. Project Cubase PJ 01 có CC20 → EQ slot 11 `VSTylo5eq 7` tag 10004202 ở vị trí núm LOFI (vị trí lấy từ MAPPING.png = INFERRED). PJ 02/03 không có núm này.
- **RAP**: preset duy nhất tắt VERB1 (macro). Cubase có 2 file PLE `RAP`/`RAPC` chỉ khác `Val`, gợi ý "bật/tắt" 1 nhóm kênh FX (INFERRED, chưa giải mã được Val).
- **REMIX**: có macro Studio One; Cubase 13–15 **không có phím**; không có núm MIDI Remote nào; **không tìm thấy** đường kích hoạt nào trong file → trạng thái "chưa rõ" (UNKNOWN). Menu hiện cũng không có action REMIX (`actionRegistry.js` chỉ PRESET_NORM/LOFI/RAP).

## C. Giả thuyết kích hoạt (H) — KHÔNG kết luận

| H | Giả thuyết | Chứng cứ ủng hộ | Chứng cứ chống / thiếu | Nhãn |
|---|---|---|---|---|
| H1 | PDL gửi **phím tắt** F-key tới cửa sổ DAW | `core_logic.pyd` có chuỗi gửi phím cho Sonar ("Gửi F9 tới Sonar") và Studio One ("không tìm thấy cửa sổ Studio One để gửi phím tắt"); Cubase có F9–F12 | Studio One **không** gắn phím cho macro preset; không đọc được thân hàm | INFERRED (khả năng, chưa chứng minh) |
| H2 | PDL gửi **MIDI CC/Note** tới `loopMIDI Port` | `send_midi_cc`; config tác giả `midi_port=loopMIDI Port`; Cubase có Generic Remote + MIDI Remote | Không có CC nào của preset trong config/MIDI Remote | INFERRED |
| H3 | PDL click **toạ độ chuột** `[ToaDo]` | `config.ini` tác giả có `x1,y1,x2,y2` | Chỉ 1 cặp toạ độ, không rõ cho nút nào | UNKNOWN |
| H4 | `mode_overrides` chứa lệnh theo từng mode | tên định danh tồn tại | không đọc được nội dung | UNKNOWN |
| H5 | Preset chỉ là "chế độ" nội bộ của PDL, DAW chỉ nhận CC tay | MIDI Remote chỉ có núm tay | không giải thích macro/PLE tồn tại | UNKNOWN |

**Cách chốt (BLOCKED_USER_TEST):** cần log/capture khi bấm từng preset trong PDL thật (loopMIDI monitor + log PDL) — xem `KHOI-03` của VERIFY-04.
