# PDL-PRESET-RESEARCH-01 — Nghiên cứu 5 preset của PDL (NORM, LOFI, DÂN CA, REMIX, RAP)

- Ngày: 2026-10-19 · Người làm: Claude A · Loại task: **CHỈ NGHIÊN CỨU** (không sửa mã Menu, không đổi thuật toán, không commit triển khai, không push)
- **Trạng thái: PARTIAL.** Có bằng chứng truy vết được cho NORM, LOFI, REMIX, RAP (ở mức "bật/tắt kênh trong DAW" + vài giá trị EQ/gửi vang thật). **DÂN CA không có bất kỳ bằng chứng nào ngoài một cái tên.** Cách PDL *kích hoạt* từng preset chưa xác minh được.
- Quy ước nhãn: **VERIFIED** = đọc thấy trực tiếp trong file/mã, có nguồn · **PARTIAL** = thấy một phần, phần còn lại thiếu · **INFERRED** = suy luận của người nghiên cứu, chưa kiểm chứng · **UNKNOWN** = không có bằng chứng.
- Bằng chứng gốc đã trích ra (chỉ file văn bản, không binary) nằm ở `tools/algbench/reports/PDL-PRESET-RESEARCH-01/` (xem mục 0.3).

---

## 0. Phạm vi: đã đọc / chạy / kiểm tra được gì

### 0.1 Đã đọc được (và cách đọc)
| Nguồn | Cách đọc | Cho thấy gì |
|---|---|---|
| `PDL TOOL AI S1/auto-menu-ai-s1.zip` (SHA256 `b231d0a9…aba2c1`, 95.9 MB) | giải nén | bộ cài PDL: `Tune AI S1.exe`, `Auto Menu AI S1.exe`, `lib/core_logic.pyd`, `config.ini`, `version.dat` = `14.7.9-PDL-STUDIO`, `data/dcm.zip`, `data/adt.zip`, `data/loopMIDI S1.midiremote` |
| `data/dcm.zip` | giải nén | 10 macro Studio One (`.studioonemacro`, XML), 2 bài mẫu Studio One (`.song`), 2 preset Cubase Project Logical Editor `RAP.xml`/`RAPC.xml`, `commandbar-v3.xml` |
| `data/adt.zip` | giải nén | `user.keyscheme` Studio One 5/6/7, `Studio One.settings`, `Key Commands.xml` Cubase 10–15, `Generic Remote.xml`, cấu hình `AutoApp by NTBlog/auto-menu-ai-s1/config.ini` |
| `MIDI PV2 PDL STUDIO.midiremote`, `PJ 01/02/03 MIDI.midiremote` | giải nén zlib → JSON | bảng 19 núm CC của Cubase MIDI Remote |
| `MAPPING.png` | xem ảnh | nhãn tiếng Việt của các núm |
| `PJ 01/02/03.cpr` (Cubase project) | chỉ quét chuỗi | tên plugin trên VOCAL/FX/MUSIC |
| `lib/core_logic.pyd` | **chỉ bảng chuỗi hằng** | tên hàm, tên hằng, văn bản giao diện, mã JS/CSS của giao diện web nhúng |
| Menu hiện tại (`ui/index.html`, `ui/js/renderer.js`, `ui/js/actionRegistry.js`, `ui/js/setup.js`) | đọc mã | hành vi Menu hiện tại |
| Báo cáo cũ `AI_BOOT.md/AI-ALG-01/05/07-*.md` | đọc | đều nói về Key/Mod/BPM, **không có báo cáo nào về preset** |

### 0.2 Không đọc / không chạy / không kiểm tra được (giới hạn cứng)
- **`core_logic.pyd` là Cython 3.2.9** (không phải Nuitka). Chuỗi hằng của Cython 3.2 nằm trong một khối nén zlib (offset 7 168 432, 483 380 ký tự); giải nén khối này là đọc dữ liệu, không phải dịch ngược. **Logic điều khiển (`select_mode`, `send_midi_cc`…) là mã máy: không đọc được. Không có số nào trong đó đọc được.** Chỉ biết *tên* hàm.
- Không chạy được PDL (Windows + DAW + loopMIDI; sandbox là Linux). Không có DAW, không có MIDI monitor, không có bản ghi log khi bấm nút → **không có bằng chứng "chạy thật" nào**.
- Các file nhị phân `.vstpreset`, `.fxb`, trạng thái plugin trong `.cpr` **chưa giải mã** (chỉ đọc được `.fxpreset` của Pro EQ vì là XML).
- `Tune AI PDL Setup.exe` (Inno Setup, 64.6 MB) **chưa mở** (không có công cụ); chưa thể khẳng định nó giống hệt zip.
- Các hit chuỗi `RAP`/`Rap` trong `.cpr`/Setup.exe là **nhiễu** (base64 ngẫu nhiên, chữ "wrap") → không dùng làm bằng chứng.
- Chưa mở `nt_link.pyd`, `cloudflared.exe`, `updater.exe` (liên quan phát luồng/cập nhật, không phải preset).

