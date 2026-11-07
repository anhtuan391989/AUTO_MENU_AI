# MIDI-RECOVERY-01 — Hướng dẫn thử lại trên Windows (không cần biết lập trình)

> Đây là phần **chỉ máy của Khói làm được**. Mọi test tự động trong report mới chỉ chạy với MIDI **giả** — chưa chứng minh gì cho Windows/loopMIDI/Studio One thật.
> Quy tắc an toàn: **không** sửa Registry, **không** cài lại Windows, **không** đổi tên cổng `AUTO MENU AI`. Chỉ bấm các nút bên dưới và chụp/gửi lại kết quả.
> Các lệnh test chỉ gửi **1 Note / 1 CC có chủ đích** (bạn bấm mới gửi), không gửi hàng loạt.

## 0. Chuẩn bị (1 lần)
1. Chép các file trong ZIP vào `G:\AUTO_MENU_AI` (giữ nguyên đường dẫn thư mục), chạy auto-sync như mọi khi.
2. Bật **loopMIDI** trước, đảm bảo có cổng tên đúng `AUTO MENU AI` (đang hiện trong cửa sổ loopMIDI).
3. **Tắt hẳn** Auto Menu AI rồi mở lại (để main process nạp code mới). Mở **Setup → MIDI**.
4. Chưa cần mở Studio One cho bước 1–4. Nếu Studio One đang mở sẵn thì cứ để, ghi lại là "có mở".

## 1. Xem từng backend đang thấy cổng nào
1. Trong Setup → MIDI bấm **Refresh**. Đọc dòng `Status: ...` — giờ có dạng:
   `[IN: det=✓(main ✓/web ✓) conn=✕ · OUT: det=✓(main ✓/web ✕) conn=✓]`
   - `main` = backend **gửi/nhận thật** (easymidi). `web` = Web MIDI của Chromium.
   - `det` = có thấy cổng; `conn` = backend **đã mở thật** cổng đó.
2. Danh sách cổng của dropdown giờ lấy từ backend thật → **phải thấy `AUTO MENU AI`** trong danh sách Output.
3. (Tuỳ chọn, để gửi lại cho Claude) mở DevTools của cửa sổ Setup, dán và Enter:
   ```js
   JSON.stringify((await window.MidiHealth.getMidiHealth())._detail.mainPorts)
   JSON.stringify((await window.MidiHealth.getMidiHealth())._detail.rendererPorts)
   ```
   Chụp 2 dòng kết quả.

## 2. Auto Connect — kết quả phải đúng từng phía
1. Bấm **⚡ Auto Connect** **đúng 1 lần**. Đợi 2 giây.
2. Đọc **1 dòng** mới trong Monitor. Ý nghĩa:

| Dòng báo | Nghĩa thật |
|---|---|
| `✅ CONNECTED … OUT ✅ mở · IN ✅ mở` | Cả Output và Input đã mở thật |
| `⚠ OUTPUT_READY (một phía) … IN ❌ KHÔNG mở (Internal RtMidi error · bước open)` | Gửi được, **nhận chưa được**. Lỗi gốc hiện nguyên văn, kèm bước lỗi |
| `⚠ INPUT_READY …` | Nhận được, **gửi chưa được** |
| `❌ ERROR / DISCONNECTED …` | Không phía nào dùng được |

3. Bấm Auto Connect **nhiều lần liên tiếp** (cố tình bấm dồn): chỉ được ra **ít dòng** (các lần dồn sẽ ghi `[gộp…]`), không còn 11 dòng/2 giây. Nếu vẫn ra rất nhiều dòng giống nhau → chụp màn hình Monitor gửi lại (đây là dữ kiện mới để tìm nguyên nhân).
4. Chụp dòng `Status:` và dòng Monitor.

