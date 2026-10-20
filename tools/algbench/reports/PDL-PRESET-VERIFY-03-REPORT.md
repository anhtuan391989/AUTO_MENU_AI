# PDL-PRESET-VERIFY-03 — Xác minh thực tế preset trên Studio One/Fender Studio Pro và Cubase 13–15

**Loại task:** chỉ nghiên cứu, đối chiếu và chuẩn bị kiểm thử. Không sửa mã Menu, không đổi giao diện/HTML, không triển khai preset, không commit triển khai, không push.
**Phạm vi preset:** NORM, LOFI, RAP, REMIX. **Không có DÂN CA** (không nghiên cứu, không thiết kế).
**Báo cáo này:** `tools/algbench/reports/PDL-PRESET-VERIFY-03-REPORT.md`
**Thư mục bằng chứng:** `tools/algbench/reports/PDL-PRESET-VERIFY-03/`

Nhãn dùng xuyên suốt: `VERIFIED` (đã xác minh trực tiếp từ file/mã/bằng chứng), `PARTIAL` (đúng một phần hoặc chỉ nguồn thứ cấp), `INFERRED` (suy luận), `UNKNOWN` (chưa biết), `BLOCKED` (thiếu dữ liệu), `BLOCKED_USER_TEST` (cần Khói chạy thử trên DAW thật). Mỗi kết luận ghi rõ nguồn là **đọc file/mã**, **mô phỏng (mock)** hay **DAW thật**. Hiện **chưa có kết quả DAW thật nào**.

---

## 0. Trạng thái repo, đồng bộ và giới hạn môi trường

| Mục | Giá trị | Nhãn |
|---|---|---|
| GitHub `main` HEAD (kiểm tra ngày 2026-10-20) | `5880a1b9bda249956383b4da2c98579eed96edac` — "docs: add mandatory Claude report and ZIP handoff rules" (10:21:38Z) | VERIFIED (GitHub MCP) |
| Commit trước đó | `71c6ef1b` (README, 10:19:14Z), `dd4e363a` ("Auto-sync 20/10/2026 16:27:25,65", chỉ thêm 8 file báo cáo 02), `d400755c` (thêm báo cáo 01) | VERIFIED |
| Thay đổi mã từ BUTTON-RESET đến HEAD | Không. `dd4e363a` chỉ thêm file báo cáo; `71c6ef1b` và `5880a1b9` chỉ sửa `README.md` (`get_commit` liệt kê đúng 1 file) | VERIFIED |
| Mã Menu bản local trùng `main` | Blob SHA khớp `main` cho `ui/js/renderer.js` (`435ab7c5`), `ui/js/actionRegistry.js` (`2263ad8f`) và các file `ui/js/*.js`, `ui/index.html`, `ui/setup.html`, `core/command-engine-js/runtime.js` (đối chiếu ở phiên trước tại `dd4e363a`; hai commit sau chỉ đổi README) | VERIFIED |
| HEAD git local | `84f5810` (commit cũ, chưa đồng bộ README/commit mới; môi trường này không `git fetch`/`pull` được, dùng GitHub MCP để đọc `main`) | VERIFIED |
| Quy tắc mới trong `README.md` ("Quy định bắt buộc dành cho Claude") | Đã đọc và áp dụng: báo cáo `.md` + đường dẫn đầy đủ; phân biệt đọc mã / mock / DAW thật; `BLOCKED` khi thiếu dữ liệu; không bịa CC/Note/phím; không đổi phạm vi | VERIFIED |

**Giới hạn môi trường:** (1) Môi trường cloud Linux, không có Studio One/Fender Studio Pro/Cubase, không có PDL chạy được (PDL là app Windows). (2) Không thể chạy PDL thật nên **không bắt được MIDI/phím thật**. (3) `core_logic.pyd` của PDL biên dịch Cython: thân hàm là mã máy, chỉ đọc được bảng chuỗi hằng. (4) Không có file `mode_overrides` thật từ máy người dùng. (5) Không truy cập được máy Khói. Mọi kết quả "mock" dưới đây chỉ chứng minh hành vi mã Menu, **không** chứng minh DAW phản ứng.

---

## 1. Tóm tắt kết quả và những điểm đã xác minh

