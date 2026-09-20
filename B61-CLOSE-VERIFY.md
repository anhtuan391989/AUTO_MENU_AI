# CLAUDE B : TASK B61 report — MIDI + D1 RUNTIME CLOSURE

## 0. Kết luận ngắn

```
B61 STATIC/RUNTIME CLOSED — HARDWARE VERIFICATION PENDING
(kèm 1 REAL BUG đã sửa, 2 phát hiện PRE-EXISTING cần Khói quyết định — xem mục 6/14)
```

| Mức xác minh | Kết quả |
|---|---|
| STATIC VERIFIED (đọc mã + đối chiếu chéo D1/matrix/loader/registry/UI) | ✅ |
| RUNTIME VERIFIED (chạy mã thật với backend GIẢ LẬP: easymidi, Web MIDI, AHK TCP) | ✅ |
| HARDWARE VERIFIED (loopMIDI / RtMidi-WinMM / Studio One / AutoHotkey thật) | ❌ **NOT VERIFIED** — sandbox Linux, không có `/dev/snd/seq`, không có DAW |

> Lưu ý phạm vi: đề bài ghi đường dẫn `docs/midi-mapping.xml` … nhưng file thật nằm ở `docs/d1/`. Đề bài cũng
> nêu "runtime vẫn dùng `ACTION_TO_CAPABILITY` hard-code" — **không còn đúng ở baseline này** (đã xoá ở B38-FIX, xem mục 5).

---

## 1. BASELINE SHA

```
origin/main  e17350014b7cadd45f6ccd0b991517f4279c0460   (đã `git fetch`, HEAD == origin/main)
Commit code B61 (local, CHƯA push — sandbox không có quyền push):  b6fe0c3
```

Baseline test trước khi sửa: `D1SpecValidation` 36/0, `B38D1RuntimeIntegration` 27/0, `MidiLearnDispatch` 54/0,
`PortSelectionPolicy` 23/0, `MidiHealth` 15/0, `CommandRuntimeHealth` 20/0 … tất cả PASS
(test `D1SpecValidation` KHÔNG còn crash vì sai path — đã ổn từ trước B61, không cần sửa).

---

## 2. ACTUAL RUNTIME PATH (có bằng chứng import/call)

Repo có **2 đường MIDI độc lập** + 2 fallback. Không có đường nào đi qua `core/command-engine-ts/*` hay `core/drivers/*`.

**Đường A — MIDI Learn → DAW (main process, Node, D1-gated)**
```
Controller → easymidi.Input                       runtime.js:openMidiInput()
 → dispatchFromMidi(key "type:ch:num")            runtime.js
 → d1GatedMappingIndex.get(key)                   runtime.js  ← xây bởi loadD1AndRebuild()
      ← d1Loader.loadD1FromDisk(): XML → XSD(xmllint-wasm) → semanticValidate → capability list
      ← d1Loader.buildD1GatedMapping(settings.midiMappingsV1, capabilities)
 → CommandEngine.dispatch({targetId, action})     commandEngine.js
 → capabilityRegistry.getCapability()             studio_one: priority ['mcu','hotkey']
 → driver 'mcu' = MidiDriver → easymidi.Output    midiDriver.js   (noteon 0x5e/0x5d/0x5f)
 → nếu mcu lỗi/không ready → driver 'hotkey' = HotkeyDriver → TCP 127.0.0.1:6789
```
Nạp bởi: `app/main.js` → `require("../core/command-engine-js/runtime")`, `CommandRuntime.start({readSettingsFile})`,
`reloadMappings()` (IPC setup-changed), `autoConnect()` (IPC midi-auto-connect).

**Đường B — Key/Tone → Auto-Tune/SoundShifter (renderer, Web MIDI)**
```
renderer.js → sendKeyToAutotune / sendToneStep / sendToneStepToSoundShifter   ui/js/vocalCommandRouter.js
 → sendMidiNotePulse / sendMidiCC → navigator.requestMIDIAccess → output.send  ui/js/appSettings.js
 → (không có cổng MIDI) → window.electronAPI.clickAtPoint → IPC "click-at-point" → execFile(AutoHotkey, ahk/click.ahk x y)   app/main.js
```
Đường B **không** đi qua D1 (D1 không có capability nào cho Key/Tone — xem F4).
Đường phụ: `ui/js/actionRegistry.js` (nút UI → MIDI out do người dùng cấu hình `dawMidiOutMappings`, hoặc click toạ độ).

