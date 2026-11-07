# B72-REPORT.md — Hoàn thiện Setup Audio + Audio Output + SYSTEM_AUDIO + MASTER Routing

> Báo cáo này **thay thế** các bản B72-REPORT.md / B72.1-REPORT.md trước đó, theo đúng yêu cầu
> "một báo cáo B72 duy nhất" của đề bài gộp mới nhất. Các báo cáo cũ (A68–B72 trước) vẫn giữ
> nguyên trong lịch sử git để tham khảo, không xoá.

## Baseline

- **Branch**: `main`.
- **origin/main lúc bắt đầu phiên này**: `4dc17cd459829dbc38ca4a8b04529295ca21e3fb`.
- **origin/main SAU KHI `git fetch` lại giữa chừng phiên làm việc**: `9e064a20cc3fc385527ac9d2b0b3e124c0b15b7a`
  — **phát hiện quan trọng**: giữa lúc tôi đang làm, một agent khác (Claude A, task **A72 — AI
  Lifecycle**) đã push thêm 1 commit sửa `ui/js/renderer.js` + `ui/js/engines/bpmEngine.js` +
  `tests/unit/AiSystemBoundaryA56.verify.js` + thêm `tests/unit/A72AiLifecycle.verify.js`. Tôi
  đã **dừng lại, không tự ý push đè**, `git stash` toàn bộ việc đang làm dở, đối chiếu kỹ commit
  mới (đọc diff, không đoán), rồi **merge tay** (`git stash pop`, giải 6 xung đột trong
  `ui/js/renderer.js` từng đoạn một) thay vì `git reset` bỏ 1 trong 2 bên.
- **HEAD lúc viết báo cáo này**: bằng `origin/main` (`9e064a2`) + toàn bộ thay đổi B72 đã
  `git add -A`, sẵn sàng commit (xem "Git status" cuối báo cáo) — **CHƯA commit tại thời điểm
  viết**, sẽ commit ngay sau khi hoàn tất báo cáo.
- **Working tree**: có staged changes (10 file, xem mục "Files changed").

### Thay đổi đầu vào (đã tồn tại TRƯỚC khi tôi bắt đầu sửa gì trong phiên này)

Đối chiếu `9e064a2` với baseline B72 trước đó (`a5af38d`), các thay đổi **không phải do tôi**:

| File | Ai/Task | Nội dung |
|---|---|---|
| `ui/js/renderer.js` | A71 (áp lại B71-patch.patch đã gửi trước) + A72 | Khôi phục cơ chế MIC reconnect/dot-audio của B71 (bị revert ở 1 commit auto-sync trước đó — xem B72-REPORT cũ), thêm `resetAiDisplaysToListening()` dùng chung, thêm `BPMEngine.stop()`/`KeyEngine.stop()` khi mất SYSTEM_AUDIO |
| `ui/js/engines/bpmEngine.js` | A72-04 | Sửa lỗi lệch -1 BPM hệ thống (thứ tự duyệt ứng viên khi hoà phiếu bầu) |
| `tests/unit/AiSystemBoundaryA56.verify.js` | A72-01 | Nới đúng 1 dòng regex cho phép (lỗi có sẵn từ baseline B70/B71, không phải do A72) |
| `tests/unit/A72AiLifecycle.verify.js` | A72 (mới) | Test cho các mục trên — 34 PASS |
| `ui/setup.html` + `ui/js/setup.js` | A71 | Thêm card "SYSTEM_AUDIO Input" (`systemAudioSelect`) theo mẫu 2-badge (đã chọn / đang chạy thật qua IPC) — **kiến trúc KHÁC** với card "MIC Input"/"SYSTEM_AUDIO Input" tôi từng thêm ở B71 trước đó (tên phần tử khác: `systemAudioSelect` thay vì `systemAudioInputSelect`) |
| `app/main.js` + `app/preload.js` | A71 | IPC `system-audio-state-changed` / `get-system-audio-state` (Menu báo cáo trạng thái thật, cache ở main, relay sang cửa sổ Setup) |

