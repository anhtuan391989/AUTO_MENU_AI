# MIDI-DAW-CONTROL-01 — Hướng dẫn thử Menu ↔ Studio One 8 (ngắn, không cần code)

> Phần này **chỉ máy của Khói làm được**. Test tự động trong report chỉ dùng MIDI/DOM **giả**. Chỉ khi **thấy Studio One đổi thật** mới ghi PASS.
> Làm trên **bản sao** project (`LIVE_TEST.song` copy từ `save new 2.1.song`). **Không lưu đè project gốc.** Không đổi Send/gain/routing/plugin.

## 0. Chuẩn bị (1 lần)
1. Chép các file trong ZIP vào `G:\AUTO_MENU_AI` (giữ nguyên thư mục), auto-sync như mọi khi, **tắt hẳn rồi mở lại** Auto Menu AI.
2. loopMIDI đang bật, cổng `AUTO MENU AI`. Menu đã gửi được Note tới Studio One (bạn đã thử Note 60 — OK).
3. Cài 8 macro: chép 8 file trong `tools\algbench\reports\MIDI-DAW-CONTROL-01\macros\` (cũng giống hệt trong `LIVE-MIDI-FSP8-02\macros\`) vào thư mục macro của Studio One (Macro Organizer → **Show Macros Folder in Explorer**). Khởi động lại Studio One. Nhóm `LIVE_TEST` phải hiện đủ macro. Chụp ảnh.

## 1. Gán 8 CC vào 8 macro (Studio One)
Options → External Devices → thiết bị nhận từ `AUTO MENU AI` → mở device map → **học từng nút** bằng cách gửi CC từ Menu (Setup → MIDI → Test CC: **kênh 1 trong ô Test là kênh 1**; xem lưu ý dưới) → chuột phải nút → **Assign Command** → Macros → macro tương ứng:

| CC | Kênh | Value | Macro |
|---:|---:|---:|---|
| 102 | 16 | 127 | LIVE_MUSIC_ON |
| 103 | 16 | 127 | LIVE_MUSIC_OFF |
| 104 | 16 | 127 | LIVE_MIC1_ON |
| 105 | 16 | 127 | LIVE_MIC1_OFF |
| 106 | 16 | 127 | LIVE_MIC2_ON |
| 107 | 16 | 127 | LIVE_MIC2_OFF |
| 108 | 16 | 127 | LIVE_FX_ON |
| 109 | 16 | 127 | LIVE_FX_OFF |

> Nút Test CC trong Setup gửi **kênh 1**. Muốn học kênh 16: cách dễ nhất là bước 2 bên dưới (lưu mapping rồi bấm nút Menu), hoặc dùng công cụ MIDI ngoài (MIDI-OX) gửi CC 102…109 kênh 16.

## 2. Cấu hình Menu (Setup → MIDI → MIDI Output Mapping)
1. Chọn DAW (Studio One) nếu chưa chọn.
2. Cuối danh sách có **8 dòng** MUSIC/MIC 1/MIC 2/FX **ON/OFF**. Cách nhanh: bấm **“Điền + lưu bộ CC gợi ý LIVE”** (CC 102–109, kênh 16, giá trị 127) → xác nhận. Hoặc tự nhập từng dòng rồi **💾 Lưu**. Menu **từ chối lưu** nếu hai dòng trùng CC/kênh.
3. Trạng thái dòng ghi **“Đã lưu — chỉ gửi lệnh, DAW chưa xác nhận”** (đúng nghĩa: Menu **không đọc được** trạng thái Studio One).
4. Bấm nút **“Xoá 8 mapping ON/OFF”** bất cứ lúc nào để quay về lệnh toggle cũ (mapping cũ không bị đụng).

## 3. Test macro bằng tay (chưa dùng MIDI) — M1..M5
Trước mỗi test: Save As `Mx-truoc.song`; sau: `Mx-sau.song`.
| # | Làm | PASS khi |
|---|---|---|
| M1 | Chạy `LIVE_X_MON_BEAT_TOGGLE` 2 lần (macro gốc State rỗng) | Monitor **Beat** đổi mỗi lần (ghi: State rỗng có đảo không) |
| M2 | `LIVE_MUSIC_OFF` **×2**, rồi `LIVE_MUSIC_ON` **×2** | Sau OFF×2 Monitor Beat = **TẮT**; sau ON×2 = **BẬT** (lần 2 không đảo). **Điểm then chốt:** State 1 có thật là BẬT, 0 là TẮT? |
| M3 | Như M2 với `LIVE_MIC1_*` (track Mic) rồi `LIVE_MIC2_*` (track Không Dây) | Đúng track, độc lập nhau |
| M4 | `LIVE_FX_OFF` ×2, `LIVE_FX_ON` ×2 | OFF×2: cả 4 bus (Delay, Verb ngắn, Verb dài, Com Verb) **Mute = BẬT**; ON×2: cả 4 **Mute = TẮT**. Bus nào không đổi? (bus ẩn trong mixer có thể không tìm được) |
| M5 | So file truoc/sau | Chỉ Monitor (3 track) và Mute (4 bus) đổi; Send, gain, bypass, routing, Mute track **không đổi** |
Nếu State 0/1 của Monitor **ngược** (1 = TẮT): ghi lại, **đừng tự sửa** — gửi cho Claude đổi macro.

## 4. Test từ nút Menu — N1..N6 (chỉ khi M2–M4 PASS và đã gán CC ở bước 1)
Mở project **bản sao**. Quan sát trực tiếp Monitor `Beat`, `Mic`, `Không Dây` và Mute 4 bus.
| # | Làm | PASS khi |
|---|---|---|
| N1 | Bấm **MUSIC** (nút tối dần = TẮT) rồi bấm lại (sáng = BẬT) | Monitor Beat TẮT rồi BẬT đúng. Rê chuột lên nút: “đã GỬI lệnh … DAW chưa xác nhận” |
| N2 | **MIC 1** bấm (sáng = BẬT) rồi bấm lại | Chỉ Monitor **Mic** đổi |
| N3 | **MIC 2** như N2 | Chỉ Monitor **Không Dây** đổi |
| N4 | **FX** bấm (sáng = BẬT) rồi bấm lại | Cả 4 bus Mute TẮT rồi BẬT; **Send không đổi** |
| N5 | Lặp: đặt Menu về BẬT, bấm đến khi DAW ≠ Menu rồi bấm lại | Mỗi cú bấm **đặt đích** (không đảo) — lệch DAW/Menu do bạn đổi tay trong Studio One là **giới hạn đã biết** (xem dưới) |
| N6 | Save As trước/sau; đóng/mở lại Studio One + project, bấm lại | Không đổi trường ngoài phạm vi; macro/gán CC còn dùng được (hoặc ghi rõ nằm ở ứng dụng hay trong project) |

## 5. Giới hạn cần biết
- Menu **chỉ gửi** lệnh, **không đọc** được trạng thái Studio One. Lúc mở app: MUSIC sáng (BẬT), MIC 1/MIC 2/FX tắt — là **giả định**, Menu **không gửi lệnh nào khi khởi động**.
- Nếu bạn đổi Monitor/Mute trực tiếp trong Studio One, nút Menu **không biết** và có thể lệch.
- **FX Auto** (tự bật/tắt theo nhạc) vẫn điều khiển **Send Reverb/Delay** như cũ, **không** mute bus. Nút FX bấm tay (khi đã cấu hình FX ON/OFF) mute/bỏ mute **4 bus**. Hai việc khác nhau; nút FX có thể sáng theo Auto mà bus không đổi.

## 6. Báo lại
Từng mục M1–M5, N1–N6: **PASS/FAIL** + ảnh/file `.song` truoc/sau; câu trả lời “State của Monitor 1 = BẬT hay TẮT?”; ảnh tooltip nút khi lỗi; ảnh Macro Organizer và device map đã gán.
