# Hướng dẫn triển khai toàn bộ hệ thống AUTO_MENU_AI

## Tổng quan

Hệ thống gồm 3 phần:
1. **Server** (Cloudflare Worker + D1) — lưu trữ & phục vụ dữ liệu khóa bài hát
2. **MENU** (code của bạn) — phân tích khóa & điều khiển Auto-Tune, dùng `menu-api-client.js`
3. **Giao diện web** — đi kèm trong server, xem/quản lý dữ liệu

---

## Bước 1: Tạo Cloudflare Worker

1. Đăng nhập https://dash.cloudflare.com → Workers & Pages → Create → Create Worker
2. Đặt tên: `menu-key-server` → Deploy
3. Vào **Edit code** → xóa code mặc định → dán nội dung `server/worker.js` → Deploy

## Bước 2: Tạo CSDL D1 & kết nối

1. Workers & Pages → D1 → Create database → tên `menu-key-db`
2. Quay lại Worker `menu-key-server` → Settings → Variables → D1 Database Bindings → Add binding:
   - **Variable name**: `DB` (viết hoa, đúng chính tả)
   - **Database**: chọn `menu-key-db` → Save
3. Deploy lại Worker 1 lần nữa

## Bước 3: Tạo bảng dữ liệu

Mở trình duyệt vào:
```
https://menu-key-server.<tên-miền>.workers.dev/init
```
→ Hiện `{"ok":true,...}` là thành công. (Chỉ cần làm 1 lần)

## Bước 4: Tích hợp vào MENU

1. Copy `menu-integration/menu-api-client.js` vào thư mục MENU
2. Khởi tạo:
   ```javascript
   const { MenuKeyClient } = require('./menu-api-client.js');
   const keyClient = new MenuKeyClient("https://menu-key-server.<tên-miền>.workers.dev");
   ```
3. Tham khảo `menu-integration/example-usage.js` để tích hợp các luồng:
   - Mở bài → tải dữ liệu cũ
   - Phân tích xong → gửi đoạn khóa lên server
   - Phát nhạc → tra khóa mỗi giây → đặt Auto-Tune

## Bước 5: Kiểm tra

- Mở trang chủ Worker → thấy giao diện quản lý ✅
- Mở tab "Tất Cả Bài" → thấy danh sách bài đã lưu ✅
- Tìm 1 bài → thấy đầy đủ đoạn khóa + điểm chuyển tông ✅

---

## Lưu ý quan trọng

- Sau mỗi lần sửa `worker.js`, nhớ **Deploy** và **Ctrl+Shift+R** để bỏ cache trình duyệt
- Tên binding **phải là `DB`** (viết hoa), nếu sai server không kết nối được CSDL
- `mode` luôn dùng `"major"`/`"minor"` tiếng Anh — không dùng "Trưởng"/"Phụ" khi gửi lên server
