# B71-REPORT.md — SETUP AUDIO DEVICE CONFIGURATION FIX

## A. Baseline
- origin/main SHA: `28b8a0a02b924581ce16302030a9ee9cb7908c41` (kiểm bằng `git fetch origin`
  đầu task — không đổi so với lúc làm B70).
- HEAD (lúc làm việc): làm tiếp trên local commit B70 (`175b6f1b6c93284ae1d5c4901c840dfeb74ac2b8`,
  chưa push) — B71 sửa đúng những gì B70 vừa phát hiện, không thể tách rời khỏi B70.
- Working tree: sạch khi bắt đầu; kết thúc có 5 file sửa + 2 file mới (xem Mục G).

## B. Setup UI

- **MIC Input**: thêm 1 `panel-card` MỚI trong `ui/setup.html`, ĐỘC LẬP với card "Audio
  Interface" cũ (không xoá/không đổi card cũ). `<select id="micInputSelect">` + nút
  `btnSelectMicInput`, ghi key `selectedMicDeviceId`.
- **SYSTEM_AUDIO Input**: 1 `panel-card` MỚI khác, `<select id="systemAudioInputSelect">` +
  nút `btnSelectSystemAudioInput`, ghi key `selectedSystemAudioDeviceId`.
- **Device list**: cả 2 dùng chung 1 hàm liệt kê MỚI `populateDeviceSelectB71()` trong
  `setup.js` (viết riêng, KHÔNG sửa `populateSoundcardOptions()` cũ) — lọc
  `enumerateDevices()` theo `kind === "audioinput"`, giống hệt cách card cũ đã làm (không đổi
  cách liệt kê thiết bị, chỉ đổi nơi nó ghi vào).
- **None behavior**: option đầu tiên của mỗi dropdown LUÔN là 1 lựa chọn "None" tường minh
  (`value=""`) — khác dropdown cũ (nơi rỗng nghĩa là "quên chưa chọn"). Bấm "Chọn" với giá trị
  rỗng vẫn lưu bình thường (không bắt buộc phải chọn 1 thiết bị cụ thể như dropdown cũ).

## C. Persistence

- **`selectedMicDeviceId`**: lưu qua `saveSetting("selectedMicDeviceId", select.value || "")`
  → cùng cơ chế file JSON atomic đã có sẵn (`app/main.js` → `writeSettingsFile()`), y hệt mọi
  setting khác trong app — không cần thêm cơ chế persistence mới.
- **`selectedSystemAudioDeviceId`**: tương tự, `saveSetting("selectedSystemAudioDeviceId", ...)`.
- **Restore behavior**: cả 2 key đã được thêm vào `DEFAULT_APP_SETTINGS` (`appSettings.js`) với
  giá trị mặc định `""` — khi mở lại Setup, `initMicInputSection()`/`initSystemAudioInputSection()`
  đọc `getSetting(...)` và tự chọn đúng option đã lưu trong dropdown (test bằng
  `SoundcardSetupPersistence.verify.js` — vẫn PASS, xem Mục F).
- **Missing device behavior**: nếu deviceId đã lưu không còn trong `enumerateDevices()` hiện
  tại, `populateDeviceSelectB71()` **không tự xoá setting**, chỉ thêm 1 option fallback
  "(Đã lưu trước đó, hiện không thấy) ..." + đổi badge thành "⚠ ... không còn khả dụng" — cùng
  triết lý với card "Audio Interface" cũ (không tự ý đổi cấu hình thiết bị thực tế).

## D. AudioSource Integration

- **MIC source**: `createMicSource()`/`getMicDeviceId()` trong `audioSource.js` **KHÔNG cần sửa
  gì** — hàm này đã đọc đúng `selectedMicDeviceId` từ trước (B70 phát hiện: đúng key, chỉ thiếu
  UI ghi vào). B71 chỉ **export thêm** `AudioSource.getMicDeviceId` (trước đó là hàm nội bộ,
  không lộ ra ngoài) để `renderer.js` dùng cho việc phát hiện đổi thiết bị.
