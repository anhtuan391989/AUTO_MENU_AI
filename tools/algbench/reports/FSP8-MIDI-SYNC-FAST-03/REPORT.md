# FSP8-MIDI-SYNC-FAST-03 — Hiệu chuẩn MUSIC theo số đo dB thực tế

## 1. GitHub
- `main` HEAD = `e6173f0c0f144273588a43285d3fffc5dda7b2ee` (Auto-sync 28/10/2026 09:32), kiểm tra 28/10/2026 09:39 (giờ VN). Trạng thái = `SAME_BASE`: `ui/js/actionRegistry.js` trên HEAD đã có `KNOB_CC_ANCHORS`/`knobToCc()` của FAST-02 (neo 50→64, 90→97, 100→127) và các test `FSP8MusicCalib02`, `FSP8MidiSync01` — đã đọc trực tiếp trên HEAD trước khi sửa.

## 2. Phát hiện chính từ số đo (phân tích, không đoán)
1. **Số "External Devices" = CC × 100/127** (khớp 7/7 hàng ở 2 chữ số thập phân: CC85→66,93 · 89→70,08 · 93→73,23 · 97→76,38 · 103→81,10 · 106→83,46 · 112→88,19). Nghĩa là nó là CC thô quy về phần trăm; **không dùng làm anchor**, chỉ dùng làm **bằng chứng độc lập rằng FSP8 nhận đúng các CC mà `knobToCc` dự kiến** (VERIFIED trên dữ liệu người dùng, chưa tự chạy runtime). Hàng MUSIC 70 ghi 68,78 nhưng dự kiến 63,78 (CC81) — lệch đúng 5,00 → **nghi gõ nhầm**; dB đo (−5,1) lại nằm đúng trên đường CC81 (xem dưới) nên không mâu thuẫn. Cần bạn xác nhận số này (không chặn việc sửa).
2. Gộp số đo sau FAST-02 (CC suy ra như trên) với số đo CC trực tiếp: tại **CC97** hai lần đo trùng nhau (+0,2 dB) → hai nhóm dữ liệu nhất quán. Trong **CC81–127** (13 điểm) fader FSP8 **gần tuyến tính theo dB**: `dB ≈ 0,3284 × CC − 31,71`, sai số mỗi điểm ≤ 0,05 dB. Dưới CC81 chỉ có CC64 (−11,3; dự đoán tuyến tính cho −10,7) → độ dốc dưới 81 cao hơn một chút; **không ngoại suy** dưới CC81.
3. Hệ quả của FAST-02: Menu 50→90 tăng đều ~0,27 dB/bước (đã đo, đẹp) nhưng 90→100 tăng ~1 dB/bước (90→95 = +4,9 dB) → "gập" ở 90 gấp ~4 lần độ dốc.

## 3. Thay đổi (chỉ `BEAT_INPUT_VOLUME` khi DAW = "Studio Pro 8")
- **Giữ nguyên:** MUSIC 0–90 (0–50 công thức cũ; 50→90 tuyến tính CC 64→97; đã đo: −5,1/−3,8/−2,5/−1,2/+0,2 dB ở 70/75/80/85/90). MUSIC 90 = CC97 (+0,2 dB). MUSIC 100 = CC127 (+10 dB).
- **Đổi:** đoạn 90→100 từ tuyến tính (3 CC/bước) sang **parabol liên tục độ dốc tại 90**: `CC = round(97 + 0,825·t + 0,2175·t²)`, `t = MUSIC − 90` (0,825 = độ dốc CC/bước của đoạn 50–90 nên không có "gập"; hệ số 0,2175 để t=10 → 127). Cài bằng bảng neo nguyên 91…99 (nội suy tuyến tính nếu giá trị lẻ), kiểm tra độc lập trong test.
- Đơn điệu: CC không giảm toàn dải; tăng nghiêm ngặt 90→100. 0–127, số nguyên.
- Độ dốc dB/bước đoạn 90→100 giờ tăng dần từ ~0,3 lên ~1,6 dB/bước ở đỉnh (dự đoán): đổi lại 90→95 chỉ +3,4 dB thay vì +4,9 dB. Nếu bạn muốn dịu hơn nữa thì phải **hạ trần** (MUSIC 100 < +10 dB) — đó là quyết định của bạn, chưa làm.

