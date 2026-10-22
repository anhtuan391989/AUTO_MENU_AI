# 06 — Kết quả test T2 (file `T2.song` Khói gửi)

Mục tiêu T2: biết trường nào trong file đổi khi bật/tắt **đúng một** Send (Send04) trên bản sao.
Nhãn: `VERIFIED_FILE` · `VERIFIED_USER_STATEMENT` · `INFERRED` · `UNKNOWN`. Bảng so sánh đầy đủ: `evidence/t2-diff.txt`. Đây vẫn **chưa phải** `VERIFIED_RUNTIME` (không có log/ảnh DAW, chỉ có file lưu).

## 1. Kết luận ngắn
**T2.song không phải là bản chỉ đổi Send04.** So với `save new 2.1.song`, rất nhiều thứ khác cũng đã đổi, nên **không thể quy cho riêng Send04** → T2 **chưa trả lời được Q1 một cách chắc chắn**. Có một dấu hiệu ủng hộ giả thuyết cũ, ghi ở mục 3.

## 2. Những gì khác nhau (`VERIFIED_FILE`)
| Hạng mục | Gốc (`save new 2.1`) | `T2` |
|---|---|---|
| Tiêu đề / thời điểm lưu | `save new 2.1` | `T2`, lưu 2026-10-22 09:56:54 (cùng build `Studio Pro/8.0.0.110141`) |
| `Send01`…`Send06` trên `Group Mic`: `bypass` | **1** (cả 6) | **0** (cả 6, ghi tường minh `bypass="0"`) |
| `Send01`…`Send06`: `level`, `prefader`, `pan` | — | **không đổi** (giá trị y hệt) |
| `Send08` + bus `Com Verb` | có (bus, Send, thư mục preset, làn Volume) | **biến mất hoàn toàn** |
| Bus `Verb ngắn` gain | −12 dB | **−16 dB** |
| Bus `Delay` mute | 0 | **1** |
| Bus `Verb ngắn/dài/Delay` hiển thị trong mixer | ẩn | **hiện** |
| `Beat` / `L4 Ultramaximizer` bypass | không có (=0) | **1** |
| `Không Dây`: 12 insert bypass | 1 | không có (=0) — track vẫn mute |
| `Mic` làn automation Volume | có (12 B) | không còn |
| External Device | 1 thiết bị `AUTO MENU AI` | **2** thiết bị `AUTO MENU AI`, vẫn **0 lệnh gán** |
| Macro / phím / MIDI mapping | không có | **vẫn không có** (quét lại cùng kết quả) |
| `Lofi` / `IL Gross Beat` / `PanCake2` bypass; `Group Mic` mute | 1 / 1 / 1; 0 | không đổi |

## 3. Ý nghĩa cho các câu hỏi
- **Q1 (On/Off của Send):** cả 6 Send cùng đổi `bypass` 1→0 **trong một file có nhiều thay đổi khác**, nên chưa chứng minh được đơn lẻ. Nhưng kết quả **khớp** với giả thuyết "`bypass=1` = Send tắt, `0` = Send bật" (gốc: tất cả tắt theo mặc định FX tắt của Menu; T2: tất cả bật). → vẫn `INFERRED`, độ tin cậy **tăng nhẹ**, **chưa** `VERIFIED`. Cần một dữ kiện từ Khói (mục 5) để chốt.
- **Q2 (mức Send độc lập):** `bypass` đổi mà `level` **không đổi** ở cả 6 Send ⇒ trong file, On/Off và mức Send là **hai trường độc lập** (`VERIFIED_FILE`). Việc điều khiển riêng từng cái từ ngoài vẫn `UNKNOWN`.
- **Q3 (bus/plugin):** `AudioGroupChannel.mute` (Delay: 0→1) và `Insert.bypass` (L4: 0→1) đổi riêng, không kéo theo `Send.bypass` ở file này — nhưng vì nhiều thay đổi cùng lúc nên chỉ là **quan sát**, không phải kiểm chứng nhân quả.
- **Hệ quả thiết kế:** project của Khói **đang thay đổi** (đã xoá `Com Verb`/`Send08`). Đúng với quy tắc đã đặt ở `05`: không hard-code UID/tên; đối tượng không còn → `NOT_CONFIGURED`, không đoán. Các bảng `01`–`03` mô tả `save new 2.1`, **không còn khớp 100%** với T2 (xem bảng mục 2).
- **Điều khiển ngoài:** T2 **không** thêm macro/phím/MIDI mapping nào (`AUTO MENU AI` chỉ thêm một khai báo thiết bị rỗng) ⇒ cơ chế gửi lệnh vẫn `UNKNOWN`.

## 4. Vì sao T2 chưa dùng được làm bằng chứng sạch
Yêu cầu T2: bản sao của `save new 2.1`, chỉ đổi Send04, lưu. File nhận được có ≥10 thay đổi, gồm cả việc xoá bus, đổi gain, mute bus, hiện bus. Có thể Khói đã lưu từ project đang làm việc (không phải bản sao nguyên gốc) hoặc đã thử nhiều thứ trước khi lưu. Claude **không đoán** trạng thái hiển thị trong DAW từ file.

