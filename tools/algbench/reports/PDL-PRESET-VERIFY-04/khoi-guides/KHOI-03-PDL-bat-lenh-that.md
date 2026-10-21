# KHÓI-03 — Bắt lệnh THẬT mà PDL gửi khi bấm NORM / LOFI / RAP / REMIX (cập nhật từ CHECKLIST-A của VERIFY-03)
Đọc KHÓI-00 trước. Làm sau khi xong KHÓI-01 hoặc KHÓI-02 (cùng một máy, cùng một DAW). Không cần lập trình. Chưa làm = `BLOCKED_USER_TEST`.
Mục tiêu: biết PDL gửi **MIDI CC/Note**, **phím tắt** hay **cách khác**. Không có DÂN CA.

## Bước 1 — Chuẩn bị
1. Ghi: phiên bản PDL (file `version.dat` trong thư mục PDL), DAW đang dùng (Fender Studio Pro 8 hay Cubase 13), tên cổng MIDI PDL dùng (dòng `midi_port =` trong `config.ini`, hoặc cửa sổ cài đặt PDL).
2. Cài một phần mềm theo dõi MIDI miễn phí (ví dụ **MIDI-OX** hoặc **MIDIberry**), mở nó, chọn **đúng cổng loopMIDI** mà PDL gửi ra (chỉ nghe). Nếu không cài được: ghi "chưa cài", dừng bước theo dõi MIDI, vẫn làm các bước khác.
3. Mở thư mục dữ liệu PDL (xem `version.dat`; thường dưới `%APPDATA%\PDL-STUDIO\auto-menu-ai-s1`), sắp xếp theo **Date modified**, chụp ảnh danh sách file (che tên Windows).
4. Mở DAW, mở bản sao session/project test.

## Bước 2 — Bấm từng nút trong PDL (NORM → LOFI → RAP → REMIX), mỗi nút 2 lần, cách nhau ~3 giây
1. Xoá nhật ký của phần mềm theo dõi MIDI.
2. Bấm nút trong PDL, chờ 3 giây.
3. Chụp nhật ký MIDI: có dòng nào không? Nếu có ghi **loại (Note/CC), kênh, số, giá trị**.
4. Nhìn DAW: preset có đổi không (ghi Mute theo hướng dẫn KHÓI-01 hoặc KHÓI-02)?
5. Ghi cửa sổ nào đang ở phía trước khi bấm.
6. Nếu nhật ký MIDI **trống** mà DAW vẫn đổi: ghi "không có MIDI" (không tự kết luận gì thêm).
| Nút PDL | Lần | Có MIDI? (Note/CC, kênh, số, giá trị) | DAW đổi? | Cửa sổ phía trước | Ảnh |
|---|---|---|---|---|---|
| NORM | 1 | | | | |
| NORM | 2 | | | | |
| LOFI | 1 | | | | |
| LOFI | 2 | | | | |
| RAP | 1 | | | | |
| RAP | 2 | | | | |
| REMIX | 1 | | | | |
| REMIX | 2 | | | | |

## Bước 3 — Sau khi bấm xong
1. Mở lại thư mục dữ liệu PDL, ghi **file nào vừa đổi giờ sửa** (đặc biệt tên có `mode` hoặc `override`).
2. Copy các file đó (đã che bản quyền theo KHÓI-00) vào `KET_QUA_VERIFY04\PDL\`.
3. Copy `config.ini` đang dùng, **đã che** mục `[LICENSE]`, tên Windows và các giá trị id/token (KHÓI-00 mục D), lưu tên `config_da_che.ini`.

## Bước 4 — Nếu PDL có chỗ "ghi đè nút chế độ"/"Tùy biến" (chuột phải/menu ⋮ của nút NORM/LOFI/RAP/REMIX)
Chỉ **nhìn và chụp** cửa sổ cài đặt (loại hành động: CC, giá trị 127/0, ấn giữ…). Không sửa, không lưu.
