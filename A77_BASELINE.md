# A77_BASELINE.md — AUTO_MENU_AI

Người thực hiện: Claude A. Ngày: 2026-10-12. **Chưa sửa bất kỳ file code nào.**

## 1. Nền

| Mục | Giá trị thực tế |
|---|---|
| Repo | anhtuan391989/AUTO_MENU_AI |
| Branch | `main` (branch duy nhất) |
| HEAD thực tế | `509b9d5ffeedd105db45fe55d40c8dfaac7a8587` |
| So với baseline task | **Trùng khớp.** Không có commit mới hơn. |
| Tổng commit | 110 (gần như toàn bộ là "Auto-sync" từ sync.bat) |
| Working tree | Sạch (clone mới) |
| Môi trường đọc | Linux cloud sandbox, Node v22.22.0. **Không có Windows, Electron GUI, audio, MIDI, DAW.** |

Ghi chú: `G:\AUTO_MENU_AI` không truy cập được từ phiên này. Mọi thứ dưới đây dựa trên bản clone của GitHub tại HEAD trên.

## 2. Đã đọc

README.md, package.json, structure.txt (tên), thư mục AI_BOOT.md/ (đây là **thư mục**, không phải file; đã đọc CURRENT_STATE, TASKS, AI_RULES, KNOWN_LIMITATIONS), danh sách `.github/workflows` (3 file), cây `app/ core/ modules/ ui/ tests/ database/ data/ Patch/`, `task_b_menu_minimize.patch`, toàn bộ 86 file `tests/unit/*.verify.js` (chạy thật), và grep có mục tiêu trong `app/main.js`, `app/preload.js`, `ui/js/renderer.js`, `ui/setup.html`.

**Chưa đọc đầy đủ (sẽ đọc ở milestone tương ứng):** nội dung `main.js` (54 KB), `renderer.js`, `setup.html` (74 KB), `Midi01.verify.js` (15 KB) và diff MIDI mới nhất. Mục A.6 của task yêu cầu đọc đủ file này trước khi lập kế hoạch tích hợp MIDI với B, nên **Nhóm 4 chưa được lập kế hoạch**.

## 3. Kết quả kiểm tra thực tế

| Kiểm tra | Kết quả | Mức bằng chứng |
|---|---|---|
| `node --check` 150 file JS (app, core, ui/js, scripts, tools) | **150/150 hợp lệ** | Chạy thật |
| Dấu conflict Git (`<<<<<<<`) trong js/html/json/ts | **Không có** | Chạy thật |
| `npm install --ignore-scripts` | Thành công | Chạy thật |
| Regression `tests/unit` (86 file) | **84 PASS, 2 FAIL** (sau khi cài dependency) | Chạy thật, chỉ mức unit |

Lần chạy đầu có 8 fail; 6 cái do chưa cài `xmllint-wasm`/`easymidi`, chạy lại đều PASS (B38D1RuntimeIntegration, CommandRuntimeHealth, D1SpecValidation, MidiD1RuntimeB61, MidiLearnDispatch, PortSelectionPolicy).

**Lưu ý:** `npm install --ignore-scripts` bỏ qua bước build native. Test PASS ở đây **không chứng minh** `easymidi` chạy được trên Windows.

## 4. Hai test FAIL thật

### F1 — `MenuMinimizeRuntime` (3 PASS / 4 FAIL) — **P0 chức năng**
- `ui/js/renderer.js` đã gọi `window.electronAPI.minimizeWindow()`.
- `app/preload.js` **không** expose `minimizeWindow`; `app/main.js` **không** có `ipcMain.on("minimize-window")`.
- Hậu quả: bấm nút Minimize chỉ in `console.error`, cửa sổ không thu nhỏ.
- Nguyên nhân: `task_b_menu_minimize.patch` (thư mục gốc) mới áp **một nửa** (renderer + test), hai hunk `main.js` và `preload.js` chưa vào `main`. Patch hiện **không còn áp được nguyên bản** (`git apply --check` báo lỗi ở `renderer.js` vì đã áp rồi).
- Hướng sửa: chỉ áp tay hai hunk còn thiếu (đã đối chiếu, nhỏ và độc lập). Không động HTML/CSS.

### F2 — `MusicAnalysis` (30 PASS / 2 FAIL) — **chưa phân loại**
- Test đòi hàm `attachMusicAnalysisShadow` và setting `aiAnalysisShadowEnabled` trong `renderer.js`; hai thứ này **không tồn tại ở đâu trong repo**.
- `ui/js/engines/musicAnalysis.js` có tồn tại nhưng `renderer.js` không tham chiếu nó (0 lần).
- Chưa biết: test lỗi thời hay phần nối shadow chưa từng được tích hợp. Cần quyết định của Khói trước khi sửa (xem mục 7).
- Test này cũng chạy chậm bất thường (37 giây).

## 5. Phát hiện theo nhóm của task

