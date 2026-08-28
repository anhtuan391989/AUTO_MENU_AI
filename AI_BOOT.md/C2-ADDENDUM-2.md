# C2-ADDENDUM-2.md — Đối chiếu với `PROJECT_CONTEXT.md` (Hiến pháp dự án / Source of Truth)

**Owner:** Claude C (Auditor — read-only)
**Ngày:** 2026-08-27 (tiếp tục, cùng phiên, cùng snapshot HEAD `9d86f42`)
**Bối cảnh:** `AI_BOOT.md/OWNER.md` quy định rõ: *"Source Of Truth: PROJECT_CONTEXT.md. Nếu có xung đột giữa code và tài liệu: Ưu tiên tài liệu."* Addendum này đọc kỹ `PROJECT_CONTEXT.md` (bản "hiến pháp" dự án) và đối chiếu với thực tế code đã trace ở C1/C2 — chỉ báo cáo, không tự sửa gì theo đúng vai trò Auditor.
**Production code changed: 0.**

---

## 1. Đối chiếu Mission & Core Goals — KHÔNG phát hiện vi phạm

`PROJECT_CONTEXT.md` mục 1-2: dự án là "AI Studio Assistant cho Studio One", ưu tiên tuyệt đối Key > Mod > Realtime > CPU thấp > RAM thấp > UI ổn định > tính năng mới; **không phải** phần mềm điều khiển Auto-Tune hay app DJ.

Đối chiếu thực tế: đúng như vậy — Auto-Tune chỉ là 1 trong các driver được điều khiển qua `plugin-command`/`bridgeSemitoneDelta()`, không phải trung tâm hệ thống. Không phát hiện tính năng nào lệch khỏi mission này.

## 2. Đối chiếu UI Policy — KHÔNG phát hiện vi phạm

Mục 4/8: HTML đã chốt, không được đổi layout/id/class/CSS variable/framework. C1/C2 xác nhận **không có bất kỳ thay đổi UI/HTML nào** được thực hiện bởi Claude C trong toàn bộ 2 task — đúng cả `PROJECT_CONTEXT.md` lẫn hard rule riêng của C1/C2.

## 3. Đối chiếu mục 5 (ARCHITECTURE chính thức) — CÓ LỆCH, cần ghi nhận rõ (EXPECTED vs ACTUAL)

**Kiến trúc chính thức theo hiến pháp:**
```
Computer Audio → Audio Capture → Audio Buffer → Fingerprint → KEY Detection
  → MOD Detection → Song Analysis → Decision → Automation → Drivers → Plugins → UI
```

**Kiến trúc thực tế đã trace ở C1/C2:**
```
Computer Audio → getUserMedia(deviceId) [renderer, KHÔNG có bước "Audio Buffer"/"Fingerprint"
  riêng biệt nào có thể trace được] → ui/js/engines/keyEngine.js (KEY) + bpmEngine.js (BPM,
  không nằm trong sơ đồ hiến pháp) + modEngine.js (MOD) → ai-result IPC → AIContext (đóng vai
  trò gần giống "Song Analysis") → AnalysisState → InferenceEngine → ResultQueue →
  DecisionEngine (Decision) → WorkflowManager (gần giống "Automation") → PluginController
  → Driver (chỉ có AutoTune/SoundShifter qua vocalCommandRouter.js, chưa thấy DriverManager
  tổng quát nào — core/ai/managers/DriverManager.js là file RỖNG 0 byte theo C1) → Plugin → UI
  (ngược lại, hiển thị kết quả)
```

**3 điểm lệch cụ thể, có bằng chứng:**

1. **Không có bước "Fingerprint" tách biệt nào tồn tại trong code.** Đã grep toàn repo cho "fingerprint"/"Fingerprint" — chỉ tìm thấy 1 kết quả: `core/ai/memory/FingerprintManager.js`, và file này **rỗng 0 byte** (đã xác nhận ở C1 mục G.2). Nếu hiến pháp coi Fingerprint là bước bắt buộc trong pipeline chính thức, bước này hiện **hoàn toàn chưa tồn tại** trong code thật.
2. **"Automation" trong hiến pháp không khớp 1-1 với module nào đang chạy.** `core/ai/decision/AutomationEngine.js` (tên gần khớp nhất) — **rỗng 0 byte** (C1 xác nhận). Vai trò "Automation" trong runtime thật hiện do `WorkflowManager.js` đảm nhiệm (lọc trùng liên tiếp → enqueue → publish `WORKFLOW_READY`), tên gọi khác với hiến pháp.
3. **"Drivers" trong hiến pháp mô tả 1 tầng tổng quát (`DriverManager → AutoTuneDriver/MelodyneDriver/Future Driver`, mục 12).** Thực tế: `core/drivers/*.js` (AutoTuneDriver, MelodyneDriver, SoundShifterDriver, AHKDriver, AutoKeyDriver) đều **rỗng 0 byte** (C1). Driver thật đang hoạt động là `vocalCommandRouter.js` (nằm trong `ui/js/`, không phải `core/drivers/`), gọi thẳng `sendKeyToAutotune()`/`sendToneStepToSoundShifter()` — không đi qua lớp `DriverManager` trừu tượng nào cả.

