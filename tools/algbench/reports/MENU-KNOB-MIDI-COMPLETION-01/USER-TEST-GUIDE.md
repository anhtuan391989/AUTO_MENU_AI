# HƯỚNG DẪN — 6 KNOB (MIDI Output + Fender Studio Pro 8)
Chỉ làm trên **bản sao project** (vd `LIVE_TEST_CC.song`). **Không** mở/lưu đè `save new 2.1.song` hay project gốc.
Task này **không** sửa Monitor, FX, LIVE ON/OFF, Send/gain/routing.

## 0. Chép file vào `G:\AUTO_MENU_AI`
- `changes/ui/js/actionRegistry.js` → `ui\js\actionRegistry.js` (đè)
- `changes/ui/js/setup.js` → `ui\js\setup.js` (đè)
- `changes/tests/unit/KnobMidiCompletion01.verify.js`, `KnobDynamicValue.verify.js` → `tests\unit\`
- **Không** đụng `renderer.js` (nên không xung đột với bản FX Auto). Tắt hẳn Menu, mở lại.

## 1. Hai Knob nội bộ (Clap / Laugh) — không cần MIDI
Xoay **CLAP** và **LAUGH** (hai Knob khác nhau), bấm phát từng âm: âm lượng đổi **trong chính Menu**, hai Knob độc lập, tắt/mở lại Menu giá trị vẫn nhớ. Không cần cấu hình Setup hay Studio Pro.

## 2. Cổng MIDI
- Setup → MIDI → cổng Output = **AUTO MENU AI** (loopMIDI). Ghi lại tên: `________`.
- Studio Pro → External Devices → **New Control Surface**: **Receive From** = đúng tên cổng trên, **Send To = None**. (Dùng lại thiết bị đã tạo cho LIVE; không tạo trùng.)

## 3. Lưu mapping 4 Knob trong Setup
Setup → MIDI Output Mapping, 4 dòng riêng (kiểu **CC**, bấm 💾 Lưu từng dòng). **Không có CC mặc định** — bạn chọn số chưa dùng. Gợi ý (kênh 15, tránh kênh 16 của LIVE; ô "Value" không quan trọng vì Knob tự gửi theo vị trí):

| Dòng trong Setup | Knob | Gợi ý CC | Kênh | Đích trong Studio Pro |
|---|---|---|---|---|
| BEAT INPUT VOLUME | musicKnob | 20 | 15 | Fader track **Beat** |
| MASTER OUTPUT VOLUME | masterKnob | 21 | 15 | Fader **Main** |
| RETUNE SPEED MIC1 | retune1 | 22 | 15 | Retune Speed (Mic) — xem mục 5 |
| RETUNE SPEED MIC2 | retune2 | 23 | 15 | Retune Speed (Không Dây) — xem mục 5 |

Setup sẽ **chặn lưu** nếu CC+kênh trùng với một mapping khác (đặc biệt 8 nút LIVE CC102–109 kênh 16). Thấy cảnh báo → đổi số/kênh khác. Mapping riêng theo DAW đang chọn; đổi DAW không làm mất mapping DAW khác.
**Giá trị Menu gửi:** Knob 0 / 25 / 50 / 75 / 100 → CC **0 / 32 / 64 / 95 / 127**. Menu **không tự gửi gì lúc mở app**; chỉ gửi khi bạn xoay Knob. Xoay liên tục tại biên (0 hoặc 100) không gửi lặp.

## 4. Học Knob → fader trong Studio Pro (MIDI Learn)
Theo tài liệu Fender "Set Up Your MIDI Devices" (chưa kiểm trên FSP8 cụ thể): Console/External Devices → nhấp đúp thiết bị Control Surface → bật **MIDI Learn**.
1. Chọn mục tiêu (vd fader **Beat**) rồi xoay Knob **BEAT** trong Menu vài nấc → Studio Pro học CC. Làm tương tự **Main** ↔ Knob **MASTER**.
2. Tắt MIDI Learn. Kiểm tra: xoay Knob lên 0 / 50 / 100 → fader Beat (rồi Main) đi **thấp / giữa / cao**. Ghi: `Knob 0→fader ___ | 50→___ | 100→___`.
3. Nếu fader không nhúc nhích → xem mục 6.
Chỉ thử trên bản sao; fader cuối cùng đặt lại như ban đầu (hoặc đóng project **không lưu**).

## 5. RETUNE 1 / RETUNE 2 — chưa đủ căn cứ (BLOCKED, không đoán)
Repo chỉ ghi "Retune Speed của Auto-Tune (Mic 1/2)". Bản audit project cho thấy track `Mic` và `Không Dây` đều có nhiều plugin Auto-Tune/AutoTune Advanced; **chưa xác định** plugin nào và tham số Retune Speed có cho Control Surface học được hay không. Menu đã gửi CC đúng; chỉ còn phần đích DAW. Phép thử cho Khói (không bắt buộc ngay): mở plugin Auto-Tune đang dùng trên track Mic (bản sao project) → thử gán **Retune Speed** bằng MIDI Learn (nếu plugin cho phép) và xoay Knob RETUNE 1. Báo lại: gán được hay không, plugin nào, tên tham số. Chưa có kết quả thì Retune 1/2 giữ trạng thái BLOCKED.

## 6. Khi không chạy — xác định lỗi ở đâu
| Hiện tượng | Nguyên nhân thường gặp | Cách xác định |
|---|---|---|
| Knob xoay trên Menu nhưng Studio Pro không học được CC khi MIDI Learn | Menu không gửi, hoặc cổng sai | Setup: dòng Knob phải "Đã lưu" (không phải NOT_CONFIGURED). Receive From của Control Surface phải đúng tên cổng ở mục 2. loopMIDI đang chạy |
| Học được CC nhưng fader không đổi | Tham số không nhận CC / chưa Learn đúng mục tiêu | Học lại đúng fader; thử Knob khác để loại trừ |
| Fader đổi nhưng lệch | Thang: Knob 50 phải là CC 64 (≈giữa) | So sánh theo bảng mục 3 |
| Xoay Knob lại kích hoạt macro LIVE | Trùng CC với nút LIVE | Setup đã chặn; nếu cấu hình cũ trùng, đổi số Knob |
| Setup báo "không lưu: đã dùng cho …" | Xung đột CC/kênh | Chọn số/kênh khác |
Nhớ: Menu **không đọc được** trạng thái Studio Pro; xoay thành công trên Menu ≠ DAW đã đổi.

## 7. Khôi phục nếu thử làm đổi thông số ngoài ý muốn
Đóng project bản sao **không lưu**, hoặc Ctrl+Z trong Studio Pro, hoặc mở lại `LIVE_TEST` gốc từ bản copy. Trong Menu: đặt Knob về mặc định bằng double-click (Beat/Master 90, Retune 20, Clap/Laugh 40). Xoá mapping Knob sai: ở Setup đặt lại số rồi 💾 Lưu.

## Báo lại cho tôi
Bảng ở mục 4 (Beat, Main), kết quả mục 1 (Clap/Laugh), và (nếu thử) mục 5.