**Không phải runtime (chứng minh bằng grep `require(...)` ngoài comment):**
`core/command-engine-ts/*` (0 tham chiếu), `core/drivers/*` (0 `require`), `core/command-engine-js/index.example.js` (ví dụ),
`semanticValidate.js` (chỉ `d1Loader.js` require; `tools/b37-poc` là script PoC).

---

## 3. D1 SOURCE-OF-TRUTH RESULT — STATIC + RUNTIME ✅

- `docs/d1/midi-mapping.xml` **là** nguồn mapping duy nhất cho "capability nào được dispatch qua MIDI" — runtime nạp thật lúc `start()`.
- XML well-formed + XSD (xmllint-wasm) + Semantic (Rule A1/B2/M4/M6, schemaVersion) đều PASS; 8 capability, 0 binding (đúng Rule M3).
- Đối chiếu chéo cả 8 capability: D1 XML ⇔ `capability-backend-matrix.md` (status + midi-allowed khớp 100%) ⇔ `CAPABILITY_BACKEND_TARGET` ⇔ `capabilityRegistry.js`.
  `implemented` (daw:play/stop/record) có target + driver; `pending-backend`/`not-supported` (daw:save, menu:buttonA/B, plugin:retune/humanize) **không** có target.
- Dropdown Setup có 10 action ID: 7 nằm trong D1; 3 (`fn:autoDetect`, `preset:load`, `keymod:doTone`) **ngoài D1** — đúng như `midi-mapping-rules.md` mục "Namespace exceptions". Không tự thêm. `daw:save` có trong D1 nhưng không có trong UI.

## 4. LOADER RESULT ✅ (đã có sẵn từ B38 — B61 KHÔNG tạo loader mới)

`core/command-engine-js/d1Loader.js` + `runtime.loadD1AndRebuild()` đã làm đúng flow đề bài: XML → validate (XSD → semantic) → capability map chuẩn hoá → mapping runtime, **fail-closed** (XML hỏng/thiếu file ⇒ mapping rỗng, không crash).
Ràng buộc môi trường: xmllint-wasm dùng worker_threads ⇒ nạp **bất đồng bộ**, nên trong vài trăm ms đầu `dispatchFromMidi` không dispatch (an toàn).
Ghi chú: `semanticValidate.js` (regex parser) vẫn có header cũ "không được require bởi runtime" — thực tế `d1Loader.js` require nó từ B38 (lệch comment, không lệch hành vi).

## 5. ACTION_TO_CAPABILITY RESULT

| Câu hỏi đề bài | Trả lời (có bằng chứng) |
|---|---|
| Còn cần thiết không? | **Không tồn tại nữa** trong code (0 dòng code; đã xoá ở B38-FIX). Test kiểm tra trên 10 file runtime. |
| Vai trò thay thế? | `d1Loader.js:CAPABILITY_BACKEND_TARGET` — chỉ metadata `capability → {targetId, action}` (3 entry). D1 XML **không có** field đó ⇒ không phải mapping thứ hai. |
| Trùng/mâu thuẫn D1? | Không. Nếu D1 đổi `midi-allowed=false`, `buildD1GatedMapping` tự loại binding. |
| Còn sót ở đâu? | Chỉ trong **tài liệu/comment**: `capability-backend-matrix.md`, `midi-mapping-rules.md` (Rule B3), comment đầu `midi-mapping.xml`, `D1-REPORT.md`, `semanticValidate.js`. |
| Đã xử lý? | Thêm 1 mục "Ghi chú B61" cuối `capability-backend-matrix.md` (con trỏ evidence mới, KHÔNG đổi status nào). **Không sửa** text Rule B3 trong `midi-mapping-rules.md` (là contract D1 — đổi cần Khói quyết định). |

## 6. FINDINGS (phân loại + evidence)

