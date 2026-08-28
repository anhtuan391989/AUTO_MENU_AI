# C2-ADDENDUM.md — Bổ sung sau khi phát hiện `AI_BOOT.md/` (tài liệu ground-truth nội bộ)

**Owner:** Claude C (Auditor — read-only)
**Ngày:** 2026-08-27 (tiếp tục ngay sau C2-REPORT.md, cùng phiên làm việc, cùng snapshot HEAD `9d86f42`)
**Lý do có addendum này:** Sau khi nộp C2-REPORT.md, tôi tiếp tục đào sâu trong lúc chờ snapshot mới từ Claude A/B, và phát hiện **một thư mục tài liệu quan trọng đã bị bỏ sót hoàn toàn ở cả C1 lẫn C2**: `AI_BOOT.md/` (tên trông giống 1 file nhưng thực chất là **thư mục** chứa 18 file `.md` — `DECISIONS.md`, `ARCHITECTURE.md`, `ARCHITECTURE_READY.md`, `ARCHITECTURE_STABILIZATION.md`, `REQUIRE_GRAPH.md`, `FILE_MAP.md`, `TASKS.md`, `KNOWN_LIMITATIONS.md`, `CURRENT_STATE.md`, `OWNER.md`, `ROADMAP.md`, `PROJECT_CONTEXT.md`, `CHANGELOG_AI.md`, `CODE_STANDARDS.md`, `CODE_STYLE.md`, `PERFORMANCE_TARGET.md`, `VERSION.md`, `README.md`). Đây là nhật ký kiến trúc/quyết định do các phiên làm việc AI trước (ChatGPT — System Architect, và một Claude khác) để lại. Tôi xin nhận thiếu sót: lẽ ra phải đọc thư mục này **trước khi** viết C1.
**Production code changed: 0** (chỉ đọc thêm, không sửa gì — kể cả các file `.md` này).

---

## 1. Governance quan trọng cần biết (từ `OWNER.md`)

> *"Source Of Truth: `PROJECT_CONTEXT.md`. Nếu có xung đột giữa code và tài liệu: Ưu tiên tài liệu. Nếu tài liệu sai: Phải cập nhật tài liệu trước khi sửa code."*

Đây là quy tắc governance chính thức của dự án — **quan trọng để bạn biết**, nhưng tôi cũng phát hiện bằng chứng cụ thể (mục 2 dưới đây) rằng **một phần các file trong `AI_BOOT.md/` đã lỗi thời khoảng 1 tháng** so với code hiện tại (các file ghi ngày 23-24/07, trong khi snapshot code hiện tại là commit ngày 27/08). Tôi không tự "ưu tiên tài liệu" hay "ưu tiên code" thay bạn — chỉ báo cáo chỗ nào 2 nguồn khớp nhau (đáng tin cậy cao) và chỗ nào lệch nhau (cần bạn quyết định nguồn nào đúng, theo đúng quy tắc "phải cập nhật tài liệu trước khi sửa code" nếu tài liệu sai).

---

## 2. Cross-validation: tài liệu cũ (Jul 23-24) vs code hiện tại (Aug 27, HEAD 9d86f42)

### 2.1 Khớp gần như hoàn toàn — củng cố độ tin cậy cho C1/C2

`REQUIRE_GRAPH.md` (viết bởi 1 task "Architecture Stabilization" trước đó, quét toàn bộ 151 file `.js`) và `ARCHITECTURE_READY.md` (pipeline "đã chạy thử thật") mô tả **gần như từng chữ một** đúng những gì tôi tự trace độc lập ở C1/C2:
- Cùng danh sách 14 module LIVE trên đường chạy AI pipeline (AIBootstrap → AIBrain → AIContext → AnalysisState → InferenceEngine → ResultQueue → DecisionEngine → WorkflowManager → PluginController → EventBus → Events).
- Cùng kết luận `core/ai/kernel/*`, `core/kernel/*`, `core/ai/managers/WorkflowManager.js` (0 byte), `core/ai/events/*`, `app/bootstrap.js` là orphan/dead.
- Cùng sơ đồ pipeline `renderer → ai-result IPC → AIContext → EventBus → ... → PluginController → plugin-command IPC → renderer → Driver`.

→ **2 nguồn độc lập (audit của tôi bằng code thật, và tài liệu do 1 phiên AI khác viết trước đó cũng bằng code thật) cho ra kết luận giống nhau.** Đây là bằng chứng củng cố mạnh cho độ tin cậy của C1/C2, không phải phát hiện mới cần sửa gì.

**Chi tiết mới REQUIRE_GRAPH.md có mà tôi chưa từng mở tới trong C1/C2** (bổ sung, không mâu thuẫn): `core/ai/events/EventBus.js` — tên file là "EventBus" nhưng **nội dung thật bên trong là class `AIBrain`** (dán nhầm khi copy), và còn `require('./StateMachine')` trỏ tới file không tồn tại cùng thư mục. File này orphan (không ai require) nên không gây crash, nhưng là 1 chi tiết rác đáng chú ý nếu sau này có ai vô tình mở nhầm.

