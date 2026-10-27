# FSP8-KNOB-MACRO-02 — Xác minh MIDI Channel và Control Link 4 knob

## 1. GitHub
- `main` HEAD = `83ccf826a61911c51dcd9c3c136a2f8407c074ed` (Auto-sync 27/10/2026 14:20), kiểm tra lúc 27/10/2026 14:21 (giờ VN). So với HEAD của MACRO-01 (`1b9bb002`): chỉ thêm `FSP8-KNOB-MACRO-01/REPORT.md` và 1 file log → **không có code đổi**, báo cáo cũ về Menu vẫn đúng.
- Đã đọc: `ui/js/actionRegistry.js` (dòng ~222–250), `ui/js/setup.js` (profile, dòng ~725–745), `ui/js/appSettings.js` (sendMidiCC/`__midiSendViaMain`), `app/main.js` (`midi-send`), `core/command-engine-js/runtime.js` (`sendMidi`), `core/command-engine-js/drivers/midiDriver.js`, `Ảnh/Project FSF8.zip` (`save new 2.1.song`, build Studio Pro 8.0.0.110141) và báo cáo `FSP8-PROJECT-DEEP-AUDIT-01`. File XML trong `Ảnh` không dùng làm cấu hình.

## 2. MIDI Channel — đối chiếu (VERIFIED_FILE + PASS_SIMULATED)
Chuỗi chuyển kênh:
`Setup/profile: kênh 15 (hiển thị 1–16)` → `actionRegistry: (channel||1)-1 = 14` → `main.js midi-send → runtime.sendMidi: ch = 14 & 0x0F` → `MidiDriver: params.channel = ch+1 = 15` → `easymidi: (15-1) = 14 (0-based)` → **byte trạng thái 0xBE = Control Change kênh 15 (1-based)**.
- Profile "Studio Pro 8" (`dawQfMake(15, 127, {BEAT 20, MASTER 21, RETUNE1 22, RETUNE2 23})`) nạp **kênh 15 thật**, không phải mặc định kênh 1. Chênh lệch với báo cáo trước: **không có**. Chênh lệch với cấu hình "Channel 1" bạn nêu trước đây: code/profile là 15; **giá trị đang lưu trên máy bạn thì tôi không đọc được (BLOCKED)** — nó hiện ở Setup > MIDI Out từng knob.
- Cổng đích: `AUTO MENU AI` (tên cổng đã lưu `midiOutputPort`; mô phỏng dùng đúng tên này).
- Không đổi channel, không sửa code.

### Bảng CC (mô phỏng: easymidi giả ghi lại từng message; công thức `round(v×127/100)` từ `actionRegistry.js`)
| Knob / Action | CC | Kênh hiển thị | Kênh trong code | Cổng | Knob 0/25/50/75/100 → CC value | Byte gửi (100%) |
|---|---|---|---|---|---|---|
| BEAT_INPUT_VOLUME (MUSIC) | 20 | 15 | 14 | AUTO MENU AI | 0 / 32 / 64 / 95 / 127 | `BE 14 7F` |
| MASTER_OUTPUT_VOLUME | 21 | 15 | 14 | AUTO MENU AI | 0 / 32 / 64 / 95 / 127 | `BE 15 7F` |
| RETUNE_SPEED_MIC1 | 22 | 15 | 14 | AUTO MENU AI | 0 / 32 / 64 / 95 / 127 | `BE 16 7F` |
| RETUNE_SPEED_MIC2 | 23 | 15 | 14 | AUTO MENU AI | 0 / 32 / 64 / 95 / 127 | `BE 17 7F` |
Chi tiết 20 dòng: `evidence/chain-sim-output.md` (script `evidence/chain-sim.js`). Chạy lại: 3 test Menu `KnobDawIntegration02` (63), `KnobMidiCompletion01` (56), `DawQuickFill01` (42) đều PASS, 0 FAIL.
Phạm vi mô phỏng: kiểm tra phía Menu→cổng. **Không chứng minh** loopMIDI chuyển tiếp hay FSP8 nhận (delivery = UNCONFIRMED theo chính code).