### 0.3 Bằng chứng đã trích (trong gói zip)
`tools/algbench/reports/PDL-PRESET-RESEARCH-01/`
- `studioone-macros/*.studioonemacro` — 10 macro gốc.
- `studioone-song-presets/LOFI-ProEQ.fxpreset.xml`, `VERB1-ProEQ.fxpreset.xml` — giá trị EQ thật.
- `studioone-mixer-summary.txt` — kênh/insert/mute/gain/send của 2 bài mẫu (do script đọc XML).
- `midiremote-cc-map.json` — 19 CC của Cubase MIDI Remote.
- `cubase-ple-RAP.xml`, `cubase-ple-RAPC.xml`, `MAPPING.png`.
- `core_logic-mode-related-names.txt` — tên hàm liên quan chế độ trong `core_logic`.

---

## 1. Tóm tắt một trang

**Câu trả lời thẳng:** *Chúng ta hiểu PDL ở mức "nó điều khiển DAW thế nào", **chưa** hiểu ở mức "thuật toán/âm thanh preset được tính ra sao".* Trong những gì đọc được, **PDL không tự xử lý giọng**: âm thanh của preset nằm trong **dự án DAW** (kênh, plugin, giá trị EQ/vang) và PDL chỉ **bật/tắt kênh hoặc gửi MIDI CC** để chọn. Không có công thức nào cho "preset" để mà "giải mã" – nó là *tập trạng thái* của DAW.

Cái gì đã rõ (VERIFIED):
1. Trong Studio One, **NORM / LOFI / REMIX / RAP là 4 macro** chỉ làm một việc: **Mute/Unmute** 3 track giọng (`NORM`, `LOFI`, `REMIX`) và 3 kênh FX (`DELAY`, `VERB1`, `VERB2`) bằng "Find Track / Find Channel + Mute State".
   - NORM = chỉ track NORM mở, cả 3 FX mở.
   - LOFI = chỉ track LOFI mở (trên track này có Pro EQ với giá trị thật, xem 3.2), 3 FX mở.
   - REMIX = chỉ track REMIX mở (track này có MetaFlanger), 3 FX mở.
   - RAP = như NORM nhưng **tắt VERB1** (DELAY, VERB2 vẫn mở).
2. Cả 3 track giọng cùng đổ vào nhóm **Master Vocal** (chuỗi 9 plugin) rồi gửi sang DELAY/VERB1/VERB2 với mức -5.0 / -5.8 / -6.0 dB.
3. Cubase có **19 núm CC tuyệt đối (0–127)** qua cổng loopMIDI; trong đó CC20 = "LOFI Bypass", CC21 = "REMIX Bypass" (nhãn từ `MAPPING.png`). **Không có núm nào cho NORM, RAP, DÂN CA.**
4. Giao diện PDL có **5 nút chế độ**, mỗi nút có thể bị **ghi đè bởi người dùng** (Giữ A/B hoặc Gạt A/B), lưu trong `mode_overrides`.

Cái gì **chưa biết** (UNKNOWN/INFERRED):
- **DÂN CA**: không macro, không track, không CC, không giá trị. Chỉ tồn tại chuỗi chữ `DÂN CA`.
- **Cái gì kích hoạt macro Studio One**: 4 macro preset **không có phím tắt** trong `user.keyscheme` (chỉ BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7 có phím). PDL gửi lệnh thế nào (phím/MIDI/chuột) = UNKNOWN.
- Mặc định nút chế độ gửi CC nào (nếu có) = UNKNOWN (chỉ suy ra CC20/21 cho LOFI/REMIX).
- Giá trị tham số của hầu hết plugin trong chuỗi giọng (Auto-Tune, Renaissance, DeEsser…) = chưa giải mã.

Menu hiện tại: có **3 nút NORM/LOFI/RAP** (không REMIX, không DÂN CA), bấm → `ActionRegistry.executeAction("PRESET_*")` → **không có mapping mặc định nên trả NOT_CONFIGURED, và không có backend âm thanh/preset thật** (chính mã ghi như vậy). Vì vậy hiện **chưa có gì tương đương** PDL về hành vi.

Kết luận độ tin cậy: **Tái tạo "cơ chế chọn preset" (bật/tắt kênh DAW) = khả thi trong tầm bằng chứng nhưng cần Khói cung cấp thông tin DAW/MIDI (mục 8). Tái tạo "âm thanh" của preset = chưa đủ bằng chứng** (chỉ có LOFI-EQ và vài mức vang).

---

## 2. PDL thực sự làm gì theo bằng chứng hiện có

