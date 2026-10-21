# KHÓI-02 — Cubase Pro 13 (ƯU TIÊN 2): kiểm phím F9–F12, PLE và trạng thái mixer
Đọc KHÓI-00 trước. Không cần lập trình. Không có DÂN CA. Mục nào không có → ghi "không có". Chưa điền = `BLOCKED_USER_TEST`.
Dữ liệu dưới đây (từ gói PDL) chỉ là **kỳ vọng để so sánh**, không phải kết quả đã chạy.

## Bước 1 — Thông tin phiên bản (5 phút)
1. Cubase → menu **Help → About Cubase** → chụp ảnh (**tô đen serial/tài khoản**). Ghi số phiên bản đầy đủ (ví dụ 13.0.xx).
2. **Ctrl + Shift + Esc** → tab **Details** → ghi tên file `.exe` của Cubase (gói PDL tác giả dùng `Cubase14.exe`; máy bạn là gì?).
| Mục | Giá trị |
|---|---|
| Phiên bản | |
| Tên tiến trình (.exe) | |

## Bước 2 — Key Commands (F9–F12) (10 phút)
1. Menu **Edit → Key Commands…** (nếu không thấy trong Edit, tìm trong menu **File**).
2. Ô tìm kiếm (Search) gõ lần lượt: `NORMC`, `LOFIC`, `RAP`, `RAPC`, `REMIX`, `REMIXC`, `NORM`, `LOFI`, `RESET`. Mỗi tên: chụp ảnh kết quả (thấy rõ cột phím). **Tìm theo TÊN lệnh, không dựa vào tên nhóm** (nhóm có thể hiện là "Process Logical Preset" hoặc "Process Project Logical Editor").
3. Gõ tìm `F9`, `F10`, `F11`, `F12` (hoặc bấm phím vào ô *Type in Key*): xem còn lệnh Cubase nào khác dùng các phím này không (chụp ảnh). **Không bấm Assign, đóng hộp thoại bằng Cancel/Close.**
Kỳ vọng từ `Key Commands.xml` Cubase 13/14/15 trong gói PDL: F9=NORMC, F10=LOFIC, F11=RAP, F12=RAPC; REMIX và REMIXC không có phím; NORM/LOFI không có phím.
| Lệnh | Phím trên máy bạn | Khớp kỳ vọng? |
|---|---|---|
| NORMC | | F9 |
| LOFIC | | F10 |
| RAP | | F11 |
| RAPC | | F12 |
| REMIX | | (không phím) |
| REMIXC | | (không phím) |
| NORM | | (không phím / không có) |
| LOFI | | (không phím) |
| RESET | | (không phím) |
| Phím F9–F12 còn dùng cho lệnh nào khác? | | |

## Bước 3 — Xem preset trong Project Logical Editor (PLE) (15 phút)
Làm trên bản sao project `TEST_PRESET`.
1. Menu **Project → Logical Editor…** (Project Logical Editor).
2. Ở ô **Preset** (danh sách thả xuống), chụp ảnh **danh sách đầy đủ** các preset.
3. Chọn lần lượt từng preset: `NORMC`, `LOFIC`, `RAP`, `RAPC`, `REMIXC`, `REMIX`, `NORM`, `LOFI`, `RESET` (cái nào có). Với mỗi preset chụp **toàn bộ cửa sổ** (phần *Filter Target/Conditions* ở trên và phần *Actions* ở dưới; phóng to để đọc được chữ).
4. **TUYỆT ĐỐI KHÔNG bấm nút Apply** ở bước này (Apply sẽ chạy preset). Đóng cửa sổ.
5. Ghi nguyên văn dòng ở cột **Action** của RAP và RAPC (ví dụ "Mute / Set to …"): đây là cách duy nhất để biết `RAP` khác `RAPC` ở đâu.
| Preset | Có trong danh sách? | Điều kiện lọc (tên track/kênh gì?) | Dòng Action (nguyên văn) | Tên ảnh |
|---|---|---|---|---|
| NORMC | | | | |
| LOFIC | | | | |
| RAP | | | | |
| RAPC | | | | |
| REMIXC | | | | |
| REMIX | | | | |
| NORM | | | | |
| LOFI | | | | |
| RESET | | | | |