**Phát hiện thêm 1 lỗi hồi quy trong chính `9e064a2`** (không phải do tôi, xảy ra trước khi tôi
chạm vào file): listener `systemAudio.onStateChange((state) => { window.electronAPI?.reportSystemAudioState?.({state}); })`
mà A71 thêm đã **biến mất** trong bản A72 (kiểm tra trực tiếp `git show origin/main:ui/js/renderer.js`
— không còn dòng `reportSystemAudioState` nào), nhiều khả năng thất lạc khi A72 thêm đoạn
`BPMEngine.stop()`/`KeyEngine.stop()` vào `onDeviceLost`. Hậu quả: badge "trạng thái chạy thật"
của SYSTEM_AUDIO trong Setup bị đứng hình ở giá trị cache cuối, không cập nhật theo thời gian
thực. **Đã khôi phục lại** (xem "Implementation" bên dưới) — đúng nguyên bản A71, không đổi gì
khác, không đụng listener mà `AiSystemBoundaryA56.verify.js` đang audit.

## Audit — Bản đồ kiến trúc âm thanh (thực tế xác nhận, không phải suy đoán)

```
Setup
 ├── Audio Interface (cũ, selectedSoundcardId) ─── GIỮ NGUYÊN, không đổi ý nghĩa
 │      └── chỉ dùng cho: (1) hiển thị tên trên #soundcardName, (2) VU test nội bộ
 │          Setup (setupVuMeter.js) — KHÔNG cấp thiết bị cho bất kỳ AudioSource nào của Menu
 │
 ├── MIC Input (micSelect, B71/B72) ──► selectedMicDeviceId ──► AudioSource.createMicSource()
 │                                                                   └──► MIC VU (Menu)
 │      Badge "đã chọn" (persisted) + badge "đang chạy" (runtime, IPC mic-state-changed — B72 MỚI)
 │
 ├── SYSTEM_AUDIO Input (systemAudioSelect, A71) ──► selectedSystemAudioDeviceId
 │        ──► AudioSource.createSystemAudioSource()
 │                 ├──► BPMEngine.init()   (chỉ khi RUNNING — audit qua AiSystemBoundaryA56)
 │                 ├──► KeyEngine.init()   (chỉ khi RUNNING)
 │                 ├──► ModEngine (gián tiếp, qua KeyEngine.detectOnce() 1 lần/phiên)
 │                 └──► MUSIC VU (Menu)
 │      Badge "đã chọn" (persisted) + badge "đang chạy" (runtime, IPC system-audio-state-changed — A71)
 │
 ├── Audio Output (outputSelect, B72 MỚI) ──► selectedAudioOutputDeviceId
 │        ──► SoundEffectEngine.setOutputDevice() (HTMLMediaElement.setSinkId trên 2 <audio>
 │             CLAP/LAUGH — "Internal Audio Backend" duy nhất mà app THẬT SỰ phát ra) 
 │      Badge "đã chọn" (persisted) + badge "áp dụng thật" (DEFAULT/APPLIED/ERROR, IPC
 │             output-state-changed — B72 MỚI)
 │      **KHÔNG điều khiển đường phát của DAW/nhạc** — xem "Audio Output" bên dưới để biết vì sao.
 │
 └── DAW_MASTER (AudioSource.createDawMasterSource()) ──► MASTER VU
        **BLOCKED** — chưa có cơ chế capture nào (xem "DAW_MASTER" bên dưới), giữ nguyên
        NO_DEVICE + VU luôn 0%, không giả lập.
```

Module liên quan đã đọc lại toàn bộ trước khi sửa: `ui/js/audioSource.js`, `ui/js/renderer.js`,
`ui/js/setup.js`, `ui/setup.html`, `ui/js/appSettings.js`, `app/main.js`, `app/preload.js`,
`ui/js/engines/bpmEngine.js`/`keyEngine.js`/`modEngine.js` (chỉ đọc, không sửa).

## Implementation