**Kết luận chính (ngắn):**
1. **Cơ chế PDL thực sự kích hoạt từng preset (MIDI CC / Note / phím / macro / khác): `UNKNOWN` — `BLOCKED`.** Không file nào trong gói PDL (config mặc định, config tác giả, json, thư viện, dữ liệu) nêu lệnh của NORM/LOFI/RAP/REMIX; tên hàm, chuỗi log, tên preset và thư viện đi kèm chỉ chứng minh *khả năng*, không phải lệnh. Chỉ chạy PDL thật (bắt MIDI/phím) hoặc có file `mode_overrides` mới trả lời được. → `CHECKLIST-A`.
2. **Studio One:** nội dung 4 macro NORM/LOFI/RAP/REMIX là `VERIFIED` (đọc file): đặt Mute **tường minh** (State 0/1) cho 3 track + 3 kênh FX, **không** có lệnh chỉnh Send. Nhưng cả 4 macro **không có phím tắt** trong `user.keyscheme` Studio One 5/6/7 của gói, không có nút Macro Toolbar/thiết bị ngoài trong dữ liệu gói → cách PDL gọi macro: `UNKNOWN`. Tài liệu Fender Studio Pro cho biết macro gọi được bằng nút Macro Toolbar, phím tắt hoặc MIDI qua device map (`PARTIAL`, chưa thử trên máy Khói). Kết quả trên DAW thật: `BLOCKED_USER_TEST`.
3. **Cubase 13/14/15:** `Key Commands.xml` (3 file giống hệt) gán `F9=NORMC, F10=LOFIC, F11=RAP, F12=RAPC` (`VERIFIED` đọc file); `REMIX`/`REMIXC` **không có phím**. Chỉ có nội dung PLE của `RAP` và `RAPC` (chỉ khác `Val` 0/1; ý nghĩa `Function=335`, `Type=4012`, `Val` là `UNKNOWN`). Thiếu PLE của NORMC, LOFIC, REMIX, REMIXC… → danh sách cần Khói xuất ở mục 3.
4. **Menu (mã hiện tại, đọc mã + mock):** 5 rủi ro đều `VERIFIED` ở mức mã: nút sáng dù `NOT_CONFIGURED`/`NO_DEVICE`; khôi phục preset khi mở app không gửi lệnh; không có đường gửi phím cho preset; không có `PRESET_REMIX`/nút REMIX; xung đột Mute-FX vs FX Auto-Send là `INFERRED`. Probe mô phỏng mới: `PDL-PRESET-VERIFY-03/menu-preset-ui-probe.js` (chạy 2 lần, output giống hệt).
5. **Khác biệt config mặc định vs tác giả:** `VERIFIED` — chỉ khác DAW (`Studio One.exe` → `Cubase14.exe`), cổng MIDI (`Microsoft GS Wavetable Synth` → `loopMIDI Port`), mức núm, `[ToaDo]`, cửa sổ/PWA; **không bản nào chứa lệnh preset**.

**Không có preset nào được tuyên bố là hoạt động.** Mọi trạng thái "chạy được trên DAW thật" = `BLOCKED_USER_TEST`.

### 1.1 Điểm đã xác minh (VERIFIED) — bảng tổng hợp

| # | Điều đã xác minh | Nguồn | Loại bằng chứng |
|---|---|---|---|
| V1 | 4 macro Studio One đặt Mute tường minh (State 0/1) theo bảng mục 2; không có lệnh Send | `PDL-PRESET-VERIFY-03/studioone-macro-state-table.txt` (trích lại từ 10 file `.studioonemacro`) | đọc file |
| V2 | Macro NORM/LOFI/RAP/REMIX là dòng `<Command/>` **không có `<Key>`** trong `user.keyscheme` Studio One 5/6/7 (md5 giống nhau `9192f4a8`); chỉ BatMic=F6, TatMic=F5, BatVang4=F8, TatVang4=F7 có phím; không có phím F bị gán trùng | `PDL-PRESET-VERIFY-03/f-key-conflict-scan.txt` | đọc file |
| V3 | `Studio One.settings` (5/6/7 giống nhau): `MacroToolBar` chỉ có `page="0"` (không nút macro nào được ghi); `SurfaceMapping` rỗng (không gán thiết bị ngoài) | `adt.zip` (đọc trực tiếp) | đọc file |
| V4 | Cubase 13/14/15 `Key Commands.xml` (md5 `8c09c42f`): F9=NORMC, F10=LOFIC, F11=RAP, F12=RAPC; BATVANGTUNE=F8, TATVANGTUNE=F7, BatBe=F2, TatBe=F3, BatMic=F6, TatMic=F5; không phím F nào gán cho 2 lệnh | `f-key-conflict-scan.txt` | đọc file |
| V5 | Cubase 10/10.5/11/12 khác 13+: F11=REMIXC, F12=RAPC; `RAP` chưa có phím | `f-key-conflict-scan.txt` | đọc file |
| V6 | PLE `RAP.xml` và `RAPC.xml` chỉ khác `Val` (0 vs 1); cùng `Function=335`, `Type=4012` | `PDL-PRESET-RESEARCH-01/cubase-ple-RAP.xml`, `cubase-ple-RAPC.xml` | đọc file |
| V7 | `config.ini` mặc định và của tác giả không có khoá liên quan preset/mode/macro/hotkey/CC/Note | `PDL-PRESET-VERIFY-03/config-default-vs-author.txt` | đọc file |
| V8 | `mode_overrides` chỉ tồn tại như chuỗi/định danh trong `lib/core_logic.pyd`; không file nào trong gói chứa giá trị | `PDL-PRESET-VERIFY-03/pdl-activation-evidence-review.txt` | đọc bảng chuỗi |
| V9 | Menu: NORM/LOFI/RAP có action, không có `PRESET_REMIX`, không có nút REMIX, không có đường phím cho preset; nút sáng trước/bất kể kết quả gửi; khôi phục preset không gọi `executeAction` | `renderer.js:504-519, 1701, 1750-1757, 2518-2531`; `actionRegistry.js:47-49, 186-246`; `menu-preset-ui-probe.output.txt` | đọc mã + **mock** |

---

## 2. Bảng riêng cho từng preset trên từng DAW

Quy ước: "Trạng thái macro/PLE" là điều file nói; "Kết quả DAW thật" luôn là `BLOCKED_USER_TEST` vì chưa có log/ảnh của Khói. Cột Menu: tình trạng hiện tại khi bấm nút (mock).

### 2.1 Studio One / Fender Studio Pro

Trạng thái macro đặt (1 = Mute BẬT, 0 = Mute TẮT; nghĩa "1 = mute" là `PARTIAL`: khớp trạng thái mặc định của bài mẫu "VANG NHIEU" — LOFI/REMIX bị mute, NORM không):

| Macro | LOFI | REMIX | NORM | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | 1 | 1 | 0 | 0 | 0 | 0 |
| LOFI | 0 | 1 | 1 | 0 | 0 | 0 |
| REMIX | 1 | 0 | 1 | 0 | 0 | 0 |
| RAP | 1 | 1 | 0 | 0 | **1** | 0 |

