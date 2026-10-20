# PDL-PRESET-RESEARCH-02 — Xác minh cơ chế điều khiển 4 preset (NORM, LOFI, RAP, REMIX)

- Ngày: 2026-10-20 · Người làm: Claude A · Loại task: **CHỈ NGHIÊN CỨU/ĐỐI CHIẾU** (không sửa mã Menu, không đổi UI, không triển khai preset, không commit triển khai, không push)
- **Phạm vi: 4 preset NORM, LOFI, RAP, REMIX. DÂN CA bị loại hoàn toàn** (không nghiên cứu, không thiết kế, không thêm nút; Menu không có nút DÂN CA và vẫn như vậy).
- **Trạng thái: PARTIAL.** Đã làm rõ được *cơ chế điều khiển ở phía DAW* (macro Studio One, phím F9–F12 của Cubase) và *chính xác Menu đang ở đâu*. **Chưa xác minh được PDL gửi lệnh gì khi bấm từng nút** và **chưa có kết quả chạy DAW thật nào**.
- Nhãn: **VERIFIED** (đọc trực tiếp, có nguồn) · **PARTIAL** (một phần) · **INFERRED** (suy luận của người làm, chưa kiểm chứng) · **UNKNOWN** (không có bằng chứng) · **BLOCKED** (cần dữ liệu/thiết bị thật).
- Không báo cáo nào dưới đây tuyên bố "preset chạy được ở DAW thật". Không có DAW trong sandbox; mọi chạy thử ở mục 3.3 là **mô phỏng mức mã với MIDI giả (mock)**.

---

## 0. Việc bắt buộc đã làm trước khi nghiên cứu

| Việc | Kết quả | Bằng chứng |
|---|---|---|
| Kiểm tra GitHub `main` mới nhất | HEAD `d400755c` ("Auto-sync 20/10/2026 7:40:11"), chỉ thêm báo cáo 01 + thư mục bằng chứng; commit trước `bcf897c` chỉ sửa `push_github 2 git.bat`. **Không có commit nào đổi mã Menu sau BUTTON-RESET.** (Dùng GitHub MCP; không `git fetch`.) | `PDL-PRESET-RESEARCH-02/github-main-check.txt` |
| So mã local với `main` | 15/15 `ui/js/*.js` + `ui/index.html` + `ui/setup.html` + `core/command-engine-js/runtime.js` **trùng blob SHA** với GitHub main; báo cáo 01 cũng trùng (`c6092eba…`). Vậy mã đã đọc **là mã main**. | cùng file |
| Đọc báo cáo 01 + toàn bộ bằng chứng 01 | Đã đọc `PDL-PRESET-RESEARCH-01-REPORT.md` và 6 nhóm bằng chứng. Báo cáo 01 **không được ghi đè**. Một số kết luận 01 được **đính chính/thu hẹp** ở mục 8. | – |
| Đối chiếu với mã Menu hiện tại | Đọc lại mã thật (không dựa báo cáo cũ): `ui/index.html`, `ui/js/renderer.js`, `ui/js/actionRegistry.js`, `ui/js/appSettings.js`, `ui/js/setup.js`, `ui/setup.html`, `core/command-engine-js/runtime.js`, `hotkeyDriver.js`. | `PDL-PRESET-RESEARCH-02/menu-code-evidence.txt` |
| Tìm thêm bằng chứng PDL | Quét lại gói PDL: `Key Commands.xml` của Cubase 10–15, `user.keyscheme` Studio One 5/6/7, thư viện trong `lib/`, chuỗi hằng của `core_logic`, `config.ini`. | `cubase-keycommands-preset-bindings.txt`, `studioone-keyscheme-macro-bindings.txt`, `pdl-trigger-evidence.txt` |

Giới hạn đọc (giữ nguyên từ 01): `core_logic.pyd` chỉ đọc được **bảng chuỗi/tên hàm**, không đọc được logic (mã máy). Không chạy được PDL/DAW. Nội dung nhị phân `.vstpreset`/`.fxb`/`.cpr` chưa giải mã.

---

## 1. Tóm tắt (đọc phần này là đủ)

1. **Cách PDL điều khiển DAW cho 4 preset thực sự có hai "tầng" bằng chứng, và chúng khác nhau theo DAW:**
   - **Studio One:** 4 macro `NORM/LOFI/REMIX/RAP` (VERIFIED nội dung) chỉ Mute/Unmute track giọng và kênh vang, đặt trạng thái **tường minh (State 0/1), không phải toggle**. Nhưng **cả 4 macro này KHÔNG có phím tắt** trong `user.keyscheme` (chỉ BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7 có phím). → **Bằng gì PDL kích macro: UNKNOWN.**
   - **Cubase (mới):** `Key Commands.xml` gán **F9 = NORMC, F10 = LOFIC, F11 = RAP (Cubase 13–15) / REMIXC (Cubase 10–12), F12 = RAPC**, nằm trong nhóm lệnh `Process Project Logical Editor` (tức preset Project Logical Editor được gọi bằng phím). REMIX **không có phím** ở Cubase 13–15.