### 1. Khôi phục listener `reportSystemAudioState` bị A72 làm mất (renderer.js)

Thêm lại nguyên bản listener A71 (báo trạng thái SYSTEM_AUDIO qua IPC cho Setup), tách biệt
hoàn toàn khỏi listener mà `AiSystemBoundaryA56.verify.js` audit — xác nhận cả 2 test (A56 lẫn
A72) vẫn PASS 100% sau khi thêm lại.

### 2. MIC Input — hợp nhất theo đúng mẫu A71 đã thiết lập (setup.html, setup.js)

B70/B71 trước đó tôi từng thêm card "MIC Input" nhưng bị mất khi 1 commit auto-sync revert lại
(xem lịch sử). Lần này A71 đã thiết lập 1 MẪU MỚI, tốt hơn, cho SYSTEM_AUDIO (2 badge: đã-chọn +
đang-chạy-thật qua IPC). Tôi **dựng lại MIC Input theo ĐÚNG mẫu đó** (không quay lại mẫu cũ của
riêng tôi) để nhất quán trong toàn bộ Setup:
- `setup.html`: thêm card "🎤 MIC Input" (`micSelect`/`btnSelectMic`/`btnClearMic`/
  `micStatusBadge`/`micStateBadge`), độc lập hoàn toàn với card "Audio Interface" cũ.
- `setup.js`: `updateMicStatusBadge()`, `renderMicStateBadge()`, `initMicSection()` — dùng lại
  `populateSoundcardOptions()` đã có (không tạo hàm liệt kê audioinput thứ 2).
- `app/preload.js` + `app/main.js`: kênh IPC `mic-state-changed`/`get-mic-state`, relay y hệt
  cơ chế `system-audio-state-changed` (copy đúng pattern, đổi tên kênh).
- `renderer.js`: `__micSource.onStateChange()` nay vừa gọi `checkAllSystems()` (cập nhật dot
  Menu) vừa `window.electronAPI?.reportMicState?.()` (báo Setup) — 1 listener, 2 việc không
  xung đột nhau (khác SYSTEM_AUDIO — ở đó phải tách 2 listener vì lý do audit A56 nêu trên;
  MIC không có audit tương tự nên gộp được, không cần tách).
- **Khôi phục MIC reconnect + hợp nhất `dot-audio`** (bị revert cùng đợt với MIC Input, xem lại
  lịch sử ở B72-REPORT bản trước) — `updateAudioInterfaceDot()` là **1 hàm DUY NHẤT** quyết định
  `dot-audio`, gọi từ cả `checkAllSystems()` lẫn `updateMainStatus()` (trước đây có 2 nơi ghi đè
  nhau — bug này ĐÃ QUAY LẠI 1 LẦN NỮA do 1 đợt revert/re-apply patch giữa các phiên, nay sửa lại
  và đã viết test hành vi thật để bắt lại nếu tái diễn — xem `B72AudioConfig.verify.js` Test 5).

### 3. Audio Output — audit khả năng kỹ thuật + triển khai đúng phạm vi khả thi

**Audit trước khi code** (đúng yêu cầu C1 đề bài): app KHÔNG có bất kỳ đường phát nhạc/DAW nào
đi qua Chromium — DAW phát trực tiếp ra Windows (Speakers 01), ngoài tầm với của
`HTMLMediaElement`/Web Audio trong renderer. Đường phát THẬT DUY NHẤT của chính app là
`SoundEffectEngine` (2 phần tử `<audio>` cho hiệu ứng CLAP/LAUGH, đã có từ trước — xem
`ui/js/renderer.js`). Chromium/Electron hỗ trợ `HTMLMediaElement.setSinkId(deviceId)` để chọn
thiết bị output cho **riêng phần tử audio đó** — đây là API DUY NHẤT có thật, không có API nào
đổi được "output mặc định của hệ điều hành" hay đường phát của DAW từ renderer process.
→ **Kết luận kỹ thuật**: triển khai Output selector cho `SoundEffectEngine` là khả thi và đã
làm; **không khả thi và không trong phạm vi** việc điều khiển output của DAW hay đổi output mặc
định Windows — đây là giới hạn nền tảng thật, không phải thiếu sót.

