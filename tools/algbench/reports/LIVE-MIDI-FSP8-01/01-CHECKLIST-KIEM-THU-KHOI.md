# LIVE-MIDI-FSP8-01 — Checklist kiểm thử cho Khói (làm tuần tự)

Quy tắc chung
- Chỉ làm trên **bản sao** project, đặt tên `LIVE_TEST.song` (copy từ file Khói coi là chuẩn — xem Bước 0). **Không lưu đè** project gốc.
- Không cần lập trình. Chỉ nhìn, bấm, chụp ảnh, và **Save As** để Claude so file.
- Mỗi test: PASS chỉ khi **thấy DAW đổi thật** (nút trong Console / nghe tiếng / file lưu khác). "Menu báo đã gửi" **không** tính PASS.
- Nếu bước nào không làm được (không tìm thấy lệnh…), ghi **FAIL kèm ảnh** rồi dừng nhánh đó — không cố gán thử lung tung.
- Đừng thử Cubase/Studio One, preset NORM/LOFI/RAP/REMIX, Key/BPM/MOD trong task này.

Ký hiệu "đối tượng ngoài phạm vi" = mọi thứ khác ngoài mục tiêu: Mute track, fader/gain, routing, Send (On/Off và mức), bypass plugin, Monitor của track khác, Mute của bus khác.

---
## Bước 0 — Chuẩn bị (T0)
- **Mục đích:** biết đúng file chuẩn và môi trường.
- **Làm:**
  1. Cho biết file nào là **chuẩn**: `save new 2.1.song` trong `G:\AUTO_MENU_AI` (hash 76279d62…) hay bản trong `Project FSF8.zip` (hash fbead89c…). Hai file khác nhau: bản gốc repo đang có **7 Send bật**, bản trong zip có **7 Send tắt**.
  2. Copy file chuẩn thành `LIVE_TEST.song`, mở nó trong FSP8.
  3. Help → About: chụp phiên bản FSP8. Task Manager → Details: ghi tên `.exe` của FSP8.
  4. Mở **MIDI Monitor** của FSP8 (cửa sổ `MidiMonitor` đã từng mở trong project).
  5. Xác nhận cổng ảo (vd `loop` / loopMIDI) đang chạy và Menu → Setup → MIDI đang chọn đúng cổng đó.
  6. Chụp Console (hiện đủ 4 bus): Monitor của Beat/Mic/Không Dây, Mute của 4 bus, On/Off của 7 Send Group Mic.
- **Bằng chứng:** ảnh phiên bản, tên `.exe`, ảnh Console, câu trả lời "file nào là chuẩn".
- **PASS:** có đủ các mục trên.

## T1 — Tìm lệnh điều khiển có sẵn trong FSP8
- **Mục đích:** biết FSP8 có lệnh nào để gán MIDI cho Monitor/Mute không (đây là câu hỏi chính).
- **Làm:** Macro Organizer → Edit Macro → ô tìm lệnh, lần lượt gõ `monitor`, `mute`, `input`. Chụp **toàn bộ** danh sách kết quả. Bấm xem lệnh nào có "tham số/đối số" (chọn được track hoặc bus theo tên). Làm tương tự trong Keyboard Shortcuts (gõ `monitor`, `mute`).
- **Trạng thái trước/sau:** không đổi gì (chỉ xem; không lưu macro).
- **Mong đợi:** có lệnh Monitor và Mute nhắm được đúng 1 track/1 bus.
- **PASS:** có lệnh cho Monitor **và** cho Mute bus, chọn được đối tượng theo tên. **FAIL/PARTIAL:** thiếu lệnh nào thì ghi rõ lệnh nào thiếu → chuyển sang T10 (phương án Mackie) cho phần thiếu.