2. **PDL "có thể" gửi phím** (có chuỗi "không tìm thấy cửa sổ Studio One để gửi phím tắt", thư viện `pyautogui`) **và "có thể" gửi MIDI** (`mido`, `rtmidi`, "Bật (127)/Tắt (0)"), nhưng **không đọc được hàm `select_mode` làm gì** → chưa biết nút chế độ dùng đường nào. **BLOCKED** cho tới khi có log MIDI/phím khi bấm nút thật.
3. **Menu hiện tại:** NORM/LOFI/RAP có nút → action `PRESET_*` → `executeAction()`; **không có mapping mặc định ⇒ mặc định trả `NOT_CONFIGURED` và không gửi gì**; **REMIX không có nút, không có action, không có dòng mapping** (chỉ có ô phím tắt trong Setup, bấm vào chỉ `console.warn`). Menu **không có đường "gửi phím tắt"** trong `executeAction()` (chỉ MIDI hoặc chuột-toạ-độ, và chuột chỉ cho PLAY/STOP/RECORD).
4. **Mute/Unmute kênh FX ≠ điều chỉnh mức Send** — hai thứ khác nhau (mục 4). PDL có **cả hai dạng dữ liệu**; Menu hiện chỉ làm dạng Send. **Không chọn phương án nào** khi chưa có căn cứ.
5. **Mâu thuẫn RAP: chưa giải được → UNKNOWN** (mục 5). Hai nguồn khác DAW, khác phạm vi (VERB1 vs Verb1+Delay+Verb3) và cần nội dung các preset PLE còn lại để hiểu.
6. **Đề xuất an toàn:** mỗi preset = **một lệnh đặt trạng thái đầy đủ** (như macro của PDL), không toggle, không phụ thuộc preset trước; Menu hiện có điểm dễ lệch trạng thái (nút sáng ngay khi bấm dù lệnh chưa cấu hình; mở lại app khôi phục sáng nhưng không gửi lệnh) — cần Khói quyết định trước khi làm (mục 6).

---

## 2. PDL điều khiển từng preset bằng cách nào (theo bằng chứng)