### 2.1 Kiến trúc nhìn thấy được
| # | Phát hiện | Nhãn | Nguồn |
|---|---|---|---|
| 1 | PDL = ứng dụng Windows Python/cx_Freeze, `version.dat` = `14.7.9-PDL-STUDIO`; logic chính `lib/core_logic.pyd` (Cython 3.2.9) | VERIFIED | `auto-menu-ai-s1.zip: version.dat, lib/core_logic.pyd` (header + bảng chuỗi) |
| 2 | Giao diện là panel web (pywebview/WebView2) có hàng **5 nút chế độ** (`renderModes()`, độ rộng `[1,1,1.2,1.1,1]`); click gọi `API.call('mode', …)`; chuột phải mở menu "Sửa Tùy biến… / Trả về mặc định" (`modeEdit`/`modeReset`) | VERIFIED | JS nhúng trong bảng chuỗi `core_logic` (hàm `wireMode`, `modeMenu`, `renderModes`) |
| 3 | Nếu nút bị ghi đè (`m.cust`): chế độ `hold` = ẤN chạy hành động A / THẢ chạy B; `press` = bấm gạt A/B và sáng | VERIFIED | cùng JS (`wireMode`); chuỗi "KHI ẤN (Hành động A)", "KHI THẢ (Hành động B)" |
| 4 | Ghi đè được lưu (`mode_overrides`); có hàm `_nt_mode_set_custom/_clear_custom/_custom_get/_custom_knobs/_overrides/_save_overrides/_is_custom/_menu` | VERIFIED (tên) | `core_logic-mode-related-names.txt`; chuỗi "Lỗi đọc/lưu mode_overrides" |
| 5 | Hành động Tùy biến = một dòng gồm *op + "CC nhanh" + số CC + giá trị*; có log ">>> Gửi MIDI: CC", "Lỗi chạy hành động Tùy biến CC" | VERIFIED (chuỗi/JS) | bảng chuỗi (`.fr.act`, `r.t==='act'`) |
| 6 | Chọn chế độ mặc định gọi hàm `select_mode` → `activate_daw`, `reset_all_modes`, `send_midi_cc`, `send_midi_command` | PARTIAL: **tên** thấy, **nội dung không đọc được** | `core_logic.AudioAppGui.select_mode*`, `send_midi_cc`, `send_midi_command` |
| 7 | Có lệnh riêng `cmd_tat_mic`, `cmd_tat_vang`, `cmd_tat_tune`, `cmd_send_f9_sonar` (F9 là cho Sonar/Cakewalk, **không** gắn với preset) | VERIFIED (tên) | `core_logic-mode-related-names.txt` |
| 8 | Preset ở Studio One = **macro Mute/Unmute** (mục 3) | VERIFIED | `studioone-macros/*.studioonemacro` |
| 9 | Preset ở Cubase = **MIDI Remote 19 CC** (CC20 LOFI Bypass, CC21 REMIX Bypass) + 2 preset Project Logical Editor tên RAP/RAPC | VERIFIED (CC) / UNKNOWN (ý nghĩa PLE) | `midiremote-cc-map.json`, `cubase-ple-RAP*.xml` |
| 10 | Bài mẫu Studio One chỉ có thiết bị "Qwerty Keyboard", **không có thiết bị MIDI remote** | VERIFIED | `song2/Devices/surfacemanager.xml` |
| 11 | `commandbar-v3.xml` là thanh lệnh mặc định (184 macro mặc định), **không chứa** macro NORM/LOFI/REMIX/RAP | VERIFIED (phủ định) | giải base64 tên macro |

### 2.2 Chuỗi tín hiệu đọc được trong bài mẫu Studio One "VANG NHIEU"
`NTBlog Project - VANG NHIEU.song` (VERIFIED; `studioone-mixer-summary.txt`):

```
Mic (Input L) ──► track NORM   (không insert, 0 dB)  ┐
Mic (Input L) ──► track LOFI   (Pro EQ, 0 dB)        ├──► Master Vocal [NS1 → Renaissance Axx → Equalizor → DeEsser → Aphex Vintage Exciter
Mic (Input L) ──► track REMIX  (MetaFlanger Stereo)  ┘                  → RBass → OneKnob Brighter → "Làm đều 2" → Auto-Tune Pro 2]
                                                                           ├─ send DELAY  -5.0 dB  → kênh DELAY (-14.0 dB, SuperTap 2-Taps)
                                                                           ├─ send VERB1  -5.8 dB  → kênh VERB1 (-12.6 dB, ArtsAcousticReverb + Pro EQ)
                                                                           └─ send VERB2  -6.0 dB  → kênh VERB2 ( -8.0 dB, ArtsAcousticReverb (2))
Beat (-4.0 dB: SoundShifter Pitch → Auto-Key) ──► Main [Vitamin → L2 → Sessionwire Send]
```
- Trạng thái mặc định lưu trong bài: LOFI **mute**, REMIX **mute**, NORM **không mute**, 3 kênh FX **không mute** (trùng với macro NORM → củng cố rằng `State 1` = mute, `State 0` = bỏ mute: **PARTIAL mạnh**, chưa chạy thử).
- Thứ tự insert là thứ tự trong file XML (VERIFIED); "send thuộc Master Vocal" đã kiểm (VERIFIED).
- Bài cũ `NTBlog Project.song`: track `BEAT`, `Hat` (chuỗi có Auto-Tune Pro), `LIVE`; **không có** track NORM/LOFI/REMIX; 3 kênh FX **mute** mặc định. → đây là mẫu cũ, **không dùng cho phân tích preset**.

