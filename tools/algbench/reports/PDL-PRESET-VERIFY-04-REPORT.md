# PDL-PRESET-VERIFY-04 — Mở rộng nghiên cứu PDL và ma trận tương thích Studio One 5–8 / Cubase Pro 10–15

**Loại task:** nghiên cứu và chuẩn bị xác minh. Không sửa mã/HTML/UI/MIDI mapping/FX Auto của Menu; không đổi preset hay cấu hình DAW của Khói; không commit, không push.
**Phạm vi preset:** NORM, LOFI, RAP, REMIX. **Không có DÂN CA.**
**Môi trường ưu tiên của Khói:** Fender Studio Pro 8 (ưu tiên 1) và Cubase Pro 13 (ưu tiên 2).
**Báo cáo này:** `tools/algbench/reports/PDL-PRESET-VERIFY-04-REPORT.md`
**Thư mục tài liệu:** `tools/algbench/reports/PDL-PRESET-VERIFY-04/`
**ZIP hướng dẫn cho Khói (trong repo):** `tools/algbench/reports/PDL-PRESET-VERIFY-04/PDL-PRESET-VERIFY-04-KHOI-GUIDES.zip`

Nhãn: `VERIFIED` (xác minh trực tiếp từ file/mã), `PARTIAL` (một phần/nguồn ngoài), `INFERRED` (suy luận), `UNKNOWN` (chưa biết), `BLOCKED` (thiếu dữ liệu/môi trường), `BLOCKED_USER_TEST` (cần Khói chạy trên DAW thật). Mỗi kết luận ghi rõ nguồn là **đọc file/mã**, **mock** hay **DAW thật**. **Hiện chưa có kết quả DAW thật nào; không có phiên bản DAW nào được đánh dấu "tương thích thực tế".**

---

## 1. GitHub HEAD đã kiểm tra và các tài liệu đã đọc

| Mục | Giá trị | Nhãn |
|---|---|---|
| GitHub `main` HEAD (kiểm tra 2026-10-20 ~17:50 và 2026-10-21) | `29af7e7dd6ba4d94a23713960b04c74242678fb4` — "Auto-sync 20/10/2026 17:38:27,27" (Khói). Chỉ thêm 11 file báo cáo VERIFY-03 (969 dòng), **không đổi mã** | VERIFIED (GitHub MCP) |
| Chuỗi commit gần đây | `29af7e7d` ← `5880a1b9` (README: quy định bắt buộc cho Claude/AI agent) ← `71c6ef1b` (README tổng quan) ← `dd4e363a` (báo cáo 02) ← `d400755c` (báo cáo 01) | VERIFIED |
| Mã Menu | Không đổi kể từ BUTTON-RESET; các commit sau chỉ thêm báo cáo hoặc sửa README. Blob `renderer.js` `435ab7c5`, `actionRegistry.js` `2263ad8f` khớp `main` (đối chiếu ở VERIFY-03) | VERIFIED |
| Báo cáo VERIFY-03 trên `main` = bản local | Blob `PDL-PRESET-VERIFY-03-REPORT.md` = `4d16a45d…` ở cả local và `main`; tổng 969 dòng thêm = 969 dòng local | VERIFIED |
| HEAD git local | `84f5810` (cũ, chưa kéo commit mới; môi trường không `git fetch/pull`; dùng GitHub MCP để đọc `main`) | VERIFIED |

**Tài liệu đã đọc:** `README.md` (main, blob `569c5261…`, gồm mục "Quy định bắt buộc dành cho Claude và các AI agent": báo cáo `.md`, ZIP khi có file bàn giao, không bịa số CC/Note/phím, phân biệt đọc mã/mock/DAW thật, ghi `BLOCKED`); `PDL-PRESET-RESEARCH-01-REPORT.md` + `PDL-PRESET-RESEARCH-01/`; `PDL-PRESET-RESEARCH-02-REPORT.md` + `PDL-PRESET-RESEARCH-02/`; `PDL-PRESET-VERIFY-03-REPORT.md` + toàn bộ `PDL-PRESET-VERIFY-03/` (3 checklist, 4 file bằng chứng, probe mock). Không ghi đè báo cáo/checklist cũ (mọi file mới nằm trong `PDL-PRESET-VERIFY-04/`).

**Giới hạn môi trường:** cloud Linux; không có DAW nào, không chạy được PDL (app Windows), không bắt được MIDI/phím thật; `core_logic.pyd` của PDL là mã máy Cython (chỉ đọc được bảng chuỗi hằng); không có `mode_overrides` thật. Môi trường web chỉ tra được tài liệu công khai.

