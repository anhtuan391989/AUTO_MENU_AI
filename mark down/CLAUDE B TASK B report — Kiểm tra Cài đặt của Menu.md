# CLAUDE B : TASK B report — Kiểm tra Cài đặt của Menu

**Loại task:** AUDIT ONLY (chỉ đọc, không sửa code, không sửa HTML, không commit/push) **Nguồn:** GitHub `anhtuan391989/AUTO_MENU_AI`, nhánh `main`, commit `3134948` (Auto-sync 07/11/2026 08:51) **SOURCE MODIFIED BY CLAUDE B = NO** **Phạm vi:** nút ⚙ trên Menu mở trang Cài đặt `ui/setup.html` (12 mục: Dashboard, Audio, Hiệu Ứng, AI, MIDI, DAW, Plugin, Database, Calibration, Backup, System, Công cụ & Sửa lỗi). Cuối báo cáo có thêm vài lỗi nhỏ của chính Menu (`ui/index.html`) tìm thấy trong lúc đọc.

**Cách xác minh:** đã đọc toàn bộ `ui/setup.html` (973 dòng), rồi dò từng id/nút trong các file `ui/js/*.js`, `app/*.js`, `core/*` để xem có mã nào đọc/ghi/thực thi nó không. Đây là kiểm tra tĩnh (VERIFIED bằng mã nguồn). **Chưa chạy app thật trên Windows, chưa cắm phần cứng** nên mọi kết luận về hành vi lúc chạy là NOT TESTED.

## 0. Tóm tắt nhanh

- `setup.html` có 190 id. 22 id không được file JS nào nhắc tới (7 ô Hidden DAW, 7 nhãn AI Readiness, và một số id phụ).
- Có 35 control đang `disabled` (đặt sẵn chỗ, chưa có chức năng).
- Có 18 nút ẩn (`display:none`) chỉ để mã cũ không báo lỗi.
- Phần **trùng lặp** nặng nhất: 3 ô chọn thiết bị âm thanh chồng nhau, 3 nơi lưu đường dẫn DAW, 2 chỗ Ẩn DAW.
- Phần **chưa dùng được** nặng nhất: khối Startup & Paths (lưu được nhưng không có gì dùng giá trị đó), ô Tự động Restore, 6 action MIDI Learn không có nơi thực thi.

## 1. TRÙNG LẶP

### 1.1 Ba bộ chọn thiết bị âm thanh chồng nhau (Setup > Audio)

- **Thẻ ‘Microphone (Input Device)’** (`soundcardSelect`, lưu vào `selectedSoundcardId`). Tên thẻ gây hiểu nhầm: thực chất đây là **Audio Interface**, không phải micro. Hiện chỉ còn dùng để hiện tên ở ô AUDIO INTERFACE trên Menu và cho thanh đo thử trong Setup. Từ A65/B71, nó **không còn** điều khiển MIC VU hay SYSTEM\_AUDIO thật của Menu.
- **Thẻ ‘MIC Input’** (`micSelect`, lưu `selectedMicDeviceId`): đây mới là micro thật mà Menu dùng cho MIC VU.
- **Thẻ ‘SYSTEM\_AUDIO Input’** (`systemAudioSelect`, lưu `selectedSystemAudioDeviceId`): nguồn thật cho BPM / Key / Mod / MUSIC VU.
- **Hệ quả thực tế:** thanh ‘Microphone VU’ trong Setup đo thiết bị `selectedSoundcardId` (`ui/js/setupVuMeter.js` dòng 63), **không phải** thiết bị ở thẻ MIC Input mà Menu dùng. Bạn có thể thấy mic ‘có tiếng’ ở Setup nhưng Menu đang đo một thiết bị khác.

### 1.2 Đường dẫn DAW lưu ở 3 nơi riêng (Setup > AI)

