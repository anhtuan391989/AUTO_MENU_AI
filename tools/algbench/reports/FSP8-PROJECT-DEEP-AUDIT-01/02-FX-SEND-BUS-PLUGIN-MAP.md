# 02 — FX Send, bus hiệu ứng và plugin

Nhãn: `VERIFIED_FILE` · `INFERRED` · `UNKNOWN`. Không có `VERIFIED_RUNTIME`. Dữ liệu = trạng thái lúc lưu file.
Bảng gốc: `evidence/sends.md`, `evidence/inserts.md`, `evidence/automation.md`, `evidence/readable-native-fx-params.txt`.

## A. FX Send — tất cả đều nằm trên `Group Mic`

| Send (`name`) | UID Send | Đích (`friendlyName` + objectID/port) | `level` (lưu = hệ số tuyến tính) | dB | `prefader` | `bypass` | pan / lockPan |
|---|---|---|---|---|---|---|---|
| Send01 | `{451C4A28-9957-4C16-83AF-3891FFD97CB0}` | `Verb ngắn` — `{11375C89-…}/Input` | 0,99445 | −0,05 | 0 | **1** | 0,49 / 1 |
| Send02 | `{66B086E2-A204-4A29-B2A6-3292ED5B86F7}` | `Verb dài` — `{94208E07-…}/Input` | 0,98137 | −0,16 | 0 | **1** | 0,49 / 1 |
| Send03 | `{CC8EE44F-E652-467C-B3FF-47CEC3E5A21F}` | `Main` — `{EECFAF83-…}/Input` | 0,09879 | −20,11 | 0 | **1** | 0,49 / 1 |
| Send04 | `{22F658C8-ED5E-4AFB-A4FE-59E88E9A0C17}` | `Delay` — `{C408C505-…}/Input` | 0,99719 | −0,02 | 0 | **1** | 0,49 / 1 |
| Send05 | `{9D3398A5-91F4-4E75-8086-19BCCD679380}` | sidechain của `C1 gate` trong `Verb ngắn` — `{9EBD4AFE-…}/AudioInput01` | 1,00880 | +0,08 | 0 | **1** | 0,49 / 1 |
| Send06 | `{D4BFF2C1-C296-4125-B4FA-84E5444BC268}` | sidechain của `C1 gate` trong `Verb dài` — `{8001CB18-…}/AudioInput01` | 1,01047 | +0,09 | 0 | **1** | 0,49 / 1 |
| Send08 | **(không có UID riêng)** | `Com Verb` — `{CDB25440-…}/Input` | 0,5 | −6,02 | 0 | **1** | 0,49 / 1 |

(`VERIFIED_FILE` cho từng ô. Send07 không tồn tại. Mọi Send đều `prefader="0"` = **post-fader** — suy ra từ tên trường, `INFERRED` mức nhỏ.)
Các kênh khác (`Beat`, `Mic`, `Không Dây`, 4 bus) có khối `Sends` **rỗng**.

### Trường nào biểu thị On/Off? — câu trả lời trung thực
| Câu hỏi | Kết luận | Nhãn |
|---|---|---|
| Trường On/Off của Send có thể xác định chính xác chưa? | **Chưa.** Chỉ có trường `bypass` trên mỗi Send; không có trường `on`/`enabled`/`mute` riêng cho Send | `UNKNOWN` |
| `bypass="1"` = Send đang **tắt**? | **Có thể** nhưng chưa chứng minh. Ủng hộ: (a) với insert, `bypass=1` đi cùng plugin đang tắt (vd toàn bộ chuỗi của `Không Dây` = 1, `Mic` thì 0 trừ `RBass Mono`); (b) session mẫu PDL (Studio One 5.3) có 3 Send `bypass="0"`. Phản bác/thiếu: tài liệu hãng không mô tả enable/disable của Send; cả 7 Send đều =1 trong khi mức gần 0 dB là bất thường nếu Khói muốn đang bật | `INFERRED` (không phải VERIFIED) |
| Có bằng chứng đo thật? | Không. Cần test T2 (`05`): Khói bật/tắt đúng 1 Send trên **bản sao**, lưu, và so trường `bypass` | `BLOCKED_USER_TEST` |
| Quan hệ với FX Auto | Cả 7 Send cùng `bypass=1` **khớp** với việc Menu đặt FX mặc định TẮT (BUTTON-RESET) — chỉ là trùng hợp có thể, **không phải bằng chứng** | `INFERRED` |