### 2.2 Lệch nhau — vì tài liệu cũ, code đã tiến triển (KNOWN_LIMITATIONS.md đã được xử lý)

`KNOWN_LIMITATIONS.md` (Jul 23) liệt kê 1 lỗi **NGHIÊM TRỌNG — CHẶN TOÀN BỘ ỨNG DỤNG**: `core/ai/AIBootstrap.js` và `core/ai/AIContext.js` còn sót dấu conflict Git chưa giải quyết (`<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main`), gây `SyntaxError`, khiến Electron main process **crash ngay khi mở app**.

**Tôi đã tự kiểm tra lại trên snapshot hiện tại (Aug 27) — xác nhận bằng bằng chứng trực tiếp, không suy đoán:**

| Mục trong KNOWN_LIMITATIONS.md (Jul 23-24) | Trạng thái hiện tại (Aug 27) | Bằng chứng |
|---|---|---|
| #1 — Conflict marker gây SyntaxError, app crash khi mở | ✅ **ĐÃ GIẢI QUYẾT** | `grep "<<<<<<<\|=======\|>>>>>>>"` trên cả 2 file → 0 kết quả (chỉ còn dòng comment `// ====` bình thường, không phải marker conflict). `node --check` cả 2 file → pass sạch, không lỗi. Phù hợp với thực tế C1/C2 đã chạy được toàn bộ pipeline AI qua test (`ConfidenceV2.verify.js` chạy `keyEngine.js` thật xuyên suốt pipeline, PASS phần lớn). |
| #9 — `ControlSource.isAiControl()` trả sai giá trị (so `LEGACY_CONTROL` thay vì `AI_CONTROL`) | ✅ **ĐÃ GIẢI QUYẾT** | Code hiện tại: `function isAiControl() { return CURRENT_MODE === MODES.AI_CONTROL; }` — đúng logic. |
| #10 — `Events.PLUGIN_COMMAND` không được định nghĩa (cả 2 phía cùng nhận `undefined`, "ăn may" khớp nhau) | ✅ **ĐÃ GIẢI QUYẾT** | `core/events/Events.js` hiện có `PLUGIN_COMMAND: "PLUGIN_COMMAND"` — định nghĩa tường minh, không còn dựa vào `undefined` trùng khớp ngẫu nhiên. |
| #5 — `TaskQueue` không có consumer (`dequeue()` không ai gọi) → rò rỉ bộ nhớ nhẹ, không giới hạn | ⚠️ **VẪN CÒN NGUYÊN** | `grep "dequeue"` toàn repo → chỉ có định nghĩa hàm trong `TaskQueue.js`, không có call site nào khác. `WorkflowManager.js` vẫn chỉ gọi `TaskQueue.enqueue()`. Đúng như C1/C2 độc lập cũng ghi nhận qua `PluginController.js` đọc thẳng từ payload `WORKFLOW_READY`, bỏ qua TaskQueue hoàn toàn. |

**Ý nghĩa:** Dự án đã có tiến triển thật giữa lần audit `KNOWN_LIMITATIONS.md` (Jul 23-24, commit gốc `efe0cac`) và snapshot hiện tại (Aug 27, `9d86f42`) — 3/4 mục đã sửa xong. Đây là tín hiệu tích cực, không phải vấn đề mới. Riêng mục TaskQueue vẫn là **rủi ro nhỏ, chưa nghiêm trọng ở tần suất hiện tại** (đúng như tài liệu cũ tự đánh giá) — giữ nguyên P2 trong phân loại C1/C2, không nâng mức độ.

---

## 3. Làm rõ nhầm lẫn thuật ngữ "D1"

Task doc C2 yêu cầu audit **"D1/XML nếu đã được B triển khai"** (ý: 1 file XML mapping MIDI, thuộc quy ước đặt tên task của Claude B). C2-REPORT.md đã báo `WAITING FOR CLAUDE B` vì không tìm thấy file `.xml`/`.xsd` nào trong snapshot.

Khi đọc `DECISIONS.md`, tôi thấy dự án này **cũng có một "D1" khác, ý nghĩa hoàn toàn khác**: *"D1 — `main` là Single Source of Truth (SSOT)"* — 1 quyết định về quy trình Git (chỉ làm việc trên `main`, không dùng `develop`), **không liên quan gì đến MIDI/XML**. Đây là 2 hệ thống đánh số "D1" trùng tên tình cờ, từ 2 ngữ cảnh khác nhau (1 bên là số hiệu Decision trong `DECISIONS.md`, 1 bên là số hiệu Task nội bộ của Claude B). Ghi rõ ở đây để tránh bạn hoặc Claude B nhầm lẫn khi đọc báo cáo — **kết luận "WAITING FOR CLAUDE B" ở C2 vẫn đúng, không đổi**, chỉ là làm rõ không có mối liên hệ nào giữa "D1 (SSOT)" trong `DECISIONS.md` và "D1/XML MIDI mapping" mà task C2 hỏi.

---