## 3. Project FSP8 (VERIFIED_FILE, trạng thái lúc lưu 20/10)
- Kênh: `Beat` (stereo) → `Main`; `Mic` ← Input R và `Không Dây` ← Input L, cả hai → bus `Group Mic` → `Main`. **Chỉ có 1 kênh đầu ra: `Main`** (`AudioOutputChannel`, → thiết bị ASIO), mang insert SSLComp, Vitamin, L2, S1 Imager.
- External Devices trong project đã có thiết bị `AUTO MENU AI` (và `loop`, `New Keyboard`…) nhưng **0 control assignment** (`surfacemanager.xml`). Bộ lọc kênh MIDI của thiết bị không nằm trong file → UNKNOWN.

## 4. MUSIC — CC20 → fader `Beat`
- Đích: fader kênh `Beat` (tên hiển thị chính xác `Beat`, UID `{9178B3CE-…}`) — VERIFIED_FILE. Menu→cổng: PASS_CODE + PASS_SIMULATED. Phía FSP8: chưa chạy thật → **PARTIAL**.
- Hướng dẫn Control Link (tài liệu Fender "Control Linking" + Sound On Sound "Studio Pro: Using MIDI Controllers"):
  1. FSP8 > Options > External Devices: dùng thiết bị `AUTO MENU AI` có sẵn (hoặc Add > New Keyboard), **Receive From = `AUTO MENU AI`**, để kênh MIDI mặc định (tất cả).
  2. Mở bảng map của thiết bị (menu thả xuống > Edit), bật **MIDI Learn**, rồi xoay lần lượt 4 knob trong Menu (MUSIC, MASTER, RETUNE 1, RETUNE 2). Mỗi knob hiện ra kèm số CC (mong đợi 20, 21, 22, 23). Đổi loại thành **fader** nếu cần, tắt MIDI Learn.
  3. Mở Console, di chuột kéo nhẹ fader `Beat`, xoay knob MUSIC trong Menu → bấm **Assign** (Alt/Option+M). (Cách khác: chuột phải fader > "Assign …".)
  4. Kiểm tra tăng/giảm: knob lên → fader `Beat` lên; xuống → giảm; không có fader khác nhúc nhích.
- Một điều khiển chỉ gán 1 tham số (SOS). Mapping lưu cùng plug-in/dự án (SOS) — nên lưu lại dự án.
- **Nhảy giá trị:** CC là giá trị tuyệt đối; Menu **không gửi gì khi khởi động** (code `actionRegistry.js`, VERIFIED_FILE) nên không nhảy lúc mở app, nhưng **lần xoay đầu tiên có thể làm fader nhảy tới vị trí knob**. Tài liệu Fender/SOS không nêu soft-takeover/pickup → **UNVERIFIED, chưa có bằng chứng runtime**; không khẳng định đã giải quyết. Cách giảm rủi ro (chưa kiểm chứng): đặt knob Menu đúng vị trí fader hiện tại trước khi xoay.

## 5. MASTER — CC21
- Bằng chứng: project chỉ có **một** kênh đầu ra là `Main` (VERIFIED_FILE); mọi track/bus đều đi vào `Main`; không có fader đầu ra nào khác. Không có tài liệu nào trong repo định nghĩa "MASTER OUTPUT VOLUME" cụ thể hơn.
- Kết luận: đích khả dĩ duy nhất theo cấu trúc project = fader `Main` (không chỉ vì tên). Cách gán giống mục 4 (đổi fader thành `Main`). Trạng thái **PARTIAL**: cần chủ dự án xác nhận 1 điều — **knob MASTER có đúng là fader `Main` không (chứ không phải gain plugin L2 trên `Main`)?**
- Lưu ý: `Main` không nằm trong `RemoteBank` của project (chỉ ảnh hưởng thiết bị điều khiển ngoài; ý nghĩa INFERRED) — kiểm tra lúc gán thật.