| # | Phân loại | Nội dung | Trạng thái |
|---|---|---|---|
| **F1** | **REAL BUG** | **Cổng MIDI lưu sẵn chưa tồn tại lúc app khởi động (vd loopMIDI chưa chạy) ⇒ D1 không bao giờ nạp + MIDI Input không mở + không thể mở lại nếu không restart.** Root cause: (1) `runtime.start()` — `new MidiDriver()` throw nằm chung try với `loadD1AndRebuild()`/`openMidiInput()` ⇒ 2 việc này bị bỏ qua; (2) `reopenOutputDriver()` return sớm khi `portName === configuredPortName`, mà biến này đã bị gán *trước* khi mở ⇒ mọi `reloadMappings()`/`autoConnect()` sau đó (cùng tên cổng) không thử lại. Evidence (mock easymidi): trước sửa `d1=not-loaded, mapping=0, out=false` và sau khi cổng xuất hiện + reload vẫn `out=false`. | **ĐÃ SỬA** (mục 9) |
| **F2** | PRE-EXISTING | Fallback `hotkey` của CommandRuntime (TCP 127.0.0.1:6789 → AHK) **không có service thật trong repo**: `ahk/main.ahk` tự nhận là "bản rút gọn minh hoạ", dùng hàm socket giả định (`Socket_Listen`…), cú pháp AHK v1 (`#Persistent`, `Send, %`) trong khi `click.ahk` là v2; không file nào khởi chạy nó (grep: chỉ có 1 comment nhắc `ahk-service/main.ahk`, thư mục không tồn tại). ⇒ `hotkey.isReady()` = false trừ khi người dùng tự chạy thứ khác. Thêm: `transportStop` dùng phím `Space` (toggle) ⇒ nếu fallback chạy được, "Stop" khi đang dừng sẽ *phát*. | **Không sửa** — cần Khói quyết định (viết service thật hay bỏ fallback) |
| **F3** | PRE-EXISTING, LOW | Nếu `MIDIOutput.send()` throw (cổng vừa bị rút sau khi tra map), `sendKeyToAutotune` **reject** thay vì rơi sang click; `renderer.js:863,1099` gọi `.then()` không `.catch()`. Web MIDI spec cho phép `InvalidStateError`; Chromium thật NOT VERIFIED. (`actionRegistry.executeAction` thì đã có try/catch.) | Ghi nhận, không sửa |
| **F4** | OUT OF D1 SCOPE (thiết kế) | `vocalCommandRouter.js` hard-code: `NOTE_MAP` C=0…B=11, CC20/21 (Tone), CC22/23/24 (SoundShifter, chính code ghi `TODO — đổi theo CC thật`). D1 không có capability Key/Tone ⇒ đề bài cấm thêm action mới. Không phải "mapping mâu thuẫn D1", nhưng là số MIDI chưa được xác nhận với plugin thật. | Không sửa |
| F5 | Doc drift | Xem mục 5; đường dẫn trong đề bài (`docs/…`) lệch `docs/d1/…`. | Ghi chú đã thêm |
| F6 | Dead code | `actionRegistry.js:MIDI_LEARN_ACTION_TO_LOGICAL` (3 entry daw:*) khai báo nhưng **không nơi nào dùng**; `core/command-engine-ts`, `core/drivers` không nạp. Không xoá (theo đề bài). | Ghi nhận |
| F7 | OBSERVED | Nhánh MCU chỉ gửi **note-on** (velocity 100), không note-off/velocity 0. Studio One có xử lý ổn hay không ⇒ chỉ hardware mới biết. | HARDWARE NOT VERIFIED |
| F8 | NOT VERIFIED | `ensureAutoMenuAiPort()` trên Linux/macOS tạo virtual port rồi `close()` ngay — port có còn tồn tại sau đó không, sandbox không có ALSA nên không kiểm được. **Không ảnh hưởng Windows** (nhánh này không chạy trên win32). | NOT VERIFIED |
| F9 | Ghi nhận | IPC `ai-command` → `CommandRuntime.dispatch({targetId,action})` **không** qua D1 gate (không phải đường MIDI). Hiện không có caller nào trong `ui/js`. | Ghi nhận |

## 7. MIDI PORT RESULT (B61.5) — RUNTIME (mock) ✅, HARDWARE ❌