**Triển khai**:
- `SoundEffectEngine.setOutputDevice(deviceId)` (renderer.js) — gọi `setSinkId()` THẬT trên cả 2
  audio element, trả về kết quả THẬT (`ok`/`actual`/`error`), **không tự rơi về thiết bị khác**
  khi thất bại (sink cũ được giữ nguyên — hành vi gốc của `setSinkId`).
- `applyAudioOutputSetting()` — đọc `selectedAudioOutputDeviceId`, gọi hàm trên, suy ra trạng
  thái THẬT: `DEFAULT` (None, thành công) / `APPLIED` (đã chọn, sinkId thật khớp) / `ERROR`
  (thất bại HOẶC sinkId thật không khớp — **không tin setting đã lưu nếu kết quả thật khác**).
  Gọi lúc khởi động Menu + mỗi khi `onSetupChanged` báo đổi.
- `setup.html`/`setup.js`: card "🔈 Audio Output" — cùng mẫu 2-badge, dùng
  `populateOutputOptions()` (hàm mới, lọc `audiooutput` — không sửa `populateSoundcardOptions()`
  vì hàm đó đang được 3 nơi khác dùng cho `audioinput`).
- IPC `output-state-changed`/`get-output-state`, khởi tạo cache = `"UNKNOWN"` (không mặc định
  báo thành công khi Menu chưa từng báo cáo gì — đúng yêu cầu "không tạo UI giả").

**Speakers 01** (C2): xác nhận đây là **tên thiết bị output thật của Windows** (không phải chỉ
là label) — nhưng ứng dụng **không có đường phát nào đi qua nó** để xác minh; "APPLIED" trong
badge chỉ xác nhận `setSinkId()` của trình phát app thành công, **không phải** bằng chứng âm
thanh đã phát ra loa vật lý — đã ghi rõ trong `hint-text` của card (không tạo UI giả gây hiểu
lầm đã kiểm chứng phần cứng).

### 4. SYSTEM_AUDIO / nguồn MUSIC độc lập — audit, KHÔNG triển khai thêm

Đã audit lại theo đúng D1: **không có cách nào xác nhận từ code hoặc Web API rằng 1
`audioinput` cụ thể (kể cả 1 kênh Mix nào đó do ASIO Link Pro tạo) đang mang tín hiệu "nhạc
sạch"** — `enumerateDevices()` chỉ cho tên/deviceId, không cho biết nội dung tín hiệu. Việc này
**chỉ xác minh được bằng tai người trên máy thật** (nghe VU/BPM phản ứng đúng khi phát nhạc qua
đúng thiết bị đã chọn). Đúng ràng buộc D1 của đề bài, **giữ nguyên hiện trạng**: SYSTEM_AUDIO
Input đã có UI chọn (A71) + chạy đúng qua `createSystemAudioSource()` (không đổi), nhưng
**KHÔNG tuyên bố** bất kỳ thiết bị nào là "nguồn MUSIC sạch" — đó là kết luận **con người phải tự
xác nhận trên máy thật**, không phải thứ code có thể tự chứng minh.

### 5. DAW_MASTER — audit, giữ NO_DEVICE

`AudioSource.createDawMasterSource()` (đã có từ B58, không đổi): trả về nguồn cố định
`NO_DEVICE`, `onLevel` chỉ bắn `{vuPercent:0, noDevice:true}` — **không có cơ chế capture thật
nào**. Đường khả thi duy nhất để lấy tín hiệu master từ DAW mà KHÔNG cần sửa DAW là **WASAPI
loopback** (capture toàn bộ output của hệ thống) — đây là **native backend / thay đổi kiến
trúc lớn** (cần module native Node hoặc Electron `desktopCapturer` + quyền hệ thống), đúng loại
thay đổi mà đề bài **cấm tự triển khai khi chưa có kế hoạch và xác nhận kỹ thuật rõ ràng** (Phần
I). → **Giữ nguyên `NO_DEVICE`, không code thêm gì** — đây là BLOCKED thật sự do giới hạn nền
tảng + giới hạn phạm vi được phê duyệt, không phải trì hoãn.

