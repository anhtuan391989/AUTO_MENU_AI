# HƯỚNG DẪN TEST — DAW-SPECIFIC-MIDI-QUICK-FILL-01

Vào **Setup → MIDI Output Mapping**. Cuối phần mô tả có dòng "Bộ gợi ý: …" và hai nút điền nhanh.

## Điều cần hiểu trước
- Bấm nút điền chỉ **LƯU mapping trong Menu** (Menu MIDI Output). **Không gửi MIDI**, **không điều khiển DAW**.
- Lưu mapping ≠ DAW được điều khiển. DAW vẫn phải được gán CC (bên dưới).
- Mỗi DAW có mapping riêng. Điền cho Studio One không đụng Cubase và ngược lại.
- Retune: nút KNOB chỉ điền CC22/CC23 của Menu; **không có nghĩa** tham số plugin Retune đã được gán.

## Test 1 — Chưa chọn DAW
Xoá/chưa chọn DAW → hai nút điền xám (không bấm được), có dòng "Cần chọn DAW trước…".

## Test 2 — Studio One / Fender Studio Pro (7, 6, Studio Pro 8)
1. Chọn DAW Studio One 7 (hoặc Studio Pro 8). Nút hiện: "Điền + lưu bộ LIVE gợi ý — Studio One / Fender Studio Pro" và "…KNOB…".
2. Bấm LIVE → xác nhận → 8 dòng MUSIC/MIC1/MIC2/FX ON/OFF = CC 102–109, kênh 16, giá trị 127.
3. Bấm KNOB → xác nhận → BEAT INPUT VOLUME CC20, MASTER OUTPUT VOLUME CC21, RETUNE MIC1 CC22, RETUNE MIC2 CC23, kênh 15.
4. Trong Studio One/Fender: External Devices → New Control Surface (Receive From = AUTO MENU AI) → MIDI Learn → gán từng CC vào macro / fader. (Chưa kiểm chứng trên FSP8 8 — ghi UNVERIFIED.)

## Test 3 — Cubase
1. Chọn Cubase 13. Nút hiện theo "Cubase"; dòng ghi "Quy ước CC gợi ý của AUTO_MENU_AI — không phải mặc định Cubase".
2. LIVE → CC 110–117 kênh 16 giá trị 127. KNOB → CC 85–88 kênh 15.
3. Trong Cubase phải tự gán: MIDI Remote (Mapping Assistant / Mapping Editor) hoặc Generic Remote. Cubase **không tự nhận** các CC này.
4. Cubase 12/14/15: nút vẫn có nhưng gắn nhãn UNVERIFIED (chưa có bằng chứng chạy thật).

## Test 4 — Đổi DAW
Điền Studio One → đổi sang Cubase (chưa có gì được ghi) → điền Cubase → quay lại Studio One: mapping hai bên còn nguyên.

## Test 5 — Không ghi đè âm thầm
Sửa tay 1 dòng (vd MUSIC ON = CC55) rồi bấm LIVE: hộp xác nhận ghi "Sẽ GHI ĐÈ 1 mapping đã lưu: MUSIC_ON". Bấm Huỷ → không đổi.

## Test 6 — Xung đột
Cho Knob BEAT dùng CC102 kênh 16, rồi bấm LIVE → báo "CC/Note đã dùng cho action khác — MUSIC_ON ↔ BEAT_INPUT_VOLUME", không lưu gì.

## Test 7 — DAW khác (Ableton, FL Studio, REAPER…)
Hiện "Chưa có bộ CC gợi ý cho DAW này — hãy cấu hình mapping thủ công." và không có nút điền.

Nếu có gì sai: chụp màn hình dòng "Bộ gợi ý" + bảng mapping gửi lại.
