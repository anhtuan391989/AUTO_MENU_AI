# C2-REPORT.md — Deep Reference Audit + Integration Test Plan

**Owner:** Claude C (Auditor — read-only)
**Ngày:** 2026-08-27
**Nguồn:** Cùng ZIP đã dùng cho C1 (không có ZIP mới được cung cấp cho C2) — `git log` xác nhận HEAD vẫn là `9d86f42`, giống hệt baseline C1.
**Ý nghĩa:** Vì không có snapshot mới, C2 **không thể xác nhận Claude A hoặc Claude B đã có thay đổi gì** kể từ C1. Mọi phần liên quan trực tiếp tới tiến độ MỚI của A/B được đánh dấu `WAITING FOR CLAUDE A` / `WAITING FOR CLAUDE B` thay vì suy đoán.
**Production code changed by Claude C:** **0** — xác nhận lại bằng `git status`/`git diff` cuối báo cáo.

---

## A. Executive Summary

C2 hoàn thành được toàn bộ phần **audit tĩnh** (deep reference dependency trace) và **chạy thử bộ test hiện có** (33 file `*.verify.js`, không phải 24 như C1 ghi nhầm — đính chính tại đây). C2 **không thể** hoàn thành phần đòi hỏi thay đổi mới từ Claude A/B vì không có snapshot mới nào khác C1.

**Kết quả nổi bật:**
- 7 file "UNKNOWN" của C1 nay đã phân loại dứt khoát: **3 file LIVE thật** (được `NowPlayingResolver.js` require, chạy trong runtime chính), **4 file ORPHAN thật** (một cụm "Song Self-Collector" hoàn chỉnh, có test riêng, nhưng **tự nhận trong comment là chưa được gắn vào Event Flow** — không phải code chết do bỏ quên, mà là tính năng cố ý chưa kích hoạt).
- Chạy 33 test: **29 PASS sạch**, **2 FAIL do nhiễu môi trường (git-noise từ ZIP, không phải lỗi code thật)**, **2 FAIL thật thuộc lãnh địa Claude A** (Key Engine) — đã định vị chính xác nguyên nhân, không tự sửa.
- Xác nhận AI/Manual isolation tại boundary integration: **không phát hiện vi phạm nào** trong phạm vi trace được (không đọc sâu thuật toán bên trong keyEngine.js — đúng phạm vi khoá).
- MIDI/D1 boundary: virtual port "AUTO MENU AI" có cơ chế reuse-trước-khi-tạo rõ ràng, không phát hiện nguy cơ tạo trùng port trong code path đã trace — nhưng đây vẫn là code của Claude B, C2 chỉ xác nhận **trạng thái tại thời điểm C1**, không có gì mới để audit thêm.

---

## B. Deep Reference Audit — 7 file UNKNOWN của C1

### B.1 Bảng phân loại dứt khoát

| File | Phân loại | Bằng chứng |
|---|---|---|
| `SourceDetector.js` | **LIVE** | `require("./SourceDetector")` tại `core/reference/NowPlayingResolver.js:3`. `NowPlayingResolver` được `app/main.js:87` require trực tiếp và **gọi thật** trong handler `windowsMediaSession.on("change", ...)`. Đường dẫn 2 chiều: `main.js → NowPlayingResolver.resolve() → SourceDetector` xác nhận chạy trong runtime chính. |
| `TitleNormalizer.js` | **LIVE** | `require("./TitleNormalizer")` tại `NowPlayingResolver.js:4`. Cùng đường dẫn LIVE như trên. |
| `ResolverUtils.js` | **LIVE** | `require("./ResolverUtils")` tại `NowPlayingResolver.js:5` (destructure `CONFIDENCE`, `readId3Tags`). Cùng đường dẫn LIVE. |
| `KeyVerifier.js` | **ORPHAN** | Chỉ được require tại `core/reference/index.js:3`. Bản thân `core/reference/index.js` **không được require ở bất kỳ đâu khác trong toàn repo** (đã grep repo-wide, 0 kết quả). Chính comment trong `index.js` tự thừa nhận: *"module này CHƯA được gắn vào Event Flow/IPC hiện có... Muốn dùng, nơi gọi tự require('../reference') khi cần"* — xác nhận đây là orphan **có chủ đích**, không phải bỏ quên. |
| `AutoSongCollector.js` | **ORPHAN** | Chỉ được require bởi chính test của nó (`tests/unit/AutoSongCollector.verify.js:52`). Không một file production nào (`app/main.js`, `renderer.js`, `core/ai/*`) require file này. Test PHẦN E của chính nó tự xác nhận: *"Không require bất kỳ file nào trong core/ai"*, *"keyEngine.js không bị đụng tới"* — đây là 1 tính năng "tự xây Song Database" hoàn chỉnh, có test pass (trừ 1 false-fail do git-noise, xem mục G), nhưng **chưa bao giờ được gọi từ đâu trong app thật**. |
| `SongCollectorState.js` | **ORPHAN** | Chỉ được require bởi `AutoSongCollector.js` (cùng cụm) và test của chính nó. Không nằm trong dependency graph của `app/main.js`. |
| `SongCollectorUtils.js` | **ORPHAN** | Chỉ được require bởi `AutoSongCollector.js` và `SongCollectorState.js` (nội bộ cụm). Bản thân file này **cố ý không require bất kỳ module nào khác** (comment tự ghi: "tách biệt hoàn toàn để dễ test độc lập"). |

