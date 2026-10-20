# Checklist C — Cubase 13/14/15: kiểm thử F9–F12 và các preset PLE
Không cần lập trình. Làm trên Cubase thật. Chưa có ảnh/log = `BLOCKED_USER_TEST`. Không có DÂN CA.
Không giả định Studio One và Cubase tạo ra cùng trạng thái mixer — ghi riêng từng DAW.

## C0. Thông tin máy
| Mục | Giá trị |
|---|---|
| Cubase phiên bản chính xác (Help > About) và tên tiến trình (Task Manager > Details; PDL tác giả dùng `Cubase14.exe`) | |
| Tên project mẫu; tên các kênh FX trong Mixer (gói PDL mẫu dùng "Vang 1/2/3", "Delay"; bộ lọc PLE RAP dùng tên "Verb1", "Delay", "Verb3") | |

## C1. Phím tắt F9–F12 (File > Key Commands)
Trong cửa sổ Key Commands, ô tìm kiếm gõ lần lượt `NORM`, `LOFI`, `RAP`, `REMIX`, `RESET` (nhóm Project Logical Editor). Chụp từng kết quả.
Dữ liệu từ gói PDL (file `Key Commands.xml` Cubase 13/14/15, VERIFIED đọc file): F9=NORMC, F10=LOFIC, F11=RAP, F12=RAPC; `REMIX` và `REMIXC` KHÔNG có phím; `NORM`, `LOFI` không có phím (hoặc không tồn tại trong file).
| Lệnh | Phím trên máy Khói | Khớp gói PDL? |
|---|---|---|
| NORMC | | F9 |
| NORM | | không có phím |
| LOFIC | | F10 |
| LOFI | | không có phím |
| RAP | | F11 |
| RAPC | | F12 |
| REMIX | | không có phím |
| REMIXC | | không có phím |
| RESET | | không có phím |
Kiểm tra trùng: phím F9, F10, F11, F12 còn gán cho lệnh Cubase mặc định nào khác không (Cubase sẽ cảnh báo trùng khi gán; nếu trùng, ghi tên lệnh)? ____ (Trong file Key Commands của gói không thấy trùng giữa các lệnh có tên preset; phần mặc định của Cubase chưa kiểm tra: UNKNOWN.)

## C2. Xuất các PLE còn thiếu (Khói làm, Claude A không có các file này)
Gói PDL chỉ chứa PLE `RAP.xml` và `RAPC.xml`. Cần thêm:
| Preset cần file PLE | Vì sao cần | Có trong gói? |
|---|---|---|
| NORMC (F9) | đang gán phím F9 | KHÔNG |
| LOFIC (F10) | đang gán phím F10 | KHÔNG |
| REMIXC | tên có trong Key Commands nhưng không có phím | KHÔNG |
| REMIX | tên có trong Key Commands (13+) nhưng không có phím | KHÔNG |
| NORM, LOFI | tên có trong Key Commands (LOFI) / chưa rõ có tồn tại (NORM) | KHÔNG |
| RESET | tên có trong Key Commands; chức năng chưa rõ (UNKNOWN) | KHÔNG |
| RAP, RAPC bản trên máy Khói | đối chiếu với bản trong gói (cùng nội dung không?) | CÓ trong gói (Cubase 14) |
Cách lấy: (1) Mở Cubase > Project > Logical Editor (Project Logical Editor). (2) Ở ô Preset, chọn từng preset trên, chụp CẢ cửa sổ (phần Filter và phần Actions, phóng to đọc được). (3) Tìm file `<tên>.xml` trong thư mục Presets của Cubase: cấu trúc trong gói PDL là `Steinberg\Cubase\User Presets\Project Logical Editor\RAP.xml` (suy ra từ gói zip, INFERRED); dùng File Explorer tìm `RAP.xml` trong `%APPDATA%\Steinberg` để biết thư mục thật, rồi gửi các file `NORMC.xml`, `LOFIC.xml`, `REMIXC.xml`, `REMIX.xml`, `NORM.xml`, `LOFI.xml`, `RESET.xml` (nếu có). (4) Nếu không tìm thấy file, chụp ảnh là đủ.
Cần thêm ảnh danh sách đầy đủ preset trong ô Preset của PLE.

## C3. Trạng thái mixer trước/sau (mỗi phím F9, F10, F11, F12; lặp 2 lần)
Ghi cho mỗi kênh FX trong Mixer (Vang 1/2/3, Delay hoặc tên thật): **Mute** bật/tắt, **Send** (ở track vocal gửi tới kênh đó, ghi dB), fader. Chụp Mixer trước/sau.
| Phím / lệnh | Lần | Trạng thái xuất phát | Mute từng FX | Send từng FX | Track/Group nào đổi? | Ảnh |
|---|---|---|---|---|---|---|
| F9 NORMC | 1 | | | | | |
| F9 NORMC | 2 (lặp) | | | | | |
| F10 LOFIC | 1 / 2 | | | | | |
| F11 RAP | 1 / 2 | | | | | |
| F12 RAPC | 1 / 2 | | | | | |
Chuỗi: F9 → F10 → F9 → F11 → F9 → F12 → F9. Câu hỏi: kết quả có lặp lại như nhau mỗi lần chạy không? ____
Thử cả 2 trường hợp cửa sổ đang chọn: cửa sổ Project, cửa sổ Mixer (phím có chạy ở cả hai không?).

## C4. Phân biệt RAP và RAPC (không tự kết luận ý nghĩa Function/Type/Val)
Từ file PLE trong gói (VERIFIED đọc file): `RAP.xml` và `RAPC.xml` chỉ khác một trường `Val` (0 ở RAP, 1 ở RAPC); cùng `Function=335`, `Type=4012`. Ý nghĩa của các số này: UNKNOWN.
Thử: đưa mixer về trạng thái xuất phát GIỐNG NHAU rồi chạy RAP (F11), chụp; đưa về xuất phát giống nhau rồi chạy RAPC (F12), chụp. Ghi khác nhau ở đâu (Mute? Send? track nào?). Mở cửa sổ PLE chọn từng preset và chụp phần Actions.
| Quan sát | RAP (F11) | RAPC (F12) |
|---|---|---|
| Thay đổi so với xuất phát | | |
| Có đổi Mute FX? | | |
| Có đổi Send? | | |

## C5. Kết luận cho Khói tự điền
| Preset | Chạy được trên Cubase thật? | Ảnh/nhật ký |
|---|---|---|
| NORM (NORMC) | | |
| LOFI (LOFIC) | | |
| RAP / RAPC | | |
| REMIX (REMIXC / REMIX) | | |
Mặc định (chưa điền) = `BLOCKED_USER_TEST`.
