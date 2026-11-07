# FSP8-FINDTRACK-VERIFY-01 — MỘT phép thử: `Find Track` có chọn đúng track theo tên không? (~2 phút)

> Không làm lại SEL-1 / D1–D5. Không cài thêm macro (macro `DIAG_B2_FINDTRACK_BEAT` **đã có** trong Macro Organizer nhóm DIAG_TEST, bạn đã thấy trong ảnh). Chỉ **chọn track — không bấm M/S/Monitor**. Làm trên bản sao `LIVE_TEST.song`, không lưu đè project gốc.

## Chỉ báo dùng để quan sát (đã thấy trong ảnh SEL-1 của bạn)
**Hàng track đang chọn trong danh sách track (Arrange) sáng/đậm màu hơn** các hàng khác cùng màu. Ví dụ ảnh SEL-1: hàng `Mic` sáng hơn hàng `Không Dây`. Vì màu `Beat` (xanh ngọc) khác `Mic` (xanh dương), bước 1 dưới đây chụp thêm **ảnh tham chiếu "Beat đang được chọn trông thế nào"** để so sánh chắc chắn.
(Tuỳ chọn, chỉ là phụ: bật **Inspector** bằng phím **F4** hoặc nút **i** dưới Arrange; nếu nó hiện tên track đang chọn thì ghi lại. Không bắt buộc.)

## Thực hiện (3 ảnh)
1. Bấm chuột vào tên track **`Beat`** (hàng 1). 📷 **Ảnh A (tham chiếu):** chụp danh sách track thấy hàng `Beat` đang được chọn.
2. Bấm chuột vào tên track **`Mic`** (hàng 2). 📷 **Ảnh B (trước):** hàng `Mic` được chọn, `Beat` không.
3. Chạy **một lần duy nhất** macro **`DIAG_B2_FINDTRACK_BEAT`** bằng nút **Action** trên Macro Toolbar (nhóm DIAG_TEST). **Không** chạm gì thêm. 📷 **Ảnh C (sau):** cùng khung như B.

## PASS / FAIL
- **PASS:** ở ảnh C, hàng **`Beat`** sáng như ở ảnh A và hàng `Mic` **không còn** sáng (selection đã chuyển từ `Mic` sang `Beat`).
- **FAIL:** ảnh C vẫn giống ảnh B (`Mic` vẫn được chọn, `Beat` không).
- **KHÔNG RÕ:** ảnh C không phân biệt được hàng nào được chọn → gửi ảnh, **không** thử macro khác; Claude sẽ nêu cách quan sát khác.
- Nếu **nhiều** hàng cùng sáng hoặc hàng khác với `Beat` sáng: ghi rõ hàng nào, gửi ảnh.

## Gửi lại
Ba ảnh A, B, C (toàn màn hình, thấy danh sách track). Không cần gì khác.