### B.2 Side-effect khi load (module-level)

Đã quét cả 7 file cho code chạy ở top-level (ngoài function/class body): **không phát hiện side-effect nào** (không `fs.*`, không `console.*`, không `setTimeout/setInterval`, không đọc file ở module scope). Riêng `SongDatabase.js` (được `AutoSongCollector`/`SongMatcher` dùng) có `fs.readFileSync`/`writeFileSync` nhưng **chỉ bên trong method của class**, constructor chỉ gán `this.filePath` — không I/O khi `require()`.

### B.3 Dynamic require / path — có khả năng bị bỏ sót?

Đã `grep -rn "require(" ` toàn bộ 4 file ORPHAN + kiểm tra không có pattern `require(variable)`, `require(\`...\`)`, hay `path.join(...)` truyền vào `require()` ở bất kỳ đâu trong `app/`, `core/`, `ui/`. Tất cả require trong repo đều là chuỗi tĩnh (`require("./X")`). **Kết luận: không có khả năng nào các file này được nạp qua dynamic require mà tôi bỏ sót** — grep tĩnh đủ tin cậy cho trường hợp này (không giống 1 số codebase dùng `require(configPath)` hay plugin-loader động).

### B.4 Cụm "Song Reference System" — bức tranh đầy đủ

```
core/reference/
 ├── SongDatabase.js      ─┐
 ├── SongMatcher.js       ─┼─ LIVE (require bởi app/main.js trực tiếp/gián tiếp)
 ├── NowPlayingResolver.js ┘
 │     ├── SourceDetector.js    ─┐
 │     ├── TitleNormalizer.js   ─┼─ LIVE (indirect, qua NowPlayingResolver)
 │     └── ResolverUtils.js     ─┘
 │
 ├── index.js  ────────────── ORPHAN (điểm vào của cụm dưới đây, không ai require)
 │     ├── KeyVerifier.js        ── ORPHAN
 │     ├── AutoSongCollector.js  ── ORPHAN (dùng SongDatabase + SongMatcher — 2 module LIVE,
 │     │                                    nhưng bản thân AutoSongCollector không LIVE)
 │     ├── SongCollectorState.js ── ORPHAN
 │     └── SongCollectorUtils.js ── ORPHAN
```

**Lưu ý cho roadmap (không phải quyết định của C):** cụm ORPHAN này là 1 tính năng "tự động xây Song Database không cần người dùng nhập tay" đã code xong, có test pass thật (không phải test giả), nhưng nằm ngoài luồng chạy. Nếu owner muốn kích hoạt, chỉ cần 1 dòng require + 1 điểm gọi `collect()` ở nơi nhận kết quả Key/BPM ổn định (`ai-result` handler trong `app/main.js`, hoặc trong chuỗi `AnalysisState`) — nhưng đây là quyết định tích hợp, **ngoài phạm vi C2 (chỉ audit, không tự nối)**.

---

## C. Actual Runtime Graph (xác nhận lại, không đổi so với C1)

