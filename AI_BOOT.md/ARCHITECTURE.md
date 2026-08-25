# ARCHITECTURE — AUTO_MENU_AI

> Trạng thái mô tả trong file này được xác nhận bằng cách đọc trực tiếp mã nguồn trên
> `main` (qua GitHub API) và chạy `node --check` để xác nhận lỗi cú pháp là có thật, không
> phải suy đoán. Nếu mã nguồn thay đổi, file này PHẢI được cập nhật lại trước khi coi là
> đáng tin.

## Pipeline hiện tại

```
Audio (loopback/soundcard)
        │
        ▼
[1] Signal Engine (renderer, DSP thật)
    ui/js/engines/keyEngine.js / bpmEngine.js / modEngine.js
        │  IPC "ai-result" (chỉ gửi {key, confidence} / {bpm} / {from,to,semitone,time})
        ▼
[2] app/main.js  ──require──▶  AIBootstrap.js, AIContext.js
        │
        ▼
[3] AIContext (core/ai/AIContext.js) — updateKey()/updateBpm()/updateMod()
        │  EventBus.publish(KEY_UPDATED / BPM_UPDATED / MOD_UPDATED)
        ▼
[4] AnalysisState (core/ai/AnalysisState.js) — so sánh, phát *_CHANGED
        ▼
[5] InferenceEngine (core/ai/inference/InferenceEngine.js) — phân loại, phát ANALYSIS_RESULT
        ▼
[6] ResultQueue (core/ai/aggregation/ResultQueue.js) — gom cửa sổ 400ms, phát ANALYSIS_READY
        ▼
[7] DecisionEngine (core/ai/decision/DecisionEngine.js) — map → DecisionAction, phát DECISION_READY
        ▼
[8] WorkflowManager (core/ai/workflow/WorkflowManager.js) — khử trùng, enqueue TaskQueue, phát WORKFLOW_READY
        ▼
[9] PluginController (core/ai/plugin/PluginController.js) — chỉ hoạt động nếu AI_CONTROL, phát PLUGIN_COMMAND
        │  IPC "plugin-command"
        ▼
[10] Renderer Bridge (ui/js/renderer.js, cuối file — onPluginCommand)
        ▼
[11] vocalCommandRouter.js — sendKeyToAutotune / sendToneStep / sendToneStepToSoundShifter
        ▼
MIDI / AutoHotkey click  →  Plugin thật (AutoTune / SoundShifter) trong DAW
```

Song song, còn có **đường đi cũ (Legacy)** vẫn đang hoạt động thật, không đi qua bước [3]-[9]:

```
Signal Engine → applyDetectedKey()/applyModEvent() (ui/js/renderer.js)
             → (nếu LEGACY_CONTROL, mặc định) → vocalCommandRouter.js → MIDI/AHK → Plugin
```

`core/shared/ControlSource.js` quyết định đường nào được phép gửi lệnh thật tại một thời
điểm (`LEGACY_CONTROL` mặc định, `AI_CONTROL` là đường Core). Xem `DECISIONS.md`.

## Trạng thái từng bước (Completed / Experimental / Blocked / Planned)

