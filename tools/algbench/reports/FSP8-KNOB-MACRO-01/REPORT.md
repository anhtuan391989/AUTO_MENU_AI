# FSP8-KNOB-MACRO-01 — Điều khiển 4 knob AUTO_MENU_AI trên Fender Studio Pro 8

Claude A : Task A: FSP8-KNOB-MACRO-01 (nghiên cứu Macro / Control Link cho 4 knob)

## 0. Kết luận ngắn
- **Macro KHÔNG dùng được cho knob liên tục** (lệnh có đối số tĩnh) → **không tạo file macro nào** cho 4 knob (tạo ra là "giả").
- Cơ chế đúng cho knob liên tục là **Control Link** (gán CC → fader/tham số). Menu đã gửi sẵn CC20–23 kênh 15.
- Không sửa code, không sửa HTML/UI. Mọi knob: **chưa có PASS** (chưa có test thật Windows + FSP8).

## 1. Trạng thái GitHub (VERIFIED_FILE)
- `main` HEAD = `1b9bb002b628230f05713ed802fc6cfd6004637e` (fetch lại, không đổi).
- File đã đọc: `ui/js/renderer.js` (KNOB_ID_TO_ACTION, dòng ~2765), `ui/js/actionRegistry.js` (executeAction, đổi 0–100 → CC 0–127, chống gửi trùng), `ui/js/setup.js` (profile CC), `ui/js/appSettings.js` (sendMidiCC), `main.js` (IPC midi-send), `Ảnh/Macros.zip` (307 macro tham khảo), `Ảnh/studio_one/QuangLuuMIDI.surface.xml` (chỉ tham khảo, KHÔNG dùng làm cấu hình).

## 2. Luồng dữ liệu
```
Knob Menu (0–100)
  → actionRegistry.executeAction(reason:"knob") : CC = round(v*127/100)
  → sendMidiCC (kênh 15, zero-based 14) → IPC midi-send → loopMIDI "AUTO MENU AI"
  → FSP8 External Device (Receive From = AUTO MENU AI)
  → Control Link (gán thủ công 1 lần):
       CC20 → fader track "Beat"      (MUSIC)      [PARTIAL]
       CC21 → fader "Main"/output     (MASTER)     [PARTIAL]
       CC22 → tham số Retune MIC1     (RETUNE 1)   [BLOCKED]
       CC23 → tham số Retune MIC2     (RETUNE 2)   [BLOCKED]
```
Macro **không nằm trong đường đi của giá trị knob**.

## 3. Bằng chứng về Macro (tài liệu Fender Studio Pro Manual, đọc 27/10/2026)
| Phát biểu | Nguồn |
|---|---|
| Đối số macro "đặt hành vi cụ thể" (vd. Edit Volume có `Level` dB, `Relative` 0/1) → giá trị **cố định trong macro** | Macro Toolbar |
| Macro gán được cho nút/điều khiển thiết bị, "nút là hợp lý nhất"; thiết bị lạ gửi CC cũng gán được lệnh | Macro Toolbar |
| Tài liệu **không nói** macro nhận giá trị liên tục | Macro Toolbar |
| `Edit Volume` là chỉnh gain sự kiện audio, **không phải fader kênh** | tên lệnh/đối số; 307 macro mẫu chỉ có lệnh này (VERIFIED_FILE) |
| Control Link: gán hardware→fader kênh Console hoặc tham số plugin bằng nút Assign (Alt+M), kéo icon bàn tay, hoặc chuột phải "Assign X to Y"; yêu cầu thiết bị đã có control map | Control Linking |
| Tài liệu **không nói** về soft takeover/pickup, relative/absolute | Control Linking |
| Thêm thiết bị: Options > External Devices > Add (New Keyboard), Receive From = cổng MIDI, mặc định mọi kênh | Set Up Your MIDI Devices |

