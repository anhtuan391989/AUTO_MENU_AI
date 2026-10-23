# control-surface — KHÔNG có file cài đặt Control Surface (cố ý)

Không tạo file `.surface.xml` / `deviceinfo.xml` cho FSP8, vì định dạng chưa xác minh được:
- `QuangLuuMIDI.surface.xml` (ghi chú trong file: Studio One 7) và `AutoTune_KeyControl_StudioOne.surface.xml` dùng **hai cách viết khác nhau** cho cùng một ý (`status="#B0"` và `status="ControlChange"`); không file nào do FSP8 sinh ra. `VERIFIED_FILE`: chỉ là file văn bản của công cụ khác.
- File thật do FSP8 sinh ra (`Devices/surfacemanager.xml` trong `save new 2.1.song`) không dùng định dạng đó: thiết bị được lưu theo GUID, mỗi thiết bị có nút `controlAssignment`, **tất cả đang rỗng**.
- Tài liệu hãng không cho đường dẫn thư mục `User Devices` của FSP8 (chỉ có "Help > Open Settings Folder").

=> Dùng **cấu hình thủ công** trong `USER-TEST-GUIDE.md` (External Devices → học nút MIDI → Assign Command → Macro).

## CC thử nghiệm đề xuất (kênh MIDI 16, giá trị gửi: 127)
Đã rà xung đột: repo đang dùng CC 20, 21, 22, 23, 24, 74, 118, 119 (và Note 0–11); các file tham khảo dùng CC 10, 11, 14, 15, 20–23, 30–39, 41–44, 50–53. Chọn dải 102–109 (không trùng, kênh 16 để tránh luôn các mapping kênh 1).

| Nút Menu | Hành động | Macro | CC (kênh 16) | Giá trị |
|---|---|---|---|---|
| MUSIC bật | Monitor Beat ON | LIVE_MUSIC_ON | 102 | 127 |
| MUSIC tắt | Monitor Beat OFF | LIVE_MUSIC_OFF | 103 | 127 |
| MIC 1 bật | Monitor Mic ON | LIVE_MIC1_ON | 104 | 127 |
| MIC 1 tắt | Monitor Mic OFF | LIVE_MIC1_OFF | 105 | 127 |
| MIC 2 bật | Monitor Không Dây ON | LIVE_MIC2_ON | 106 | 127 |
| MIC 2 tắt | Monitor Không Dây OFF | LIVE_MIC2_OFF | 107 | 127 |
| FX bật | Mute=0 cả 4 bus | LIVE_FX_ON | 108 | 127 |
| FX tắt | Mute=1 cả 4 bus | LIVE_FX_OFF | 109 | 127 |

Nguyên tắc: **mỗi Macro một CC riêng; ON và OFF là hai CC khác nhau**. Không dựa vào "giá trị 0 = OFF" (chưa biết FSP8 có gọi macro khi nhận 0 hay không).
Đây là CC **thử nghiệm**; chưa nhập vào Menu hay mã nguồn.