```
package.json ("main": "app/main.js")
  → app.whenReady()
      → createMainWindow() / createSetupWindow()   [Electron, preload contextBridge]
      → AIBootstrap.initialize()                    [core/ai/* — pipeline EventBus 5 tầng]
      → CommandRuntime.start()                      [core/command-engine-js/runtime.js — Claude B]
      → new WindowsMediaSession().start()            [SMTC, độc lập hoàn toàn]

KeyEngine (renderer, ui/js/engines/keyEngine.js — Claude A)
  → estimateKeyFromChroma() / watchContinuous()
  → renderer.js gửi IPC "ai-result" {type:"key", payload}
  → app/main.js: AIContext.updateKey() + EventBus.publish(KEY_UPDATED)
  → AnalysisState.js (đọc AIContext, publish KEY_CHANGED nếu đổi thật)
  → InferenceEngine.js → ResultQueue.js (ANALYSIS_RESULT) → DecisionEngine.js (DECISION_READY)
  → core/ai/workflow/WorkflowManager.js (WORKFLOW_READY)
  → core/ai/plugin/PluginController.js
        - đọc ControlSource.getControlSource() (LEGACY_CONTROL mặc định — không tự gửi lệnh)
        - đọc ManualState.getManualState() + chạy qua ManualPriorityGuard (fail-safe BLOCK)
        - chỉ publish PLUGIN_COMMAND khi ControlSource === AI_CONTROL
  → app/main.js: EventBus.subscribe(PLUGIN_COMMAND) → mainWin.webContents.send("plugin-command")
  → renderer.js: window.electronAPI.onPluginCommand() → case "SHIFT_KEY" → bridgeSemitoneDelta()
       → clickAtPoint() (Auto-Tune Retune, qua AutoHotkey)

UI Action (nút bấm/knob)
  → actionRegistry.js: executeAction(ACTION, context)
  → getMidiOutMapping(action) [đọc dawMidiOutMappings đã lưu qua Setup]
      có mapping → sendMidiCC()/sendMidiNotePulse() [appSettings.js, Web MIDI API renderer]
      không có  → thử mouse-coordinate fallback (chỉ DAW_PLAY/STOP/RECORD có key toạ độ)
      không có gì → NOT_CONFIGURED (trả về, không bịa)

CommandRuntime (song song, độc lập với executeAction() ở trên — 2 dispatcher KHÔNG cùng nghe
1 mapping, đã gỡ trùng theo comment actionRegistry.js)
  → commandEngine.js → capabilityRegistry.js (per-DAW capability map)
  → hotkeyDriver.js / midiDriver.js (Node, easymidi thật)
  → ensureAutoMenuAiPort() → reuse nếu đã tồn tại, KHÔNG cố tạo mới trên Windows (đúng giới hạn
    RtMidi/WinMM đã xác nhận từ node_modules/@julusian/midi/README.md)
  → gửi ra DAW (Studio One, qua MIDI/hotkey)
```

**Không phát hiện điểm giao cắt ẩn nào** giữa 2 nhánh `executeAction()` (renderer, Web MIDI) và `CommandRuntime` (main process, Node easymidi) — xác nhận lại kết luận C1: 2 hệ thống MIDI dispatch tách biệt, không đá nhau.

---

## D. AI / Manual Isolation Audit

**Trace boundary (không đọc thuật toán bên trong keyEngine.js — đúng phạm vi khoá):**

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| AI có ghi vào Manual state không? | **KHÔNG** | `ai-result` IPC handler (`app/main.js:331-351`) chỉ gọi `AIContext.updateKey/updateBpm/updateMod()` + `EventBus.publish()`. Không có dòng nào trong handler này gọi `ManualState.setManualState()`. Đã grep toàn bộ `ManualState.setManualState(` — chỉ 1 call site duy nhất: `report-manual-state` IPC handler (`app/main.js:274`), tách biệt hoàn toàn kênh IPC với `ai-result`. |
| Manual SEND có vô tình lấy AI Key không? | **KHÔNG phát hiện** | `applyKeyBtn` (SEND) trong renderer đọc từ `keySource.manual` (dropdown `keySelector`), không đọc `keySource.ai`. Test `ManualState.verify.js` (13 PASS) xác nhận `getManualState()` trả `null` cho tới khi có `setManualState()` thật được gọi — không có cơ chế nào tự khởi tạo Manual từ AI. |
| `keySource.ai` ≠ `keySource.manual` ở tầng UI | **Xác nhận tách biệt** | 2 field riêng trong renderer.js (Key Source Manager, mục 7B) — `KeyEngine.onProvisionalEstimate()` chỉ ghi `keySource.ai.provisional`, dropdown chỉ ghi `keySource.manual`. |
| `report-manual-state` IPC | **Đúng chức năng, chỉ nhận Manual thật** | `app/main.js:274-279`: nhận `snapshot` từ renderer, forward nguyên văn vào `ManualState.setManualState()`, không tự suy đoán/gán thêm. |
| `ManualPriorityGuard` | **Fail-safe đúng thiết kế** | Test `ManualPriorityGuard.verify.js` (18 PASS, 0 FAIL): AI_CONTROL + ManualState missing/stale/timestamp không hợp lệ → luôn BLOCK. Đây là pure function, nhận tham số đầy đủ, không tự đọc global state — dễ audit, dễ test. |
| Plugin command path | **Có gate đúng chỗ** | `PluginController.js` chỉ publish `PLUGIN_COMMAND` khi `ControlSource.getControlSource() === "AI_CONTROL"` (mặc định là `LEGACY_CONTROL` — không tự gửi lệnh). Test `PluginCommandBridge.verify.js` (12 PASS): xác nhận LEGACY_CONTROL → không publish. |

**Kết luận D: KHÔNG phát hiện AI/Manual isolation violation nào trong phạm vi trace boundary được (interface, không phải thuật toán nội bộ).** Nếu có vi phạm ẩn bên trong logic `keyEngine.js` (vd tự động set `keySource.manual` từ kết quả AI ở đâu đó sâu trong 648 dòng file này), **nằm ngoài phạm vi đọc của C2** (đúng hard rule "không sửa/không audit sâu thuật toán A"). Đề xuất: nếu muốn xác nhận 100%, cần Claude A tự xác nhận hoặc mở 1 task đọc toàn văn `keyEngine.js` với sự đồng ý của owner.

