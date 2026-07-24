# REQUIRE_GRAPH.md — AUTO_MENU_AI

**Nhánh:** `main` — commit gốc khi audit: `efe0cac` (Fix and update repository)
**Phạm vi:** Toàn bộ 151 file `.js` trong repo (đã quét bằng script, không phải đọc tay từng file). Đi sâu chi tiết ở cụm AI pipeline (`core/ai/*`, `core/events/*`, `core/shared/*`, `app/main.js`); các cụm khác (`modules/*`, `core/command-engine-js`, `core/command-engine-ts`) chỉ liệt kê ở mức tồn tại/orphan vì ngoài phạm vi nhiệm vụ AI Pipeline.

---

## 1. Module ĐANG được require thật (nằm trên đường chạy AI pipeline)

| File | Được require bởi | Vai trò |
|---|---|---|
| `core/ai/AIBootstrap.js` | `app/main.js` | Điểm khởi tạo AI Core duy nhất |
| `core/ai/AIBrain.js` | `core/ai/AIBootstrap.js` | Đối tượng trạng thái vòng đời AI (init/start/stop/destroy) |
| `core/ai/AIContext.js` | `app/main.js`, `core/ai/AIBootstrap.js`, `core/ai/AnalysisState.js` | Kho dữ liệu Key/BPM/Mod hiện tại |
| `core/ai/AnalysisState.js` | `core/ai/AIBootstrap.js` | So sánh cũ/mới, phát `*_CHANGED` + `ANALYSIS_UPDATED` |
| `core/ai/inference/InferenceEngine.js` | `core/ai/AIBootstrap.js` | Phân loại kết quả, phát `ANALYSIS_RESULT` |
| `core/ai/inference/InferenceRules.js` | `core/ai/inference/InferenceEngine.js` | Luật phân loại thuần (không tự require Events/EventBus) |
| `core/ai/inference/AnalysisResult.js` | `core/ai/inference/InferenceEngine.js` | Model kết quả |
| `core/ai/aggregation/ResultQueue.js` | `core/ai/AIBootstrap.js` | Gom 400ms, phát `ANALYSIS_READY` |
| `core/ai/decision/DecisionEngine.js` | `core/ai/AIBootstrap.js` | Map kết quả → hành động, phát `DECISION_READY` |
| `core/ai/decision/DecisionRules.js` | `core/ai/decision/DecisionEngine.js` | Luật quyết định thuần |
| `core/ai/decision/DecisionAction.js` | `core/ai/decision/DecisionEngine.js` | Model hành động |
| `core/ai/workflow/WorkflowManager.js` | `core/ai/AIBootstrap.js` (alias `WorkflowEngine`) | Lọc trùng liên tiếp, đẩy `TaskQueue`, phát `WORKFLOW_READY` |
| `core/ai/workflow/TaskQueue.js` | `core/ai/workflow/WorkflowManager.js` | Hàng đợi task (ghi, không có consumer — xem `ARCHITECTURE_READY.md` mục Queue) |
| `core/ai/plugin/PluginController.js` | `core/ai/AIBootstrap.js` **(★ MỚI GẮN trong nhiệm vụ này)** | Nghe `WORKFLOW_READY`, phát `PLUGIN_COMMAND` khi `AI_CONTROL` |
| `core/events/EventBus.js` | `app/main.js` + toàn bộ tầng `core/ai/*` ở trên | EventBus thật duy nhất (bọc `EventEmitter`) |
| `core/events/Events.js` | `app/main.js` + toàn bộ tầng `core/ai/*` ở trên | Bảng hằng số sự kiện thật duy nhất |
| `core/shared/Logger.js` | Toàn bộ tầng `core/ai/*` | Log thuần, không publish/subscribe |
| `core/shared/ControlSource.js` | `app/main.js`, `core/ai/plugin/PluginController.js` | Cấu hình `LEGACY_CONTROL` / `AI_CONTROL` |
| `core/shared/BaseModule.js` | `core/ai/AIBrain.js` | Lớp cha vòng đời chung |

---