#### NORM — Studio One
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Macro trong gói | `NORM.studioonemacro` (nhóm Custom) | VERIFIED / đọc file |
| Phím tắt macro | Không có trong `user.keyscheme` | VERIFIED / đọc file |
| Gọi macro trên DAW thật | Nút Macro Toolbar / phím / MIDI device map theo tài liệu hãng; chưa thử | PARTIAL (nguồn: manual Fender Studio Pro 8.1) |
| Trạng thái mong đợi | Unmute NORM; Mute LOFI, REMIX; Unmute DELAY/VERB1/VERB2; không đổi Send | VERIFIED (file) / chưa chạy thật |
| Mute vs Send | Macro dùng Mute (tường minh); Send không bị macro đụng tới (INFERRED từ nội dung macro) | VERIFIED + INFERRED |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | Nút `NORM` có `PRESET_NORM`; chưa có mapping → `NOT_CONFIGURED` nhưng nút vẫn sáng | VERIFIED / mock |

#### LOFI — Studio One
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Macro | `LOFI.studioonemacro` | VERIFIED / đọc file |
| Phím tắt macro | Không có | VERIFIED / đọc file |
| Trạng thái mong đợi | Unmute LOFI; Mute NORM, REMIX; FX Unmute; không đổi Send | VERIFIED (file) / chưa chạy thật |
| Ghi chú âm thanh | Track LOFI trong bài mẫu có Pro EQ (lowcut 490 Hz, +3,4 dB @270 Hz, +4,2 dB @2,5 kHz, highcut 8,97 kHz) — chi tiết ở báo cáo 01; macro chỉ chuyển track, không chỉnh EQ | VERIFIED / đọc file |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | `PRESET_LOFI` → `NOT_CONFIGURED` khi chưa mapping, nút vẫn sáng | VERIFIED / mock |

#### RAP — Studio One
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Macro | `RAP.studioonemacro` — giống NORM nhưng **Mute VERB1 (State 1)**; DELAY/VERB2 Unmute | VERIFIED / đọc file |
| Phím tắt macro | Không có | VERIFIED / đọc file |
| Trạng thái mong đợi | Unmute NORM; Mute LOFI, REMIX; **Mute VERB1**; Send không đổi | VERIFIED (file) / chưa chạy thật |
| Mâu thuẫn RAP | Ở Studio One RAP làm tắt VERB1; ở Cubase bộ lọc PLE RAP nêu tên Verb1/Delay/Verb3. Không được coi hai DAW cùng một ý nghĩa | PARTIAL (xem 2.2) |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | `PRESET_RAP` → `NOT_CONFIGURED`, nút vẫn sáng | VERIFIED / mock |

#### REMIX — Studio One
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Macro | `REMIX.studioonemacro` | VERIFIED / đọc file |
| Phím tắt macro | Không có | VERIFIED / đọc file |
| Trạng thái mong đợi | Unmute REMIX; Mute NORM, LOFI; FX Unmute | VERIFIED (file) / chưa chạy thật |
| Ghi chú âm thanh | Track REMIX trong bài mẫu có MetaFlanger Stereo (preset nhị phân, tham số không đọc được) | VERIFIED (có plugin) / UNKNOWN (tham số) |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | Không có nút REMIX, không có `PRESET_REMIX`; phím tắt Setup "Chế độ Remix" chỉ `console.warn` | VERIFIED / đọc mã + mock |

**Điểm chung Studio One cần xác minh trên DAW thật (BLOCKED_USER_TEST):**
- Trong macro, lệnh `Mute` thuộc category `Track` ngay cả sau `Find Channel` (Console). Có tác động đúng kênh FX hay không: UNKNOWN.
- Tên chương trình/tên tiến trình của **Fender Studio Pro** trên Windows (PDL mặc định `Studio One.exe`): UNKNOWN (không tìm được nguồn xác nhận; xem `web-sources.txt`).
- Macro tìm track/kênh theo **tên** (`NORM`, `LOFI`, `REMIX`, `DELAY`, `VERB1`, `VERB2`); bài của Khói đặt tên khác thì macro không tìm thấy (INFERRED).

### 2.2 Cubase 13–15

#### NORM — Cubase
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Lệnh có phím | `NORMC` = F9 (Cubase 10–15) | VERIFIED / đọc file |
| Lệnh `NORM` (không "C") | Không có trong `Key Commands.xml` Cubase 13–15 | VERIFIED / đọc file |
| Nội dung PLE NORMC | Không có trong gói | BLOCKED (cần Khói xuất) |
| Trạng thái mixer sau lệnh | Không biết | UNKNOWN |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | `PRESET_NORM` → `NOT_CONFIGURED`; không có đường gửi phím F9 | VERIFIED / mock + đọc mã |

#### LOFI — Cubase
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Lệnh có phím | `LOFIC` = F10 | VERIFIED / đọc file |
| Lệnh `LOFI` | Đã đăng ký nhưng **không có phím** | VERIFIED / đọc file |
| Nội dung PLE LOFIC/LOFI | Không có trong gói | BLOCKED |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | `PRESET_LOFI` → `NOT_CONFIGURED` | VERIFIED / mock |

