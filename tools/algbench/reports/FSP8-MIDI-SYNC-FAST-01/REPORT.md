# FSP8-MIDI-SYNC-FAST-01 — Đồng bộ Menu ↔ FSP8, chống nhảy fader

- `main` HEAD = `6cd4ac0f47fc696cc948b9b28347502f1e18a128`, kiểm tra 28/10/2026 08:38 (giờ VN). Đã đọc code hiện tại (`renderer.js`, `actionRegistry.js`, `appSettings.js`, `runtime.js`, `midiDriver.js`, `setup.js`), `FSP8-KNOB-DIAG-03`, `FSP8-KNOB-MACRO-01/02`, `LIVE-MIDI-FSP8-01`. Không có Windows + FSP8 → không có kết quả runtime.

## 1. Trả lời trực tiếp
1. **Vì sao MUSIC = 90 mà Beat có thể nhảy lên +5,7 dB?** Menu **không gửi gì khi khởi động/khôi phục/kết nối lại** (`loadData()` không gọi MIDI; `dispatchKnobVolume` chỉ được gọi từ wheel, nhấp đúp, kéo chuột — VERIFIED_CODE, test T01). Fader chỉ đổi khi một CC **tuyệt đối** tới (xoay, lăn, hoặc nhấp đúp đưa knob về 90 → CC20 = 114). Khi đó Control Link đặt thẳng fader tới vị trí tương ứng CC114 — nên nhảy từ 0 lên +5,7 dB là **phản ứng của FSP8 với CC114**, không phải Menu tự gửi. Việc "CC114 → +5,7 dB" là quan sát của bạn; quy tắc quy đổi của FSP8 **chưa có tài liệu/bằng chứng đọc được** → UNVERIFIED (không suy ra từ dB).
2. **Lỗi nằm ở đâu?** Không ở Menu (công thức 90→114, CC20, kênh 15, đường gửi đúng: PASS_SIMULATED; 11/11 test mới). Không ở mapping MIDI (CC20 ≠ CC21). Là **khác biệt thang đo giữa Menu (0–100 tuyến tính → CC 0–127) và fader FSP8 (thang dB phi tuyến, giới hạn trên +6 dB)** cùng với **Control Link tuyệt đối không có "pickup"** (tài liệu Fender/SOS không nêu soft-takeover). Phần FSP8 là UNVERIFIED, chưa chạy thật.
3. **Đã sửa gì?** **Không sửa code Menu.** Chỉ thêm test `tests/unit/FSP8MidiSync01.verify.js` (11 kiểm tra). Lý do: sửa "để 90 = mức tham chiếu" cần biết CC nào ứng với mức đó trong FSP8 — hiện không có dữ liệu; thêm mã dựa trên giả định là điều task cấm.
4. **MUSIC và MASTER tách biệt bằng gì?** CC20 vs CC21 (hai mapping khác số, test T04/T05); bộ nhớ chống trùng tách theo action; MASTER gán vào fader `Main` (đích bạn đã xác nhận; project chỉ có 1 kênh đầu ra `Main`, VERIFIED_FILE); không có đường code nào khác dùng 2 action này (grep `ui/core/app`). Phía FSP8 (mỗi CC gán đúng 1 fader) còn chờ test thật.
5. **Đã chạy thật / BLOCKED_USER_TEST:** thật trên Windows/FSP8: **chưa gì**. Code + mô phỏng: T01–T06, T08 (bảng dưới). T07 và quy tắc quy đổi: BLOCKED_USER_TEST.
6. **Bước tiếp theo duy nhất:** xem mục 5.

## 2. Luồng dữ liệu (trước = sau, không sửa)
`Menu knob (0–100)` → `executeAction(reason:"knob")` → `CC = round(v×127/100)` (bỏ qua nếu trùng lần gửi thành công trước) → `sendMidiCC` → IPC `midi-send` → `runtime.sendMidi` → `MidiDriver` → cổng `AUTO MENU AI` (loopMIDI) → FSP8 External Device → Control Link (CC20 → fader `Beat`, CC21 → fader `Main`).
Quy đổi: Menu→MIDI **VERIFIED_CODE** (0/25/50/60/75/90/100 → 0/32/64/76/95/114/127). MIDI→fader FSP8: **UNVERIFIED** (4 giá trị khác nhau: Menu 90 · CC 114 · số External Devices · dB fader — không đồng nhất).

