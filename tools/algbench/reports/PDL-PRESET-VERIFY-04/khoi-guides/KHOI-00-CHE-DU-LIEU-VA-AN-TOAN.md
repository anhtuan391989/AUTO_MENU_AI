# KHÓI-00 — Che dữ liệu nhạy cảm và giữ an toàn trước khi thử (ĐỌC TRƯỚC)

## A. Nguyên tắc an toàn (bắt buộc)
1. **Làm việc trên BẢN SAO.** Trước khi thử macro/phím: trong DAW chọn *Save As* (Lưu thành) để tạo bản sao session/project tên `TEST_PRESET`, rồi chỉ thử trên bản sao.
2. **Không sửa gì thêm.** Các hướng dẫn chỉ yêu cầu *nhìn, chụp ảnh, bấm thử macro/phím có sẵn*. Không nhập/xoá macro, không đổi Key Commands, không đổi preset.
3. Nếu một bước không làm được hoặc mục không có: ghi **"không có"** hoặc **"không làm được"** rồi qua bước kế. Không đoán.
4. Không cần cài thêm phiên bản DAW nào khác. Chỉ làm trên **Fender Studio Pro 8** và **Cubase Pro 13**.

## B. Những thứ PHẢI che/xoá trước khi gửi
| Loại | Ở đâu hay gặp | Cách che |
|---|---|---|
| Mã bản quyền, serial, license | `config.ini` mục `[LICENSE]`; cửa sổ Help > About của DAW; trang tài khoản | Trong file text: xoá hết nội dung dưới `[LICENSE]`, thay bằng `[LICENSE]` rỗng. Ảnh chụp: tô đen |
| Tên tài khoản, email, tên Windows | Đường dẫn dạng `C:\Users\TÊN\...`; góc phải DAW (tài khoản Fender/Steinberg); ảnh About | Trong file text: thay `TÊN` bằng `USER`. Ảnh: tô đen |
| Mã định danh trình duyệt/PWA/cloud, token | `config.ini` (`id_pwa`, đường dẫn YouTube…) | Xoá giá trị sau dấu `=` của các dòng đó |
| Nhạc/giọng hát có bản quyền | Thư mục audio của project | **Không gửi file audio/project.** Chỉ gửi ảnh chụp mixer |
| Cả thư mục AppData | `%APPDATA%` | **Không nén gửi cả thư mục.** Chỉ gửi đúng các file được nêu trong hướng dẫn |

## C. Cách che ảnh chụp (Windows)
1. Bấm **Windows + Shift + S**, kéo chọn vùng cần chụp (chỉ vùng mixer/hộp thoại, tránh thanh tài khoản).
2. Mở ảnh trong **Paint** (hoặc Snipping Tool) → dùng *Hình chữ nhật* tô **đặc màu đen** lên phần cần che → Lưu.
3. Kiểm tra lại: phóng to xem còn đọc được chữ nào nhạy cảm không.

## D. Cách che file text (`config.ini`, `.xml`)
1. Chuột phải file → **Open with → Notepad**.
2. Dùng **Ctrl + H** (Thay thế): tìm tên Windows của bạn → thay bằng `USER`; tìm mọi mã bản quyền (nếu có) → xoá.
3. Lưu thành **tên mới** (ví dụ `config_da_che.ini`). **Không ghi đè file gốc.**

## E. Gửi lại thế nào
Gom ảnh/file vào MỘT thư mục tên `KET_QUA_VERIFY04`, nén thành một file `.zip`, gửi cho Claude A cùng các bảng đã điền (copy từ các hướng dẫn KHÓI-01/02/03).