#### RAP — Cubase (RAP vs RAPC)
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Phím | Cubase 13–15: `RAP` = F11, `RAPC` = F12. Cubase 10–12: chỉ `RAPC` = F12 (F11 = REMIXC) | VERIFIED / đọc file |
| PLE `RAP.xml` vs `RAPC.xml` | Giống nhau trừ `Val` (RAP = 0, RAPC = 1); `Function=335`, `Type=4012`; `Value2` min 1/max 16/value 1 | VERIFIED / đọc file |
| Bộ lọc PLE | Lọc theo tên `Verb1`, `Delay`, `Verb3` (token 101/104/104/102; cách đọc "A hoặc B hoặc C" là suy luận) | PARTIAL |
| Ý nghĩa `Function=335`, `Type=4012`, `Val 0/1` | Chưa có bằng chứng; **không kết luận** (không suy ra "Val=0 là Mute") | UNKNOWN |
| Tên kênh khớp dự án | Dự án mẫu `PJ 01/02/03.cpr` có chuỗi "Vang 1/2/3", "Delay", nhưng không thấy "Verb1"/"Verb3" → bộ lọc PLE có thể không khớp dự án mẫu (chỉ so chuỗi) | PARTIAL |
| Khác biệt RAP vs RAPC trên mixer | Chưa biết | BLOCKED_USER_TEST (`CHECKLIST-C` mục C4) |
| Menu hiện tại | `PRESET_RAP` → `NOT_CONFIGURED`; Menu chỉ có 1 nút RAP (không phân RAP/RAPC) | VERIFIED / mock |

#### REMIX — Cubase
| Hạng mục | Nội dung | Nhãn / loại |
|---|---|---|
| PDL kích hoạt bằng gì | Không xác định được | UNKNOWN — BLOCKED |
| Phím | Cubase 13–15: `REMIX` và `REMIXC` **không có phím**. Cubase 10–12: `REMIXC` = F11 | VERIFIED / đọc file |
| Nội dung PLE REMIX/REMIXC | Không có trong gói | BLOCKED |
| Bằng chứng Cubase 13–15 gọi REMIX bằng phím | Không có | UNKNOWN |
| Kết quả DAW thật | Chưa có | BLOCKED_USER_TEST |
| Menu hiện tại | Không có nút/`PRESET_REMIX` | VERIFIED / đọc mã + mock |

**Không giả định Studio One và Cubase tạo cùng trạng thái mixer.** Studio One dùng macro đặt Mute theo tên track/kênh; Cubase dùng PLE (Project Logical Editor) lọc theo tên với `Function/Type/Val` chưa giải mã. Chưa có bằng chứng hai bên tương đương.

### 2.3 Cơ chế PDL (mục 3A) — bảng tổng hợp

| Câu hỏi | Trả lời | Nhãn |
|---|---|---|
| PDL gửi MIDI CC/Note, phím, macro hay cách khác cho từng preset? | Chưa biết | UNKNOWN — BLOCKED |
| Lệnh thực tế từng preset (số CC/Note/phím/macro)? | Chưa biết; không bịa | UNKNOWN — BLOCKED |
| Cấu hình mặc định vs tác giả khác nhau ở lệnh preset? | Không bản nào chứa lệnh preset; khác biệt chỉ ở DAW/cổng MIDI/mức núm/toạ độ/cửa sổ | VERIFIED |
| PDL có khả năng gửi MIDI, gửi phím tới cửa sổ Studio One, click toạ độ, "hành động Tùy biến" (hold/press, CC "Bật 127/Tắt 0")? | Có (chuỗi/hàm/thư viện) — chỉ là khả năng, không nói preset nào dùng | PARTIAL |
| Điểm chỉ xác minh bằng PDL chạy thật | (a) PDL gửi gì khi bấm từng nút (bắt MIDI + quan sát phím); (b) file/định dạng `mode_overrides`; (c) macro Studio One được gọi bằng phím, MIDI hay cách khác; (d) Cubase: F9–F12 hay CC | BLOCKED_USER_TEST (`CHECKLIST-A`) |

Chi tiết và lý do từng bằng chứng không đủ: `PDL-PRESET-VERIFY-03/pdl-activation-evidence-review.txt`.

---

## 3. Dữ liệu còn thiếu và cách lấy

| # | Dữ liệu cần | Vì sao cần | Cách lấy (không cần lập trình) | Nhãn |
|---|---|---|---|---|
| M1 | Nhật ký MIDI/phím khi bấm NORM/LOFI/RAP/REMIX trong PDL thật | Xác định PDL gửi gì | `CHECKLIST-A` (phần mềm theo dõi MIDI miễn phí nghe cổng loopMIDI; bấm từng nút 2 lần; chụp) | BLOCKED_USER_TEST |
| M2 | File `mode_overrides` (tên/vị trí/nội dung) và thư mục dữ liệu PDL sau khi bấm | Biết ghi đè nút chế độ lưu ở đâu, chứa gì | `CHECKLIST-A` bước 4 và 8 (sắp xếp theo ngày sửa trong `%APPDATA%\PDL-STUDIO\auto-menu-ai-s1`; **che mục `[LICENSE]` và mã bản quyền** trước khi gửi) | BLOCKED |
| M3 | `config.ini` đang dùng trên máy Khói (đã che bản quyền) | So với config tác giả/mặc định | Chép file, che mục `[LICENSE]` | BLOCKED |
| M4 | Tên chương trình, phiên bản, tên tiến trình của Studio One/Fender Studio Pro | PDL mặc định `Studio One.exe`; Fender Studio Pro chưa xác minh | `CHECKLIST-B` B0 | BLOCKED_USER_TEST |
| M5 | Ảnh Macro Organizer, cột Shortcut, Macro Toolbar, device map External của Console | Biết macro đang gọi bằng cách nào trên máy Khói | `CHECKLIST-B` B1 | BLOCKED_USER_TEST |
| M6 | Ảnh mixer trước/sau từng macro (Mute, Send, fader) | Xác nhận macro tác động Mute/Send thật | `CHECKLIST-B` B2–B3 | BLOCKED_USER_TEST |
| M7 | **PLE còn thiếu từ Cubase:** `NORMC`, `LOFIC`, `REMIXC`, `REMIX`, `NORM`, `LOFI`, `RESET` (nếu có) + ảnh toàn bộ danh sách preset PLE; đối chiếu `RAP`/`RAPC` trên máy với bản trong gói | Biết lệnh F9/F10/F12/REMIX làm gì | `CHECKLIST-C` C2 (ảnh cửa sổ Project Logical Editor từng preset; file `*.xml` trong `Steinberg\Cubase\User Presets\Project Logical Editor` — đường dẫn suy ra từ cấu trúc gói, INFERRED; tìm `RAP.xml` trong `%APPDATA%\Steinberg` để biết thư mục thật) | BLOCKED |
| M8 | `Key Commands` thật trên Cubase của Khói (F9–F12, NORM/LOFI/REMIX…) và lệnh Cubase mặc định trùng F9–F12 | Xác nhận khớp gói, phát hiện xung đột | `CHECKLIST-C` C1 | BLOCKED_USER_TEST |
| M9 | Ảnh mixer Cubase trước/sau F9–F12 (Mute, Send), lặp 2 lần | Xác nhận trạng thái mixer và tính lặp lại | `CHECKLIST-C` C3–C4 | BLOCKED_USER_TEST |
| M10 | Quyết định của Khói: preset dùng Mute, Send hay cả hai (báo cáo **không** chọn thay) | Cần trước thiết kế triển khai | Khói quyết định sau khi có kết quả M6/M9 | BLOCKED (quyết định của Khói) |