## 3. Kết quả test (PASS_SIMULATED/CODE, không phải Windows+FSP8)
| ID | Thao tác | Menu | MIDI dự kiến | MIDI thực tế (mô phỏng) | Fader trước/sau | Kết quả |
|---|---|---|---|---|---|---|
| T01 | Kết nối/khôi phục/điền cấu hình khi MUSIC=90 | 90 | không gửi | 0 message | – | PASS_CODE/SIM; fader thật: BLOCKED_USER_TEST |
| T02 | 90→60 | 60 | CC20=76 | CC20=76, kênh 15 | – | PASS_SIM |
| T03 | 60→90 | 90 | CC20=114 | CC20=114 | – | PASS_SIM; mức dB thật: BLOCKED_USER_TEST |
| T04 | Xoay MASTER | 50 | CC21=64 | CC21=64 | – | PASS_SIM |
| T05 | MUSIC khi đổi MASTER | 40/55 | CC20=51, CC21=70 | đúng, độc lập | – | PASS_SIM |
| T06 | Ngắt/kết nối lại | – | không gửi; cổng lỗi → không-ok, không ném | đúng | – | PASS_SIM (code không phát lại giá trị) |
| T07 | Đổi fader trong FSP8 | – | – | – | – | BLOCKED_USER_TEST (xem 4) |
| T08 | Quét 0→100→0 | 0..100 | 255 CC theo thứ tự, bỏ trùng liên tiếp | đúng thứ tự, không mất bước | – | PASS_SIM; độ giật fader: BLOCKED_USER_TEST |
Chạy: `node tests/unit/FSP8MidiSync01.verify.js` → 11 PASS / 0 FAIL.
Hiệu năng: Menu gửi mỗi bước (không throttle), đã chống trùng; không thấy bằng chứng quá dày; chưa tối ưu thêm vì chưa chứng minh có giật.

## 4. Một chiều / hai chiều
- **Hiện tại: một chiều (Menu → FSP8).** Không có code Menu nào đọc lại giá trị fader/knob từ FSP8 (không có tham chiếu knob trong `runtime.js`).
- Hai chiều: Sound On Sound nêu tùy chọn **Transmit Value** trong bảng map thiết bị (để điều khiển motor/LED phản ánh thay đổi phần mềm) → FSP8 *có thể* gửi giá trị ngược ra cổng "Send To". **Chưa xác minh** với cấu hình này và Menu chưa có đường nhận. Dùng chung 1 cổng loopMIDI cho cả đi lẫn về sẽ dội lại chính lệnh Menu gửi (rủi ro, INFERRED) → nếu làm cần cổng thứ hai. **Không giả lập phản hồi.** Phương án an toàn: giữ một chiều.
- Phần "không được tự nhảy": đạt ở phía Menu (không phát lúc khởi động). Cú nhảy ở lần gửi **đầu tiên** sau khi gán Control Link là hành vi tuyệt đối của CC; chưa có cách đã chứng minh để chặn từ phía FSP8 (không có tài liệu pickup).

## 5. Cần để hoàn thiện nhanh nhất (BLOCKED_USER_TEST — 1 việc)
Đặt knob Menu **MUSIC** lần lượt ở các giá trị dưới đây (lăn chuột), mỗi lần ghi **số dB hiện trên fader `Beat`** trong FSP8, và cho biết **mức dB bạn muốn ứng với MUSIC = 90** (ví dụ 0 dB):

| Menu MUSIC | 0 | 25 | 50 | 60 | 75 | 90 | 100 |
|---|---|---|---|---|---|---|---|
| CC gửi | 0 | 32 | 64 | 76 | 95 | 114 | 127 |
| dB trên fader Beat | | | | | | | |

Đồng thời xác nhận chỉ một ô: fader `Beat` đã được Control Link với CC20 (có/không).
**Đề xuất kiến trúc (CHƯA áp dụng, cần bạn đồng ý):** thêm một bảng hiệu chuẩn nhỏ cho từng knob (Menu 0–100 → CC) lấy từ chính các số đo trên, nội suy giữa các điểm; khi đó "MUSIC = 90" sẽ gửi đúng CC cho mức bạn chọn. Không thay đổi UI/HTML, không đổi CC/kênh. Không làm khi chưa có số đo vì sẽ là suy đoán.

## 6. File
Mới: `tools/algbench/reports/FSP8-MIDI-SYNC-FAST-01/REPORT.md`, `tests/unit/FSP8MidiSync01.verify.js`. Sửa: không. Không commit/push.

## 7. Cập nhật 28/10 — dữ liệu đo thật của người dùng (CC20 → Volume Beat đã xác nhận)
HEAD kiểm tra lại: `6cd4ac0f47fc696cc948b9b28347502f1e18a128` (08:47 giờ VN, không đổi).

