# FSP8-KNOB-DIAG-03 — Truy vết giá trị Menu / External Devices / DAW (MUSIC, CC20)

- `main` HEAD = `f5696cfd8c9c878c5cc4985d7ac7971db6ae17c5` (Auto-sync 27/10/2026 14:27), kiểm tra 27/10/2026 21:09 (giờ VN).
- Phương pháp: đọc code (VERIFIED_CODE), tính lại công thức, dùng lại mô phỏng đường gửi MIDI của MACRO-02 (`evidence/chain-sim.js`), đọc log `logs/2026-10-27_12-00-57.jsonl` trên main, đọc project FSP8 (`save new 2.1.song`, 20/10). Không có Windows + FSP8 ở đây → **không có PASS_RUNTIME**.

## 1. Trả lời 6 câu hỏi
1. **Menu = 90 → CC = 114** (`round(90×127/100)`; `evidence/value-math.txt`). Không có bước nào trong `renderer.js → actionRegistry.js → sendMidiCC → midi-send → runtime.sendMidi → midiDriver` đổi 114 thành 76 (VERIFIED_CODE + PASS_SIMULATED: byte `BE 14 72`).
2. **Số 76:** ý nghĩa trong giao diện FSP8 = **BLOCKED_UI_SEMANTICS** (không có ảnh/log chỉ rõ ô hiển thị nào). Điều kiểm chứng được: trong các knob nguyên 0–100, **chỉ knob = 60 cho CC = 76** (59→75, 61→77). Tức 76 khớp với việc Menu đã từng gửi knob=60 (INFERRED; không phải bằng chứng đã gửi). Không dùng giả thuyết này làm kết luận về ý nghĩa của ô.
3. **Vì sao DAW = 0:** hai nguyên nhân có bằng chứng, không cần thử thêm để khẳng định:
   - (a) **"90" trên Menu chưa chắc đã được gửi.** `knobData` mặc định `musicKnob/masterKnob = 90` (`renderer.js:838–839`), và `loadData()` khôi phục giá trị đã lưu **mà không gửi MIDI** (`renderer.js:1816–1820`; code ghi "Không gửi gì lúc khởi động/khôi phục"). Chỉ xoay/lăn chuột/**nhấp đúp** mới gửi CC. Vậy "Menu = 90" có thể là giá trị hiển thị mặc định/đã lưu, trong khi giá trị cuối FSP8 nhận (76) là lần xoay trước đó. (VERIFIED_CODE)
   - (b) **Không có bằng chứng fader `Beat` đã được Control Link.** Project FSP8 đã lưu có thiết bị `AUTO MENU AI` với **0 control assignment** (`surfacemanager.xml`, VERIFIED_FILE, trạng thái 20/10). Số trên External Devices đổi chỉ cho thấy thiết bị nhận CC, **không** chứng minh fader được điều khiển (đúng tiêu chí task). Có gán Control Link từ 20/10 đến nay hay chưa: BLOCKED (không có file/ảnh mới hơn).
4. **Vị trí lỗi:** theo bằng chứng, **không phải lỗi code Menu** (công thức, kênh 15, CC20, cổng đều đúng). Điểm lệch là (a) quan hệ giữa giá trị hiển thị và giá trị đã gửi, và (b) khâu **Control Link chưa được xác nhận**. Cổng/loopMIDI→FSP8: dữ liệu 76 xuất hiện cho thấy FSP8 có nhận CC (INFERRED, vì chưa rõ 76 là CC thô); kênh/CC số mấy FSP8 nhận: BLOCKED.
5. **Thao tác cần thiết duy nhất (1):** trong Menu **nhấp đúp knob MUSIC** (đặt về 90 và gửi CC114 — đường dispatch của `dblclick`, `renderer.js:2820–2825`), rồi chụp **một ảnh FSP8** có đủ: bảng External Devices (số hiện ra), fader `Beat`, và thanh Control Link của thiết bị `AUTO MENU AI`. Ảnh đó phân định: số đổi từ 76 → 114 (=ô là CC thô, Menu→FSP8 thông) hay không, và fader đã được gán chưa.
6. **Không cần sửa code.** Không sửa file nào.

## 2. Bảng truy vết (MUSIC, knob = 90)
| Tầng | Vào | Ra | Công thức / chi tiết | Trạng thái |
|---|---|---|---|---|
| Menu knob | 90 (thang 0–100) | 90 | mặc định `renderer.js:838`; khôi phục không gửi | VERIFIED_CODE |
| Chuẩn hóa → CC | 90 | **114** (thang 0–127) | `round(clamp(v,0,100)×127/100)`, `actionRegistry.js:~233` | VERIFIED_CODE, PASS_SIMULATED |
| Chống trùng | 114 | gửi hoặc bỏ qua | bỏ qua nếu cùng action/mapping/CC với lần gửi thành công gần nhất (reset khi mở lại app) | VERIFIED_CODE |
| sendMidiCC → IPC | CC20, 114, kênh 14 (0-based) | `{kind:cc,number:20,value:114,channel:14}` | `appSettings.js` → `midi-send` | VERIFIED_CODE |
| runtime/driver | ch 14 | byte `BE 14 72` | `0xB0|14`; driver ch+1 → easymidi (ch−1) | PASS_SIMULATED |
| Cổng `AUTO MENU AI` → loopMIDI | `BE 14 72` | – | delivery = UNCONFIRMED theo chính code | BLOCKED (runtime) |
| FSP8 External Device | – | "76" (ý nghĩa chưa rõ) | – | BLOCKED_UI_SEMANTICS |
| Control Link → fader `Beat` | – | DAW = 0 | chưa có assignment trong file 20/10 | BLOCKED |

Ba thang đo khác nhau: 90/100 (Menu) · 114/127 (CC thô; 89,8%) · giá trị FSP8 (ô hiển thị chưa xác định; fader có đường cong dB riêng, không tuyến tính theo CC — chưa kiểm chứng).

## 3. Giới hạn bằng chứng
- Không đọc được cấu hình lưu trên máy Windows của bạn (kênh/CC thực đang lưu, `midiOutputPort`) và log chạy mới nhất; log trên main (`2026-10-27_12-00-57.jsonl`, 5517 dòng) chỉ có FX_AUTO, **không có sự kiện knob/MIDI** → không chứng minh được CC nào đã gửi.
- Không có ảnh vị trí hiển thị "76" và "0".

## 4. File
Mới: `tools/algbench/reports/FSP8-KNOB-DIAG-03/REPORT.md`, `evidence/value-math.txt`, `evidence/chain-sim.js`. Sửa: không. Không commit/push.

---
Claude A : Task A: FSP8-KNOB-DIAG-03
1. File đã sửa: không (chỉ thêm REPORT.md + 2 file evidence).
2. Vì sao: chẩn đoán; đường Menu→MIDI đúng, không có lỗi code để sửa.
3. Ảnh hưởng module: không.
4. Còn lại: 1 ảnh FSP8 sau khi nhấp đúp knob MUSIC (External Devices + fader Beat + thanh Control Link) để chốt ý nghĩa "76" và tình trạng Control Link.
