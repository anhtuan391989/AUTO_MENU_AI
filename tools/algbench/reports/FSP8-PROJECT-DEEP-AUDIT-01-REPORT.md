# FSP8-PROJECT-DEEP-AUDIT-01 — Phân tích project Fender Studio Pro 8 phục vụ AUTO_MENU_AI

**Trạng thái cuối: `BLOCKED_USER_TEST`** — đã đọc xong toàn bộ file project (chỉ đọc), nhưng **chưa có bất kỳ test chạy thật nào** với FSP8, nên **chưa được tuyên bố hoàn tất tích hợp**. Không có mục nào đạt `VERIFIED_RUNTIME`.

**Cập nhật (22/10):** `T2.song` là bản đang làm việc (không sạch); bộ file sạch `save new 2.1`/`T2b`/`T2c` cho thấy khi Khói bật FX, **7/7 Send** của `Group Mic` đổi `bypass` 1→0 (`level` không đổi), còn mute bus `Delay` là trường riêng. **Khói cho biết: thường bật/tắt FX bằng Send của `Group Mic`, không dùng Mute trên các kênh FX** (`VERIFIED_USER_STATEMENT`) ⇒ đích điều khiển FX mặc định = Send On/Off, không phải mute bus. Chiều `0=bật` vẫn `INFERRED`. Chi tiết: `FSP8-PROJECT-DEEP-AUDIT-01/06-T2-RESULT.md`.

Task chỉ phân tích/báo cáo. Không viết code, không sửa mã nguồn AUTO_MENU_AI, không sửa/lưu project FSP8, không tạo mapping MIDI/preset/macro, không commit/push.

## 1. Tóm tắt dễ hiểu (cho người không lập trình)
1. **Project của Khói có gì:** 3 track (`Beat`, `Mic`, `Không Dây`), 1 bus gom giọng `Group Mic`, 4 bus hiệu ứng `Verb ngắn`, `Verb dài`, `Delay`, `Com Verb`, kênh `Main`. Giọng đi qua `Group Mic`; `Beat` đi thẳng ra `Main`.
2. **FX Send:** `Group Mic` có 7 Send (01–06, 08) tới các bus hiệu ứng (và 2 Send "sidechain" vào bộ gate). **Cả 7 Send đang lưu `bypass=1`.** File **không có** trường nào tên "On/Off" cho Send; "bypass=1 nghĩa là Send đang tắt" chỉ là **suy luận (`INFERRED`)**, chưa chứng minh.
3. **Bốn bus hiệu ứng là bus thường (`AudioGroupChannel`), không phải "FX Channel"** như project mẫu của PDL. Chúng bị ẩn trong mixer.
4. **Tên plugin không nói lên chức năng:** insert tên `Lofi` thực ra là EQ Pro-Q 3; `IL Gross Beat` đang nạp preset tên `Remix`. Cả 3 insert (`Lofi`, `IL Gross Beat`, `PanCake2`) đang bypass.
5. **Project không chứa Macro, phím tắt, hay ánh xạ MIDI nào.** Chỉ có 2 External Device tên `loop` và `AUTO MENU AI` được khai báo nhưng **không có lệnh gán**. Vì vậy **không thể** nói PDL dùng CC/Note/phím từ file này.
6. **Cách Menu bật/tắt Send trong FSP8 hiện là `UNKNOWN`.** Muốn biết phải test thật (kế hoạch ở `05`).
7. **Preset NORM/LOFI/RAP/REMIX trên project này chưa thể định nghĩa** — chưa có định nghĩa từ Khói, và PDL (Studio One 5) làm khác (mute track/FX channel NORM/LOFI/REMIX, DELAY/VERB1/VERB2) mà project Khói không có.
8. **Log Menu đã đọc:** FX Auto luôn trả `NOT_CONFIGURED` ⇒ Menu chưa từng gửi lệnh Send nào tới DAW trong các log đó.