- Thẻ **Startup & Paths**: `spDawExePath` → `startupPaths.dawExecutable` (file `app-settings.json`).
- Thẻ **Đường dẫn & khởi động**: nút ‘Chọn đường dẫn DAW’ → `selectedDAWPath`, cùng ô ‘Mở DAW cùng Menu’ → `launchDAW`.
- Thẻ **Hidden DAW**: `hiddenDawExePath` (bị khoá, không có mã).
- Mục Công cụ & Sửa lỗi > Ẩn DAW đọc `selectedDAWPath` trước, nếu trống mới lấy `startupPaths.dawExecutable` (`app/DawTray.js` dòng 70–71). Nghĩa là điền ở thẻ này hay thẻ kia cho kết quả khác nhau.
- Tương tự cho **đường dẫn Project** (`spDawProjectPath` / `pjPathDisplay` / `hiddenDawProjectPath`) và **tự mở khi khởi động** (`spAutoStart` / `launchDawOnStartup` / `hiddenDawAutoLaunch`).
- Chính ghi chú C60 trong `setup.html` thừa nhận hai cơ chế này ‘KHÁC nhau’ nhưng chưa gộp (vì ngoài phạm vi task).

### 1.3 Ẩn DAW có 2 phiên bản

- `Hidden DAW` (mục AI): 7 ô, tất cả bị khoá, không có mã nào dùng.
- `Ẩn DAW xuống khay thông báo` (mục Công cụ & Sửa lỗi): chạy thật (`app/DawTray.js`).
- Chỉ cần giữ bản thứ hai.

### 1.4 Năm khối cùng nói về ‘mapping’ (Setup > MIDI)

- MIDI Learn + Mapping đã lưu (thật).
- DAW Action Mapping bằng chuột (Capture toạ độ) — đường dự phòng, độc lập với MIDI.
- DAW MIDI OUTPUT và Mapping Overview (thật).
- **Sơ đồ nhóm Mapping (khái niệm):** bảng tĩnh luôn ghi ‘Chưa gán’ cho mọi dòng, dù bạn đã gán thật ở khối bên trên → thông tin này mâu thuẫn với thực tế.
- **MIDI Learn (mục lưu trữ cũ):** chỉ có 1 nút khoá, mục này tự ghi là ‘đã thay thế’.

### 1.5 Tên ‘Preset’ dùng cho hai thứ khác nhau

- Menu: Preset = NORM / LOFI / RAP / REMIX.
- Setup > Dashboard: ‘Lưu Preset / Tải Preset’ = ảnh chụp 10 trường cài đặt (DAW, Auto-Key, Auto-Tune, trình duyệt, soundcard, toạ độ, launchDAW).
- Ngoài ra Backup/Restore lưu toàn bộ cài đặt, nên chồng một phần với Preset của Dashboard.

### 1.6 Mã thừa (không thấy được nhưng làm rối)

- 18 nút ẩn: `openShortcutsBtn`, `closeShortcuts`, `btnClosePj`, `openSoundcardModal`, `closeSoundcardBtn`, `closeMidiBtn`, `selectDawBtn`, `closeDawBtn`, `selectAutoKeyBtn`, `closeAutoKeyBtn`, `selectAutoTuneBtn`, `closeAutoTuneBtn`, `openBeModal`, `closeBeBtn`, `openFixMeoModal`, `closeFixMeoBtn`, `openBrowserModal`, `closeBrowserBtn`.
- `initAutoLaunchSection` trong `ui/js/setup.js` (dòng \~2153) tìm 6 id không tồn tại trong `setup.html` (`selectLoopMidiPath`, `selectDawPath`, `loopMidiPath`, `dawExePath`, `autoLaunchToggle`, `saveAutoLaunchBtn`) → chạy mà không làm gì.

### 1.7 Bảng EFFECT cũ trong Menu

- `ui/index.html` còn một cửa sổ nổi EFFECT cũ (4 nút chỉ hiện `alert(...)` + ô ‘Luôn luôn hiển thị’ chỉ hiện `alert`).
- `ui/js/renderer.js` (dòng \~423) đã chặn nút EFFECT để mở cửa sổ Bảng Hiệu Ứng mới (`app/EffectsWindow.js`). Vì vậy bảng cũ chỉ còn hiện khi mở bằng trình duyệt thường → mã chết.

## 2. CHƯA DÙNG ĐƯỢC

### 2.1 Có nút/ô nhưng không có mã dùng giá trị (nguy hiểm vì trông như hoạt động)

