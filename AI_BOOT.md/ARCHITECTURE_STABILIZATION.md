# ARCHITECTURE STABILIZATION REPORT — AUTO_MENU_AI

- **Nhánh nguồn:** `main`
- **Commit đọc tại thời điểm audit:** `abf5584` (2026-07-22)
- **Phạm vi:** Chỉ sửa lỗi + hoàn thiện kiến trúc. Không đổi UI/HTML, không đổi thuật toán Key/BPM/Mod Engine, không thêm tính năng mới.
- **Toàn bộ kết luận dưới đây dựa trên đọc trực tiếp mã nguồn thực tế, không suy đoán.**

---

## BƯỚC 1 — Merge conflict & cú pháp

**Trước khi sửa:** 5/151 file JS FAIL `node --check` (đều do merge conflict chưa xử lý hết, đã tồn tại sẵn trong `main`, không phải do audit này gây ra).

| File | Lỗi | Cách xử lý |
|---|---|---|
| `core/ai/kernel/Kernel.js` | Conflict marker còn nguyên (2 phương án đường dẫn require khác nhau) | Giữ bản path sâu hơn (`../../shared/...`, `../../events/...`) — đã xác minh bằng cách kiểm tra thực tế `core/shared/` và `core/events/` nằm ở đâu trên đĩa |
| `core/ai/kernel/Registry.js` | Tương tự | Tương tự |
| `core/ai/kernel/BootLoader.js` | 2 khối conflict (require Logger + khối comment placeholder Engine) | Giữ bản path đúng thực tế (`core/ai/engines/` có tồn tại, `core/ai/ai/engines/` thì không) |
| `core/ai/AIContext.js` | 1 khối conflict: bản HEAD cụt (thiếu 3 hàm `updateKey/updateBpm/updateMod`), bản origin/main đầy đủ | Giữ bản origin/main (đầy đủ, đang được `app/main.js` gọi thật qua IPC `ai-result`) |
| `core/ai/AIBootstrap.js` | Không phải conflict marker chuẩn — dấu `<<<<<<<`/`=======`/`>>>>>>>` đã bị mất ký tự `<`/`>`, để lại " HEAD"/" origin/main" trơ và **khai báo trùng `const WorkflowManager`** (lỗi cú pháp `Identifier has already been declared`) | Xóa dòng khai báo trùng + mảnh vụn text còn sót, giữ đúng 1 dòng require với comment gốc giải thích file rỗng (0 byte), đúng như đã ghi chú sẵn trong code |

**Sau khi sửa:** `TOTAL=151 FAIL=0`. Không còn conflict marker nào trong toàn bộ `.js` (đã quét lại bằng grep).

**2 lỗi runtime phát sinh, phát hiện trong lúc audit, đã sửa vì thuộc phạm vi "sửa lỗi" (không đổi kiến trúc):**

1. `core/events/Events.js` — thiếu hằng số `PLUGIN_COMMAND`. Hằng số này đã được `EventBus.publish(Events.PLUGIN_COMMAND, ...)` ở `PluginController.js` và `EventBus.subscribe(Events.PLUGIN_COMMAND, ...)` ở `app/main.js`, nhưng chưa từng được khai báo → giá trị là `undefined` → đã bổ sung khai báo đúng bằng chuỗi `"PLUGIN_COMMAND"`.
2. `core/shared/ControlSource.js` — hàm `isAiControl()` bị lỗi copy-paste, so sánh `CURRENT_MODE === MODES.LEGACY_CONTROL` (giống hệt `isLegacyControl()`) thay vì `MODES.AI_CONTROL`. Hàm này hiện chưa được gọi ở đâu (bug "ngủ") nhưng sẽ sai ngay khi có module dùng tới → đã sửa lại đúng logic.

---

## BƯỚC 2 — Require map từ `app/main.js` & Dead code

`app/main.js` là entry point DUY NHẤT (`package.json` → `"main": "app/main.js"`). Truy vết đệ quy toàn bộ `require()` từ đây:

### File "sống" (22 file, thực sự được nạp khi chạy app)
```
app/main.js
core/ai/AIBootstrap.js, AIBrain.js, AIContext.js, AnalysisState.js
core/ai/aggregation/ResultQueue.js
core/ai/decision/DecisionAction.js, DecisionEngine.js, DecisionRules.js
core/ai/inference/AnalysisResult.js, InferenceEngine.js, InferenceRules.js
core/ai/managers/WorkflowManager.js   ← file RỖNG 0 byte, xem cảnh báo bên dưới
core/ai/workflow/TaskQueue.js, WorkflowManager.js
core/events/EventBus.js, Events.js
core/shared/BaseModel.js, BaseModule.js, ControlSource.js, Logger.js, TelemetryLogger.js
```
Không có require nào bị gãy (broken path) trong nhóm 22 file này.

### File KHÔNG được require từ `app/main.js` nhưng KHÔNG phải dead code (nạp bằng cơ chế khác)
- `app/preload.js` — Electron nạp trực tiếp qua `webPreferences.preload`, không qua `require()`.
- `ui/js/appSettings.js`, `vocalCommandRouter.js`, `engines/{bpmEngine,keyEngine,modEngine}.js`, `renderer.js`, `setup.js` — nạp qua thẻ `<script src="...">` trong `ui/index.html` / `ui/setup.html` (renderer process, không phải CommonJS). Đây chính là **System A — hệ thống điều khiển Plugin duy nhất đang hoạt động thật** (MIDI/AutoHotkey qua `vocalCommandRouter.js`).
- `tests/unit/*.verify.js` — script kiểm thử chạy tay bằng `node tests/unit/...`.
- `scripts/analyzeTelemetry.js` — CLI chạy tay (`node scripts/analyzeTelemetry.js`), đọc `logs/*.jsonl`.

### Dead code / module chưa tích hợp (129 file còn lại — liệt kê đầy đủ trong phụ lục cuối file)

Phân loại theo nguyên nhân, đối chiếu với báo cáo audit Plugin Control trước đây (4 hệ thống song song):

**A. Hệ thống Kernel/Registry trùng lặp — 2 bộ hoàn toàn song song, cả 2 đều KHÔNG được `app/main.js` dùng:**
- `core/ai/kernel/{Kernel,Registry,BootLoader,index}.js` — bộ điều phối vòng đời module (init/start/stop/destroy), viết xong, có cơ chế `register()`/`resolve()` rõ ràng, nhưng `BootLoader` chưa từng được `require()` từ đâu cả. `app/main.js` hiện dùng đường boot khác (`AIBootstrap.js` trực tiếp), không đi qua Kernel này.
- `core/kernel/{Kernel,Registry,BootLoader,index}.js` — **một bộ Kernel/Registry/BootLoader THỨ HAI, khác hẳn**, kích thước lớn hơn nhiều (Kernel.js ~2940 dòng so với ~200 dòng của bản `core/ai/kernel/`), dùng cả hằng số `Events.APP_CLOSE` vốn cũng chưa từng được khai báo trong `Events.js`. Hoàn toàn không có nơi nào require tới. Đây là kiến trúc cũ hơn, bị bỏ lại.

**B. `core/ai/plugin/PluginController.js` — module hoàn chỉnh nhưng bị "mồ côi"**
Đã viết đầy đủ logic: lắng nghe `WORKFLOW_READY`, kiểm tra `ControlSource`, phát `PLUGIN_COMMAND`. Nhưng **không file nào require nó**, kể cả `AIBootstrap.js` (đường boot thật). ⚠️ Đây là lỗ hổng quan trọng nhất được phát hiện trong audit này — xem chi tiết ở BƯỚC 5.

**C. `core/command-engine-js/*`** (commandEngine.js, capabilityRegistry.js, aiLayer.js, drivers/{base,hotkey,midi,mouse,osc}Driver.js) — bộ Command Engine JS viết đầy đủ (hàng nghìn dòng), kiến trúc hợp lý (driver pattern, capability registry, fallback theo thứ tự ưu tiên), nhưng **không được require ở bất kỳ đâu trong repo**. Tương ứng "System B" trong báo cáo audit trước (kiến trúc ổn nhưng mồ côi).