### Phân biệt 4 loại điều khiển (không được coi là một)
| Loại | Trường trong file | Ví dụ giá trị hiện có |
|---|---|---|
| Send On/Off (giả định) | `Send.bypass` | 1 (cả 7) |
| Mức Send | `Send.level` (tuyến tính) | 0,0988 … 1,0105 |
| Mute bus | `AudioGroupChannel.mute` | 0 (cả 4 bus) |
| Bypass plugin | `Inserts/FXnn.bypass` | `Lofi`=1, `IL Gross Beat`=1, `PanCake2`=1 |
| Âm lượng bus | `AudioGroupChannel.gain` | −12/−18/−22/−30 dB |
Các trường này là **thuộc tính riêng** trong file (`VERIFIED_FILE`); việc một cơ chế điều khiển ngoài có đổi riêng từng cái hay không = `UNKNOWN` (cần test).

### Automation
Không có automation thực cho Send. Chỉ có 10 làn (Volume/Pan/Bypass/Mute/Range…) nhưng các file envelope chỉ 12–25 byte (gần như rỗng) và làn `Bypass` của `Beat`, `Volume` của `Không Dây` bị tắt (`mute=1`). **Địa chỉ tham số trong file** có dạng:
`param:///AudioMixer/{UID kênh}/volume` · `…/mute` · `…/Panner/panX1` · `…/Inserts/{UID insert}/vstp<ID tham số>` (làn `Bypass` dùng `vstp1652125811`).
Không có dòng nào cho Send (`param:///…/Sends/…` **chưa quan sát**) → khả năng automation Send: `UNKNOWN`.

## B. Bus hiệu ứng

| Bus | UID | Gain | Mute | Output | Insert (thứ tự theo XML) | Bypass |
|---|---|---|---|---|---|---|
| `Verb ngắn` | `{11375C89-…}` | −12 dB | 0 | `Main` | `VSS4 HD` (VST3/Reverb), `C1 gate Stereo` (Dynamics), `Pro-Q 3 (4)` (EQ) | 0,0,0 |
| `Verb dài` | `{94208E07-…}` | −18 dB | 0 | `Main` | `VSS4 HD`, `C1 gate Stereo 2`, `Pro-Q 3 (5)` | 0,0,0 |
| `Delay` | `{C408C505-…}` | −22 dB | 0 | `Main` | `ArtsAcousticReverb` (VST2/Reverb), `Analog Delay` (native), `Pro-Q 3 (6)` | 0,0,0 |
| `Com Verb` | `{CDB25440-…}` | −30 dB | 0 | `Main` | `Compressor` (native) | 0 |
Ghi chú: "vị trí trong chuỗi" lấy theo **thứ tự thẻ trong XML**; tên slot `FXnn` có số **không** theo thứ tự xử lý → thứ tự xử lý thật là `INFERRED` (cần nhìn Console). Bus `Delay` chứa **cả reverb và delay**; tên bus ≠ nội dung duy nhất.

## C. Insert trên `Group Mic` (nơi có `Lofi`, `Gross Beat`, `PanCake2`)

