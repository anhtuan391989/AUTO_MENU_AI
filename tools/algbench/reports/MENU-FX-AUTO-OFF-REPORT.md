# TASK CLAUDE A — MENU-FX-AUTO-OFF + BUTTON-STATE-PERSISTENCE

**Trạng thái: PARTIAL.** Lỗi 1 (Auto FX không tự tắt): nguyên nhân gốc đã tìm ra, đã sửa, đã **tái hiện và xác nhận trên app Electron thật (Linux/Xvfb, thiết bị audio giả)**. Lỗi 2 (lưu 4 nút): **không tái hiện được** việc mất Music/Mic1/Mic2 trên Electron sạch; đã tìm thấy và sửa lỗi FX bị lưu nhầm trạng thái Auto, cộng các biện pháp chống mất trạng thái. Chưa có xác minh trên máy Windows của Khói và **chưa có xác minh Reverb/Delay Send trong DAW** (Send chưa được cấu hình trong môi trường thử).
Điểm xuất phát: `origin/main` = `b916463` (auto-sync 18/10 12:20) đã merge; commit của task: `59c5f3e`. Theo yêu cầu: không push (Khói tự copy + auto-push).

---
## 1. Lỗi 1 — Auto FX bật được nhưng không tự tắt

### Nguyên nhân gốc (VERIFIED trên Chromium 141 và app Electron 41.7.1 thật)
`BPMEngine` tính `dbfs` từ `analyser.getByteTimeDomainData` (8-bit, **cắt cụt**). Với **mọi** nền nhiễu khác số 0 tuyệt đối, ~một nửa số mẫu thành 127 ⇒ mức đo luôn ≈ **-45,1 dBFS**, bất kể nền thật là -50, -70 hay -90 dBFS. Ngưỡng TẮT của Auto FX là **-52 dBFS** (ngưỡng BẬT -45) ⇒ mức "im lặng" đo ra luôn nằm trong dải trễ -52…-45 ⇒ `MUSIC_SILENT` **không bao giờ được xác nhận** trừ khi tín hiệu là số 0 tuyệt đối.

Bằng chứng:
1. **Đo trực tiếp Chromium 141** (Web Audio thật, `getByteTimeDomainData` vs `getFloatTimeDomainData`): nhiễu -90/-70/-60/-50 dBFS → 8-bit luôn **-45,1…-45,3**, float đúng -94,7/-74,8/-64,7/-54,7; sin -20 dBFS → cả hai -20,0 (nhạc to không bị ảnh hưởng).
2. **Log thật của Khói** (`logs/2026-10-17_18-31-15.jsonl`, 30 sự kiện `FX_AUTO`): `lastDbfs` khi chưa có nhạc ở 3 lần khởi động độc lập = **-43,8 / -45,9 / -44,3**; trạng thái UNKNOWN với -44…-48,5; **không có sự kiện nào `target:false`** (FX chưa bao giờ được yêu cầu tắt) trong suốt log.
3. **Tái hiện trên Electron thật** (mã TRƯỚC sửa, WAV: nền -75 dBFS → nhạc → nền -75 → nhạc → số 0): nút FX BẬT ở t=3,25 s và **kẹt BẬT cho tới khi file chuyển sang số 0 tuyệt đối (t=37 s)**, dù nhạc dừng từ t=12,75 s; mức đo trong lúc "im lặng" = -45,2 (byte) — xem `runtime_fx_BEFORE_trace.json`.
4. Chẩn đoán trước đó (báo cáo MENU-FX-FIX) **bỏ sót lỗi này**: test cũ nạp thẳng dBFS giả (-80) vào bộ điều khiển nên không bao giờ gặp sàn 8-bit. Test mới (`MenuFxAutoOff.verify.js`) tái hiện đúng hiện tượng.

Đã kiểm tra các nghi vấn khác theo yêu cầu: bộ đếm xác nhận im lặng **có chạy** (cửa sổ trượt 1 s); `inflight`/`dirty`/`reconcile()` đã sửa ở lần trước (không mất yêu cầu tắt) và có test; hàng đợi Send có timeout 5 s (test); lệnh tắt lỗi/NOT_CONFIGURED không làm nút kẹt (đồng bộ nút ở nhánh "đã đúng"); mic **không có đường** vào Auto FX (test tĩnh).

