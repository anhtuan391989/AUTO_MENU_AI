# FSP8-FX-REMAINING-BUS-VERIFY-01 — Thử riêng 3 bus còn lại: `Verb ngắn`, `Verb dài`, `Com Verb` (~8 phút)

> Làm trên **bản sao** `LIVE_TEST.song`, không lưu đè project gốc. Chỉ theo dõi nút **M** trong **Mixer**. Không đổi Send, gain, routing, plugin, Monitor, FX Auto. Không MIDI/CC. Không chạy macro `LIVE_FX_ON/OFF`. Không thử lại bus `Delay`.
> Mẹo (thấy trong ảnh Delay của bạn): sau khi macro chạy, strip của kênh đích **sáng hơn** — dấu hiệu `Find Channel` đã tìm đúng.

## Chuẩn bị
1. Chép 5 file trong `tools\algbench\reports\FSP8-FX-REMAINING-BUS-VERIFY-01\macros\` (`DIAG_VERBNGAN_UNMUTE0`, `DIAG_VERBDAI_MUTE1`, `DIAG_VERBDAI_UNMUTE0`, `DIAG_COMVERB_MUTE1`, `DIAG_COMVERB_UNMUTE0`) vào `C:\Users\Khoi\Documents\Studio One\Macros`; **Refresh** Macro Organizer. Không thấy macro → dừng, 📷 chụp.
2. Mở Mixer. Đảm bảo M của `Verb ngắn`, `Verb dài`, `Com Verb` (và `Delay`, `Group Mic`) đang **tắt**. 📷 *Ảnh 0* (toàn màn hình, thấy hết các nút M).

## A. Verb ngắn
1. Chọn chuột bus **`Delay`**. Chạy `LIVE_X_BUS_VERBNGAN_MUTE1` (Action) **1 lần**. 📷 **Ảnh A1.**
2. Chọn lại `Delay`. Chạy `DIAG_VERBNGAN_UNMUTE0` **1 lần**. 📷 **Ảnh A2.**
**PASS:** A1: M `Verb ngắn` **bật**; A2: **tắt**; `Delay`, `Verb dài`, `Com Verb`, `Group Mic` không đổi.

## B. Verb dài
1. Chọn `Delay`. Chạy `DIAG_VERBDAI_MUTE1` **1 lần**. 📷 **Ảnh B1.**
2. Chọn lại `Delay`. Chạy `DIAG_VERBDAI_UNMUTE0` **1 lần**. 📷 **Ảnh B2.**
**PASS:** B1: M `Verb dài` **bật**; B2: **tắt**; mọi kênh khác không đổi.

## C. Com Verb
1. Chọn `Delay`. Chạy `DIAG_COMVERB_MUTE1` **1 lần**. 📷 **Ảnh C1.**
2. Chọn lại `Delay`. Chạy `DIAG_COMVERB_UNMUTE0` **1 lần**. 📷 **Ảnh C2.**
**PASS:** C1: M `Com Verb` **bật**; C2: **tắt**; mọi kênh khác không đổi.

(Không cần chạy mỗi State hai lần — State 0/1 đã có bằng chứng lặp trên `Delay`. Giữa các lần chỉ chọn `Delay` rồi chạy macro; không bấm tay nút M.)

## Kết quả
- **PASS:** cả 3 bus đúng 1/0, không kênh nào khác đổi.
- **PARTIAL:** ghi tên bus và chiều nào đúng.
- **FAIL:** bus đích không đổi / kênh khác đổi / nhiều kênh đổi — ghi đúng điều ảnh cho thấy.
- **BLOCKED:** không thấy macro hoặc không thấy rõ M → gửi ảnh, không thử thêm.

## Gửi lại
Ảnh 0, A1, A2, B1, B2, C1, C2 (toàn màn hình, thấy Mixer).