---

## E. MIDI / D1 Integration Boundary

**WAITING FOR CLAUDE B** cho phần "đã B có thay đổi gì mới chưa" — không có snapshot mới để so sánh.

**Những gì trace được từ snapshot hiện có (giống hệt C1, không đổi):**

| Hạng mục | Trạng thái tại snapshot hiện tại | Ghi chú |
|---|---|---|
| AUTO MENU AI virtual MIDI port | Có cơ chế **reuse-trước-khi-tạo** rõ ràng (`ensureAutoMenuAiPort()`, `runtime.js:116-150`) | Trên Windows: chỉ discover/reuse, **cố ý không cố tạo mới** (RtMidi/WinMM không hỗ trợ tạo virtual port trên Windows — đã dẫn nguồn `node_modules/@julusian/midi/README.md` ngay trong code). Không phát hiện nguy cơ tạo trùng port trong code path đã đọc. |
| Không tạo duplicate port | **Xác nhận bằng code + test** | Nhánh `if (existingOutputs.includes(...) || existingInputs.includes(...)) return {ok:true, reason:"REUSED"}` chạy TRƯỚC nhánh tạo mới — return sớm, không bao giờ chạy tới logic tạo mới nếu port đã tồn tại. `PortSelectionPolicy.verify.js` (23 PASS) test riêng hành vi platform-gated này bằng mock `process.platform`. |
| Action → MIDI mapping | Đúng logical action, không lẫn (test `KnobDynamicValue.verify.js`, `MonitorBeatRetuneBackend.verify.js` xác nhận CC number không bị trộn giữa các action khác nhau) | |
| MIDI Learn | Có test riêng `MidiLearnDispatch.verify.js` (46 PASS) — xác nhận toàn bộ `daw:*` trong dropdown Setup đều có trong `ACTION_TO_CAPABILITY` | |
| Fallback path | Mouse-coordinate fallback chỉ áp dụng cho `DAW_PLAY/STOP/RECORD` (3 action có `ACTION_COORDINATE_KEY`), các action khác → thẳng `NOT_CONFIGURED` nếu không có MIDI mapping | Xác nhận đúng như C1 |
| D1/XML | **Không tìm thấy file `.xml`/`.xsd` mapping nào trong ZIP** (đã `find . -iname "*.xml" -o -iname "*.xsd"` — 0 kết quả ngoài `node_modules`) | Nếu D1/XML là công việc B đang làm nhưng CHƯA commit vào snapshot này → **WAITING FOR CLAUDE B**, không suy đoán thêm |

---

## F. Integration Test Matrix

