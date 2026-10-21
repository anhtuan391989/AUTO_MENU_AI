# 02 — Bản đồ chức năng: PDL → project Fender Studio Pro 8 của Khói

**Phạm vi & giới hạn dữ liệu (quan trọng):**
- Khói mô tả: project FSP8 **không có các track preset kiểu PDL** (NORM/LOFI/REMIX) nhưng **có kênh FX và Send riêng**.
- Gói `KET_QUA_VERIFY04` **KHÔNG tìm thấy** (đã tìm trên đĩa, GitHub, Google Drive). Vì vậy **tên kênh FX, tên Send, trạng thái mixer thật của Khói = BLOCKED**. Bản đồ dưới đây ở **mức chức năng**, không dùng tên giả, không yêu cầu đổi tên track, không yêu cầu sửa cấu hình DAW.
- Không có kết quả nào ở đây là test trên DAW thật.

## A. Bản đồ chức năng

| # | Chức năng PDL (bằng chứng) | Tương ứng trong project của Khói | Nhãn | Ghi chú / điều còn thiếu |
|---|---|---|---|---|
| 1 | **Chuyển track NORM/LOFI/REMIX** bằng Mute (macro Studio One) | **Không có đối tượng tương ứng** (project không có track preset) | VERIFIED (PDL) / **không áp dụng** cho project | Không tạo track giả. Preset kiểu "đổi track" không thể chạy nguyên trạng trên project này. |
| 2 | **Tính chất LOFI/REMIX nằm trong insert của track riêng** (EQ trên track LOFI; PJ 01 CC20 → EQ slot 11) | Không có | INFERRED | Nếu muốn "chất lofi" cần dùng insert/kênh sẵn có của Khói — **BLOCKED**: chưa biết insert nào Khói có. |
| 3 | **Mute kênh FX DELAY/VERB1/VERB2** (macro BatVang/TatVang; RAP tắt VERB1) | Kênh FX riêng của Khói (có theo lời Khói) | PARTIAL | **BLOCKED**: tên kênh FX thật. Chỉ khớp nếu Mute của macro tác động đúng kênh FX (lệnh `Mute` thuộc category "Track" kể cả sau `Find Channel` → **UNKNOWN**). Không giả định khớp theo tên DELAY/VERB. |
| 4 | **Volume kênh FX** (MIDI Remote Cubase: CC1/2/3/11 → FxChannel, tag 1025) | Fader kênh FX của Khói | VERIFIED (PDL/Cubase) / chưa xác minh phía FSP8 | Là núm tay, không phải preset. |
| 5 | **Send từng track → kênh FX** | Send riêng của Khói | **UNKNOWN** — "PDL điều khiển Send" **chưa được chứng minh** | Không có file PDL nào nhắm tới Send. Menu hiện có `FX_SEND_REVERB/DELAY` + FX Auto (điều khiển Send) — đó là **chức năng của Menu**, tách khỏi PDL. |
| 6 | **Mic / Vang bật-tắt** (Studio One BatMic F6, TatMic F5, BatVang4 F8, TatVang4 F7) | Mute track mic và kênh FX vang của Khói | PARTIAL | Phím F5–F8 có trong keyscheme mẫu; **chưa biết** keyscheme thật của Khói. BLOCKED: danh sách phím tắt/macro của Khói. |
| 7 | **Núm Beat/Mic volume** (MIDI Remote: CC4/CC5) | Fader track nhạc/mic của Khói | VERIFIED (PDL/Cubase) | Theo vị trí/tên kênh trong project mẫu, không tự khớp với project khác. |
| 8 | **Mute tổng** (CC24 → tag 1027 trên 1 kênh audio) | Mute của kênh tương ứng | VERIFIED (Cubase) | Chỉ 1 kênh/ project mẫu. |
| 9 | **Auto-Tune/SoundShifter/sMax** (CC8/9/10/15–18/22) | Plugin tương đương của Khói (nếu có) | VERIFIED (Cubase) | Gắn theo **plugin cụ thể** (VST Auto-Tune 8.1…), không dùng được chung cho FSP8 nếu không có plugin đó. |
| 10 | **Preset REMIX** | Không có | UNKNOWN | Không có đường kích hoạt nào trong file. |

## B. Kết luận cho Khói
1. Project của Khói **không thể** nhận preset PDL dạng "đổi track" — vì không có track tương ứng và **không nên tạo track giả**.
2. Phần có thể ánh xạ về sau: **Mute/Volume kênh FX** và **Mute mic/vang**, nhưng **chỉ sau khi** có tên kênh thật (BLOCKED).
3. **Send** là cơ chế riêng của Menu/FX Auto, không phải PDL — tránh gộp.
4. Việc chọn "preset nghĩa là gì trên project của Khói" là **quyết định thiết kế của Khói**, chưa quyết trong task này.

## C. Dữ liệu còn thiếu (BLOCKED, chính xác)
Từ `KET_QUA_VERIFY04` hoặc bản gửi lại:
- Phiên bản FSP8 (Help > About) và tên file chạy.
- Danh sách macro, phím tắt, nút Macro Toolbar, cấu hình External panel (device map).
- Ảnh mixer (đã che dữ liệu riêng) cho: kênh FX, Send (tên + mức), trước/sau khi bấm từng nút.
- Kết quả bấm Mute của macro lên kênh FX (có tác động đúng không).
- Log MIDI/phím khi bấm từng preset trong PDL thật; nội dung `mode_overrides`.
