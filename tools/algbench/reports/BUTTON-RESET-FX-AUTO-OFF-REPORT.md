# TASK CLAUDE A — CORRECT BUTTON RESET + FX AUTO-OFF

**Trạng thái: COMPLETE theo tiêu chí của task** (4 nút không còn lưu trạng thái qua phiên; Auto FX qua các test bật/tắt) — **trong phạm vi test logic + Electron thật trên Linux/Xvfb với thiết bị audio giả**. **Chưa xác minh trên Windows của Khói và chưa xác minh Reverb/Delay Send trong DAW** (xem mục 6). Báo cáo này KHÔNG tuyên bố Send hoạt động thật.

## 0. Kiểm tra GitHub `main` + báo cáo task trước
- `main` mới nhất (GitHub): `7eaedc4` "Auto-sync 18/10/2026 23:32:31" của Khói — chứa đúng bộ file bàn giao của task trước (MENU-FX-AUTO-OFF: `renderer.js`, `audioSource.js`, `bpmEngine.js`, test, runtime-probe, báo cáo, `.patch` ở gốc repo, `logs/`). **Không có thay đổi không liên quan** của người khác ⇒ không có gì bị ghi đè.
- Task trước (`MENU-FX-AUTO-OFF-REPORT.md`): FX không tự tắt do dBFS 8-bit ≈ -45 dBFS khi có nền nhiễu (cao hơn ngưỡng tắt -52) → đã thêm `dbfsFloat`, tắt được trên Electron thật. Task đó cố ý **lưu/khôi phục** 4 nút ⇒ **yêu cầu này bị thay thế** bởi yêu cầu chính thức mới của Khói (4 nút KHÔNG lưu). Các câu về "lưu/khôi phục 4 nút" trong báo cáo trước không còn đúng.
- Lưu ý: tôi chỉ đọc được `main` qua công cụ GitHub (lệnh `git fetch` bị từ chối khi chạy); không push.

## A. 4 nút Music / Mic 1 / Mic 2 / FX — KHÔNG lưu trạng thái

### Nguyên nhân (task trước làm sai yêu cầu)
`saveData()` ghi `musicDisabled/mic1/mic2/fx/fxRequested`; `restoreButtonStates()` (đầu `DOMContentLoaded` + đầu `loadData()`) khôi phục; `beforeunload` chốt lưu; Auto FX `onRequest` gọi `saveData()`.

### Sửa (chỉ `ui/js/renderer.js`; không đổi HTML/CSS/bố cục)
1. `saveData()` **không còn ghi** 4 nút (chỉ còn currentKey, tone, modEnabled, preset, knobs — giữ nguyên như cũ).
2. Xoá `restoreButtonStates()` + 2 chỗ gọi, xoá `beforeunload`, xoá biến `__fxUserChoice/__menuStateRestored/__asBool`; `loadData()` không đọc 4 nút (nút luôn ở mặc định HTML).
3. Auto FX `onRequest` đổi nút FX **không gọi `saveData()`**.
4. Không xoá `appSettings`/cấu hình Menu. Dữ liệu cũ (`musicDisabled/mic1/mic2/fx/fxRequested` do task trước hoặc bản cũ để lại) **bị bỏ qua khi đọc** và biến mất ở lần `saveData()` kế tiếp (đã kiểm trên Electron thật). Preset/Key/BPM/knobs/thiết bị không đổi.
5. Bỏ nhãn `restored-unconfirmed`; tooltip FX nay ghi "mặc định lúc mở/yêu cầu; Send DAW CHƯA được xác nhận". Trạng thái nút lúc mở **không** được trình bày là trạng thái DAW. Không có trạng thái "DAW đã xác nhận" nào (không có feedback DAW).

### Trạng thái mặc định THỰC TẾ sau khi mở lại (lấy từ `ui/index.html`: 4 nút không có class `active`/`disabled`; không đặt mặc định mới)
| Nút | Mặc định sau khi mở | Ghi chú |
|---|---|---|
| Music | **KHÔNG có class `disabled`** (trạng thái ban đầu của HTML) | đã đo: `music:true` = không disabled |
| Mic 1 | **tắt** (không `active`) | |
| Mic 2 | **tắt** (không `active`) | |
| FX | **tắt** (không `active`) | Auto FX có thể bật ngay khi có nhạc (hành vi hiện có) |
Nút khởi tạo ở trạng thái nào cũng **không** nghĩa là DAW ở trạng thái đó. Điểm cần biết: `group.seed(<nút FX>)` lúc khởi động = **giả định** DAW đang TẮT (UNKNOWN, không có feedback); nếu DAW thực tế đang BẬT và chế độ Send là `toggle` (mặc định), lần Auto BẬT đầu tiên có thể làm DAW đảo về TẮT. Hành vi này có từ trước; dùng chế độ `absolute` (CC) tránh được (xem 6).

