# KHÓI-01 — Fender Studio Pro 8 (ƯU TIÊN 1): kiểm 4 macro NORM / LOFI / RAP / REMIX
Đọc KHÓI-00 trước. Không cần lập trình. Không có DÂN CA. Mục nào không có → ghi "không có".
Mọi kết quả chưa điền = `BLOCKED_USER_TEST` (chưa kiểm). Kỳ vọng bên dưới lấy từ file macro của PDL (đọc file), **không phải kết quả đã chạy**.

## Bước 1 — Thông tin phiên bản (5 phút)
1. Mở Fender Studio Pro 8 → menu **Help** (Trợ giúp) → **About** → chụp ảnh, **tô đen mã bản quyền/tài khoản**. Ghi số phiên bản đầy đủ (ví dụ 8.0.x / 8.1.x).
2. Bấm **Ctrl + Shift + Esc** (Task Manager) → tab **Details** (Chi tiết) → tìm tên tiến trình của DAW đang chạy → ghi **chính xác tên file `.exe`** (có phải `Studio One.exe` không?). Chụp ảnh dòng đó.
3. Ghi tên phần mềm hiển thị ở thanh tiêu đề cửa sổ.
| Mục | Giá trị |
|---|---|
| Số phiên bản | |
| Tên tiến trình (.exe) | |
| Ngày kiểm tra | |

## Bước 2 — Macro NORM/LOFI/RAP/REMIX có sẵn không? (10 phút)
1. Mở một session (bản sao `TEST_PRESET`).
2. Mở **Macro Organizer**: menu **Studio Pro → Macro Organizer** (hoặc bấm biểu tượng bánh răng cạnh tên Page trên thanh Macro Toolbar). Chụp toàn bộ danh sách (macro nằm trong nhóm *Custom*?).
3. Ghi: có đủ 4 macro `NORM`, `LOFI`, `RAP`, `REMIX` không? Ngoài ra có `BatMic`, `TatMic`, `BatVang4`, `TatVang4` không?
4. Trong Macro Organizer, xem **cột Shortcut** của 4 macro đó (phím tắt đã gán?) — chụp ảnh. Nếu trống → ghi "trống".
5. Menu **Studio Pro → Keyboard Shortcuts** → ô tìm kiếm gõ `macro` → chụp danh sách macro và phím của chúng.
6. Trong Macro Organizer bấm **Show Macros Folder** (mở thư mục macro) → chụp ảnh cửa sổ thư mục (thấy rõ đường dẫn, **che tên Windows**) → ghi các tên file `.studioonemacro`.
7. Macro Toolbar (thanh nút macro): có nút NORM/LOFI/RAP/REMIX không? Chụp.
8. Trong **Console**, panel **External**: có thiết bị nào đang gán lệnh macro không? Chụp (nếu không có thiết bị → ghi "không có").
**Nếu 4 macro KHÔNG có sẵn: dừng ở đây, ghi "chưa có macro" và gửi ảnh. KHÔNG tự nhập macro.**

| Câu hỏi | Trả lời |
|---|---|
| Có đủ 4 macro? | NORM:__ LOFI:__ RAP:__ REMIX:__ |
| Phím tắt (cột Shortcut) | NORM:__ LOFI:__ RAP:__ REMIX:__ |
| Có nút trên Macro Toolbar? | |
| Có gán MIDI trong External? | |
| Đường dẫn thư mục macro (đã che tên) | |

## Bước 3 — Chuẩn bị session thử (bản sao)
Session cần có track tên `NORM`, `LOFI`, `REMIX` và kênh FX tên `DELAY`, `VERB1`, `VERB2` (macro tìm theo TÊN). Nếu tên khác → ghi tên thật trong session và vẫn thử; macro có thể không tìm thấy (đó cũng là kết quả cần ghi).
Mở **Console** (Mixer). Chụp ảnh mixer toàn cảnh làm **trạng thái ban đầu**.

## Bước 4 — Thử từng macro bằng CHUỘT (không dùng phím)
Mỗi macro: bấm nút macro trên Macro Toolbar (hoặc chọn macro trong Macro Organizer rồi chạy). Với mỗi lần ghi các giá trị dưới đây (nhìn nút **M** Mute của track/kênh và độ sáng; Send xem trong Console/Inspector, ghi dB hoặc %).

Kỳ vọng từ file macro (1 = Mute BẬT, 0 = Mute TẮT; "1 = Mute" chưa kiểm trên máy bạn):
| Macro | LOFI | REMIX | NORM | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | 1 | 1 | 0 | 0 | 0 | 0 |
| LOFI | 0 | 1 | 1 | 0 | 0 | 0 |
| REMIX | 1 | 0 | 1 | 0 | 0 | 0 |
| RAP | 1 | 1 | 0 | 0 | 1 | 0 |

Thứ tự thử (ghi và chụp mixer SAU mỗi bước): NORM → LOFI → NORM → RAP → NORM → REMIX → NORM. Rồi chạy **RAP hai lần liên tiếp** (lần 2 có đổi gì không?).
| Bước | Mute LOFI | Mute REMIX | Mute NORM | Mute DELAY | Mute VERB1 | Mute VERB2 | Send→DELAY | Send→VERB1 | Send→VERB2 | Tên ảnh |
|---|---|---|---|---|---|---|---|---|---|---|
| Ban đầu | | | | | | | | | | |
| NORM (1) | | | | | | | | | | |
| LOFI | | | | | | | | | | |
| NORM (2) | | | | | | | | | | |
| RAP lần 1 | | | | | | | | | | |
| RAP lần 2 | | | | | | | | | | |
| NORM (3) | | | | | | | | | | |
| REMIX | | | | | | | | | | |
| NORM (4) | | | | | | | | | | |

## Bước 5 — Kiểm RIÊNG Mute và Send
1. Chạy macro RAP khi kênh **VERB1** đang bật. Nút Mute của **kênh VERB1** có sáng không? (Macro Mute *kênh FX* hay chỉ track?)
2. Chỉnh tay Send từ track vocal tới VERB1 về một giá trị lạ (ghi lại giá trị). Chạy lần lượt các macro. Send có đổi không?
3. Khi VERB1 đang Mute: nghe có còn vang không? Khi Send để thấp nhưng VERB1 không Mute: còn vang không?
(Chỉ ghi quan sát. Không chọn Mute hay Send — quyết định sau.)
| Thử | Kết quả |
|---|---|
| RAP làm Mute kênh VERB1? | |
| Macro nào làm đổi Send? | |
| Nghe khi VERB1 Mute | |
| Nghe khi Send thấp | |

## Bước 6 — Gửi lại
Ảnh Bước 1–5 + các bảng đã điền, trong thư mục `KET_QUA_VERIFY04/FSP8/` (xem KHÓI-00 mục E).