**Đánh giá công bằng (không kết luận "sai", chỉ ghi nhận lệch):** Bản thân `AI_BOOT.md/ROADMAP.md`/`CURRENT_STATE.md` (Jul 23-24) đã tự thừa nhận dự án đang ở giai đoạn "Foundation", các thành phần Kernel/Registry/Manager/Driver tổng quát "đang chờ" (Waiting) — tức là **kiến trúc chính thức trong hiến pháp vẫn là đích đến dài hạn, chưa phải mô tả hiện trạng**. Team đã đi con đường thực dụng hơn (renderer tự chứa Key/BPM/Mod engine, gọi thẳng driver cụ thể) để có sản phẩm chạy được nhanh, thay vì xây đủ tầng trừu tượng trước. Đây là **quyết định kiến trúc có thể hợp lý về mặt thực dụng, nhưng lệch khỏi tài liệu "Source of Truth" đã chốt** — theo đúng quy tắc `OWNER.md` ("nếu tài liệu sai phải cập nhật tài liệu trước khi sửa code"), **đây là quyết định owner cần đưa ra**: hoặc (a) cập nhật `PROJECT_CONTEXT.md` mục 5/12 cho khớp kiến trúc thực dụng hiện tại, hoặc (b) giữ hiến pháp và coi việc xây `Fingerprint`/`AutomationEngine`/`DriverManager` là nợ kỹ thuật cần làm. **Claude C không tự quyết định thay, chỉ trình bày 2 lựa chọn.**

## 4. Đối chiếu mục 6 (Single Source of Truth = SongAnalysis) — GẦN KHỚP, khác tên gọi

Hiến pháp yêu cầu 1 object `SongAnalysis` duy nhất mà mọi module đều đọc, không tự tạo object KEY/BPM riêng.

Thực tế: `core/ai/AIContext.js` đóng đúng vai trò này về mặt chức năng — 1 instance singleton (`module.exports = new AIContext()` kiểu tương tự `SongDatabase.js`), có sub-object `song`, `key`, `bpm`, `mod`, `analysis`, `audio`, `system`, `app` — và toàn bộ `AnalysisState`/`InferenceEngine`/`DecisionEngine`/`WorkflowManager`/`PluginController` đều đọc từ đúng 1 instance này, không tạo object Key/BPM riêng lẻ nào khác ở tầng Core (đã xác nhận qua `REQUIRE_GRAPH.md` + trace độc lập của tôi). **Chỉ khác tên gọi** (`AIContext` thay vì `SongAnalysis`) — về tinh thần "1 nguồn dữ liệu duy nhất, không tự tạo object KEY/BPM riêng ở tầng Core" thì **tuân thủ đúng**. Không cần owner quyết định gì thêm ở mục này — ghi nhận để đầy đủ, không phải vấn đề.

## 5. Đối chiếu mục 7 (AI Responsibility) — KHÔNG phát hiện vi phạm

"AI KHÔNG trực tiếp detect KEY/MOD, chỉ đọc SongAnalysis và quyết định." Đã xác nhận ở C1/C2 mục D: `core/ai/*` (tầng "AI" theo đúng nghĩa hiến pháp) hoàn toàn không chứa logic phân tích audio nào — toàn bộ `AnalysisState`/`InferenceEngine`/`DecisionEngine` chỉ đọc `AIContext`, không tự phân tích tín hiệu. Việc detect Key/BPM/Mod thật xảy ra ở `ui/js/engines/*.js` (renderer) — đây là 1 module riêng biệt publish kết quả vào `AIContext` qua IPC, đúng đúng tinh thần "AI không tự detect, chỉ đọc kết quả đã detect".