| Nhóm | Trạng thái baseline |
|---|---|
| 1. Cài đặt/khởi động | `package.json` **chỉ có script `start`**. Không có electron-builder/packager/forge, không có script build. **Chưa thể build/package** theo đúng nghĩa. Minimize lỗi (F1). Chưa chạy Electron thật. |
| 2. Audio Setup | Có test A71, A75VuIsolation, AudioReconnectC62, AudioRoutingClosureC61... đều PASS ở mức unit. **Chưa có xác minh phần cứng.** |
| 3. AI Engine | Có test A72/A73/A75 PASS ở mức unit. Chưa xác minh runtime. |
| 4. MIDI | `Midi01`, `MidiD1RuntimeB61`, `MidiLearnDispatch`, `MidiHealth` PASS ở unit. **Chưa lập kế hoạch**, chờ bàn giao từ B. |
| 5. Presets/Settings | **Hai file settings khác nhau**: `app-settings.json` (hàm ghi atomic, có test) và `autoMenuSettings.json` (chỉ đọc ở `loadAutoLaunchSettings`, `main.js` dòng ~349). Cần xác định ai ghi `autoMenuSettings.json`; nếu không ai ghi thì auto-launch đọc cấu hình không bao giờ có. **Chưa kết luận**, cần đọc thêm. |
| 6. Service Key | **Không có code license/Machine ID/Service Key.** Chỉ có `admin-auth-verify`/`admin-auth-change-password`. `setup.html` ghi rõ "chưa có hệ thống license/activation" (badge Coming Soon). Đây là **tính năng mới hoàn toàn**, không phải kiểm tra. |
| 7. Database | `database/songLibrary.json` và `data/songs.json` đều 3 byte (rỗng). Không có schema/migration/backup. Dữ liệu hiện nằm ở `app.getPath("userData")` dạng JSON. |

## 6. Danh sách blocker và rủi ro

1. **B1 (P0):** Minimize không hoạt động (F1).
2. **B2 (P0 cho "COMPLETE"):** Không có cấu hình build/package → điều kiện hoàn thành E.1 chưa thể đạt.
3. **B3:** Service Key chưa tồn tại; cần quyết định thiết kế (mục 7) vì thuộc "thay đổi kiến trúc", phải giải thích trước.
4. **B4:** Hai nguồn settings (Nhóm 5) chưa rõ.
5. **B5:** F2 chưa phân loại.
6. **B6:** Mọi mục cần Windows + audio + MIDI + DAW hiện là **BLOCKED**, không phải PASS.
7. **Tài liệu cũ:** `AI_BOOT.md/KNOWN_LIMITATIONS.md` mục 1–2 (lỗi cú pháp chặn boot) **đã lỗi thời** — HEAD không còn lỗi đó. `README.md` ở gốc mô tả prototype SMTC, không phải README dự án.
8. **Rác trong repo:** nhiều file `.rar`, `.diff`, `.rej`, `main.js.FULL_AFTER_A49_INTEGRATED`, mp3, xlsx ở gốc. Chưa động tới; không nằm trong phạm vi sửa lỗi P0.
9. **Quy tắc xung đột:** `AI_RULES.md` nói "main là nhánh duy nhất, không tạo branch khác", còn task A77 yêu cầu nhánh riêng + PR. Tôi sẽ theo task A77 (mới hơn, rõ ràng hơn) và không đẩy lên GitHub khi chưa có xác nhận.

## 7. Cần Khói quyết định trước khi làm tiếp

1. **Service Key:** thiết kế mới hoàn toàn (Machine ID, thời hạn tính từ kích hoạt, kiểm tra ở main process, lưu dạng băm). Có làm trong A77 không, hay tách thành task riêng? Tôi sẽ viết bản giải thích kiến trúc trước khi code.
2. **MusicAnalysis (F2):** sửa test cho khớp code hiện tại, hay nối `attachMusicAnalysisShadow` vào renderer?
3. **Build/package:** dùng electron-builder (NSIS installer)? Cần thêm dependency vào `package.json`.

## 8. Thứ tự làm đề xuất

| # | Milestone | Phạm vi file | Ghi chú |
|---|---|---|---|
| M1 | Sửa Minimize | `app/main.js`, `app/preload.js` | Không cần chờ quyết định, rủi ro thấp |
| M2 | Làm rõ settings (đọc + báo cáo) | đọc `main.js`, `setup.html` | Sửa chỉ khi có lỗi thật |
| M3 | Audio/AI/VU rà soát | đọc, test | Không sửa ngưỡng |
| M4 | MIDI UI/Settings | sau khi nhận bàn giao từ B | Tránh trùng file với B |
| M5 | Build/package | `package.json` | Cần quyết định #3 |
| M6 | Service Key | mới | Cần quyết định #1 |
| M7 | Database/lưu trữ | kiểm kê | Cuối |

## 9. Test thủ công bắt buộc trên Windows (BLOCKED tại thời điểm này)

- Cài/mở/đóng/mở lại; minimize/restore.
- Liệt kê thiết bị âm thanh; rút/cắm thiết bị; đổi thiết bị mặc định.
- VU: MIC không cộng tín hiệu music.
- AUTO DETECT reset Key + BPM + MOD; im lặng/nhiễu/tín hiệu yếu.
- MIDI output: chọn, lưu, khôi phục, rút cáp; **xác minh tại DAW/plugin** mới được ghi "nhận".
- Lưu preset, thoát, mở lại.
