# DECISIONS — AUTO_MENU_AI

> Mỗi quyết định ghi theo format: **Decision / Reason / Tradeoff / Rejected alternatives**.
> Chỉ ghi quyết định đã thực sự được áp dụng trong mã nguồn (có bằng chứng), không ghi ý
> định chưa triển khai (những cái đó thuộc `ROADMAP.md`/`TASKS.md`).

---

### D1 — `main` là Single Source of Truth (SSOT)

- **Decision:** Toàn bộ Developer, Claude, ChatGPT chỉ đọc/ghi trên nhánh `main`. Không dùng
  `develop` hay nhánh song song cho công việc chính thức.
- **Reason:** Trước đây từng làm việc trên `develop`, gây lệch trạng thái giữa các AI/người
  cùng tham gia dự án — mỗi bên đọc một phiên bản khác nhau, dẫn tới báo cáo sai thực tế.
- **Tradeoff:** Mất khả năng thử nghiệm an toàn trên nhánh riêng trước khi merge; bù lại bằng
  cách luôn giải thích trước khi đổi kiến trúc và luôn chạy test/kiểm tra trước khi push.
- **Rejected alternatives:** Giữ `develop` làm nhánh thử nghiệm rồi merge định kỳ — bị từ chối
  vì tăng nguy cơ tài liệu/AI đọc nhầm nhánh.

### D2 — Aggregation window (ResultQueue) = 400ms

- **Decision:** `ResultQueue` gom các `ANALYSIS_RESULT` trong cửa sổ cố định 400ms trước khi
  phát `ANALYSIS_READY`, dùng 1 `setTimeout` duy nhất, không gia hạn khi có sự kiện mới tới.
- **Reason:** Đủ ngắn để không trễ cảm nhận với người dùng, đủ dài để gom các thay đổi Key/BPM/
  Mod xảy ra gần như đồng thời thành 1 quyết định duy nhất, tránh gửi nhiều lệnh nhỏ lẻ chồng
  chéo xuống Plugin.
- **Tradeoff:** Nếu 2 sự kiện thật cách nhau hơn 400ms một chút, chúng sẽ bị tách thành 2
  quyết định riêng thay vì gộp lại.
- **Rejected alternatives:** Cửa sổ trượt (gia hạn timer mỗi khi có sự kiện mới) — bị từ chối
  vì có thể trễ vô hạn nếu sự kiện tới liên tục, không phù hợp với yêu cầu phản hồi nhanh khi
  biểu diễn trực tiếp.

### D3 — Vote Window = 8, VOTE_MIN_AGREE = 5 (Key Engine)

- **Decision:** `keyEngine.js` chỉ chốt (lock) 1 Key khi trong cửa sổ 8 lần đo gần nhất có
  ít nhất 5 lần cùng cho ra đúng 1 kết quả, VÀ đã trôi qua tối thiểu
  `MIN_ELAPSED_BEFORE_LOCK_MS` (15000ms) kể từ lúc bắt đầu dò.
- **Reason:** Chống chốt nhầm do nhiễu/khoảnh khắc mập mờ (2 giọng gần nhau về mặt hoà âm);
  cần đa số rõ ràng (5/8) chứ không phải chỉ cần lần đo gần nhất đúng.
- **Tradeoff:** Tăng độ trễ trước khi chốt Key so với chỉ tin 1 lần đo — chấp nhận được vì ưu
  tiên độ chính xác hơn tốc độ trong bối cảnh chốt Key chỉ cần làm 1 lần đầu bài.
- **Rejected alternatives:** Chốt ngay khi có 1 lần đo confidence cao — bị từ chối vì dễ chốt
  sai ở đoạn đầu bài khi tín hiệu audio còn ít/nhiễu.

### D4 — Telemetry dùng định dạng JSONL, ghi qua IPC, rotation 10MB

- **Decision:** `TelemetryLogger.js` ghi mỗi bản ghi phân tích Key thành 1 dòng JSON
  (JSON Lines) vào `logs/*.jsonl`, xoay vòng file mới khi file hiện tại vượt 10MB, ghi qua
  kênh IPC `"telemetry-record"` (renderer gửi, main process ghi).