## 6. Đối chiếu mục 11 (Event Driven) — KHÔNG phát hiện vi phạm trong phạm vi `core/ai/*`

"Không gọi module trực tiếp nếu có thể dùng EventBus." Đã xác nhận toàn bộ chuỗi `core/ai/*` giao tiếp thuần qua `EventBus.publish()/subscribe()`, không có gọi hàm trực tiếp chéo module. Ngoại lệ hợp lý duy nhất: `PluginController.js` gọi trực tiếp `ManualState.getManualState()` và `ControlSource.getControlSource()` (đọc state, không phải gọi hành vi xử lý của module khác) — đây là truy vấn trạng thái thuần, không phải kiểu "gọi module trực tiếp" mà nguyên tắc này muốn tránh (tránh dependency chéo giữa các bước xử lý nghiệp vụ). Đánh giá: tuân thủ đúng tinh thần.

## 7. Đối chiếu mục 9 (Performance Target) — KHÔNG audit được (ngoài khả năng)

Hiến pháp đặt mục tiêu CPU <3% khi phát nhạc, <1% khi đã cache, RAM <150MB. **C2 không thể đo được các chỉ số này** — cần chạy app thật trên Windows với DAW đang phát nhạc, ngoài khả năng sandbox Linux hiện tại. Đánh dấu **UNKNOWN — cần môi trường Windows thật**, không suy đoán.

## 8. Đối chiếu mục 14 (Current Direction — thứ tự phát triển bắt buộc)

Hiến pháp: `Foundation → Runtime → Audio Pipeline → Key Engine → MOD Engine → Automation → AI → UI Integration`, "Không được bỏ qua các bước."

Thực tế quan sát: Key Engine và MOD Engine (bước 4-5) đã hoàn thiện và chạy thật (`VERSION.md` Jul 23 tự xác nhận "Key Engine: ✅ Hoàn thiện DSP"), trong khi **Foundation** (bước 1 — Kernel/Registry, theo `FILE_MAP.md`) và **Automation** (bước 6, theo nghĩa `AutomationEngine.js`) vẫn đang là file rỗng chưa triển khai. Nói cách khác, **thực tế đã "bỏ qua" thứ tự Foundation → Runtime → Audio Pipeline mà hiến pháp yêu cầu**, đi thẳng vào Key/MOD Engine trước rồi mới quay lại xây AI Core Pipeline sau (đúng như `ROADMAP.md` mô tả: Phase 1-5 đều là Key Engine trước, Core AI Pipeline viết sau và tới thời điểm `KNOWN_LIMITATIONS.md` Jul 23 còn chưa chạy được). **Đây là thực tế lịch sử đã xảy ra, không phải điều C có thể thay đổi** — chỉ ghi nhận vì hiến pháp nói rõ "không được bỏ qua các bước" nhưng thực tế đã bỏ qua, để owner biết và tự quyết định có cần điều chỉnh hiến pháp cho khớp thực tế hay không.

---

## 9. Tổng kết Addendum 2

**Không phát hiện vi phạm nghiêm trọng nào mới** ngoài các gap kiến trúc đã biết (Fingerprint/AutomationEngine/DriverManager là file rỗng — đã nằm trong C1 mục G.2 dưới dạng "dead code", nay addendum này chỉ **liên hệ thêm** rằng 3 file rỗng này chính là những mảnh còn thiếu để khớp đúng sơ đồ ARCHITECTURE chính thức trong hiến pháp, chứ không phải phát hiện file rỗng mới).

**Đề xuất bổ sung cho owner** (nối tiếp mục K của C2-REPORT.md):
9. Quyết định 1 trong 2: (a) cập nhật `PROJECT_CONTEXT.md` mục 5/12 cho khớp kiến trúc thực dụng hiện tại (renderer-embedded engines, driver gọi thẳng qua `vocalCommandRouter.js`), hoặc (b) mở task xây `FingerprintManager`/`AutomationEngine`/`DriverManager` thật để khớp đúng hiến pháp — không tự quyết định thay owner vì đây là quyết định kiến trúc tầm dự án, không phải chi tiết kỹ thuật.

---

```
PRODUCTION FILES CHANGED: 0
FILES DELETED: 0
FILES MERGED: 0
ARCHITECTURE CHANGED: 0
```

**C2 STATUS: PARTIAL** (không đổi — vẫn chờ snapshot mới A/B + môi trường Windows thật để đo Performance Target và test DAW end-to-end).