## MIC

- **Thiết bị cấu hình**: `selectedMicDeviceId` (Setup, card "MIC Input" — A71-style, B72).
- **Thiết bị runtime**: `AudioSource.createMicSource()` đọc ĐÚNG cùng key qua `getMicDeviceId()`
  (xác nhận bằng test hành vi thật chạy code thật trong sandbox, không phải regex — xem
  `B72AudioConfig.verify.js` Test 6).
- **Trạng thái**: `dot-audio` (Menu) + `micStateBadge` (Setup, live qua IPC) đều đọc
  `AudioSourceState` thật của `__micSource`, không đọc tên đã lưu.
- **Kết quả xác minh**: PASS ở mức code (persistence, độc lập với SYSTEM_AUDIO, reconnect không
  tạo nguồn trùng — test hành vi thật). **PENDING** ở mức phần cứng (xem "Hardware
  verification").

## SYSTEM_AUDIO

- **Nguồn sử dụng**: `selectedSystemAudioDeviceId` — độc lập hoàn toàn, không fallback sang
  `selectedMicDeviceId`/`selectedSoundcardId` (test hành vi thật: gọi `getUserMedia` với đúng
  deviceId, không lẫn MIC).
- **Đường tín hiệu**: `createSystemAudioSource()` → `bindAiEnginesToSystemAudio()` (chỉ khi
  `RUNNING`, audit bởi `AiSystemBoundaryA56.verify.js`, 42/42 PASS) → `BPMEngine.init()` +
  `KeyEngine.init()` → MUSIC VU (`vu-music-fill`).
- **BPM/Key/Mod**: không sửa thuật toán (đúng giới hạn cứng B72) — chỉ xác nhận lại hợp đồng
  "CHỈ nhận SYSTEM_AUDIO" vẫn đúng sau mọi thay đổi (test Section 9 tương đương B72AudioConfig
  Test 6 + A72AiLifecycle đã có).
- **MUSIC VU**: nhận `vuPercent` từ đúng `BPMEngine.onLevel()`, không lấy MIC.

## Audio Output

- **Khả năng hỗ trợ**: CÓ — `HTMLMediaElement.setSinkId()` (Chromium/Electron), nhưng **CHỈ
  cho đường phát riêng của app** (SoundEffectEngine: Clap/Laugh), **KHÔNG** cho đường phát của
  DAW hay output mặc định hệ điều hành — giới hạn nền tảng thật, đã ghi rõ.
- **Selector**: đã triển khai (`outputSelect`), persistence + None + reconnect (áp dụng lại khi
  `onSetupChanged`) đầy đủ.
- **Kết quả phát thử**: CHƯA có bằng chứng phần cứng thật (không nghe được từ container này) —
  chỉ có bằng chứng hành vi mã nguồn thật (setSinkId gọi đúng, xử lý lỗi đúng, không giả lập
  thành công) qua `B72AudioConfig.verify.js` Test 1–2.

## DAW_MASTER

- **Phương án capture**: chưa có (audit ở trên) — cần WASAPI loopback hoặc cơ chế native khác,
  vượt phạm vi được phê duyệt của B72.
- **Trạng thái**: `NO_DEVICE` cố định, giữ nguyên từ B58.
- **MASTER VU**: luôn `0%` + `vu-bar--nodata`, không lấy MIC/SYSTEM_AUDIO RMS làm giả (xác nhận
  bằng test hành vi thật, không chỉ đọc code).

## Test

**Lệnh chạy chính**:
```
node tests/unit/B72AudioConfig.verify.js         → 58 PASS, 0 FAIL   (MỚI — hành vi thật, 8 nhóm)
node tests/unit/B70SetupDeviceAudit.verify.js    → 17 PASS, 0 FAIL   (viết lại — 3 Finding gốc đã sửa xong)
node tests/unit/B71SetupDeviceFix.verify.js      → 41 PASS, 0 FAIL   (cập nhật tên phần tử theo mẫu A71)
node tests/unit/A69VuConsolidation.verify.js     → 35 PASS, 0 FAIL   (sửa 1 lỗi kỹ thuật của chính bài test)
node tests/unit/AiSystemBoundaryA56.verify.js    → 42 PASS, 0 FAIL   (không đổi bởi B72, xác nhận lại)
node tests/unit/A72AiLifecycle.verify.js         → 34 PASS, 0 FAIL   (không đổi bởi B72, xác nhận lại)
node tests/unit/SoundcardSetupPersistence.verify.js → 20 PASS, 0 FAIL
node tests/unit/AudioSourceB58.verify.js         → 29 PASS, 0 FAIL
node tests/unit/AudioReconnectC62.verify.js      → 33 PASS, 0 FAIL
node -c ui/js/renderer.js / setup.js / app/main.js / app/preload.js / ui/js/appSettings.js → OK
```

**`B72AudioConfig.verify.js`** (test mới, quan trọng nhất) chạy **CODE THẬT** trong sandbox `vm`
(không chỉ regex tên hàm — đúng yêu cầu H1 "không chỉ kiểm tra sự tồn tại của tên hàm"):
1. `SoundEffectEngine.setOutputDevice()` với `Audio`/`setSinkId` giả lập — xác nhận thành công,
   thất bại (không rơi về thiết bị khác), môi trường không hỗ trợ.
2. `applyAudioOutputSetting()` — DEFAULT/APPLIED/ERROR đúng theo kết quả thật, kể cả trường hợp
   `setSinkId` resolve nhưng sinkId thật không khớp (không tin mù setting đã lưu).
3. Setup: chọn MIC/SYSTEM_AUDIO/Output — mỗi thao tác chỉ ghi ĐÚNG 1 key, không đụng 2 key kia,
   `selectedSoundcardId` không bao giờ bị ghi trong toàn bộ luồng mới.
4. Reconnect: giả lập `onSetupChanged` — đổi 1 trong 3 thì CHỈ nguồn đó `stop()`/`start()` lại
   (thứ tự đúng, không start() trùng lần 2 nếu gọi lại mà không đổi gì).
5. `updateAudioInterfaceDot()` — RUNNING/STARTING/ERROR/NO_DEVICE (đã chọn vs chưa chọn) đúng
   theo `AudioSourceState` thật, không đọc tên đã lưu.
6. `audioSource.js` thật (nạp nguyên file vào sandbox, không mock hàm nội bộ) — SYSTEM_AUDIO
   None không gọi `getUserMedia`; đã chọn thì gọi đúng deviceId (không lẫn MIC); DAW_MASTER chỉ
   phát level rỗng.
7. Persistence thật: `{...DEFAULT_APP_SETTINGS, ...fromFile}` — thiếu key dùng mặc định, file
   cũ chỉ có `selectedSoundcardId` thì 3 key mới không bị tự gán.
8. IPC: cả 3 kênh (system-audio/mic/output) đúng chiều relay, `output` khởi tạo `"UNKNOWN"`.

**Regression toàn bộ 71 file**: **62/71 PASS**.

**Lỗi mới do B72 gây ra**: 0. Trong lúc merge/refactor, 3 file test tạm thời lỗi (do đổi cấu
trúc hàm) — **đã sửa hết trong cùng phiên**, không còn sót.

**Lỗi tồn tại từ baseline** (9 file, đối chiếu bằng cách chạy lại y hệt các test này TRƯỚC khi
tôi sửa bất kỳ file production nào trong phiên này — tức ngay sau `git reset --hard origin/main`
ở `9e064a2`):

| File | Nguyên nhân | Có phải do B72 không |
|---|---|---|
| `B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `PortSelectionPolicy` | `Cannot find module 'xmllint-wasm'` | KHÔNG — môi trường container thiếu `node_modules` |
| `MidiLearnDispatch` | `Cannot find module 'easymidi'` | KHÔNG — cùng lý do |
| `MenuMinimizeRuntime` | IPC minimize-window, không liên quan Setup/Audio | KHÔNG — đã có từ baseline A68 |
| `AutoSongCollector`, `NowPlayingResolver` | Self-check "`git status` sạch" — fail khi có file khác bị sửa cùng lúc | KHÔNG — cơ chế tự-kiểm nội bộ của 2 test đó, không phải lỗi chức năng |

## Hardware Verification

**PENDING — KHÔNG THỰC HIỆN ĐƯỢC TRONG PHIÊN NÀY.**

Môi trường thực hiện là container Linux nội bộ, không có quyền truy cập máy Windows tại
`G:\AUTO_MENU_AI`, không có Electron thật, không có thiết bị âm thanh vật lý, không có DAW thật
đang chạy. **Không có bất kỳ bước nào trong Phần H2 đề bài được thực hiện.** Toàn bộ nội dung
báo cáo này là kết luận từ đọc source thật + chạy hành vi thật trong sandbox `vm` mô phỏng
`navigator.mediaDevices`/`Audio`/IPC — **không phải bằng chứng phần cứng**.

Cần bạn tự xác minh trên máy thật (xem hướng dẫn từng bước tương tự đã có ở B71-REPORT.md /
B72-REPORT.md bản trước, áp dụng thêm cho 2 mục mới):
1. Card "MIC Input" hiển thị đúng danh sách/tên thiết bị mic thật.
2. Card "Audio Output" hiển thị đúng danh sách loa/thiết bị output thật; chọn 1 thiết bị, bấm
   "Chọn", rồi bấm nút phát hiệu ứng Clap/Laugh trong Menu (nếu có) — nghe xem có phát đúng loa
   đã chọn không; badge "áp dụng thật" bên dưới phải chuyển ● APPLIED.
3. Chọn SYSTEM_AUDIO là 1 kênh Mix cụ thể (nếu ASIO Link Pro có expose) — phát nhạc thật, xem
   MUSIC VU + BPM có phản ứng đúng, và **tự đánh giá bằng tai** đây có phải "nhạc sạch" (không
   lẫn tiếng mic) hay không — B72 không thể tự kết luận điều này.
4. Đổi MIC/SYSTEM_AUDIO/Output từng cái một trong lúc Menu đang chạy — xác nhận đúng cái đang
   đổi mới reconnect, 2 cái còn lại không bị ảnh hưởng.
5. Rút dây 1 thiết bị đang dùng — xác nhận trạng thái ERROR/NO_DEVICE hiển thị đúng, không đứng
   hình ở trạng thái cũ.

## Blockers

1. **DAW_MASTER capture** — cần WASAPI loopback hoặc cơ chế native; đây là thay đổi kiến trúc
   lớn, cần 1 kế hoạch kỹ thuật riêng + xác nhận trước khi bất kỳ ai code (đúng Phần I đề bài).
   Bằng chứng: `createDawMasterSource()` không có đường capture nào trong toàn bộ codebase hiện
   tại (đã grep toàn repo `getDisplayMedia`/`desktopCapturer`/`loopback` — không có kết quả).
2. **Xác nhận "MUSIC sạch"** — không thể làm bằng code/audit tĩnh, cần tai người + thiết bị thật
   trên máy Windows. Đây là blocker về BẢN CHẤT của vấn đề (không phải thiếu công sức).
3. **Audio Output không điều khiển được đường phát DAW** — giới hạn nền tảng (Chromium renderer
   không có quyền truy cập audio session của tiến trình khác), không phải thiếu sót có thể sửa
   bằng code thêm.
4. **Hardware verification** — hoàn toàn PENDING (mục ở trên).

## Files changed

| File | Thêm/Sửa | Lý do |
|---|---|---|
| `ui/js/renderer.js` | Sửa | (a) khôi phục listener `reportSystemAudioState` bị A72 làm mất; (b) khôi phục + hợp nhất `updateAudioInterfaceDot()` (bug 2-nơi-ghi-đè tái diễn); (c) `__micSource.onStateChange` gộp báo IPC + refresh dot; (d) thêm `SoundEffectEngine.setOutputDevice()`/`getOutputDeviceId()`; (e) thêm `applyAudioOutputSetting()` + gọi lúc khởi động và trong `onSetupChanged` |
| `ui/js/setup.js` | Sửa | Thêm `initMicSection()` (theo mẫu A71) + `initOutputSection()`, `populateOutputOptions()`, các hàm badge tương ứng |
| `ui/setup.html` | Sửa | Thêm card "MIC Input" (mẫu A71) + card "Audio Output" |
| `app/main.js` | Sửa | Thêm relay IPC `mic-state-changed`/`get-mic-state` + `output-state-changed`/`get-output-state` |
| `app/preload.js` | Sửa | Thêm `reportMicState`/`onMicStateChange`/`getMicState` + 3 hàm tương ứng cho Output |
| `ui/js/appSettings.js` | Sửa | Thêm `selectedAudioOutputDeviceId: ""` vào `DEFAULT_APP_SETTINGS` (`selectedMicDeviceId` đã có sẵn từ trước) |
| `tests/unit/B72AudioConfig.verify.js` | **Mới** | 58 PASS — test hành vi thật cho toàn bộ phạm vi B72 gộp |
| `tests/unit/B70SetupDeviceAudit.verify.js` | Viết lại | 3 Finding gốc nay đã sửa xong cả 3 (17 PASS) |
| `tests/unit/B71SetupDeviceFix.verify.js` | Sửa | Cập nhật tên phần tử theo mẫu A71 (41 PASS) |
| `tests/unit/A69VuConsolidation.verify.js` | Sửa | Lỗi kỹ thuật của chính bài test (git diff dùng HEAD di động) — không liên quan Setup/Audio |

**Không sửa**: `ui/js/audioSource.js`, `ui/js/engines/bpmEngine.js`/`keyEngine.js`/`modEngine.js`,
`ui/index.html`, `selectedSoundcardId`/card "Audio Interface" cũ — xác nhận bằng
`git diff --stat` (không có trong danh sách).

## Git status

- **Commit local**: sẽ tạo ngay sau báo cáo này (hash sẽ nêu trong tin nhắn chat kèm theo).
- **Push/merge**: **CHƯA** — theo đúng quy định "không tự push hoặc merge khi chưa được giao
  quyền". Đề nghị bạn tiếp tục quy trình đã dùng cho các task trước (áp patch trên máy thật rồi
  tự `git push`).

## Kết luận

- **Phần hoàn tất**: MIC Input + SYSTEM_AUDIO Input (đã có từ A71, xác nhận lại còn đúng) hoạt
  động độc lập, đúng hợp đồng persistence/reconnect/trạng thái ở mức code; Audio Output đã
  triển khai đúng giới hạn kỹ thuật thật (không giả lập); DAW_MASTER giữ đúng NO_DEVICE, không
  giả lập; sửa 2 lỗi hồi quy phát sinh giữa các đợt merge (mất `reportSystemAudioState`, tái
  diễn bug dot-audio 2-nơi-ghi-đè); toàn bộ hồi quy có liên quan đều PASS.
- **Phần chưa hoàn tất**: DAW_MASTER capture thật (blocked — cần kế hoạch kỹ thuật riêng); xác
  nhận "MUSIC sạch" bằng tai người; toàn bộ Hardware Verification (PENDING hoàn toàn).
- **Điều kiện để đóng B72**: bạn xác nhận trên máy thật 5 mục ở "Hardware Verification" phía
  trên; nếu cần MASTER capture thật, mở 1 task kiến trúc riêng (WASAPI loopback) có xác nhận kỹ
  thuật trước khi giao code.