**Đính chính VERIFY-03:** `CHECKLIST-C` ghi mở Key Commands qua "File > Key Commands"; tài liệu Steinberg ghi **Edit > Key Commands**. Hướng dẫn mới (`KHOI-02`) dùng Edit và cho phép tìm trong File nếu không thấy. Không sửa file cũ.

---

## 2. Kết quả nghiên cứu PDL — bằng chứng và suy luận

### 2.1 Cơ chế kích hoạt preset của PDL: vẫn `UNKNOWN — BLOCKED`
Không có bằng chứng đủ để nói PDL kích hoạt từng preset bằng macro, phím tắt, MIDI CC/Note hay cơ chế khác. Đã rà lại toàn bộ gói (config mặc định và của tác giả, json, `core_logic.pyd`, macro, Key Commands, PLE, MIDI Remote, Generic Remote). Tên hàm, chuỗi log, tên preset và thư viện đi kèm chỉ chứng minh *khả năng*. Chi tiết ở `PDL-PRESET-VERIFY-03/pdl-activation-evidence-review.txt`. **Chỉ có thể trả lời bằng PDL chạy thật** (bắt MIDI/phím) hoặc file `mode_overrides` thật → `KHOI-03`.

### 2.2 Bằng chứng MỚI trong task này
| # | Phát hiện | Nguồn | Nhãn |
|---|---|---|---|
| N1 | **Cubase của tác giả nhận MIDI từ cổng `loopMIDI Port` qua thiết bị Generic Remote** (InputDevice `Windows MIDI`, InputPort `loopMIDI Port`, Output "Not Connected", script `Generic Remote.xml`, bank mặc định `VST 1-16`). Port Setup liệt kê `loopMIDI Port`, `loopMIDI Port 1`, `LoopBe Internal MIDI` (cả Input và Output) | `PDL-PRESET-VERIFY-04/cubase-generic-remote-analysis.txt` (đọc `Defaults.xml`, `Port Setup.xml`) | VERIFIED (đọc file) |
| N2 | `Generic Remote.xml`: bảng "Standard MIDI", 80 điều khiển, status 176 (CC), kênh MIDI 1–16 × 4 bank (VST 1-16 … 49-64): **Fader CC 7 (Fader 1: CC 23), Pan CC 10, Mute CC 64, Send-1 CC 12, Send-2 CC 13**, ánh xạ tới thiết bị "VST Mixer" theo **vị trí kênh mixer** (không theo tên). Ý nghĩa `tag`/`flags` và việc Fader 1 dùng CC 23: UNKNOWN | cùng file | VERIFIED (nội dung) / UNKNOWN (ý nghĩa tag, flags) |
| N3 | Cubase có sẵn hạ tầng MIDI→Mute/Send theo kênh (từ loopMIDI) — **chưa** chứng minh PDL gửi các CC này để chọn preset; có thể phục vụ núm âm lượng/FX | suy luận từ N1–N2 | INFERRED |
| N4 | Hai bài mẫu Studio One (`NTBlog Project`, `NTBlog Project - VANG NHIEU`) đều ghi `Document:Generator = Studio One/5.3.0.65413`, `FormatVersion = 6`. Macro đi kèm bài mẫu nhiều khả năng được tạo/lưu trên Studio One 5.3 | `PDL-PRESET-VERIFY-04/version-evidence-inventory.txt` (đọc `metainfo.xml`) | VERIFIED (bài mẫu) / INFERRED (macro cùng nguồn) |
| N5 | `user.keyscheme` và `Studio One.settings` của Studio One 5, 6, 7 **giống hệt nhau** (md5 `9192f4a8`, `6f0d6697`): bản sao một cấu hình, **không** là bằng chứng riêng từng phiên bản. Không có file nào cho Studio One 8/Fender Studio Pro 8 | cùng file kiểm kê | VERIFIED |
| N6 | Cubase: `Key Commands.xml` 10/10.5/11 giống nhau (`6c7e1258`), 12 khác (`ab86e4aa`), 13/14/15 giống nhau (`8c09c42f`). `Defaults/Generic Remote/Port Setup/UserPreferences` của 13/14/15 giống hệt và ghi đường dẫn "Cubase 14_64" → bản sao của cấu hình Cubase 14. PLE (RAP, RAPC) định dạng **Cubase 14** (`AppVersion=14`); không có PLE cho 10–13, 15 | cùng file kiểm kê | VERIFIED |
| N7 | PLE: phần Action dùng lớp `leActionTargetTrackOp`, bộ lọc dùng `leNameTypeTarget` ×3 (lọc theo tên `Verb1`/`Delay`/`Verb3`) và `leToken` ×4. Tên lớp cho thấy đây là thao tác kiểu "Track Op", **không đủ** để biết `Function=335`, `Type=4012`, `Val=0/1` là gì | `PDL-PRESET-RESEARCH-01/cubase-ple-RAP.xml`, `…-RAPC.xml`; kiểm kê VERIFY-04 | VERIFIED (tên lớp) / UNKNOWN (ý nghĩa tham số) |
| N8 | Studio One.settings: `MacroToolBar` chỉ có `page="0"`, `SurfaceMapping` rỗng: không có nút macro/thiết bị ngoài nào được ghi trong gói | `adt.zip` | VERIFIED |
| N9 | Tìm web về "Auto Menu AI S1"/"Tune AI S1"/NTBlog: không có tài liệu công khai mô tả cách kích hoạt preset | `web-sources-v4.txt` | VERIFIED (không tìm thấy) |