### 2.1 Bằng chứng mới/được làm rõ ở lượt này
| # | Phát hiện | Nhãn | Nguồn |
|---|---|---|---|
| E1 | Studio One: macro NORM/LOFI/REMIX/RAP có trong `user.keyscheme` nhưng **không có phím** (3 file Studio One 5/6/7 giống hệt nhau, md5 `9192f4a8`). Chỉ 4 macro có phím: BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7. | VERIFIED | `studioone-keyscheme-macro-bindings.txt` |
| E2 | Phím F9–F12 trong keyscheme Studio One là **lệnh mặc định của Studio One** (F9 Show Files, F10 Show Pool, F11 Show Channel Editor, F12 Toggle Floating Windows). Nếu PDL gửi F9–F12 cho Studio One thì sẽ bật/tắt các cửa sổ này, không chạy macro preset. ⇒ PDL **nhiều khả năng không** dùng F9–F12 cho preset Studio One. | VERIFIED (phím mặc định) / INFERRED (kết luận) | cùng file |
| E3 | Cubase 10/10.5/11/12: `NORMC=F9, LOFIC=F10, REMIXC=F11, RAPC=F12`; `NORM/LOFI/RAP/REMIX/RESET/NgheLai/GhiAm` không có phím. Cubase 13/14/15 (file giống hệt nhau, sha `c9e0e2c4`): `NORMC=F9, LOFIC=F10, RAP=F11, RAPC=F12`; **`REMIX` và `REMIXC` không có phím**. Mic/Vang: `BatMic=F6, TatMic=F5`; vang: 10–12 `BatVang=F8, TatVang=F7`, 13–15 `BATVANGTUNE=F8, TATVANGTUNE=F7`; 13–15 thêm `BatBe=F2, TatBe=F3`. | VERIFIED (nội dung file) | `cubase-keycommands-preset-bindings.txt` (nguồn `adt.zip → Steinberg/Cubase NN_64/Key Commands.xml`) |
| E4 | Các mục trên nằm trong nhóm lệnh **"Process Project Logical Editor"** của Cubase. Tên `RAP`/`RAPC` trùng tên preset PLE `cubase-ple-RAP.xml`/`RAPC.xml`. ⇒ phím F11/F12 gọi preset PLE cùng tên. | PARTIAL (trùng tên + trùng nhóm; chưa thấy Cubase chạy) | `01/cubase-ple-RAP*.xml`, file E3 |
| E5 | Nội dung PLE chỉ có cho **RAP** và **RAPC** (Cubase 14); PLE của NORM/NORMC/LOFI/LOFIC/REMIX/REMIXC **không có trong gói** (gói chỉ có `RAP.xml`, `RAPC.xml`, và `BatVang.xml/TatVang.xml` của Cubase 10–11). | VERIFIED (thiếu) | `dcm.zip`, `adt.zip` |
| E6 | PDL có chuỗi "❌ Không tìm thấy cửa sổ Studio One để gửi phím tắt" ⇒ có mã **gửi phím tắt tới cửa sổ Studio One**; và chuỗi "Gửi F9 tới Sonar", "Đã gửi phím F9". | VERIFIED (chuỗi) / UNKNOWN (phím nào) | `pdl-trigger-evidence.txt` |
| E7 | PDL đi kèm `mido`, `rtmidi` (MIDI), `pyautogui`, `pygetwindow` (phím/chuột/cửa sổ), `loopMIDISetup.exe`, `MIDI-FIX.exe`; chuỗi hành động Tùy biến "**Bật (127)**" / "**Tắt (0)**", "Bật chế độ ấn giữ", ">>> Gửi MIDI: CC". | VERIFIED (thư viện/chuỗi) | `pdl-trigger-evidence.txt` |
| E8 | `config.ini` mặc định trong zip: `daw = Studio One.exe`, `midi_port = Microsoft GS Wavetable Synth` (cổng mặc định của Windows, chưa trỏ loopMIDI); `config.ini` của tác giả (`adt.zip`): `daw = Cubase14.exe`, `midi_port = loopMIDI Port`. | VERIFIED | `pdl-trigger-evidence.txt` |
| E9 | Bài mẫu Studio One không có thiết bị MIDI nào (chỉ "Qwerty Keyboard"). | VERIFIED | `01/studioone-mixer-summary.txt` + `surfacemanager.xml` |
| E10 | Macro `BatVang4/TatVang4` nhắc tới `VERB3`, nhưng bài mẫu Studio One **chỉ có DELAY/VERB1/VERB2** (không có VERB3); macro NORM/LOFI/REMIX/RAP không đụng VERB3. | VERIFIED | `01/studioone-macros/*`, `01/studioone-mixer-summary.txt` |
| E11 | Nguồn ngoài (Sound on Sound): macro Studio One có thể được gán phím tắt, **nút trên thanh Macro Toolbar**, hoặc "map to your MIDI controller". Đây là nguồn thứ cấp, chưa kiểm chứng trên Studio One của Khói. | PARTIAL (nguồn thứ cấp) | https://www.soundonsound.com/techniques/studio-one-macro-machines |

### 2.2 Kết luận theo preset (cơ chế điều khiển)
| Preset | Studio One | Cubase | Cơ chế PDL thực dùng |
|---|---|---|---|
| **NORM** | macro `NORM` (VERIFIED nội dung: LOFI mute, REMIX mute, NORM bỏ mute, DELAY/VERB1/VERB2 bỏ mute). **Không có phím.** | PLE `NORMC` + **F9** (PARTIAL; nội dung PLE không có) | **UNKNOWN** (phím? MIDI? chuột?) |
| **LOFI** | macro `LOFI` (VERIFIED). **Không có phím.** | PLE `LOFIC` + **F10**; `LOFI` không phím; CC20 "LOFI Bypass" (INFERRED nhãn) | **UNKNOWN** |
| **RAP** | macro `RAP` (VERIFIED: như NORM nhưng **VERB1 mute**). **Không có phím.** | Cubase 13–15: `RAP`=**F11**, `RAPC`=**F12**; 10–12: chỉ `RAPC`=F12. Nội dung PLE có (xem mục 5). | **UNKNOWN** |
| **REMIX** | macro `REMIX` (VERIFIED). **Không có phím.** | 10–12: `REMIXC`=**F11**; **13–15: không có phím**; CC21 "REMIX Bypass" (INFERRED nhãn) | **UNKNOWN** |

Lý do giữ UNKNOWN: (1) `select_mode`/`send_midi_cc`/`send_midi_command` chỉ biết tên, không đọc được thân hàm; (2) người dùng có thể **ghi đè** từng nút bằng hành động A/B (CC/phím) và cấu hình đó lưu ở `mode_overrides` mà gói không chứa; (3) chưa có log chạy thật.

---

## 3. Đối chiếu từng preset với Menu hiện tại (đọc mã thật)

