# AUTO_MENU_AI — Tích hợp MENU ↔ Server

Module này giúp MENU giao tiếp 2 chiều với Key Server: **lấy dữ liệu cũ** và **gửi dữ liệu mới** lên server.

## Cài đặt

Copy 2 file vào thư mục MENU:
- `menu-api-client.js` — module chính
- `example-usage.js` — mẫu code tham khảo

## Khởi tạo (1 lần)

```javascript
const { MenuKeyClient } = require('./menu-api-client.js');
const keyClient = new MenuKeyClient("https://menu-key-server.matuotluuly.workers.dev");
```

## Các hàm có sẵn

| Hàm | Công dụng | Trả về |
|---|---|---|
| `layThongTinBai(songId)` | Tải đầy đủ 1 bài (tên, đoạn khóa, chuyển tông) | `{ thongTin, doans[], chuyenTong[] }` |
| `layKhoaTaiGiay(songId, giay)` | Tra khóa tại giây N (cho Auto-Tune) | `{ found, key, mode, modeDisplay }` |
| `layDanhSachBai()` | Danh sách tất cả bài đã lưu | `[{ songId, title, ... }]` |
| `luuThongTinBai({songId, title, totalDurationSec})` | Lưu/cập nhật thông tin bài | `{ ok }` |
| `themDoanKhoa({songId, startSec, endSec, key, mode})` | Thêm 1 đoạn khóa | `{ ok, segment }` |
| `dongBoBai({songId, title, totalDurationSec, doans})` | Đồng bộ toàn bộ 1 bài 1 lần | `{ soDoanDaThem }` |
| `khoiTaoBang()` | Tạo bảng CSDL (chạy 1 lần đầu) | `{ ok }` |

## Quy ước dữ liệu QUAN TRỌNG

- **`mode`** luôn là `"major"` hoặc `"minor"` (tiếng Anh) — MENU gửi và nhận trực tiếp, **KHÔNG cần đổi**
- **`cheDo` / `modeDisplay`** là `"Truong"` / `"Phu"` (tiếng Việt) — chỉ dùng hiển thị giao diện
- **`key`** dùng chuẩn: C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B (có thể kèm minor như Am = A minor)

## Luồng hoạt động khép kín

```
Mở bài → layThongTinBai() → Có dữ liệu? → Dùng luôn, không phân tích lại
                              ↓ Không
                        Phân tích khóa → themDoanKhoa() mỗi đoạn
                              ↓
                        Phát nhạc → layKhoaTaiGiay() mỗi giây → đặt Auto-Tune
```

Xem `example-usage.js` để xem code mẫu đầy đủ cho từng trường hợp.