## Bước 4 — Lấy file PLE (chỉ COPY, không di chuyển) (10 phút)
1. Mở **File Explorer**, gõ vào thanh địa chỉ: `%APPDATA%\Steinberg` rồi Enter.
2. Ô tìm kiếm góc phải gõ `RAP.xml` → chờ kết quả. Chụp ảnh đường dẫn của kết quả (**che tên Windows**). (Trong gói PDL, file nằm ở `…\Steinberg\Cubase\User Presets\Project Logical Editor\`; thư mục thật trên máy bạn có thể khác — dựa vào kết quả tìm.)
3. Trong thư mục chứa `RAP.xml`, **chọn Copy** (không Cut) các file: `NORMC.xml`, `LOFIC.xml`, `RAP.xml`, `RAPC.xml`, `REMIXC.xml`, `REMIX.xml`, `NORM.xml`, `LOFI.xml`, `RESET.xml` (có cái nào lấy cái đó) → Dán vào `KET_QUA_VERIFY04\Cubase13\PLE\`.
4. Ghi: file nào không có.

## Bước 5 — Cổng MIDI và Generic Remote (chỉ NHÌN) (10 phút)
Gói PDL cho thấy Cubase của tác giả nhận MIDI từ cổng `loopMIDI Port` qua thiết bị **Generic Remote** (có CC cho Mute/Send theo từng kênh mixer). Cần biết máy bạn có giống không.
1. Menu **Studio → Studio Setup…** → ở danh sách bên trái mở **Remote Devices** → nếu có **Generic Remote**: chụp ảnh cửa sổ (thấy **MIDI Input** là cổng nào, **MIDI Output**).
2. Trong Generic Remote, chụp bảng điều khiển (các dòng Fader/Pan/Mute/Send và cột MIDI Status/Channel/Address) — chỉ chụp, không sửa.
3. Cùng cửa sổ Studio Setup: mục **MIDI → MIDI Port Setup**: chụp danh sách cổng (có `loopMIDI Port` không? đang *Active*?).
4. Nếu **không có** Generic Remote hoặc không có loopMIDI Port: ghi "không có".
| Mục | Kết quả |
|---|---|
| Có Generic Remote? MIDI Input = ? | |
| Có cổng loopMIDI Port? | |

## Bước 6 — Thử phím F9–F12 và ghi trạng thái mixer (20 phút)
Trên bản sao project, mở **MixConsole** (phím F3 hoặc Devices → MixConsole). Project cần có kênh FX (ví dụ "Vang 1/2/3", "Delay" hoặc tên của bạn). Ghi **tên thật** của các kênh FX và kênh vocal.
1. Chụp mixer ban đầu. Ghi với mỗi kênh FX: **Mute** (nút M), **Send** của kênh vocal tới kênh đó (dB), fader.
2. Click vào cửa sổ Project (để Cubase nhận phím), bấm **F9** → chụp mixer, ghi lại trạng thái. Bấm **F9 lần nữa** → trạng thái có đổi không (lặp lại)?
3. Lặp lại với **F10**, **F11**, **F12** (mỗi phím bấm 2 lần, chụp sau từng lần).
4. Chuỗi: F9 → F10 → F9 → F11 → F9 → F12 → F9. Chụp sau mỗi phím.
5. Thử thêm: bấm F9 khi đang ở cửa sổ **MixConsole** (phím có chạy không?).
6. Nếu phím không làm gì hoặc Cubase báo lỗi: ghi nguyên văn.
| Phím | Lần | Mute từng kênh FX | Send từng FX (dB) | Track/kênh nào đổi | Ảnh |
|---|---|---|---|---|---|
| Ban đầu | – | | | | |
| F9 | 1 | | | | |
| F9 | 2 | | | | |
| F10 | 1 | | | | |
| F10 | 2 | | | | |
| F11 | 1 | | | | |
| F11 | 2 | | | | |
| F12 | 1 | | | | |
| F12 | 2 | | | | |

## Bước 7 — So RAP (F11) và RAPC (F12)
Đưa mixer về cùng một trạng thái xuất phát (ví dụ bấm F9 rồi chỉnh tay cho giống nhau). Bấm F11 → chụp. Quay lại đúng trạng thái xuất phát. Bấm F12 → chụp. Ghi khác biệt (Mute? Send? kênh nào?).
| Quan sát | RAP (F11) | RAPC (F12) |
|---|---|---|
| Thay đổi so với xuất phát | | |

## Bước 8 — Gửi lại
Ảnh, các file PLE đã copy và các bảng đã điền, trong `KET_QUA_VERIFY04\Cubase13\` (xem KHÓI-00 mục E).