Các tệp tạm của DAW/PDL có thể chứa tên máy/đường dẫn cá nhân; chỉ gửi phần cần thiết và che mã bản quyền.

---

## 4. Checklist kiểm thử thực tế cho Khói

Ba checklist điền sẵn bảng ghi, nằm trong thư mục bằng chứng (mở bằng Notepad/Word):

| File | Dùng để |
|---|---|
| `PDL-PRESET-VERIFY-03/CHECKLIST-A-PDL-bat-lenh-that.md` | Bắt lệnh thật PDL gửi khi bấm 4 nút (MIDI/phím/khác) |
| `PDL-PRESET-VERIFY-03/CHECKLIST-B-StudioOne-FenderStudioPro.md` | Macro NORM/LOFI/RAP/REMIX: có gì, gọi cách nào, trạng thái track/FX trước–sau, Mute và Send kiểm riêng, chạy lặp |
| `PDL-PRESET-VERIFY-03/CHECKLIST-C-Cubase-13-15.md` | Key Commands F9–F12, xuất PLE thiếu, trạng thái mixer, RAP vs RAPC, chạy lặp |

**Tóm tắt thao tác chính:**
1. (A) Mở phần mềm theo dõi MIDI nghe cổng loopMIDI → bấm NORM, LOFI, RAP, REMIX trong PDL (mỗi nút 2 lần) → chụp nhật ký → xem file nào trong thư mục dữ liệu PDL đổi giờ sửa.
2. (B) Trên Studio One/Fender Studio Pro: mở Macro Organizer chụp 4 macro + cột Shortcut; chạy từng macro bằng **chuột** (không dùng phím), ghi Mute của 3 track + 3 kênh FX và Send trước/sau; chạy lại lần 2; chỉnh Send tay rồi chạy macro để xem Send có đổi không.
3. (C) Trên Cubase: File > Key Commands tìm NORM/LOFI/RAP/REMIX/RESET; chụp từng preset trong Project Logical Editor; nhấn F9–F12 (2 lần mỗi phím) và ghi Mute/Send mixer; so RAP (F11) với RAPC (F12) từ cùng trạng thái xuất phát.
4. Không điền thì mọi mục giữ `BLOCKED_USER_TEST`.

---

## 5. Ma trận rủi ro và điều kiện nghiệm thu trước khi triển khai Menu

Chỉ báo cáo và đề xuất điều kiện nghiệm thu; **không sửa** trong task này. Các số dòng theo mã hiện tại (blob khớp `main`).