- **Startup & Paths** (7 trường + nút Save, `ui/js/setupStartupPaths.js`): lưu được và có kiểm tra đường dẫn, nhưng
  - `core/integration/DawLauncher.js` chỉ được gọi trong file test `tests/unit/DawLauncherC56.verify.js`, **không có gì trong `app/` gọi nó**;
  - không tìm thấy `openAtLogin` / `setLoginItemSettings` → ô ‘Auto Start AUTO MENU AI cùng Windows’ **không làm Windows khởi động app**;
  - `pluginPaths`, `midiConfig`, `audioConfig`, `logs` không có nơi nào đọc.
  - Chỉ `dawExecutable` được `DawTray.js` dùng, và chỉ như phương án dự phòng.
- **‘Tự động Restore khi mở DAW’** (`checkAutoRestore`, Setup > Backup): lưu vào `autoRestoreOnDawStart` nhưng **không có mã nào đọc** khoá này.
- **MIDI Learn — 6 action không có nơi thực thi:** `menu:buttonA`, `menu:buttonB`, `fn:autoDetect`, `preset:load`, `keymod:doTone`, `plugin:retune/humanize`. Gán và lưu được, nhưng tìm toàn bộ `app/`, `core/`, `ui/js/` không thấy mã thực thi (chỉ `daw:play/stop/record` chạy). Chính `setupMidiInput.js` ghi nhận điều này.

### 2.2 Trạng thái mâu thuẫn

- **AI Readiness** (mục AI): 7 nhãn (`aiReady*`) luôn là ‘Pending backend verification’ vì **không có mã nào cập nhật chúng**. Trong khi Dashboard có nhãn ‘AI: READY’ (`setupNav.js` dòng \~119) → hai nơi nói hai điều khác nhau.

### 2.3 Đặt chỗ sẵn, đang bị khoá (không phải lỗi, nhưng chưa dùng được)

- Hidden DAW: 7 ô. AI Core: 12 ô (Confidence, Threshold, Learning, Calibration AI…).
- Database: 6 ô thống kê + Import / Export / Rebuild / Cache.
- Audio: Sample Rate, Buffer size, Latency, Audio Test, Calibration Audio.
- MIDI: Channel Input, MIDI Clock, Pitch Bend, Program Change, MIDI Macro.
- DAW: Nuendo, Reaper, Ableton, FL Studio, driver Cubase.
- Plugin: Melodyne, SoundShifter, VST3, Plugin Scan. Calibration: Resolution / Scaling / Verify.
- System: Theme, Language, Version / Update / License.
- Trình duyệt: Edge và Firefox ghi ‘auto-dò: chưa hỗ trợ’.

## 3. KHÔNG THIẾT THỰC

- **MIDI Priority** (Realtime / Ultra Low Latency / No Buffer / No Queue) và **MIDI Workflow** (sơ đồ Controller → AUTO MENU AI → DAW → Plugin): chỉ là chữ trang trí. Nhãn trông như công tắc nhưng chính mục này ghi ‘không phải công tắc’.
- **Phím tắt** (Dashboard): có chạy thật (`renderer.js` dòng \~3258), nhưng chỉ nhận phím khi **cửa sổ Menu đang được chọn**. Không có phím tắt toàn cục (`globalShortcut` không tồn tại trong `app/`). Khi bạn đang đứng ở DAW để hát thì phím tắt không dùng được.
- **Audio Output**: chỉ đổi loa cho tiếng Clap/Laugh do app tự phát, không điều khiển được đường phát của DAW hay Windows (mục này tự ghi rõ).
- **Chữ hướng dẫn quá kỹ thuật:** nhiều dòng nhắc mã task (A54, A55, C60, B72), tên file (`capabilityRegistry.js`, `A70-REPORT.md`) và tham chiếu tới nơi không còn tồn tại (mục ‘Thiết lập AutoMenu’, tab ‘Chọn DAW’). Người dùng không biết lập trình sẽ khó hiểu.
- **Vị trí khó tìm:** đường dẫn DAW, Mở Project/Youtube nằm trong tab **AI 🔒**, trong khi tab DAW lại không có chỗ chọn đường dẫn.
- **Danh sách phiên bản DAW** (Studio One 5/6/7, Studio Pro 8, Cubase 10–15): chính mục này ghi Cubase ‘chưa có driver riêng’ và nhiều phiên bản Studio One ‘UNVERIFIED’.

## 4. Lỗi nhỏ phát hiện thêm ở Menu (`ui/index.html`)