## T2 — Monitor của `Beat` (nút MUSIC)
- **Mục đích:** MIDI từ Menu bật/tắt đúng Monitor của `Beat`.
- **Làm:**
  1. Trước: Save As `T2-truoc.song` (ngay lúc Monitor Beat đang ở trạng thái A, ghi lại A là Bật hay Tắt).
  2. Tạo lệnh/macro theo T1 (Khói tự tạo, chỉ trong bản `LIVE_TEST`), gán cho một Note hoặc CC **do Khói chọn** (ghi lại số), thiết bị External tương ứng.
  3. Trong Menu → Setup → MIDI Output Mapping, hàng **MONITOR BEAT**: nhập đúng Note/CC đó.
  4. Bấm nút **MUSIC** trên Menu 1 lần. Nhìn MIDI Monitor FSP8 và nút Monitor của Beat. Bấm lần 2.
  5. Save As `T2-sau.song`.
- **Mong đợi:** MIDI Monitor thấy message; Monitor Beat đổi A→B rồi B→A. Không có thay đổi nào khác.
- **PASS:** Monitor Beat đổi đúng 2 lần; Claude so `T2-truoc` ↔ `T2-sau` chỉ thấy `monitorActive` của Beat đổi (hoặc giống hệt nếu bấm 2 lần quay về A). **FAIL:** không thấy MIDI, hoặc đổi sai đối tượng, hoặc đổi thêm thứ khác.

## T3 — Monitor của `Mic` (nút MIC 1)
Như T2 nhưng: đối tượng `Mic`, hàng **MONITOR MIC1**, Note/CC **khác** T2. Thêm: kiểm tra **Monitor Beat không đổi**.

## T4 — Monitor của `Không Dây` (nút MIC 2)
Như T2: đối tượng `Không Dây`, hàng **MONITOR MIC2**, Note/CC khác T2/T3. Thêm: bật MIC 2 mà **MIC 1 không đổi**, và ngược lại (độc lập).
- **PASS:** MIC 1 và MIC 2 đổi độc lập; Claude so file không thấy đối tượng ngoài phạm vi đổi.

## T5 — Mute từng bus FX và nút FX tổng
- **Mục đích:** MIDI đặt Mute đúng từng bus, rồi một thao tác điều khiển cả 4 bus.
- **Điều kiện trước (quan trọng):** muốn "FX ON = tắt Mute" thì 7 Send của `Group Mic` phải đang **bật** (như bản gốc repo). Nếu dùng bản trong zip (Send đang tắt), FX sẽ **không nghe thấy gì** dù bus đã bỏ Mute — ghi lại điều này vào kết quả, **đừng tự đổi Send**.
- **Làm:**
  1. Save As `T5-truoc.song`. Ghi Mute hiện tại của 4 bus.
  2. Với **từng bus** (`Delay`, `Verb ngắn`, `Verb dài`, `Com Verb`): tạo lệnh Mute riêng theo T1, gán Note/CC riêng, gửi thử từ MIDI (dùng công cụ gửi test trong Setup → Test & Monitor, hoặc nút MIDI test), quan sát nút Mute của đúng bus. Mute **không** được đụng bus khác.
  3. Sau khi từng bus đạt, tạo **1 macro** làm 4 việc (đặt Mute cả 4 bus) hoặc 1 lệnh/CC cho "tất cả" — theo cách FSP8 cho phép. Gửi 1 message.
  4. Save As `T5-sau.song`.
- **Mong đợi:** 1 message → cả 4 bus đổi cùng lúc, đúng chiều; chiều ON/OFF **đặt đích danh** được hay chỉ **đảo** (toggle) — ghi rõ.
- **PASS:** từng bus đổi riêng đúng; thao tác tổng đổi cả 4; Claude so file chỉ thấy 4 giá trị `mute` đổi. **FAIL:** thiếu bus nào / đổi Send / đổi bus lạ.

## T6 — Không đổi đối tượng ngoài phạm vi
- **Làm:** sau T2–T5, gửi lần lượt tất cả nút theo thứ tự ngẫu nhiên 3 vòng; Save As `T6-sau.song`; gửi file cho Claude.
- **PASS:** so với `T2-truoc`, chỉ các trường mục tiêu thay đổi (Monitor ×3, Mute ×4 bus). Mute track, gain, Send, bypass insert, routing **không đổi**.

