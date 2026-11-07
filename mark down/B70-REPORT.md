# B70-REPORT.md — SETUP AUDIO DEVICE CONFIGURATION

## A. Baseline
- origin/main SHA: `28b8a0a02b924581ce16302030a9ee9cb7908c41` (đã kiểm bằng `git fetch origin`
  ngay đầu task — đúng bằng SHA này, không lệch. Commit này chính là "Auto-sync 27/09/2026"
  do bạn tự đồng bộ, đã bao gồm nguyên vẹn 2 patch A68 + A69 — đã đối chiếu `diff` từng file,
  khớp 100% với commit local Claude B đã làm ở 2 task trước).
- HEAD (lúc audit): `28b8a0a02b924581ce16302030a9ee9cb7908c41` (`git reset --hard origin/main`
  để đồng bộ đúng "single source of truth", không có commit riêng nào của Claude B đè lên).
- Working tree: sạch khi bắt đầu; cuối task chỉ có **1 file mới, không sửa file cũ nào**:
  `tests/unit/B70SetupDeviceAudit.verify.js` (test audit-only, xem Mục G).

## B. Setup Device Selection

- **Input device selection (`ui/js/setup.js` — `populateSoundcardOptions()`,
  `initSoundcardSection()`)**: có 1 dropdown DUY NHẤT, nhãn "Audio Interface", liệt kê
  `navigator.mediaDevices.enumerateDevices()` lọc `kind === "audioinput"` — tức là **liệt kê
  MỌI thiết bị đầu vào** (không phân biệt mic thật hay loopback/mix ảo — đúng như A64 đã audit
  trước đó, chưa có gì thay đổi). Chọn xong, bấm "Chọn" → lưu đồng thời `selectedSoundcard`
  (tên hiển thị) + `selectedSoundcardId` (deviceId thật).
- **Output device selection**: **KHÔNG TỒN TẠI**. Đã tìm `audiooutput`/`setSinkId` trong toàn
  bộ `ui/js/setup.js`, `ui/setup.html`, `ui/js/renderer.js`, `ui/js/appSettings.js`,
  `ui/js/audioSource.js` — không có kết quả nào (xác nhận bằng test tự động, Mục E). Trường
  "Thiết bị đầu ra" trong bảng đề bài B70 **chưa được triển khai ở bất kỳ đâu trong code**,
  không phải lỗi ẩn — là tính năng chưa làm.
- **SYSTEM_AUDIO selection**: **KHÔNG CÓ UI** (đúng như A65-REPORT.md đã ghi nhận, audit lại
  vẫn đúng nguyên trạng ở baseline hiện tại). Cách duy nhất để ghi `selectedSystemAudioDeviceId`
  là gọi tay `AudioSource.setSystemAudioDeviceId(deviceId)` trong DevTools console.
- **Default device behavior**: dropdown "Audio Interface" mặc định option rỗng
  (`<option value="">Chọn Soundcard...</option>`), không tự chọn thiết bị nào — đúng chủ ý
  "không tự chọn thiết bị âm thanh thay người dùng" (Mục 3 đề bài B70).

## C. Persistence

- **Save**: `setup.js` gọi `saveSetting(key, value)` → `setSetting()` (`appSettings.js`) → ghi
  vào object `appSettings` trong bộ nhớ, rồi gọi `saveSetup()` → nếu chạy trong Electron
  (`window.electronAPI.saveSettingsSync`), gửi IPC `sendSync` tới `app/main.js` →
  `writeSettingsFile()` ghi **atomic** (tmp file + `renameSync`) ra
  `path.join(app.getPath("userData"), "app-settings.json")` — 1 file JSON dùng chung cho cả
  Menu và Setup (khác `localStorage`, vốn bị cô lập theo từng cửa sổ Electron). Nếu không có
  `electronAPI` (mở file .html trực tiếp để test), fallback `localStorage`.
- **Restore**: khi mở lại (Menu hoặc Setup), `loadSetup()` gọi
  `window.electronAPI.loadSettingsSync()` → main process đọc lại đúng file JSON trên → merge
  vào `DEFAULT_APP_SETTINGS`. Cơ chế này đã có sẵn test riêng
  (`SettingsFileIO.verify.js`, `SettingsPersistenceRoundtrip.verify.js`,
  `SoundcardSetupPersistence.verify.js`) — chạy lại cả 3, đều PASS (xem Mục E).