## 6. RETUNE MIC 1 / MIC 2 — CC22 / CC23
Plugin xử lý giọng thực tế trong file (VERIFIED_FILE; cùng bảng `FSP8-PROJECT-DEEP-AUDIT-01/evidence/inserts.md`):
| Đường | Plugin chỉnh cao độ | Bypass |
|---|---|---|
| Input R (nguồn của `Mic`) | `Auto-Tune Pro` (nhãn "Mượt 4") | đang bật |
| `Mic` (track) | `AutoTune Advanced` (slot 16) | đang bật |
| Input L (nguồn của `Không Dây`) | `Auto-Tune Pro` (nhãn "Mượt 3") | đang bật |
| `Không Dây` (track) | `Auto-Tune Pro 2` (slot 13), `AutoTune Advanced 2` (slot 14) | **bypass=1 (tắt)** |
- Mỗi đường có **tới 2 plugin Auto-Tune đang bật** (Mic: Input R + AutoTune Advanced) hoặc 1 (Không Dây: chỉ Input L) → **chưa xác định được instance nào là "Retune MIC 1/2"** của Menu. Plugin là họ Auto-Tune (không đoán Melodyne).
- Tên tham số/dải/chiều: state plugin là nhị phân VST3 → **không đọc được**. Trong preset Auto-Tune Pro có mục `RetuneSpeedMIDIPref_ID="0"` (cấu hình MIDI riêng của plugin) nhưng ý nghĩa giá trị 0 **chưa xác minh**. Dải CC 0–127 → tham số: UNKNOWN. FSP8 có đưa Retune Speed vào Control Link hay không: UNKNOWN.
- Không tạo macro thay thế (macro chỉ giá trị tĩnh — xem MACRO-01).
- **Trạng thái: BLOCKED cả hai.** Điều kiện mở khóa (1 test, ~2 phút, chỉ khi bạn muốn tiếp tục): trong FSP8 mở đúng plugin Auto-Tune cần điều khiển, bật thanh Control Link (chọn thiết bị `AUTO MENU AI`), xoay knob RETUNE trong Menu rồi **kéo nút Retune Speed của plugin**: nếu nó xuất hiện trong cửa sổ tham số của Control Link thì gán được (Assign). Cần cho tôi biết **tên instance** (ví dụ "Mượt 4" hay "AutoTune Advanced") dùng làm Retune MIC 1/MIC 2.

## 7. Bảng trạng thái
| Knob | Phía Menu | Phía FSP8 | Trạng thái |
|---|---|---|---|
| MUSIC (CC20 → `Beat`) | PASS_CODE, PASS_SIMULATED | chưa test thật; nhảy giá trị UNVERIFIED | **PARTIAL** |
| MASTER (CC21 → `Main`) | PASS_CODE, PASS_SIMULATED | đích chờ xác nhận; chưa test thật | **PARTIAL** |
| RETUNE MIC 1 (CC22) | PASS_CODE, PASS_SIMULATED | instance + tham số chưa xác định | **BLOCKED** |
| RETUNE MIC 2 (CC23) | PASS_CODE, PASS_SIMULATED | instance + tham số chưa xác định | **BLOCKED** |
Không có `PASS_RUNTIME_FSP8`. Ảnh hưởng nút MUSIC/MIC1/MIC2/FX: không (CC knob 20–23 ch15 tách khỏi LIVE CC102–109 ch16 và SELECT CC110–112 ch16; không sửa code).

## 8. File
- Mới: `tools/algbench/reports/FSP8-KNOB-MACRO-02/REPORT.md`, `evidence/chain-sim.js`, `evidence/chain-sim-output.md`.
- Sửa: không. Không commit/push.

## 9. BLOCKED & điều kiện mở khóa
1. Cấu hình kênh thực đang lưu trên máy bạn (Setup > MIDI Out) — xem 4 dòng knob, nên là kênh 15.
2. Test thật MUSIC/MASTER trên FSP8 (gán + tăng/giảm + nhảy giá trị).
3. MASTER = `Main`? (1 câu xác nhận).
4. Retune: tên instance Auto-Tune + kết quả thử "tham số có hiện trong Control Link".

Nguồn: [Control Linking](https://fenderstudiopromanual.fender.com/en/Content/Control_Link_Topics/Control_Linking.htm) · [Studio Pro: Using MIDI Controllers (SOS)](https://www.soundonsound.com/techniques/studio-pro-using-midi-controllers?amp) · [Set Up Your MIDI Devices](https://fenderstudiopromanual.fender.com/en/Content/Setup_Topics/Set_Up_Your_MIDI_Devices.htm)

---
Claude A : Task A: FSP8-KNOB-MACRO-02
1. File đã sửa: không sửa code; chỉ thêm REPORT.md và 2 file evidence.
2. Vì sao: cần chứng minh chuỗi kênh/CC của Menu và lập hướng dẫn Control Link dựa trên project thật; không có lỗi để sửa.
3. Ảnh hưởng module: không.
4. Còn lại: test thật FSP8 cho MUSIC/MASTER; xác nhận MASTER=`Main`; Retune cần tên instance + thử Control Link.
