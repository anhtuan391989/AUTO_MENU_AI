# Checklist B — Studio One / Fender Studio Pro: kiểm thử 4 macro NORM / LOFI / RAP / REMIX
Không cần lập trình. Làm trên máy DAW thật. Chưa có ảnh/log của Khói = `BLOCKED_USER_TEST` (không được coi là đã chạy thành công). Không có DÂN CA.
Kỳ vọng dưới đây lấy từ file macro (VERIFIED là ĐỌC FILE), CHỈ để so sánh — KHÔNG phải kết quả đã chạy.

## B0. Thông tin máy (ghi lại)
| Mục | Giá trị |
|---|---|
| Tên chương trình hiển thị (Studio One hay Fender Studio Pro) + phiên bản (Help > About) | |
| Tên tiến trình trong Task Manager > Details (ví dụ `Studio One.exe`?) | |
| Thư mục dữ liệu người dùng (File Explorer, tìm thư mục có `user.keyscheme`) | |
| Đã nạp bài mẫu nào (tên .song)? Có đúng các track NORM, LOFI, REMIX và kênh FX DELAY, VERB1, VERB2 không? Có VERB3 không? | |

## B1. Macro có thật và gọi bằng cách nào (chụp ảnh từng bước)
1. Mở Macro Organizer (nút bánh răng cạnh tên Page trên Macro Toolbar, hoặc menu Studio Pro/Macro Organizer). Chụp danh sách: có đủ NORM, LOFI, RAP, REMIX (nhóm Custom)?
2. Cột **Shortcut** của 4 macro NORM/LOFI/RAP/REMIX: trống hay có phím? (Dữ liệu `user.keyscheme` của gói PDL cho thấy 4 macro này KHÔNG có phím; cần xác nhận trên máy của Khói.)
3. Mở Keyboard Shortcuts, tìm "macros", chụp 4 macro này và mọi phím trùng.
4. Macro Toolbar có nút cho 4 macro này không? Chụp.
5. Panel External của Console: có thiết bị nào đang gán macro (MIDI) không? Chụp device map.
6. Chọn nút **Show Macros Folder** trong Macro Organizer: ghi đường dẫn thư mục (để so với gói PDL).
| Hỏi | Trả lời |
|---|---|
| 4 macro có tồn tại? | |
| Phím tắt của từng macro | NORM: ___ LOFI: ___ RAP: ___ REMIX: ___ |
| Có nút trên Macro Toolbar? | |
| Có gán MIDI (device map)? | |
| Đường dẫn thư mục macro | |

## B2. Trạng thái trước/sau (làm cho TỪNG macro, bấm bằng chuột trên Macro Toolbar/Organizer — KHÔNG dùng phím)
Trước mỗi lần thử, đưa mixer về trạng thái "xuất phát" ghi ở dòng TRƯỚC. Chụp ảnh Console (toàn mixer) trước và sau.

Các giá trị cần ghi (cho cả TRƯỚC và SAU):
- Track NORM, LOFI, REMIX: **Mute** bật/tắt.
- Kênh FX DELAY, VERB1, VERB2: **Mute** bật/tắt.
- **Send** từ track Master Vocal tới DELAY, VERB1, VERB2 (ghi dB hoặc % như DAW hiển thị).
- Gain/fader của kênh FX DELAY, VERB1, VERB2 và Master Vocal.

Kỳ vọng từ file macro (so sánh, KHÔNG phải kết quả; 1 = Mute BẬT, 0 = Mute TẮT; ý nghĩa 1=Mute là PARTIAL):
| Macro | LOFI | REMIX | NORM | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | 1 | 1 | 0 | 0 | 0 | 0 |
| LOFI | 0 | 1 | 1 | 0 | 0 | 0 |
| REMIX | 1 | 0 | 1 | 0 | 0 | 0 |
| RAP | 1 | 1 | 0 | 0 | 1 | 0 |

Bảng ghi (copy cho mỗi macro: NORM, LOFI, RAP, REMIX; mỗi macro chạy 2 lần liên tiếp để kiểm tra lặp lại):
| Macro / lần | Trạng thái xuất phát | Mute LOFI | Mute REMIX | Mute NORM | Mute DELAY | Mute VERB1 | Mute VERB2 | Send DELAY | Send VERB1 | Send VERB2 | Ảnh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NORM lần 1 TRƯỚC | | | | | | | | | | | |
| NORM lần 1 SAU | | | | | | | | | | | |
| NORM lần 2 SAU (chạy lại) | | | | | | | | | | | |
| (lặp cho LOFI, RAP, REMIX) | | | | | | | | | | | |

Chuỗi chuyển (ghi trạng thái SAU mỗi bước): NORM → LOFI → NORM → RAP → NORM → REMIX → NORM → (từ trạng thái bất kỳ chọn tay) → NORM.
Câu hỏi: macro có luôn cho cùng kết quả bất kể trạng thái xuất phát không (idempotent)? ____

## B3. Kiểm tra RIÊNG: Mute/Unmute kênh FX và Send (không gộp)
1. **Mute FX:** chạy macro RAP khi VERB1 đang Unmute. VERB1 có chuyển sang Mute không? Chỉ KÊNH VERB1 hay còn gì khác? (Điểm cần xác minh: trong file macro, lệnh "Mute" thuộc nhóm *Track* nhưng đứng sau "Find Channel" (Console) — có thực sự tác động kênh FX không?)
2. **Send:** chỉnh tay Send tới VERB1 về một giá trị lạ (ghi lại), chạy từng macro. Send có đổi không? (Kỳ vọng từ file macro: macro KHÔNG có lệnh chỉnh Send — INFERRED, cần xác nhận.)
3. Khi FX bị Mute, tiếng FX có còn nghe không? (Nghe qua loa/đồng hồ meter của kênh FX.) Ghi lại.
4. Khi Send = thấp/0 mà kênh FX Unmute: tiếng FX còn không? (Chỉ ghi, KHÔNG chọn thay Khói nên dùng Mute hay Send.)
| Thử | Kết quả | Ảnh |
|---|---|---|
| RAP làm VERB1 Mute? | | |
| Macro nào làm đổi Send? | | |
| Tiếng FX khi Mute | | |
| Tiếng FX khi Send thấp | | |

## B4. Âm thanh (nếu muốn): ghi 10–15 giây mic/nhạc mỗi preset, đặt tên `S1_<preset>.wav` (KHÔNG bắt buộc cho task này).

## B5. Kết luận cho Khói tự điền
| Macro | Chạy được trên DAW thật? | Ảnh/nhật ký đính kèm |
|---|---|---|
| NORM | | |
| LOFI | | |
| RAP | | |
| REMIX | | |
Mặc định (chưa điền) = `BLOCKED_USER_TEST`.