### 3.1 Dòng chảy hiện có (VERIFIED)
```
Nút NORM/LOFI/RAP (ui/index.html:112-114)
  └─ click (ui/js/renderer.js:509-519): đổi class .active ngay → saveData() → executeAction(PRESET_x, {reason:"menu-button"})
       └─ ActionRegistry.executeAction (ui/js/actionRegistry.js:186-246)
            ├─ nếu dawMidiOutMappings[selectedDAW][PRESET_x] có (kind cc|note, number)  → sendMidiCC(number, value ?? 127, channel-1)  [:201-202]
            │                                                                        hoặc sendMidiNotePulse (Note On rồi Off sau 120 ms) [:203-204; appSettings.js:421-426]
            ├─ nếu action có toạ độ chuột (chỉ DAW_PLAY/STOP/RECORD, actionRegistry.js:92-96)  → clickAtPoint    [PRESET_* KHÔNG có]
            └─ còn lại → trả {ok:false, reason:"NOT_CONFIGURED"}  [:244-245]  (không gửi gì)
```
- Mapping do người dùng nhập ở Setup (`ui/js/setup.js:622-624` có 3 dòng PRESET; schema `{kind, channel, number, value|velocity}`), lưu theo từng DAW (`actionRegistry.js:123-138`). **Không có mapping mặc định, không có số CC/Note nào được đặt sẵn** (VERIFIED).
- `executeAction()` **không có nhánh gửi phím tắt**. Mã chỉ nhắc `HotkeyDriver` trong chú thích (`actionRegistry.js:255`). `HotkeyDriver` (AHK qua TCP 6789) có trong `core/command-engine-js` nhưng `runtime.js` **chỉ nối nhóm Transport (play/stop/record) cho studio_one** (`runtime.js:16`); không có nhánh preset (`grep -i preset` trong `runtime.js` chỉ ra 1 dòng chú thích).
- **Không có test nào** tham chiếu `PRESET_NORM/LOFI/RAP` (`grep -rl` trong `tests/` → rỗng).

### 3.2 Bảng trạng thái từng preset
| Hạng mục | NORM | LOFI | RAP | REMIX |
|---|---|---|---|---|
| Nút trong Menu | Có, **mặc định sáng** lúc mở (`index.html:112`) | Có (`:113`) | Có (`:114`) | **Không có** |
| Action trong `ActionRegistry` | `PRESET_NORM` (`actionRegistry.js:47`) | `PRESET_LOFI` (`:48`) | `PRESET_RAP` (`:49`) | **Không có `PRESET_REMIX`** |
| Dòng cấu hình MIDI trong Setup | Có (`setup.js:622`) | Có (`:623`) | Có (`:624`) | **Không có** |
| Phím tắt Menu (trong cửa sổ Menu) | `normal` → bấm nút (`renderer.js:2525`) | `lofi` (`:2526`) | `rap` (`:2527`) | Ô "Chế độ Remix" có trong Setup (`setup.html:76`, `setup.js:807`) nhưng `remix` chỉ `console.warn` (`renderer.js:2530`) |
| Mapping mặc định | Không có | Không có | Không có | – |
| Kết quả mặc định khi bấm | `NOT_CONFIGURED`, không gửi gì | như NORM | như NORM | Không có đường để bấm |
| Có đường gửi **phím tắt** | Không | Không | Không | Không |
| Có đường gửi **MIDI** (khi Khói tự cấu hình) | Có (CC/Note) | Có | Có | **Chưa** (cần thêm action + dòng Setup) |
| Phản hồi từ DAW (xác nhận) | **Không có** | Không có | Không có | – |
| Có test tự động | Không | Không | Không | Không |
| Đã kiểm với DAW thật | **KHÔNG** (BLOCKED) | KHÔNG | KHÔNG | KHÔNG |
| **Kết luận** | **Chưa hoạt động** — chỉ "sẵn đường gửi MIDI", cần Khói tự cấu hình; hiệu quả ở DAW chưa biết | như NORM | như NORM | **Chưa có** (thiếu nút/action/dòng cấu hình) |

Nhãn: các dòng "Có/Không" ở trên đều **VERIFIED** (đọc mã). "Hiệu quả ở DAW" = **UNKNOWN/BLOCKED**.

### 3.3 Mô phỏng mức mã (mock, KHÔNG phải DAW)
`PDL-PRESET-RESEARCH-02/menu-dispatch-probe.js` nạp **nguyên văn** `ui/js/actionRegistry.js` vào `vm`, thay MIDI thật bằng hàm ghi nhận. Kết quả (`menu-dispatch-probe.output.txt`):
- Chưa mapping → `{"ok":false,"reason":"NOT_CONFIGURED"}`, **không gửi gì**, với cả 3 preset; `PRESET_REMIX` **không tồn tại**.
- Chưa chọn DAW → `NOT_CONFIGURED` (`NO_DAW_SELECTED`).
- Có mapping giả (CC 80 / value 127, chỉ để thử đường dẫn — **không phải số của PDL**) → gửi đúng 1 CC 80=127 ch1; preset chưa map vẫn không gửi gì.
- Có mapping nhưng cổng MIDI không mở được → `NO_DEVICE`.
Đây chỉ chứng minh **logic điều phối của Menu**; không chứng minh DAW nhận/đáp ứng.