## 5. Cần từ Khói (một dữ kiện, rồi một test lại nếu muốn bằng chứng sạch)
1. **Dữ kiện chốt:** lúc lưu `T2`, trên giao diện FSP8, các Send `Send01–Send06` của `Group Mic` đang **Bật** hay **Tắt**? (Nếu "tất cả đang Bật" ⇒ ghi nhận `VERIFIED_USER_STATEMENT` + `VERIFIED_FILE` rằng `bypass=0` ↔ Send bật; vẫn không tính là `VERIFIED_RUNTIME`.)
2. **Test sạch (tuỳ chọn, chắc chắn hơn):** mở lại **bản sao nguyên gốc** `save new 2.1.song` → **không đổi gì khác** → bật Send04 **một lần** → Save As `T2b.song` → gửi. Sau đó (cùng cách) tắt lại và lưu `T2c.song`. Claude sẽ so từng cặp.

## 6. Bổ sung 22/10 16:00 — bộ file sạch `save new 2.1` (mới), `T2b`, `T2c` (`VERIFIED_FILE`)
Bằng chứng: `evidence/t2b-t2c-diff.txt`. Chênh lệch vài byte "state nhị phân" của Auto-Tune/IL Gross Beat là nhiễu do DAW ghi lại state.
| So sánh | Khác biệt thật |
|---|---|
| `save new 2.1` (mới) ↔ bản gốc đã dùng ở `01`–`05` | **Giống hệt** (Sends, kênh, insert, automation, External Device) |
| `save new 2.1` → **T2b** | **7/7 Send** (Send01–06 **và Send08**) `bypass` **1 → 0**; `level`/`prefader`/`pan` **không đổi**; 4 bus chuyển từ ẩn sang hiện trong mixer; thêm 1 khai báo External Device `AUTO MENU AI` rỗng. **Không** có mute bus, bypass insert hay gain nào đổi |
| T2b → **T2c** | **Chỉ** `Delay` (bus) `mute` **0 → 1**. 7 Send vẫn `bypass=0`, `level` không đổi |
| T2 (file trước) ↔ T2c | T2 = T2c **+** xoá bus `Com Verb`/`Send08`, `Verb ngắn` −16 dB, `Beat/L4` bypass, 12 insert `Không Dây` bypass→0, bỏ làn Volume của `Mic` ⇒ T2 là bản đang làm việc, không phải test sạch. Phần Send/`Delay mute` của T2 **trùng** T2c |
| Macro / phím / MIDI mapping | **Không có** ở cả 3 file (quét y hệt) |

### Khói đã nói (`VERIFIED_USER_STATEMENT`, 22/10)
> Khói thường bật/tắt FX bằng **Send của `Group Mic`**, **không** dùng **Mute (monitor) trên các kênh FX**.

### Kết luận cập nhật
- **Trường nào biểu thị "bật/tắt FX" khi Khói thao tác:** trong T2b, thay đổi cấu hình **duy nhất** (ngoài việc hiện bus) là `Send.bypass` của cả 7 Send ⇒ đây là trường tương ứng với thao tác của Khói. Mạnh hơn kết luận trước (`VERIFIED_FILE` cho "trường nào đổi"; hai file độc lập T2 và T2b cho cùng kiểu thay đổi).
- **Chiều của giá trị:** `bypass=1` = Send **tắt**, `0` = **bật** vẫn là `INFERRED` (rất khớp nhưng cần Khói xác nhận trạng thái hiển thị của `save new 2.1` và `T2b`).
- **7 Send đổi cùng lúc** (kể cả `Send03`→Main, sidechain `Send05/06`, `Send08`) ⇒ test này **chưa tách riêng từng Send**; "bật/tắt **một** Send độc lập" chưa kiểm (T2d).
- **Bus mute độc lập với Send:** T2c đổi `mute` bus `Delay` mà không đụng `Send.bypass` nào (`VERIFIED_FILE`). Nhưng cách Khói **dùng thật** là Send, nên **Send On/Off trên `Group Mic` là đích điều khiển mặc định của FX**; Mute bus chỉ là tuỳ chọn phụ.
- **Hệ quả cho preset:** PDL (Studio One 5) dùng Mute trên track/FX channel; Khói trên FSP8 dùng Send ⇒ **không sao chép kiểu "mute FX channel" của PDL sang FSP8**. Preset NORM/LOFI/RAP/REMIX trên project này nên được mô tả bằng bước `send_onoff` (và `plugin_bypass`), không phải `mute` bus.
- Điều khiển ngoài: vẫn `UNKNOWN` (không có macro/phím/MIDI mapping nào).

### Còn cần từ Khói
1. Xác nhận: trong `save new 2.1` các Send đang **Tắt**, trong `T2b` đang **Bật**? (ghi nhận hướng của `bypass`)
2. **T2d** (nếu muốn tách riêng từng Send): từ `save new 2.1`, chỉ bật **Send04** → Save As `T2d.song`; sau đó chỉ bật thêm Send01 → `T2e.song`.
