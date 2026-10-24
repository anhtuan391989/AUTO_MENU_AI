# FSP8-COMBINED-MACRO-VERIFY-01 — Một phép thử kết hợp `Find Track` + `Mute State` (~5 phút)

> Dùng **macro đã có** (nhóm DIAG_TEST): `DIAG_A2_MIC_MUTE` (= `Find Track "Mic"` + `Mute State 1`) và `DIAG_A1_MIC_UNMUTE` (= `Find Track "Mic"` + `Mute State 0`). **Không cài thêm gì.** Không MIDI/CC, không đổi Send/gain/routing/plugin/Monitor. Làm trên bản sao `LIVE_TEST.song`.
> Không làm lại test Find Track / State riêng lẻ.

## Điểm khác so với lần thử cũ (quan trọng)
Lần này **chọn tay một track KHÁC `Mic` trước khi chạy** (chọn `Không Dây`). Nếu bắt đầu khi `Mic` đã được chọn, macro có thể "đúng" mà không chứng minh được `Find Track` làm gì. Bắt đầu từ track khác cho biết dứt khoát lệnh `Mute` tác động lên track **nào**.

## Chỉ báo
Nút **M** của `Mic`, `Không Dây`, `Beat` (và `Group Mic` trong Mixer). Mỗi ảnh: toàn màn hình, thấy cả danh sách track lẫn Mixer.

## Thực hiện
0. Bấm chuột chọn track **`Không Dây`**. Đảm bảo nút M của **cả `Mic` lẫn `Không Dây` đang tắt**. 📷 *Ảnh 0.*
1. Chạy `DIAG_A2_MIC_MUTE` bằng **Action**, **1 lần**. 📷 **Ảnh 1.**
2. Chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 2.**
3. Bấm chuột chọn lại **`Không Dây`**. Chạy `DIAG_A1_MIC_UNMUTE` (Action), **1 lần.** 📷 **Ảnh 3.**
4. Chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 4.**
(Giữa các lần chạy chỉ làm đúng các thao tác trên, không chạm M bằng chuột.)

## PASS / FAIL
**PASS** (kết hợp hoạt động đúng):
- Ảnh 1: M của **`Mic` bật**; `Không Dây`, `Beat` **không đổi**. Ảnh 2: `Mic` **vẫn bật**.
- Ảnh 3: M của **`Mic` tắt**; `Không Dây`, `Beat` không đổi. Ảnh 4: `Mic` **vẫn tắt**.

**FAIL — ghi đúng điều ảnh cho thấy (mỗi kiểu chỉ ra một nguyên nhân khác nhau):**
| Ảnh 1 cho thấy | Ý nghĩa (chưa kết luận cho tới khi có ảnh) |
|---|---|
| M của **`Không Dây`** bật, `Mic` không đổi | `Mute` tác động lên track **chọn trước đó**, không phải track `Find Track` vừa tìm |
| **không** M nào đổi | `Mute` không chạy sau `Find Track`, hoặc `Find Track` không tìm được tên `Mic` |
| M của **`Group Mic`** (Mixer) hoặc track khác bật | `Find Track` khớp tên theo cách khác (ví dụ chứa chữ "Mic") |
| `Mic` bật nhưng lần 2 **đảo tắt**, hoặc chiều 0 sai | `State` trong macro kết hợp không đặt đích như khi chạy riêng |
**KHÔNG RÕ:** ảnh không thấy rõ M → gửi ảnh, không thử thêm.

## Gửi lại
5 ảnh (0–4). Không cần gì khác.
