# VERSION — AUTO_MENU_AI

> Cập nhật file này mỗi khi trạng thái tổng thể dự án thay đổi đáng kể (không phải mỗi commit
> nhỏ — việc đó thuộc `CHANGELOG_AI.md`).

- **Version (package.json):** `1.0.0`
- **Branch:** `main` (Single Source of Truth)
- **Ngày cập nhật file này:** 21/07/2026

## Trạng thái tổng thể

| Thành phần | Trạng thái |
|---|---|
| **Ứng dụng có khởi động được không?** | 🔴 **KHÔNG** — `core/ai/AIBootstrap.js` và `core/ai/AIContext.js` có lỗi cú pháp (SyntaxError) chặn `app/main.js` ngay từ lúc mở. Xem `KNOWN_LIMITATIONS.md` mục 1. |
| **Current phase** | Vừa hoàn thành Phase 5 (Telemetry Analyzer offline — `scripts/analyzeTelemetry.js`), đang chờ dữ liệu thật trước khi bắt đầu Adaptive Lock. |
| **Key Engine status** | ✅ Hoàn thiện về mặt DSP + Phase 1–4A (Margin/Stability/ConfidenceV2/Top1 Stability Timer/Telemetry). 7/7 test PASS. Chưa dùng các số liệu nâng cao để chốt Key (chỉ log). |
| **BPM / Mod Engine status** | Đang chạy thật, chưa audit chi tiết nội bộ trong lần audit gần nhất. |
| **Core AI Pipeline status** | Đã viết đầy đủ logic (AnalysisState → InferenceEngine → ResultQueue → DecisionEngine → WorkflowManager → PluginController) nhưng **không chạy được** vì phụ thuộc 2 file đang lỗi cú pháp ở trên. |
| **Telemetry status** | Hạ tầng ghi + phân tích hoàn thiện, đã test. **0 bản ghi dữ liệu thật** — kế hoạch thu 500 bài hát chưa bắt đầu/chưa đồng bộ vào `main`. |
| **Adaptive Lock status** | Chưa triển khai. Bị chặn bởi: (1) app chưa boot được, (2) chưa có dữ liệu thật, (3) chưa có quyết định kiến trúc về nơi đặt logic (trong `keyEngine.js` hay ở tầng Core). |
| **Test coverage** | 7 test cho `keyEngine.js` + `TelemetryLogger.js` + `analyzeTelemetry.js`. **0 test** cho toàn bộ `core/ai/` (AIContext, AIBootstrap, AnalysisState, InferenceEngine, ResultQueue, DecisionEngine, WorkflowManager, TaskQueue, PluginController, ControlSource, EventBus). |

## Điều kiện để tăng version tiếp theo (đề xuất, chưa phải cam kết)

- `1.0.1` (đề xuất): sau khi sửa xong lỗi chặn boot (mục 1 `KNOWN_LIMITATIONS.md`) và xác nhận
  app mở được bình thường.
- `1.1.0` (đề xuất): sau khi có đủ dữ liệu telemetry thật (500 bài) và bắt đầu triển khai
  Adaptive Lock.
