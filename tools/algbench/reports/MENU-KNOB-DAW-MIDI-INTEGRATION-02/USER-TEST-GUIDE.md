# HƯỚNG DẪN — 4 Knob MIDI (MUSIC / MASTER / RETUNE 1 / RETUNE 2) theo DAW đang chọn

Tất cả phần gán trong DAW dưới đây là **UNVERIFIED** (chưa chạy thật, và mình không đọc được tài liệu Fender/Steinberg từ môi trường này). Làm theo từng bước, ghi lại chỗ nào khác với mô tả.

## 0. Chép file và chọn DAW
1. Chép `ui/js/setup.js`, `ui/setup.html`, `tests/unit/KnobDawIntegration02.verify.js` vào `G:\AUTO_MENU_AI`. Xoá `tests\unit\MenuFix01.verify.js` (bản test cũ của MENU-FIX-01, đã hỏng từ lâu).
2. Mở Menu → Setup → **Chọn DAW**: có thêm Studio One 5, Cubase 10, Cubase 11. Chọn đúng DAW đang dùng (Studio Pro 8…).
3. Setup → MIDI Output Mapping → bấm **"Điền + lưu bộ KNOB gợi ý — …"** → xác nhận. Bấm chỉ LƯU mapping, **không gửi MIDI**.

| DAW chọn trong Setup | Bộ KNOB sẽ điền (kênh 15) |
|---|---|
| Studio One 5 / 6 / 7, Studio Pro 8 | MUSIC CC20 · MASTER CC21 · RETUNE 1 CC22 · RETUNE 2 CC23 |
| Cubase 10 / 11 / 12 / 13 / 14 / 15 | MUSIC CC85 · MASTER CC86 · RETUNE 1 CC87 · RETUNE 2 CC88 |

## 1. Studio Pro 8 (làm trước)
Đã có Control Surface "AUTO MENU AI" (Receive From = cổng loopMIDI của Menu) từ phần LIVE; dùng lại thiết bị đó.
**MUSIC → fader track `Beat`, MASTER → fader `Main`:**
1. Mở Mixer. Bấm nút **Control Link** (theo Fender: *Control Linking*, https://fenderstudiopromanual.fender.com/en/Content/Control_Link_Topics/Control_Linking.htm).
2. Trên Menu xoay Knob **MUSIC** một chút (Menu gửi CC20 kênh 15 → Studio Pro "nhìn thấy" điều khiển).
3. Bấm/chọn fader của track **Beat** để gán. Lặp lại: Knob **MASTER** → fader **Main**.
4. Thử: xoay MUSIC chỉ làm fader Beat đổi; xoay MASTER chỉ làm fader Main đổi.
Ghi chú: giá trị CC 0–127 không đảm bảo 64 = 0 dB — fader Studio Pro dùng thang không tuyến tính, hãy nhìn số dB thực.

**RETUNE 1 / 2: `BLOCKED_RETUNE_TARGET`** — xem REPORT.md mục 5. Chưa gán cho tới khi mở khoá theo mục 5.

## 2. Studio One 5 / 6 / 7
Cùng cách như Studio Pro 8 (Control Link). Bản 5 chưa có bằng chứng riêng: ghi lại nếu khác.

## 3. Cubase 12 – 15 (MIDI Remote)
1. Studio → MIDI Remote → thêm thiết bị Generic/Manual; nhập từ cổng loopMIDI của Menu.
2. Tạo 2 knob, học CC85 kênh 15 và CC86 kênh 15 (MIDI Learn).
3. Gán knob 1 → Volume của track `Beat`, knob 2 → Volume của `MixConsole Main` (qua Mapping Assistant / Mapping Editor, tham khảo https://www.steinberg.help/cubase_pro/v15/en/cubase_nuendo/topics/midi_remote/midi_remote_c.html).
4. Đừng dùng lại cấu hình giữa 12/13/14/15 khi chưa kiểm tra; mỗi phiên bản làm riêng.

## 4. Cubase 10 – 11 (Generic Remote)
1. Studio → Studio Setup → Remote Devices → **Generic Remote**: Input = cổng loopMIDI của Menu.
2. Thêm 2 điều khiển: Control Change, **kênh 15**, địa chỉ 85 và 86.
3. Device = **VST Mixer**; Channel = kênh mixer của `Beat` (điều khiển 1) và `Main` (điều khiển 2); Value = Volume.
- RỦI RO: Generic Remote chọn kênh theo **vị trí** trong mixer (VERIFIED_FILE trong PDL-PRESET-VERIFY-04). Nếu đổi thứ tự track thì sẽ điều khiển nhầm. Kiểm tra sau mỗi lần sắp xếp lại.

## 5. Báo lại
Cho mình biết với từng DAW: các bước trên có khớp không, Knob nào di chuyển đúng fader nào. Với Retune: làm mục "điều kiện mở khoá" trong REPORT.md.
