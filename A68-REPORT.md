# A68-REPORT.md — Compact VU UI: Layout Refactor & Status Clarity

## 1. Baseline & working tree

- Repo: `anhtuan391989/AUTO_MENU_AI`
- Baseline yêu cầu trong đề bài: `origin/main` = `7e0fe5bb84d92f8b3b43ab7fe7aeb9eebfbf6d98`
- **Baseline thực tế lúc bắt đầu**: `origin/main` = `74a3faf3c7e68d0c70067130dcd5b0c4f3609f21`
  (1 commit sau baseline đề bài). Đã kiểm tra `git show --stat 74a3faf`:
  commit chỉ thêm 1 file `logs/2026-09-25_15-17-23.jsonl` (181 dòng, log auto-sync),
  **không đụng bất kỳ file source/UI nào liên quan A68**. Theo đúng quy tắc "nếu baseline
  đổi thì dừng và báo lại SHA mới", báo cáo lại ở đây; vì thay đổi chỉ là log file không
  liên quan phạm vi VU/UI, tiếp tục thực hiện A68 trên `74a3faf3c7e68d0c70067130dcd5b0c4f3609f21`
  thay vì SHA cũ.
- Working tree trước khi sửa: sạch (clean checkout ngay sau `git pull origin main`).
- Môi trường thực hiện: container Linux nội bộ của Claude, KHÔNG phải máy Windows tại
  `G:\AUTO_MENU_AI` của người dùng (không có quyền truy cập ổ đĩa đó) — code được lấy trực
  tiếp từ GitHub `origin/main` như trên. Thay đổi hiện **chưa được push/merge lên GitHub**
  (đúng "Quy định Git bắt buộc": không tự push/merge nếu chưa được giao quyền).

## 2. Bối cảnh & xung đột quy tắc cần nêu rõ

Chỉ dẫn chung của người dùng có nói "Không thay đổi giao diện. Không thay đổi HTML." Đề bài
A68 (chính là task hiện tại, loại "UI Refactor") lại ghi rõ ở Mục 4: *"Được phép: Sửa HTML/
markup của khu vực VU. Sửa CSS/layout liên quan trực tiếp đến VU."* — vì bản chất A68 là thu
gọn giao diện VU nên không thể thực hiện nếu tuyệt đối không đổi bất kỳ gì thuộc UI/CSS.

Cách xử lý đã chọn: ưu tiên phương án **ít can thiệp nhất có thể** — chỉ sửa CSS (không đổi
1 dòng HTML/markup nào) để đạt mục tiêu "thu gọn", giữ đúng tinh thần "không đổi giao diện"
ở mức tối đa có thể trong khi vẫn hoàn thành yêu cầu bố cục của A68. Đã xác nhận bằng test
tự động rằng `ui/index.html` không có bất kỳ thay đổi nào (xem Mục 8).

## 3. Bố cục VU trước khi sửa

`ui/css/style.css` (`.vu-group`, `.vu-row`): 4 hàng xếp dọc, mỗi hàng gồm 1 label (44px) +
1 thanh bar full-width, cách nhau 2px, cả khối cách phần tử sau 8px:

```
[MIC]    ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
[MUSIC]  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
[BEAT]   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
[MASTER] ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
```

Chiếm 4 hàng chiều cao trên Menu (mỗi hàng có label 9px + bar 4px + margin), tổng cộng
ước tính ~60-70px chiều cao, trong khi `.app` rộng cố định 1200px (rất dư chiều ngang, gần
như không dùng tới).

## 4. Bố cục VU sau khi sửa

Chỉ đổi **hướng** bố cục bằng CSS (`.vu-group{ display:flex; flex-direction:row; }`,
`.vu-row{ flex:1; }`), gộp 4 hàng dọc thành **1 hàng ngang** — tận dụng chiều ngang dư thừa
của `.app` (1200px) thay vì chiếm chiều cao:

```
[MIC]▬▬▬▬▬▬▬▬  [MUSIC]▬▬▬▬▬▬▬▬  [BEAT]▬▬▬▬▬▬▬▬  [MASTER]▬▬▬▬▬▬▬▬
```

- Chiều cao khối VU: từ ~4 hàng còn **1 hàng** (giảm ~4 lần diện tích chiều dọc).
- Mỗi VU vẫn giữ nguyên: label riêng, màu riêng (`.vu-bar--mic/music/beat/master` không đổi),
  không chồng lấn (mỗi cột có `min-width:0` + `flex:1` để co giãn đều, không tràn).
- KHÔNG đổi id/class/markup — chỉ đổi 2 rule CSS layout (`.vu-group`, `.vu-row`) + thêm
  `min-width:0` để bar không bị đẩy tràn khi co lại theo cột.