## T7 — Âm thanh thực tế và khôi phục
- **Làm:** phát nhạc + nói vào mic: (a) bật/tắt Monitor Beat, Mic, Không Dây — nghe có đúng; (b) FX ON/OFF khi đang nói/hát — ghi nhận đuôi reverb/delay bị **cắt đột ngột** hay tắt tự nhiên (Mute bus có thể cắt đuôi); có tiếng "lụp bụp" không; (c) bấm nhanh bật/tắt 10 lần — trạng thái cuối khớp Menu? (d) đóng/mở lại FSP8 + project — trạng thái ra sao.
- **Ghi:** ghi chú nghe (1–2 dòng mỗi mục).
- **PASS:** âm thanh đúng ý, không lệch trạng thái sau 10 lần bấm nhanh, trạng thái khôi phục được (nêu cách khôi phục).

## T8 — Menu và DAW lệch trạng thái
- **Mục đích:** biết hệ thống hoạt động ra sao khi Menu hiển thị khác DAW (Menu hiện chỉ gửi lệnh, không biết trạng thái thật).
- **Làm:** (a) Khởi động: để Monitor Mic **Bật** trong DAW, mở Menu (nút MIC 1 mặc định hiển thị Tắt) → bấm MIC 1 một lần → DAW thành Bật hay Tắt? (b) Đổi tay trong DAW (bật/tắt Monitor Beat, Mute bus Delay) rồi bấm nút Menu tương ứng → kết quả? (c) Nếu lệnh là **đảo** (toggle) thì Menu và DAW sẽ lệch; nếu có lệnh **đặt đích danh** (ON riêng, OFF riêng, hoặc giá trị 127/0) thì ghi cách làm.
- **Bằng chứng:** ảnh Console trước/sau mỗi trường hợp.
- **PASS (để làm code):** có ít nhất một cách để Menu đưa DAW về **đúng trạng thái mong muốn** (đích danh) hoặc đọc lại được trạng thái thật. Nếu chỉ có toggle không phản hồi → ghi **FAIL một phần**, báo "cần luật đồng bộ lúc khởi động".

## T9 — Lưu cấu hình dùng lại
- **Làm:** (a) Lưu macro/map trong bản `LIVE_TEST`. Đóng hẳn FSP8, mở lại. Mở lại `LIVE_TEST.song` → gửi MIDI → còn hoạt động không? (b) Tạo project **mới trống** → gửi MIDI → có hoạt động không (cho biết cấu hình nằm ở **ứng dụng** hay ở **file project**)? (c) Mở lại bản copy mới từ project chuẩn → có chạy không cần cấu hình lại?
- **PASS:** sau khởi động lại vẫn chạy mà không phải cấu hình lại; ghi rõ cấu hình nằm ở đâu (ứng dụng / project) và có cần "template" riêng hay không.

## T10 — Phương án dự phòng (chỉ làm nếu T1 FAIL/PARTIAL)
- **Làm:** External Devices → New Control Surface → chọn Mackie Control (cổng loopMIDI riêng, **không** dùng cổng đang cho Menu). Mở mixer bank; kiểm tra nút **Mute** của từng kênh (kể cả 4 bus nếu xem được ở chế độ Bus) và vị trí tham số **Monitor** (V-Pot). Chụp màn hình các màn hình bank/chế độ Bus. **Không** để Menu gửi thật trong bước này.
- **PASS:** biết rõ Mackie có điều khiển được Mute bus và Monitor track hay không (thông tin, chưa phải cách triển khai).

---
## Gửi lại cho Claude
Ảnh (T0, T1, T2–T5 nếu có), các file `T2-truoc/sau`, `T5-truoc/sau`, `T6-sau` (.song), câu trả lời T0 mục 1, ghi chú nghe T7/T8, và kết quả PASS/FAIL từng test.
Sau khi có kết quả T1, T2–T5, T8, T9 → Claude cập nhật báo cáo và mới đánh giá `READY_FOR_IMPLEMENTATION`.
