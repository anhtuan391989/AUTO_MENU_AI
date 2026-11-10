# CHANGELOG (AI) — AUTO_MENU_AI

> Mỗi mục thêm theo format dưới đây, mới nhất ở trên cùng. Chỉ ghi nhiệm vụ có ảnh hưởng thật
> tới mã nguồn hoặc trạng thái dự án (không ghi các lần chỉ đọc/audit không sửa gì, trừ khi
> audit đó tạo ra tài liệu mới như lần này).

```
## <ngày, YYYY-MM-DD> — <tên nhiệm vụ ngắn gọn>
- Thực hiện bởi: <Claude / ChatGPT / Developer>
- Completed: <mô tả>
- Files created: <danh sách>
- Files modified: <danh sách>
- Architecture impact: <None / mô tả>
- Verification: <đã kiểm chứng gì, bằng cách nào>
- Commit hash: <sha>
```

---

## 2026-07-21 — Chuẩn hoá GitHub `main` thành Single Source of Truth

- Thực hiện bởi: Claude
- Completed: Tạo bộ tài liệu chuẩn ở thư mục gốc để `main` trở thành nguồn dữ liệu duy nhất
  cho Developer/Claude/ChatGPT cùng đọc. Không sửa bất kỳ file mã nguồn sản phẩm nào.
- Files created: `AI_PROJECT_GUIDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `AI_RULES.md`,
  `DECISIONS.md`, `KNOWN_LIMITATIONS.md`, `VERSION.md`, `TASKS.md`, `CODE_STANDARDS.md`,
  `PERFORMANCE_TARGET.md`, `CHANGELOG_AI.md` (file này).
- Files modified: `README.md`.
- Architecture impact: None (chỉ tài liệu).
- Verification: Đọc trực tiếp mã nguồn thật trên `main` qua GitHub API (không dùng bản nhớ
  cache) cho các file trọng yếu: `app/main.js`, `core/ai/AIBootstrap.js`, `core/ai/AIContext.js`,
  `core/ai/workflow/TaskQueue.js`, `core/shared/ControlSource.js`, `ui/js/vocalCommandRouter.js`,
  `ui/js/renderer.js`, `package.json`, `README.md` cũ. Xác nhận bằng `node --check` rằng
  `AIBootstrap.js`/`AIContext.js`/`core/ai/kernel/*` có lỗi cú pháp thật (SyntaxError), và bằng
  `git show HEAD:<file>` rằng lỗi này đã nằm trong chính commit HEAD, không phải lỗi cục bộ.
  Trước đó cũng đã thực hiện 1 audit kỹ thuật đầy đủ (10 mục: Key Engine, Core AI Pipeline,
  TaskQueue, EventBus, Plugin Controller, Telemetry, Tests, Performance, Kiến trúc, Adaptive
  Lock) làm nền tảng nội dung cho các file tài liệu này.
- Commit hash: *(điền sau khi push xong)*

## DB-COMPETE-01 — AI tự cạnh tranh với Key Database/Server (không cần bấm Auto Detect)
- Files modified: `ui/js/renderer.js` (1 khối nhỏ trong callback `KeyEngine.detectOnce` + 1 điều kiện hiển thị dòng "AI Detect").
- Files created: `tests/unit/DbCompete01.verify.js`.
- Hành vi: bài có Key Database/Server -> vẫn hiện `ACTIVE: DATABASE - <tone>` và gửi Key đó xuống Auto-Tune; AI vẫn dò liên tục. Mỗi Key AI CHỐT được so với Database bằng luật `__aiBeatsDatabase` có sẵn (khác Key, tin cậy >= 0.85, không phải láng giềng cách 5). Đạt -> AI thay Database cho bài này. Manual vẫn cao nhất. Không ghi gì lên Key Server.
- Dòng "AI Detect" ở nguồn Database hiện LISTENING cho tới khi AI dò được thật (trước đây hiện Key hạt giống).
- Architecture impact: None (dùng đúng cơ chế `__dbBypass` có sẵn). Không đụng KeyEngine/BPM/MOD, HTML, CSS.
- Verification: `DbCompete01.verify.js` 12 PASS / 0 FAIL; 94 test có nhắc `renderer` cho kết quả y hệt trước/sau sửa.
- Commit hash: *(chưa commit — giao dạng patch)*

## DB-MATCH-STRICT-01 — Key Server chỉ khớp MỜ tên thì không dùng làm Key bài đang phát
- Files modified: `core/integration/KeyServerSync.js` (option mới `strictTitle`, 1 khối trong `lookup()`), `app/main.js` (1 dòng bật `strictTitle: true`).
- Files created: `tests/unit/KeyServerStrict01.verify.js`.
- Lỗi gốc: route `/find` của Server khớp mờ tên (>=80% số từ trùng, hoặc chứa nhau) nên các bản khác nhau của cùng 1 bài (MV / Karaoke / Lyrics, có thể khác tone) bị coi là MỘT bài -> dùng chung tone; và `submit()` bị chặn "server đã có" nên bản thứ hai không bao giờ có Key riêng.
- Hành vi mới: `/find` trả tên Server KHÁC tên đang phát (sau chuẩn hoá) -> `lookup()` trả `{found:false, similar:{key,songId,title}}`: Menu không dùng làm DATABASE, AI dò, rồi tự gửi Key riêng của bản này lên Server. Khớp đúng tên/ID, hoặc Server không trả title: giữ như cũ. Mặc định `strictTitle` tắt (tương thích ngược), chỉ main.js bật.
- Architecture impact: None (không đổi Server, UI, KeyEngine, luồng IPC). Hệ quả đã biết: bài chỉ khớp mờ phải chờ AI dò vài giây như bài mới; "Sửa Key trên Server" (keyCorrect) báo "not-on-server" với bài chỉ khớp mờ.
- Verification: `KeyServerStrict01.verify.js` 10 PASS / 0 FAIL; 58 test liên quan (KeyServerSync/main/SongDb/keyCorrect/worker) cho kết quả y hệt trước/sau sửa.
- Commit hash: *(chưa commit — giao dạng patch)*
