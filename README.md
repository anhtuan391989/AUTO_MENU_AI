# AUTO_MENU_AI — Windows SMTC Prototype (Nghiên cứu khả thi)

## Đây là gì?

Đây là 1 script PowerShell **độc lập hoàn toàn**, không thuộc project
AUTO_MENU_AI, không được merge vào `main`. Mục đích duy nhất: chứng
minh (hoặc bác bỏ) khả năng dùng Windows SMTC để tự động biết bài hát
đang phát mà không cần người dùng nhập gì.

## ⚠️ Quan trọng — tôi (Claude) CHƯA tự chạy được script này

Tôi viết script này trong môi trường Linux sandbox, **không có
Windows/PowerShell/WinRT để tự kiểm thử**. Toàn bộ logic dựa trên tài
liệu chính thức của Microsoft (đã tra cứu, có dẫn nguồn trong file
`SmtcPrototype.ps1`), nhưng **chưa có bằng chứng thực tế nào rằng nó
chạy đúng trên máy Windows thật**. Cần Khói tự chạy và cho biết kết
quả — báo cáo chính thức sẽ dựa trên kết quả đó, không suy đoán.

## Cách chạy

1. Copy toàn bộ thư mục này (`prototype_smtc/`) sang máy Windows 10
   (bản 1809 trở lên) hoặc Windows 11.
2. Mở PowerShell, `cd` vào thư mục vừa copy.
3. Chạy:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\SmtcPrototype.ps1
   ```
   Script sẽ polling liên tục mỗi 2 giây, in ra bảng Application /
   Title / Artist / Album / HasThumbnail. Nhấn `Ctrl+C` để dừng.

4. Để đo thời gian lấy dữ liệu 1 lần (phục vụ đánh giá độ trễ):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\SmtcPrototype.ps1 -Once
   ```

## Bảng kiểm tra — nhờ Khói tự điền kết quả THẬT

Mở từng ứng dụng, phát 1 bài/video, rồi chạy script (`-Once` cho gọn),
ghi lại đúng những gì script in ra (không tự suy diễn):

| Ứng dụng | Đã mở & phát thử? | Có xuất hiện trong danh sách session? | Title đúng? | Artist đúng? | Album? | Thumbnail? | Ghi chú |
|---|---|---|---|---|---|---|---|
| Chrome + YouTube | ☐ | | | | | | |
| Edge + YouTube | ☐ | | | | | | |
| Spotify (desktop app) | ☐ | | | | | | |
| VLC (chưa cài plugin gì thêm) | ☐ | | | | | | |
| Windows Media Player (Legacy, `wmplayer.exe`) | ☐ | | | | | | |

Vài tình huống nên thử thêm nếu có thời gian:
- Mở **2 nguồn cùng lúc** (vd Chrome đang phát YouTube + Spotify cũng
  đang phát) → xem `IsCurrent` có chọn đúng cái đang thực sự cần theo
  dõi không, hay chọn nhầm.
- Chuyển bài trong lúc script đang polling → xem Title/Artist có cập
  nhật đúng ở lần polling kế tiếp không.
- Ghi lại số ms hiển thị ở dòng "mất ... ms" mỗi lần polling — đây là
  độ trễ THẬT, quan trọng cho phần "Đánh giá độ trễ" của báo cáo.

## Sau khi có kết quả

Gửi lại bảng đã điền (hoặc chụp màn hình output) — báo cáo cuối cùng
về việc có nên tích hợp SMTC vào AUTO_MENU_AI hay không sẽ dựa trên
dữ liệu này, không dựa trên suy đoán.