## B. Auto FX không tự tắt — kiểm tra lại trên mã mới nhất
Hướng sửa `dbfsFloat` **được giữ** (xác nhận lại trên mã mới nhất; `audioSource.js`, `bpmEngine.js`, ngưỡng -45/-52, 0,5 s / 1 s / 60 s **không đổi** trong task này). Mã `renderer.js` mới chỉ bỏ `saveData()` khỏi `onRequest`, không đổi logic Auto.

Electron thật (Linux/Xvfb, Electron 41.7.1, audio giả: nền -75 dBFS ↔ nhạc ~-20 dBFS; Send chưa cấu hình ⇒ `NOT_CONFIGURED`), mốc đo mức = đường cắt -40 dBFS của mức float, mẫu 250 ms:
| Sự kiện | Mốc | FX | Độ trễ |
|---|---|---|---|
| Nhạc bắt đầu | 2,75 s | BẬT 3,25 s | **0,5 s** (≤1 s) |
| Nhạc dừng, nền -76 dBFS (ca lỗi trước đây) | 12,75 s | TẮT 13,75 s | **1,0 s** |
| Nhạc bắt đầu lần 2 | 27,75 s | BẬT 28,25 s | 0,5 s |
| Nhạc dừng, về số 0 tuyệt đối | 35,75 s | TẮT 36,75 s | 1,0 s |
| Bấm tay TẮT khi nhạc đang phát | 25,25 s | Auto không bật lại | — |
| Hết hạn giữ tay | — | BẬT 85,25 s | **60,0 s** sau lần bấm (theo nhạc hiện tại) |
| Nhạc dừng (nền -76) sau tiếp quản | 87,75 s | TẮT 88,75 s | 1,0 s |
Hiệu chỉnh so với báo cáo trước: lần dừng thứ hai trong WAV thử là số 0 tuyệt đối (không phải nền nhiễu); ca "nền -76 dBFS" chỉ là lần dừng thứ nhất và đoạn sau tiếp quản tay.

Mic: Mic 1/Mic 2 **không có đường** vào Auto FX (kiểm tĩnh + unit); chưa thử mic thật trên Electron.

## C. Test (lệnh: `node tests/unit/<tên>.verify.js`)
| Test | Kết quả | Loại |
|---|---|---|
| `MenuButtonReset.verify.js` (MỚI, thay `MenuButtonPersistence`) | 18 ✅ | logic trên mã thật + HTML |
| `MenuFxAutoOff` | 23 ✅ | logic (dBFS 8-bit vs float, nền nhiễu, im lặng 1 s, mic, giữ tay 60 s) |
| `MenuFxFix` | 53 ✅ | logic (Send chậm/lỗi/timeout, hàng đợi, yêu cầu TẮT không mất) |
| `FxAutoA01` 23 ✅, `FxSendGroupA01` 23 ✅, `FxIndicatorA06` 15 ✅, `A69VuConsolidation` ✅ | | logic |
| Toàn bộ `tests/unit/*.js` (cây sạch đã commit) | **102 file, 101 đạt, 1 lỗi = `MusicAnalysis.verify.js` (lỗi nền có sẵn từ trước, không liên quan)** | |
| Electron thật: 5 tổ hợp 4 nút → đóng (nút Đóng / thoát `app.close`) → mở lại | mọi lần mở lại = `{music:true, mic1:false, mic2:false, fx:false}`; file cấu hình **không có** key của 4 nút; preset RAP + Key D Major **vẫn giữ** | Electron runtime |
Tổ hợp thử trên Electron: (Music OFF, Mic1+2 ON, FX ON), (Music ON, Mic1 ON, Mic2 OFF, FX OFF), (Music ON, Mic2 ON, FX ON, có audio), (Music OFF, FX ON); cùng file CŨ có `musicDisabled/mic1/mic2/fx/fxRequested` = ON hết → vẫn mở ở mặc định, preset/Key được đọc, và các key cũ biến mất sau lần lưu kế tiếp.
`MenuButtonReset` phủ: 16/16 tổ hợp ON/OFF (gồm FX ON) → mở lại = mặc định; file không chứa 4 nút; Key/tone/preset/knobs giữ; file cũ; 7 kiểu cấu hình thiếu/hỏng; không còn `beforeunload`/`restoreButtonStates`; Auto FX `onRequest` không lưu. Kiểm tra phản chứng: tái đưa `mic1` vào lưu/khôi phục ⇒ test **fail** (8 ❌), bỏ ra ⇒ pass.
Test cũ `MenuButtonPersistence.verify.js` khẳng định yêu cầu NGƯỢC LẠI (khôi phục 4 nút) nên **bị xoá** (không sửa assertion cho qua).