### 2.3 Cubase
- 19 CC, kênh MIDI index 0, loại `Absolute`, dải 0–127, cổng loopMIDI (`config.ini`: `midi_port = loopMIDI Port`, `daw = Cubase14.exe`) — VERIFIED.
- Núm gắn với **Insert Effect Viewer của plugin đang có cửa sổ focus** (`HostInsertEffectFilterFollowPluginWindowInFocus`) → CC điều khiển tham số của *plugin đang mở*, không phải "kênh cố định" — VERIFIED (kiểu binding), nên "LOFI Bypass" thực sự bypass cái gì phụ thuộc cửa sổ plugin nào đang focus: **UNKNOWN**.
- Ghép *vị trí núm ↔ nhãn* trong `MAPPING.png`: **INFERRED** (JSON không chứa nhãn).

| CC | Nhãn (từ MAPPING.png) | Nhãn |
|---|---|---|
| 1 | DELAY (Volume) | INFERRED |
| 2 | VANG DÀI | INFERRED |
| 3 | VANG NGẮN | INFERRED |
| 4 | NHẠC | INFERRED |
| 5 | MIC | INFERRED |
| 8 | PitchS…es | INFERRED |
| 9 | ÂM (Intensity) | INFERRED |
| 10 | SÁNG (Band 4 Gain) | INFERRED |
| 11 | VANG 3 | INFERRED |
| 12 | VOL BÈ | INFERRED |
| 14 | BẬT BÈ (Enable) | INFERRED |
| 15 | Key | INFERRED |
| 16 | Moder…le | INFERRED |
| 17 | Retune Speed | INFERRED |
| 18 | Flex-Tune | INFERRED |
| 20 | LOFI Bypass | INFERRED |
| 21 | REMIX Bypass | INFERRED |
| 22 | TẮT TUNE (Master…ss) | INFERRED |
| 24 | TẮT MIC (Mute) | INFERRED |

(Danh sách số CC là VERIFIED; cột nhãn là INFERRED vì phải ghép bằng vị trí.)

Giá trị "cấu hình tác giả" trong `config.ini` (mặc định ban đầu, chỉ là số trong file): `beat=100 mic=100 delay=100 verb 1/2/3=100 am=30 sang=50 be=60 retune=106 flextune=50` — VERIFIED là giá trị trong file; **không biết** nó có phải giá trị preset hay chỉ mức núm lúc khởi động.

---

## 3. Phân tích từng preset

Quy ước mỗi preset: **(a)** tham số/trạng thái thay đổi · **(b)** thứ tự tín hiệu · **(c)** hiệu ứng/plugin (chỉ khi có bằng chứng) · **(d)** MIDI/DAW · **(e)** giá trị cụ thể hay chỉ tên · **(f)** tự động hay cần Khói/DAW cài · **(g)** chưa biết + cần bằng chứng gì.

Bảng trạng thái macro Studio One (VERIFIED – `studioone-macros/`; "1" = mute, "0" = bỏ mute):

| Macro | track LOFI | track REMIX | track NORM | DELAY | VERB1 | VERB2 |
|---|---|---|---|---|---|---|
| NORM | 1 | 1 | **0** | 0 | 0 | 0 |
| LOFI | **0** | 1 | 1 | 0 | 0 | 0 |
| REMIX | 1 | **0** | 1 | 0 | 0 | 0 |
| RAP | 1 | 1 | **0** | 0 | **1** | 0 |

### 3.1 NORM
- (a) VERIFIED: chỉ track NORM nghe được; DELAY/VERB1/VERB2 bật. Không đổi giá trị tham số plugin nào.
- (b) VERIFIED: Mic → track NORM (không insert, gain 0 dB) → Master Vocal (9 plugin) → 3 send → FX.
- (c) Track NORM không có insert (VERIFIED). Chuỗi Master Vocal có tên 9 plugin (VERIFIED), **tham số: UNKNOWN** (`.vstpreset`/`.fxpreset` nhị phân chưa giải mã, trừ file XML).
- (d) Studio One: macro `NORM`. Cubase: **không có CC NORM** (VERIFIED không có); INFERRED: NORM = LOFI Bypass và REMIX Bypass cùng ở trạng thái "không áp" (chưa kiểm chứng).
- (e) Có số cụ thể: mute-state, send -5.0/-5.8/-6.0 dB, gain kênh FX -14.0/-12.6/-8.0 dB (VERIFIED). Chuỗi plugin = chỉ tên.
- (f) Macro có sẵn trong gói; **bài/track tên đúng `NORM`, `LOFI`, `REMIX`, `DELAY`, `VERB1`, `VERB2` phải do Khói dựng** (macro tìm theo tên).
- (g) UNKNOWN: macro được kích bằng gì; Menu/PDL có reset các preset khác trước không (`reset_all_modes` – tên suy ra). Cần: log MIDI/phím khi bấm NORM (mục 8).

### 3.2 LOFI
- (a) VERIFIED: bỏ mute track LOFI, mute NORM và REMIX; FX giữ bật.
- (b) VERIFIED: Mic → track LOFI → **Pro EQ** → Master Vocal → send → FX.
- (c) VERIFIED (file `LOFI-ProEQ.fxpreset.xml`, bài VANG NHIEU) – Studio One **Pro EQ** trên track LOFI:

| Băng | Giá trị |
|---|---|
| Low cut | bật, 490.2 Hz, slope = 1 |
| Low-mid | bật, +3.37 dB tại 270.5 Hz, Q = 1 |
| Mid | bật, +4.17 dB tại 2508 Hz, Q = 1 |
| High cut | bật, 8967 Hz, slope = 2 |
| LF / HMF / HF | tắt |
| Gain tổng | 1 (tuyến tính = 0 dB) |

  (Giá trị này là của *bài mẫu* trong gói PDL; chưa chứng minh trùng với dự án thật mà Khói dùng. Thứ tự "cắt trầm → nhấn 270 Hz → nhấn 2.5 kHz → cắt cao 9 kHz" là cách đọc các giá trị — việc gọi đó là "kiểu lofi" là INFERRED.)
- (d) Studio One: macro `LOFI`. Cubase: CC20 "LOFI Bypass" (INFERRED nhãn). Không biết bypass cái gì (phụ thuộc plugin đang focus).
- (e) Có số cụ thể (bảng trên) — đây là **bộ giá trị hiếm hoi đọc được hoàn chỉnh**.
- (f) Cần bài Studio One có track `LOFI` + Pro EQ như mẫu; macro tự lo mute.
- (g) UNKNOWN: PDL có chỉnh thêm núm (CC) khi vào LOFI không; Cubase có chuỗi LOFI riêng không (`PJ 01/02/03.cpr` không gắn nhãn "LOFI" – chưa chứng minh). Cần: bài `.song`/`.cpr` Khói đang dùng + log MIDI khi bấm LOFI.

### 3.3 DÂN CA
- (a)–(e) **UNKNOWN toàn bộ.** Không có macro, track, CC, preset PLE, giá trị hay mô tả nào mang tên DÂN CA trong **mọi file đã giải nén** (đã quét dcm.zip, adt.zip, 2 bài, keyscheme, `.cpr` chỉ chuỗi).
- Bằng chứng duy nhất: chuỗi hằng `DÂN CA` (một lần) trong bảng chuỗi `core_logic`, nằm lẫn với các hằng màu/nhãn. VERIFIED là *có chuỗi*; việc nó là **nhãn của một nút chế độ** là INFERRED (vì đề bài nói có 5 preset và 5 nút chế độ – không phải bằng chứng độc lập).
- Không suy ra DÂN CA ≈ NORM/LOFI/RAP. Không có cơ sở.
- (g) Cần: macro/bài Studio One hoặc dự án Cubase có chế độ DÂN CA; hoặc **log MIDI/phím khi bấm nút DÂN CA** trên PDL thật; hoặc file `mode_overrides` nếu Khói từng sửa nút này; hoặc video nghe thử.

### 3.4 REMIX
- (a) VERIFIED: bỏ mute track REMIX, mute NORM và LOFI; FX giữ bật.
- (b) VERIFIED: Mic → track REMIX → **MetaFlanger Stereo** → Master Vocal → send → FX.
- (c) Plugin **MetaFlanger Stereo** (VERIFIED tên); **tham số: UNKNOWN** (`1 - MetaFlanger Stereo.vstpreset` nhị phân chưa giải mã).
- (d) Studio One: macro `REMIX`. Cubase: CC21 "REMIX Bypass" (INFERRED nhãn). Trong `.cpr` PJ 01 có "MetaFlanger", "MondoMod Mono" trên VOCAL và PJ 03 có "MondoMod Stereo" (VERIFIED là tên plugin tồn tại; **việc chúng là phần REMIX là INFERRED, chưa chứng minh**).
- (e) Chỉ có tên plugin + trạng thái mute; **không có giá trị tham số**.
- (f) Cần track `REMIX` + MetaFlanger do Khói dựng.
- (g) Cần: preset MetaFlanger (xuất `.vstpreset` đã đọc được hoặc ảnh chụp tham số), log MIDI khi bấm REMIX.
- Menu: **không có nút REMIX**; phím tắt `remix` được lưu nhưng chỉ `console.warn` (VERIFIED, `ui/js/renderer.js:2530`).

### 3.5 RAP
- (a) VERIFIED: như NORM (chỉ track NORM nghe được), **ngoài ra mute kênh VERB1**; DELAY và VERB2 giữ bật. Đây là điểm khác duy nhất giữa NORM và RAP trong macro.
- (b) VERIFIED: Mic → NORM → Master Vocal → send DELAY (-5.0), VERB2 (-6.0); send VERB1 vẫn tồn tại nhưng kênh VERB1 bị mute.
- (c) VERB1 = ArtsAcousticReverb + Pro EQ (hmf +5.55 dB tại 4948 Hz, Q=1; các băng khác tắt – VERIFIED từ `VERB1-ProEQ.fxpreset.xml`). VERB1 là "vang dài" hay "ngắn" (CC2/CC3) = **UNKNOWN** (không có bằng chứng nối VERB1/VERB2 với CC).
- (d) Studio One: macro `RAP`. Cubase: **không có CC RAP**; có 2 preset PLE `RAP.xml` / `RAPC.xml` — VERIFIED chúng chỉ khác nhau một số (`Val` = 0 so với 1), có `Function=335, Type=4012`, bộ lọc theo **tên track** `Verb1`, `Delay`, `Verb3` (VERIFIED, dòng 42/58/74 của `cubase-ple-RAP.xml`). **Ý nghĩa của Function 335/Type 4012 không xác nhận được** (có thể là mute/unmute, INFERRED). Nếu đúng như vậy thì RAP của Cubase tác động lên Verb1/Delay/Verb3 – **khác** với macro Studio One (chỉ VERB1). Mâu thuẫn này **chưa giải quyết**.
- (e) Có số: mute-state + giá trị Pro EQ VERB1. Không có thông số "RAP" riêng nào khác (không compressor, không EQ riêng).
- (f) Cần kênh tên `VERB1`; macro tự lo.
- (g) Cần: biết RAP trên máy Khói làm gì (log MIDI/phím), và DAW thật là Studio One hay Cubase.