### 2.3 Điều đã xác minh từ các task trước (còn hiệu lực, đọc file)
- Macro Studio One NORM/LOFI/RAP/REMIX đặt Mute tường minh (State 0/1) cho track LOFI/REMIX/NORM và kênh DELAY/VERB1/VERB2, không có lệnh Send; RAP là macro duy nhất đặt VERB1 = Mute. Macro NORM/LOFI/RAP/REMIX **không có phím tắt** trong keyscheme (chỉ BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7). (`PDL-PRESET-VERIFY-03/studioone-macro-state-table.txt`, `f-key-conflict-scan.txt`)
- Cubase 13–15: F9=NORMC, F10=LOFIC, F11=RAP, F12=RAPC; REMIX/REMIXC không có phím. Cubase 10–12: F11=REMIXC, F12=RAPC. RAP/RAPC chỉ khác `Val` (0/1).
- Config mặc định và config tác giả không chứa lệnh preset (`config-default-vs-author.txt`).
- Menu: 5 rủi ro (nút sáng khi NOT_CONFIGURED/NO_DEVICE; khôi phục không gửi lệnh; không có đường phím; không có PRESET_REMIX; xung đột Mute FX vs FX Auto) — VERIFY-03 mục 5, đọc mã + mock.

### 2.4 Phân biệt bằng chứng và suy luận (tóm tắt)
| Khẳng định | Loại |
|---|---|
| Nội dung macro/PLE/Key Commands/Generic Remote | Bằng chứng (đọc file) |
| Macro tạo trên Studio One 5.3 | Bằng chứng (bài mẫu) + suy luận (macro) |
| Cubase tác giả dùng loopMIDI → Generic Remote | Bằng chứng (đọc file) |
| Generic Remote dùng cho preset | **Suy luận chưa có chứng cứ** |
| PDL gọi macro/phím/CC cho preset | **Chưa biết** |
| FSP8 chạy macro 5.3 giống Studio One 5 | **Chưa biết** |

---

## 3. Ma trận tương thích

Quy tắc: mục chỉ đọc file/mã **không** được coi là tương thích thực tế. Cột "Kết quả DAW thật" mọi hàng = chưa có (`BLOCKED_USER_TEST`). "Khác biệt so với bản ưu tiên" so với **Fender Studio Pro 8** (Studio One) và **Cubase Pro 13** (Cubase).

### 3.1 Studio One 5–8 / Fender Studio Pro 8

| Phiên bản | Bằng chứng có | Preset đã kiểm (mức file) | Mute | FX Send | Macro | MIDI | Phím tắt | Khác biệt so với FSP8 | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| **Studio One 5 (5.3)** | Bài mẫu + macro do 5.3 tạo (`Generator=Studio One/5.3.0.65413`); `user.keyscheme` & `settings` (bản sao chung) | NORM, LOFI, RAP, REMIX: macro có trong gói (VERIFIED, đọc file) | Macro đặt Mute tường minh State 0/1; "1 = Mute" PARTIAL; chạy thật chưa có | Không có lệnh Send trong macro (VERIFIED, đọc file) | Macro tồn tại; cách PDL gọi: UNKNOWN. Tài liệu: gọi được bằng Macro Toolbar/phím/MIDI device map (PARTIAL) | Không có thiết bị MIDI/ánh xạ trong gói (SurfaceMapping rỗng) | 4 macro preset KHÔNG có phím; BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7 | Có thể khác: đổi tên thương hiệu, "song"→"session", giao diện mới (PARTIAL, Wikipedia/SoS); tương thích macro 5.3 trên FSP8: UNKNOWN | **PARTIAL** (mức file) · DAW thật `BLOCKED_USER_TEST` |
| **Studio One 6** | `user.keyscheme`/`settings` giống hệt bản 5 (md5); không có bài mẫu/macro riêng | Dùng cùng macro (INFERRED), không bằng chứng riêng | như trên, INFERRED | như trên | như trên | như trên | như trên (cùng file) | UNKNOWN | **INFERRED** · `BLOCKED` (không có dữ liệu riêng) |
| **Studio One 7** | như bản 6 | như trên | như trên | như trên | như trên | như trên | như trên | UNKNOWN | **INFERRED** · `BLOCKED` |
| **Studio One 8 / Fender Studio Pro 8 (ƯU TIÊN)** | **Không có file nào trong gói**. Có tài liệu hãng v8.1: macro tạo ở Macro Organizer/Toolbar, gán phím, gán MIDI qua device map; macro là file XML; không nêu đường dẫn thư mục macro, tên exe, vị trí key scheme | Chưa kiểm | UNKNOWN | UNKNOWN | UNKNOWN: macro 5.3 có chạy/giữ hành vi không; lệnh `Mute` (category Track) sau `Find Channel` có tác động kênh FX không | UNKNOWN: có device map gán macro không | UNKNOWN: macro preset có phím không | (là bản chuẩn) | **UNKNOWN / BLOCKED_USER_TEST** — cần `KHOI-01` |