- **Missing device behavior**: `populateSoundcardOptions()` — nếu `selectedSoundcardId` đã
  lưu KHÔNG còn nằm trong danh sách `enumerateDevices()` hiện tại, code **KHÔNG tự xoá
  setting** (đúng Mục 3 đề bài "Không thay đổi cấu hình thiết bị thực tế" / Mục B đề bài
  "không tự fallback"), chỉ thêm 1 `<option>` giả "(Đã lưu trước đó) <deviceId>" để UI có gì
  hiển thị, và `updateSoundcardDisplays()` đổi badge thành "⚠ Audio Interface không khả dụng"
  (khác hẳn "chưa chọn"). Với SYSTEM_AUDIO, hành vi mất thiết bị nằm ở `audioSource.js` (state
  chuyển `ERROR`, tự động thử kết nối lại ngầm — TASK C62, đã có test `AudioReconnectC62.verify.js`,
  PASS 33/33 khi chạy lại) — không rơi về mặc định, không tự đổi sang MIC.

## D. Setup → Menu

- **`selectedSoundcardId`**: dùng cho (1) dropdown "Audio Interface" hiển thị lại giá trị đã
  chọn, (2) badge trạng thái trong Setup, (3) VU-mét thử mic NỘI BỘ trong Setup
  (`setupVuMeter.js`, chỉ chạy khi đang mở màn Setup). **KHÔNG được `audioSource.js` dùng để mở
  MIC thật cho Menu** — xem phát hiện mới bên dưới.
- **`selectedSystemAudioDeviceId`**: DUY NHẤT được `AudioSource.getSystemAudioDeviceId()` đọc,
  dùng để mở `SYSTEM_AUDIO` source nuôi BPM/Key/Mod + MUSIC VU. Vì không có UI ghi key này,
  giá trị luôn rỗng → SYSTEM_AUDIO luôn `NO_DEVICE` trên máy chưa từng gọi tay DevTools.
- **Actual device opened (MIC VU trên Menu)** — **PHÁT HIỆN MỚI (chưa từng nêu ở A64/A65)**:
  `AudioSource.createMicSource()` mở mic qua `getMicDeviceId()`, hàm này đọc key
  **`selectedMicDeviceId`** — một key HOÀN TOÀN KHÁC với `selectedSoundcardId`. Đã tìm trong
  toàn bộ `setup.js`/`renderer.js`/`appSettings.js`: **không có bất kỳ đoạn code nào từng ghi
  `selectedMicDeviceId`**. Hệ quả: dù người dùng chọn thiết bị nào trong dropdown "Audio
  Interface" của Setup, **MIC VU thật trên Menu luôn mở mic mặc định của hệ điều hành**, không
  bao giờ theo đúng lựa chọn trong Setup. Đây là hành vi đã được B58 chủ đích ghi chú là "MIC
  dùng mic mặc định nếu chưa chọn mic cụ thể" (xem comment `audioSource.js` dòng 73-77) —
  nhưng vì `selectedMicDeviceId` chưa từng có UI để ghi, điều kiện "nếu chưa chọn" **luôn đúng
  vĩnh viễn**, khiến tính năng chọn "Audio Interface" trong Setup **không có tác dụng thật** đối
  với MIC VU của Menu, dù badge Setup vẫn báo "● Đã chọn Audio Interface".
- **Audio Interface UI source (chấm tròn + tên hiển thị trên Menu)**: `updateMainStatus()` và
  `checkAllSystems()` trong `renderer.js` **chỉ đọc chuỗi `selectedSoundcard`** (tên hiển thị
  đã lưu) để tô màu chấm `dot-audio` xanh/đỏ và điền vào `#soundcardName` — **không hề kiểm tra
  bất kỳ `AudioSourceState`/`getState()` nào**. Nói cách khác, chấm/tên này chỉ trả lời "người
  dùng đã từng bấm lưu 1 cái tên trong Setup hay chưa", không trả lời "thiết bị đó có đang thực
  sự mở/chạy hay không".
- **Soundcard status discrepancy — nguyên nhân gốc (root cause)**: nghịch lý "Menu hiện tên
  Audio Interface nhưng BPM báo Chưa chọn Soundcard (Setup)" nêu trong đề bài xảy ra vì **2 chỉ
  báo đọc 2 setting hoàn toàn độc lập, không liên quan nhau**:
  1. "Tên Audio Interface" / chấm `dot-audio` trên Menu ← đọc `selectedSoundcard` (đã có giá trị
     vì người dùng đã chọn dropdown "Audio Interface" trong Setup — dropdown MIC, không phải
     SYSTEM_AUDIO).
  2. "Chưa chọn Soundcard (Setup)" ở ô BPM ← đọc `AudioSource.getSystemAudioDeviceId()` tức
     `selectedSystemAudioDeviceId` — **luôn rỗng** vì (như Mục B ở trên) không có UI nào trong
     Setup từng ghi key này.

  Vì cùng dùng chữ "Soundcard"/"Audio Interface" cho 2 khái niệm khác nhau (MIC vs
  SYSTEM_AUDIO) ở 2 nơi hiển thị khác nhau, người dùng dễ hiểu lầm rằng chọn 1 nơi sẽ ảnh hưởng
  nơi kia. Đây KHÔNG phải bug logic (audioSource.js đã tách đúng 2 khái niệm từ A65) — mà là
  **thiếu UI cho SYSTEM_AUDIO + đặt tên hiển thị gây nhầm lẫn**.