| Menu MUSIC | CC20 hiện tại | Fader Beat | Nguồn |
|---:|---:|---:|---|
| 50 | 64 | −11,7 dB | USER_MEASURED |
| 90 | 114 | +5,7 dB | USER_MEASURED |
| 100 | 127 | +10 dB | USER_MEASURED |

Phân tích (không nội suy thành đường cong):
- Fader FSP8 **không tuyến tính theo CC** (không có đường cong nào đã xác minh): 64→114 (50 bước CC) tăng 17,4 dB, tức ~0,35 dB/bước ở đoạn này; 114→127 (13 bước) tăng 4,3 dB, ~0,33 dB/bước. Phần dưới CC64 chắc chắn dốc khác (không có số đo).
- 0 dB nằm **giữa CC64 và CC114**. Một ước lượng thô nếu đoạn này gần tuyến tính là CC ≈ 97–98 — **chỉ là gợi ý để chọn điểm đo, KHÔNG dùng làm giá trị hiệu chuẩn.**
- Cách an toàn xác định CC đúng: đo trực tiếp quanh vùng đó. Knob Menu nguyên chỉ tạo ra các CC: knob 75→95, 76→97, 77→98, 78→99 (CC96 không ra được bằng knob nguyên). Fader có độ phân giải ~0,35 dB/bước nên có thể không đúng 0,0 dB mà chỉ gần nhất (vd −0,2 / +0,1).

### Phép đo bổ sung duy nhất cần người dùng (≈1 phút)
Đặt MUSIC lần lượt ở 75, 76, 77, 78 và ghi dB trên fader `Beat`:

| Menu MUSIC | 75 | 76 | 77 | 78 |
|---|---|---|---|---|
| CC gửi | 95 | 97 | 98 | 99 |
| dB fader Beat | | | | |

Nếu không giá trị nào gần 0 dB (khoảng ±0,3), gửi tôi các số đo đó để chọn dải đo tiếp.

### Thiết kế thay đổi (sẽ áp dụng ngay khi có số đo; CHƯA áp dụng, không có giá trị CC giả định trong code)
- Chỉ đổi **hàm quy đổi knob→CC của riêng action `BEAT_INPUT_VOLUME`** trong `ui/js/actionRegistry.js` (khối `isKnobCc`, dòng ~233): thay công thức tuyến tính bằng bảng điểm neo `[Menu→CC]` = `0→0`, `50→64` (đo), `90→CC_0dB` (đo), `100→127` (đo), nội suy tuyến tính giữa các neo, kẹp 0–127, làm tròn. Các giá trị Menu ngoài 3 điểm đo là **xấp xỉ**, không phải đường cong thật của FSP8 (sẽ ghi rõ trong báo cáo).
- Chỉ áp dụng khi DAW đang chọn là "Studio Pro 8" (cấu hình CC này đo trên FSP8); `MASTER_OUTPUT_VOLUME` (CC21), RETUNE, Cubase, Studio One khác: **giữ nguyên công thức cũ**.
- Không gửi MIDI lúc khởi động/khôi phục (không đổi). Test sẽ thêm: MUSIC 90 → đúng CC đo; 0/50/100 giữ 0/64/127; mọi 0–100 nằm trong 0–127 và không giảm khi Menu tăng; MASTER 0–100 vẫn là `round(v×127/100)`; không có MIDI khi nạp cấu hình.
- Lưu ý: nếu muốn kết quả tốt cho vùng 60–100 xung quanh 0 dB, nên đo thêm 1–2 điểm (ví dụ MUSIC 70 và 80); không bắt buộc cho mục tiêu "90 = 0 dB".

### Trạng thái
- Mục tiêu MUSIC=90 → 0 dB: **BLOCKED_USER_TEST** (thiếu CC thực sự cho 0 dB; không đoán).
- Code: chưa sửa. Test: giữ 11/11 PASS của bản trước.

---
Claude A : Task A: FSP8-MIDI-SYNC-FAST-01
1. File đã sửa: không sửa code; thêm REPORT.md và test FSP8MidiSync01.verify.js.
2. Vì sao: Menu đã đúng và không gửi lúc khởi động; việc làm "MUSIC=90 = mức tham chiếu" cần bảng quy đổi của FSP8 mà hiện chưa có bằng chứng.
3. Ảnh hưởng module: không.
4. Còn lại: đo dB fader Beat ở MUSIC 75/76/77/78 (CC 95/97/98/99) để chốt CC của 0 dB; sau đó áp dụng bảng neo cho BEAT (mục 7); T07 hai chiều chưa xác minh.