### Sửa
- `ui/js/engines/bpmEngine.js` — **thay đổi cộng thêm (additive), cần báo vì là file engine**: đọc thêm `getFloatTimeDomainData` và phát field mới `dbfsFloat` trong `onLevel`. `rms/dbfs/peak/vuPercent` **giữ nguyên** (VU, Key, BPM không đổi). Không đổi thuật toán BPM/Key/Mod.
- `ui/js/renderer.js` — Auto FX nạp `dbfsFloat` (fallback `dbfs` nếu thiếu).
- `ui/js/audioSource.js` — chỉ thêm chẩn đoán: `levelStats` (min/avg/max ~1 s, số khung số-0), `msSinceFrame`, `onDiag` mỗi 30 s; renderer ghi telemetry `FX_AUTO_DIAG` (kèm `visibility`) để lần thử thật sau có số liệu hiệu chuẩn.
- **Ngưỡng dBFS (-45/-52), tỷ lệ, thời gian 1 s/0,5 s/60 s: KHÔNG đổi.** Chỉ đổi thước đo cho đúng đơn vị dBFS mà ngưỡng được định nghĩa.

### Kết quả runtime Electron thật (WAV giả: nền -75 dBFS ↔ nhạc ~-20 dBFS) — `runtime_fx_*_trace.json`
| Sự kiện | TRƯỚC | SAU |
|---|---|---|
| Nhạc bắt đầu → FX BẬT | 0,5 s | **0,5 s** (≤1 s) |
| Nhạc dừng (nền -75 dBFS, không phải số 0) → FX TẮT | **không tắt** (kẹt tới số-0 sau ~24 s) | **1,0 s** (cả 2 lần) |
| Mức đo lúc "im lặng" | -45,2 (8-bit) | -76,4 (float) |
| Bấm tay TẮT khi nhạc đang phát (t≈25 s), nhạc vẫn phát | — | Auto **không** bật lại trong 60 s; tiếp quản BẬT đúng **60,0 s** sau lần bấm (theo trạng thái nhạc hiện tại) |
| Sau tiếp quản, nhạc dừng | — | TẮT sau 1,0 s |
(Độ phân giải mẫu của vết = 250 ms.)

---
## 2. Lỗi 2 — 4 nút không giữ trạng thái

### Điều tra
Lưu: `saveData()` → `appSettings.autoMenuData` → `saveSetup()` → IPC đồng bộ ghi `app-settings.json` (nguyên tử). Khôi phục: `loadData()` (DOMContentLoaded). Test thật trên Electron (Xvfb, userData sạch): Music/Mic1/Mic2/FX **được lưu và khôi phục đúng** ở mã cũ khi thoát bằng nút Đóng, `app.close()`, và với dữ liệu thực tế (key, preset, knob). → **Không tái hiện được lỗi Khói báo trên môi trường này (UNKNOWN nguyên nhân tại máy Windows của Khói).**

### Lỗi thật đã xác định và sửa (VERIFIED trên Electron thật)
**FX bị lưu nhầm trạng thái Auto**: `saveData()` lưu trạng thái hiển thị của nút (Auto FX đổi nút rồi gọi `saveData()`), nên "lựa chọn" FX = lần Auto yêu cầu gần nhất. Tái hiện (mã cũ, audio chạy, người dùng không bấm FX): sau khi mở lại FX hiện **BẬT** dù người dùng chưa từng chọn BẬT (`runtime_BEFORE_persistence_FX_conflation.txt`).

### Các rủi ro làm mất trạng thái được củng cố (INFERRED — không tái hiện được; sửa phòng ngừa, có test logic)
1. `saveData()` có thể ghi mặc định của DOM đè giá trị đã lưu nếu bị gọi trước khi khôi phục xong; trước đây `loadData()` nằm **sau** `checkAllSystems()`/`applyAudioOutputSetting()` trong DOMContentLoaded — một ngoại lệ ở đó làm bỏ qua khôi phục rồi click kế tiếp ghi đè mặc định lên cấu hình cũ.
2. `saveData()` bỏ qua kết quả ghi file thất bại (vd rename bị khóa trên Windows).
3. Không chốt lưu khi đóng cửa sổ.
4. Khôi phục chỉ `add` class (phụ thuộc class có sẵn), dữ liệu sai kiểu có thể làm `loadData()` ném lỗi (vd `knobs` không phải mảng) và đổ cả khởi tạo.

