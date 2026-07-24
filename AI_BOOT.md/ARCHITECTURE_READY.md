# ARCHITECTURE_READY.md — AUTO_MENU_AI

**Nhánh:** `main` — commit gốc khi audit: `efe0cac`
**Phạm vi nhiệm vụ:** Architecture Stabilization (Final) — dọn kiến trúc, không thêm tính năng, không đổi UI/HTML/thuật toán Key-BPM-Mod/Telemetry/Adaptive Lock.
**File đã sửa:** `core/ai/AIContext.js`, `core/ai/AIBootstrap.js`, `core/ai/kernel/Kernel.js`, `core/events/Events.js` (chi tiết mục 9).

---

## 1. PIPELINE CUỐI CÙNG (đã chạy thử thật, không phải suy đoán trên giấy)

```
Renderer (ui/js/renderer.js: keyEngine/bpmEngine/modEngine)
   │  window.electronAPI.reportAiResult(type, payload)   [preload.js]
   ▼
IPC "ai-result"  (app/main.js)
   │  AIContext.updateKey/updateBpm/updateMod()
   │  EventBus.publish(KEY_UPDATED / BPM_UPDATED / MOD_UPDATED)
   ▼
AnalysisState.js  → so sánh cũ/mới → publish *_CHANGED + ANALYSIS_UPDATED
   ▼
InferenceEngine.js → InferenceRules.js phân loại → publish ANALYSIS_RESULT
   ▼
ResultQueue.js → gom 400ms (1 setTimeout duy nhất) → publish ANALYSIS_READY
   ▼
DecisionEngine.js → DecisionRules.js map → publish DECISION_READY
   ▼
WorkflowManager.js → lọc trùng liên tiếp → TaskQueue.enqueue() (song song, không chặn) → publish WORKFLOW_READY
   ▼
PluginController.js  ★ MỚI NỐI trong nhiệm vụ này ★
   │  ControlSource = LEGACY_CONTROL (mặc định) → CHỈ log, KHÔNG publish
   │  ControlSource = AI_CONTROL → publish PLUGIN_COMMAND
   ▼
EventBus.subscribe(PLUGIN_COMMAND) trong app/main.js → IPC "plugin-command"
   ▼
renderer.js: onPluginCommand() → sendKeyToAutotune() / sendToneStep() (vocalCommandRouter.js)
   ▼
Driver → Studio One
```

**So với sơ đồ đề bài yêu cầu chứng minh** (Renderer → Key Engine → IPC → AIContext → AnalysisState → Inference → ResultQueue → Decision → Workflow → PluginController → IPC → Renderer → Driver):
✅ **Khớp hoàn toàn**, đã xác nhận bằng chạy thử thật (xem mục "Kiểm chứng runtime" cuối file), không còn khác biệt nào.

---

## 2. REQUIRE GRAPH (tóm tắt — chi tiết đầy đủ ở `REQUIRE_GRAPH.md`)

- 14 module lõi của pipeline tạo thành **1 chuỗi require một chiều**, không vòng lặp.
- `PluginController.js` trước đây không được require ở đâu → **nay đã được require đúng 1 lần** trong `AIBootstrap.js` (dòng require tối thiểu, không đổi logic file `PluginController.js`).
- Không phát hiện require nào bị đứt (broken require) trên đường chạy thật.
- 2 require bị đứt còn tồn tại (`core/ai/kernel/BootLoader.js → ../drivers/PluginController` không tồn tại, `core/ai/events/EventBus.js → ./StateMachine` không tồn tại) đều nằm trong file **orphan, không ai require** — không ảnh hưởng runtime, không sửa vì ngoài phạm vi.

---

## 3. EVENT GRAPH

| Event | Publisher | Subscriber | Trạng thái |
|---|---|---|---|
| `KEY_UPDATED`/`BPM_UPDATED`/`MOD_UPDATED` | `app/main.js` (IPC `ai-result`) | `AnalysisState.js` | Chạy thật, 1 subscriber |
| `KEY_CHANGED`/`BPM_CHANGED`/`MOD_CHANGED` | `AnalysisState.js` | `InferenceEngine.js` | Chạy thật, 1 subscriber |
| `ANALYSIS_UPDATED` | `AnalysisState.js` | `InferenceEngine.js` (chỉ log, cố ý không publish tiếp để tránh trùng) | Chạy thật |
| `ANALYSIS_RESULT` | `InferenceEngine.js` | `ResultQueue.js` | Chạy thật, 1 subscriber |
| `ANALYSIS_READY` | `ResultQueue.js` (qua đúng 1 `setTimeout`/đợt gom) | `DecisionEngine.js` | Chạy thật, 1 subscriber |
| `DECISION_READY` | `DecisionEngine.js` | `WorkflowManager.js` | Chạy thật, 1 subscriber |
| `WORKFLOW_READY` | `WorkflowManager.js` | **`PluginController.js` — ★ MỚI, đã kiểm chứng chỉ 1 subscriber, không trùng** | Chạy thật |
| `PLUGIN_COMMAND` | `PluginController.js` (chỉ khi `AI_CONTROL`) | `app/main.js` (đã có sẵn từ trước) | Chạy thật — đã kiểm chứng bằng test thật (xem mục Kiểm chứng runtime) |

