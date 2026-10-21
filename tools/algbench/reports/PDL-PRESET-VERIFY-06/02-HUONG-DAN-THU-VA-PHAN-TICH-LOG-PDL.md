# 02 — Hướng dẫn thu & phân tích log PDL thật (NORM / LOFI / RAP / REMIX)

Dựa trên `PDL-PRESET-VERIFY-04/khoi-guides/KHOI-03-PDL-bat-lenh-that.md` (không sửa file đó) và KHOI-00 (che dữ liệu). Chỉ **nhìn, chụp, ghi** — không sửa PDL, DAW, macro hay phím. Làm trên bản sao `TEST_PRESET`.
Chưa làm = `BLOCKED_USER_TEST`. Không ai được điền thay Khói.

## A. Phần Khói làm (không cần lập trình)

### A1. Chuẩn bị (10 phút)
1. Ghi: phiên bản PDL (`version.dat`), DAW (FSP8 hay Cubase 13) + phiên bản, `midi_port` trong `config.ini`.
2. Mở **loopMIDI**: nhớ tên cổng. Mở **MIDI-OX** (hoặc MIDIberry), **chỉ nghe** đúng cổng đó.
3. Mở thư mục dữ liệu PDL (`%APPDATA%\PDL-STUDIO\auto-menu-ai-s1`), sắp theo *Date modified*, chụp ảnh (che tên Windows).
4. Mở DAW + bản sao session `TEST_PRESET`. Chụp mixer toàn cảnh làm trạng thái ban đầu.

### A2. Bấm từng nút — thêm 3 phép thử để phân biệt cơ chế
Với **mỗi nút** NORM → LOFI → RAP → REMIX, làm 2 tình huống (T1, T2) (mỗi tình huống bấm 2 lần, cách 3 giây; xoá log MIDI trước mỗi lần):

| Tình huống | Cách làm | Câu hỏi trả lời |
|---|---|---|
| T1 — Bình thường | DAW đang ở phía trước | Có dòng MIDI? DAW đổi? |
| T2 — DAW ở phía sau | Bấm nút PDL khi cửa sổ DAW KHÔNG ở trước (cửa sổ khác ở trước) | DAW vẫn đổi? Cửa sổ DAW có tự nhảy lên trước không? |

Không có tình huống thứ ba: việc "log MIDI rỗng hay không" được ghi ngay ở T1 (cột *Log MIDI rỗng?*). Không tắt cổng loopMIDI, không đổi cấu hình gì.

Bảng ghi (copy ra Notepad, điền, đặt vào `KET_QUA_VERIFY04\PDL\PHIEU_LOG_PDL.md`):

| Nút | Lần | Tình huống | MIDI: loại (Note/CC/khác) | Kênh | Số | Giá trị | Log MIDI rỗng? | DAW đổi gì (ghi Mute/Send nếu thấy) | Cửa sổ trước khi bấm | Cửa sổ sau khi bấm | Ảnh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NORM | 1 | T1 | | | | | | | | | |
| NORM | 2 | T1 | | | | | | | | | |
| NORM | 1 | T2 | | | | | | | | | |
| LOFI | 1 | T1 | | | | | | | | | |
| LOFI | 2 | T1 | | | | | | | | | |
| LOFI | 1 | T2 | | | | | | | | | |
| RAP | 1 | T1 | | | | | | | | | |
| RAP | 2 | T1 | | | | | | | | | |
| RAP | 1 | T2 | | | | | | | | | |
| REMIX | 1 | T1 | | | | | | | | | |
| REMIX | 2 | T1 | | | | | | | | | |
| REMIX | 1 | T2 | | | | | | | | | |

### A3. Sau khi bấm
1. Thư mục dữ liệu PDL: file nào vừa đổi giờ sửa (đặc biệt chứa `mode`/`override`)? Chụp; copy file (đã che) vào `KET_QUA_VERIFY04\PDL\`.
2. `config.ini` đang dùng → che mục `[LICENSE]`, tên Windows, mọi id/token → lưu `config_da_che.ini`.
3. Nếu PDL có cửa sổ "ghi đè nút chế độ/Tùy biến" cho nút preset: chỉ chụp (loại hành động, CC, 127/0, ấn giữ). Không sửa.
4. Trong DAW (chỉ nhìn): FSP8 — Macro Organizer cột *Shortcut* và panel *External* cho 4 macro; Cubase — Edit > Key Commands tìm `NORMC/LOFIC/RAP/RAPC/REMIX`. Chụp.

### A4. Gửi
Gom vào một thư mục `KET_QUA_VERIFY04` (che theo KHOI-00), nén `.zip`, gửi Claude A; nếu muốn lưu trong repo: giải nén vào `tools/algbench/reports/PDL-PRESET-VERIFY-04/KET_QUA_VERIFY04/`.

## B. Phần Claude A làm khi có dữ liệu — QUY TẮC KẾT LUẬN

Chỉ kết luận khi đủ bằng chứng ở cột "Bằng chứng tối thiểu". Mỗi dòng phải trích ảnh/log cụ thể.

| Kết luận | Bằng chứng tối thiểu | Không đủ nếu |
|---|---|---|
| **MIDI CC** | Log MIDI có `Control Change` (0xBn) lặp lại **mỗi lần** bấm đúng nút đó, cùng số CC/giá trị; DAW đổi cùng lúc; lặp lại ở lần 2 | Chỉ có 1 lần; CC xuất hiện khi không bấm |
| **MIDI Note** | Log có `Note On/Off` (0x9n/0x8n) tương ứng | tương tự |
| **Phím tắt (hotkey)** | Log MIDI **rỗng** + DAW đổi + (cửa sổ DAW ở trước hoặc nhảy lên trước ở T2) + DAW có lệnh/phím gán (Shortcut/Key Command) khớp | Chỉ "log rỗng" (có thể là click chuột/cách khác) — khi đó ghi `KHÔNG-MIDI, CƠ CHẾ CHƯA RÕ` |
| **Click toạ độ (`[ToaDo]`)** | Log rỗng + DAW đổi + không có phím gán khớp + con trỏ chuột di chuyển (video/quan sát) | Không có quan sát chuột |
| **Macro** | Macro **không** phải cơ chế gửi; nó là đích. Kết luận "preset kích hoạt macro X" chỉ khi: (a) macro tồn tại trong Macro Organizer, **và** (b) có một đường gọi (Shortcut hoặc ánh xạ External/MIDI) khớp với tín hiệu quan sát ở trên | Macro tồn tại nhưng cột Shortcut trống và External không gán → không ai có thể gọi macro bằng phím/MIDI trên máy này |
| **Cách khác / chưa rõ** | Log rỗng, không phím khớp, DAW không đổi → PDL không điều khiển DAW trên máy này | — |
| **Mute vs Send** | Ảnh mixer trước–sau: nút M đổi? hay núm Send đổi? ghi riêng từng cái | Chỉ nói "nghe thấy khác" |

Hệ quả bắt buộc nếu muốn kết luận "PDL điều khiển Send": cần ảnh mixer cho thấy **Send đổi** sau khi bấm preset và **MIDI/phím tương ứng**. Thiếu một trong hai → `UNKNOWN`.

## C. Ba kết quả cuối có thể (ghi vào VERIFY-07 sau khi có dữ liệu)
1. `CONFIRMED_<CC|NOTE|HOTKEY|CLICK>` cho từng preset — kèm số/giá trị.
2. `NO_DAW_CONTROL` — PDL chỉ đổi giao diện/trạng thái nội bộ.
3. `INCONCLUSIVE` — nêu bước còn thiếu.