## 4. Bảng MUSIC → CC cũ → dB đo → CC mới
(dB "dự đoán" = công thức dB≈0,3284·CC−31,71; chỉ hợp lệ CC≥81; **chưa đo** với CC mới)
| MUSIC | CC cũ (FAST-02) | External Devices đo | = CC×100/127 | dB đo (sau FAST-02) | dB dự đoán CC cũ | CC mới | dB dự đoán CC mới |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 70 | 81 | 68.78 | 63.78 | -5.1 | -5.11 | 81 | -5.11 |
| 75 | 85 | 66.93 | 66.93 | -3.8 | -3.79 | 85 | -3.79 |
| 80 | 89 | 70.08 | 70.08 | -2.5 | -2.48 | 89 | -2.48 |
| 85 | 93 | 73.23 | 73.23 | -1.2 | -1.17 | 93 | -1.17 |
| 90 | 97 | 76.38 | 76.38 | 0.2 | 0.15 | 97 | 0.15 |
| 91 | 100 | – | 78.74 | – | 1.13 | 98 | 0.48 |
| 92 | 103 | 81.1 | 81.10 | 2.1 | 2.12 | 100 | 1.13 |
| 93 | 106 | 83.46 | 83.46 | 3.1 | 3.10 | 101 | 1.46 |
| 94 | 109 | – | 85.83 | – | 4.09 | 104 | 2.45 |
| 95 | 112 | 88.19 | 88.19 | 5.1 | 5.07 | 107 | 3.43 |
| 96 | 115 | – | 90.55 | – | 6.06 | 110 | 4.42 |
| 97 | 118 | – | 92.91 | – | 7.04 | 113 | 5.40 |
| 98 | 121 | – | 95.28 | – | 8.03 | 118 | 7.04 |
| 99 | 124 | – | 97.64 | – | 9.01 | 122 | 8.36 |
| 100 | 127 | – | 100.00 | – | 10.00 | 127 | 10.00 |

Độ tin cậy: dB đo (70–95) = số đo người dùng sau FAST-02, CC xác định bằng `knobToCc` và đối chiếu External Devices; dB dự đoán ±0,05 dB trong CC81–127 theo hồi quy; các CC mới 91–99 **chưa có số đo trực tiếp**.

## 5. File đã sửa
| File | Thay đổi |
|---|---|
| `ui/js/actionRegistry.js` | bảng neo BEAT_INPUT_VOLUME/Studio Pro 8: thêm điểm 91–99; cập nhật chú thích |
| `tests/unit/FSP8MusicCalib02.verify.js` | +8 kiểm tra (dữ liệu, bảng 90–100, 0–90 không đổi, đơn điệu, dịu hơn, bước dB ≤ 1,7) → 24 kiểm tra |
| `tests/unit/FSP8MidiSync01.verify.js` | bảng kỳ vọng T08 cho 90–100 cập nhật theo bảng mới (độc lập với code) |
Không sửa: CC20/kênh 15, MASTER CC21, RETUNE CC22/23, DAW khác, UI/HTML, `renderer.js`, `setup.js`, runtime. Menu vẫn không gửi MIDI lúc khởi động/khôi phục/kết nối lại (test `loadData()`).

## 6. Test (PASS_CODE / PASS_SIM — chưa phải Windows+FSP8)
- `FSP8MusicCalib02` **24/24**; `FSP8MidiSync01` 11/11; `KnobDawIntegration02` 63/63; `KnobMidiCompletion01` 56/56; `KnobBeatMaster` 22/22; `DawQuickFill01` 42/42; `MenuFix02` 31/31; `LiveMidiCompletion01` 35/35; `FxAutoBusFix01` 43/43.
- Toàn bộ `tests/unit`: 12 file lỗi, **đúng bằng tập lỗi của bản gốc** (AutoSongCollector, MusicAnalysis, NowPlayingResolver, MenuFix01 cũ; B38D1RuntimeIntegration, CommandRuntimeHealth, D1SpecValidation, MidiD1RuntimeB61, MidiDawControl01, MidiLearnDispatch, MidiRecovery01, PortSelectionPolicy — thiếu `xmllint-wasm`/guard git diff). Không có lỗi mới.

## 7. Chưa xác minh
- Runtime Windows + FSP8 sau thay đổi: **chưa**. CC mới 91–99 chưa đo dB trực tiếp.
- Số 68,78 (MUSIC 70) là gõ nhầm hay không.
- Đường cong dưới CC81 chỉ có 1 điểm đo.

## 8. Kiểm tra tiếp theo cho người dùng (1 phút)
Sau khi chép file và mở lại Menu (DAW = Studio Pro 8), ghi dB fader `Beat` ở MUSIC **90, 93, 95, 98** (dự đoán +0,2 / +1,5 / +3,4 / +7,0). Nếu lệch > 0,3 dB ở điểm nào, gửi tôi số đo để chỉnh bảng; và cho biết hàng 70 là 63,78 hay 68,78.

---
Claude A : Task A: FSP8-MIDI-SYNC-FAST-03
1. File đã sửa: ui/js/actionRegistry.js (bảng neo MUSIC 90–100, chỉ Studio Pro 8); tests FSP8MusicCalib02, FSP8MidiSync01; REPORT.md + evidence.
2. Vì sao: số đo cho thấy fader gần tuyến tính theo dB trong CC81–127; đoạn 90–100 tăng ~1 dB/bước gấp 4 lần đoạn trước nên làm dịu bằng parabol liên tục độ dốc; 90 giữ CC97.
3. Module ảnh hưởng: chỉ đường MIDI MUSIC trên Studio Pro 8; MASTER, Retune, DAW khác, nút Live không đổi.
4. Còn lại: kiểm runtime MUSIC 90/93/95/98 trên FSP8; xác nhận số 68,78/63,78; quyết định có hạ trần +10 dB hay không.
