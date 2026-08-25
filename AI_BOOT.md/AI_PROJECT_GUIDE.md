# AI PROJECT GUIDE — AUTO_MENU_AI

> File này là điểm bắt đầu bắt buộc cho bất kỳ ai (Developer, Claude, ChatGPT, hoặc bất kỳ
> AI nào khác) làm việc trên dự án này. Đọc file này trước, sau đó xem `ARCHITECTURE.md`,
> `KNOWN_LIMITATIONS.md`, `TASKS.md` để có bức tranh đầy đủ trước khi sửa bất cứ gì.

## 1. Mục đích dự án

AUTO_MENU_AI là ứng dụng desktop (Electron) dành cho ca sĩ/nhạc công Việt Nam, tự động:

- Dò **Key** (giọng nhạc), **BPM** (nhịp độ), và **Modulation** (chuyển giọng) từ audio
  đang phát trực tiếp (qua soundcard/loopback), bằng xử lý tín hiệu số (DSP) chạy ngay
  trong renderer — không gửi audio ra ngoài, không dùng AI/LLM để phân tích cao độ.
- Gửi kết quả xuống các plugin xử lý giọng hát thật (AutoTune, SoundShifter, AutoKey,
  Melodyne) qua MIDI hoặc AutoHotkey (click chuột mô phỏng), để người hát không phải tự
  tay chỉnh key/tone giữa lúc đang biểu diễn.

## 2. Branch chính thức

**`main` là nhánh duy nhất, là Single Source of Truth (SSOT) cho toàn bộ dự án.**

- Không tạo, không dùng branch `develop` hay bất kỳ branch nào khác cho công việc chính thức.
- Trước khi bắt đầu bất kỳ nhiệm vụ nào: `git checkout main` + `git pull origin main`.
- Mọi thay đổi phải được push thẳng lên `origin/main` khi hoàn thành (trừ khi người yêu cầu
  nói khác).
- Repo có một quy trình "Auto-sync" (xem `.github/workflows/sync-both.yml`, `sync.bat`) tự
  commit định kỳ với message dạng `Auto-sync <ngày giờ>` — đây là cơ chế đồng bộ có sẵn của
  chủ dự án, không phải lỗi hay hành vi lạ nếu thấy các commit này trong lịch sử.

## 3. Trạng thái hiện tại của các module (tóm tắt — xem chi tiết ở `ARCHITECTURE.md`)

| Lớp | Trạng thái |
|---|---|
| UI/Renderer (`ui/`) | Đang chạy thật |
| Signal Engine — Key/BPM/Mod (`ui/js/engines/`) | Đang chạy thật, có test, đã qua nhiều Phase cải tiến |
| Core AI Pipeline (`core/ai/AIContext.js`, `AIBootstrap.js`) | **HỎNG — lỗi cú pháp (SyntaxError) chặn toàn bộ ứng dụng khởi động.** Xem `KNOWN_LIMITATIONS.md` mục đầu tiên. |
| Core AI Pipeline (`AnalysisState` → ... → `PluginController`) | Đã viết xong về logic, nhưng KHÔNG chạy được vì phụ thuộc vào `AIContext.js`/`AIBootstrap.js` đang hỏng ở trên |
| Telemetry (ghi + phân tích) | Hoàn thành, đã test, nhưng **chưa có dữ liệu thật nào được thu thập** |
| Adaptive Lock | Chưa triển khai (Planned) |
| Các kiến trúc trùng lặp/chưa dùng (`core/kernel/`, `core/ai/kernel/`, `modules/*`, `core/command-engine-ts/`...) | Dead code / scaffold, không nằm trên đường chạy thật |

**Không được giả định module nào "chắc là ổn" chỉ vì file tồn tại và có tên hợp lý** — nhiều
file trong `core/` là file rỗng (0 byte) hoặc chứa mã sai hoàn toàn dù tên file đúng. Luôn
đọc mã nguồn thật trước khi báo cáo trạng thái.

## 4. Pipeline tổng quát

```
Audio (loopback/soundcard)
  → Signal Engine (ui/js/engines/keyEngine.js, bpmEngine.js, modEngine.js — renderer, DSP thật)
  → IPC "ai-result" → app/main.js → AIContext (core/ai/AIContext.js)
  → EventBus (core/events/EventBus.js) → AnalysisState → InferenceEngine → ResultQueue
  → DecisionEngine → WorkflowManager → PluginController
  → IPC "plugin-command" → Renderer Bridge (ui/js/renderer.js, onPluginCommand)
  → vocalCommandRouter.js → MIDI / AutoHotkey → DAW / Plugin thật
```

Xem `ARCHITECTURE.md` để biết trạng thái CHI TIẾT từng bước trên (module nào chạy được,
module nào bị chặn, module nào chỉ là quan sát chưa ảnh hưởng quyết định thật).

## 5. Quy tắc không sửa ngoài phạm vi nhiệm vụ

- Chỉ sửa file thuộc đúng phạm vi nhiệm vụ được giao. Không tiện tay refactor/dọn dẹp
  phần khác dù thấy có vấn đề — ghi nhận vào `KNOWN_LIMITATIONS.md` hoặc báo cáo lại thay
  vì tự ý sửa.
- **Không được sửa (trừ khi nhiệm vụ nói rõ và đã được xác nhận):** `ui/js/engines/keyEngine.js`,
  `bpmEngine.js`, `modEngine.js` (thuật toán DSP), HTML/CSS (giao diện), `core/events/EventBus.js`
  (kiến trúc EventBus).
- Nếu một nhiệm vụ đòi hỏi thay đổi kiến trúc (thêm tầng mới, đổi cách 2 module giao tiếp,
  đổi cấu trúc dữ liệu dùng chung...), **phải giải thích trước và chờ xác nhận**, không tự
  ý triển khai rồi báo cáo sau.
- Khi phát hiện tài liệu (`.md`) mâu thuẫn với mã nguồn thật: sửa tài liệu cho khớp mã
  nguồn, không sửa mã nguồn để khớp tài liệu (trừ khi nhiệm vụ yêu cầu rõ ràng).

## 6. Định dạng báo cáo sau mỗi nhiệm vụ

Mọi nhiệm vụ hoàn thành nên báo cáo theo cấu trúc:

```
SUMMARY
- Completed: <mô tả ngắn>
- Branch: main
- Architecture impact: <None / mô tả>
- Code impact: <None / mô tả>
- Backward compatibility: PASS / FAIL (giải thích nếu FAIL)

FILES CREATED
- ...

FILES MODIFIED
- ...

VERIFICATION
- <những gì đã kiểm chứng thật, có bằng chứng — không suy đoán>

REMAINING WORK
- ...

COMMIT HASH
- <sha đầy đủ của commit vừa push>
```

Sau khi hoàn thành nhiệm vụ có ảnh hưởng tới trạng thái dự án, cập nhật `CHANGELOG_AI.md`
và các file liên quan (`VERSION.md`, `KNOWN_LIMITATIONS.md`, `TASKS.md`) cho khớp thực tế mới.
