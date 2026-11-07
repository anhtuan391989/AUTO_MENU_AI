# FSP8-MACRO-DIAG-01 — Hướng dẫn tìm lý do macro không tác động (không cần code)

> Mục tiêu: **chỉ** tìm xem macro hỏng ở đâu. Chưa dùng MIDI/Menu. Mỗi bước kiểm **một** việc; gặp FAIL thì **dừng nhánh đó và gửi đúng thứ được yêu cầu**, đừng thử thêm lệnh khác.
> Làm trên **bản sao** project (`LIVE_TEST.song`). Không lưu đè project gốc. Không đổi Send/gain/routing/plugin.
> Tên menu có thể khác chút giữa các bản — nếu không thấy đúng tên, chụp màn hình menu rồi gửi.

## 0. Chuẩn bị
1. Chép các file trong ZIP vào `G:\AUTO_MENU_AI` (giữ nguyên thư mục), auto-sync như mọi khi.
2. Chép 5 file trong `tools\algbench\reports\FSP8-MACRO-DIAG-01\macros\` (tên `DIAG_*.studioonemacro`) vào **cùng thư mục macro** với 8 macro `LIVE_*` (xem D1). **Không** xoá/ghi đè macro nào có sẵn.
3. Tắt hẳn Studio One/Fender Studio Pro 8 rồi mở lại, mở bản sao `LIVE_TEST.song`.

## D1 — Macro có được nạp không? Chạy bằng cách nào?
1. Mở **Macro Organizer** (menu Studio Pro → Macro Organizer). Tìm nhóm **LIVE_TEST** và **DIAG_TEST**. 📷 **Chụp danh sách.**
2. Bấm nút dưới cùng **Show Macros Folder in Explorer**. 📷 **Chụp cửa sổ Explorer** (thấy đường dẫn trên thanh địa chỉ + danh sách file; thấy cả `LIVE_*` và `DIAG_*`).
3. Chọn `LIVE_MUSIC_ON` → **Edit**. 📷 **Chụp cửa sổ sửa.**
   - **PASS:** thấy 2 lệnh: `Find Track` có ô tên = `Beat`, và `Monitor` có ô `State` = `1`.
   - **FAIL:** lệnh hiện không có ô đối số, hoặc báo lệnh không hợp lệ, hoặc trống → **DỪNG**, gửi ảnh bước 1–3.
4. **Cách chạy macro** (quan trọng): theo tài liệu hãng, Macro Organizer chỉ để **tạo/sửa**; macro được **chạy** bằng nút **Action** (nhóm Edit) trên **Macro Toolbar** — bấm vào tên macro trong danh sách thì macro chạy — hoặc bằng nút/phím/MIDI đã gán. Hãy chạy bằng nút **Action**. Nếu chưa thấy Macro Toolbar: 📷 chụp menu **View** (Xem) rồi gửi.
5. 📝 Trả lời: **lần thử M1–M5 trước đây, bạn chạy macro bằng cách nào?** (nút Action / gán phím / chạy từ Macro Organizer / cách khác).

## D2 — Một lệnh đơn lẻ có tác động không? (Mute là lệnh có nhiều bằng chứng nhất)
Dùng track **Mic**. Nhìn nút **Mute (M)** trên track Mic.
1. 📷 Chụp trạng thái **trước** (Mic đang Mute hay không — file lúc lưu ghi Mic bị Mute, nhưng bây giờ có thể khác).
2. Chạy **DIAG_A2_MIC_MUTE** (Find Track `Mic` + Mute State 1). 📷 Chụp **sau**.
3. Chạy **DIAG_A1_MIC_UNMUTE** (Find Track `Mic` + Mute State 0). 📷 Chụp **sau**.
- **PASS:** sau A2 nút Mute của Mic **sáng (đang mute)**; sau A1 **tắt (hết mute)**. → Macro nạp được, chạy được, `Find Track` chọn đúng, Mute 1 = mute / 0 = bỏ mute. Sang D3.
- **FAIL (cả hai không đổi):** **DỪNG.** Chạy thêm **DIAG_B2_FINDTRACK_BEAT** (chỉ Find Track `Beat`): track Beat có được **chọn/tô sáng** không? 📷 Gửi ảnh trước/sau của A1, A2 và B2, kèm câu trả lời D1.5.
- **Chỉ một trong hai đổi:** ghi lại cái nào đổi, 📷 gửi ảnh.

## D3 — Monitor (chỉ làm khi D2 PASS)
Nhìn nút **Monitor** (biểu tượng loa) trên track. Nếu track không hiện nút Monitor: 📷 chụp header track rồi dừng.
1. **Find Track:** chạy **DIAG_B2_FINDTRACK_BEAT**. **PASS:** track `Beat` được chọn (các track khác không).
2. **Monitor đơn lẻ:** bấm chọn track `Beat` bằng chuột, chạy **DIAG_B1_MONITOR_SELECTED** (chỉ lệnh Monitor, State rỗng) **2 lần**. 📷 Chụp trước, sau lần 1, sau lần 2. **PASS:** nút Monitor của Beat **đổi mỗi lần** (State rỗng = đảo). Nếu **không đổi** → **DỪNG**, gửi ảnh (lệnh `Monitor` không tác dụng trên máy này — cần sửa cách làm, không phải MIDI).
3. **State 0/1** (chỉ khi bước 2 PASS): chạy `LIVE_MUSIC_OFF` **2 lần liên tiếp**, 📷 chụp; rồi `LIVE_MUSIC_ON` **2 lần liên tiếp**, 📷 chụp.
   - **PASS:** sau OFF×2 Monitor Beat **tắt**, sau ON×2 **bật** (lần 2 không đảo lại).
   - Nếu State 1 lại làm **tắt** (ngược): ghi lại, **đừng tự sửa**, gửi ảnh.
   - Nếu mỗi lần chạy vẫn **đảo** (State bị bỏ qua): ghi lại, gửi ảnh.
4. Chỉ khi bước 3 PASS mới thử `LIVE_MIC1_*` (track Mic) rồi `LIVE_MIC2_*` (track Không Dây), cùng cách.

## D4 — Mute bus (chỉ khi D2 PASS; từng bus một, KHÔNG chạy FX tổng)
4 bus đang **ẩn** trong Mixer (file ghi `visible="0"`), nên mắt thường có thể không thấy nút Mute — vì vậy dùng cách so file:
1. **Save As** `D4-truoc.song`.
2. Chạy **DIAG_C1_FINDCHANNEL_DELAY** (chỉ tìm kênh `Delay`, không Mute). 📷 Chụp Mixer/Console: có kênh nào được chọn/hiện ra không? (Ghi cả "không thấy gì".)
3. Chạy `LIVE_X_BUS_DELAY_MUTE1` (Find Channel `Delay` + Mute 1). **Save As** `D4-sau-Delay.song`.
4. Nếu bước 3 PASS (bên dưới), lặp với `LIVE_X_BUS_VERBNGAN_MUTE1` → `D4-sau-VerbNgan.song`.
5. Gửi 3 file `.song` này; Claude đọc cờ Mute của kênh trong file (không cần bạn nhìn mixer).
- **PASS:** trong `D4-sau-Delay.song` chỉ **Delay** đổi Mute 0→1; các kênh khác (kể cả Verb ngắn) **không đổi**.
- **FAIL:** không kênh nào đổi → nghĩa là `Find Channel` **không tìm được bus ẩn** *hoặc* lệnh Mute không tác dụng lên bus — **chưa phân biệt được**; bước tiếp theo (Claude sẽ hướng dẫn) là hiện tạm bus trong Mixer của **bản sao** rồi thử lại.
- Nếu D4 đạt thì báo Claude để làm tiếp `Verb dài`/`Com Verb` từng bus; vẫn chưa dùng macro FX tổng.

## Gửi lại cho Claude (đúng những thứ này, không cần gì khác)
1. Ảnh D1.1, D1.2, D1.3 và **câu trả lời D1.5** (cách chạy macro).
2. Ảnh D2: trước / sau A2 / sau A1 (và B2 nếu A1/A2 FAIL).
3. Nếu làm tới D3: ảnh theo từng bước + ghi "State 1 = bật hay tắt", "State rỗng có đảo không".
4. Nếu làm tới D4: 3 file `.song` + ảnh C1.
5. **Nếu bạn tự tạo macro bằng giao diện** (D1.3 fail hoặc lệnh lạ): gửi **file `.studioonemacro` mà chính Studio One lưu** (Show Macros Folder → file đó) — đây là bằng chứng cú pháp chính xác nhất.