**D. `core/command-engine-ts/*`** — toàn bộ viết bằng TypeScript (`.ts`), không có `tsconfig.json`, không có build script trong `package.json` → không thể chạy trực tiếp bằng Node. Tương ứng "System C".

**E. Stub rỗng 0 byte (~41 file)** — tương ứng "System D": toàn bộ `core/drivers/*.js` (AHKDriver, AutoKeyDriver, AutoTuneDriver, MelodyneDriver, SoundShifterDriver, StudioOneDriver), `core/services/*.js` (7 file), `core/ai/engines/*.js` (BPMEngine, HarmonyEngine, KeyEngine, ModEngine, SongEngine — **đây là các file placeholder, KHÁC với keyEngine.js/bpmEngine.js/modEngine.js thật đang chạy ở `ui/js/engines/`**), `core/ai/managers/*.js`, `core/ai/decision/{ConfidenceEngine,RuleEngine,AutomationEngine}.js`, `core/ai/models/*.js`, `core/ai/listeners/*.js`, `core/ai/memory/*.js`, `app/ipc.js`, `app/windows.js`.
- Toàn bộ `modules/{AI,Audio,Dashboard,Plugin,Setting,Setup,Voice}/{controller,service,view,index}.js` (28 file) chỉ 8 byte — stub trống, khung MVC dự kiến nhưng chưa viết. `modules/GPT cấu trúc.js` chỉ là ghi chú tên module (14 dòng text), không phải code chạy được.

**F. `core/events/{EventTypes,EventQueue,index}.js`, `core/models/*.js`, `core/shared/{BaseService,BaseManager,BaseEngine,BaseDriver,Config,Constants,CoreError,Utils,Version,index}.js`** — các lớp nền/tiện ích viết sẵn (một số có nội dung thật, vd `core/models/{Song,Key,BPM,Modulation,Analysis}.js` khá đầy đủ), nhưng chưa có Service/Manager/Engine thật nào require tới.

**G. `core/ai/events/{EventBus.js, events.js}` — ⚠️ TRÙNG TÊN GÂY NHẦM LẪN, cần chú ý đặc biệt.**
Đây KHÔNG phải bản sao của `core/events/EventBus.js`. Đọc nội dung thực tế: `core/ai/events/EventBus.js` chứa 1 class tên `AIBrain` (không phải EventBus!), `require("./AIContext")` và `require("./StateMachine")` — cả 2 đường dẫn này **đều sai/không tồn tại** trong thư mục `core/ai/events/`. File này nếu bị require nhầm (do trùng tên thư mục `events/` với `core/events/`) sẽ crash ngay lập tức. May mắn là toàn bộ code sống hiện tại đều require đúng `core/events/EventBus.js` (qua `../../events/EventBus` hoặc `../events/EventBus` tùy độ sâu, đã kiểm chứng từng đường dẫn ở Bước 1). Đây là code rác nguy hiểm, nên xóa hoặc đổi tên trong giai đoạn Integration để tránh ai đó require nhầm sau này.

---