### 3.4 Điểm có thể gây lệch trạng thái (VERIFIED, mã hiện tại)
1. Nút sáng (`.active`) **ngay khi bấm**, trước và bất kể kết quả gửi (`renderer.js:511-517`) → nút sáng "RAP" kể cả khi lệnh `NOT_CONFIGURED`/`NO_DEVICE`.
2. Lúc khởi động NORM sáng sẵn theo HTML (`index.html:112`) mà **không gửi lệnh nào** → DAW có thể đang ở preset khác.
3. `saveData()` lưu preset sáng (`renderer.js:1701`) và `loadData` **khôi phục chỉ phần sáng** (`:1750-1757`), **không gửi lệnh** → mở lại app thấy RAP sáng nhưng DAW không được đặt RAP. (Khác với 4 nút Music/Mic1/Mic2/FX đã được BUTTON-RESET sửa để không lưu.)
4. Nút FX Auto của Menu đang điều khiển Send Reverb/Delay (`renderer.js:573-656`, hàm `createFxAutoWiring`) — nếu một preset (như macro RAP của PDL) cũng Mute kênh VERB1, hai cơ chế có thể **ghi đè nhau** (INFERRED, chưa có DAW để thử).

---

## 4. Mute/Unmute kênh FX và điều chỉnh mức Send — khác nhau thế nào

(Giải thích cho người không lập trình. Không chọn phương án.)

| | **Mute/Unmute kênh FX** (kiểu macro PDL) | **Mức Send** (kiểu AI-FX-01 của Menu) |
|---|---|---|
| Nó làm gì | Bật/tắt *đầu ra* của kênh hiệu ứng (DELAY/VERB1/VERB2). Mức Send và âm lượng kênh FX **giữ nguyên**. | Thay đổi *lượng tín hiệu giọng được đưa sang* kênh FX. Kênh FX vẫn "bật". |
| Dạng trạng thái | 2 giá trị: bật/tắt. Macro PDL đặt `State` 0/1 tường minh (VERIFIED) ⇒ lặp lại lệnh không đảo trạng thái (PARTIAL: ý nghĩa `State 1`=mute suy từ khớp với trạng thái mặc định trong bài). | Liên tục (CC 0–127 → mức Send). Cần biết **giá trị nào là "mức chuẩn"**. |
| Cần hiệu chuẩn? | Không cần biết mức — mức đã nằm sẵn trong dự án DAW. | **Có**: PDL cho thấy Send của Master Vocal: DELAY −5.0 dB, VERB1 −5.8 dB, VERB2 −6.0 dB (VERIFIED); nhưng **CC bao nhiêu ứng với bấy nhiêu dB phụ thuộc DAW** (UNKNOWN). |
| Với tiếng vang đang còn đuôi | Tắt kênh FX có thể **cắt đột ngột** cả đuôi vang (suy theo bản chất Mute; chưa nghe thử) — INFERRED. | Đưa Send về 0 làm vang **ngừng nhận thêm tín hiệu** nhưng đuôi cũ vẫn tự tan — INFERRED. |
| Rủi ro lệnh toggle | Rủi ro nếu DAW-side là "đảo" thay vì "đặt"; macro PDL là "đặt". | Menu có chế độ `toggle` (mặc định) và `absolute` (BẬT=value, TẮT=0) cho FX Auto (`renderer.js:570-572`, `:586`), tức Menu đã biết khác biệt này. |
| Bằng chứng PDL | **Có**: macro NORM/LOFI/REMIX/RAP/BatVang/TatVang (VERIFIED). | **Có một phần**: 19 CC knob (nhãn DELAY/VANG DÀI/VANG NGẮN/VANG 3… là INFERRED) + mức Send tĩnh trong bài mẫu; PDL gửi CC đó hay không khi chọn preset = UNKNOWN. |

**Căn cứ để chọn (còn thiếu):** (a) PDL thực gửi gì khi bấm preset (log MIDI/phím); (b) dự án DAW của Khói điều khiển vang bằng Mute kênh hay Send; (c) nghe thử A/B. → **BLOCKED**. Không tự chọn phương án.

---

## 5. Mâu thuẫn RAP: macro Studio One ↔ Cubase PLE

