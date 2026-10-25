# HƯỚNG DẪN CUỐI — LIVE MIDI (MUSIC / MIC 1 / MIC 2 / FX / FX Auto)
Chỉ làm trên bản sao **`LIVE_TEST_CC.song`**. Không sửa Send/gain/routing, không sửa macro `LIVE_*` của bạn.

## 1. Chép file vào `G:\AUTO_MENU_AI` (như mọi lần)
- `changes/ui/js/renderer.js` → `ui\js\renderer.js` (đè) — **bản sửa FX Auto (bản trước chưa nằm trên main)**.
- `changes/tests/unit/*.verify.js` (5 file) → `tests\unit\`.
- Thư mục `macros/` (6 file `LIVE_V2_*`) **chưa cần cài**. Chỉ dùng ở mục 5 nếu có lỗi "bấm lần đầu chỉ chọn track". 8 macro `LIVE_*` bạn đang có **giống hệt** bản trong repo (đã so sánh), **không phải thay**.
- Tắt hẳn Menu, mở lại.

## 2. Lưu 8 mapping trong Setup (một lần)
Setup → MIDI → chọn cổng **AUTO MENU AI** → mục MIDI Output Mapping → bấm **"Điền + lưu bộ CC gợi ý LIVE"** → OK. Kiểm 8 dòng cuối đều "Đã lưu":

| Nút | ON | OFF | Kênh | Value | Macro |
|---|---|---|---|---|---|
| MUSIC | CC102 | CC103 | 16 | 127 | LIVE_MUSIC_ON / LIVE_MUSIC_OFF |
| MIC 1 | CC104 | CC105 | 16 | 127 | LIVE_MIC1_ON / LIVE_MIC1_OFF |
| MIC 2 | CC106 | CC107 | 16 | 127 | LIVE_MIC2_ON / LIVE_MIC2_OFF |
| FX | CC108 | CC109 | 16 | 127 | LIVE_FX_ON / LIVE_FX_OFF |

(Nếu bạn đã lưu FX ON/OFF từ trước thì giữ nguyên, chỉ cần đủ 8 dòng.) **Chưa lưu FX ON/OFF thì KHÔNG bấm nút FX** (có thể đi đường Send cũ).

## 3. Gán CC → macro trong Fender Studio Pro 8 (một lần)
1. External Devices: thiết bị **New Control Surface**, **Receive From = AUTO MENU AI**, **Send To = None**. (Không tạo trùng thiết bị.)
2. Mở **MIDI Learn** cho thiết bị đó.
3. Với MỖI nút Menu, bấm **một lần**, rê chuột lên nút đọc tooltip để biết vừa gửi **ON** hay **OFF** ("đã GỬI lệnh … ON/OFF"). FSP8 học một điều khiển mới → chuột phải → **Assign** → chọn macro đúng bảng mục 2 (ON ↔ `_ON`, OFF ↔ `_OFF`). Bấm lần nữa để học chiều còn lại.
4. Làm đủ 8. Ghi nhanh: `MUSIC ON→___ OFF→___ | MIC1 …`.
5. Nếu FSP8 không học được CC hoặc danh sách Assign không có macro → **DỪNG**, chụp ảnh, báo lại (không thử cách khác).

## 4. Thử FX (Action FX đã đạt, không lặp)
Bắt đầu: 4 bus **Delay, Verb ngắn, Verb dài, Com Verb** đang Mute, nút FX Menu tắt, tắt nhạc.
| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| F1 | Bấm FX (sáng) | 4 bus bỏ Mute | |
| F2 | Bấm FX (tắt) | 4 bus Mute | |
| F3 | Phát nhạc | ≈1 s: nút sáng **và** 4 bus bỏ Mute | |
| F4 | Dừng nhạc ≥ 2 s | nút tắt và 4 bus Mute | |
| F5 | Có nhạc, bấm FX tắt tay | Mute ngay; 60 s sau Auto mới tiếp quản | |
| F6 | Group Mic/Beat/Mic/Không Dây | không đổi | |
Tooltip đúng: "đã GỬI lệnh FX … — DAW chưa xác nhận". Nếu thấy "Send Reverb/Delay" hoặc "CHƯA cấu hình FX ON/OFF" → dừng, chụp.
Bỏ Mute bus mà vẫn không nghe FX = vấn đề Send/routing (ngoài task) — chụp mức Send, đừng sửa.

## 5. PHÉP THỬ BẮT BUỘC DUY NHẤT cho Monitor
Beat Monitor **BẬT**, Mic Monitor **TẮT**, đang chọn track **Group Mic**. Bấm nút **MIC 1** trên Menu **một lần**.
- **Đạt:** Mic Monitor bật ngay lần 1 và Beat Monitor vẫn bật. Lặp: MIC 1 tắt → Mic tắt, Beat vẫn bật; thử MUSIC và MIC 2 tương tự. → Xong.
- **Không đạt (lần đầu chỉ chọn track, hoặc Beat tự tắt):**
  1. Chạy riêng macro `LIVE_MIC1_ON` bằng **Action** với cùng trạng thái đầu. Cũng lỗi → lỗi nằm trong Studio Pro, không phải MIDI. Chạy được → lỗi ở bước gán CC (mục 3).
  2. Chép 6 macro `macros/LIVE_V2_*` vào `C:\Users\Khoi\Documents\Studio One\Macros` → Refresh; gán lại CC của nút đó sang macro `LIVE_V2_*` tương ứng; thử lại.
  3. Vẫn lỗi: Options → Advanced → Console → **Audio Input follows Selection**: ghi trạng thái hiện tại, đổi sang trạng thái ngược lại, thử lại, **rồi trả về trạng thái ban đầu**.
- Báo lại: Đạt/Không đạt, bước nào, ảnh nút Monitor Beat/Mic/Không Dây nếu có.