| ID | Rủi ro | Bằng chứng (loại) | Mức | Nhãn | Điều kiện nghiệm thu đề xuất |
|---|---|---|---|---|---|
| R1 | Nút sáng dù `executeAction()` trả `NOT_CONFIGURED`/`NO_DEVICE` | `renderer.js:509-519`: click → bỏ `.active` mọi nút, thêm `.active` cho nút bấm, `saveData()`, rồi mới `executeAction(...)` (không chờ/không dùng kết quả để sáng nút). Probe mock R1a: nút LOFI sáng + `{"ok":false,"reason":"NOT_CONFIGURED"}`; R1b: sáng + `NO_DEVICE`; R1c (đối chứng, CC giả): sáng + `SUCCESS` (đọc mã + mock) | Cao | VERIFIED | Nút chỉ hiển thị "đã gửi" khi kết quả gửi thành công; `NOT_CONFIGURED`/`NO_DEVICE` hiển thị trạng thái lỗi/chưa cấu hình rõ ràng; có test hồi quy cho 3 kết quả. Sáng nút ≠ DAW đã nhận (README đã nêu). |
| R2 | Khôi phục preset khi mở app chỉ sáng nút, không gửi lệnh tới DAW | `renderer.js:1701` (lưu `preset`), `:1750-1757` (khôi phục chỉ `.classList`). Probe mock R2: nút RAP sáng sau restore, `executeAction` gọi 0 lần, MIDI giả gửi 0 | Trung bình–Cao | VERIFIED | Sau khởi động, trạng thái hiển thị khớp trạng thái DAW thật (hoặc hiển thị "chưa đồng bộ/không rõ"); không tự bật preset nào mà DAW chưa ở trạng thái đó; nếu cần đồng bộ, Khói duyệt hành vi (gửi lại hay không). |
| R3 | Không có đường gửi phím tắt cho preset | `actionRegistry.js:186-246`: chỉ nhánh MIDI (CC/Note) và chuột (`ACTION_COORDINATE_KEY` chỉ DAW_PLAY/STOP/RECORD, dòng 92); từ "Hotkey" chỉ trong chú thích. `core/command-engine-js/runtime.js:10-18` (chú thích) và phần wiring chỉ nối nhóm Transport; nhóm Preset "được LƯU nhưng KHÔNG được dispatch". `HotkeyDriver` có tồn tại (`runtime.js:23,334`) nhưng không nối preset. Phím "tự định nghĩa" ở `renderer.js:2518-2531` chỉ **bấm nút trong Menu**, không gửi phím tới DAW | Cao nếu cơ chế đúng là phím (Cubase F9–F12) | VERIFIED (mã) | Chỉ làm sau khi M1/M5/M8 xác định cơ chế (MIDI hay phím) cho từng DAW; phím chỉ gửi tới đúng cửa sổ DAW; có test mock + test thật trên DAW. |
| R4 | Không có `PRESET_REMIX` | `actionRegistry.js:47-49` (chỉ NORM/LOFI/RAP); `ui/index.html:112-114` 3 nút; `renderer.js:2524-2531` `remix` chỉ `console.warn`; `setup.js:622-624` hàng PRESET chỉ 3 cái; Setup vẫn có ô phím "Chế độ Remix" (`setup.html:76`, `setup.js:807`). Mock R3: `ACTIONS` không có `PRESET_REMIX`, `remix()` không gọi `executeAction` | Trung bình | VERIFIED | Chỉ thêm REMIX **khi Khói duyệt** (và duyệt thay đổi giao diện); ánh xạ REMIX phải dựa lệnh đã xác minh (Studio One macro REMIX; Cubase chưa có bằng chứng REMIX có phím). |
| R5 | Xung đột: preset Mute FX vs FX Auto điều khiển Send | FX Auto: `renderer.js:573-656` (`actions: FX_SEND_REVERB/FX_SEND_DELAY`, chế độ `fxAutoMidiMode` `toggle`/`absolute` `:570-586`); registry chỉ có action Send FX (`actionRegistry.js:76-77`), **chưa có action Mute FX**. Macro Studio One đặt Mute FX, Send không đổi (file). Chưa có bằng chứng DAW về tương tác | Trung bình | INFERRED | Có quy tắc rõ ai thắng khi cùng lúc (Khói quyết định); khi preset Mute FX, FX Auto không "bật lại" Send gây hiểu nhầm; test mock tổ hợp + test DAW thật theo `CHECKLIST-B` B3. Không chọn Mute hay Send thay Khói. |
| R6 | Mute macro có thể không tác động kênh FX (lệnh `Mute` thuộc category `Track` sau `Find Channel`) | `studioone-macro-state-table.txt` | Trung bình | UNKNOWN | `CHECKLIST-B` B3 phải cho thấy kênh VERB1 thực sự Mute/Unmute sau macro RAP/NORM. |
| R7 | Tên track/kênh phải khớp tên trong macro/PLE | Macro tìm theo tên `NORM/LOFI/REMIX/DELAY/VERB1/VERB2`; PLE RAP lọc `Verb1/Delay/Verb3`; dự án Cubase mẫu có "Vang 1/2/3","Delay" | Trung bình | PARTIAL | Xác nhận trên dự án thật của Khói tên khớp; nếu không, lệnh không làm gì (không báo lỗi). |
| R8 | Tên tiến trình Fender Studio Pro khác `Studio One.exe` | `config.ini` mặc định `daw = Studio One.exe`; không tìm được nguồn cho Fender Studio Pro | Thấp–Trung bình | UNKNOWN | `CHECKLIST-B` B0 ghi tên tiến trình thật trước khi thiết kế nhận diện DAW. |
| R9 | Giá trị MIDI/Send chưa rõ ánh xạ dB | CC→dB phụ thuộc DAW; chưa kiểm | Thấp (nếu dùng Mute) | UNKNOWN | Nếu dùng Send, đo bảng CC→dB trên DAW thật trước. |
| R10 | Registry gửi giá trị mặc định 127 cho nút (không `context.value`) | `actionRegistry.js:196` (chú thích) và đường `value ?? 127` | Thấp | VERIFIED (mã) | Nếu lệnh MIDI của PDL cần giá trị khác 127/0, mapping phải nêu rõ; không mặc định. |

**Điều kiện nghiệm thu chung trước khi cho phép triển khai Menu:**
1. Có bằng chứng DAW thật (ảnh/nhật ký) cho **từng preset × từng DAW** sẽ triển khai (đã điền checklist B/C).
2. Cơ chế PDL (hoặc cơ chế chọn thay thế) cho từng preset được ghi rõ MIDI/Note/phím/macro, không số bịa; nếu khác PDL, Khói duyệt.
3. Khói đã quyết định Mute / Send / cả hai (M10).
4. Mapping chỉ do người dùng khai báo (`USER_DEFINED`) hoặc dựa số đã xác minh; không CC/Note/phím mặc định chưa kiểm.
5. Hành vi nút khi `NOT_CONFIGURED`/`NO_DEVICE` và khi khởi động lại được Khói duyệt (R1, R2).
6. Test tự động (mock) cho từng nhánh + test thật trên DAW, báo cáo phân biệt rõ.