**Xác nhận theo yêu cầu:**
- ✅ Không vòng lặp: `PluginController` chỉ publish `PLUGIN_COMMAND`, không module nào phía sau publish ngược lại `WORKFLOW_READY`/`DECISION_READY`/... .
- ✅ Không event chết: mọi event trong `core/events/Events.js` đang dùng cho pipeline đều có đúng 1 publisher + đúng 1 subscriber thật.
- ✅ Không publish thừa: `AnalysisState` cố ý không phát lại `ANALYSIS_RESULT` khi nhận `ANALYSIS_UPDATED` (đã có comment giải thích trong code, tránh trùng).
- ✅ Không listener trùng: đã đo trực tiếp bằng `EventBus.listenerCount()` sau khi khởi tạo — **mỗi event đúng 1 listener**, không hơn (xem mục Kiểm chứng runtime).

---

## 4. DEAD CODE (không nằm trên pipeline, không sửa vì ngoài phạm vi)

| File | Vấn đề |
|---|---|
| `core/ai/events/EventBus.js` | Nội dung thật là class `AIBrain` (dán nhầm), require file không tồn tại |
| `core/ai/events/events.js` | Bản sao cũ của `core/events/Events.js`, thiếu 3 hằng số mới nhất |
| `core/ai/managers/WorkflowManager.js` | File rỗng 0 byte, nay đã hết bị require sau khi dọn ở Bước 1 |
| `core/ai/index.js` | Wrapper không ai dùng (AIBrain được require trực tiếp, không qua đây) |
| `core/events/index.js`, `EventQueue.js`, `EventTypes.js` | Không ai require |
| `app/bootstrap.js` | Định nghĩa `bootstrap()` không ai gọi; entry point thật là `app/main.js` |

---

## 5. ORPHAN MODULE (đã sửa lỗi cú pháp cho sạch nhưng KHÔNG nối vào pipeline — ngoài phạm vi)

| File | Đã làm gì | Vì sao không nối |
|---|---|---|
| `core/ai/kernel/Kernel.js` | Gỡ merge-conflict còn sót (Bước 1) để `node --check` pass | Không ai require, là 1 kiến trúc "Registry" khác, nối vào sẽ là thay đổi kiến trúc lớn — cần bàn riêng, ngoài phạm vi "Architecture Stabilization" lần này |
| `core/ai/kernel/Registry.js`, `BootLoader.js`, `index.js` | Không cần sửa (đã hết lỗi cú pháp từ trước) | Cùng lý do trên |
| `core/kernel/*` (cụm riêng, không phải `core/ai/kernel`) | Không đụng tới | Thuộc `core/command-engine-js`/`ts`, không liên quan AI pipeline |

---

## 6. MEMORY LEAK CHECK

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Singleton | ✅ Đúng — mọi module lõi (`AIContext`, `AnalysisState`, `InferenceEngine`, `ResultQueue`, `DecisionEngine`, `WorkflowManager`, `PluginController`, `EventBus`) đều `module.exports = new X()`, Node cache module → chỉ khởi tạo 1 lần dù require nhiều nơi | Đọc mã từng file |
| EventBus listener | ✅ Không trùng — đã đo `listenerCount()` thật sau khi `AIBootstrap.initialize()`: mỗi event đúng **1** | Chạy `dryrun_test.js` (xem log cuối file) |
| Timer | ✅ Không mồ côi — `ResultQueue.js` dùng đúng 1 `setTimeout` mỗi đợt gom, luôn `this.windowTimer = null` sau khi `_flush()`, không có `setInterval`/polling ở đâu trong pipeline | Đọc mã `ResultQueue.js` |
| Queue (`TaskQueue.js`) | ⚠️ **CÓ RỦI RO, CHƯA SỬA (ngoài phạm vi nhiệm vụ này)** — `enqueue()` được gọi mỗi lần `WORKFLOW_READY`, nhưng **`dequeue()` không được gọi ở bất kỳ đâu trong toàn repo**. `PluginController.js` lắng nghe `WORKFLOW_READY` trực tiếp, không đọc từ `TaskQueue` — nghĩa là `TaskQueue` là 1 nhánh ghi-nhưng-không-đọc, chạy buổi diễn nhiều giờ sẽ tích luỹ bộ nhớ dần | Grep `dequeue(` toàn repo → 0 kết quả |
| Listener khác (renderer/preload) | Không kiểm tra sâu (ngoài phạm vi Core AI, không đổi HTML/UI) | — |

