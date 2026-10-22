# 03 — Ánh xạ preset NORM / LOFI / RAP / REMIX trên project này

Quy tắc: **không gán RAP/REMIX vào plugin khi chưa có bằng chứng; không dùng tên plugin làm bằng chứng** (đã thấy `Lofi` thực chất là EQ Pro-Q 3 — `02`). Đề xuất là **cấu hình do Khói khai báo**, không hard-code.
Nhãn: `VERIFIED_FILE` · `VERIFIED_USER_STATEMENT` · `INFERRED` · `UNKNOWN` · `BLOCKED_USER_TEST`. Chưa có `VERIFIED_RUNTIME`.

## A. Cái đã chứng minh (từ file) và cái chỉ là giả thuyết
| Điều | Nhãn |
|---|---|
| PDL (session mẫu Studio One 5) đặt preset bằng **Mute track NORM/LOFI/REMIX + Mute FX DELAY/VERB1/VERB2**; RAP chỉ tắt VERB1 | `VERIFIED_FILE` (file PDL, VERIFY-03) |
| Project của Khói **không có** track NORM/LOFI/REMIX | `VERIFIED_FILE` + `VERIFIED_USER_STATEMENT` |
| Project của Khói có 4 bus, 7 Send trên `Group Mic`, 3 insert đang bypass (`Lofi`, `IL Gross Beat`, `PanCake2`) | `VERIFIED_FILE` |
| "Preset" nghĩa là gì trên project của Khói | **`UNKNOWN`** — chưa có định nghĩa từ Khói |
| `Lofi`↔LOFI, `IL Gross Beat`/`Remix`↔REMIX | `INFERRED` (theo nhãn do Khói đặt) |
| RAP ↔ bất kỳ đối tượng nào | `UNKNOWN` (PDL tắt `VERB1`; không biết `VERB1` tương ứng bus nào) |
| PDL kích hoạt preset bằng CC/Note/phím/macro | `UNKNOWN` (VERIFY-06 `02`) |

## B. Bảng từng preset

| | **NORM** | **LOFI** | **RAP** | **REMIX** |
|---|---|---|---|---|
| Trạng thái âm thanh mục tiêu **theo PDL** | track NORM bật; LOFI/REMIX tắt; DELAY/VERB1/VERB2 bật | track LOFI bật; NORM/REMIX tắt; FX bật | như NORM nhưng **VERB1 tắt** | track REMIX bật; NORM/LOFI tắt; FX bật |
| Trạng thái mục tiêu **trên project Khói** | **Khói quyết** (chưa có) | **Khói quyết** | **Khói quyết** | **Khói quyết** |
| Đối tượng có thể liên quan | 3 insert đang bypass; 7 Send đang `bypass=1`; mute 4 bus | insert `Lofi` (Pro-Q 3) — ứng viên | `Verb ngắn` / `Verb dài` / Send01/02/05/06 — **không đoán** | insert `IL Gross Beat` (preset `Remix`), `PanCake2-64bit` — ứng viên |
| Hành động dự kiến (nếu Khói đồng ý) | `plugin_bypass` (đưa 3 insert về bypass); có thể `send_level`/Send On/Off | `plugin_bypass` (`Lofi` = chạy, 2 cái kia = bypass) | `mute` hoặc Send Off của **1 bus Khói chỉ định** | `plugin_bypass` (`Gross Beat`, có thể `PanCake2` = chạy) |
| `mute` | có thể (bus) | có thể | **ứng viên chính** (theo PDL) | có thể |
| `send_level` | không bắt buộc | không | có thể | có thể |
| `plugin_bypass` | **chính** | **chính** | không | **chính** |
| `plugin_param` | không | không (tham số Pro-Q 3 không đọc được) | không | không (VST2 chunk mờ) |
| `fx_volume` | không | không | có thể (gain bus) | không |
| `trigger` (gọi macro/key command có sẵn) | khả thi nếu Khói có macro | idem | idem | idem |
| Cái **đã chứng minh** | trạng thái lưu khớp "tất cả bypass" (chỉ là trạng thái lúc lưu) | chỉ có 1 insert tên "Lofi" | không có gì | chỉ có preset tên "Remix" |
| Cái **chỉ là giả thuyết** | NORM = mọi insert hiệu ứng bypass | LOFI = bật EQ "Lofi" | RAP = bớt reverb | REMIX = bật Gross Beat (+PanCake2?) |
| Xung đột với FX Auto | nếu NORM tắt Send/bus mà FX Auto bật lại sau 1 s | thấp (insert độc lập Send) | **cao**: FX Auto cũng điều khiển Send Reverb/Delay | thấp–trung bình |
| Câu hỏi cho Khói | "NORM" nghĩa là gì khi không có track NORM? | "Lofi" = EQ này thật không? cần thêm gì? | RAP muốn bớt **bus/Send nào**? | REMIX = Gross Beat? PanCake2? có thêm gì? (hiện không có đường kích hoạt) |

