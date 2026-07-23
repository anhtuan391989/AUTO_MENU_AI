# ROADMAP — AUTO_MENU_AI

> Phase ở đây nói về roadmap **Key Engine Enhancement** (nhánh công việc đang hoạt động
> chính hiện nay) và roadmap **Core AI Pipeline** (nền tảng cho Adaptive Lock). Không nhầm
> với version app (`VERSION.md`).

## Đã hoàn thành

- **Phase 1 — Margin cơ bản:** thêm `top1`/`top2`/`margin` vào kết quả dò Key
  (`ui/js/engines/keyEngine.js`).
- **Phase 1.5 — Margin Logger:** `logMarginSnapshot()` để quan sát Margin theo thời gian thực
  qua console, chưa ảnh hưởng quyết định chốt Key.
- **Phase 2 — Stability Tracker:** thêm chỉ số ổn định `(bestCount/windowSize)²`, đo mức đồng
  thuận theo thời gian giữa các lần đo liên tiếp.
- **Phase 3 — Confidence V2:** gộp Pearson/Margin/Stability/Bass Agreement thành 1 cấu trúc
  điểm số tổng hợp (`confidenceV2`), có hằng số chuẩn hoá tạm (`PEARSON_NORM_MAX`,
  `MARGIN_NORM_RANGE`) chờ dữ liệu thật để tinh chỉnh.
- **Phase 3.5 — Top1 Stability Timer:** đo "Top1 đã đứng yên bao lâu" mà không cần thêm timer
  riêng, tính inline trong vòng lặp vote hiện có.
- **Phase 4A — Telemetry Logger:** ghi mỗi lần phân tích Key thành JSONL qua IPC → main
  process (`core/shared/TelemetryLogger.js`), có rotation theo dung lượng.
- **Phase 5 — Telemetry Analyzer (offline):** `scripts/analyzeTelemetry.js` — đọc toàn bộ
  `logs/*.jsonl`, tách phiên, tính thống kê (mean/median/percentile), phát hiện bất thường
  theo ngưỡng tạm, xuất báo cáo Markdown.
- **Core AI Pipeline (logic, chưa chạy được):** đã viết đầy đủ AnalysisState → InferenceEngine
  → ResultQueue → DecisionEngine → WorkflowManager → PluginController, cùng `ControlSource`
  (chuyển đổi an toàn giữa hệ Legacy đang chạy thật và hệ Core mới) và Renderer Bridge
  (`onPluginCommand`) cho `SET_KEY`/`LOAD_NEW_SONG`/`SHIFT_KEY`.

## Đang chặn / cần làm trước khi đi tiếp (xem `KNOWN_LIMITATIONS.md` để biết chi tiết)

- Sửa lỗi cú pháp chặn boot ở `core/ai/AIBootstrap.js` và `core/ai/AIContext.js` (ưu tiên cao
  nhất — không phase nào liên quan Core có thể kiểm chứng thật cho tới khi xong việc này).
- Bắt đầu thu thập dữ liệu telemetry thật: 500 bài hát (100 bài × 5 thể loại — Pop/EDM/Rock/
  Ballad/Live), dùng để chọn ngưỡng Adaptive Lock bằng thực nghiệm thay vì đoán.

## Kế hoạch tiếp theo (chưa triển khai — Planned)

- **Phase 6 (đề xuất) — Adaptive Lock:** dùng dữ liệu 500 bài đã thu để chọn ngưỡng
  Margin/Stability/ConfidenceV2/Top1StableMs phù hợp theo từng thể loại, thay thế (hoặc bổ
  sung) điều kiện chốt Key cố định hiện tại (`bestCount>=5 && elapsed>=15000ms`). **Cần quyết
  định kiến trúc trước khi làm** (đặt trong `keyEngine.js` hay mở rộng đường truyền dữ liệu
  lên Core) — xem `DECISIONS.md` D6 và `KNOWN_LIMITATIONS.md` mục 3.
- **Bổ sung test cho `core/ai/`:** ít nhất smoke-test boot (`require()` thật + `node --check`)
  cho toàn bộ `core/ai/**` để tránh lặp lại tình huống lỗi cú pháp tồn tại nhiều commit mà
  không ai phát hiện.
- **Dọn kiến trúc trùng lặp:** quyết định giữ/xoá các nhánh dead code đã liệt kê trong
  `ARCHITECTURE.md` (2 bộ Kernel, 2 bộ EventBus, `modules/*`, `core/command-engine-ts/`...).
- **`UPDATE_BPM` xuống plugin thật:** hiện chưa có hàm tương ứng trong
  `vocalCommandRouter.js` (xem `KNOWN_LIMITATIONS.md` mục 4).
- **Kích hoạt `AI_CONTROL` thật:** sau khi Core Pipeline đã được kiểm chứng ổn định song song
  với hệ Legacy trong một thời gian đủ dài (tiêu chí cụ thể cần Developer xác định).
