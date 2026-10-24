# FSP8-FINDCHANNEL-VERIFY-01 — Thử `Find Channel "Delay"` + `Mute State 1/0` trên bus Delay (~6 phút)

> Chỉ thử **Mute của bus `Delay`**. Không đổi Send, gain, routing, plugin, Monitor; không chạm M/Send của bus khác. Làm trên **bản sao** `LIVE_TEST.song`, không lưu đè project gốc. Không MIDI/CC. Không làm lại các test trước.

## Chuẩn bị
1. Chép `DIAG_DELAY_UNMUTE0.studioonemacro` (thư mục `...\FSP8-FINDCHANNEL-VERIFY-01\macros\`) vào `C:\Users\Khoi\Documents\Studio One\Macros`. Bấm **Refresh** trong Macro Organizer. **Không thấy macro → dừng, 📷 chụp, không chạy tiếp.**
2. Mở **Mixer**. Xác định nút **M** của các kênh: `Delay`, `Verb ngắn`, `Verb dài`, `Com Verb`, `Group Mic`. Nếu không thấy các bus này trong Mixer → 📷 chụp và dừng.
3. Đưa M của `Delay` về **tắt** (bấm tay nếu cần). Không chạm kênh khác.
4. 📷 **Ảnh 0** (toàn màn hình, thấy hết các nút M ở trên).

## A. State 1 — Mute bus Delay (macro đã có `LIVE_X_BUS_DELAY_MUTE1`)
1. Bấm chuột chọn bus **`Verb ngắn`** (không để `Delay` đang được chọn).
2. Chạy `LIVE_X_BUS_DELAY_MUTE1` bằng **Action**, **1 lần**. 📷 **Ảnh 1.**
3. Chọn lại `Verb ngắn`, chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 2.**

## B. State 0 — Bỏ Mute bus Delay (macro mới `DIAG_DELAY_UNMUTE0`)
1. Chọn lại `Verb ngắn`. Chạy `DIAG_DELAY_UNMUTE0` (Action), **1 lần.** 📷 **Ảnh 3.**
2. Chọn lại `Verb ngắn`, chạy **chính macro đó thêm 1 lần.** 📷 **Ảnh 4.**
(Giữa các lần chạy chỉ bấm chọn `Verb ngắn`; **không** bấm nút M của `Delay`.)

## PASS / FAIL (chỉ dựa vào nút M trong Mixer)
**PASS:** Ảnh 1: M `Delay` **bật**. Ảnh 2: **vẫn bật**. Ảnh 3: **tắt**. Ảnh 4: **vẫn tắt**. `Verb ngắn`, `Verb dài`, `Com Verb`, `Group Mic` **không đổi** ở mọi ảnh.
**FAIL / PARTIAL — ghi đúng điều ảnh cho thấy:**
| Ảnh cho thấy | Ghi nhận |
|---|---|
| M của `Delay` không đổi | Mute không tác động `Delay` |
| M của **`Verb ngắn`** (kênh đang chọn) đổi thay vì `Delay` | Mute tác động kênh chọn trước đó |
| `Delay` đổi đúng **và** bus/kênh khác đổi | ghi rõ kênh nào |
| Chạy lặp cùng State mà M đảo | State không giữ được khi lặp |
**KHÔNG RÕ:** không thấy rõ M → gửi ảnh, không thử lệnh khác.

## Gửi lại
5 ảnh (0–4), toàn màn hình, thấy Mixer.