- Dòng 304–306 nạp `./menu-api-client.js` nhưng file này nằm ở `app/menu-api-client.js` (do `app/main.js` nạp), **không có trong `ui/`** → khi mở Menu, trình duyệt báo thiếu file; kế đó `new MenuKeyClient(...)` lỗi vì chưa được định nghĩa; trước thẻ đóng script còn có một chữ `s` lạc. Tác động: lỗi trong console, đoạn này không chạy. (Chưa chạy app thật nên NOT TESTED.)
- Thẻ BPM luôn hiện chữ cố định **‘Confidence 98%’** (không có mã nào ghi đè) → con số không phản ánh độ tin cậy thật.
- Thanh chạy chữ **‘Thời hạn Key: Vĩnh viễn (Pro Active)’** là chữ cố định, không đọc từ Key Server.

## 5. Ý KIẾN RIÊNG CỦA CLAUDE B (tách khỏi phần kiểm tra ở trên)

Bạn đã cho phép tôi nêu ý kiến riêng. Các đề xuất dưới đây đa số **cần sửa HTML** (đang bị cấm), nên tôi chỉ đề xuất, chưa làm gì. Thứ tự theo mức rủi ro thấp đến cao:

1. **Không cần sửa HTML, sửa được ngay:** bỏ mã chết (`initAutoLaunchSection`, các lệnh gọi tới id không tồn tại); thêm `menu-api-client.js` cho đúng chỗ hoặc bỏ đoạn script lỗi ở Menu. Rủi ro thấp.
2. **Nên làm trước (ảnh hưởng thật):** đổi tên thẻ ‘Microphone (Input Device)’ thành ‘Audio Interface’ và làm thanh đo thử trong Setup đo đúng thiết bị ở thẻ MIC Input. Hiện hai thanh đo khác nhau là chỗ dễ gây hiểu nhầm nhất.
3. **Quyết định cho Khói:** hoặc nối thật khối Startup & Paths (cần task riêng, vì chạm vào khởi động Windows và DAW), hoặc ghi rõ ‘chỉ lưu, chưa chạy’ lên giao diện. Hiện giao diện làm người dùng tin rằng ô đó hoạt động.
4. **Gộp 3 nơi lưu đường dẫn DAW thành 1** — đây là đổi kiến trúc nên phải giải thích trước và được Khói đồng ý.
5. **Ẩn bớt** các khối chỉ trang trí (MIDI Priority, MIDI Workflow, sơ đồ Mapping khái niệm, Hidden DAW, AI Readiness, ‘MIDI Learn mục lưu trữ cũ’) — cần sửa HTML.
6. Phím tắt toàn cục (nếu bạn muốn dùng khi đang ở DAW) là thay đổi lớn, nên làm riêng sau.

Lưu ý: tôi chưa xác nhận bên ngoài code liệu bạn **muốn** giữ các khối đặt chỗ sẵn cho tính năng tương lai. Quyết định giữ hay ẩn là của bạn/Khói.

## 6. Báo cáo theo mẫu Claude C : Task B

1. **File đã sửa:** không có. Đây là audit, không sửa file nào. Đã đọc: `ui/setup.html`, `ui/index.html`, `ui/js/setup.js`, `ui/js/setupNav.js`, `ui/js/setupMidiInput.js`, `ui/js/setupStartupPaths.js`, `ui/js/setupVuMeter.js`, `ui/js/renderer.js`, `ui/js/appSettings.js`, `app/main.js`, `app/DawTray.js`, `core/integration/DawLauncher.js`.
2. **Vì sao sửa:** không áp dụng (không sửa).
3. **Có ảnh hưởng module nào không:** không. Chỉ đọc, không chạm Setup, AI Engine, Manual Key, D1, WASAPI, VU, Now Playing, Auto Song Collector.
4. **Còn việc gì chưa làm:**
   - Chạy app thật trên Windows để xác nhận các kết luận ‘lúc chạy’ (NOT TESTED).
   - Chưa đọc kỹ `ui/effects.html`, `ui/js/setupEffects.js`, `ui/js/setupTools.js` (mục Hiệu Ứng và Công cụ & Sửa lỗi) từng nút một.
   - Chưa xác minh nhãn ‘AI 🔒’ có thật sự bị khoá bằng đăng nhập Admin hay không (`adminAuthUI.js`).
   - Chờ bạn chọn mục nào ở phần 5 để làm tiếp (mỗi mục sửa sẽ làm thành task riêng, nêu rõ file và rủi ro trước khi làm).