## 4. Vì sao cụm `modules/`, `core/kernel/`, `core/services/`, các file rỗng — bị bỏ hoang (giải thích nguồn gốc, không phải suy đoán)

`FILE_MAP.md` và `CURRENT_STATE.md` (2 tài liệu cũ nhất, Jul 23) cho thấy đây từng là **kế hoạch kiến trúc ban đầu thật sự** của dự án ở giai đoạn "Foundation":

```
CURRENT_STATE.md (Jul 23):
  Current Phase: Foundation
  In Progress: Kernel, Registry, Managers
  Waiting: Runtime, Audio Pipeline, Key Engine, MOD Engine

FILE_MAP.md (Jul 23) — kiến trúc DỰ KIẾN ban đầu:
  Kernel.js       → "Điểm khởi động Core"
  AudioService.js → "Capture Audio"
  KeyEngine.js    → "Detect Key"
  ModEngine.js    → "Detect Modulation"
  DriverManager.js → "Quản lý Driver"
```

Đây **chính xác** là bộ tên file mà C1 xác nhận rỗng/dead: `core/kernel/Kernel.js`, `core/services/AudioService.js`, `core/ai/engines/KeyEngine.js` (0 byte — khác `ui/js/engines/keyEngine.js` là bản thật), `core/ai/engines/ModEngine.js` (0 byte), `core/ai/managers/DriverManager.js` (0 byte).

**Kết luận rõ ràng:** Đây **không phải code bị quên xoá ngẫu nhiên** — đây là **tàn dư của 1 kế hoạch kiến trúc "Foundation" ban đầu** (Kernel/Registry/Manager pattern kiểu OOP nặng) đã bị **âm thầm thay thế** bằng 1 cách tiếp cận trực tiếp hơn thực tế đang chạy (renderer tự chứa Key/BPM/Mod Engine, `app/main.js` xử lý thẳng IPC không qua Kernel, `CommandRuntime` độc lập không qua DriverManager). Kế hoạch cũ bị bỏ nhưng file/thư mục scaffold chưa từng được dọn theo. Điều này khớp hoàn toàn với khuyến nghị M.1/M.3 trong C1/C2 (nên hỏi owner có giữ lại `modules/`/`core/kernel/`/`core/services/` cho kế hoạch tương lai hay xoá hẳn) — nay có thêm bằng chứng lịch sử rõ ràng để quyết định: **kiến trúc "Foundation" ban đầu đã bị thay thế trên thực tế, các file này gần như chắc chắn an toàn để dọn nếu owner xác nhận không có ý định quay lại pattern Kernel/Registry/Manager.**

---

## 5. Cập nhật Definition of Done / trạng thái C2

Addendum này **không thay đổi** kết luận C2-REPORT.md gốc (PARTIAL, các mục P0/P1/P2, Integration Test Matrix, blocker re-check) — chỉ **bổ sung bằng chứng củng cố** (mục 2.1), **cập nhật 3 mục đã được giải quyết** mà C1/C2 gốc không biết vì không có ngữ cảnh lịch sử (mục 2.2 — lưu ý: các mục #1/#9/#10 này **không nằm trong danh sách blocker P0/P1/P2 của C1/C2 gốc**, vì C1/C2 tự trace trên snapshot hiện tại vốn đã không còn lỗi này — addendum chỉ xác nhận thêm rằng đây từng là vấn đề và đã tự khỏi, không phải bỏ sót của C1/C2), và **làm rõ nguồn gốc lịch sử** của khối dead code lớn nhất (mục 4).

```
PRODUCTION FILES CHANGED: 0
FILES DELETED: 0
FILES MERGED: 0
ARCHITECTURE CHANGED: 0
```

**C2 STATUS: PARTIAL** (không đổi so với C2-REPORT.md gốc — lý do PARTIAL vẫn là thiếu snapshot mới từ A/B và không có môi trường Windows/DAW thật, xem C2-REPORT.md mục K).

## 6. Đề xuất bổ sung (ngoài các đề xuất đã có ở C2-REPORT.md mục K)

7. Cập nhật lại `AI_BOOT.md/KNOWN_LIMITATIONS.md`, `CURRENT_STATE.md`, `ROADMAP.md` — các file này đang mô tả trạng thái Jul 23-24, lệch khá xa so với thực tế Aug 27 (ví dụ `CURRENT_STATE.md` vẫn ghi "Waiting: Key Engine, MOD Engine" dù 2 thứ này đã chạy thật từ lâu). Vì `OWNER.md` quy định "ưu tiên tài liệu khi xung đột với code", tài liệu lỗi thời có thể khiến 1 Claude/dev tương lai đưa ra quyết định sai dựa trên thông tin cũ. Đây là việc dọn tài liệu, không phải dọn code — an toàn để làm sớm.
8. Nếu quyết định dọn `modules/`/`core/kernel/`/`core/services/`/`app/bootstrap.js` (theo gợi ý mục 4 ở trên), nên cập nhật đồng thời `FILE_MAP.md` để không tiếp tục mô tả kiến trúc Kernel/Registry/Manager đã bị bỏ.