---

## 4. Bảng so sánh 5 preset (theo bằng chứng)

| | NORM | LOFI | DÂN CA | REMIX | RAP |
|---|---|---|---|---|---|
| Studio One macro | có | có | **không** | có | có |
| Track giọng được nghe | NORM | LOFI | ? | REMIX | NORM |
| Insert riêng trên track | không | Pro EQ (giá trị đầy đủ) | ? | MetaFlanger (tham số không rõ) | không |
| Kênh FX mute | không | không | ? | không | **VERB1 mute** |
| CC Cubase | không có | CC20 (INFERRED) | không có | CC21 (INFERRED) | không có |
| Cubase PLE | – | – | – | – | `RAP.xml` / `RAPC.xml` (ý nghĩa chưa chắc) |
| Có giá trị số cụ thể | mức send/gain FX | **EQ đầy đủ** | không | không (chỉ tên plugin) | mute + EQ VERB1 |
| Nhãn bằng chứng chung | PARTIAL | PARTIAL | **UNKNOWN** | PARTIAL | PARTIAL |
| Bằng chứng chạy thật | không | không | không | không | không |

---

## 5. So sánh PDL với Menu hiện tại (theo preset)

Sự thật về Menu (VERIFIED, đọc mã): `ui/index.html:111–113` chỉ có 3 nút `NORM/LOFI/RAP` (class `preset-btn`); `ui/js/renderer.js:504` `PRESET_NAME_TO_ACTION = {NORM, LOFI, RAP → PRESET_*}`; click → `ActionRegistry.executeAction(...)`; `ui/js/actionRegistry.js:47–49` `PRESET_NORM/LOFI/RAP` **không có mapping mặc định, không kèm backend âm thanh/preset thật** → chưa cấu hình = `NOT_CONFIGURED`. `renderer.js:2524–2530`: phím tắt `normal/lofi/rap` gọi click nút; `remix` chỉ cảnh báo console. `ui/js/setup.js:622–624` cho gán MIDI cho 3 hành động PRESET. DAW được hỗ trợ: studio-one, ableton, cubase, fl-studio, reaper. Núm: `retune1/2`, `musicKnob`, `masterKnob`, `clapKnob`, `laughKnob` → `RETUNE_SPEED_MIC1/2`, `BEAT_INPUT_VOLUME`, `MASTER_OUTPUT_VOLUME`; `FX_SEND_REVERB/DELAY` có hành động nhưng không có CC mặc định.

| Preset | Bằng chứng PDL | Hành vi Menu hiện tại | Giống | Thiếu/khác | Tái tạo được? | Cần gì |
|---|---|---|---|---|---|---|
| **NORM** | macro: mở track NORM + 3 FX | nút có, gọi `PRESET_NORM`, chưa mapping → NOT_CONFIGURED | tên nút, ý "trạng thái gốc" | Menu không bật/tắt kênh nào; không biết "NORM" gồm gì | **Một phần** (cơ chế): nếu Khói gán `PRESET_NORM` tới macro/MIDI của DAW | DAW thật; tên track/kênh; cách DAW nhận lệnh (phím macro / MIDI learn) |
| **LOFI** | macro + Pro EQ có số; Cubase CC20 (suy luận) | nút có, NOT_CONFIGURED | tên | Menu không có DSP/EQ; không áp được giá trị EQ | **Cơ chế: một phần. Âm thanh: không** (Menu không xử lý âm thanh) – EQ phải nằm trong project DAW | project DAW có track LOFI + Pro EQ; xác minh có/không còn CC phụ |
| **DÂN CA** | không có | **không có nút** | – | toàn bộ | **Không** (không bằng chứng) | mục 8 |
| **REMIX** | macro + MetaFlanger (không số); Cubase CC21 | **không có nút**; phím tắt `remix` chỉ cảnh báo | phím tắt đã lưu | nút, hành động, mapping | **Một phần** (chỉ cơ chế chọn) nhưng thêm nút = đổi UI → cần Khói quyết định | như LOFI + preset MetaFlanger |
| **RAP** | macro = NORM − VERB1; PLE RAP (mâu thuẫn) | nút có, NOT_CONFIGURED | tên | không biết RAP chính xác tắt gì ở DAW của Khói | **Một phần** | log MIDI/phím khi bấm RAP; DAW |

