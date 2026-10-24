# FSP8-FX-MASTER-MACRO-VERIFY-01 — Thử macro tổng `LIVE_FX_OFF` / `LIVE_FX_ON` (~6 phút)

> Làm trên **bản sao** `LIVE_TEST.song`, không lưu đè project gốc. Không cài thêm gì (dùng 2 macro đã có trong nhóm LIVE_TEST). Chỉ theo dõi nút **M** trong **Mixer**. Không đổi Send, gain, routing, plugin, Monitor, FX Auto. Không MIDI/CC, không bấm nút FX của Menu.
> Mỗi ảnh: **toàn màn hình, Mixer thấy đủ** `Beat`, `Mic`, `Không Dây`, `Group Mic`, `Delay`, `Verb ngắn`, `Verb dài`, `Com Verb` (và nút M của từng kênh).

## Trạng thái ban đầu
1. Mở bản sao `LIVE_TEST.song`, mở Mixer.
2. Đưa M của **bốn bus** (`Delay`, `Verb ngắn`, `Verb dài`, `Com Verb`) về **tắt**. Ghi lại (không sửa) M của `Beat`, `Mic`, `Không Dây`, `Group Mic` đang bật hay tắt.
3. 📷 **Ảnh 0.**

## Chuỗi thử (Action)
Trước **mỗi** lần chạy: bấm chuột chọn **`Group Mic`** (để bắt đầu từ một kênh *không* thuộc bốn bus; nếu `Mute` rơi nhầm vào kênh đang chọn thì `Group Mic` sẽ bị mute và ảnh sẽ lộ ra).
1. Chọn `Group Mic` → chạy **`LIVE_FX_OFF`** **1 lần**. 📷 **Ảnh 1.**
2. Chọn `Group Mic` → chạy **`LIVE_FX_OFF`** **thêm 1 lần**. 📷 **Ảnh 2.**
3. Chọn `Group Mic` → chạy **`LIVE_FX_ON`** **1 lần**. 📷 **Ảnh 3.**
4. Chọn `Group Mic` → chạy **`LIVE_FX_ON`** **thêm 1 lần**. 📷 **Ảnh 4.**
(Không bấm tay nút M nào trong cả chuỗi.)

## PASS / FAIL (chỉ dựa vào nút M trong Mixer)
| Ảnh | PASS |
|---|---|
| 1 | M của **cả 4 bus** (`Delay`, `Verb ngắn`, `Verb dài`, `Com Verb`) **bật** |
| 2 | **cả 4 vẫn bật** |
| 3 | **cả 4 tắt** |
| 4 | **cả 4 vẫn tắt** |
Và ở **mọi** ảnh: M của `Group Mic`, `Beat`, `Mic`, `Không Dây` **giữ nguyên** như ảnh 0; Send/gain/routing không bị chạm.
- **PARTIAL:** chỉ một số bus đúng — ghi **tên bus nào** đúng/sai và ở chiều nào (OFF hay ON).
- **FAIL:** không bus nào đổi / kênh ngoài mục tiêu đổi (kể cả `Group Mic`) / chạy lặp mà M đảo — ghi đúng điều ảnh cho thấy.
- **BLOCKED:** không thấy macro trong Action hoặc ảnh không thấy rõ M → gửi ảnh, không thử thêm.
- (Quan sát phụ, không phải tiêu chí): sau macro, strip `Com Verb` thường sáng hơn (kênh cuối cùng `Find Channel` chọn).

## Gửi lại
Ảnh 0, 1, 2, 3, 4. Không cần gì khác.