### Sửa (`ui/js/renderer.js`)
- Tách 3 trạng thái: **lựa chọn người dùng** (`musicDisabled/mic1/mic2/fx`; `fx` chỉ đổi khi người dùng BẤM FX), **trạng thái yêu cầu** (`fxRequested`, chỉ tham khảo, không dùng để khôi phục), **DAW đã xác nhận** (không tồn tại, không lưu, không hiển thị).
- `restoreButtonStates()`: chạy **đầu tiên** trong DOMContentLoaded và đầu `loadData()`; `toggle(force)`; chỉ nhận `boolean` (thiếu/sai kiểu ⇒ mặc định an toàn, giữ giá trị hợp lệ còn lại).
- `saveData()`: trước khi khôi phục xong **giữ giá trị đã lưu**, không ghi mặc định DOM; kiểm tra kết quả ghi (`__menuSaveFailed` + telemetry `MENU_STATE_SAVE_FAILED`); chốt lưu ở `beforeunload`.
- FX khôi phục ở trạng thái **chưa xác nhận**: `data-fx-sync="restored-unconfirmed"`, tooltip "khôi phục lựa chọn đã lưu … Send DAW CHƯA được xác nhận"; khi nguồn nhạc chưa chạy tooltip nói rõ "trạng thái nút = lựa chọn đã lưu/yêu cầu; Send DAW CHƯA được xác nhận".
- Guard `Array.isArray(data.knobs)`.
- Không đổi HTML/CSS/bố cục.

---
## 3. Kết quả kiểm thử (lệnh: `node tests/unit/<tên>.verify.js`)

### A. Auto FX
| # | Yêu cầu | Kết quả | Phân loại |
|---|---|---|---|
| 1 | Có nhạc → FX bật ≤1 s | unit `MenuFxFix` 496 ms; `MenuFxAutoOff` 416 ms; **runtime Electron 0,5 s** | **VERIFIED** (logic + Electron thật, audio giả) |
| 2 | Im lặng liên tục 1 s → tắt | unit 992 ms; **runtime Electron 1,0 s với nền -75 dBFS** (trước sửa: không tắt) | **VERIFIED** (logic + Electron thật, audio giả) |
| 3 | Mic hoạt động sau khi nhạc dừng → vẫn tắt | unit: 60 s mic to không gửi lại | **VERIFIED** (logic); mic thật trên Electron: **UNKNOWN** |
| 4 | Mic hoạt động, không nhạc → không bật | unit + 3 kiểm tra tĩnh (mic không nối Auto FX; `feedLevel` 1 chỗ; BPMEngine nối SYSTEM_AUDIO) | **VERIFIED** (logic + cấu trúc mã); chưa thử mic thật: **UNKNOWN** |
| 5 | Bấm tay → 60 s không ghi đè | unit; **runtime Electron: không bật lại trong 60 s** | **VERIFIED** (logic + Electron) |
| 6 | Hết 60 s → tiếp quản theo trạng thái hiện tại | unit (nhạc phát/im/phát lại giữa chừng); **runtime: tiếp quản đúng 60,0 s, rồi tắt sau 1 s khi nhạc dừng** | **VERIFIED** (logic + Electron) |
| 7 | Send chậm/lỗi/timeout → không kẹt hàng đợi, không mất yêu cầu tắt | `MenuFxFix` nhóm 9 (pending/failed/hang→TIMEOUT 5 s/queue không kẹt/yêu cầu tắt không mất/nút đồng bộ lại) | **VERIFIED** (logic, DAW giả); Send thật: **UNKNOWN** |
| 8 | Electron/runtime thật | Có (Linux, Electron 41.7.1, Xvfb, thiết bị audio giả, Send CHƯA cấu hình ⇒ `NOT_CONFIGURED`) | **PARTIAL** — chưa Windows/DAW/MIDI thật |