## E. Test Results

Test commands đã chạy (đứng riêng, đọc source thật hoặc sandbox `vm`, không cần Electron):

```
node tests/unit/B70SetupDeviceAudit.verify.js       → 18 PASS, 0 FAIL  (MỚI — audit Mục D)
node tests/unit/SoundcardSetupPersistence.verify.js → 20 PASS, 0 FAIL
node tests/unit/AudioSourceB58.verify.js            → 29 PASS, 0 FAIL
node tests/unit/AudioReconnectC62.verify.js         → 33 PASS, 0 FAIL
node tests/unit/AiSystemBoundaryA56.verify.js       → 41 PASS, 1 FAIL (đã xác nhận từ A69: fail có sẵn từ trước, không liên quan Setup/Device)
node -c ui/js/setup.js / renderer.js / audioSource.js / app/main.js → OK, không lỗi cú pháp
```

Regression sweep toàn bộ `tests/unit/*.js` (67 file, bao gồm cả file mới của B70):

```
59/67 PASS.
```

8 file FAIL còn lại — **đối chiếu lại với 2 lần audit trước (A68/A69), cùng danh sách, cùng
nguyên nhân, không phát sinh gì mới do B70**:

| File FAIL | Nguyên nhân |
|---|---|
| `B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `PortSelectionPolicy` | `Cannot find module 'xmllint-wasm'` — container chưa `npm install` |
| `MidiLearnDispatch` | `Cannot find module 'easymidi'` — cùng lý do |
| `AiSystemBoundaryA56` | 1 assertion về audit khoá A52/A53, không liên quan Setup/Device — đã xác nhận fail sẵn từ baseline A68 |
| `MenuMinimizeRuntime` | Về IPC minimize-window, không liên quan Setup/Device — đã xác nhận fail sẵn từ baseline A68 |

**Hardware verification: CHƯA làm** (đúng Mục 3 đề bài "Không tuyên bố đã xác minh phần cứng
nếu chỉ chạy test tự động"). Toàn bộ Mục D ở trên là kết luận từ ĐỌC SOURCE THẬT + chạy test
tự động (sandbox `vm`/giả lập `navigator.mediaDevices`), **KHÔNG có bước nào chạy trên Electron
thật với thiết bị âm thanh vật lý** (môi trường container không có Electron/audio device thật —
xem GAP tương tự đã nêu ở A68/A69-REPORT.md).

## F. Findings

**Confirmed issues (đã xác nhận bằng code + test, không cần phần cứng để kết luận)**:
1. Setup không có UI nào để chọn `selectedSystemAudioDeviceId` — SYSTEM_AUDIO luôn `NO_DEVICE`
   mặc định (đã biết từ A65, audit lại vẫn đúng nguyên trạng).
2. **[MỚI]** Setup không có UI nào để ghi `selectedMicDeviceId` — dropdown "Audio Interface"
   trong Setup ghi `selectedSoundcardId`, một key KHÁC hoàn toàn với key mà
   `AudioSource.createMicSource()` thực sự đọc. Hệ quả: chọn "Audio Interface" trong Setup
   không có tác dụng thật lên MIC VU của Menu.
3. **[MỚI]** Không tồn tại tính năng chọn thiết bị đầu ra (output/speaker) ở bất kỳ đâu trong
   code — không phải lỗi, là tính năng chưa được xây.
4. **[MỚI, làm rõ hơn A64/A65]** Chỉ báo "tên Audio Interface"/chấm trạng thái trên Menu chỉ
   đọc 1 chuỗi tên đã lưu, không xác minh AudioSource có đang chạy hay không — đây là nguyên
   nhân trực tiếp (không phải suy đoán) của nghịch lý "hiện tên nhưng BPM báo chưa chọn" nêu
   trong đề bài.

**Unverified issues (nghi vấn, cần kiểm tra thêm trên máy thật, KHÔNG kết luận ở đây)**:
- Không rõ trên máy thật, mic mặc định của hệ điều hành (mà MIC VU luôn dùng, theo Finding 2)
  có trùng với thiết bị mà người dùng THỰC SỰ muốn dùng làm mic hay không — tuỳ cấu hình
  Windows của từng máy, không thể xác nhận chỉ bằng đọc code.
- Không rõ hành vi thực tế khi rút dây Audio Interface đang chọn TRONG LÚC Setup đang mở (test
  tự động mô phỏng bằng `enumerateDevices()` giả lập, không phải rút dây thật).

**Root cause (tổng hợp)**: kiến trúc đã tách đúng 3 khái niệm (MIC/SYSTEM_AUDIO/DAW_MASTER) ở
tầng `audioSource.js` từ B58/A65, nhưng tầng **Setup UI + hiển thị trạng thái trên Menu** chưa
theo kịp: (a) chỉ có UI cho 1 trong 3 khái niệm (MIC, qua key `selectedSoundcardId` — nhưng lại
không phải key mà MIC source thật sự đọc), (b) SYSTEM_AUDIO hoàn toàn chưa có UI, (c) các chỉ
báo trạng thái trên Menu ("Audio Interface" tên/chấm) chỉ phản ánh "đã lưu 1 cái tên" chứ không
phản ánh "thiết bị có đang chạy" — nên các chỉ báo khác nhau (Menu vs BPM) hiển thị thông tin
trái ngược nhau dù không hề mâu thuẫn về mặt logic bên dưới.

## G. Changes

- **Files changed**: KHÔNG có file production nào bị sửa (đúng Mục 3 đề bài "Không sửa code
  production nếu chưa xác định rõ nguyên nhân và phạm vi sửa" — task này DỪNG ở audit, không
  đề xuất sửa vì việc sửa (thêm UI SYSTEM_AUDIO, sửa `getMicDeviceId()` để đọc đúng
  `selectedSoundcardId`, hoặc đổi chỉ báo Menu để kiểm tra AudioSourceState thật) đều là thay
  đổi kiến trúc/UI cần bạn xác nhận trước, đúng nguyên tắc "Nếu cần thay đổi kiến trúc thì phải
  giải thích trước").
- **File mới**: `tests/unit/B70SetupDeviceAudit.verify.js` (18 PASS, 0 FAIL) — test audit-only,
  đọc lại source thật để xác nhận 3 phát hiện ở Mục D/F, giúp lần audit sau (nếu ai đó vô tình
  "sửa" 1 trong 2 key hoặc thêm output selection) có ngay bằng chứng thay vì phải audit lại từ
  đầu. Không có `expect`/mock nào giả lập thiết bị âm thanh thật — chỉ đọc chuỗi source.
- **Code changes**: KHÔNG có.
- **Commit**: đã commit local (chưa push) — hash ghi ở cuối Mục A (sẽ khớp với hash trong phản
  hồi chat kèm theo).

## H. Conclusion

- **PASS / PARTIAL / FAIL**: **PARTIAL** — Audit hoàn thành đầy đủ theo checklist 7 mục (Mục 4
  đề bài), phát hiện rõ nguyên nhân gốc + 2 vấn đề mới chưa từng ghi nhận, nhưng đúng phạm vi
  nhiệm vụ ("Chưa triển khai sửa routing âm thanh") nên KHÔNG có code fix nào — vẫn còn
  "blocker" thật sự (Mục dưới) chưa được giải quyết bằng task này.
- **Remaining blockers**:
  1. Setup chưa có UI chọn SYSTEM_AUDIO device (blocker chính để BPM/Key/Mod hoạt động thật).
  2. `getMicDeviceId()` đọc sai key (`selectedMicDeviceId` thay vì `selectedSoundcardId`) —
     khiến chọn "Audio Interface" trong Setup không ảnh hưởng MIC VU thật của Menu.
  3. Chưa có UI/tính năng chọn thiết bị đầu ra.
  4. Chỉ báo trạng thái trên Menu (tên/chấm Audio Interface) không phản ánh đúng AudioSource
     thật đang chạy — dễ gây hiểu lầm tiếp tục nếu không sửa cách hiển thị.
- **Recommended next task**: 1 task riêng (kiến trúc/UI, cần bạn duyệt trước theo đúng quy tắc
  dự án) để: (a) thêm Setup UI cho `selectedSystemAudioDeviceId`, VÀ/HOẶC (b) sửa
  `getMicDeviceId()` để dùng đúng `selectedSoundcardId` đã có sẵn UI (phương án ít việc hơn cho
  vấn đề #2 — nhưng cần bạn xác nhận đây có phải ý đồ đúng hay MIC cố tình phải độc lập với
  "Audio Interface"), (c) đổi chỉ báo Menu để kiểm tra `AudioSourceState` thật thay vì chỉ đọc
  tên đã lưu. B70 KHÔNG tự quyết định phương án nào ở trên — để bạn chọn hướng trước khi Claude
  B code tiếp, đúng tinh thần "audit trước, sửa sau, có giải thích".