| | Studio One (`01/studioone-macros/RAP.studioonemacro`) | Cubase (`01/cubase-ple-RAP.xml`, `…RAPC.xml`) |
|---|---|---|
| Đối tượng bị tác động | **chỉ kênh `VERB1`** (Mute State 1); `DELAY`, `VERB2` mở (State 0); track `LOFI`/`REMIX` mute, `NORM` mở | Bộ lọc theo **tên** (đọc từ file): `Verb1` **hoặc** `Delay` **hoặc** `Verb3` (3 điều kiện nối bằng token 104, bọc bằng token 101…102 — suy luận cấu trúc "(A hoặc B hoặc C)"); **không** có `VERB2`, `NORM`, `LOFI`, `REMIX` |
| Giá trị đặt | Mute `State` = 1 | Hành động `leActionTargetTrackOp`, `Function=335`, `Type=4012`, **`Val=0` (RAP) / `Val=1` (RAPC)** — hai file chỉ khác nhau giá trị này (VERIFIED bằng `diff`) |
| Phím | không có | Cubase 13–15: RAP=F11, RAPC=F12; 10–12: RAPC=F12 (VERIFIED) |
| Tên kênh trong dự án mẫu | `DELAY, VERB1, VERB2` (không có VERB3) | Dự án Cubase mẫu `PJ 01/02/03.cpr` chứa chuỗi "Vang 1/2/3", "Delay"; **không có** "Verb1"/"Verb3" (quét chuỗi) ⇒ tên bộ lọc **không khớp** dự án mẫu đi kèm (nhãn: VERIFIED về chuỗi; "tên track thực" INFERRED) |

Phân tích:
- **Khác phạm vi:** macro Studio One chỉ tắt 1 kênh; PLE Cubase nhắm tới 3 tên (Verb1/Delay/Verb3). Dù `Val=1` có nghĩa là "Mute" hay không, hai bên **không cùng tập kênh**.
- **Ý nghĩa `Function 335 / Type 4012` và `Val 0/1`: UNKNOWN** — cần xem preset đó trong Cubase (hoặc tài liệu Steinberg) để biết đó là Mute/Solo/Bypass…; không suy đoán.
- Cặp `RAP`(Val 0)/`RAPC`(Val 1) có thể là cặp "đặt/bỏ" trên cùng nhóm kênh vang (cùng họ với `BatVang/TatVang` — chỉ khác nhau một giá trị), nhưng nội dung PLE của `NORMC/LOFIC/REMIXC` không có nên **không đối chiếu được** → INFERRED yếu, không dùng làm kết luận.
- Hai DAW có thể được thiết kế khác nhau; cũng có thể một bên là bản cũ. **Không có căn cứ phân xử.**

**Kết luận: mâu thuẫn RAP = UNKNOWN.** Để xác minh, cần: ảnh chụp cửa sổ Project Logical Editor với preset `RAP` và `RAPC` (Cubase) hiển thị phần Filter/Action; xác nhận Khói đang dùng DAW nào; nội dung các PLE còn lại (mục 7).

---

## 6. Đề xuất triển khai an toàn (CHỈ ĐỀ XUẤT — chưa làm, chưa quyết định phương án DAW)

Nguyên tắc dựa trên bằng chứng:
1. **Mỗi preset = một lệnh "đặt trạng thái đầy đủ"** (idempotent), giống macro PDL (mỗi macro đặt cả 6 trạng thái, không dựa vào trạng thái trước). Bấm RAP hai lần ra cùng một kết quả.
2. **Không dùng lệnh toggle/đảo** cho preset. Nếu DAW-side chỉ có toggle, phải có cách biết trạng thái hiện tại trước (Menu **không có phản hồi từ DAW**, `actionRegistry.js` chỉ biết "đã gửi"), nên **không nên** dùng cơ chế đó.
3. **Một lệnh một preset, tách bạch** (đúng khuôn `PRESET_NORM/LOFI/RAP` hiện có; thêm `PRESET_REMIX` sau này nếu Khói đồng ý) — không dùng "một CC giá trị khác nhau" nếu chưa biết DAW diễn giải ra sao.
4. **Phân tách 3 trạng thái** như thiết kế FX hiện có: *yêu cầu* (nút sáng) → *đã gửi* (kết quả `executeAction`) → *DAW xác nhận* (hiện không tồn tại). Không báo "đã chuyển preset" nếu chỉ mới gửi.
5. **Không tự gửi lệnh lúc khởi động** nếu chưa biết trạng thái DAW (tránh đổi giọng ngoài ý muốn); nhưng cần Khói quyết định cách hiển thị NORM sáng sẵn và preset khôi phục (mục 3.4).
6. **Không thêm nút REMIX/DÂN CA, không đổi giao diện** khi chưa được Khói duyệt.

