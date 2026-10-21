# KHÓI-04 — Các phiên bản khác (làm SAU NÀY, khi có máy/phiên bản; KHÔNG cần cài ngay)
Không cần cài thêm phiên bản nào ngay bây giờ. Ưu tiên: Fender Studio Pro 8 (KHÓI-01) và Cubase Pro 13 (KHÓI-02). Dưới đây là dữ liệu tối thiểu cần khi một phiên bản khác có mặt trên máy nào đó. Đọc KHÓI-00 để che dữ liệu.

## Studio One 5 / 6 / 7 (và 8 nếu khác FSP8)
| Cần | Cách lấy | Vì sao |
|---|---|---|
| Ảnh Help → About (che serial) | chụp ảnh | xác nhận phiên bản chính xác |
| Thư mục macro | Macro Organizer → *Show Macros Folder*; ghi tên các file `.studioonemacro` | so với macro của PDL |
| Phím tắt macro | Macro Organizer cột Shortcut; Keyboard Shortcuts tìm `macro` | xem NORM/LOFI/RAP/REMIX có phím không |
| File phím tắt | trong File Explorer tìm `user.keyscheme` dưới `%APPDATA%\PreSonus` (đường dẫn theo cấu trúc gói PDL "PreSonus\Studio One N\user.keyscheme" — suy ra, cần xác nhận) | đối chiếu với bản trong gói PDL |
| Thử macro (như KHÓI-01 Bước 4–5) | làm trên bản sao session | Mute/Send |

## Cubase 10 / 10.5 / 11 / 12 / 14 / 15
| Cần | Cách lấy | Vì sao |
|---|---|---|
| Ảnh Help → About (che serial) | chụp ảnh | xác nhận phiên bản |
| `Key Commands.xml` | tìm `Key Commands.xml` dưới `%APPDATA%\Steinberg` (thư mục dạng `Cubase NN_64`); COPY ra `KET_QUA_VERIFY04\CubaseNN\` | so phím F9–F12 theo từng phiên bản |
| Tìm lệnh NORMC/LOFIC/RAP/RAPC/REMIX/REMIXC trong Edit → Key Commands | chụp ảnh như KHÓI-02 Bước 2 | xác nhận phím |
| Preset PLE | như KHÓI-02 Bước 3–4 | nội dung từng preset |
| Thử F9–F12 | như KHÓI-02 Bước 6 | trạng thái mixer |

## Khác biệt cần chú ý khi so với phiên bản ưu tiên (từ dữ liệu gói PDL)
- Cubase 10/10.5/11/12: F11 = REMIXC, F12 = RAPC; RAP chưa có phím. Cubase 13/14/15: F11 = RAP, F12 = RAPC; REMIX/REMIXC không có phím.
- Chỉ Cubase 14 có file PLE (RAP, RAPC) trong gói PDL.