| # | Test | Precondition | Action | Expected | Actual (từ audit tĩnh + chạy test hiện có) | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | AI Key detect | Soundcard đã chọn ở Setup, AudioContext running | KeyEngine dò được hợp âm ổn định | AI state (`keySource.ai`) thay đổi | Xác nhận qua code path (mục D); test thuật toán thật thuộc `KeyEngineV2.verify.js` (PASS) | **PASS (interface); thuật toán = lãnh địa A** | keyEngine.js integration boundary |
| 2 | Manual Key selection | Setup mở | Chọn key trong dropdown | Manual state thay đổi | `ManualState.verify.js` 13 PASS | **PASS** | tests/unit/ManualState.verify.js |
| 3 | AI active + Manual dropdown | AI đang chạy | Mở dropdown, không bấm SEND | Không copy AI → Manual | Xác nhận: dropdown chỉ đọc `keySource.manual`, không có write-back từ AI | **PASS (interface)** | mục D |
| 4 | Manual SEND | Đã chọn key trong dropdown | Bấm SEND | Chỉ gửi Manual Key qua `report-manual-state` | Xác nhận IPC handler chỉ forward snapshot nhận được, không trộn AI | **PASS** | app/main.js:274-279 |
| 5 | AI update sau Manual | Manual đã SEND | AI tiếp tục detect | Không overwrite Manual state | `ManualPriorityGuard` fail-safe + `ai-result` không gọi `setManualState` | **PASS (interface)** | mục D |
| 6 | MOD AI | AI Control, MOD ON | MOD engine phát hiện đổi tone | Đúng AI path (`ai-result` type=mod) | `ModEngineV2.verify.js` PASS, `ModDualTarget.verify.js` PASS | **PASS** | tests |
| 7 | MOD Manual | Manual override | Chọn tone thủ công + SET | Đúng Manual path | `ManualStateSequence.verify.js` 9 PASS | **PASS** | tests |
| 8 | UI action → CommandRuntime | App chạy | Bấm nút DAW_PLAY | `executeAction()` gọi đúng, dispatch MIDI nếu cấu hình | `MidiLearnDispatch.verify.js` 46 PASS | **PASS (mock)** | tests |
| 9 | MIDI mapping đúng logical action | Đã Learn | Trigger action | CC/note đúng, không lẫn action khác | `KnobDynamicValue.verify.js`, `MonitorBeatRetuneBackend.verify.js` PASS | **PASS (mock)** | tests |
| 10 | MIDI port = AUTO MENU AI | — | `ensureAutoMenuAiPort()` | Reuse nếu tồn tại, không throw | `PortSelectionPolicy.verify.js` 23 PASS (mock easymidi) | **PASS (mock, chưa test hardware thật)** | tests |
| 11 | Duplicate port | Port đã tồn tại | Gọi `ensureAutoMenuAiPort()` lần 2 | Không tạo thêm | Code: nhánh REUSED return sớm | **PASS (code path xác nhận)** | runtime.js:137-139 |
| 12 | D1/XML mapping đọc đúng | — | — | — | **Không tìm thấy file D1/XML trong snapshot** | **WAITING FOR CLAUDE B** | — |
| 13 | DAW Play | MIDI port kết nối | Bấm Play | DAW nhận command | Chỉ verify được ở tầng dispatch (mock); **không thể xác nhận DAW thật nhận được** trong sandbox | **PARTIAL — cần Windows+DAW thật** | — |
| 14 | DAW Stop | tương tự | Bấm Stop | DAW nhận command | tương tự | **PARTIAL — cần Windows+DAW thật** | — |
| 15 | DAW Record | tương tự | Bấm Record | DAW nhận command | tương tự | **PARTIAL — cần Windows+DAW thật** | — |
| 16 | Beat volume không tác động Master | — | Xoay knob Beat | CC Beat gửi đi, Master không đổi | `KnobDynamicValue.verify.js`: "Master gửi đúng CC 30 với value 77, không lẫn với Beat" — PASS | **PASS** | tests |
| 17 | Master volume không tác động Beat | — | Xoay knob Master | tương tự ngược lại | Cùng test trên, cùng PASS | **PASS** | tests |
| 18 | Clap — local sample | App chạy | Bấm Clap | `Vo-Tay.MP3` phát qua HTMLAudioElement | `AudioEngine.verify.js` 26 PASS — **NHƯNG lưu ý: test này verify `ui/js/audioEngine.js`, file đã xác nhận ở C1 là ORPHAN (không được HTML load). Chức năng Clap thật chạy qua `SoundEffectEngine` trong `renderer.js`, KHÔNG có file verify riêng.** | **PASS (sai file) / MISSING test cho code đang chạy thật** | xem mục H |
| 19 | Laugh — local sample | tương tự | Bấm Laugh | tương tự | tương tự | **PASS (sai file) / MISSING test cho code đang chạy thật** | xem mục H |
| 20 | SMTC → renderer | Windows thật | Đổi bài nhạc | `now-playing-change` IPC nhận đúng | `WindowsMediaSession.verify.js` PASS (chỉ logic Node, mock spawnFn) | **PASS (logic); chưa test PowerShell/WinRT thật** | tests |
| 21 | SMTC → Key | Có `databaseMatch` | Bài hát khớp Song Database | Chỉ áp Key theo đúng policy đã thiết kế (renderer tự quyết định, không tự động ép) | Xác nhận qua code `main.js:143-166`: chỉ gửi `databaseMatch` sang renderer, không tự gọi `AIContext.updateKey` | **PASS (interface)** | app/main.js |

---

## G. Existing Test Results — Chạy thật 33 file `*.verify.js`

**Đính chính C1:** báo cáo trước ghi "24 file test" — con số đúng là **33 file** (`ls tests/unit/*.verify.js | wc -l` = 33). Xin lỗi vì sai sót đếm ở C1, sửa lại ở đây.

**Tổng kết chạy (Node v22.22.2, sandbox Linux, không sửa bất kỳ implementation nào):**

| Kết quả | Số lượng | File |
|---|---|---|
| **PASS sạch (0 FAIL)** | 29 | AudioEngine, CommandRuntimeHealth, KeyEngineFastPath, KeyEngineV2, KnobBeatMaster, KnobDynamicValue, KnobMappingIsolation, ManualPriorityGuard, ManualState, ManualStateReporter, ManualStateSequence, MarginEngine, MarginLogger, MidiHealth, MidiLearnDispatch, ModDualTarget, ModEngineV2, MonitorBeatRetuneBackend, MonitorBeatToggle, MouseControlGate, PluginCommandBridge, PortSelectionPolicy, SettingsPersistenceRoundtrip, SongReference, StabilityTracker, TelemetryAnalyzer, TelemetryLogger, Top1StabilityTimer¹, WindowsMediaSession |
| **FALSE FAIL (nhiễu môi trường, không phải lỗi code)** | 2 | AutoSongCollector, NowPlayingResolver |
| **REAL FAIL (thật, thuộc lãnh địa Claude A)** | 2 | ConfidenceV2, KeyEngineAccuracyA35 |

