# LIVE-MIDI-FSP8-02 — Hướng dẫn Khói thử trên FSP8

Làm trên **bản sao** `LIVE_TEST.song` (copy từ `save new 2.1.song` ở thư mục gốc repo; không lưu đè bản gốc). Không cần lập trình.
PASS chỉ khi **thấy DAW đổi thật** (nút trong Console / nghe / file lưu). Macro gốc của Khói không bị đụng: 11 macro mới có tên bắt đầu `LIVE_`.
Nhãn macro: **EXPERIMENTAL** = cú pháp chưa chạy thật.

## A. Cài 11 macro
1. Mở FSP8 → Macro Organizer → bấm **Show Macros Folder in Explorer** (nút dưới cùng) để biết thư mục macro.
2. Copy 11 file `macros/*.studioonemacro` vào thư mục đó (chỉ thêm, không ghi đè file nào của Khói). Khởi động lại FSP8 (nếu macro chưa hiện).
3. Macro Organizer: phải thấy nhóm `LIVE_TEST` có 11 macro. Chụp ảnh.
4. **Nếu không hiện / lỗi:** ghi FAIL kèm ảnh. Cách dự phòng: tự tạo macro trong Macro Organizer với đúng các lệnh ghi trong mỗi file (Find Track → Name; Track|Monitor → State; Find Channel → Name; Track|Mute → State) rồi chụp danh sách lệnh bạn thấy.
5. Mở macro `LIVE_MUSIC_ON`: lệnh **Track|Monitor** có ô `State` không? Chụp. (Quan trọng: macro gốc `Monitor` chỉ có State rỗng.)

## B. Test tay (chưa dùng MIDI) — T1..T5
Trước mỗi test: Save As `Txx-truoc.song`; sau: `Txx-sau.song`. Ghi trạng thái Monitor/Mute trước.
| # | Làm | PASS khi |
|---|---|---|
| T1 | Chạy `LIVE_X_MON_BEAT_TOGGLE` 2 lần | Monitor của **Beat** (và chỉ Beat) đổi mỗi lần. Ghi: State rỗng = đảo? |
| T2 | Chạy `LIVE_MUSIC_OFF` **2 lần liên tiếp**, rồi `LIVE_MUSIC_ON` **2 lần** | Sau OFF×2 Monitor Beat = Tắt; sau ON×2 = Bật (không đảo ở lần 2). Đây là điều kiện "đặt đích danh" |
| T3 | Như T2 với `LIVE_MIC1_*` (track Mic) rồi `LIVE_MIC2_*` (track Không Dây) | Đúng track, độc lập nhau; track khác không đổi |
| T4 | Chạy `LIVE_X_BUS_DELAY_MUTE1`, rồi `LIVE_X_BUS_VERBNGAN_MUTE1` | Mute của đúng bus Delay / Verb ngắn bật. Nếu bus **ẩn** trong mixer mà macro không tìm được → FAIL, ghi rõ (bản `Project FSF8.zip` ẩn bus, bản gốc repo hiện) |
| T5 | Chạy `LIVE_FX_OFF` 2 lần, rồi `LIVE_FX_ON` 2 lần | OFF×2: cả 4 bus Mute=1; ON×2: cả 4 bus Mute=0. Ghi bus nào không đổi |
| T6 | So file | Claude so `truoc/sau`: chỉ `monitorActive` (3 track) và `mute` (4 bus) đổi; Send, gain, bypass insert, routing, Mute track không đổi |
Nếu 7 Send của `Group Mic` đang tắt (bản trong zip) thì FX bật cũng **không nghe thấy** — ghi nhận, đừng tự đổi Send.

## C. Gọi từ MIDI — T7..T9
1. Options → External Devices: dùng thiết bị đã có (`loop` hoặc `AUTO MENU AI`) hoặc Add → New Keyboard; **Receive From** = cổng loopMIDI mà Menu đang gửi tới. Chụp.
2. Mở Console → panel External → bấm đúp thiết bị để mở device map.
3. Học nút: Menu → Setup → MIDI → Test (hoặc MIDI-OX) gửi **CC 102, kênh 16, giá trị 127** (bảng ở `control-surface/README-MANUAL-CONFIG.md`). Ghi lại FSP8 có hiện nút học được không; chụp. Lặp cho CC 103…109 (8 nút).
4. Với mỗi nút: chuột phải → **Assign Command** → ô tìm gõ `macros` → chọn macro tương ứng (102→LIVE_MUSIC_ON, 103→LIVE_MUSIC_OFF, …). Chụp bảng gán.
5. **T7** — gửi từng CC (127): macro chạy đúng như T2–T5? Kết quả giống chạy tay?
6. **T8** — ON/OFF bằng hai CC khác nhau, mỗi cái **2 lần** liên tiếp: trạng thái đích danh đúng? Có lần nào FSP8 chạy macro 2 lần cho 1 message không (xem MIDI Monitor)?
7. **T9** — Gửi giá trị **0** tới CC 102: FSP8 có chạy macro không? (chỉ để biết; Menu sẽ không gửi 0.)
8. Save As `T9-sau.song`, **đóng hẳn FSP8**, mở lại `T9-sau.song` rồi gửi lại CC: còn chạy? Mở **project trống mới** gửi lại: còn chạy? (cho biết gán nằm ở ứng dụng hay trong project.)

## D. Bốn nút Menu (T10) — chỉ khi T7/T8 PASS
Chưa sửa Menu. Có thể thử bằng công cụ gửi trong Setup → MIDI Output Mapping: nhập tạm CC 102… vào các hàng MONITOR BEAT/MIC1/MIC2 và kiểm tra Menu gửi đúng message (xem Setup → Monitor). Hiện Menu chỉ có **một** mapping cho mỗi nút nên chưa phân biệt ON/OFF (xem `REPORT.md` mục 6); đừng kết luận Menu "đã chạy" nếu chưa thấy FSP8 đổi.

## Checklist PASS/FAIL — bốn nút LIVE
| Nút | Cài macro | Tìm đúng đối tượng theo tên | ON/OFF đích danh (×2) | Không đụng ngoài phạm vi | Từ MIDI | Kết quả |
|---|---|---|---|---|---|---|
| MUSIC (Beat) | ☐ | ☐ | ☐ | ☐ | ☐ | PASS / FAIL |
| MIC 1 (Mic) | ☐ | ☐ | ☐ | ☐ | ☐ | PASS / FAIL |
| MIC 2 (Không Dây) | ☐ | ☐ | ☐ | ☐ | ☐ | PASS / FAIL |
| FX (4 bus) | ☐ | ☐ (từng bus) | ☐ | ☐ | ☐ | PASS / FAIL |
| Lưu/khôi phục (T9) | — | — | — | — | ☐ | PASS / FAIL |

## Gửi lại
Ảnh (macro hiện, State của Monitor, device map đã gán, MIDI Monitor), các file `.song` truoc/sau của T2, T5, T9, câu trả lời T1 (State rỗng có đảo không), T9 (CC 0 có chạy không), và kết quả PASS/FAIL.