## C. Xung đột Preset ↔ FX Auto (Menu hiện tại)
Sự thật từ mã Menu (`evidence/menu-fx-auto-facts.txt`): FX Auto chỉ có **2 hành động Send** (`FX_SEND_REVERB`, `FX_SEND_DELAY`), chế độ mặc định **`toggle`** (gửi đúng message như bấm tay → **đảo** trạng thái DAW, không có phản hồi) hoặc **`absolute`** (CC 127/0). Hệ quả:
1. Project có **7 Send/4 bus** nhưng Menu chỉ biết 2 hành động → cần Khói chỉ rõ Send nào thuộc "Reverb", Send nào thuộc "Delay" (và `Send03`, `Send08`, sidechain `Send05/06` thuộc nhóm nào hoặc để ngoài). `UNKNOWN`.
2. Chế độ `toggle` + không phản hồi → preset và FX Auto cùng "đảo" có thể **lệch trạng thái**; preset nên dùng lệnh **tuyệt đối** (đặt hẳn Bật/Tắt) nếu DAW hỗ trợ.
3. Quy tắc ưu tiên (M5): bấm preset có coi là "thủ công" và khoá FX Auto 60 s không? Chưa quyết.
4. Sidechain `Send05/06` cấp tín hiệu cho `C1 gate` của reverb: nếu FX Auto chỉ bật Send01/02/04 mà không bật Send05/06, gate có thể không mở — **không biết**, cần nghe/đo (T5, `05`).

## D. Cấu hình thay vì hard-code (đặc tả; không phải code cam kết)
```
preset "<tên do Khói đặt>":
  steps:
    - kind: plugin_bypass | mute | send_level | fx_volume | trigger
      target: { name: "<tên Khói chọn>", hint_uid: "<UID nếu muốn>", owner: "<kênh chủ>" }
      value : on | off | <số>      # tuyệt đối, không "toggle"
      via   : <driver, cơ chế do Khói đã gán và test>
```
- Không có mặc định cho NORM/LOFI/RAP/REMIX; trống = `NOT_CONFIGURED` (hiện tại REMIX chưa có action trong Menu).
- Mỗi `target` chọn từ danh sách đối tượng **đọc từ session của Khói** (`01`/`02`), không gõ tay tên plugin.

## E. Câu hỏi cần Khói xác nhận trước khi ánh xạ
1. NORM/LOFI/RAP/REMIX **trên project này** nên làm thay đổi gì (Mute bus? Send? bypass insert? gain)?
2. `Lofi` (Pro-Q 3) có đúng là chỗ tạo âm "lofi" không? Còn plugin/bus nào khác thuộc LOFI?
3. RAP muốn giảm reverb ở `Verb ngắn`, `Verb dài`, hay cả hai? Delay giữ hay tắt?
4. REMIX = `IL Gross Beat` (preset Remix) + `PanCake2`? Có cần bật/tắt Send nào?
5. 7 Send: Send nào là "Reverb", Send nào là "Delay"? `Send03 → Main (−20 dB)` và `Send08 → Com Verb` dùng để làm gì?
6. Khi bấm preset, FX Auto nên làm gì (khoá 60 s, hay chạy tiếp)?

## F. Ghi nhận từ Khói (22/10) — ảnh hưởng tới mô hình preset
- `VERIFIED_USER_STATEMENT`: Khói bật/tắt FX bằng **Send của `Group Mic`**, **không** dùng Mute trên các kênh FX.
- Do đó, trên project này, hành động FX của preset nên là **`send_onoff` (và `send_level` nếu cần) trên `Group Mic`**, không phải `mute` bus kiểu PDL. Hàng `mute` trong bảng mục B chỉ còn là tuỳ chọn phụ, **không dùng mặc định**.
- T2b cho thấy khi Khói "bật FX" thì **cả 7 Send** đổi cùng lúc, kể cả `Send03` (→Main −20 dB), `Send05/06` (sidechain) và `Send08`. Có thể FX Auto/preset = "bật/tắt nhóm Send" (`INFERRED`) — **Khói cần xác nhận** nhóm Send nào thuộc Reverb, Delay, Com Verb; Send03/05/06 đi kèm nhóm nào.
- FX Auto hiện có 2 hành động (`FX_SEND_REVERB`, `FX_SEND_DELAY`) đã **đúng hướng** (Send), nhưng hiện không biết ánh xạ từng Send cho hai hành động đó (câu hỏi 5 ở mục E vẫn mở).