### 3.2 Cubase Pro 10–15

| Phiên bản | Bằng chứng có | Preset đã kiểm (mức file) | Mute | FX Send | Macro | MIDI | Phím tắt (Key Commands, VERIFIED đọc file) | Khác biệt so với Cubase 13 | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| **Cubase 10** | `Key Commands.xml` (`6c7e1258`) | NORMC, LOFIC, REMIXC, RAPC có phím; LOFI, RAP, REMIX đã đăng ký nhưng không phím; NORM không có trong file | Không có PLE → UNKNOWN | UNKNOWN | Không áp dụng (Cubase dùng PLE) | Không có bằng chứng | F9 NORMC, F10 LOFIC, **F11 REMIXC, F12 RAPC**; F8 BatVang, F7 TatVang, F6 BatMic, F5 TatMic | F11/F12 ý nghĩa khác Cubase 13 (REMIXC vs RAP); RAP chưa có phím; BatVang/TatVang thay cho BATVANGTUNE/TATVANGTUNE | **PARTIAL** (mức file) |
| **Cubase 10.5** | Key Commands giống hệt bản 10 | như 10 | như 10 | như 10 | – | – | như 10 | như 10 | **PARTIAL** (giống 10) |
| **Cubase 11** | Key Commands giống hệt bản 10 | như 10 | như 10 | như 10 | – | – | như 10 | như 10 | **PARTIAL** (giống 10) |
| **Cubase 12** | Key Commands (`ab86e4aa`, khác file nhưng phím preset giống 10–11) | như 10 | UNKNOWN | UNKNOWN | – | MIDI Remote có từ Cubase 12 (ngoài gói chưa kiểm) | như 10 (F9–F12 giống 10–11) | như 10 | **PARTIAL** |
| **Cubase 13 (ƯU TIÊN 2)** | Key Commands (`8c09c42f`, trùng 14/15); thư mục có thêm `Defaults/Generic Remote/Port Setup/UserPreferences/Default Project Workspace` nhưng là **bản sao từ cấu hình Cubase 14** | NORMC (F9), LOFIC (F10), RAP (F11), RAPC (F12) có phím; **REMIX, REMIXC không phím**; NORM không có | PLE không có cho 13 (chỉ bản định dạng 14) → UNKNOWN; tương thích PLE 14 trên 13: UNKNOWN | UNKNOWN (PLE RAP lọc tên Verb1/Delay/Verb3, ý nghĩa Action UNKNOWN) | – | Cấu hình tác giả: Generic Remote ← `loopMIDI Port` (CC Mute 64, Send 12/13, theo vị trí kênh) — thuộc cấu hình 14 (INFERRED áp dụng cho 13) | F9 NORMC, F10 LOFIC, F11 RAP, F12 RAPC; F8 BATVANGTUNE, F7 TATVANGTUNE, F2 BatBe, F3 TatBe, F6 BatMic, F5 TatMic | (là bản chuẩn) | **PARTIAL** (mức file) · DAW thật `BLOCKED_USER_TEST` — cần `KHOI-02` |
| **Cubase 14** | Key Commands (trùng 13/15) + PLE `RAP.xml`/`RAPC.xml` (AppVersion 14) + Defaults/Generic Remote/Port Setup (nguồn gốc cấu hình tác giả) | RAP, RAPC có nội dung PLE (chỉ khác `Val` 0/1; ý nghĩa UNKNOWN); NORMC/LOFIC/REMIX*/NORM/LOFI/RESET thiếu PLE | UNKNOWN | UNKNOWN | – | **VERIFIED** (đọc file): Generic Remote nhận `loopMIDI Port`; CC theo bảng mục 2.2 N2 | như Cubase 13 | Không khác Key Commands; có PLE định dạng 14 | **PARTIAL** (nhiều bằng chứng nhất, mức file) |
| **Cubase 15** | Key Commands (trùng 13/14); các file khác là bản sao cấu hình 14 | như 13 | UNKNOWN | UNKNOWN | – | như 14 (sao chép) | như 13 | Không khác 13 ở Key Commands; PLE/định dạng 15: UNKNOWN | **PARTIAL / INFERRED** (giống 13/14 ở mức file) |