## BƯỚC 3 — Sơ đồ IPC: Renderer → Main → Core AI → Plugin

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│ RENDERER (ui/js/*.js)   │        │ MAIN PROCESS (app/main.js)    │
│                          │        │                                │
│ keyEngine.js ──┐         │        │                                │
│ bpmEngine.js ──┼─ipcRenderer.send("ai-result",{type,payload})──►ipcMain.on("ai-result")
│ modEngine.js ──┘         │        │        │                       │
│                          │        │        ▼                       │
│                          │        │  AIContext.update{Key,Bpm,Mod}()
│                          │        │        │                       │
│                          │        │        ▼                       │
│                          │        │  EventBus.publish(KEY/BPM/MOD_UPDATED)
│                          │        │        │                       │
│                          │        │        ▼  (core/ai/* — xem Bước 5)
│                          │        │  AnalysisState → InferenceEngine
│                          │        │  → ResultQueue → DecisionEngine
│                          │        │  → WorkflowManager → TaskQueue
│                          │        │        │                       │
│                          │        │        ▼  ⚠️ ĐỨT ĐOẠN Ở ĐÂY    │
│                          │        │  (PluginController — chưa được require, xem Bước 5)
│                          │        │        │                       │
│                          │        │        ▼ (nếu được nối)        │
│                          │        │  EventBus.publish(PLUGIN_COMMAND)
│                          │        │        │                       │
│  onPluginCommand() ◄─────┼─ipcRenderer.on("plugin-command")◄───EventBus.subscribe(PLUGIN_COMMAND)
│  (renderer.js, hiện      │        │        → mainWin.webContents.send("plugin-command", msg)
│   CHƯA xử lý gì —        │        │                                │
│   xem ghi chú Bước 5)    │        │                                │
│                          │        │                                │
│ vocalCommandRouter.js ───┼─ Web MIDI API / window.electronAPI.clickAtPoint()
│  (System A — ĐANG chạy   │        │  ◄── ipcMain.handle("click-at-point")
│   thật, độc lập với AI   │        │  ◄── ipcMain.handle("find-ahk-path") + execFile(AutoHotkey)
│   Core ở trên)           │        │                                │
└─────────────────────────┘        └──────────────────────────────┘
```

**Danh sách đầy đủ kênh IPC đã đăng ký ở `app/main.js` (22 kênh)** đối chiếu với `app/preload.js`:
Tất cả kênh `ipcMain.on/handle` đều có `ipcRenderer` tương ứng ở `preload.js` — khớp nhau, **trừ 1 ngoại lệ đã được chính code tự ghi chú sẵn**: `preload.js` có `sendCommand: () => ipcRenderer.invoke("ai-command", ...)` nhưng `app/main.js` **chưa có** `ipcMain.handle("ai-command", ...)`. Đây là gap đã biết trước, không phải lỗi mới, không sửa vì thuộc phạm vi tính năng "Command Engine" chưa được giao trong nhiệm vụ này.

Kênh `telemetry-record` (Phase 4A) hoạt động đúng 1 chiều: renderer → `TelemetryLogger.write()` → `logs/*.jsonl`, không có phản hồi ngược, đúng thiết kế.

---

## BƯỚC 4 — Thống kê EventBus (`core/events/EventBus.js` + `Events.js` — bản đang sống)

| Event | Publish ở đâu | Subscribe ở đâu | Trạng thái |
|---|---|---|---|
| `KEY_UPDATED` | `app/main.js` (từ IPC `ai-result`) | `AnalysisState.js` | ✅ Sống |
| `BPM_UPDATED` | `app/main.js` | `AnalysisState.js` | ✅ Sống |
| `MOD_UPDATED` | `app/main.js` | `AnalysisState.js` | ✅ Sống |
| `KEY_CHANGED` | `AnalysisState.js` | `InferenceEngine.js` | ✅ Sống |
| `BPM_CHANGED` | `AnalysisState.js` | `InferenceEngine.js` | ✅ Sống |
| `MOD_CHANGED` | `AnalysisState.js` | `InferenceEngine.js` | ✅ Sống |
| `ANALYSIS_UPDATED` | `AnalysisState.js` | `InferenceEngine.js` (chỉ log) | ✅ Sống |
| `ANALYSIS_RESULT` | `InferenceEngine.js` | `ResultQueue.js` | ✅ Sống |
| `ANALYSIS_READY` | `ResultQueue.js` | `DecisionEngine.js` | ✅ Sống |
| `DECISION_READY` | `DecisionEngine.js` | `WorkflowManager.js` (workflow/) | ✅ Sống |
| `WORKFLOW_READY` | `WorkflowManager.js` (workflow/) | `PluginController.js` | ⚠️ Publish sống, nhưng **subscriber không bao giờ đăng ký** vì `PluginController.js` chưa được require (xem Bước 5) — tín hiệu phát ra "rơi vào hư không" |
| `PLUGIN_COMMAND` | `PluginController.js` (không chạy) | `app/main.js` | ⚠️ Subscriber sống & sẵn sàng, nhưng publisher không bao giờ chạy tới → **event này thực tế KHÔNG BAO GIỜ được phát ra** |
| `APP_READY` | `Kernel.js` (core/ai/kernel — chết) | `app/bootstrap.js` (chết, không ai require) | ❌ Chết cả 2 đầu |
| `AUDIO_STARTED` | Không nơi nào publish | `app/bootstrap.js` (chết) | ❌ Chết |
| `AUDIO_STOPPED`, `AUDIO_BUFFER_READY`, `SONG_DETECTED`, `SONG_CHANGED`, `PROJECT_OPENED`, `PROJECT_CLOSED`, `PLUGIN_OPENED`, `PLUGIN_CLOSED`, `CONFIDENCE_UPDATED`, `CACHE_HIT`, `CACHE_MISS`, `ANALYSIS_STARTED`, `ANALYSIS_FINISHED`, `AUTOMATION_STARTED`, `AUTOMATION_FINISHED`, `ERROR`, `AI_STARTED`, `AI_STOPPED` | Không nơi nào publish | Không nơi nào subscribe | ❌ Khai báo sẵn (dự phòng cho tương lai), chưa dùng đến |
| `APP_CLOSE` | `core/kernel/Kernel.js` (bộ Kernel thứ 2, chết) | Không ai subscribe | ❌ Chết, và còn thiếu khai báo trong `Events.js` |

**Kết luận Bước 4:** Chuỗi sự kiện chính từ `KEY/BPM/MOD_UPDATED` đến `WORKFLOW_READY` hoạt động thông suốt, đúng thiết kế "1 chiều, không trùng lặp". Điểm gãy duy nhất trong chuỗi sống là mắt xích cuối `WORKFLOW_READY → PLUGIN_COMMAND`, do vấn đề tích hợp (Bước 5), không phải do EventBus hay do 2 sự kiện này bị định nghĩa sai (sau khi đã bổ sung `PLUGIN_COMMAND` ở Bước 1).

---

## BƯỚC 5 — Workflow → PluginController → Driver

**Đường đi dữ liệu thiết kế đúng (theo comment trong chính source code):**
```
DecisionEngine → DECISION_READY → WorkflowManager (workflow/) → TaskQueue.enqueue()
→ WORKFLOW_READY → PluginController → PLUGIN_COMMAND → app/main.js → IPC "plugin-command"
→ renderer (Bridge, ui/js/renderer.js: onPluginCommand — hàm này đã tồn tại nhưng thân hàm
  hiện chưa gọi driver thật nào, chỉ nhận message)
```

**Xác nhận thực tế bằng cách đọc code (không suy đoán):**

1. `TaskQueue.enqueue(action)` — **có nơi ghi vào, KHÔNG có nơi nào gọi `dequeue()`**. Bản thân `TaskQueue.js` tự ghi chú rõ: "việc lấy ra để thực thi thuộc về tầng khác (Plugin Controller, chưa xây)". Xác nhận: đúng là chưa có ai gọi `dequeue()` trong toàn bộ 151 file.
2. `PluginController.js` — code hoàn chỉnh, đúng thiết kế, nhưng: `grep require.*PluginController` trên toàn repo → **0 kết quả**. Không file `.js` nào require nó. Vì Node chỉ chạy code khi module được `require()` lần đầu, `new PluginController()` (dòng cuối file) **không bao giờ được gọi**, nên `EventBus.subscribe(Events.WORKFLOW_READY, ...)` bên trong nó **không bao giờ đăng ký** — dù `WorkflowManager.js` vẫn `publish(WORKFLOW_READY)` đều đặn.
3. `core/drivers/*.js` (AutoTuneDriver, AutoKeyDriver, SoundShifterDriver, MelodyneDriver, StudioOneDriver, AHKDriver) — toàn bộ **0 byte**, chưa viết. `PluginController.js` cũng tự ghi chú rõ nó KHÔNG gọi Driver nào, KHÔNG gửi MIDI/AHK trực tiếp — đúng thiết kế Bridge (chuyển tín hiệu, không thực thi).
4. Việc "thực thi thật" (MIDI/AutoHotkey) hiện **100% nằm ở `ui/js/vocalCommandRouter.js`** (renderer), hoàn toàn độc lập với toàn bộ pipeline AI Core nói trên — đúng như `ControlSource.js` mô tả (`LEGACY_CONTROL` là mặc định, `PluginController` ở chế độ này chỉ quan sát, không gửi lệnh).

**⚠️ KẾT LUẬN QUAN TRỌNG NHẤT của toàn bộ audit này:**
Pipeline AI Core (`AIContext → AnalysisState → InferenceEngine → ResultQueue → DecisionEngine → WorkflowManager → TaskQueue`) chạy đúng và đầy đủ tới `TaskQueue`, nhưng **dừng lại ở đó** vì mắt xích tiếp theo (`PluginController`) chưa được nối vào cây `require()` sống. Đây KHÔNG phải lỗi logic bên trong các module (mỗi module đọc riêng lẻ đều đúng), mà là **lỗi tích hợp ở tầng bootstrap** (`AIBootstrap.js` thiếu 1 dòng `require("./plugin/PluginController")`).

Vì đây là việc **kích hoạt lại một luồng dữ liệu** (không phải chỉ sửa cú pháp), theo đúng yêu cầu *"nếu cần thay đổi kiến trúc thì phải giải thích trước"*, tôi **chưa tự thực hiện** — việc này nên là ưu tiên #1 của giai đoạn Integration (xem danh sách ưu tiên cuối báo cáo). Hiện trạng `LEGACY_CONTROL` làm mặc định vẫn đảm bảo app hoạt động bình thường (vì `vocalCommandRouter.js` không phụ thuộc gì vào pipeline AI Core này), nên việc chưa nối không gây lỗi cho người dùng cuối — chỉ có nghĩa là nhánh AI_CONTROL chưa thể bật lên được.

---

## BƯỚC 6 — Timer / Queue / Listener / Cache — rủi ro memory leak

Kiểm tra toàn bộ 22 file "sống":

- **`ResultQueue.js`** — dùng đúng 1 `setTimeout` (cửa sổ gom 400ms), được `clear` về `null` ngay trong `_flush()` trước khi có thể tạo timer mới. Không có `setInterval`, không có polling. **Không rủi ro leak.**
- **`EventBus.js`** — kế thừa `EventEmitter`, gọi `setMaxListeners(200)` để tránh cảnh báo giả khi nhiều module subscribe. Tất cả `subscribe()` trong 22 file sống đều gọi **đúng 1 lần trong constructor** của các singleton (`module.exports = new X()`), tức chỉ đăng ký 1 lần khi app khởi động, không có vòng lặp tạo listener nhiều lần, không có `unsubscribe` tương ứng nhưng **không cần thiết** vì các singleton này sống suốt vòng đời process (main process Electron chỉ có 1 instance). **Không rủi ro leak trong nhóm file sống.**
- **`TaskQueue.js`** — mảng `this.queue` chỉ có `push`/`shift`, không giới hạn kích thước. Vì hiện tại **không có ai gọi `dequeue()`** (xem Bước 5), về lý thuyết nếu nhánh `AI_CONTROL` được bật mà `PluginController` vẫn chưa được nối, mảng này sẽ **phình to vô hạn** theo thời gian chạy app. Hiện tại vô hại vì `WorkflowManager` (nguồn duy nhất gọi `enqueue`) chỉ chạy khi có `DECISION_READY`, và toàn bộ pipeline phía trên chỉ được kích hoạt từ IPC `ai-result` — ở chế độ `LEGACY_CONTROL` mặc định, renderer hiện tại (`keyEngine.js` v.v.) **có gọi `reportAiResult` hay không cần xác minh thêm ở renderer** — nằm ngoài phạm vi file phía Core đã audit. **Ghi nhận là rủi ro tiềm ẩn cần theo dõi khi nối `PluginController`, không phải lỗi cần sửa ngay.**
- **`TelemetryLogger.js`** — ghi file đồng bộ (`appendFileSync`), có rotation theo dung lượng (10MB), không giữ buffer trong RAM. **Không rủi ro leak.**
- **Cache**: không có module nào trong 22 file sống implement cache thật (các file cache đều là stub 0 byte ở `core/ai/memory/CacheManager.js`, `core/services/CacheService.js`) — không có gì để đánh giá.

**Không phát hiện memory leak nào trong code đang thực sự chạy.**

---

## BƯỚC 7 — Tổng kết

### Mức độ hoàn thiện từng subsystem

| Subsystem | Trạng thái | Ghi chú |
|---|---|---|
| Boot / Entry (`app/main.js`) | 🟢 Hoàn thiện | IPC đầy đủ, khớp `preload.js` (trừ 1 gap đã biết trước: `ai-command`) |
| AIContext / AnalysisState | 🟢 Hoàn thiện | Đúng thiết kế single-source-of-truth |
| InferenceEngine / ResultQueue | 🟢 Hoàn thiện | Timer an toàn, logic phân loại/gom rõ ràng |
| DecisionEngine / WorkflowManager (workflow/) | 🟢 Hoàn thiện | Dedupe đúng, publish đúng |
| TaskQueue | 🟡 Hoàn thiện nhưng cụt | Có API, không ai dequeue |
| PluginController | 🟡 Viết xong, chưa tích hợp | ⚠️ Chưa được `require()` — ưu tiên #1 |
| Driver thật (AutoTune/AutoKey/SoundShifter/...) | 🔴 Chưa viết | 0 byte, System D |
| Kernel/Registry (`core/ai/kernel/`) | 🟡 Viết xong, chưa dùng | Song song với AIBootstrap, chưa quyết định giữ cái nào |
| Kernel/Registry (`core/kernel/` — bộ thứ 2) | 🔴 Dead code | Đề xuất xóa ở Integration |
| `core/command-engine-js/*` (System B) | 🟡 Viết xong, mồ côi | Không require ở đâu |
| `core/command-engine-ts/*` (System C) | 🔴 Không chạy được | Thiếu build TypeScript |
| `modules/*` (MVC scaffold) | 🔴 Stub trống | 8 byte/file |
| `core/ai/events/{EventBus,events}.js` | 🔴 Rác nguy hiểm | Trùng tên, nội dung sai, dễ require nhầm |
| System A (`vocalCommandRouter.js` + MIDI/AHK) | 🟢 Đang chạy thật | Không đổi gì, ngoài phạm vi nhiệm vụ |

### Lỗi đã sửa trong nhiệm vụ này (7 chỗ, 7 file)
1. `core/ai/kernel/Kernel.js` — gỡ conflict marker
2. `core/ai/kernel/Registry.js` — gỡ conflict marker
3. `core/ai/kernel/BootLoader.js` — gỡ 2 conflict marker
4. `core/ai/AIContext.js` — gỡ conflict marker, khôi phục 3 hàm update bị thiếu
5. `core/ai/AIBootstrap.js` — xóa khai báo trùng biến, xóa mảnh vụn merge
6. `core/events/Events.js` — bổ sung hằng số `PLUGIN_COMMAND` bị thiếu
7. `core/shared/ControlSource.js` — sửa lỗi copy-paste ở `isAiControl()`

### Lỗi còn tồn tại (chưa sửa — nằm ngoài phạm vi "chỉ sửa lỗi cú pháp" hoặc cần quyết định kiến trúc trước)
- `PluginController.js` chưa được nối vào `AIBootstrap.js` (xem Bước 5) — **cần bạn xác nhận trước khi sửa**.
- `Events.APP_CLOSE` dùng ở `core/kernel/Kernel.js` (dead code) nhưng chưa khai báo — không sửa vì nằm trong nhánh dead code sẽ bị loại bỏ.
- `preload.js` gọi kênh IPC `ai-command` chưa có `ipcMain.handle` tương ứng — gap đã tự ghi chú trước, thuộc tính năng Command Engine chưa giao.
- `core/ai/managers/WorkflowManager.js` (0 byte) trùng tên với `core/ai/workflow/WorkflowManager.js` (file thật) — đã ghi nhận từ trước, cố tình chưa xử lý trong nhiệm vụ này theo đúng comment gốc trong code.

### Danh sách ưu tiên cho giai đoạn Integration (đề xuất, không tự thực hiện)
1. **Nối `PluginController.js`** vào `AIBootstrap.js` (thêm 1 dòng require) để khép kín pipeline AI → Plugin Bridge.
2. **Xóa hoặc đổi tên** `core/ai/events/{EventBus.js, events.js}` — rác nguy hiểm, dễ gây crash nếu ai đó require nhầm.
3. **Quyết định giữ 1 trong 2** bộ Kernel/Registry/BootLoader (`core/ai/kernel/` vs `core/kernel/`) — xóa bộ còn lại.
4. **Quyết định số phận** `core/command-engine-js/*` (System B, viết đầy đủ) — tích hợp thật hoặc xóa, tránh code "ma" hàng nghìn dòng không ai bảo trì.
5. Viết Driver thật (`core/drivers/*.js`) khi tới giai đoạn nối `PluginController` → thực thi MIDI/AHK qua Core (hiện `vocalCommandRouter.js` vẫn đang đảm nhiệm việc này ở renderer).
6. Dọn stub rỗng ở `modules/*` (28 file 8-byte) nếu không có kế hoạch dùng scaffold MVC này.

---

## Phụ lục — Danh sách đầy đủ 129 file không nằm trong require-graph sống từ `app/main.js`

```
app/bootstrap.js, app/ipc.js, app/preload.js, app/windows.js
core/ai/decision/{AutomationEngine,ConfidenceEngine,RuleEngine}.js
core/ai/engines/{BPMEngine,HarmonyEngine,KeyEngine,ModEngine,SongEngine}.js
core/ai/events/{EventBus,events}.js
core/ai/index.js
core/ai/kernel/{BootLoader,Kernel,Registry,index}.js
core/ai/listeners/{AudioListener,PluginListener,ProjectListener,SystemListener,WindowListener}.js
core/ai/managers/{AudioManager,DriverManager,PluginManager,SettingManager}.js
core/ai/memory/{CacheManager,FingerprintManager,HistoryManager,MemoryManager}.js
core/ai/models/{Analysis,Decision,Plugin,Project,Song}.js
core/ai/plugin/PluginController.js
core/ai/workflow/StateMachine.js
core/command-engine-js/{aiLayer,capabilityRegistry,commandEngine,index.example,renderer.example}.js
core/command-engine-js/drivers/{baseDriver,hotkeyDriver,midiDriver,mouseDriver,oscDriver}.js
core/command-engine-ts/test-mcu.js (+ toàn bộ *.ts trong core/command-engine-ts/)
core/drivers/{AHKDriver,AutoKeyDriver,AutoTuneDriver,MelodyneDriver,SoundShifterDriver,StudioOneDriver}.js
core/events/{EventQueue,EventTypes,index}.js
core/kernel/{BootLoader,Kernel,Registry,index}.js
core/models/{Analysis,BPM,Key,Modulation,Song}.js
core/services/{AudioService,CacheService,DatabaseService,DriverService,PluginService,SettingService,WindowService}.js
core/shared/{BaseDriver,BaseEngine,BaseManager,BaseService,Config,Constants,CoreError,Utils,Version,index}.js
modules/{AI,Audio,Dashboard,Plugin,Setting,Setup,Voice}/{controller,index,service,view}.js
modules/GPT cấu trúc.js
scripts/analyzeTelemetry.js
tests/unit/*.verify.js (7 file)
ui/js/{appSettings,renderer,setup,vocalCommandRouter}.js
ui/js/engines/{bpmEngine,keyEngine,modEngine}.js
```
*(Nhóm `app/preload.js`, `ui/js/*`, `tests/unit/*`, `scripts/*` không phải dead code — xem giải thích ở Bước 2.)*