¹ `Top1StabilityTimer.verify.js` cần ~36 giây thời gian thực (test chạy `keyEngine.js` thật với timer thật) — lần chạy đầu bị `timeout 15` của tôi cắt ngang (exit 124), chạy lại với `timeout 40` thì **PASS sạch**. Không phải lỗi code, chỉ là giới hạn timeout tôi đặt quá ngắn ban đầu.

### G.1 FALSE FAIL — nguyên nhân xác nhận bằng code

`AutoSongCollector.verify.js` và `NowPlayingResolver.verify.js` đều fail đúng 1 assertion — **cùng một nguyên nhân**: cả 2 file test tự chạy `execSync("git status --porcelain", {cwd: projectRoot})` như 1 bước tự-kiểm (PHẦN E/G: "không đụng file cũ nào ngoài phạm vi task"). Vì ZIP giải nén ra ~89 file "modified" theo git (đã xác nhận ở C1 là **100% nhiễu line-ending CRLF↔LF phát sinh từ nén/giải nén, không phải thay đổi nội dung thật** — `git diff app/main.js` rỗng), bước tự-kiểm này thấy "có file cũ bị sửa" và fail — dù không file nào thực sự bị Claude C hay ai khác sửa nội dung.

→ **Đây là artifact của quy trình ZIP, không phải bug trong `AutoSongCollector.js`/`NowPlayingResolver.js`.** Nếu chạy trực tiếp trên 1 `git clone` sạch (không qua nén/giải nén), 2 test này nhiều khả năng PASS 100%. Khuyến nghị: lần sau audit nên nhận repo qua `git clone` thay vì ZIP nếu muốn các test tự-kiểm `git status` chạy đúng — hoặc bạn có thể tự chạy `git add -A && git stash && git stash pop` (hoặc set `core.autocrlf`) trên máy Windows thật trước khi zip, để loại bỏ nhiễu line-ending.

### G.2 REAL FAIL — thuộc lãnh địa Claude A, chỉ ghi nhận

**`ConfidenceV2.verify.js`** — PHẦN A (test với số liệu ví dụ tĩnh) PASS 100%. PHẦN B (chạy `keyEngine.js` thật, real-time ~16s) fail đúng 1 chỗ: assertion giả định `combined = trung bình cộng đúng 4 thành phần` (`pearsonNorm`, `marginNorm`, `stabilityNorm`, `bassNorm`). Dữ liệu thật trả về **5 thành phần** (có thêm `modalNorm` — không có trong công thức PHẦN A). Tôi đã tính tay: `combined` thật (0.9801888282231663) **khớp chính xác** với trung bình cộng **5** thành phần (bao gồm `modalNorm`), không khớp trung bình 4 thành phần (ra 0.9924...). → **Kết luận: công thức `combined` trong code đã tiến hoá (nhiều khả năng từ Task A35 "Modal Evidence" — đúng tên trong header comment của `keyEngine.js`) nhưng bài test `ConfidenceV2.verify.js` chưa được cập nhật theo.** Đây là **test-implementation drift**, không phải bug trong công thức mới — chỉ là test cũ chưa theo kịp. Báo cho Claude A xác nhận công thức 5-thành-phần là chủ đích rồi cập nhật lại test.