### 3.3 Phím preset theo phiên bản Cubase (tóm tắt, VERIFIED đọc file)
| Lệnh | 10 / 10.5 / 11 / 12 | 13 / 14 / 15 |
|---|---|---|
| NORMC | F9 | F9 |
| LOFIC | F10 | F10 |
| REMIXC | F11 | không phím |
| RAPC | F12 | F12 |
| RAP | không phím | F11 |
| REMIX | không phím | không phím |
| NORM, LOFI | không phím | không phím |

Ghi chú: các hàng "–" ở cột Macro nghĩa là Cubase không dùng macro cho preset trong gói (dùng PLE + Key Command). Khác biệt F11/F12 giữa 10–12 và 13–15 là dữ liệu của file cấu hình tác giả; lý do (đổi thiết kế preset hay đổi bố cục phím) **UNKNOWN**.

### 3.4 So sánh hai DAW (không giả định tương đương)
| Khía cạnh | Studio One/FSP8 (gói PDL) | Cubase 13–15 (gói PDL) |
|---|---|---|
| Cơ chế preset trong gói | Macro đặt Mute theo TÊN track/kênh | PLE lọc theo TÊN (Verb1/Delay/Verb3), Action chưa giải mã |
| Gắn phím | Macro preset không phím | NORMC/LOFIC/RAP/RAPC = F9–F12 |
| MIDI trong gói | Không có | Generic Remote ← loopMIDI (CC theo vị trí kênh) |
| Trạng thái mixer sau preset | Xác định theo file (chưa chạy) | UNKNOWN |

---

## 4. Checklist kiểm thử thực tế (ưu tiên Fender Studio Pro 8 và Cubase Pro 13)

Viết cho người không lập trình, từng bước, có hướng dẫn che bản quyền/tài khoản và làm trên **bản sao** session/project. Nằm trong `tools/algbench/reports/PDL-PRESET-VERIFY-04/khoi-guides/` và nén trong ZIP `PDL-PRESET-VERIFY-04-KHOI-GUIDES.zip`:

| File | Nội dung | Thứ tự |
|---|---|---|
| `KHOI-00-CHE-DU-LIEU-VA-AN-TOAN.md` | Làm trên bản sao; những gì phải che (license, tài khoản, tên Windows, id/token); cách che ảnh và file text; cách gửi lại | Đọc trước |
| `KHOI-01-FenderStudioPro8.md` | Phiên bản + tên exe; macro có sẵn? phím? Macro Toolbar? External?; bấm 4 macro bằng chuột, ghi Mute/Send; kiểm Mute và Send riêng; chạy lặp | 1 |
| `KHOI-02-Cubase-Pro-13.md` | Key Commands; xem PLE (không Apply); copy file PLE; Generic Remote + cổng loopMIDI (chỉ nhìn); thử F9–F12 và ghi mixer; so RAP/RAPC | 2 |
| `KHOI-03-PDL-bat-lenh-that.md` | Theo dõi MIDI loopMIDI khi bấm NORM/LOFI/RAP/REMIX trong PDL; file `mode_overrides` | 3 (sau 1 hoặc 2) |
| `KHOI-04-phien-ban-khac-sau-nay.md` | Dữ liệu tối thiểu cho Studio One 5/6/7 và Cubase 10/10.5/11/12/14/15 — làm sau, không cần cài ngay | Sau |

Các checklist của VERIFY-03 (A/B/C) vẫn còn nguyên; `KHOI-*` là bản cập nhật gọn, ưu tiên FSP8 + Cubase 13 và có hướng dẫn che dữ liệu.

---

## 5. Đã xác minh, chưa xác minh, đang `BLOCKED`

### 5.1 Đã xác minh (VERIFIED, đọc file/mã — chưa phải DAW thật)
1. Nội dung macro Studio One, bảng Mute, không lệnh Send; macro preset không có phím.
2. Cubase Key Commands F9–F12 theo nhóm phiên bản (10–12 vs 13–15); RAP/RAPC chỉ khác `Val`.
3. Cubase của tác giả: Generic Remote ← `loopMIDI Port`, bảng CC Mute/Send/Fader/Pan theo vị trí kênh (N1–N2).
4. Bài mẫu Studio One do 5.3 tạo; keyscheme/settings 5/6/7 là bản sao; cấu hình Cubase 13/14/15 là bản sao của 14.
5. Config mặc định và tác giả không chứa lệnh preset.
6. Menu: 5 rủi ro (VERIFY-03, mock + đọc mã); mã Menu không đổi.