## 2. Đầu vào và phạm vi kiểm tra
| Hạng mục | Giá trị |
|---|---|
| GitHub `main` HEAD đã kiểm | `29d0f780` (nền chuẩn, không dùng sandbox cũ) |
| `Project FSF8.zip` | upload của Khói; SHA-256 `6b6487b4dc4c6c5bcf1e09f0dcad30bb6b0e0130d8043f26579a38e609d05764`; **trùng byte** với bản trên `main` (blob `3fbf4f88…`) |
| Session đọc | `save new 2.1.song` (zip XML; Generator `Studio Pro/8.0.0.110141`, FormatVersion 9; ghi file 2026-10-20) |
| Đã đọc | `Devices/audiomixer.xml`, `mixerconsole.xml`, `surfacemanager.xml`, `audioiomanager.xml`, `Song/song.xml`, `Presets/Channels/*`, `Envelopes/*`; quét từ khóa điều khiển ngoài trên mọi XML/txt |
| Tài liệu cũ | `PDL-PRESET-VERIFY-06-REPORT.md` + `PDL-PRESET-VERIFY-06/` |
| Mã Menu (chỉ đọc) | `actionRegistry.js`, `renderer.js`, `audioSource.js` trên `29d0f780` |
| Log Menu | 6 file `logs/*.jsonl` mới nhất; **182 file cũ hơn chưa đọc** |

Đã mở được toàn bộ file → **không có `BLOCKED` ở bước đọc**.
**Giới hạn phân tích:**
- Mọi số liệu là **trạng thái lúc lưu file**, không phải trạng thái đang chạy trong DAW.
- Preset VST3 (`.vstpreset`) và VST2 (`.fxb`) không đọc được nội dung ⇒ không biết cấu hình reverb/lofi/Gross Beat bên trong plugin. Chỉ plugin native (`Analog Delay`, `Compressor`, `Console Shaper`) đọc được tham số.
- Không biết thiết bị âm thanh đang dùng, tên `.exe` của FSP8, phiên bản Menu Khói đang chạy, và macro/phím/External đã cấu hình trên máy Khói (nằm ngoài file session).