- Reuse "AUTO MENU AI": nếu đã tồn tại ⇒ `REUSED`, **0** virtual port mới qua 3 lần `autoConnect` (win32 và linux), chỉ 1 Input + 1 Output đang mở.
- Không tồn tại + win32 ⇒ `PLATFORM_UNSUPPORTED` rõ ràng, `ok=false`, không tạo gì, không giả vờ kết nối.
- `reloadMappings()` ×3 cùng cổng ⇒ đúng 1 Input mở (Input cũ đóng), 1 Output (không mở lại vô ích).
- Cổng vắng lúc start ⇒ (sau F1-fix) D1 vẫn nạp, health báo lỗi thật, hotkey fallback còn; cổng xuất hiện ⇒ `autoConnect()`/`reloadMappings()` mở lại được **không cần restart**.
- Cổng bị rút giữa chừng ⇒ `send()` throw bị bắt ⇒ mcu `ok:false` ⇒ fallback hotkey. `isReady()` vẫn true (chỉ phát hiện qua lỗi gửi).
- **Còn thiếu:** không có watcher hot-plug thụ động (cắm loopMIDI sau khi app chạy ⇒ phải bấm Auto Connect / lưu Setup). Không thêm vì sẽ mở rộng kiến trúc.

## 8. MIDI BACKEND RESULT (B61.6/B61.7) + FALLBACK RESULT