- **Reason:** JSONL dễ đọc từng dòng độc lập (không cần parse cả file để đọc 1 bản ghi), dễ
  ghi thêm liên tục (append-only) mà không phải đọc lại file trước. Ghi ở main process (không
  phải renderer) vì renderer không có quyền ghi file hệ thống trực tiếp trong Electron
  (`contextIsolation`).
- **Tradeoff:** `fs.appendFileSync` là I/O đồng bộ, chặn tiến trình main trong lúc ghi — chấp
  nhận được vì tần suất ghi thấp (~1 lần/1.5s) và kích thước bản ghi nhỏ.
- **Rejected alternatives:** Ghi trực tiếp từ renderer qua Node `fs` — bị từ chối vì renderer
  chạy với `contextIsolation` bật, không có quyền truy cập filesystem trực tiếp theo đúng mô
  hình bảo mật Electron khuyến nghị.

### D5 — `ControlSource` mặc định `LEGACY_CONTROL`

- **Decision:** `core/shared/ControlSource.js` có 2 chế độ — `LEGACY_CONTROL` (renderer tự
  gửi lệnh như trước, Core chỉ quan sát) và `AI_CONTROL` (Core gửi lệnh qua Workflow →
  PluginController → Bridge). Mặc định hiện tại là `LEGACY_CONTROL`, đổi bằng cách sửa thẳng
  hằng số `CURRENT_MODE` trong file (không có giao diện đổi lúc chạy).
- **Reason:** Hệ Legacy đã chạy ổn định thật; Core AI Pipeline là hệ mới chưa được kiểm chứng
  đầy đủ trong môi trường thật (biểu diễn trực tiếp) — không được phép làm hỏng đường đang
  chạy thật trong lúc phát triển hệ mới song song.
- **Tradeoff:** Trong khi ở `LEGACY_CONTROL`, toàn bộ công sức đã bỏ ra ở Core AI Pipeline
  (bước 3–9 trong `ARCHITECTURE.md`) chưa tạo ra giá trị thật cho người dùng — chỉ chạy nền để
  quan sát/log.
- **Rejected alternatives:** Có giao diện (UI) cho phép người dùng tự đổi chế độ lúc chạy — bị
  từ chối ở giai đoạn này vì tăng rủi ro người dùng vô tình bật `AI_CONTROL` khi Core chưa đủ
  tin cậy (xem `KNOWN_LIMITATIONS.md` — Core hiện còn đang bị lỗi chặn boot).

### D6 — Confidence V2 / Margin / Stability chỉ dùng để quan sát (log), chưa ảnh hưởng quyết định khoá

- **Decision:** Các số liệu nâng cao (Margin, Stability, ConfidenceV2 — Phase 1–3.5 của Key
  Engine) được tính toán đầy đủ trong `keyEngine.js` nhưng **không** được gắn vào kết quả trả
  ra ngoài (`result`/`bestResult`), và điều kiện chốt Key (`willLock`) vẫn giữ nguyên logic cũ
  (vote count + thời gian tối thiểu), không đọc các số liệu mới này.
- **Reason:** Thu thập dữ liệu thật trước, chọn ngưỡng bằng thực nghiệm sau — tránh áp ngưỡng
  đoán mò (`MARGIN_NORM_RANGE` hiện là hằng số tạm, tự nhận trong code là "chưa có dữ liệu
  thực tế để chọn chính xác") vào quyết định chốt Key thật, có thể làm hỏng hành vi đang chạy
  ổn định.
- **Tradeoff:** Adaptive Lock chưa thể triển khai cho tới khi có đủ dữ liệu thật VÀ có quyết
  định kiến trúc rõ ràng về nơi đọc các số liệu này (xem `KNOWN_LIMITATIONS.md` mục 3).
- **Rejected alternatives:** Áp ngay ngưỡng đoán cho Adaptive Lock ở Phase 3 — bị từ chối vì vi
  phạm nguyên tắc "không đoán trạng thái/ngưỡng khi chưa có bằng chứng thực nghiệm" của dự án.
