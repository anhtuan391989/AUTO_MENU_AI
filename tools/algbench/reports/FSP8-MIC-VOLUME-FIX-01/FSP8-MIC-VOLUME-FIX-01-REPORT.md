# FSP8-MIC-VOLUME-FIX-01 — Núm âm lượng track Mic

## 1. GitHub
`main` HEAD = `5e242a8e1abe35686f8e5277814cf414987a822a` (Auto-sync 28/10/2026 09:55), kiểm tra 28/10/2026 10:04 (giờ VN); working tree sạch trước khi làm. Đã đọc trực tiếp `ui/js/actionRegistry.js`, `ui/js/renderer.js` (KNOB_ID_TO_ACTION, handler wheel/dblclick/kéo), `ui/js/setup.js` (profile), `ui/index.html` (6 núm), `appSettings.js`, các test knob/MIC hiện có.

## 2. Kết luận nguyên nhân (VERIFIED_CODE + PASS_SIM)
**Menu hiện không có núm hay action nào điều khiển âm lượng track `Mic` (hay `Không Dây`).**
- `ui/index.html` có đúng 6 núm: `retune1`, `retune2`, `musicKnob`, `masterKnob`, `clapKnob`, `laughKnob`.
- `KNOB_ID_TO_ACTION` chỉ có 4 action MIDI: `RETUNE_SPEED_MIC1/2` (tốc độ Retune, KHÔNG phải fader), `BEAT_INPUT_VOLUME` (fader `Beat`), `MASTER_OUTPUT_VOLUME` (fader `Main`). Không có `MIC1_VOLUME`/`MIC2_VOLUME` ở bất kỳ file nào; lịch sử git (`git log -S`) cũng không có dấu vết chúng từng tồn tại → **không có chức năng nào bị "hỏng" để khôi phục**.
- Theo danh sách nguyên nhân của task: không phải "action MIC chưa gọi" hay "knob luôn gửi BEAT" theo nghĩa lỗi; thực tế là **action âm lượng MIC chưa được khai báo, chưa có mapping và chưa có núm UI** (khả năng thứ 2 trong danh sách).
- Nếu ý bạn là **núm MUSIC ngừng điều khiển fader `Beat` sau khi chọn track Mic**: Menu không gây ra điều đó. Test mô phỏng chứng minh: bấm MIC 1 / MIC 2 / MUSIC (SELECT → chờ → ON/OFF) chỉ gửi CC102–112 kênh 16; sau đó MUSIC vẫn gửi CC20 kênh 15 đúng (MUSIC 60 → 72; MASTER 90 → CC21 = 114 không đổi). Mapping CC20/CC21 không bị nút MIC chạm tới.
- Điểm duy nhất của Menu có thể "không gửi lại": chống trùng theo giá trị CC (lặp đúng cùng giá trị sau khi bấm MIC không gửi lại). Menu không biết trạng thái DAW. Chỉ ảnh hưởng khi lặp đúng cùng giá trị, **không đổi** trong task này.

## 3. Phần chưa xác minh (BLOCKED_USER_TEST) — phía FSP8
Chưa có bằng chứng về việc gán Control Link của CC20 trong FSP8 có gắn cứng vào fader `Beat` hay đi theo kênh đang chọn. Không có tài liệu đọc được để kết luận (Fender/SOS chỉ nói Assign gán một điều khiển cho một tham số). Không tự bịa CC cho fader `Mic`; FSP8 không có CC mặc định — CC là quy ước của Menu rồi gán bằng Control Link.

**Một quan sát duy nhất để phân định:** chọn track Mic bằng nút MIC 1 trong Menu, rồi xoay núm bạn thấy "mất tác dụng" (cho biết là núm nào) và ghi lại 2 thứ: (a) số dưới núm Volume trong External Devices có đổi không; (b) fader nào nhúc nhích (`Beat`, `Mic`, hay không cái nào).
- Số đổi + fader `Mic` nhúc nhích → Control Link đi theo kênh đang chọn → cần gán lại CC20 cố định vào fader `Beat` (không phải sửa Menu).
- Số đổi + không fader nào nhúc nhích → mất/đổi gán Control Link trong FSP8.
- Số không đổi → trái với kết quả mô phỏng; khi đó gửi tôi ảnh/log (`__lastMidiSendResult`).

## 4. Nếu bạn muốn có núm âm lượng MIC (chưa làm — cần quyết định)
Cần bổ sung action riêng `MIC1_VOLUME` (fader `Mic`) và `MIC2_VOLUME` (fader `Không Dây`), mỗi action một CC riêng kênh 15 (ví dụ CC24/CC25, không trùng CC20–23 và CC102–112), thêm vào bộ điền nhanh Studio Pro 8 để không đổi DAW khác, rồi gán Control Link trong FSP8. **Bắt buộc phải có núm UI mới** — hiện 6 núm đã dùng hết và task cấm sửa UI ngoài phạm vi khôi phục; không có chỗ để gắn nên không viết mã vô chủ. Cần bạn chọn: thêm núm nào/ở đâu (hoặc dùng núm nào có sẵn), và Mic dùng cùng đường cong fader như Beat hay đo riêng.

## 5. File
Mới: `tests/unit/FSP8MicVolumeDiag01.verify.js` (10 kiểm tra). Sửa: không. Giữ nguyên hiệu chuẩn MUSIC (FAST-02/03).

## 6. Test
- `FSP8MicVolumeDiag01` 10/10 (PASS_CODE/PASS_SIM).
- Hồi quy: `FSP8MusicCalib02` 24/24, `FSP8MidiSync01` 11/11, `KnobDawIntegration02` 63/63, `KnobMidiCompletion01` 56/56, `KnobBeatMaster` 22/22, `MenuFix02` 31/31, `LiveMidiCompletion01` 35/35, `DawQuickFill01` 42/42.
- Lỗi môi trường sẵn có (không đổi): `AutoSongCollector`, `MusicAnalysis`, `NowPlayingResolver`, `MenuFix01` cũ; `B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `MidiDawControl01`, `MidiLearnDispatch`, `MidiRecovery01`, `PortSelectionPolicy`.
- PASS_RUNTIME (Windows + FSP8): **chưa có, chưa thử**.

---
Claude A : Task A: FSP8-MIC-VOLUME-FIX-01
1. File đã sửa: không sửa code; thêm test FSP8MicVolumeDiag01.verify.js và báo cáo.
2. Vì sao: Menu không có núm/action âm lượng MIC (chưa từng có); nút MIC không ảnh hưởng núm MUSIC/MASTER (đã chứng minh bằng mô phỏng) nên không có lỗi Menu để sửa.
3. Module ảnh hưởng: không.
4. Còn lại: 1 quan sát trên FSP8 sau khi bấm MIC 1 (số External Devices + fader nào nhúc nhích); nếu muốn núm MIC thì cần quyết định thêm núm UI + CC24/25.