### B. Lưu trạng thái nút
| # | Yêu cầu | Kết quả | Phân loại |
|---|---|---|---|
| 9 | Music ON, Mic1 ON, Mic2 OFF, FX OFF → đóng → mở lại | unit đúng; **Electron thật** (nút Đóng) khôi phục đúng 4/4 | **VERIFIED** (logic + Electron) |
| 10 | Tổ hợp khác gồm FX ON | unit 5 tổ hợp; Electron: (Music OFF, Mic2 ON, FX ON), (Music OFF, Mic1+2 ON, FX ON) đúng; có audio: FX theo lựa chọn người dùng (OFF khi không bấm, ON khi bấm) | **VERIFIED** |
| 11 | Thoát bình thường → mở lần kế | Electron `app.close()` đúng; unit: chốt `beforeunload` | **VERIFIED** (Electron Linux); thoát kiểu Windows/kill tiến trình: **UNKNOWN** |
| 12 | Cấu hình thiếu/sai/cũ | unit 8 kiểu; **Electron thật 8 file cấu hình** (null, chuỗi, mảng, `{}`, sai kiểu, chỉ mic1, knobs/preset hỏng, JSON hỏng): không crash, mặc định an toàn, giữ giá trị hợp lệ; FX khôi phục không hiện như đã xác nhận | **VERIFIED** |
| 13 | Khởi tạo nguồn âm/DAW không ghi đè trạng thái đã lưu | unit 13a–f (saveData trước khôi phục; Auto FX yêu cầu OFF trước khi khôi phục xong) | **VERIFIED** (logic) |
| — | Mất Music/Mic1/Mic2 như Khói báo | **không tái hiện** | **UNKNOWN** nguyên nhân; rủi ro 1–4 là **INFERRED** |

### Hồi quy
- `for f in tests/unit/*.js; do node $f; done` (cây sạch sau commit): **102 file, 101 exit 0, 1 exit 1 = `MusicAnalysis.verify.js` (lỗi nền có sẵn: 30 PASS/2 FAIL, cũng fail trên mã trước mọi thay đổi FX)**. Danh sách: `regression_unit_AFTER.txt`.
- Test mới: `MenuFxAutoOff` 23✅, `MenuButtonPersistence` 20✅; `MenuFxFix` 53✅, `FxAutoA01/FxSendGroupA01/FxIndicatorA06` đạt.
- Sửa test cũ (không nới lỏng): `A69VuConsolidation` — regex field `onLevel` nay cho phép **thêm** `dbfsFloat` (các field cũ vẫn bắt buộc).
- Lưu ý: `AutoSongCollector`, `NowPlayingResolver`, `SetupAiPanelStructureA54` kiểm tra `git status` nên chỉ đạt khi cây sạch/đã commit; `SetupAiPanelStructureA54` kiểm tra file engine không bị sửa — task này **cố ý** sửa cộng thêm `bpmEngine.js`; test đạt vì đã commit.

### Tạp chất đã dọn
Chạy Electron thật làm app ghi telemetry vào `logs/` của repo: đã xóa khỏi commit (không đưa vào zip). Đã tải binary Electron vào `node_modules/` (bị `.gitignore`, không đưa vào zip).

---
## 4. Phân biệt mức xác minh
- **Test logic (DOM/analyser/đồng hồ giả):** toàn bộ các mục trên.
- **Electron/runtime thật (Linux, Xvfb, thiết bị audio giả, không DAW):** nguyên nhân gốc FX không tắt (trước/sau), BẬT ≤1 s, TẮT 1 s, giữ tay 60 s + tiếp quản, lưu/khôi phục 4 nút, cấu hình hỏng.
- **Trực tiếp trong DAW (Reverb/Delay Send thật): CHƯA CÓ.** Send chưa được cấu hình; không có feedback DAW; mọi "đã gửi" chỉ là `SEND_SENT_UNCONFIRMED`.

