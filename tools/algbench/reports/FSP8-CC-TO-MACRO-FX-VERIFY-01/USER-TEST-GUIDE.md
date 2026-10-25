# HƯỚNG DẪN TEST FX: Menu → CC → Fender Studio Pro 8 → 4 bus Mute
Task: FSP8-CC-TO-MACRO-FX-VERIFY-01 · Chỉ test **FX**. Không đụng MUSIC / MIC 1 / MIC 2.

**Quy tắc an toàn:** chỉ làm trên bản sao `LIVE_TEST_CC.song` (copy từ `LIVE_TEST.song`). Không mở/lưu bản gốc. Không sửa macro `LIVE_FX_ON/OFF`. Không bấm MUSIC, MIC 1, MIC 2 trong lúc test.

---
## BƯỚC 0 — Chuẩn bị
1. Đóng FSP8. Copy `LIVE_TEST.song` → đổi tên `LIVE_TEST_CC.song`. Mở file **_CC** trong FSP8.
2. Đảm bảo loopMIDI đang chạy và có cổng **AUTO MENU AI** (hoặc tên bạn đang dùng).
3. Trong FSP8, đặt tay cả 4 bus **Delay, Verb ngắn, Verb dài, Com Verb** ở trạng thái **MUTE (tắt)**. Đây là trạng thái "FX OFF". Nút FX trên Menu cũng phải đang **tắt (không sáng)**.

## BƯỚC 1 — Kiểm Menu (điều kiện BẮT BUỘC, nếu sai thì DỪNG)
Mở **Setup → MIDI**:
1. Ghi lại **tên cổng MIDI Output** đang chọn: `____________` (đây là cổng Menu gửi CC ra — Menu chỉ gửi ra đúng cổng này).
2. Mục **MIDI Output Mapping**, tìm 2 dòng:
   - **FX ON (bỏ Mute 4 bus)** → loại **CC**, kênh **16**, số **108**, value **127** → bấm 💾 Lưu.
   - **FX OFF (Mute 4 bus)** → loại **CC**, kênh **16**, số **109**, value **127** → bấm 💾 Lưu.
   (Hai dòng phải ra nhãn "Đã lưu — chỉ gửi lệnh, DAW chưa xác nhận". Không dùng nút "Điền bộ CC gợi ý" vì nó lưu cả MUSIC/MIC.)
3. Kiểm 3 dòng cũ **MONITOR FX**, **FX SEND REVERB**, **FX SEND DELAY**: nên là `NOT_CONFIGURED`. Nếu có dòng đã cấu hình: không xoá, nhưng **trong lúc test phải tắt nhạc (không phát nhạc/YouTube)** để FX Auto không tự gửi lệnh Send.
4. **Nếu FX ON hoặc FX OFF chưa lưu được → DỪNG, báo lại.** (Khi đó nút FX có thể đi đường cũ — KHÔNG bấm.)

## BƯỚC 2 — FSP8 phải nhận đúng cổng
1. FSP8 → Cài đặt/Options → **External Devices** → thiết bị **New Control Surface** (đã có trong ảnh của bạn).
2. **Receive From** phải trùng **đúng tên cổng** ghi ở Bước 1.1 (hiện là AUTO MENU AI nếu bạn dùng cổng đó). Không đổi gì khác. Nếu chưa có thiết bị: tạo thêm 1 Control Surface tạm, Receive From = cổng đó.
3. Chụp ảnh màn hình này (khuyến khích).

## BƯỚC 3 — Học CC cho từng macro (FSP8 tự chứng minh nó nhận được CC)
Theo tài liệu PreSonus/Fender (chưa kiểm trên FSP8 8 + Control Surface): Console → External → nhấp đúp thiết bị → **MIDI Learn**.
1. Bật MIDI Learn.
2. Trên Menu bấm **nút FX một lần** (nút sáng = ON, gửi CC 108). Nếu FSP8 hiện một điều khiển mới được học → **đã chứng minh CC tới FSP8 qua đúng cổng**. (Chưa gán thì chưa có gì xảy ra.)
3. Bấm nút FX lần nữa (nút tắt = OFF, gửi CC 109). FSP8 học điều khiển thứ hai.
4. Với điều khiển ON: chuột phải → **Assign** → tìm macro **LIVE_FX_ON**. Với điều khiển OFF → **LIVE_FX_OFF**.
5. **Nếu FSP8 không học được gì hoặc không cho gán macro: DỪNG, chụp ảnh, báo lại.** Không đoán, không thử cách khác.

## BƯỚC 4 — Test thật bằng nút FX trên Menu
Bắt đầu: 4 bus đang Mute, nút FX tắt. Mỗi bước, nhìn 4 bus **Delay / Verb ngắn / Verb dài / Com Verb** và các track **Group Mic / Beat / Mic / Không Dây** (các track này KHÔNG được đổi gì).

| # | Việc | Kết quả mong đợi | Kết quả thực (Đạt/Không) |
|---|------|------------------|--------------------------|
| 1 | Bấm FX → sáng (ON) | cả 4 bus **bỏ Mute** | |
| 2 | Bấm FX → tắt (OFF) | cả 4 bus **Mute** | |
| 3 | Lặp ON rồi OFF lần nữa | Giống #1, #2, không lệch | |
| 4 | Khi nút FX **đang sáng** (4 bus bỏ Mute): trong FSP8 tự **Mute riêng bus Delay**, rồi bấm FX → tắt | Cả 4 bus Mute (Delay vẫn Mute — OFF là *đặt* Mute, không phải đảo) | |
| 5 | Khi nút FX **đang tắt** (4 bus Mute): trong FSP8 tự **bỏ Mute riêng bus Delay**, rồi bấm FX → sáng | Cả 4 bus bỏ Mute | |
| 6 | Các track Group Mic/Beat/Mic/Không Dây | Không đổi Mute/Monitor/fader | |

Ghi thêm: sau mỗi lần bấm, **rê chuột lên nút FX** xem tooltip (ghi chữ hiện ra). Tooltip đúng sẽ nói "đã GỬI lệnh FX (Mute 4 bus) ON/OFF — DAW chưa xác nhận". Nếu tooltip nói "Send Reverb/Delay" hoặc "toggle cũ" → **DỪNG ngay**, chụp ảnh.

## BƯỚC 5 — Gửi lại cho tôi
- Tên cổng Bước 1.1, ảnh Bước 2, ảnh/kết luận Bước 3, bảng Bước 4 (có ảnh 4 bus nếu được), chữ tooltip.
- Nếu một bước KHÔNG đạt: dừng ở bước đó, không tự sửa Setup/macro.

## Không được làm
Không sửa/xoá macro, không lưu `.song` gốc, không bấm MUSIC/MIC 1/MIC 2, không thử macro khác, không thay đổi Send/gain/routing.
