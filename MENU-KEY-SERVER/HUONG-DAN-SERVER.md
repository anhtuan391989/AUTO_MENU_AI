# Hướng dẫn dựng server Key cho MENU (Cloudflare, miễn phí)

Dành cho Khói. Chỉ cần bấm chuột và copy-paste, không gõ lệnh.
Tên nút trên Cloudflare có thể khác đôi chút theo thời gian; nếu khác, tìm nút có ý nghĩa tương tự.

**Gói gồm:** `schema.sql` (cấu trúc bảng), `worker.js` (mã server), `thu-server.html` (trang thử), file này.
**Đã kiểm tra:** logic server chạy đúng 23/23 bài thử trên máy mình với cơ sở dữ liệu giả lập. **Chưa kiểm tra trên Cloudflare thật**, nên làm bước 6 để xác nhận.

---

## Bước 1. Tạo cơ sở dữ liệu
1. Đăng nhập Cloudflare.
2. Menu bên trái: **Storage & Databases → D1 SQL Database**.
3. Bấm **Create Database**, đặt tên `menu-key-db`, bấm tạo.

## Bước 2. Tạo bảng
1. Bấm vào `menu-key-db`, chọn thẻ **Console**.
2. Mở file `schema.sql` bằng Notepad, copy toàn bộ, dán vào ô Console.
3. Bấm **Execute**. Thấy báo thành công là xong (có thể chạy lại, không hỏng gì).

## Bước 3. Tạo server
1. Menu bên trái: **Compute (Workers) → Workers & Pages**.
2. Bấm **Create application** → **Start with Hello World** → đặt tên `menu-key-server` → **Deploy**.
3. Bấm **Edit code**. Xóa hết mã có sẵn (Ctrl+A rồi Delete).
4. Mở `worker.js` bằng Notepad, copy toàn bộ, dán vào. Bấm **Deploy**.

## Bước 4. Nối server với cơ sở dữ liệu (rất quan trọng)
1. Vào server `menu-key-server`, mở thẻ **Bindings**.
2. Bấm **Add binding** → chọn **D1 database**.
3. Ô **Variable name** gõ đúng: `DB` (viết hoa, không dấu cách).
4. Ô database chọn `menu-key-db`. Bấm **Add binding**.
5. Nếu Cloudflare yêu cầu deploy lại thì bấm **Deploy**.

## Bước 5. Đặt mật khẩu quản trị (chỉ cần khi nạp hàng loạt `songdata`)
1. Vào server → **Settings → Variables and Secrets → Add**.
2. Type chọn **Secret**, Name gõ `ADMIN_TOKEN`, Value là một chuỗi dài ngẫu nhiên (20 ký tự trở lên). **Tự cất kỹ, không gửi cho ai, kể cả mình.**
3. Bấm Deploy.

## Bước 6. Kiểm tra server chạy đúng
1. Trên trang server, tìm địa chỉ dạng `https://menu-key-server.TEN-BAN.workers.dev`.
2. Mở địa chỉ đó thêm `/health` (ví dụ `.../health`) trên trình duyệt. Phải thấy `{"ok":true}`.
3. Mở file `thu-server.html` bằng trình duyệt, dán địa chỉ server (không có dấu `/` cuối).
4. Bấm **Tra Key** với ID `dQw4w9WgXcQ`: lần đầu phải báo `404` và `found:false`.
5. Bấm **Gửi phiếu thử**, rồi bấm **Tra Key** lại: phải ra Key `C`, trạng thái `provisional` (tạm).
6. Xong. Gửi mình **địa chỉ server** (không cần gửi gì khác).

## Cách server chốt Key
- Mỗi máy chỉ có 1 phiếu cho mỗi bài. Gửi lại thì thay phiếu cũ.
- `provisional` (tạm): chưa đủ phiếu. `confirmed` (đã xác nhận): đủ trọng số và từ 60% phiếu đồng thuận. `disputed` (tranh chấp): từ 3 phiếu trở lên nhưng không đồng thuận.
- C Major và A Minor tính chung một nhóm (cùng bộ nốt).
- Dữ liệu `songdata` do Khói nạp (nguồn `curated`) có trọng số rất cao, thắng phiếu của người dùng.
- Mỗi địa chỉ mạng gửi tối đa 300 phiếu/ngày.

## Nếu gặp lỗi
| Triệu chứng | Cách xử lý |
|---|---|
| `/health` không mở được | Chưa Deploy ở bước 3. Làm lại bước 3.4 |
| Lỗi `server_error` khi tra Key | Chưa nối DB hoặc chưa chạy bước 2. Kiểm tra tên biến đúng là `DB` |
| `thu-server.html` báo không kết nối | Địa chỉ sai hoặc có dấu `/` ở cuối |
| `rate_limited` | Đã gửi quá 300 phiếu hôm nay từ cùng mạng, đợi qua ngày |

## Giới hạn miễn phí (kiểm lại trên trang giá Cloudflare)
Theo các bài tổng hợp tháng 7–9/2026: 100.000 request/ngày cho Workers, 5 triệu lượt đọc và 100.000 lượt ghi/ngày cho D1. Hết hạn mức thì lỗi tới 00:00 UTC, nên MENU phải giữ bản lưu trên máy.

## Bước kế tiếp (làm cùng Claude)
1. Nối MENU vào server: tra theo ID trước, dò cục bộ nếu chưa có, rồi gửi phiếu lên. Cần đọc `keyEngine.js` và file `songdata` thật.
2. Nạp `songdata` đã có vào server bằng `ADMIN_TOKEN`.
3. Thêm thông báo xin phép người dùng trước khi gửi dữ liệu lên server.