## 3. Verify loopback — chạy 5 lần liên tiếp
1. Bấm **Verify** 5 lần, mỗi lần cách nhau ~2 giây, **không đổi cấu hình nào**.
2. Ghi lại 5 kết quả. **Kỳ vọng:** 5 lần cùng một loại. Nếu có lần `VERIFIED` rồi lần `NOT_CONNECTED` → ghi lại thứ tự; dòng `Verification:` giờ nói rõ `Output: mở/ĐÓNG (lỗi) · Input: mở/ĐÓNG (lỗi)`.
3. Lưu ý: `VERIFIED` chỉ chứng minh **Output → Input của loopMIDI** thông trong chính app. **Chưa** chứng minh Studio One nhận được.

## 4. Test Note và CC — xem sender nào được dùng
1. Chọn cổng `AUTO MENU AI` ở dropdown. Bấm **Test Note** (Note 60) **1 lần**, rồi **Test CC** **1 lần**.
2. Dòng Monitor giờ ghi rõ: `[sender: main-midi-driver (easymidi)] [port: AUTO MENU AI]`.
   - `✅ SUCCESS (API send OK, chưa xác nhận DAW nhận)` = lệnh đã đưa vào cổng thành công ở tầng driver, **chưa** có nghĩa DAW nhận.
   - `❌ FAILURE … OUTPUT_NOT_OPEN: <lỗi gốc>` = lỗi ở **tầng mở Output của main process** (không còn là lỗi Web MIDI).
   - `❌ FAILURE … SEND_FAILED` = đã mở nhưng lệnh gửi bị từ chối.
3. Chụp dòng log.

## 5. Studio One 8 — lệnh đã tới DAW chưa?
(Tên menu có thể khác chút giữa bản; đây là hướng dẫn chung.)
1. Mở Studio One 8. Tạo 1 **Instrument track**, đặt **Input = `AUTO MENU AI`**, bật **Monitor** (nút loa/⏵).
2. Quay lại Auto Menu AI bấm **Test Note** 1 lần. Thanh MIDI-in của track phải nhấp nháy.
3. Ghi lại: **Có/Không** thấy tín hiệu. Phân biệt:
   - Verify `VERIFIED` + Studio One **không** nhấp nháy → loopback app ổn, vấn đề nằm ở phía Studio One (cổng nhận chưa chọn, hoặc Studio One đang giữ riêng cổng).
   - Verify không ổn + Studio One nhấp nháy → đường gửi ổn, đường nhận về app có vấn đề.
4. Xong thì xoá track thử (hoặc tắt Monitor).

## 6. Nếu còn lỗi — gửi đúng những thứ này (không cần gì khác)
1. Ảnh/chụp **dòng `Status:`** và **các dòng Monitor** (Auto Connect, Verify, Test Note, Test CC).
2. DevTools Setup, dán rồi chụp kết quả (nó chứa lỗi gốc + **bước** phát sinh lỗi, danh sách cổng thật tại thời điểm lỗi):
   ```js
   JSON.stringify(await window.electronAPI.getMainMidiHealth(), null, 1)
   ```
   (Quan tâm nhất: `lastInputErrorDetail`, `lastOutputErrorDetail`, `connectAttempts`, `autoConnectStats`, `openInputPortName`.)
3. Chạy script chẩn đoán **2 lần** (PowerShell, trong `G:\AUTO_MENU_AI`) — script **không gửi gì**, chỉ mở thử rồi đóng cổng:
   - Lần A: **tắt hẳn Auto Menu AI**, loopMIDI vẫn bật, Studio One tắt:
     `node tools\algbench\reports\MIDI-RECOVERY-01\midi_diag.js > midi_diag_A_app_tat.txt`
   - Lần B: **mở Auto Menu AI** (đã Auto Connect), chạy lại:
     `node tools\algbench\reports\MIDI-RECOVERY-01\midi_diag.js > midi_diag_B_app_mo.txt`
   - (Tuỳ chọn Lần C: Auto Menu AI tắt, **Studio One mở** sẵn.)
   Gửi nội dung các file `.txt`.
4. Ảnh cửa sổ **loopMIDI** (danh sách cổng) và cho biết Studio One 8 đã/chưa chọn `AUTO MENU AI` ở External Devices.
5. Ghi rõ: Studio One lúc đó **đang mở hay tắt**; FSP8 có cắm không.
