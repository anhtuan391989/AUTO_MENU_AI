# REPORT — MENU-UI-01D: bàn giao kiểm tra Windows và đóng gói nghiệm thu

**TRẠNG THÁI TỔNG THỂ: `BLOCKED`** — chưa có kết quả runtime Windows/Electron thật. Không phải RELEASE READY.

## 1. Repository (đọc trực tiếp từ GitHub `main`)

| Mục | Kết quả |
|---|---|
| Nhánh | `main` |
| Commit hiện tại | `4475d4ec18447fb9809de896e8fcc6d575c8569e` (Auto-sync 17/10/2026 10:30) |
| Commit nền cũ | `b4ac259a33b67e6022d60423e90c2a7b32750fd5` |
| Commit mới hơn nền | 2: `7b3506c` (Auto-sync 8:07) và `4475d4e` (Auto-sync 10:30), cùng do đồng bộ tự động |
| Working tree khi clone | Sạch (`main...origin/main`) |
| **Patch MENU-UI-01B đã được tích hợp vào `main`?** | **CÓ.** `git apply --check` báo patch không áp dụng lại được, vì các thay đổi đã nằm sẵn. Không áp dụng lại. |
| 5 file bàn giao so với `main` | **GIỐNG HỆT từng byte** (`cmp`): `app/main.js`, `app/preload.js`, `ui/js/renderer.js`, `ui/css/style.css`, `tests/unit/AlwaysOnTopMenuUi01B.verify.js` |
| Thay đổi khác từ nền đến HEAD | 16 file, phần lớn `tools/algbench/...` (không liên quan Menu). Không phát hiện xung đột với MENU-UI-01B. |
| `ui/index.html` | Không bị sửa |

## 2. File đã thêm / sửa

**Không sửa file nào của code ứng dụng** (không đụng `app/`, `ui/`, `tests/unit/` cũ). Chỉ thêm công cụ kiểm tra:

| File (đường dẫn trong repo) | Lý do |
|---|---|
| `scripts/verify-menu-ui-01d.ps1` | Script PowerShell chạy lại được: in commit/working tree, kiểm tra Node/npm/dependency, `node --check`, `git diff --check`, 4 test, ghi kết quả |
| `artifacts/MENU-UI-01D/RUNTIME-CHECKLIST.md` | Checklist 14 mục A1–A6, B1–B3, C1–C4, D để bạn tự thử trên Windows thật; mặc định tất cả `NOT RUN` |
| `artifacts/MENU-UI-01D/HUONG-DAN-CHAY.md` | Hướng dẫn 6 bước |
| `artifacts/MENU-UI-01D/sample-log-linux/results.log`, `results.md` | Log mẫu (chạy trên Linux, **không phải Windows**) |
| `artifacts/MENU-UI-01D/REPORT-MENU-UI-01D.md` | Báo cáo này |
| `artifacts/MENU-UI-01D/MENU-UI-01D-bundle.zip` | Gói bàn giao duy nhất |

Các file này **chưa được commit/push** lên GitHub (tôi không có quyền). Chúng nằm trong ZIP để bạn chép vào dự án.

## 3. Lệnh đã chạy và exit code (Linux, Node v22.22.2, bản `main` @ `4475d4e`)

| Lệnh | Exit | Kết quả | Loại |
|---|---|---|---|
| `node --check app/main.js` | 0 | PASS | tĩnh |
| `node --check app/preload.js` | 0 | PASS | tĩnh |
| `node --check ui/js/renderer.js` | 0 | PASS | tĩnh |
| `git diff --check` | 0 | PASS | tĩnh |
| `node tests/unit/AlwaysOnTopMenuUi01B.verify.js` | 0 | PASS | mock |
| `node tests/unit/MenuMinimizeRuntime.verify.js` | 0 | PASS | mock/tĩnh |
| `node tests/unit/AutoSongCollector.verify.js` | 0 | PASS (cây sạch) | mock/tĩnh |
| `node tests/unit/NowPlayingResolver.verify.js` | 0 | PASS (cây sạch) | mock/tĩnh |