| Slot | Tên hiển thị | **Plugin thật** (`classInfo`) | Loại | `bypass` | Preset đang nạp | Tham số đọc được? |
|---|---|---|---|---|---|---|
| FX01 | `Tạo màu` | FabFilter **Saturn** | VST3/Distortion | không có (hoạt động) | `FabFilter Saturn` | Không (state nhị phân) |
| FX07 | `Silk Vocal Live Mono` | Silk Vocal | VST3/Dynamics | hoạt động | `default` | Không |
| FX09 | **`Lofi`** | **Pro-Q 3 (EQ)** | VST3/EQ | **1** | `default` (preset lưu trong file vstpreset có tên "Fab Pro Q3 - doi giong") | Không |
| FX05 | **`IL Gross Beat`** | IL Gross Beat | VST2 | **1** | **`Remix`** (`Remix.preset`) | Không (VST2 chunk mờ) |
| FX08 | **`PanCake2-64bit`** | PanCake2 | VST2 | **1** | `default` | Không (VST2 chunk mờ) |
| (native) | Console Shaper (MixFX) | Console Shaper | native | – | `Noisy Console` | **Có**: `preampOn=1, drive=0, noise=0, …` |

Hệ quả quan trọng:
1. Insert tên **`Lofi` thực chất là một EQ Pro-Q 3** do Khói đặt tên/preset → **tên không nói lên hiệu ứng**. Không được suy "plugin tên Lofi = chức năng LOFI" (đúng theo yêu cầu của task). Chỉ nên coi là **ứng viên do Khói đặt nhãn** (`INFERRED`).
2. `IL Gross Beat` đang nạp preset tên **`Remix`** → gợi ý nhưng không chứng minh liên hệ với REMIX (`INFERRED`).
3. Các tham số của Saturn/Silk/Pro-Q/Gross Beat/PanCake2/VSS4/C1 gate **không đọc được** từ file (state riêng của plugin) → không biết reverb/delay/lofi đang cấu hình ra sao, và **đọc được giá trị ≠ điều khiển được**: cần một cơ chế điều khiển (xem `04`, `05`).
4. Tham số **đọc được** chỉ ở plugin native: `Analog Delay` (mix=100, sync=1, feedback=30, width=80, saturation=10, locut=600, hicut=5000, …), `Compressor` của `Com Verb` (threshold −17,12, ratio 0,667, …), `Console Shaper`.

## D. Việc có thể ảnh hưởng Reverb/Delay/Lofi/Gross Beat/PanCake2 (chỉ liệt kê đường tác động — **chưa chứng minh điều khiển được**)
| Hiệu ứng mong muốn | Đường tác động có trong file | Cơ chế điều khiển cần xác minh |
|---|---|---|
| Reverb | Send01/02/05/06 → bus `Verb ngắn`/`Verb dài`; mute/gain của 2 bus | gì gửi được "Send On/Off", "mức Send", "mute bus" |
| Delay | Send04 → bus `Delay`; mute/gain bus; native `Analog Delay` mix/feedback | như trên; tham số native có thể automate |
| "Lofi" | bypass insert `Lofi` (Pro-Q 3) trên `Group Mic` | cơ chế bypass insert (key/MIDI/automation) |
| "Gross Beat" | bypass insert `IL Gross Beat` (preset `Remix`) | như trên; VST2 |
| "PanCake2" | bypass insert `PanCake2-64bit` | như trên; VST2 |

## E. Cập nhật 22/10 (T2b/T2c — xem `06`)
- Khói: **bật/tắt FX bằng Send của `Group Mic`, không dùng Mute trên các kênh FX** (`VERIFIED_USER_STATEMENT`).
- T2b: cả 7 Send đổi `bypass` 1→0, `level` giữ nguyên, không trường nào khác (ngoài hiện bus) đổi (`VERIFIED_FILE`). Chiều 0=bật: `INFERRED` (chờ Khói xác nhận).
- T2c: chỉ `Delay.mute` 0→1; Send không đổi ⇒ mute bus và Send On/Off là hai trường riêng (`VERIFIED_FILE`). Mute bus **không** phải cách Khói bật/tắt FX.
- Bảng "On/Off của Send" ở mục A (kết luận `INFERRED`) vẫn đúng nhưng **độ tin cậy cao hơn**; chưa `VERIFIED_RUNTIME`.