### 5.2 Chưa xác minh (UNKNOWN / INFERRED)
- Cơ chế PDL kích hoạt từng preset (macro/phím/CC/Note/khác) và lệnh cụ thể: **UNKNOWN**.
- Ý nghĩa `Function=335`, `Type=4012`, `Val=0/1`, và `tag`/`flags` của Generic Remote: **UNKNOWN**.
- Macro 5.3 chạy trên FSP8; Mute sau `Find Channel` tác động kênh FX; "State 1 = Mute": **UNKNOWN / PARTIAL**.
- Generic Remote là bảng mặc định hay tự tạo; dùng cho núm hay preset: **UNKNOWN / INFERRED**.
- Tương thích PLE định dạng Cubase 14 trên Cubase 13/15 (và 10–12): **UNKNOWN**.
- Tên exe và đường dẫn dữ liệu của Fender Studio Pro 8 trên Windows: **UNKNOWN**.

### 5.3 Đang `BLOCKED` và nguyên nhân chính xác
| ID | Mục | Nguyên nhân | Cần |
|---|---|---|---|
| B1 | PDL gửi gì cho từng preset | Không chạy được PDL/Windows trong môi trường này; `core_logic.pyd` là mã máy | KHOI-03 (log MIDI, `mode_overrides`, `config.ini` đã che) |
| B2 | FSP8: macro, mixer trước/sau, Mute vs Send | Không có DAW; không có file FSP8 | KHOI-01 |
| B3 | Cubase 13: F9–F12, PLE thật, mixer | Không có Cubase; thiếu PLE `NORMC/LOFIC/REMIXC/REMIX/NORM/LOFI/RESET` | KHOI-02 |
| B4 | Generic Remote trên máy Khói | Chỉ có bản trong gói | KHOI-02 bước 5 |
| B5 | Studio One 5/6/7, Cubase 10–12/14/15 | Không có dữ liệu riêng/không bắt buộc cài | KHOI-04 (sau này) |
| B6 | Quyết định Mute / Send / cả hai | Quyết định của Khói, cần bằng chứng B2/B3 | Khói |

---

## 6. Các bước Khói cần thực hiện tiếp theo

