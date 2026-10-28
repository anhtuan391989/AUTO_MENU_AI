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

## 7. FSP8-MIDI-SYNC-FAST-02 — Hiệu chỉnh MUSIC = 90 về 0 dB
HEAD đã kiểm tra: `acd81b9e04ffa79442c7ce1a9e0f60ed1cac2f4a` (28/10/2026 08:56 giờ VN; đã thay đổi so với `6cd4ac0f…` trong báo cáo trước — chỉ auto-sync, không đổi code liên quan).

### Số đo thật (USER_MEASURED, CC20 → fader Beat)
| Menu | CC (công thức cũ) | Fader Beat |
|---:|---:|---:|
| 50 | 64 | −11,3 dB (báo cáo trước ghi −11,7; dùng số mới) |
| 75 | 95 | −0,5 dB |
| 76 | 97 | +0,2 dB |
| 77 | 98 | +0,5 dB |
| 78 | 99 | +0,8 dB |
| 90 | 114 | +5,7 dB |
| 100 | 127 | +10 dB |

### Căn cứ và công thức
- CC gần 0 dB nhất **trong các CC đã đo** là **CC97 (+0,2 dB)**; CC95 = −0,5 dB. Đoạn 95→99 tăng ~0,33 dB/CC. CC96 chưa đo (có thể ~−0,1 dB nhưng không dùng vì chưa có số đo).
- CC97 chỉ được đo ở MUSIC 76; **việc đặt MUSIC 90 → CC97 là lựa chọn hiệu chuẩn**, không phải CC "tự nhiên" của 90.
- Điểm neo `[Menu → CC]` (chỉ MUSIC, chỉ khi DAW = "Studio Pro 8"): **50→64** (đo), **90→97** (chọn để ≈0 dB), **100→127** (đo; +10 dB). Dưới 50: giữ công thức cũ `round(v×127/100)` (liên tục tại 50). Giữa các neo: nội suy tuyến tính theo CC rồi làm tròn.
- Giới hạn: mọi giá trị Menu giữa các neo (ví dụ 60, 75, 95) chỉ là **xấp xỉ**, không phải đường cong thật của FSP8. Hệ quả: MUSIC 75 giờ gửi CC85 (trước CC95 = −0,5 dB) nên dB thật của 60–89 **chưa đo**; đoạn 90→100 dốc hơn (3 CC/bước ≈ 1 dB/bước).
- CC20, kênh 15, mapping: không đổi. MASTER/CC21, RETUNE, Studio One, Cubase: không đổi.

### File thực sự thay đổi
| File | Thay đổi |
|---|---|
| `ui/js/actionRegistry.js` | thêm `KNOB_CC_ANCHORS` + `knobToCc()`; khối `isKnobCc` gọi `knobToCc(action, value)` thay cho công thức tuyến tính (+28 −1 dòng) |
| `tests/unit/FSP8MusicCalib02.verify.js` | MỚI — 16 kiểm tra |
| `tests/unit/KnobDawIntegration02.verify.js` | **thay đổi spec có chủ đích**: riêng MUSIC trên Studio Pro 8, 75→85 (trước 95); các Knob/DAW khác giữ nguyên kiểm tra cũ |
| `tests/unit/FSP8MidiSync01.verify.js` | cập nhật kỳ vọng T02/T03/T08 theo hiệu chuẩn (97/72/97; bảng quét đã tính lại) |
Không sửa UI/HTML, `renderer.js`, `setup.js`, runtime/driver.

### Test (PASS_CODE / PASS_SIM — không phải Windows+FSP8)
- `FSP8MusicCalib02` 16/16: neo 0/50/90/100 → CC 0/64/97/127 (CC20, kênh index 14); CC97 là CC gần 0 dB nhất theo số đo; 0–100 nguyên trong 0–127 và không giảm; dưới 50 = công thức cũ; ngoài dải được kẹp; MASTER CC21 + RETUNE CC22/23 giữ công thức cũ trên FSP8; Studio One 5/7, Cubase 13, chưa chọn DAW giữ công thức cũ; `loadData()` không gửi MIDI; `renderer.js` không đổi.
- Hồi quy: `FSP8MidiSync01` 11/11, `KnobDawIntegration02` 63/63, `KnobMidiCompletion01` 56/56, `KnobBeatMaster` 22/22, `DawQuickFill01` 42/42, `MenuFix02` 31/31, `LiveMidiCompletion01` 35/35, `FxAutoBusFix01` 43/43.
- Toàn bộ `tests/unit`: các file còn lỗi (`AutoSongCollector`, `MusicAnalysis`, `NowPlayingResolver`, `MenuFix01` cũ, và nhóm cần module `xmllint-wasm`/guard `git diff`: `B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `MidiDawControl01`, `MidiLearnDispatch`, `MidiRecovery01`, `PortSelectionPolicy`) **đều lỗi giống hệt ở bản gốc chưa sửa** (kiểm bằng stash) — không phải do thay đổi này.

### Chưa xác minh trên Windows/FSP8 (BLOCKED_USER_TEST)
Chưa có runtime sau thay đổi → **chưa tuyên bố MUSIC 90 = 0 dB**.
**Cách kiểm tra (1 phút):** chép các file trong ZIP vào `G:\AUTO_MENU_AI`, mở lại Menu, chọn DAW "Studio Pro 8". Đặt MUSIC = 90 (nhấp đúp knob) và đọc dB fader `Beat`. Kỳ vọng ≈ +0,2 dB (CC97). Gửi tôi dB ở MUSIC **90, 80, 70** (và 95 nếu muốn); nếu 90 không gần 0 dB đủ ý, tôi chỉnh neo (ví dụ CC96 nếu cần đo thêm bằng neo tạm).


---
Claude A : Task A: FSP8-MIDI-SYNC-FAST-01
1. File đã sửa: ui/js/actionRegistry.js (hiệu chuẩn MUSIC trên Studio Pro 8); tests FSP8MusicCalib02 (mới), KnobDawIntegration02, FSP8MidiSync01; REPORT.md.
2. Vì sao: số đo thật cho thấy CC114 = +5,7 dB; MUSIC 90 → CC97 (+0,2 dB) để gần 0 dB.
3. Ảnh hưởng module: không.
4. Còn lại: người dùng kiểm MUSIC 90/80/70 sau thay đổi; T07 hai chiều chưa xác minh.