## 2. Module KHÔNG được require ở đâu cả (orphan/dead code — xác nhận bằng quét toàn repo, không phải suy đoán)

| File | Ghi chú |
|---|---|
| `core/ai/kernel/Kernel.js`, `Registry.js`, `BootLoader.js`, `index.js` | Cụm "Kernel" kiểu khác (đăng ký module qua Registry) — không hề được `app/main.js` hay `AIBootstrap.js` đụng tới. Đã sửa 1 lỗi cú pháp còn sót trong `Kernel.js` ở Bước 1 cho sạch, nhưng cụm này vẫn orphan, không nằm trên pipeline đang audit. |
| `core/ai/events/EventBus.js` | Tên file là "EventBus" nhưng nội dung thật là class `AIBrain` (dán nhầm/copy sai), require `./StateMachine` không tồn tại cùng thư mục. Không ai require file này. |
| `core/ai/events/events.js` | Bản sao gần giống `core/events/Events.js` nhưng thiếu 3 hằng số mới nhất (`ANALYSIS_READY`, `WORKFLOW_READY`, và `PLUGIN_COMMAND` vừa thêm). Không ai require. |
| `core/ai/managers/WorkflowManager.js` | File RỖNG 0 byte. Trước đây bị `AIBootstrap.js` require trùng lặp gây lỗi cú pháp (đã gỡ ở Bước 1) — hiện tại **không còn ai require nó nữa**. |
| `core/ai/index.js` | Bọc export `{ AIBrain }` nhưng không ai require chính file `index.js` này (AIBrain được require trực tiếp, không qua index). |
| `core/events/index.js`, `EventQueue.js`, `EventTypes.js` | Không ai require `core/events/index.js`; 2 file kia chỉ được require bởi chính `index.js` orphan đó. |
| `app/bootstrap.js` | Định nghĩa hàm `bootstrap()` đăng ký log listener, nhưng `package.json → "main"` chỉ trỏ `app/main.js`, không ai require `app/bootstrap.js`. |
| `core/kernel/*` (Kernel.js, Registry.js, BootLoader.js, index.js — **khác** `core/ai/kernel/*`) | Cụm riêng, tự khép kín (index require 3 file kia), nhưng không có file nào ngoài cụm này require `core/kernel/index.js`. Không liên quan AI pipeline, thuộc `core/command-engine-js`/`core/command-engine-ts` (ngoài phạm vi nhiệm vụ). |

---

## 3. Module trùng tên (duplicate) — dễ gây nhầm khi đọc code, đã ghi chú rõ trong `AIBootstrap.js`

| Tên trùng | File A | File B | File nào là bản THẬT |
|---|---|---|---|
| `WorkflowManager.js` | `core/ai/managers/WorkflowManager.js` (0 byte, orphan) | `core/ai/workflow/WorkflowManager.js` (có logic thật, nằm trên pipeline) | **B** |
| `EventBus.js` | `core/ai/events/EventBus.js` (nội dung thật là `AIBrain`, orphan, require file không tồn tại) | `core/events/EventBus.js` (bọc `EventEmitter`, đang chạy thật) | **B** |
| `Events.js` / `events.js` | `core/ai/events/events.js` (bản cũ, thiếu hằng số, orphan) | `core/events/Events.js` (đủ hằng số kể cả `PLUGIN_COMMAND` mới thêm, đang chạy thật) | **B** |
| `Kernel.js` / `index.js` / `BootLoader.js` / `Registry.js` | `core/ai/kernel/*` | `core/kernel/*` | Cả hai đều orphan, không cái nào là "bản thật" đang chạy |

**Kết luận require graph:** Toàn bộ 14 module ở mục 1 tạo thành **một chuỗi require một chiều duy nhất**, không có vòng lặp (circular dependency) — `AIContext.js` không require ngược lại bất kỳ module nào phía trên nó. Các module ở mục 2/3 là rác kiến trúc còn sót từ các lần merge/sync trước, không ảnh hưởng runtime, nhưng nên dọn ở nhiệm vụ dọn dẹp riêng (ngoài phạm vi "chỉ sửa đúng phạm vi Architecture Stabilization" của nhiệm vụ này).