| # | Module | File | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | Signal Engine (Key) | `ui/js/engines/keyEngine.js` | **Completed** | Đã qua Phase 1–4A (Margin, Stability, ConfidenceV2, Top1 Stability Timer, Telemetry). Có 7 test, tất cả PASS. |
| 1 | Signal Engine (BPM/Mod) | `ui/js/engines/bpmEngine.js`, `modEngine.js` | Completed (đang chạy thật) | Chưa audit chi tiết nội bộ trong lần audit này — cần xác minh thêm nếu có nhiệm vụ đụng tới 2 file này. |
| 2 | Electron main bootstrap | `app/main.js` | **Blocked** | Chạy được tới dòng require `AIBootstrap.js` thì crash vì bước 3 hỏng. |
| 3 | AIBootstrap | `core/ai/AIBootstrap.js` | 🔴 **BROKEN** | SyntaxError: khai báo `WorkflowManager` bị lặp 2 lần (dấu vết merge Git chưa giải quyết). `node --check` báo lỗi thật. |
| 3 | AIContext | `core/ai/AIContext.js` | 🔴 **BROKEN** | SyntaxError: còn nguyên dấu `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` chưa giải quyết (dòng ~106–150). |
| 4 | AnalysisState | `core/ai/AnalysisState.js` | Implemented, **Blocked** | Cú pháp hợp lệ, logic hợp lý, nhưng không chạy được vì phụ thuộc AIContext ở bước 3. |
| 5 | InferenceEngine | `core/ai/inference/InferenceEngine.js` | Implemented, **Blocked** | Cùng lý do trên. |
| 6 | ResultQueue | `core/ai/aggregation/ResultQueue.js` | Implemented, **Blocked** | Cửa sổ gom 400ms cố định, 1 timer duy nhất, không có bug logic phát hiện được. |
| 7 | DecisionEngine | `core/ai/decision/DecisionEngine.js` | Implemented, **Blocked** | — |
| 8 | WorkflowManager | `core/ai/workflow/WorkflowManager.js` | Implemented, **Blocked** | — |
| 8b | TaskQueue | `core/ai/workflow/TaskQueue.js` | Implemented nhưng **không có consumer** | `enqueue()` được gọi, `dequeue()`/`peek()`/`clear()` không bao giờ được gọi ở bất kỳ đâu. PluginController đọc trực tiếp từ payload sự kiện `WORKFLOW_READY`, không đọc từ TaskQueue. Là hạ tầng chờ sẵn cho "tầng thực thi" tương lai (đúng như comment trong chính file), không phải lỗi thiết kế, nhưng đang không được dùng thật. |
| 9 | PluginController | `core/ai/plugin/PluginController.js` | Implemented, **Blocked** (và mặc định tắt qua ControlSource) | Có kiểm tra `ControlSource.isLegacyControl()` để tránh gửi trùng lệnh với hệ Legacy — đúng thiết kế. |
| 10 | Renderer Bridge | `ui/js/renderer.js` (cuối file, `onPluginCommand`) | **Completed cho `SET_KEY`/`LOAD_NEW_SONG`/`SHIFT_KEY`** | Đã lắng nghe IPC `plugin-command` và gọi đúng hàm có sẵn trong `vocalCommandRouter.js`. Hiện dormant (không nhận sự kiện nào) vì `ControlSource` đang là `LEGACY_CONTROL` nên Core không phát `PLUGIN_COMMAND`. |
| 10 | Renderer Bridge — `UPDATE_BPM` | như trên | **Not implemented** | Code tự nhận trong comment: `vocalCommandRouter.js` không có hàm nào gửi BPM xuống plugin, Bridge chỉ log lại, không hành động. |
| 11 | vocalCommandRouter (Legacy, đang chạy thật) | `ui/js/vocalCommandRouter.js` | **Completed, đang chạy thật** | `sendKeyToAutotune`, `sendToneStep` (MIDI ưu tiên, fallback click AHK), `sendToneStepToSoundShifter`, `setSoundShifterPower`. |
| — | Telemetry (ghi) | `core/shared/TelemetryLogger.js` | **Completed, đã test** | JSONL, rotation 10MB, ghi qua IPC `telemetry-record`. |
| — | Telemetry (phân tích offline) | `scripts/analyzeTelemetry.js` | **Completed, đã test** | Thống kê + phát hiện bất thường theo ngưỡng tạm. Chạy độc lập, không đụng app đang chạy. |
| — | Telemetry (dữ liệu thật) | `logs/*.jsonl` | **Chưa có dữ liệu** | Thư mục `logs/` không tồn tại trong repo tại thời điểm audit gần nhất — kế hoạch thu 500 bài hát chưa bắt đầu/chưa đồng bộ vào `main`. |
| — | Adaptive Lock | (chưa có file) | **Planned, chưa triển khai** | Xem `KNOWN_LIMITATIONS.md` và `DECISIONS.md` để biết vì sao chưa thể bắt đầu và cần quyết định kiến trúc nào trước khi làm. |

## Kiến trúc trùng lặp / dead code đã phát hiện (KHÔNG nằm trên đường chạy thật)

Các mục dưới đây **không ảnh hưởng ứng dụng đang chạy**, không cần sửa gấp, nhưng cần biết
để tránh nhầm lẫn khi đọc code:

- `core/kernel/*` (Kernel.js, Registry.js, BootLoader.js, index.js) — cú pháp hợp lệ nhưng
  không được `require` ở bất kỳ đâu.
- `core/ai/kernel/*` — cùng tên với trên nhưng nằm trong `core/ai/`, cú pháp **lỗi** (cùng
  loại lỗi dấu conflict Git như `AIContext.js`), cũng không được `require` ở đâu.
- `core/ai/events/EventBus.js` — nội dung file thực chất là code của class `AIBrain`
  (require sai đường dẫn `./AIContext`, `./StateMachine` không tồn tại tương đối từ đây) —
  bị đặt sai tên/sai thư mục, không được require ở đâu.
- `core/ai/events/events.js` — bản sao hằng số sự kiện, thiếu `ANALYSIS_READY`/`WORKFLOW_READY`
  so với `core/events/Events.js` (bản đang dùng thật), không được require ở đâu.
- `core/ai/engines/*.js`, `core/ai/managers/*`, `core/ai/memory/*`, `core/ai/models/*`,
  `core/ai/listeners/*`, `core/drivers/*`, `core/services/*` — toàn bộ 0 byte, scaffold
  chưa triển khai.
- `modules/AI|Audio|Cache|Dashboard|Plugin|Setting|Setup|Voice/*` — file `index.js`/
  `controller.js` chỉ 8 byte, không được `ui/index.html` hay bất kỳ renderer nào tham chiếu.
- `core/command-engine-ts/` — bản TypeScript song song với `core/command-engine-js/`,
  không có hạ tầng build (không có `tsconfig.json`/bước biên dịch nào chạy trong app thật),
  không được dùng.
- `app/bootstrap.js` — không được `app/main.js` require, dead code.
- `app/ipc.js`, `app/windows.js` — file rỗng.

**Quyết định giữ/xoá/hợp nhất các mục trên là quyết định kiến trúc, cần Developer xác nhận
trước khi bất kỳ ai dọn dẹp.**
