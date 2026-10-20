# Checklist A — Bắt lệnh THẬT mà PDL gửi khi bấm NORM / LOFI / RAP / REMIX
Mục đích: biết PDL dùng MIDI CC, Note, phím tắt hay cách khác. Không cần lập trình. Làm trên máy chạy PDL thật + DAW thật.
Không có DÂN CA. Ghi kết quả vào bảng cuối. Chưa làm xong = `BLOCKED_USER_TEST` (KHÔNG được coi là đã xác minh).

## Chuẩn bị (1 lần)
1. Ghi: PDL phiên bản (file `version.dat`), DAW + phiên bản (Help > About), tên tiến trình DAW trong Task Manager (tab Details).
2. Ghi cổng MIDI PDL đang dùng (cửa sổ Cài đặt PDL hoặc dòng `midi_port =` trong `config.ini`). Che/xoá mục `[LICENSE]` và mọi mã bản quyền trước khi gửi file.
3. Cài một phần mềm theo dõi MIDI miễn phí (ví dụ MIDI-OX hoặc MIDIberry), mở nó và chọn đúng cổng loopMIDI mà PDL gửi ra (chỉ nghe, không gửi).
4. Mở PDL, bật DAW đúng bài mẫu. Mở thư mục dữ liệu PDL (xem `version.dat`: thường dưới `%APPDATA%\PDL-STUDIO\auto-menu-ai-s1`), sắp xếp theo "Date modified" và chụp ảnh danh sách file.

## Thao tác cho MỖI nút (NORM → LOFI → RAP → REMIX), mỗi nút bấm 2 lần, cách nhau ~3 giây
1. Xoá nhật ký của phần mềm theo dõi MIDI.
2. Bấm nút trên PDL. Chờ 3 giây.
3. Chụp ảnh/lưu nhật ký MIDI (ghi rõ có/không có dòng nào; nếu có: loại Note/CC, kênh, số, giá trị).
4. Quan sát DAW: preset có đổi không (xem checklist B/C để ghi trạng thái).
5. Ghi cửa sổ DAW đang ở phía trước (focus) khi bấm.
6. Nếu nhật ký MIDI TRỐNG mà DAW vẫn đổi: ghi "không có MIDI" (gợi ý PDL gửi phím/gọi cách khác) — KHÔNG tự kết luận; chuyển sang bước 7.
7. Thử "đóng cổng MIDI" (tạm tắt cổng loopMIDI hoặc ngắt kết nối cổng trong PDL) rồi bấm lại: DAW còn đổi không? Ghi kết quả.
8. Sau khi bấm xong cả 4 nút: mở lại thư mục dữ liệu PDL, ghi file nào mới đổi giờ sửa (đặc biệt file tên chứa `mode`/`override`); gửi nội dung các file đó (đã che mã bản quyền).

## Bảng ghi kết quả (copy ra điền)
| Nút PDL | Lần | Có MIDI? (Note/CC, kênh, số, giá trị) | DAW đổi? | Cửa sổ trước khi bấm | Ghi chú/ảnh |
|---|---|---|---|---|---|
| NORM | 1 | | | | |
| NORM | 2 | | | | |
| LOFI | 1 | | | | |
| LOFI | 2 | | | | |
| RAP | 1 | | | | |
| RAP | 2 | | | | |
| REMIX | 1 | | | | |
| REMIX | 2 | | | | |

## Gửi lại cho Claude A
- Ảnh/nhật ký MIDI, bảng trên, file `config.ini` đã che mục `[LICENSE]`, các file mới sửa trong thư mục dữ liệu PDL (đặc biệt file chứa mode_overrides nếu có).