## 5. Phân loại
- **VERIFIED (logic + Electron Linux, audio giả):** 4 nút về mặc định sau đóng/mở lại (cả nút Đóng lẫn thoát app), file cấu hình không lưu 4 nút, cài đặt khác giữ; file cũ bị bỏ qua; Auto FX BẬT 0,5 s, TẮT 1,0 s với nền nhiễu -76 dBFS, giữ tay 60,0 s rồi tiếp quản theo nhạc hiện tại.
- **VERIFIED (chỉ logic, DAW giả):** Mic không kích hoạt/giữ Auto FX; Send chậm/lỗi/timeout không kẹt hàng đợi, không mất yêu cầu TẮT mới nhất.
- **PARTIAL:** Electron/runtime chỉ trên Linux với audio giả; không phải máy Windows của Khói.
- **INFERRED:** hiện tượng khung âm thanh đứng/`SOURCE_UNAVAILABLE` trong log của Khói có thể do Chromium giảm tốc cửa sổ nền (chưa sửa).
- **UNKNOWN:** Reverb/Delay Send trong DAW (Send chưa cấu hình — **không tuyên bố hoạt động**); nền nhiễu thật của card âm thanh Khói so với -52 dBFS; mic thật; trạng thái DAW thật lúc khởi động.

## 6. Việc còn lại / cần Khói
1. Chạy bản này trên Windows với nhạc thật rồi gửi log có `FX_AUTO_DIAG` (`levelStats` = nền thật). Nếu nền > -52 dBFS thì FX vẫn không tắt — khi đó mới có bằng chứng để đề xuất chỉnh ngưỡng.
2. Cấu hình Send Reverb/Delay (CC/Note, kênh, `absolute` hay `toggle`) và kiểm tra trong DAW; chỉ khi đó mới nói Send hoạt động. Khuyến nghị `absolute`.
3. Quyết định có áp `backgroundThrottling:false` cho cửa sổ Menu không (đổi `app/main.js`, chưa làm).
4. Sau khi copy bản mới: **xoá `tests/unit/MenuButtonPersistence.verify.js`** (zip không mang theo thao tác xoá; xem `DELETE_FILES.txt`), nếu không test cũ sẽ báo lỗi.

## 7. File bàn giao
Sửa: `ui/js/renderer.js`, `tools/runtime-probe/persist.js`. Mới: `tests/unit/MenuButtonReset.verify.js`, `tools/algbench/reports/BUTTON-RESET-FX-AUTO-OFF/*` (vết runtime Electron, log test), báo cáo này. Xoá: `tests/unit/MenuButtonPersistence.verify.js`. Không đụng: HTML/CSS, `audioSource.js`, `bpmEngine.js`, Key/Mod, Service Key, preset, thuật toán MIDI.
Commit local: xem `git log` (không push theo yêu cầu).

---
Claude A : Task A: CORRECT BUTTON RESET + FX AUTO-OFF (COMPLETE theo tiêu chí task; chưa xác minh trên Windows/DAW thật)

1. File nào đã sửa.
   - `ui/js/renderer.js` (bỏ lưu/khôi phục/`beforeunload`/Auto-FX-lưu của 4 nút); `tools/runtime-probe/persist.js` (kiểm tra thêm preset/Key + file cấu hình).
   - Test: thêm `tests/unit/MenuButtonReset.verify.js`, xoá `tests/unit/MenuButtonPersistence.verify.js` (test cũ khẳng định yêu cầu ngược).
   - Báo cáo/bằng chứng: `tools/algbench/reports/BUTTON-RESET-FX-AUTO-OFF-REPORT.md` + thư mục `BUTTON-RESET-FX-AUTO-OFF/`.
2. Vì sao sửa.
   - Yêu cầu chính thức của Khói: Music/Mic 1/Mic 2/FX không được lưu trạng thái qua phiên; task trước đã làm ngược lại. Nay mở lại luôn về mặc định HTML (Music không disabled; Mic 1, Mic 2, FX tắt), không ghi/đọc 4 nút, không để Auto FX hay đóng cửa sổ lưu lại chúng.
   - Auto FX: giữ nguyên cách sửa `dbfsFloat` (đã kiểm tra lại trên mã mới nhất + Electron thật: BẬT 0,5 s, TẮT 1,0 s, giữ tay 60 s rồi tiếp quản).
3. Có ảnh hưởng module nào không.
   - Chỉ nút Music/Mic 1/Mic 2/FX và luồng lưu cấu hình Menu (Key/tone/preset/knobs giữ nguyên). Không đổi Auto FX, `audioSource.js`, `bpmEngine.js`, ngưỡng, Settings, MIDI mapping, preset, bố cục, Service Key.
4. Còn việc gì chưa làm.
   - Cần Khói: chạy thử trên Windows với nhạc thật và gửi log `FX_AUTO_DIAG`; cấu hình + kiểm tra Reverb/Delay Send trong DAW (chưa xác minh, không tuyên bố hoạt động); quyết định `backgroundThrottling`; xoá `tests/unit/MenuButtonPersistence.verify.js` khi copy file.
   - Chưa làm: hiệu chỉnh ngưỡng trên âm thanh thật (chưa có bằng chứng), thử mic thật.