Ba đường kích hoạt khả dĩ (chưa chọn — mỗi đường cần xác minh riêng):
| Đường | Menu có sẵn? | Cần xác minh |
|---|---|---|
| **MIDI CC/Note → macro/PLE** | Có (Setup → MIDI Output Mapping) | Studio One/Cubase có map được MIDI tới macro/PLE tường minh không (Studio One: PARTIAL qua SOS; Cubase: **chưa có bằng chứng**; PDL gửi CC nào: UNKNOWN) |
| **Phím tắt tới DAW** (như F9–F12 của Cubase) | **Chưa** (chỉ `HotkeyDriver`/AHK cho Transport, không nối preset) | AHK service chạy sẵn, cửa sổ DAW nhận phím khi không focus; phím nào cho Studio One (macro hiện chưa gán phím) |
| **Click chuột theo toạ độ** | Chỉ cho PLAY/STOP/RECORD | Mong manh, không khuyến nghị cho preset |

Thứ tự đề xuất sau khi có dữ liệu: (1) chốt DAW + đường kích hoạt từ log thật; (2) chốt Mute-vs-Send theo mục 4; (3) mới thêm cấu hình/action (và REMIX nếu Khói duyệt thay đổi UI); (4) thêm test mức mã + checklist DAW thật. **Không làm bước nào trước (1).**

---

## 7. Các điểm còn BLOCKED, dữ liệu cần và cách xác minh

| ID | Điểm BLOCKED | Dữ liệu/thiết bị cần |
|---|---|---|
| B1 | PDL gửi **gì** khi bấm NORM/LOFI/RAP/REMIX (phím? CC? Note? số nào?) | Log MIDI + log phím khi bấm từng nút |
| B2 | DAW thật của Khói (Studio One hay Cubase 14) và phiên bản | Khói xác nhận |
| B3 | Phím gán cho macro NORM/LOFI/REMIX/RAP **trên máy Khói** (shipped keyscheme không có) | Ảnh chụp Studio One → Tuỳ chọn → Phím tắt (lọc "NORM/LOFI/REMIX/RAP") |
| B4 | Studio One có map MIDI → macro được không và gán thế nào | Ảnh chụp Macro Organizer / External Devices; thử với 1 macro |
| B5 | Nội dung PLE của `NORM/NORMC/LOFI/LOFIC/REMIX/REMIXC/RESET` và ý nghĩa Function 335/Type 4012 | File `.xml` PLE từ thư mục người dùng Cubase + ảnh cửa sổ PLE |
| B6 | `mode_overrides` (cấu hình ghi đè nút chế độ) và `config.ini` thật | File trong thư mục cài PDL trên máy Khói |
| B7 | CC20/21 "Bypass" bypass cái gì; nhãn các CC | Ảnh chụp Cubase MIDI Remote + log |
| B8 | Mute vs Send: PDL thực dùng gì cho vang khi đổi preset | Kết quả B1 + so sánh mixer trước/sau |
| B9 | Kết quả thật trên DAW của lệnh Menu (khi Khói tự cấu hình) | Chạy thử có checklist (dưới) |

### Kế hoạch xác minh (thao tác cho Khói, không cần lập trình)
**V1 — Bắt MIDI của PDL (B1, B7, B8)**
1. Mở loopMIDI (đã đi kèm trong bộ PDL: `loopMIDISetup.exe`). Mở một công cụ xem MIDI (ví dụ MIDI-OX hoặc "MIDI Monitor") và chọn **loopMIDI Port** làm cổng vào.
2. Mở PDL. Lần lượt bấm **NORM → LOFI → RAP → REMIX**, mỗi nút **một lần**, cách nhau ~5 giây; sau mỗi nút ghi tên nút.
3. Lưu log (hoặc chụp màn hình) kèm thứ tự bấm. Làm tương tự **bấm giữ** và **thả** nếu nút bị ghi đè kiểu "Giữ".
4. Nếu log trống: PDL không dùng MIDI cho nút đó → làm V2.

**V2 — Bắt phím (B1, B3)**
1. Cài AutoHotkey, tạo file `keys.ahk` chỉ gồm 2 dòng: `#InstallKeybdHook` và `^!k::KeyHistory` ; chạy file.
2. Bấm lần lượt 4 nút trong PDL (như V1), rồi nhấn `Ctrl+Alt+K` và chụp cửa sổ **Key History**.
3. Trong Studio One mở Tuỳ chọn → Phím tắt, lọc "NORM", "LOFI", "REMIX", "RAP" và chụp màn hình phím đang gán.

**V3 — Trạng thái mixer sau mỗi nút (đối chiếu macro)**
Sau mỗi nút, chụp mixer Studio One. **Kết quả kỳ vọng nếu cơ chế = macro đã đọc** (đây là kỳ vọng suy từ file, chưa kiểm chứng):