Nguồn:
- https://fenderstudiopromanual.fender.com/en/Content/Editing_Topics/Macro_Toolbar.htm
- https://fenderstudiopromanual.fender.com/en/Content/Control_Link_Topics/Control_Linking.htm
- https://fenderstudiopromanual.fender.com/en/Content/Setup_Topics/Set_Up_Your_MIDI_Devices.htm

## 4. Triển khai được ngay / bị giới hạn
**Ngay (không cần code mới):** Menu đã gửi CC20–23 ch15 với profile "Studio Pro 8" (quick-fill). Việc còn lại nằm trong FSP8: tạo External Device + Control Link (mục 6).
**Giới hạn DAW/plugin:**
- Macro: chỉ giá trị tĩnh → không làm được knob liên tục (BLOCKED cho vai trò này).
- Không biết định dạng file control map/surface của FSP8 → **không tạo file cấu hình** (UNVERIFIED; file `QuangLuuMIDI.surface.xml` là bên thứ ba, không dùng).
- Retune: chưa biết plugin/instance Retune của MIC1/MIC2 (Auto-Tune? Melodyne?) và tham số có hiện trong Control Link không → BLOCKED.
- Giá trị CC tuyệt đối: lần xoay đầu fader sẽ **nhảy** tới giá trị knob (tài liệu không nêu pickup) → tiêu chí #4 chưa đạt được cam kết.

## 5. Bảng kết quả
| Knob | Mục tiêu | Trạng thái | Lý do | Loại bằng chứng |
|---|---|---|---|---|
| BEAT INPUT VOLUME | fader track `Beat` | **PARTIAL** | Menu gửi CC20 đúng (test mô phỏng đã có); Control Link tới fader được tài liệu xác nhận; chưa chạy thật trên FSP8; nhảy giá trị đầu chưa xác minh | VERIFIED_TEST (phía Menu) + INFERRED (phía DAW) |
| MASTER OUTPUT VOLUME | fader Main (đầu ra do dự án định nghĩa) | **PARTIAL** | Như trên (CC21). "Mức đầu ra" chưa được chốt trong dự án nền → cần chọn Main hay track khác | như trên |
| RETUNE SPEED MIC 1 | tham số Retune MIC1 | **BLOCKED** | Chưa xác định plugin/tham số; chưa có bằng chứng tham số điều khiển được | — |
| RETUNE SPEED MIC 2 | tham số Retune MIC2 | **BLOCKED** | như trên | — |
Ghi chú: không có kiểm thử thật Windows + FSP8 nào trong task này; không knob nào PASS.

## 6. Hướng dẫn cài đặt (chỉ để lần sau test; làm trong FSP8)
1. Menu: Setup → chọn **Studio Pro 8** → Quick-fill KNOB (CC20–23, kênh 15).
2. FSP8: Options > External Devices > Add > New Keyboard, Receive From = `AUTO MENU AI`, bật kênh 15.
3. Mở Console, xoay knob MUSIC trong Menu (hoặc gửi test) để control xuất hiện ở cửa sổ tham số bên phải.
4. Bấm vào fader track `Beat` → bấm **Assign** (Alt+M). Làm tương tự CC21 → fader Main.
5. Retune: chưa hướng dẫn (BLOCKED).

## 7. Việc còn lại (chỉ khi thật sự cần)
- Khói cho biết: plugin Retune đang dùng ở MIC1/MIC2 và tên tham số; "MASTER" là fader Main hay track khác.
- Test thật 2 chiều tăng/giảm + kiểm tra nhảy giá trị trên FSP8.

## 8. File
- Mới: `tools/algbench/reports/FSP8-KNOB-MACRO-01/REPORT.md`
- Sửa: không. Không có test mới (không có code mới). Không commit/push.

## 1–4 (định dạng Claude A)
1. File đã sửa: không (chỉ thêm REPORT.md).
2. Vì sao: Macro không hỗ trợ giá trị liên tục → không có gì để sửa trong Menu; cần Control Link.
3. Ảnh hưởng module: không.
4. Chưa làm: test thật FSP8; Retune (thiếu thông tin); chốt "MASTER".