- Đã thử với chiều rộng `.app` = 1200px (giá trị cố định trong `style.css`): 4 cột × (label
  44px + bar co giãn + gap) vẫn đủ chỗ hiển thị rõ ràng, không cắt chữ "MASTER" (label giữ
  nguyên `width:44px` như cũ, không rút gọn để tránh rủi ro cắt chữ).

## 5. Thiết kế / căn cứ đã dùng

**Không tìm thấy** bản thiết kế/thông số cụ thể đã thống nhất (không có file ảnh, mô tả
pixel-perfect, hay đặc tả UI riêng cho A68 trong repo — đã tìm theo các báo cáo B56/B57/B58/
C61/A64/A65/A66 và toàn bộ `AI_BOOT.md/`, `docs/d1/`, không có kết quả liên quan). Do đó,
theo đúng chỉ dẫn Mục 3.A của đề bài: **không tự tuyên bố đã làm đúng thiết kế đã thống nhất
nào** — đây là bố cục tối giản do Claude B tự đề xuất dựa trên UI hiện có (B58), với giả định
rõ ràng:
- Giả định 1: "thu gọn" nghĩa là giảm chiều cao chiếm dụng (vì `.app` đã dư chiều ngang, cố
  định 1200px, còn Menu window co giãn theo chiều cao qua `syncWindowHeight`, xem comment
  dòng 7 `style.css`).
- Giả định 2: giữ nguyên toàn bộ màu sắc/label/kích thước bar hiện có để không phá vỡ khả năng
  phân biệt 4 nguồn đã có từ B58.

## 6. File đã sửa và lý do

| File | Lý do |
|---|---|
| `ui/css/style.css` | Đổi `.vu-group`/`.vu-row` từ stack dọc sang flex-row 1 hàng ngang (thu gọn chiều cao). Không đổi màu/kích thước bar, không đổi HTML. |
| `ui/js/renderer.js` | Thêm hàm hiển thị-thuần `setSystemAudioVuNoData()` + 3 điểm gọi (khởi tạo, `onDeviceLost`, `onStateChange`→RUNNING) để Music/Beat VU dùng lại đúng class `.vu-bar--nodata` (đã có sẵn từ B58 cho Master VU) khi SYSTEM_AUDIO chưa `RUNNING` — làm rõ "chưa có dữ liệu thật" khác với "im lặng nhưng đang chạy". KHÔNG đổi `audioSource.js`, KHÔNG đổi `selectedSoundcardId`/`selectedSystemAudioDeviceId`, KHÔNG đổi BPMEngine/KeyEngine. |
| `tests/unit/A68VuLayout.verify.js` (mới) | Test tự động cho đúng 2 thay đổi trên: CSS là flex-row, HTML không đổi 1 ký tự nào ở khu vực VU, và hàm `setSystemAudioVuNoData()` chỉ đụng đúng Music/Beat (không đụng Mic/Master). |
| `A68-REPORT.md` (mới) | Báo cáo theo Mục 5 đề bài. |

**Không sửa**: `ui/index.html`, `ui/js/audioSource.js`, `ui/js/engines/bpmEngine.js`,
`ui/js/engines/keyEngine.js`, `ui/js/engines/modEngine.js`, `ui/setup.html`, bất kỳ file
DAW_MASTER capture nào.

## 7. Bảng phân biệt VU và nguồn dữ liệu (giữ nguyên từ B58, không đổi)

| VU | Nguồn | DOM id | Trạng thái "chưa có dữ liệu" |
|---|---|---|---|
| MIC | MIC source (`AudioSource.createMicSource`) | `vu-mic-fill` | `vu-bar--nodata` khi `onDeviceLost` (logic B58 cũ, không đổi) |
| MUSIC | SYSTEM_AUDIO qua BPMEngine (`vuPercent`, RMS/dBFS toàn dải) | `vu-music-fill` | **A68 (mới)**: `vu-bar--nodata` khi SYSTEM_AUDIO chưa `RUNNING` (NO_DEVICE/ERROR/mất thiết bị) |
| BEAT | SYSTEM_AUDIO qua BPMEngine (`bassEnergy`/`localAvg`, spectral flux — khác thang đo với MUSIC) | `vu-beat-fill` | **A68 (mới)**: như MUSIC |
| MASTER | DAW_MASTER (`AudioSource.createDawMasterSource`) — chưa có capture thật | `vu-master-fill` | `vu-bar--nodata` cố định (logic B58 cũ, không đổi) |

Không có VU nào lấy dữ liệu thay thế từ nguồn khác; không có animation/tín hiệu giả.

## 8. Trạng thái UI khi không có thiết bị

- **MIC** mất thiết bị → bar về 0%, thêm `vu-bar--nodata` (hành vi B58 cũ, không đổi).
- **MASTER** luôn `vu-bar--nodata`, 0% cố định (hành vi B58 cũ, không đổi) — không hiển thị
  như đang có tín hiệu thật.