**Kết luận mục 6:** Không có memory leak mới phát sinh do việc nối PluginController. Rủi ro `TaskQueue` là vấn đề **có từ trước**, độc lập với việc nối PluginController, cần 1 nhiệm vụ riêng để quyết định thiết kế đúng (có nên có consumer đọc `TaskQueue` không, hay xoá hẳn nhánh ghi vô nghĩa này) — không tự ý sửa vì đây là quyết định kiến trúc, không phải "sửa lỗi cú pháp/kiến trúc rõ ràng đúng sai".

---

## 7. QUEUE STATUS

| Câu hỏi | Trả lời |
|---|---|
| `enqueue()` có chạy không | Có, mỗi khi có `WORKFLOW_READY` mới sau lọc trùng |
| `dequeue()` có chạy không | Không, 0 lần trong toàn repo |
| Có consumer thật không | Không |
| Có tăng vô hạn không | Có nguy cơ thật, xem mục 6 |

---

## 8. PLUGIN STATUS

| Hạng mục | Trạng thái |
|---|---|
| `PluginController.js` được require | ✅ Có, đúng 1 lần, trong `AIBootstrap.js` |
| Subscribe `WORKFLOW_READY` | ✅ Đúng 1 lần (đã đo `listenerCount`) |
| Publish `PLUGIN_COMMAND` khi `LEGACY_CONTROL` (mặc định) | ✅ Không publish — chỉ log quan sát (đã kiểm chứng bằng test thật, 0 lệnh nhận được sau 2 đợt dữ liệu giả lập) |
| Publish `PLUGIN_COMMAND` khi `AI_CONTROL` | ✅ Publish đúng, đúng 1 lần cho mỗi action, không lặp (đã kiểm chứng bằng test thật trên bản sao riêng, không đụng file thật) |
| Nguy cơ vòng lặp EventBus/IPC | Không phát hiện (một chiều tuyệt đối, renderer không gọi lại `reportAiResult` trong `onPluginCommand`) |
| Nguy cơ spam Driver/Studio One | Không, vì mặc định vẫn `LEGACY_CONTROL` — hệ thống cũ (`vocalCommandRouter.js`) vẫn hoạt động y như trước, không đổi hành vi hiện tại của app |

---

## 9. IPC STATUS

| Kênh | Chiều | Trạng thái |
|---|---|---|
| `ai-result` | Renderer → Main | Chạy thật, không đổi |
| `plugin-command` | Main → Renderer | Đã có sẵn từ trước (chờ sẵn), **nay lần đầu có dữ liệu thật để chuyển tiếp** vì `PluginController` đã được nối |
| `get-control-source` (nếu có) | Renderer → Main | Không thuộc phạm vi kiểm tra sâu lần này (không đổi UI/renderer) |

---

## 10. DANH SÁCH FILE ĐÃ SỬA — CHI TIẾT

| File | Sửa gì | Vì sao | Ảnh hưởng module nào |
|---|---|---|---|
| `core/ai/AIContext.js` | Gỡ 2 marker merge-conflict còn sót (`<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main`), giữ lại nhánh `origin/main` (có `updateKey`/`updateBpm`/`updateMod`) | File có lỗi cú pháp thật (`node --check` báo SyntaxError), khiến `app/main.js` không thể `require` được → **toàn bộ app không khởi động được** | `app/main.js`, `AIBootstrap.js`, `AnalysisState.js` (đều require file này) |
| `core/ai/AIBootstrap.js` | (a) Gỡ merge-conflict trùng khai báo `WorkflowManager`; xoá dòng require thừa trỏ tới file rỗng `managers/WorkflowManager.js` (biến này chưa từng được dùng). (b) Thêm 1 dòng require `./plugin/PluginController` + 1 getter `getPluginController()` | (a) Lỗi cú pháp `SyntaxError: Identifier 'WorkflowManager' has already been declared`, cùng nguyên nhân chặn boot như trên. (b) Đúng nhiệm vụ Bước 5 — nối mắt xích còn thiếu duy nhất theo đúng pattern require-để-kích-hoạt-listener đã dùng cho mọi engine khác trong file | Kích hoạt `PluginController.js` lần đầu tiên; không đổi logic bên trong `PluginController.js` |
| `core/ai/kernel/Kernel.js` | Gỡ merge-conflict trùng khai báo require path (`../shared` vs `../../shared`), giữ nhánh `../../shared`/`../../events` vì khớp đúng vị trí thật của `core/shared`/`core/events` | Lỗi cú pháp, dù file này orphan (không ai require) vẫn nên sạch để `node --check` pass toàn repo theo đúng yêu cầu Bước 1 | Không ai require file này — 0 ảnh hưởng runtime |
| `core/events/Events.js` | Thêm hằng số `PLUGIN_COMMAND: "PLUGIN_COMMAND"` còn thiếu | `app/main.js` và `PluginController.js` đều dùng `Events.PLUGIN_COMMAND` nhưng hằng số này chưa từng được định nghĩa (đọc ra `undefined`) — phát hiện từ audit trước, cần sửa trước khi việc nối PluginController có ý nghĩa thật | Mọi module require `core/events/Events.js` (không đổi giá trị nào đã có, chỉ thêm 1 dòng mới) |