## 5. Còn chặn nghiệm thu (⇒ PARTIAL)
1. **Chưa chạy trên Windows của Khói với nhạc/âm thanh hệ thống thật.** Mong Khói chạy bản này rồi gửi lại log `logs/*.jsonl`: dòng `FX_AUTO_DIAG` có `levelStats` (min/avg/max mức nền thật). **Nếu nền thật của card âm thanh > -52 dBFS** (card nhiễu) thì FX vẫn không tắt — khi đó có bằng chứng để chỉnh ngưỡng (không tự đổi ngưỡng ở task này).
2. **Send Reverb/Delay chưa cấu hình** (cần Khói: CC/Note, kênh, absolute hay toggle) và chưa xác minh trong DAW. Chế độ mặc định `toggle` gửi cùng một message cho BẬT/TẮT ⇒ khi không có feedback DAW có thể lệch trạng thái; nên dùng `absolute` (CC).
3. **Nghi vấn throttling cửa sổ (INFERRED)**: log thật có đoạn `framesSeen` gần như đứng yên (vd 10858 → 22885 sau ~175 s nhưng có khoảng ~60 s chỉ +33 khung) kèm `SOURCE_UNAVAILABLE`/`UNKNOWN` nhấp nháy, khớp kiểu Chromium giảm tần số timer/rAF khi cửa sổ bị ẩn/che. Chưa xác minh, **chưa sửa** (main.js không có `backgroundThrottling:false`). Khi mất khung, Auto FX đóng băng (không tắt FX). `FX_AUTO_DIAG` ghi `visibility` + `msSinceFrame` để xác nhận; nếu đúng, đề xuất `backgroundThrottling:false` cho cửa sổ Menu (đổi cấu hình main process — cần Khói đồng ý).
4. **Nguyên nhân mất Music/Mic1/Mic2 tại máy Khói chưa biết** (không tái hiện). Cần: cách Khói mở app (`electron .`, exe, AHK?) vì `userData` khác nhau ⇒ file cấu hình khác nhau; và log lỗi nếu thấy "Không ghi được trạng thái nút" trong Console.
5. Chỉ báo "Send chưa xác nhận" vẫn chỉ ở tooltip + `data-fx-sync` (không đổi giao diện theo quy tắc).
6. Hệ quả hành vi (đã nêu ở task trước): tắt sau 1 s ⇒ khoảng lặng/chuyển bài >1 s tắt rồi bật lại FX.

## 6. Công cụ runtime
`tools/runtime-probe/` (README, `fxtrace.js`, `persist.js`, `gen_test_wav.py`) — chỉ để tái chạy kiểm thử Electron thật trên Linux/Xvfb; không chạy trong app.

---
Claude A : Task A: MENU-FX-AUTO-OFF + BUTTON-STATE-PERSISTENCE (trạng thái: PARTIAL — Auto FX tắt đã xác nhận trên Electron thật; lưu 4 nút đã sửa/củng cố nhưng lỗi mất trạng thái tại máy Khói chưa tái hiện; chưa có DAW/Windows)

1. File nào đã sửa.
   - `ui/js/engines/bpmEngine.js` (chỉ thêm `dbfsFloat`), `ui/js/renderer.js`, `ui/js/audioSource.js`.
   - Test: `tests/unit/MenuFxAutoOff.verify.js` (mới), `tests/unit/MenuButtonPersistence.verify.js` (mới), cập nhật `MenuFxFix.verify.js` (1 regex), `A69VuConsolidation.verify.js` (cho phép thêm field).
   - Công cụ/báo cáo: `tools/runtime-probe/*`, `tools/algbench/reports/MENU-FX-AUTO-OFF-REPORT.md` + thư mục `MENU-FX-AUTO-OFF/` (vết runtime, log test).
2. Vì sao sửa.
   - FX không tắt: mức dBFS 8-bit luôn ≈ -45 dBFS khi có nền nhiễu (cao hơn ngưỡng tắt -52) nên không bao giờ xác nhận được im lặng; đổi sang dBFS Float, giữ nguyên ngưỡng.
   - Lưu nút: FX bị lưu theo trạng thái Auto thay vì lựa chọn người dùng; thêm chống ghi đè trước khi khôi phục xong, kiểm tra lỗi ghi, chốt lưu khi đóng, khôi phục an toàn với cấu hình thiếu/sai; FX khôi phục luôn ghi rõ "Send chưa xác nhận".
3. Có ảnh hưởng module nào không.
   - Chạm file engine `bpmEngine.js` nhưng chỉ thêm 1 field (VU/BPM/Key/Mod giữ nguyên). Ảnh hưởng Auto FX, nút FX/Music/Mic1/Mic2, lưu cấu hình Menu. Không đổi Settings, MIDI mapping, preset, bố cục, Service Key.
4. Còn việc gì chưa làm.
   - Cần Khói: chạy thử trên Windows với nhạc thật và gửi log có `FX_AUTO_DIAG`; cấu hình Send Reverb/Delay (CC/Note, absolute/toggle) và kiểm tra trong DAW; cho biết cách mở app/log lỗi để tìm nguyên nhân mất Music/Mic tại máy Khói; quyết định có tắt `backgroundThrottling` cho cửa sổ Menu không.
   - Chưa làm: hiệu chỉnh ngưỡng trên âm thanh thật (chưa có bằng chứng), chỉ báo hiển thị Send chưa xác nhận (cần đổi UI), xác minh Windows/DAW.