Khác biệt kiến trúc cần Khói biết (VERIFIED + INFERRED):
- PDL (Studio One) bật/tắt vang bằng **Mute kênh FX** (BatVang/TatVang: DELAY/VERB1/VERB2; bản `…4` thêm VERB3) và chỉnh mức bằng núm CC. Thiết kế Menu (AI-FX-01) dùng **mức Send** (`FX_SEND_REVERB/DELAY`) và chưa có mapping. Hai cách này **không tương đương**; chưa biết cách nào hiệu quả hơn (không có đo).
- PDL dùng **giá trị CC tuyệt đối 0–127** (Cubase). Menu mặc định `fxAutoMidiMode = toggle`. Khác kiểu tín hiệu.
- Menu **không** có khái niệm "ghi đè nút chế độ" (A/B giữ/gạt) như PDL.

---

## 6. Đã biết / chưa biết / chưa kiểm chứng

### VERIFIED
- 10 macro Studio One và nội dung (mục 3, `studioone-macros/`).
- Trạng thái mute mặc định, insert, gain kênh, mức send của bài VANG NHIEU (`studioone-mixer-summary.txt`).
- Giá trị Pro EQ của LOFI và của VERB1 (`studioone-song-presets/`).
- 19 số CC và kiểu binding của Cubase MIDI Remote (`midiremote-cc-map.json`).
- Phím tắt Studio One: TatMic F5, BatMic F6, TatVang4 F7, BatVang4 F8; macro NORM/LOFI/REMIX/RAP **không** có phím (`adt.zip: PreSonus/Studio One 7/user.keyscheme`).
- Giao diện PDL có 5 chế độ + cơ chế ghi đè A/B (JS nhúng).
- `commandbar` không chứa macro preset; bài mẫu không có thiết bị MIDI remote.
- Chuỗi `DÂN CA` tồn tại trong `core_logic`, và không file nào khác nhắc.
- Menu hiện chỉ có 3 nút, không backend, REMIX chỉ cảnh báo.

### PARTIAL
- `State 1` = mute (suy ra từ khớp với trạng thái mặc định của bài; chưa chạy).
- Tên hàm `select_mode`, `send_midi_cc`… (biết tên, không biết nội dung).
- Cubase PLE RAP/RAPC (biết có bộ lọc theo tên track và Val 0/1; không biết Function 335/Type 4012 làm gì).

### INFERRED (chưa kiểm chứng)
- Nhãn từng CC (ghép vị trí núm với `MAPPING.png`).
- CC20/21 = bật/tắt LOFI/REMIX trong Cubase.
- `DÂN CA` là nhãn nút chế độ thứ 3 trong hàng 5 nút.
- PJ 01/02/03 là mẫu dự án Cubase; quan hệ với preset không rõ.
- PDL không tự xử lý giọng (âm nằm trong DAW) — suy từ việc mọi giá trị âm thanh thật nằm trong file project, và logic PDL chỉ có tên hàm MIDI/phím/mute.

### UNKNOWN
- Mọi thứ về DÂN CA.
- PDL kích macro Studio One bằng cách nào (phím? MIDI? chuột `[ToaDo] x1=237 y1=123 x2=238 y2=225` trong config?).
- Nút chế độ mặc định gửi CC nào, có gửi gì thêm (núm, reverb) không.
- Tham số của MetaFlanger và phần lớn plugin trong Master Vocal; giá trị núm CC khi vào từng preset.
- DAW thật của Khói (Studio One hay Cubase) và `.midiremote` của Cubase còn dùng không.
- Mâu thuẫn RAP (Studio One: tắt VERB1; Cubase PLE: Verb1/Delay/Verb3).

### Bằng chứng đã loại
`RAP/Rap` trong `.cpr`/Setup.exe (nhiễu); `commandbar-v3.xml` (mặc định Studio One); `NTBlog Project.song` cũ (mẫu khác).

---

## 7. Đề xuất thứ tự nghiên cứu/triển khai tiếp (kèm lý do & độ tin cậy)

| # | Việc | Lý do | Độ tin cậy kết quả |
|---|---|---|---|
| 1 | **Bắt MIDI/phím khi bấm 5 nút trên PDL thật** (loopMIDI + MIDI-OX/MIDI Monitor, hoặc log của PDL), ghi từng preset | Là cách duy nhất cho biết nút gửi *gì* (CC nào, giá trị nào) — lấp mục UNKNOWN lớn nhất, kể cả DÂN CA | Cao |
| 2 | Khói xác nhận **DAW đang dùng** (Studio One hay Cubase) và gửi project `.song`/`.cpr` đang chạy | Quyết định dùng macro hay CC; hiện bằng chứng của hai DAW rời nhau | Cao |
| 3 | Lấy file cấu hình thật trên máy Khói: `config.ini` đầy đủ + file `mode_overrides` (nếu có) trong thư mục cài PDL | Tên `mode_overrides` xuất hiện trong mã; có thể chứa A/B/CC của từng nút | Trung bình (chưa biết file nằm ở đâu/định dạng) |
| 4 | Xuất preset plugin (`.vstpreset`/chụp tham số) của chuỗi Master Vocal + MetaFlanger | Để có "giá trị", hiện chỉ có tên | Trung bình |
| 5 | **Sau khi có 1–3**, mới quyết định kiến trúc Menu: "preset = một tập hành động gửi DAW" (A/B hoặc danh sách) — chưa làm; thêm nút REMIX/DÂN CA là thay đổi giao diện nên cần Khói đồng ý trước | Tránh làm giả tính năng khi chưa biết PDL gửi gì | – |