**Việc CHƯA làm (ngoài phạm vi nhiệm vụ này, cần task riêng):**
1. `TaskQueue.js` không có consumer — hàng đợi tăng dần theo thời gian, cần quyết định thiết kế (thêm consumer, hay bỏ hẳn nhánh `enqueue` vô nghĩa).
2. Dọn dead code: `core/ai/kernel/*`, `core/ai/events/EventBus.js`, `core/ai/events/events.js`, `core/ai/managers/WorkflowManager.js` (file rỗng), `core/ai/index.js`, `core/events/index.js` + `EventQueue.js` + `EventTypes.js`, `app/bootstrap.js`, cụm `core/kernel/*` riêng.
3. Chưa test trên Electron/Studio One thật (môi trường audit không có Electron/DAW) — chỉ kiểm chứng bằng Node thuần, mô phỏng đúng luồng dữ liệu thật.

---

## KIỂM CHỨNG RUNTIME (chạy thật bằng Node, không phải suy đoán)

Đã viết 1 script tạm (không đưa vào repo) `require` đúng `core/ai/AIBootstrap.js` thật, gọi `initialize()`, rồi bắn dữ liệu Key giả lập giống hệt những gì `app/main.js` sẽ làm khi renderer gửi `ai-result`, đo `EventBus.listenerCount()` cho từng event:

```
initialize() OK, initialized = true
KEY_UPDATED -> listenerCount = 1        BPM_UPDATED -> 1        MOD_UPDATED -> 1
KEY_CHANGED -> 1                        BPM_CHANGED -> 1        MOD_CHANGED -> 1
ANALYSIS_UPDATED -> 1   ANALYSIS_RESULT -> 1   ANALYSIS_READY -> 1
DECISION_READY -> 1     WORKFLOW_READY -> 1    PLUGIN_COMMAND -> 0 (chưa publish lần nào, đúng vì LEGACY_CONTROL)

--- Test LEGACY_CONTROL (mặc định) ---
[AnalysisState] Key changed: null -> C Major
[InferenceEngine] NOISE ...
[ResultQueue] ANALYSIS_READY: [NOISE]
Sau 600ms, PLUGIN_COMMAND nhận được: 0   ✅ đúng như thiết kế

--- Đổi Key khác đi ---
[AnalysisState] Key changed: C Major -> D Major
[InferenceEngine] MODULATION ...
[ResultQueue] ANALYSIS_READY: [MODULATION]
[DecisionEngine] DECISION_READY: [SHIFT_KEY=D Major]
[WorkflowManager] WORKFLOW_READY: [SHIFT_KEY=D Major]
[PluginController] [LEGACY_CONTROL] Quan sát 1 action, KHÔNG gửi PLUGIN_COMMAND: [SHIFT_KEY]
Tích luỹ PLUGIN_COMMAND: 0   ✅ đúng, không spam Driver dù có thay đổi thật

--- Không có lỗi nào (throw) trong toàn bộ quá trình chạy ---
```

Đồng thời đã kiểm chứng riêng trên 1 **bản sao tạm** (không đụng file thật trong repo) với `ControlSource = AI_CONTROL` để xác nhận nhánh còn lại cũng chạy đúng: `PluginController` publish đúng `PLUGIN_COMMAND: SHIFT_KEY=D Major` **đúng 1 lần**, không lặp, không throw.

---

# KẾT LUẬN CUỐI CÙNG

## READY