---

## 6. Việc được phép làm tiếp theo và việc chưa được phép

**Được phép (sau khi Khói xem báo cáo và phê duyệt từng bước):**
- Khói chạy các checklist A/B/C và gửi ảnh/nhật ký/file PLE/`config.ini` (đã che bản quyền).
- Claude A phân tích dữ liệu Khói gửi (nhật ký MIDI, `mode_overrides`, PLE) để xác định lệnh thật — task nghiên cứu mới.
- Sau khi có dữ liệu: viết **đề xuất triển khai** (không mã) để Khói duyệt.
- Mở task triển khai riêng, chỉ khi Khói phê duyệt rõ ràng.

**Chưa được phép:**
- Sửa mã Menu, `ui/index.html`, giao diện, cấu hình chạy, test, báo cáo cũ.
- Thêm nút/action REMIX, thêm đường gửi phím, đổi cách sáng nút, đổi khôi phục preset.
- Tự đặt số CC/Note/phím cho preset; tự chọn Mute hay Send thay Khói.
- Tuyên bố preset "hoạt động" khi chưa có bằng chứng DAW thật.
- Nghiên cứu/thiết kế/thêm DÂN CA.
- Commit triển khai hoặc push.

---

## 7. Danh sách file bằng chứng và nguồn đối chiếu

### 7.1 File mới tạo trong task này
| File | Nội dung |
|---|---|
| `tools/algbench/reports/PDL-PRESET-VERIFY-03-REPORT.md` | Báo cáo này |
| `…/PDL-PRESET-VERIFY-03/pdl-activation-evidence-review.txt` | 3A: bằng chứng cơ chế kích hoạt (đủ/không đủ), `mode_overrides` |
| `…/PDL-PRESET-VERIFY-03/config-default-vs-author.txt` | So sánh `config.ini` mặc định vs tác giả (sinh bằng script từ file gốc; không chép `[LICENSE]`) |
| `…/PDL-PRESET-VERIFY-03/studioone-macro-state-table.txt` | Bảng trạng thái macro, trích lại từ 10 file macro |
| `…/PDL-PRESET-VERIFY-03/f-key-conflict-scan.txt` | Quét phím F Cubase 10–15 + keyscheme Studio One 5–7 |
| `…/PDL-PRESET-VERIFY-03/menu-preset-ui-probe.js` + `.output.txt` | Probe **mock** (trích nguyên văn mã `renderer.js` + `actionRegistry.js`, DOM giả, MIDI giả). Chạy: `node tools/algbench/reports/PDL-PRESET-VERIFY-03/menu-preset-ui-probe.js .` tại thư mục gốc repo |
| `…/PDL-PRESET-VERIFY-03/web-sources.txt` | Nguồn web (manual Fender Studio Pro) |
| `…/PDL-PRESET-VERIFY-03/CHECKLIST-A-PDL-bat-lenh-that.md` | Checklist bắt lệnh PDL thật |
| `…/PDL-PRESET-VERIFY-03/CHECKLIST-B-StudioOne-FenderStudioPro.md` | Checklist Studio One/Fender Studio Pro |
| `…/PDL-PRESET-VERIFY-03/CHECKLIST-C-Cubase-13-15.md` | Checklist Cubase 13–15 |

### 7.2 Bằng chứng/báo cáo cũ được dùng (không sửa)
`tools/algbench/reports/PDL-PRESET-RESEARCH-01-REPORT.md` và thư mục `PDL-PRESET-RESEARCH-01/` (macro, PLE RAP/RAPC, mixer, CC map); `PDL-PRESET-RESEARCH-02-REPORT.md` và `PDL-PRESET-RESEARCH-02/` (`menu-code-evidence.txt`, `menu-dispatch-probe.js/.output.txt`, `cubase-keycommands-preset-bindings.txt`, `studioone-keyscheme-macro-bindings.txt`, `pdl-trigger-evidence.txt`, `github-main-check.txt`).