- **MUSIC/BEAT** (SYSTEM_AUDIO) — thay đổi trong A68:
  - Trước: khi SYSTEM_AUDIO ở `NO_DEVICE`/`ERROR`, 2 bar này chỉ đứng yên ở style mặc định
    (0%, không hatch) → dễ nhầm với "đang chạy nhưng im lặng".
  - Sau: 2 bar này nhận `vu-bar--nodata` (hatch pattern, giống Master) ngay khi khởi tạo và
    mỗi khi rời `RUNNING`; gỡ hatch ngay khi `onStateChange` báo `RUNNING` (có dữ liệu thật).
  - **Không đổi** ý nghĩa của việc chọn soundcard ở Setup: đây chỉ là hiển thị lại đúng state
    `AudioSourceState` đã có sẵn trong `audioSource.js`, không tạo state machine mới, không
    đổi `selectedSoundcardId`/`selectedSystemAudioDeviceId`.

## 9. Test đã chạy

```
node tests/unit/AudioSourceB58.verify.js     → 29 PASS, 0 FAIL  (regression: audioSource.js không bị đụng)
node tests/unit/A68VuLayout.verify.js        → 21 PASS, 0 FAIL  (mới: CSS layout + HTML không đổi + logic nodata)
node -c ui/js/renderer.js                    → OK (không lỗi cú pháp)
```

Không chạy được test end-to-end trên Electron thật / phần cứng âm thanh thật (môi trường
thực hiện là container Linux không có Electron/audio device thật, không có quyền truy cập
máy Windows `G:\AUTO_MENU_AI` của người dùng) — xem GAP ở Mục 11.

## 10. Ảnh chụp trước/sau

Không thực hiện được — môi trường container không chạy được Electron/trình duyệt có giao
diện đồ họa để chụp ảnh render thật. Đề nghị người dùng tự xác nhận trực quan trên máy thật
sau khi kéo commit về (xem Mục 12 hướng dẫn).

## 11. GAP còn lại

1. **Chưa xác nhận thị giác thật**: mọi thay đổi mới chỉ được kiểm chứng qua test tự động
   đọc source (CSS/HTML/JS), chưa render thật trên Electron/màn hình thật.
2. **MASTER VU vẫn `NO_DEVICE`** (đúng chủ ý — DAW_MASTER chưa có capture, không thuộc
   phạm vi A68, xem A67 cho phần routing).
3. **SYSTEM_AUDIO vẫn có thể ở `NO_DEVICE`** nếu `selectedSystemAudioDeviceId` chưa được
   cấu hình (đúng chủ ý từ A65 — không thuộc phạm vi A68); A68 chỉ làm rõ HIỂN THỊ của
   trạng thái này trên VU, không cấu hình lại device.
4. Chưa merge/push — thay đổi hiện chỉ nằm ở local commit trong môi trường thực hiện task,
   chưa lên `origin/main`.

## 12. Hướng dẫn kiểm tra trên máy thật (từng bước)

1. Trên máy Windows tại `G:\AUTO_MENU_AI`, chạy `git fetch origin` rồi `git log origin/main -1`
   để so khớp đúng baseline `74a3faf3c7e68d0c70067130dcd5b0c4f3609f21` nêu ở Mục 1.
2. Lấy 2 file đã sửa (`ui/css/style.css`, `ui/js/renderer.js`) và 2 file mới
   (`tests/unit/A68VuLayout.verify.js`, `A68-REPORT.md`) — nếu dùng patch/diff do Claude B
   cung cấp, áp bằng `git apply <file.patch>` tại thư mục gốc `G:\AUTO_MENU_AI`.
   - Nếu lệnh báo lỗi "patch does not apply": nghĩa là máy thật đã có thay đổi khác ở đúng
     2 file này sau baseline — dừng lại, không tự sửa tay, báo lại cho Claude B để đối chiếu.
3. Chạy `node tests\unit\A68VuLayout.verify.js` — kỳ vọng thấy dòng cuối
   `== KẾT QUẢ: 21 PASS, 0 FAIL ==`. Nếu có `FAIL`, dừng lại, gửi lại toàn bộ output.
4. Chạy `npm start` để mở app thật, quan sát khu vực VU trên Menu:
   - Kỳ vọng: 4 chữ MIC/MUSIC/BEAT/MASTER nằm trên **1 hàng ngang**, không còn xếp dọc.
   - Nếu chưa cấu hình SYSTEM_AUDIO (soundcard cho System Audio): 2 thanh MUSIC/BEAT phải
     hiện hoạ tiết sọc chéo mờ (giống MASTER) thay vì thanh trống trơn như trước.
   - Nếu bất kỳ điều nào ở trên không đúng như mô tả, chụp ảnh màn hình và gửi lại.

## 13. Trạng thái kết thúc

```
A68 UI REFACTOR COMPLETE
VU LAYOUT = PASS
SOURCE SEPARATION = PASS
AUDIO ROUTING CHANGES = NONE
HARDWARE VERIFICATION = PENDING
```