Kiểm tra bản thân script (PowerShell 7.4.6 trên Linux):
- Chạy bình thường → 8 PASS, runtime 14 NOT RUN → **BLOCKED**, exit 0.
- Giả lập checklist có 1 mục FAIL → **FAIL**, exit 1.
- Giả lập `renderer.js` lỗi cú pháp → 3 bước FAIL, tổng **FAIL**, exit 1.
- Giả lập 14/14 PASS (chỉ để thử script) → in `RELEASE READY (theo checklist do NGƯỜI DÙNG tự xác nhận...)`. Đã khôi phục checklist về `NOT RUN` trước khi đóng gói.

Hai test `AutoSongCollector`/`NowPlayingResolver` đã PASS trên bản sạch của `main`, đúng như dự đoán ở 01C. Đây là kết quả trên Linux, **bạn vẫn nên chạy lại trên Windows sau khi commit**.

## 4. Mock/tĩnh so với runtime thật

- **Mock/tĩnh (đã chạy, ở trên):** tất cả 8 lệnh. Chúng kiểm tra cú pháp và logic bằng mô phỏng, **không chứng minh** Always on Top, Thu nhỏ hay Setup hoạt động trên Windows.
- **Runtime Electron thật:** **chưa có mục nào được chạy.** Script không chạy giao diện và không tự điền PASS.

## 5. Mục NOT VERIFIED / BLOCKED

| Mục | Trạng thái |
|---|---|
| A1–A6 (Always on Top) | NOT VERIFIED |
| B1–B3 (Thu nhỏ) | NOT VERIFIED |
| C1–C4 (Menu–Setup) | NOT VERIFIED |
| D (kéo, đóng, Settings, bố cục header) | NOT VERIFIED |
| Script chạy trên Windows PowerShell 5.1 | NOT VERIFIED: mới chạy thử trên PowerShell 7.4.6/Linux. Script chỉ chứa ký tự ASCII và tránh cú pháp riêng của PS7 để tương thích, nhưng chưa chạy thật trên 5.1 |
| `G:\AUTO_MENU_AI` khớp GitHub `main` | NOT VERIFIED (không truy cập được ổ G:) |
| Lỗi z-order/`alwaysOnTop` của Setup | Chưa có lỗi nào được tái hiện nên **không sửa**. Code hiện tại: Setup có `parent: mainWin`, không có `alwaysOnTop` riêng |
| 7 test baseline fail (`B38D1RuntimeIntegration`, `CommandRuntimeHealth`, `D1SpecValidation`, `MidiD1RuntimeB61`, `MidiLearnDispatch`, `MusicAnalysis`, `PortSelectionPolicy`) | Giữ nguyên, không sửa, không nằm trong phạm vi |

Trạng thái tổng thể: **BLOCKED** vì thiếu kết quả runtime Windows thật.

## 6. Đường dẫn bàn giao

ZIP duy nhất: `artifacts/MENU-UI-01D/MENU-UI-01D-bundle.zip`
Bên trong:
- `scripts/verify-menu-ui-01d.ps1`
- `artifacts/MENU-UI-01D/REPORT-MENU-UI-01D.md`
- `artifacts/MENU-UI-01D/RUNTIME-CHECKLIST.md`
- `artifacts/MENU-UI-01D/HUONG-DAN-CHAY.md`
- `artifacts/MENU-UI-01D/sample-log-linux/results.log` và `results.md`

ZIP và các file này **mới được tạo ngoài repo**, chưa lên GitHub.

## 7. Việc duy nhất còn cần bạn làm để nghiệm thu

1. Chép `scripts` và `artifacts` từ ZIP vào `G:\AUTO_MENU_AI`.
2. Chạy `powershell -ExecutionPolicy Bypass -File scripts\verify-menu-ui-01d.ps1` (kết quả đầu tiên sẽ là BLOCKED).
3. `npm start`, làm 14 mục trong `RUNTIME-CHECKLIST.md`, điền `PASS`/`FAIL` thật.
4. Chạy lại script. Chỉ khi ra `RELEASE READY` mới nghiệm thu; nếu có `FAIL`, gửi lại checklist đã điền + `results.md` để xử lý, không tự sửa.
5. Nếu muốn lưu vào GitHub: tự commit và push.