1. Đọc `KHOI-00`. Giải nén ZIP hướng dẫn (mục 8) hoặc mở file trong `G:\AUTO_MENU_AI\tools\algbench\reports\PDL-PRESET-VERIFY-04\khoi-guides\`.
2. Làm `KHOI-01` (Fender Studio Pro 8) trên **bản sao** session. Nếu chưa có 4 macro, dừng ở Bước 2 và gửi ảnh (không tự nhập macro).
3. Làm `KHOI-02` (Cubase 13) trên **bản sao** project: Key Commands, PLE (không Apply), copy file PLE, Generic Remote, F9–F12.
4. Làm `KHOI-03` (PDL bắt lệnh thật) trên cùng DAW.
5. Che thông tin theo `KHOI-00`, gom vào thư mục `KET_QUA_VERIFY04`, nén ZIP, gửi cho Claude A.
6. Chưa cần cài Studio One 5/6/7 hay Cubase 10/11/12/14/15.
7. Sau khi có kết quả, Khói quyết định hướng Mute / Send / cả hai (Claude A không chọn thay).

---

## 7. Khuyến nghị giai đoạn nghiên cứu kế tiếp (chưa triển khai Menu)

1. **Phân tích dữ liệu Khói gửi** (VERIFY-05): chốt cơ chế PDL; đối chiếu Action/Function của PLE với chữ hiển thị trong Cubase; xác nhận macro FSP8 và Mute kênh FX.
2. **Xác định cơ chế điều khiển cho từng DAW** dựa trên bằng chứng thật: Studio One/FSP8 (macro qua MIDI device map hoặc phím) và Cubase 13 (Key Command F9–F12 qua phím, hay CC qua Generic Remote theo vị trí kênh) — hai cơ chế Cubase khác nhau, không trộn.
3. **Thiết kế (không mã) kiến trúc hai lớp:** logic preset dùng chung + driver riêng từng DAW, cấu hình theo (DAW, phiên bản) — ghi nhận ở `PDL-PRESET-VERIFY-04/MENU-FUTURE-REQUIREMENTS.md`.
4. **Nghiên cứu xung đột Mute FX (macro) vs FX Send tự động (Menu)**: đo hành vi thật; Khói quyết định quy tắc ưu tiên.
5. Chỉ mở task triển khai khi có đủ bằng chứng DAW thật cho từng preset × DAW sẽ làm và Khói phê duyệt (điều kiện nghiệm thu ở VERIFY-03 mục 5).
6. Mở rộng sang Studio One 5/6/7 và Cubase 10–12/14/15 sau cùng (KHOI-04).

### D. Yêu cầu tích hợp Menu giai đoạn sau (tóm tắt, chi tiết ở `MENU-FUTURE-REQUIREMENTS.md`)
- Tách logic dùng chung (mô hình 4 preset, trạng thái mong muốn/đã xác nhận, kết quả gửi, chính sách khi mở lại, nhường quyền với FX Auto) khỏi lớp điều khiển riêng từng DAW (gọi macro / Key Command / CC theo cấu hình DAW + phiên bản; mapping do người dùng khai báo, không đặt số mặc định).
- Điểm nghiên cứu thêm: preset, MIDI, Mute, FX Send (6 điểm trong tài liệu).
- Xung đột Mute FX của macro PDL với FX Send tự động của Menu: ghi nhận là rủi ro `INFERRED`; **chưa quyết định** Mute, Send hay kết hợp — cần bằng chứng và quyết định của Khói.

---

## 8. HƯỚNG DẪN SAO CHÉP / SỬ DỤNG GÓI BÀN GIAO

Task này **chỉ tạo báo cáo và tài liệu nghiên cứu/hướng dẫn**: **không có file triển khai cần thay thế**, **không có ZIP triển khai**, **không có lệnh cài đặt**. Mọi file là **thêm mới, không ghi đè**.

1. **ZIP trong repo (dành cho Khói, chỉ hướng dẫn):** `tools/algbench/reports/PDL-PRESET-VERIFY-04/PDL-PRESET-VERIFY-04-KHOI-GUIDES.zip` — chứa 5 file `KHOI-00…04` (giữ nguyên đường dẫn `tools/algbench/reports/PDL-PRESET-VERIFY-04/khoi-guides/…`).
2. **ZIP bàn giao đầy đủ (gửi trong cuộc trò chuyện, không đặt trong repo):** `PDL-PRESET-VERIFY-04-HANDOVER.zip` — gồm báo cáo + toàn bộ thư mục `PDL-PRESET-VERIFY-04/` (kể cả ZIP hướng dẫn ở mục 1).
3. **Sao lưu:** không cần (không ghi đè). Nếu muốn an toàn, sao lưu `G:\AUTO_MENU_AI\tools\algbench\reports\`.
4. **Giải nén vào:** `G:\AUTO_MENU_AI\` (ZIP đã chứa đường dẫn `tools\algbench\reports\...`).
5. **Vị trí sau khi giải nén:** `tools\algbench\reports\PDL-PRESET-VERIFY-04-REPORT.md` (file mới) và thư mục `tools\algbench\reports\PDL-PRESET-VERIFY-04\` (thư mục mới).
6. **Cách dùng:** không chạy gì. Mở báo cáo bằng Notepad/trình xem Markdown; mở các file `KHOI-*.md` bằng Notepad/Word để làm theo.
7. **Dấu hiệu thành công:** thấy báo cáo và thư mục `PDL-PRESET-VERIFY-04` đúng vị trí; Auto-push của Khói tự đẩy lên GitHub (báo cáo này không push).
8. **Khôi phục nếu lỗi:** xoá các file/thư mục vừa chép (không đụng file cũ).
9. **Yêu cầu phụ thuộc:** không (đọc tài liệu). Các bước trong `KHOI-*` cần Fender Studio Pro 8 / Cubase Pro 13 / PDL trên Windows và (cho KHOI-03) một phần mềm theo dõi MIDI miễn phí.

---

## 9. Danh sách file bằng chứng và nguồn

| File | Nội dung |
|---|---|
| `PDL-PRESET-VERIFY-04/cubase-generic-remote-analysis.txt` | Generic Remote, cổng MIDI, bản sao cấu hình 13/14/15 (sinh bằng script từ file gốc; đường dẫn người dùng đã che) |
| `PDL-PRESET-VERIFY-04/version-evidence-inventory.txt` | Kiểm kê bằng chứng theo phiên bản (md5, Generator 5.3, PLE AppVersion 14) |
| `PDL-PRESET-VERIFY-04/web-sources-v4.txt` | Nguồn web (Wikipedia lịch sử bản, Sound on Sound, tài liệu Steinberg/Fender) |
| `PDL-PRESET-VERIFY-04/MENU-FUTURE-REQUIREMENTS.md` | Yêu cầu tích hợp Menu giai đoạn sau |
| `PDL-PRESET-VERIFY-04/khoi-guides/KHOI-00…04*.md` | Hướng dẫn cho Khói |
| `PDL-PRESET-VERIFY-04/PDL-PRESET-VERIFY-04-KHOI-GUIDES.zip` | ZIP của 5 file hướng dẫn |
| Dùng từ trước (không sửa) | `PDL-PRESET-RESEARCH-01/02` (+báo cáo), `PDL-PRESET-VERIFY-03-REPORT.md` và `PDL-PRESET-VERIFY-03/` (macro-state-table, f-key-conflict-scan, config-default-vs-author, pdl-activation-evidence-review, probe mock, CHECKLIST-A/B/C) |

**Nguồn đối chiếu:** gói PDL `auto-menu-ai-s1.zip` (`data/dcm.zip`, `data/adt.zip`, `config.ini`, `core_logic.pyd`); GitHub `main` HEAD `29af7e7d`; `README.md` (blob `569c5261`); [Wikipedia: Studio Pro](https://en.wikipedia.org/wiki/Studio_Pro); [Sound on Sound: Fender Studio Pro 8](https://soundonsound.com/reviews/fender-studio-pro-8); [Fender Studio Pro manual — Macro Toolbar](https://fenderstudiopromanual.fender.com/en/Content/Editing_Topics/Macro_Toolbar.htm); [Steinberg help — Key Commands for PLE presets](https://archive.steinberg.help/nuendo/v12/en/cubase_nuendo/topics/project_logical_editor/project_logical_editor_for_presets_key_commands_setting_up_t.html).

---

## Claude A : Task A: PDL-PRESET-VERIFY-04 — Mở rộng nghiên cứu PDL và ma trận tương thích Studio One 5–8 / Cubase Pro 10–15

**1. File nào đã sửa.**
- **Tạo mới (đều trong `tools/algbench/reports/`):** `PDL-PRESET-VERIFY-04-REPORT.md`; thư mục `PDL-PRESET-VERIFY-04/` gồm `cubase-generic-remote-analysis.txt`, `version-evidence-inventory.txt`, `web-sources-v4.txt`, `MENU-FUTURE-REQUIREMENTS.md`, `khoi-guides/KHOI-00…KHOI-04` (5 file `.md`) và `PDL-PRESET-VERIFY-04-KHOI-GUIDES.zip`.
- **Không sửa:** mã Menu (`ui/js/*`, `ui/index.html`, `ui/setup.html`, `core/*`), HTML/UI, MIDI mapping, FX Auto, test, cấu hình DAW/preset của Khói, và mọi báo cáo/checklist cũ (RESEARCH-01/02, VERIFY-03). Không commit, không push. **Xác nhận: chưa thay đổi code Menu.**

**2. Vì sao sửa.**
- Theo task VERIFY-04: mở rộng nghiên cứu PDL và lập ma trận tương thích Studio One 5–8 / Fender Studio Pro 8 và Cubase Pro 10–15; chuẩn bị checklist ưu tiên FSP8 và Cubase 13; ghi nhận yêu cầu tích hợp Menu cho giai đoạn sau.
- Kết quả cốt lõi: cơ chế PDL kích hoạt preset vẫn `UNKNOWN — BLOCKED`; bằng chứng mới: Cubase của tác giả nhận MIDI từ `loopMIDI Port` qua Generic Remote (CC theo vị trí kênh), macro/bài mẫu Studio One do 5.3 tạo, cấu hình Studio One 5/6/7 và Cubase 13/14/15 trong gói là bản sao chung (không phải bằng chứng riêng từng phiên bản). Chưa có phiên bản nào được đánh dấu tương thích thực tế.

**3. Có ảnh hưởng module nào không.**
- Không. Chỉ thêm tài liệu và dữ liệu nghiên cứu; không module, giao diện, hành vi Menu, FX Auto hay MIDI nào thay đổi.

**4. Còn việc gì chưa làm.**
- `BLOCKED_USER_TEST` (cần Khói): `KHOI-01` (FSP8: macro, Mute/Send trước–sau, tên exe), `KHOI-02` (Cubase 13: Key Commands, PLE thật + file PLE thiếu `NORMC/LOFIC/REMIXC/REMIX/NORM/LOFI/RESET`, Generic Remote, F9–F12), `KHOI-03` (PDL bắt lệnh thật, `mode_overrides`).
- `BLOCKED` dài hạn: Studio One 5/6/7 và Cubase 10/10.5/11/12/14/15 chưa có dữ liệu riêng (`KHOI-04`, không cần cài ngay).
- `UNKNOWN`: ý nghĩa `Function/Type/Val` và `tag/flags`; tương thích macro 5.3 và PLE 14 trên bản ưu tiên; Generic Remote có dùng cho preset không.
- Quyết định của Khói: Mute / Send / cả hai (không chọn thay).
- Chưa chuyển sang triển khai; chờ Khói xem báo cáo và phê duyệt bước tiếp theo.
