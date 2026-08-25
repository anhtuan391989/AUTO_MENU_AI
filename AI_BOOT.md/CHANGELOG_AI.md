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