## 3. Trả lời 8 câu hỏi
| # | Câu hỏi | Trả lời | Nhãn |
|---|---|---|---|
| 1 | Cơ chế bật/tắt từng Send của `Group Mic`? | Trường đổi khi Khói bật/tắt FX là `Send.bypass` (gốc =1 cả 7; T2b/T2 =0; `level` không đổi) — `VERIFIED_FILE`. Khói xác nhận dùng Send của `Group Mic` để bật/tắt FX — `VERIFIED_USER_STATEMENT`. Chiều `0=bật` `INFERRED`; bật **riêng một** Send chưa kiểm (7 Send đổi cùng lúc). **Cách gửi lệnh từ ngoài vào FSP8 vẫn chưa biết** | `VERIFIED_FILE` / `VERIFIED_USER_STATEMENT` / `INFERRED` / `UNKNOWN` |
| 2 | Đổi từng mức Send mà không ảnh hưởng Mute bus / bypass plugin? | Trong file, `Send.level`, `AudioGroupChannel.mute`, `Insert.bypass` là ba trường riêng: T2b đổi `bypass` mà `level` giữ nguyên; T2c đổi `mute` bus mà Send không đổi — `VERIFIED_FILE`. Điều khiển riêng từng cái từ ngoài: chưa biết (T3, T4, T7) | `VERIFIED_FILE` (tách riêng) / `UNKNOWN` (điều khiển) |
| 3 | Bật/tắt bus `Verb ngắn`, `Verb dài`, `Delay`, `Com Verb`? | Mỗi bus có `mute` riêng (T2c: `Delay` 0→1 mà Send không đổi — `VERIFIED_FILE`). **Khói không dùng Mute kênh FX để bật/tắt FX** (`VERIFIED_USER_STATEMENT`) ⇒ Mute bus chỉ là tuỳ chọn phụ; cách điều khiển từ ngoài và việc macro `Mute` của PDL có áp dụng cho bus `AudioGroupChannel` hay không: `UNKNOWN` (T4, T6). Bus nay hiện trong mixer ở T2b/T2c, nên click toạ độ có thể khả thi hơn nhưng vẫn mong manh | `VERIFIED_FILE` / `VERIFIED_USER_STATEMENT` / `UNKNOWN` |
| 4 | FX Auto bật sau 1 s có nhạc, tắt sau 1 s im, giữ thủ công 1 phút? | Mã Menu: xác nhận nhạc 500 ms (≈0,5–0,7 s), im lặng 1000 ms (≈1,0–1,15 s), giữ thủ công 60 000 ms. **Logic thời gian có trong mã nhưng chưa đo thật**, và quan trọng hơn **chưa có đường gửi Send tới FSP8** (log toàn `NOT_CONFIGURED`) | mã: `VERIFIED_FILE`; hành vi: `UNKNOWN` (T9) |
| 5 | Hành động NORM/LOFI/RAP/REMIX trên project này; cái gì chưa xác định? | Xem `03`. Ứng viên: LOFI = bypass `Lofi`(Pro-Q 3); REMIX = bypass `IL Gross Beat`(+`PanCake2`?); RAP = giảm reverb ở bus nào đó (không đoán); NORM = ? **Không xác định được** nếu Khói chưa định nghĩa; tên plugin không phải bằng chứng | `INFERRED` / `UNKNOWN` |
| 6 | Bằng chứng PDL kích hoạt preset thế nào? | **Không có** trong session FSP8. PDL: chưa có log thật (VERIFY-06). Cần dữ liệu ở `04` mục E và `PDL-PRESET-VERIFY-06/02` | `UNKNOWN` |
| 7 | Mô hình preset dùng chung FSP8/Cubase? | Preset = danh sách bước cấu hình do người dùng khai (đối tượng theo **tên hiển thị + loại + chủ**, giá trị tuyệt đối, cơ chế gửi theo driver). Không giả định cùng track/plugin/lệnh. Mỗi DAW/phiên bản = 1 driver (`03` mục D, `05` mục A) | đặc tả |
| 8 | Danh sách test tối thiểu trước khi code? | T0–T10 ở `05` mục C | kế hoạch |

## 4. File đã tạo (tất cả mới, nằm trong `tools/algbench/reports/`)
- `FSP8-PROJECT-DEEP-AUDIT-01-REPORT.md` (file này)
- `FSP8-PROJECT-DEEP-AUDIT-01/01-TRACK-ROUTING-MAP.md`, `02-FX-SEND-BUS-PLUGIN-MAP.md`, `03-PRESET-MAPPING.md`, `04-MIDI-EXTERNAL-CONTROL-EVIDENCE.md`, `05-INTEGRATION-AND-TEST-PLAN.md`, `06-T2-RESULT.md` (kết quả T2/T2b/T2c; evidence `t2-diff.txt`, `t2b-t2c-diff.txt`)
- `FSP8-PROJECT-DEEP-AUDIT-01/evidence/` (bảng trích từ session; machineID và đường dẫn riêng đã che)
- `FSP8-PROJECT-DEEP-AUDIT-01/tools/fsp8_audit_dump.py` (script **chỉ đọc**, chạy lại được: `python3 -I fsp8_audit_dump.py <thư_mục_đã_giải_nén> <thư_mục_ra>`)
- `FSP8-PROJECT-DEEP-AUDIT-01/FSP8-PROJECT-DEEP-AUDIT-01-HANDOVER.zip`

Không bao gồm `Project FSF8.zip` trong gói bàn giao (đã có sẵn trên `main`).