- Capability (đủ 11 binding thử, qua `runtime.js` thật): `daw:play/stop/record` ⇒ Output nhận đúng `noteon 0x5e/0x5d/0x5f`, ch1, vel 100. `daw:save`, `menu:buttonA/B`, `plugin:retune/humanize` ⇒ `D1_MIDI_NOT_ALLOWED`, **0** lệnh phát ra. 3 action ngoài D1 ⇒ `UNKNOWN_CAPABILITY_IN_D1`. Không thêm action mới.
- Web MIDI (appSettings + vocalCommandRouter, vm): `sendMidiNoteOn/NoteOff/CC` đúng status byte theo kênh (0x9n/0x8n/0xBn), data chặn 7-bit; Key ⇒ note-on rồi note-off (C=0, A#=10); Tone ⇒ CC20/21.
- **Fallback click-at-point → AHK** (đường B): logic giữ nguyên — không có MIDI hoặc cổng đã lưu mất ⇒ `clickAtPoint(point)`; Mouse Control OFF ⇒ `MOUSE_DISABLED`, 0 click; chưa cấu hình gì ⇒ lỗi rõ, không gửi mò. Chuỗi IPC `preload → ipcMain "click-at-point" → runAhkClick → execFile(AutoHotkey, ahk/click.ahk)` xác nhận tĩnh; **chạy AutoHotkey thật: NOT VERIFIED**.
- **Fallback hotkey → TCP:6789** (đường A): giao thức của `HotkeyDriver` đã chạy thật với AHK **giả** (nhận đúng `{"type":"send_keys","keys":"Space"}`) ⇒ phía Node đúng; **phía AHK thật không tồn tại trong repo (F2)**.

## 9. FILES CHANGED (kèm thư mục đích)

| File (đường dẫn trong project) | Loại | Nội dung |
|---|---|---|
| `core/command-engine-js/runtime.js` | SỬA (+21/−6) | (1) `start()`: bọc riêng `new MidiDriver()` trong try/catch nội bộ — lỗi Output chỉ ảnh hưởng driver `mcu`, không chặn nạp D1 và mở Input. (2) `reopenOutputDriver()`: chỉ bỏ qua khi cổng không đổi **và** driver đang sống (hoặc đã bỏ chọn) ⇒ cho phép thử mở lại cùng tên cổng. Không đổi thuật toán, không đổi mapping/CC/Note/action. |
| `tests/unit/MidiD1RuntimeB61.verify.js` | MỚI | 61 kiểm chứng (mục 10). |
| `docs/d1/capability-backend-matrix.md` | SỬA (chỉ thêm cuối file) | Ghi chú B61: con trỏ evidence `ACTION_TO_CAPABILITY` → `CAPABILITY_BACKEND_TARGET`. Không đổi dòng/status nào. |
| `B61-CLOSE-VERIFY.md` (thư mục gốc project) | MỚI | Báo cáo này. |

`runtime.js` **không** nằm trong danh sách "ưu tiên" của đề bài nhưng cũng **không** nằm trong vùng khóa; sửa vì B61.5 (device lifecycle) không thể đạt nếu không sửa F1. Không đụng: keyEngine.js, core/ai, audioSource.js/B58, WASAPI, Manual/AI Key, `ui/setup.html*`, vocalCommandRouter.js, appSettings.js, D1 XML/XSD/semanticValidate, schema, UI/C60.

## 10. TEST COMMANDS

```bash
node tests/unit/MidiD1RuntimeB61.verify.js          # mới (cần npm install: xmllint-wasm, easymidi)
node tests/unit/D1SpecValidation.verify.js
node tests/unit/B38D1RuntimeIntegration.verify.js
node tests/unit/MidiLearnDispatch.verify.js
node tests/unit/PortSelectionPolicy.verify.js
node tests/unit/CommandRuntimeHealth.verify.js
node tests/unit/MidiHealth.verify.js
for f in tests/unit/*.verify.js; do node "$f"; done  # toàn bộ 61 file
```

## 11. TEST RESULTS

| Test | Kết quả |
|---|---|
| `MidiD1RuntimeB61` (mới) | **61 PASS / 0 FAIL** (chạy trên runtime.js **trước** sửa: 57 PASS / **4 FAIL** — đúng 4 kiểm chứng của F1 ⇒ test thật sự bắt được lỗi) |
| D1SpecValidation | 36 / 0 |
| B38D1RuntimeIntegration | 27 / 0 |
| MidiLearnDispatch | 54 / 0 |
| PortSelectionPolicy | 23 / 0 |
| CommandRuntimeHealth | 20 / 0 |
| MidiHealth | 15 / 0 |
| PluginCommandBridge / MonitorBeatRetuneBackend / MonitorBeatToggle / DawLauncherC56 / DawSetupPersistence / MouseControlGate | 12 / 12 / 3 / 20 / 12 / 23 — đều 0 FAIL |

## 12. HARDWARE / DAW VERIFICATION LEVEL

```
[x] STATIC VERIFIED
[x] RUNTIME VERIFIED   (backend giả lập: easymidi, Web MIDI, AHK TCP)
[ ] HARDWARE VERIFIED  ← CHƯA. Chưa có bằng chứng loopMIDI/WinMM/Studio One nhận đúng lệnh,
                          chưa chạy AutoHotkey thật, chưa xác nhận hành vi Chromium Web MIDI khi rút cổng.
```
Không claim tương thích DAW nào.

## 13. REGRESSION

Toàn bộ `tests/unit/*.verify.js` (61 file): **59 PASS, 2 FAIL — cả 2 FAIL ĐÃ TỒN TẠI TRƯỚC B61** (chạy lại trên baseline, `runtime.js` chưa sửa: vẫn 32 PASS/4 FAIL và 3 PASS/4 FAIL):
- `AiSystemBoundaryA56.verify.js` — 4 FAIL (test còn kỳ vọng `renderer.js` gọi `getUserMedia` trực tiếp; đã đổi sang AudioSource ở B58) ⇒ **BLOCKED — OUT OF SCOPE (Audio/B58)**.
- `MenuMinimizeRuntime.verify.js` — 4 FAIL (`minimizeWindow`/`minimize-window` không còn trong preload/main) ⇒ **BLOCKED — OUT OF SCOPE (UI/C60)**.

Lưu ý môi trường: `AutoSongCollector`/`NowPlayingResolver` sẽ FAIL nếu chạy khi working tree đang có sửa đổi chưa commit (test kiểm `git status`); PASS khi đã commit.

## 14. FINAL STATUS

```
B61 STATIC/RUNTIME CLOSED
HARDWARE VERIFICATION PENDING
```
Không ghi "CLOSED tuyệt đối" vì còn: hardware chưa test; F2 (service AHK cho hotkey fallback không tồn tại); F3; F4.

### Ý KIẾN CỦA CLAUDE B (tách riêng khỏi phần audit — đây là khuyến nghị, không phải sự kiện)
1. **Ưu tiên cao nhất khi có máy Windows:** chạy thật Play/Stop/Record qua loopMIDI → Studio One (xác nhận F7: chỉ note-on có đủ không) — đây là bước duy nhất nâng lên HARDWARE VERIFIED.
2. **F2 nên quyết định sớm:** hoặc viết service AHK thật cho cổng 6789, hoặc bỏ `hotkey` khỏi `studio_one.priority` để khỏi tưởng là có fallback. Hiện tại nếu cổng MIDI hỏng thì "Play/Stop" gần như không có đường dự phòng thật.
3. F3 sửa rất rẻ (try/catch trong 3 hàm `sendMidi*` trả `false`) nhưng nằm ở `appSettings.js` và thay đổi hợp đồng "không throw" — chờ Khói đồng ý.
4. Số CC 22/23/24 (SoundShifter) và CC 20/21 (Tone) vẫn là "ví dụ" trong code — nên MIDI Learn thật rồi chốt.
