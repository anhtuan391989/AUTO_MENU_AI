# 03 — Ma trận cơ chế điều khiển: Fender Studio Pro 8 vs Cubase Pro 13

Hai DAW **không tương đương**. Nguồn: tài liệu hãng (PARTIAL, chưa test trên máy Khói), cộng file PDL (VERIFIED khi đọc file). Nguồn chi tiết: `PDL-PRESET-VERIFY-03/web-sources.txt`, `PDL-PRESET-VERIFY-04/web-sources-v4.txt`.

| Tiêu chí | Fender Studio Pro 8 (= Studio One 8) | Cubase Pro 13 | Nhãn |
|---|---|---|---|
| Đơn vị "preset" | **Macro** (chuỗi lệnh, nút Macro Toolbar) | **Project Logical Editor (PLE) preset** + Key Command | PARTIAL |
| Gán phím | Macro Organizer / Keyboard Shortcuts | Edit > Key Commands → nhóm Process Project Logical Editor → ô Type in Key → Assign | PARTIAL |
| Phím mẫu trong gói PDL | F5–F8 cho Mic/Vang (preset NORM/LOFI/RAP/REMIX **không** có phím) | F9 NORMC, F10 LOFIC, F11 RAP, F12 RAPC (REMIX không phím) | VERIFIED (file) |
| Gán MIDI | External panel → device map → "Assign Command" tới macro/lệnh | **Generic Remote** (VST Mixer hoặc thiết bị **Command**, cờ Push Button/Toggle) hoặc **MIDI Remote** (map theo project, từ Cubase 12) | PARTIAL |
| CC → tham số tuỳ ý | **Không có tài liệu** (UNKNOWN) | Có qua MIDI Remote (CC→Volume/Mute/plugin param, tag) | UNKNOWN / VERIFIED (file PDL) |
| Địa chỉ đối tượng | Theo **tên** (Find Channel…) trong macro | Generic Remote: **theo vị trí kênh mixer** (bank VST 1–16); MIDI Remote: theo **đường dẫn đối tượng** trong project (`VST Mixer\Channels\FxChannel 5`) | VERIFIED (Cubase file) |
| Mute kênh FX | Macro lệnh `Mute` (category Track, ảnh hưởng kênh FX chưa chắc) | Tag 1027 (Mute) / PLE Target Track | UNKNOWN (FSP8) |
| Send | Console có Send, pre-fader, mức; chưa thấy lệnh macro Send trong gói | Generic Remote có Send-1/2 CC12/13 (hạ tầng); PDL chưa dùng | PARTIAL |
| Volume kênh FX | Fader console | tag 1025 (MIDI Remote PDL dùng) | VERIFIED (Cubase) |
| Plugin bypass/param | Chưa rõ qua macro | MIDI Remote slot insert + tag (ví dụ 10004202 cho EQ) | VERIFIED (Cubase file) |
| Phạm vi lưu cấu hình | Macro/keyscheme/External: đường dẫn **UNKNOWN** | Key Commands lưu Preferences (mọi project); Generic Remote lưu user; **MIDI Remote nằm trong project** | PARTIAL |
| Nguy cơ | Mute macro không đúng kênh FX; phím tắt ngoài cửa sổ DAW | Phím/PLE phụ thuộc phiên bản (10–12 khác 13–15); MIDI Remote gắn project nên không dùng chung | INFERRED |
| Tên file chạy | UNKNOWN (Khói chưa cung cấp) | `Cubase13.exe` (INFERRED theo mẫu `Cubase14.exe` của tác giả) | UNKNOWN / INFERRED |

## Kết luận
- **Không** dùng chung một "mã lệnh" cho hai DAW: phím, tên nhóm lệnh, kiểu địa chỉ khác nhau.
- Phần có thể dùng chung là **ý nghĩa preset** (ví dụ "bật chế độ X" + trạng thái mong đợi), còn cách gửi lệnh là của từng DAW/phiên bản → xem `04`.