- **SYSTEM_AUDIO source**: `createSystemAudioSource()`/`getSystemAudioDeviceId()` **không đổi
  gì** — đã đúng từ A65, chỉ thiếu UI (nay đã có).
- **Reconnect behavior**: TÁI SỬ DỤNG NGUYÊN cơ chế C62 đã có cho SYSTEM_AUDIO (lắng nghe
  `window.electronAPI.onSetupChanged`, so sánh deviceId cũ/mới, gọi `.stop()` rồi `.start()`
  lại — KHÔNG tạo object AudioSource mới, vì `start()` luôn gọi lại `resolveDeviceId()` từ đầu,
  tự động lấy giá trị mới). Đã THÊM một nhánh y hệt cho MIC (`__lastKnownMicDeviceId`,
  `__micSource.stop()`/`.start()`) — không viết cơ chế reconnect mới, chỉ nhân bản pattern đã
  được kiểm chứng (`AudioReconnectC62.verify.js`).
- **BPMEngine / KeyEngine binding**: **KHÔNG đổi gì** — `bindAiEnginesToSystemAudio()` vẫn chỉ
  nhận `systemAudio` (không hề tham chiếu `__micSource` ở bất kỳ đâu trong thân hàm, xác nhận
  bằng test). `bpmEngine.js`/`keyEngine.js`/`modEngine.js` không nằm trong diff (xem Mục G).

## E. Menu Status

- **MIC status (dot-audio, card "AUDIO INTERFACE")**: **THAY ĐỔI CHÍNH** — `checkAllSystems()`
  trong `renderer.js` trước đây chỉ đọc `getSetting("selectedSoundcard")` (chuỗi tên, không xác
  minh gì). Nay đọc `__micSource.getState()` (AudioSourceState thật của MIC): `RUNNING` → chấm
  xanh (`online`), `STARTING` → cam (`pending`), còn lại (`NO_DEVICE`/`ERROR`/chưa khởi tạo) →
  đỏ (`offline`). Vì `__micSource` chỉ được tạo sau cú click đầu tiên của người dùng (chính
  sách autoplay của Chromium), đã thêm `__micSource.onStateChange(() => checkAllSystems())` để
  chấm cập nhật NGAY khi MIC thật sự đổi trạng thái, không chỉ 1 lần lúc `DOMContentLoaded`.
- **SYSTEM_AUDIO status**: giữ nguyên `dot-bpm` (đã tách biệt từ B58/A65 — `pending` khi đang
  nghe, `online` khi BPM đã khoá ổn định, `offline` khi `NO_DEVICE`/`ERROR`) — **không gộp**
  với MIC, đúng yêu cầu "Trạng thái SYSTEM_AUDIO phải được thể hiện riêng với MIC".
- **Signal presence status**: `dot-bpm` = `online` CHỈ khi BPM đã khoá (đủ phiếu đồng thuận) —
  tức đã phân biệt "đã mở thiết bị" (pending, có luồng audio nhưng chưa khoá BPM) với "đang có
  tín hiệu hợp lệ" (online, đã khoá BPM). Cơ chế này có sẵn từ trước, B71 không đổi.
- **Audio Interface status (text "Chưa chọn ... (Setup)")**: đổi chữ hiển thị từ **"Chưa chọn
  Soundcard (Setup)"** → **"Chưa chọn SYSTEM_AUDIO (Setup)"** khi `NO_DEVICE`, và thêm text
  RIÊNG **"Lỗi thiết bị SYSTEM_AUDIO"** khi `ERROR` (trước B71, `ERROR` không có text nào, chỉ
  giữ nguyên "-- BPM"). Việc đổi "Soundcard" → "SYSTEM_AUDIO" xử lý đúng gốc rễ nghịch lý mà
  B70 tìm ra: chữ "Soundcard" trùng tên với card "Audio Interface" (dropdown cũ ghi tiêu đề
  "Chọn Soundcard...") khiến người dùng tưởng 2 thứ liên quan nhau dù đọc 2 setting khác hẳn.
  **Không dùng tên "Audio Interface" để ngụ ý BPM đang chạy** — đã xác nhận đúng yêu cầu.

