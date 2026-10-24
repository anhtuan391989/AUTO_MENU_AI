# FSP8-STATE-VERIFY-01 — Một chuỗi thử: `Mute State 1` và `State 0` có đặt đích danh không? (~4 phút)

> Chỉ thử Mute của track **`Mic`** trên bản sao `LIVE_TEST.song` (không lưu đè project gốc). Không MIDI/CC, không `Find Track`, không macro khác, không chạm M của track khác. Không làm lại SEL-1 / Find Track.

## Chuẩn bị (2 file)
1. Chép 2 file trong `tools\algbench\reports\FSP8-STATE-VERIFY-01\macros\` (`DIAG_MUTE_STATE_1_SELECTED`, `DIAG_MUTE_STATE_0_SELECTED`) vào `C:\Users\Khoi\Documents\Studio One\Macros`, rồi bấm **Refresh** trong Macro Organizer (hoặc mở lại Studio One). Chúng nằm trong nhóm **DIAG_TEST**. Nếu không thấy macro trong danh sách Action: 📷 chụp rồi **dừng**.

## Thực hiện (4 ảnh sau mỗi lần chạy)
Chỉ báo duy nhất: **nút M của `Mic`** (đỏ = Mute bật, xám = tắt) — như ảnh SEL-1.
0. Bấm chuột chọn track **`Mic`**. Đảm bảo nút M của `Mic` đang **tắt**. (Nếu đang bật, bấm M bằng chuột cho tắt.) 📷 *Ảnh 0 (khởi đầu).*
1. Chạy **`DIAG_MUTE_STATE_1_SELECTED`** (Action). 📷 **Ảnh 1.**
2. Chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 2.**
3. Chạy **`DIAG_MUTE_STATE_0_SELECTED`** (1 lần). 📷 **Ảnh 3.**
4. Chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 4.**
(Mỗi ảnh: toàn màn hình, thấy nút M của `Mic`, `Beat`, `Không Dây`. Giữa các lần chạy **không chạm gì khác**.)

## PASS / FAIL (chỉ dựa vào nút M của `Mic` trong ảnh)
| Ảnh | PASS (State đặt đích danh) |
|---|---|
| 1 | M **bật** |
| 2 | M **vẫn bật** (không đảo) |
| 3 | M **tắt** |
| 4 | M **vẫn tắt** (không đảo) |
- **FAIL:** chạy cùng State hai lần mà M **đảo** (hoạt động như toggle), hoặc trạng thái không khớp bảng trên.
- **PARTIAL:** chỉ State 1 (ảnh 1–2) **hoặc** chỉ State 0 (ảnh 3–4) đúng → ghi rõ chiều nào đúng.
- **KHÔNG RÕ:** ảnh không cho thấy rõ M đổi → gửi ảnh, không thử thêm.

## Gửi lại
5 ảnh (0, 1, 2, 3, 4). Không cần gì khác.