## 5. Việc Khói làm tiếp (theo thứ tự ưu tiên; chỉ trên **bản sao** project, che dữ liệu riêng)
1. **T2b/T2c (đã nhận, sạch):** Khói xác nhận: trong `save new 2.1` các Send đang **Tắt** và trong `T2b` đang **Bật**? Nếu muốn tách riêng từng Send: từ `save new 2.1` chỉ bật **Send04** → Save As `T2d.song` (rồi bật thêm Send01 → `T2e.song`).
2. **T3/T4:** đổi riêng mức Send04; mute bus `Delay`; bypass `Lofi` — mỗi việc lưu 1 file `.song`.
3. **T6/T7:** chụp Macro Organizer (tìm lệnh `Send`, `Bypass`, `Mute`), panel External (`loop`, `AUTO MENU AI`), Keyboard Shortcuts.
4. **T0/T1:** tên `.exe` + phiên bản FSP8; ảnh Console (7 Send, 4 bus, 3 insert).
5. **Trả lời 6 câu hỏi ở `03` mục E** (preset trên project này nghĩa là gì; Send nào là Reverb/Delay; FX Auto xử lý ra sao khi bấm preset).
6. **T9/T10:** thu log FX Auto (bật/tắt nhạc 3 lần + 1 lần bấm tay) và log PDL thật.

## 6. Vấn đề phát hiện (đáng chú ý)
- Send08 **không có UID riêng**; Send07 không tồn tại → khoá theo UID không đủ, phải dùng tên.
- Bus `Delay` chứa **cả reverb và delay** → tên bus ≠ chức năng duy nhất.
- Menu chỉ có 2 hành động Send (`FX_SEND_REVERB`, `FX_SEND_DELAY`) và chế độ mặc định `toggle` (đảo trạng thái, không phản hồi) ⇒ dễ lệch trạng thái với DAW khi preset và FX Auto cùng can thiệp; ưu tiên lệnh **tuyệt đối** nếu DAW cho phép.
- Menu chưa có action cho Mute bus, mức Send, bypass insert, REMIX.
- Sidechain Send05/06 cấp cho `C1 gate` của reverb: nếu chỉ bật Send01/02 mà không bật 05/06, gate có thể không mở — chưa biết (T5).

## 6b. Ghi nhận cách làm việc của Khói (22/10, `VERIFIED_USER_STATEMENT`)
Khói thường bật/tắt FX bằng **Send của `Group Mic`**, **không** dùng Mute (monitor) trên các kênh FX. Thiết kế driver/preset FSP8 lấy **Send On/Off trên `Group Mic`** làm đích điều khiển FX mặc định; Mute bus chỉ là tuỳ chọn phụ.

## 7. Xác nhận không thay đổi
- Mã nguồn AUTO_MENU_AI, giao diện, HTML: **không đổi**.
- Project FSP8, cấu hình DAW, macro, phím tắt, MIDI mapping: **không đổi, không lưu**.
- Báo cáo VERIFY-03/04/05/06: **không ghi đè**.
- Không commit, không push.

---

**Claude A : Task A: FSP8-PROJECT-DEEP-AUDIT-01**

1. **File nào đã sửa.** Không sửa mã nguồn/project/file có sẵn của repo (chỉ cập nhật các tài liệu của chính task này sau khi nhận T2/T2b/T2c). Chỉ **tạo mới**: báo cáo này, 5 tài liệu `01`–`05`, thư mục `evidence/`, script đọc-chỉ `tools/fsp8_audit_dump.py`, ZIP bàn giao.
2. **Vì sao sửa.** Để có bản đồ kỹ thuật chính xác (track/bus/Send/plugin/điều khiển ngoài) của project FSP8 thật, làm cơ sở cho Menu điều khiển preset/Mute/FX Send/plugin/volume sau này, và chỉ rõ cái nào đã có bằng chứng, cái nào thiếu, cần test gì.
3. **Có ảnh hưởng module nào không.** Không. Không đụng mã Menu, FX Auto, UI, MIDI mapping hay DAW.
4. **Còn việc gì chưa làm.** Toàn bộ test chạy thật (T0–T10; T2b/T2c đã nhận và phân tích — xem `06`): xác nhận chiều `bypass` (0=bật?), bật riêng từng Send (T2d/T2e), cơ chế điều khiển Send/bus/insert, tên `.exe`, đo thời gian FX Auto, log PDL thật, định nghĩa 4 preset trên project này, `KET_QUA_VERIFY04`. Chưa được viết code. Trạng thái: **`BLOCKED_USER_TEST`**.