| Sau khi bấm | track NORM | track LOFI | track REMIX | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | mở | tắt | tắt | mở | mở | mở |
| LOFI | tắt | mở | tắt | mở | mở | mở |
| REMIX | tắt | tắt | mở | mở | mở | mở |
| RAP | mở | tắt | tắt | mở | **tắt** | mở |

**V4 — Cubase (nếu Khói dùng Cubase) (B5)**: Project → Logical Editor → mở preset `RAP`, `RAPC`, `NORMC`, `LOFIC`, `REMIXC` (nếu có) và chụp từng cửa sổ; gửi các file `.xml` trong `…/Presets/Project Logical Editor/` của máy Khói.

**V5 — Thử Menu (B9, chỉ sau V1–V4)**: ở Setup chọn DAW + cổng MIDI, gán MIDI Output cho `PRESET_NORM/LOFI/RAP` theo số lấy từ V1 (**không tự đặt số**), bấm từng nút và chụp mixer như V3. Đạt khi mixer khớp bảng V3 và lặp lại nút cho cùng kết quả (không đảo).

---

## 8. Đính chính/thu hẹp báo cáo 01 (không ghi đè báo cáo cũ)
- 01 ghi "Cubase: không có CC NORM/RAP" — đúng, nhưng **thiếu** phím F9–F12 của `Key Commands.xml` (E3). Bổ sung ở mục 2.
- 01 ghi "cách PDL kích macro Studio One: UNKNOWN" — vẫn UNKNOWN, nhưng nay thu hẹp: shipped keyscheme **không gán phím** cho 4 macro preset; F9–F12 mặc định Studio One là lệnh khác (E1/E2).
- 01 coi RAP là NORM trừ VERB1 (đúng cho Studio One); mục 5 ghi rõ đối chiếu Cubase **chưa giải được**.
- 01 nhắc **DÂN CA**: ở task này bị loại khỏi phạm vi và không được kế thừa.

---

## 9. Danh sách file tạo ra (không sửa mã hiện hành)
- `tools/algbench/reports/PDL-PRESET-RESEARCH-02-REPORT.md` (báo cáo này)
- `tools/algbench/reports/PDL-PRESET-RESEARCH-02/`:
  - `github-main-check.txt` — kết quả kiểm GitHub main + so SHA.
  - `menu-code-evidence.txt` — trích mã Menu kèm số dòng.
  - `menu-dispatch-probe.js` + `menu-dispatch-probe.output.txt` — probe mức mã (MIDI giả).
  - `cubase-keycommands-preset-bindings.txt` — phím F-key của Cubase 10–15.
  - `studioone-keyscheme-macro-bindings.txt` — phím Studio One.
  - `pdl-trigger-evidence.txt` — chuỗi/thư viện/config liên quan kích hoạt.
- **Không sửa**: `ui/**`, `core/**`, `app/**`, `tests/**`, báo cáo 01. `git status` chỉ có các file tạo mới ở `tools/algbench/reports/` (kiểm ở cuối task).

---

Claude A : Task A: PDL-PRESET-RESEARCH-02 (xác minh cơ chế điều khiển NORM/LOFI/RAP/REMIX; loại DÂN CA)
1. File đã sửa: **không sửa mã nào**. Tạo mới: `tools/algbench/reports/PDL-PRESET-RESEARCH-02-REPORT.md` và thư mục bằng chứng `tools/algbench/reports/PDL-PRESET-RESEARCH-02/` (7 file: github-main-check, menu-code-evidence, menu-dispatch-probe.js/.output, cubase-keycommands-preset-bindings, studioone-keyscheme-macro-bindings, pdl-trigger-evidence). Không ghi đè báo cáo 01.
2. Vì sao: xác minh PDL điều khiển 4 preset bằng macro/CC/phím/cơ chế nào, đối chiếu chính xác với Menu (ActionRegistry, MIDI mapping, UI), làm rõ Mute vs Send và mâu thuẫn RAP trước khi quyết định triển khai.
3. Ảnh hưởng module: **không** (không đổi mã, UI/HTML, thuật toán, hành vi; không commit triển khai; không push). Phát hiện cho các module sau này: nút preset sáng trước khi gửi/không gửi lệnh khi khôi phục (renderer.js:511-517, 1750-1757); Menu chưa có đường gửi phím; chưa có `PRESET_REMIX`.
4. Còn lại / BLOCKED: PDL gửi gì khi bấm từng nút (cần log MIDI/phím); DAW thật của Khói; phím gán macro trên máy Khói; nội dung PLE NORMC/LOFIC/REMIXC; ý nghĩa Function 335/Type 4012; mâu thuẫn RAP = UNKNOWN; chọn Mute vs Send chưa đủ căn cứ; chưa có bất kỳ kết quả chạy DAW thật; chưa có test cho PRESET_*.