**`KeyEngineAccuracyA35.verify.js`** — tự nhận trong tên là "SYNTHETIC — CHƯA thay thế yêu cầu audio thật". 2/N assertion fail thật:
1. **TEST B:** hợp âm mập mờ (thiếu quãng 3, không rõ Major/Minor) — kỳ vọng KHÔNG khoá trong 16s, nhưng thực tế **đã khoá nhầm "A# Minor" lúc 2000ms**.
2. **TEST E phần 1:** kỳ vọng 2 lần báo đổi Key trong phiên (D Minor lúc đầu + D# Minor khi đổi thật), nhưng `watchContinuous` chỉ báo **1 lần** — không phát hiện được lần đổi Key thật (modulation D Minor → D# Minor).

Cả 2 đều là hành vi thuật toán key-detection thật, nằm hoàn toàn trong `ui/js/engines/keyEngine.js` (648 dòng, lãnh địa Claude A). **Không tự sửa**, chỉ ghi nhận với bằng chứng số liệu cụ thể để Claude A tự quyết định.

### G.3 Không có test nào cần Windows/DAW/virtual-MIDI-port thật để CHẠY được

Đã xác nhận bằng code: `MidiHealth.verify.js`, `PortSelectionPolicy.verify.js`, `CommandRuntimeHealth.verify.js` đều **tự mock `easymidi`** (fake input/output port names qua closure/EventEmitter giả) — không gọi driver MIDI thật, không cần hardware/virtual port thật. `WindowsMediaSession.verify.js` tiêm `spawnFn` giả thay vì spawn `powershell.exe` thật. → **Toàn bộ 33 test đều chạy được 100% trong sandbox Linux không có Windows/DAW/MIDI port thật** — nhưng đây cũng là **giới hạn thật của bộ test**: chúng chỉ xác nhận logic, KHÔNG xác nhận tích hợp phần cứng/DAW thật (test #13/14/15 trong mục F vẫn ở trạng thái PARTIAL vì lý do này).

---

## H. C1 Blocker Re-check

| Blocker | Trạng thái C1 | Trạng thái xác nhận lại ở C2 |
|---|---|---|
| **P0** — WASAPI Loopback thật hay chỉ `getUserMedia(deviceId)`? | Chỉ getUserMedia | **Không đổi — vẫn chỉ getUserMedia(deviceId)**. Không có commit/file mới nào giữa C1 và C2 (cùng HEAD `9d86f42`). |
| **P1** — `modules/` còn placeholder? | 32 file text "index.js" | **Không đổi** — đã re-check `wc -c`, vẫn 8 byte mỗi file. |
| **P1** — `core/command-engine-ts/` còn dead? | Dead, không ai require | **Không đổi** — grep lại repo-wide, vẫn 0 kết quả require từ ngoài. |
| **P1** — `audioEngine.js` còn orphan? | Orphan | **Không đổi — và nay có thêm bằng chứng mới (mục G.3, test F#18/19): `AudioEngine.verify.js` verify đúng file orphan này, không verify `SoundEffectEngine` (code đang chạy thật trong renderer.js). Đây là 1 phát hiện MỚI của C2: không chỉ code bị orphan, mà TEST cũng đang test nhầm implementation.** |
| **P1** — `midiDriver.js` còn orphan/broken-if-loaded? | Orphan, sẽ crash nếu load | **Không đổi** — `ui/js/baseDriver.js` vẫn không tồn tại, `nodeIntegration:false` vẫn nguyên. |
| **P2** — backup `keyEngine.js.A34`/`.rej`/`.rar` | Còn tồn tại | **Không đổi** — vẫn còn trong `ui/js/engines/`. |
| **P2** — duplicate `WorkflowManager` | `core/ai/managers/WorkflowManager.js` (0 byte) vs `core/ai/workflow/WorkflowManager.js` (thật) | **Không đổi**. |
| **P2** — dead `app/bootstrap.js`/`app/ipc.js`/`app/windows.js` | Không được require | **Không đổi**. |

**Không có blocker nào được A/B tự giải quyết giữa C1 và C2** (vì không có snapshot mới) — đây KHÔNG có nghĩa A/B chưa làm gì, chỉ có nghĩa **C2 chưa nhận được bản cập nhật để kiểm tra lại**.

---

## I. Cross-Agent Risks

| Risk | Owner cần biết | Chi tiết |
|---|---|---|
| Test-implementation drift trong Confidence formula | Claude A | `ConfidenceV2.verify.js` giả định 4 thành phần, code thật dùng 5 (thêm `modalNorm`). Nếu Claude A tiếp tục sửa `keyEngine.js` mà không cập nhật test này, rủi ro test FAIL giả liên tục, che khuất regression thật trong tương lai. |
| 2 fail thật trong `KeyEngineAccuracyA35.verify.js` | Claude A | Xem G.2 — hợp âm mập mờ bị khoá nhầm, modulation thật không được báo. Có thể ảnh hưởng UX thật (Key sai khi hợp âm không rõ ràng, MOD không được phát hiện khi đổi tone thật). |
| `AudioEngine.verify.js` đang test nhầm implementation | Không rõ ai — cần owner quyết định | File test PASS 100% nhưng test đúng code KHÔNG chạy trong app thật (`ui/js/audioEngine.js` orphan). Code THẬT (`SoundEffectEngine` trong `renderer.js`) không có test riêng nào. Rủi ro: cảm giác an toàn giả ("test Clap/Laugh đã pass") trong khi code đang chạy thật chưa từng được test. |
| D1/XML chưa xuất hiện trong snapshot | Claude B | Không rõ đây là chưa tới lượt làm, hay đã làm nhưng chưa merge vào nhánh `main` mà ZIP này lấy từ đó. Cần xác nhận trực tiếp với Claude B/owner. |
| Snapshot C2 = snapshot C1 (không có gì mới) | Owner | Nếu ý định là "C2 chạy sau khi A/B có tiến triển", cần cung cấp ZIP mới trước khi mở C3, nếu không C3 sẽ lặp lại đúng những gì C1/C2 đã tìm. |

---

## J. Release Blockers

Dựa trên toàn bộ C1 + C2, các mục sau **nên chặn release** cho tới khi owner xác nhận đã xử lý hoặc chấp nhận rủi ro:

1. **P0 WASAPI Loopback gap** (mục H) — người dùng cuối có thể vô tình chọn sai thiết bị ở Setup mà app không cách nào tự phát hiện.
2. **2 real fail trong KeyEngineAccuracyA35** (mục G.2) — ảnh hưởng trực tiếp độ chính xác Key/MOD, tính năng lõi của sản phẩm.
3. **D1/XML integration chưa xác nhận được trạng thái** (mục E) — cần Claude B/owner xác nhận trước khi tuyên bố MIDI Mapping hoàn chỉnh.
4. **Test #13/14/15 (DAW Play/Stop/Record nhận lệnh thật)** chỉ PARTIAL — chưa từng được xác nhận trên Windows + DAW thật trong bất kỳ audit nào (C1 hay C2), chỉ xác nhận ở tầng dispatch logic (mock). Đây là rủi ro "chưa test end-to-end thật" cho toàn bộ tính năng điều khiển DAW — nên có 1 vòng test tay thật trên máy Windows + Studio One trước khi release.

**Không chặn release (chấp nhận được / đã có thiết kế đúng):**
- Toàn bộ dead code (`modules/`, `command-engine-ts/`, file rỗng...) — không ảnh hưởng hành vi runtime, chỉ ảnh hưởng độ sạch codebase.
- 2 false-fail do git-noise — không phản ánh vấn đề thật.
- Cụm "Song Reference System" ORPHAN — tính năng phụ, chưa kích hoạt không phải lỗi.

---

## K. Recommended Next Tasks

1. Cung cấp ZIP mới (hoặc git clone sạch) sau khi Claude A xử lý xong 2 fail của `KeyEngineAccuracyA35.verify.js` + xác nhận/cập nhật `ConfidenceV2.verify.js` theo công thức 5-thành-phần — để C3 (nếu có) audit lại đúng phần đã đổi.
2. Owner xác nhận với Claude B trạng thái D1/XML — nếu đã làm nhưng chưa vào `main`, cần merge trước khi C audit tiếp phần MIDI/D1.
3. Quyết định số phận cụm "Song Reference System" (`core/reference/index.js` + `KeyVerifier`/`AutoSongCollector`/`SongCollectorState`/`SongCollectorUtils`) — kích hoạt hay giữ nguyên orphan. Nếu kích hoạt, cần 1 task riêng (không phải C, vì đó là thay đổi luồng chạy — ngoài phạm vi audit-only).
4. Viết `AudioEngine.verify.js` phiên bản mới test đúng `SoundEffectEngine` (code thật trong `renderer.js`) — hoặc archive `ui/js/audioEngine.js` + test cũ của nó nếu xác nhận không dùng lại.
5. Trước khi release: 1 vòng test tay thật trên Windows + Studio One + loopMIDI cho DAW_PLAY/STOP/RECORD (test #13/14/15) — không thể tự động hoá trong sandbox này.
6. Khuyến nghị kỹ thuật: chuẩn hoá line-ending (`.gitattributes` với `* text=auto`) để tránh nhiễu CRLF/LF gây false-fail cho các test tự-kiểm `git status` trong tương lai.

---

## Xác nhận cuối (bắt buộc theo yêu cầu C2)

```
PRODUCTION FILES CHANGED: 0
FILES DELETED: 0
FILES MERGED: 0
ARCHITECTURE CHANGED: 0
```

**Bằng chứng:** `git status --porcelain` trong `/home/claude/audit/AUTO_MENU_AI` trước và sau toàn bộ C2 không đổi (chỉ còn nhiễu line-ending đã ghi nhận từ C1, không có thay đổi nội dung mới do C2 gây ra). Không có lệnh `str_replace`/`create_file`/ghi đè nào chạy trong thư mục repo suốt task này — chỉ `view`, `grep`, `find`, `wc`, `node <test>.js` (chạy test hiện có, không sửa), `git status/log/diff`.

**C2 STATUS: PARTIAL**

Lý do PARTIAL (không phải COMPLETE, không phải BLOCKED):
- **Hoàn thành 100%:** Deep reference audit (mục B), runtime graph re-confirm (mục C), AI/Manual isolation audit trong phạm vi cho phép (mục D), chạy + phân tích toàn bộ 33 test hiện có (mục G), re-check tất cả blocker C1 (mục H), Integration Test Matrix đầy đủ (mục F).
- **Không thể hoàn thành** (không phải do C né tránh, mà do thiếu input): xác nhận thay đổi mới từ Claude A/B (không có snapshot mới), xác nhận D1/XML (không tìm thấy trong snapshot hiện tại, không rõ chưa làm hay chưa merge), xác nhận DAW nhận lệnh thật (cần Windows + DAW thật, ngoài khả năng sandbox).

Các mục này đã đánh dấu rõ **WAITING FOR CLAUDE A** / **WAITING FOR CLAUDE B** / **cần môi trường Windows thật** trong báo cáo, không tự phỏng đoán thay.