Không đề xuất triển khai ngay: bằng chứng hiện chưa đủ để viết hành vi "giống PDL" mà không đoán.

---

## 8. Khói cần cung cấp

1. **Xác nhận DAW chính**: Studio One (phiên bản) hay Cubase 14/15; có dùng loopMIDI không.
2. **Project Studio One thật** đang dùng cho 5 chế độ (file `.song`, hoặc thư mục đã giải nén), tên track/kênh thực tế.
3. **DÂN CA**: macro/project/CC của chế độ này (hoặc ảnh chụp mixer khi bật nó), hoặc nói rõ chế độ này làm gì.
4. **Cách PDL kích macro Studio One**: phím tắt Khói gán cho macro NORM/LOFI/REMIX/RAP (nếu có); hoặc log MIDI khi bấm từng nút.
5. **Log bắt MIDI** (hoặc video màn hình + âm thanh) khi lần lượt bấm NORM, LOFI, DÂN CA, REMIX, RAP, kèm trạng thái mixer trước/sau.
6. File cấu hình thật trong thư mục cài PDL: `config.ini` đầy đủ, mọi file có chữ `mode_overrides`/`override`.
7. Bản preset plugin xuất ra (`.vstpreset`/`.fxpreset`) của MetaFlanger và các plugin trong Master Vocal nếu muốn có số.
8. (Tuỳ chọn) Cho phép mở `Tune AI PDL Setup.exe` bằng công cụ chuyên dụng trên máy Windows của Khói để kiểm tra có trùng với zip không.

---

## 9. Trả lời câu hỏi chính

> *Chúng ta đã hiểu được thuật toán PDL đến mức nào, phần nào có thể tái tạo trong Menu và phần nào chưa đủ bằng chứng?*

- **Hiểu được:** cách PDL **chọn preset ở mức DAW** — 4 macro Studio One (NORM/LOFI/REMIX/RAP) bật/tắt track giọng và kênh vang; một chuỗi giọng chung (Master Vocal) và 3 mức send/gain vang cụ thể; bộ EQ LOFI cụ thể; 19 CC của Cubase. Đây là bằng chứng đọc trực tiếp, không phải đoán.
- **Có thể tái tạo trong Menu (cơ chế, sau khi có thông tin ở mục 8):** gán mỗi preset thành "tập hành động gửi DAW" (macro/MIDI) — Menu đã có sẵn khung `ActionRegistry` + gán MIDI cho NORM/LOFI/RAP. Âm thanh của preset vẫn phải nằm trong project DAW, Menu không tạo ra nó.
- **Chưa đủ bằng chứng:** DÂN CA (không có gì), cách PDL gửi lệnh thực tế, giá trị núm CC theo preset, tham số MetaFlanger/Auto-Tune/các plugin khác, ý nghĩa Cubase PLE RAP, và DAW thật của Khói. **PDL "thuật toán" theo nghĩa mã xử lý: không đọc được (mã máy) và không có lý do thấy nó xử lý âm thanh.**

Trạng thái: **PARTIAL** — bao phủ 4/5 preset ở mức cơ chế có truy vết; DÂN CA chưa có bằng chứng; chưa có bằng chứng chạy thật.

---

Claude A : Task A: PDL-PRESET-RESEARCH-01 (nghiên cứu 5 preset PDL: NORM, LOFI, DÂN CA, REMIX, RAP)
1. File đã sửa: **không sửa mã nào**. Tạo mới: `tools/algbench/reports/PDL-PRESET-RESEARCH-01-REPORT.md` và thư mục bằng chứng `tools/algbench/reports/PDL-PRESET-RESEARCH-01/` (10 macro Studio One, 2 preset Pro EQ XML, 2 preset Cubase PLE, `midiremote-cc-map.json`, `studioone-mixer-summary.txt`, `core_logic-mode-related-names.txt`, `MAPPING.png`). Không đè báo cáo cũ.
2. Vì sao: Khói cần biết 5 preset PDL thực sự làm gì và Menu tái tạo được tới đâu, có phân biệt sự thật / suy luận, trước khi quyết định triển khai.
3. Ảnh hưởng module: **không** (không đổi mã, UI/HTML, thuật toán, hành vi; không commit triển khai; không push).
4. Còn lại: DÂN CA chưa có bằng chứng; chưa biết PDL kích macro/CC bằng cách nào (cần log MIDI khi bấm từng nút trên PDL thật); chưa rõ DAW thật (Studio One hay Cubase); tham số MetaFlanger và chuỗi Master Vocal chưa giải mã; mâu thuẫn RAP Studio One vs Cubase PLE; `Tune AI PDL Setup.exe` chưa mở. BLOCKED: cần dữ liệu ở mục 8 để đi tiếp.