### 7.3 Nguồn đối chiếu
- Gói PDL `auto-menu-ai-s1.zip` (`version.dat` = 14.7.9-PDL-STUDIO): `config.ini`, `lib/core_logic.pyd` (sha256 `5ddfedc0…98ad64f1`), `data/dcm.zip`, `data/adt.zip`, `data/*.midiremote`, `MAPPING.png`.
- GitHub `anhtuan391989/AUTO_MENU_AI` `main` HEAD `5880a1b9…` (commit `71c6ef1b`, `5880a1b9`: README; `README.md` mục "Quy định bắt buộc dành cho Claude và các AI agent").
- Mã Menu: `ui/js/renderer.js`, `ui/js/actionRegistry.js`, `ui/js/setup.js`, `ui/index.html`, `ui/setup.html`, `core/command-engine-js/runtime.js`.
- [Fender Studio Pro manual — Macro Toolbar](https://fenderstudiopromanual.fender.com/en/Content/Editing_Topics/Macro_Toolbar.htm), [Key Commands](https://fenderstudiopromanual.fender.com/en/Content/Fundamentals_Topics/Key_Commands.htm) (v8.1; `PARTIAL`, chưa thử trên máy Khói).

---

## 8. HƯỚNG DẪN SAO CHÉP / SỬ DỤNG GÓI BÀN GIAO

Task này **chỉ tạo báo cáo và bằng chứng nghiên cứu**: **không có file triển khai cần thay thế**, **không có ZIP triển khai bắt buộc**, **không có lệnh cài đặt**. ZIP đi kèm chỉ là bản gói tiện tải về của chính báo cáo + bằng chứng; mọi file đều là **thêm mới, không ghi đè** file nào có sẵn.

1. **ZIP cần tải:** `PDL-PRESET-VERIFY-03-HANDOVER.zip` (đính kèm trong cuộc trò chuyện, **không** đặt trong repo để tránh trùng lặp).
2. **Sao lưu:** không cần (không ghi đè). Nếu muốn an toàn, sao lưu thư mục `G:\AUTO_MENU_AI\tools\algbench\reports\`.
3. **Giải nén vào:** thư mục gốc `G:\AUTO_MENU_AI\` (ZIP đã chứa sẵn đường dẫn `tools\algbench\reports\...`).
4. **Nội dung ZIP và vị trí:**
   - `tools\algbench\reports\PDL-PRESET-VERIFY-03-REPORT.md` (file mới)
   - `tools\algbench\reports\PDL-PRESET-VERIFY-03\` (thư mục mới, gồm 10 file ở mục 7.1)
5. **Thay thế hay thêm mới:** toàn bộ là thêm mới; không ghi đè.
6. **Cách chạy:** không cần chạy gì. Mở báo cáo `.md` bằng Notepad hoặc trình xem Markdown; mở `CHECKLIST-*.md` để điền. (Tuỳ chọn cho người có Node.js: chạy lại probe mock bằng `node tools\algbench\reports\PDL-PRESET-VERIFY-03\menu-preset-ui-probe.js .` trong thư mục `G:\AUTO_MENU_AI`; kỳ vọng in ra các dòng R1a/R1b/R1c, R2, R3 giống file `.output.txt`. Không cần cho nghiệm thu.)
7. **Dấu hiệu thành công:** thấy file `PDL-PRESET-VERIFY-03-REPORT.md` và thư mục `PDL-PRESET-VERIFY-03` trong `G:\AUTO_MENU_AI\tools\algbench\reports\`; Auto-push của Khói tự đẩy lên GitHub (báo cáo này không push).
8. **Khôi phục nếu lỗi:** xoá file/thư mục vừa chép (không đụng file cũ) hoặc dùng bản sao lưu ở bước 2.
9. **Yêu cầu phụ thuộc:** không (probe tuỳ chọn cần Node.js).

---

## Claude A : Task A: PDL-PRESET-VERIFY-03 — Xác minh thực tế preset NORM/LOFI/RAP/REMIX trên Studio One/Fender Studio Pro và Cubase 13–15

**1. File nào đã sửa.**
- **Đã tạo mới (11 file, đều trong `tools/algbench/reports/`):** `PDL-PRESET-VERIFY-03-REPORT.md` và thư mục `PDL-PRESET-VERIFY-03/` gồm `pdl-activation-evidence-review.txt`, `config-default-vs-author.txt`, `studioone-macro-state-table.txt`, `f-key-conflict-scan.txt`, `menu-preset-ui-probe.js`, `menu-preset-ui-probe.output.txt`, `web-sources.txt`, `CHECKLIST-A-PDL-bat-lenh-that.md`, `CHECKLIST-B-StudioOne-FenderStudioPro.md`, `CHECKLIST-C-Cubase-13-15.md`.
- **Không sửa:** mã Menu (`ui/js/*`, `ui/index.html`, `ui/setup.html`, `core/*`), HTML/UI, cấu hình chạy, test, báo cáo cũ (RESEARCH-01/02 và các báo cáo khác). Không commit, không push.

**2. Vì sao sửa.**
- Theo task VERIFY-03: kiểm tra GitHub `main` (HEAD `5880a1b9`, mã không đổi, chỉ README), đối chiếu báo cáo 01/02 với mã hiện tại, xác minh cơ chế PDL kích hoạt 4 preset, chuẩn bị kiểm thử Studio One/Fender Studio Pro và Cubase 13–15, và lập danh sách rủi ro Menu kèm điều kiện nghiệm thu — tất cả ở mức nghiên cứu.
- Kết quả cốt lõi: cơ chế PDL gửi lệnh cho từng preset là `UNKNOWN — BLOCKED` (không có bằng chứng đủ trong gói); nội dung macro Studio One và phím F9–F12 Cubase là `VERIFIED` (đọc file); 5 rủi ro Menu được xác nhận ở mức mã/mock; không preset nào được tuyên bố đã hoạt động (`BLOCKED_USER_TEST`).

**3. Có ảnh hưởng module nào không.**
- Không. Chỉ thêm tài liệu và probe mock chạy ngoài ứng dụng (không được `require`/nạp bởi Menu). Không thay đổi hành vi Menu, FX Auto, MIDI, nút preset, giao diện hay test.

**4. Còn việc gì chưa làm.**
- `BLOCKED` / `BLOCKED_USER_TEST` (cần Khói): bắt lệnh MIDI/phím thật của PDL cho NORM/LOFI/RAP/REMIX và file `mode_overrides` (`CHECKLIST-A`); trạng thái mixer thật trước/sau từng macro Studio One, kiểm Mute vs Send riêng, tên tiến trình Fender Studio Pro (`CHECKLIST-B`); Key Commands thật, xuất PLE `NORMC/LOFIC/REMIXC/REMIX/NORM/LOFI/RESET` và trạng thái mixer Cubase, phân biệt RAP/RAPC (`CHECKLIST-C`).
- `UNKNOWN` chưa giải: ý nghĩa `Function=335`, `Type=4012`, `Val=0/1`; Mute macro có tác động đúng kênh FX hay không; cách PDL thực sự gọi macro Studio One.
- Quyết định của Khói: Mute / Send / cả hai cho từng preset (báo cáo không chọn thay).
- Chưa chuyển sang task triển khai; chờ Khói xem báo cáo và phê duyệt bước tiếp theo.