## F. Tests

Test commands đã chạy:

```
node tests/unit/B71SetupDeviceFix.verify.js         → 42 PASS, 0 FAIL  (MỚI — toàn bộ checklist B71)
node tests/unit/B70SetupDeviceAudit.verify.js       → 18 PASS, 0 FAIL  (cập nhật 3 assertion đã lỗi thời sau khi B71 sửa xong 2/3 finding)
node tests/unit/SoundcardSetupPersistence.verify.js → 20 PASS, 0 FAIL
node tests/unit/AudioSourceB58.verify.js            → 29 PASS, 0 FAIL
node tests/unit/AudioReconnectC62.verify.js         → 33 PASS, 0 FAIL
node tests/unit/A69VuConsolidation.verify.js        → 35 PASS, 0 FAIL
node -c ui/js/setup.js / renderer.js / audioSource.js / appSettings.js → OK, không lỗi cú pháp
```

**Regression sweep toàn bộ `tests/unit/*.js` (68 file)**:

```
58/68 PASS.
```

10 file FAIL còn lại — **cùng danh sách, cùng nguyên nhân đã xác nhận ở B70/A69, không phát
sinh gì mới do B71**:

| File FAIL | Nguyên nhân |
|---|---|
| `B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `PortSelectionPolicy` | `Cannot find module 'xmllint-wasm'` — container chưa `npm install` |
| `MidiLearnDispatch` | `Cannot find module 'easymidi'` — cùng lý do |
| `AiSystemBoundaryA56` | 1 assertion về audit khoá A52/A53, không liên quan Setup/Device — đã xác nhận fail sẵn từ baseline A68/A69/B70 |
| `MenuMinimizeRuntime` | Về IPC minimize-window, không liên quan Setup/Device — đã xác nhận fail sẵn từ baseline |
| `AutoSongCollector`, `NowPlayingResolver` | Self-check nội bộ "`git status` không có file cũ nào bị sửa" — luôn fail khi có bất kỳ file nào khác trong repo bị sửa cùng lúc (đã giải thích ở A69/B70-REPORT.md); mọi assertion CHỨC NĂNG khác của 2 file này đều PASS |

**Hardware verification: CHƯA làm.** Toàn bộ Mục B–E ở trên là kết luận từ đọc source + test
tự động (giả lập `navigator.mediaDevices`/sandbox `vm`), **KHÔNG chạy trên Electron thật với
thiết bị âm thanh vật lý** (môi trường container không có Electron/audio device thật). B71
**KHÔNG chứng minh** SYSTEM_AUDIO nhận được nhạc sạch hay BPM nhận diện đúng nhạc thật — đúng
lưu ý cuối đề bài B71, việc đó cần kiểm chứng riêng trên máy thật.

## G. Changes

| File | Lý do |
|---|---|
| `ui/setup.html` | Thêm 2 panel-card mới "MIC Input"/"SYSTEM_AUDIO Input" (Mục 2.A đề bài B71). Card "Audio Interface" cũ giữ nguyên 100%. |
| `ui/js/setup.js` | Thêm `populateDeviceSelectB71()`, `initMicInputSection()`, `initSystemAudioInputSection()`, gọi trong luồng khởi tạo. Không sửa `populateSoundcardOptions()`/`initSoundcardSection()` cũ. |
| `ui/js/audioSource.js` | Export thêm `AudioSource.getMicDeviceId` (hàm nội bộ có sẵn từ B58, chỉ lộ ra cho renderer.js dùng). Cập nhật 2 khối comment đã lỗi thời (không đổi logic). |
| `ui/js/appSettings.js` | Thêm `selectedMicDeviceId: ""` vào `DEFAULT_APP_SETTINGS` (trước đó thiếu, dù `audioSource.js` đã đọc key này từ B58). Cập nhật comment `selectedSystemAudioDeviceId`. |
| `ui/js/renderer.js` | (1) `__lastKnownMicDeviceId` + nhánh reconnect MIC trong `onSetupChanged` (nhân bản pattern C62). (2) `checkAllSystems()`: dot-audio đọc `__micSource.getState()` thật thay vì `selectedSoundcard`. (3) `__micSource.onStateChange(() => checkAllSystems())` để cập nhật realtime. (4) Text `bpmValue`: "Chưa chọn SYSTEM_AUDIO (Setup)" (đổi từ "Soundcard") + thêm text riêng cho `ERROR`. |
| `tests/unit/B71SetupDeviceFix.verify.js` (mới) | 42 PASS — test đầy đủ checklist B71. |
| `tests/unit/B70SetupDeviceAudit.verify.js` | Cập nhật 3 assertion đã lỗi thời (Finding 1 + 1/2 của Finding 3 nay đã đúng sau khi sửa) — 18 PASS. |
| `B71-REPORT.md` (mới) | Báo cáo này. |

**Không sửa**: `ui/js/engines/bpmEngine.js`, `ui/js/engines/keyEngine.js`,
`ui/js/engines/modEngine.js`, `ui/index.html`, `app/main.js` — xác nhận bằng
`git diff --name-only`. Không đổi `selectedSoundcardId`/`selectedSoundcard` (card "Audio
Interface" cũ) — key và hành vi giữ nguyên 100%, đúng "Xử lý selectedSoundcardId" ở Mục 2.A đề
bài (không tự chuyển dữ liệu cũ sang MIC/SYSTEM_AUDIO). Không triển khai chọn thiết bị đầu ra
(đúng Mục E đề bài "Không triển khai lựa chọn thiết bị đầu ra trong B71").

**Commit**: local, chưa push — hash ở cuối phần tóm tắt gửi kèm chat.
**Push / merge status**: CHƯA — theo đúng quy định Git bắt buộc, chờ được giao quyền.

## H. Conclusion

- **PASS / PARTIAL / FAIL**: **PASS** ở mức code-level — cả 10 mục checklist đề bài đều có
  bằng chứng qua test tự động (Mục F), không có test nào biết-là-fail bị bỏ sót, không đụng
  BPM/Key/Mod, không tạo VU/BPM giả, không tự bật Mix 02/03/04, không đổi routing ASIO Link
  Pro. **PARTIAL** ở mức toàn diện vì **hardware verification còn PENDING** (đúng bản chất của
  loại thay đổi này — không thể xác nhận bằng code đơn thuần).
- **Remaining blockers**:
  1. Chưa xác nhận trên máy thật: dropdown MIC Input/SYSTEM_AUDIO Input có hiển thị đúng tên
     thiết bị thật (label từ `enumerateDevices()`) hay không — phụ thuộc quyền truy cập mic của
     OS thật.
  2. Chưa xác nhận SYSTEM_AUDIO chọn đúng 1 kênh Mix loopback (nếu có) có thực sự mang tín hiệu
     nhạc sạch — B71 chỉ đảm bảo "chọn được và kết nối đúng", không đảm bảo "nhạc nhận được có
     sạch hay không" (đúng lưu ý cuối đề bài).
  3. Thiết bị đầu ra (output) vẫn chưa có — ngoài phạm vi B71, cần task riêng.
  4. `selectedSoundcardId` (card "Audio Interface" cũ) vẫn còn tồn tại song song, ý nghĩa chính
     xác của nó (dùng để làm gì ngoài hiển thị tên + chạy VU test nội bộ trong Setup) chưa được
     làm rõ dứt điểm — task B71 cố tình không động vào theo đúng chỉ dẫn đề bài.
- **Recommended next task**: 1 task kiểm chứng phần cứng thật trên máy Windows tại
  `G:\AUTO_MENU_AI` (chọn MIC Input + SYSTEM_AUDIO Input thật, xác nhận VU/BPM phản ứng đúng,
  xác nhận reconnect khi đổi thiết bị lúc Menu đang chạy) — B71 không thể tự làm bước này.
