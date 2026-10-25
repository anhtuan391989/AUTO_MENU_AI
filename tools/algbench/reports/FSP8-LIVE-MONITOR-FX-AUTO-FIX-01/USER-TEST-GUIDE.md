# HƯỚNG DẪN THỬ — FSP8-LIVE-MONITOR-FX-AUTO-FIX-01
Chỉ làm trên bản sao **`LIVE_TEST_CC.song`** (copy từ LIVE_TEST.song). Không mở/lưu bản gốc. Không sửa Send, gain, routing, macro `LIVE_*`.

## PHẦN 0 — Chép file (bạn tự làm như mọi lần)
1. Chép `changes/ui/js/renderer.js` → `G:\AUTO_MENU_AI\ui\js\renderer.js` (đè). Tests trong `changes/tests/unit/` chép vào `G:\AUTO_MENU_AI\tests\unit\`.
2. Tắt hẳn Menu rồi mở lại.

## PHẦN A — FX Auto phải thật sự bỏ Mute 4 bus
**Điều kiện (làm trước, đã có từ task trước):** Setup đã lưu **FX ON = CC108** và **FX OFF = CC109** (kênh 16, value 127); FSP8 đã học 2 CC này và gán macro `LIVE_FX_ON` / `LIVE_FX_OFF` (xem hướng dẫn FSP8-CC-TO-MACRO-FX-VERIFY-01). Thiếu một trong hai → Auto sẽ báo "CHƯA cấu hình FX ON/OFF" (đúng thiết kế, không tự dùng Send).

**Chuẩn bị:** trong FSP8 đặt tay 4 bus **Delay, Verb ngắn, Verb dài, Com Verb** = **Mute**. Nút FX trên Menu **tắt**. Nguồn nhạc (SYSTEM_AUDIO) đã cấu hình như mọi khi. Tắt nhạc.

| # | Việc | Mong đợi | Kết quả (Đạt/Không + ghi chú) |
|---|------|----------|-------------------------------|
| A1 | Phát nhạc | Trong ≈1 giây nút FX **sáng** VÀ cả 4 bus **bỏ Mute** | |
| A2 | Rê chuột lên nút FX (tooltip) | Nói "đã GỬI lệnh FX (Mute 4 bus) ON — DAW chưa xác nhận". KHÔNG nói "Send Reverb/Delay" | |
| A3 | Nhạc phát tiếp 30 s | Không có thay đổi lạ trong 4 bus | |
| A4 | Dừng nhạc ≥ 2 s | Nút FX **tắt** VÀ cả 4 bus **Mute** | |
| A5 | Phát nhạc lại | Bus bỏ Mute lại | |
| A6 | Đang có nhạc, bấm FX **tắt** bằng tay | 4 bus Mute ngay. Trong 60 s sau đó Auto **không** bật lại dù nhạc vẫn phát | |
| A7 | Chờ quá 60 s (nhạc vẫn phát) | Auto tiếp quản: nút sáng + 4 bus bỏ Mute | |
| A8 | Các track Group Mic / Beat / Mic / Không Dây | Không đổi Mute/Monitor/fader | |

**Nếu nút sáng nhưng 4 bus vẫn Mute:** ghi lại tooltip (chữ nguyên văn). Rồi bấm FX tay một lần: nếu tay chạy được mà Auto không chạy → báo tôi ngay kèm tooltip. Nếu cả tay cũng không chạy → lỗi ở bước gán CC↔macro (task trước), không phải ở Auto.
**Lưu ý:** bỏ Mute bus **không** chứng minh có tiếng vào bus. Nếu 4 bus đã bỏ Mute mà vẫn không nghe FX, chụp ảnh mức **Send** của track giọng sang 4 bus (chỉ xem, không sửa) và gửi tôi.
**Lưu ý khởi động:** Menu không đọc được trạng thái FSP8. Lúc mới mở Menu, nút FX = tắt nhưng bus có thể đang ở trạng thái khác. Nếu lệch, bấm FX tay 2 lần cho đồng bộ.

## PHẦN B — Monitor MUSIC / MIC 1 / MIC 2 (CHẨN ĐOÁN, chưa sửa)
Phía Menu đã được kiểm: mỗi lần bấm chỉ gửi **một** CC của đúng nút đó, không có lệnh nào tắt Beat khi bấm MIC 1. Nghi vấn nằm trong Studio Pro (xem REPORT mục 4). Phần này chạy **Action trong Studio Pro**, chưa dùng Menu.

**B0. Ghi trạng thái ban đầu (chụp ảnh):** Options → Advanced → Console → **Audio Input follows Selection**: đang Bật hay Tắt? Ghi lại: `____`. (Cuối phần B nhớ trả về đúng trạng thái này.)

**B1. Chép 6 macro** trong `macros/` vào `C:\Users\Khoi\Documents\Studio One\Macros`, Macro Organizer → Refresh. Nhóm tên `DIAG_MON`. Không sửa macro LIVE_*.

**B2. Chạy bằng nút Action** (mỗi dòng chụp ảnh nút Monitor của Beat, Mic, Không Dây sau khi chạy):

| # | Trạng thái chuẩn bị | Chạy | Ghi lại |
|---|---|---|---|
| B-1 | Đang chọn track **Group Mic**. Đặt tay: Beat Monitor **BẬT**, Mic Monitor **TẮT** | `DIAG_MON_MIC_1` (1 lần) | Mic Monitor bật ngay lần 1? Beat còn bật? Track nào đang được chọn? |
| B-2 | (tiếp) | `DIAG_MON_MIC_1` lần 2 | Có thay đổi gì thêm? |
| B-3 | Mic Monitor đang BẬT | `DIAG_MON_MIC_0` | Mic tắt ngay? Beat còn bật? |
| B-4 | Chọn **Group Mic**; Beat Monitor TẮT | `DIAG_MON_BEAT_1`, rồi `DIAG_MON_BEAT_0` | Mỗi lần có đổi đúng ngay không? |
| B-5 | Chọn Group Mic; Mic Monitor TẮT | `DIAG_MON_MIC_1_FIND2` | Khác B-1 không (lần 1 có đổi ngay không)? |
| B-6 | Chọn track **Mic** bằng chuột; Mic Monitor đang TẮT | `DIAG_MON_TOGGLE_SELECTED` rồi chạy lại lần nữa | Mỗi lần có đảo Monitor không? (cho biết lệnh có phải toggle) |

**B3. Thử tùy chọn nghi vấn (chỉ trên bản sao, nhớ khôi phục):** nếu B0 là **Bật** → tắt nó, lặp B-1 và B-3 với Beat Monitor bật sẵn; so sánh Beat có còn bị tắt không. Nếu B0 là **Tắt** → bật thử, lặp B-1, B-3. Xong → **trả về đúng trạng thái B0**.

**B4. Gửi lại tôi:** trạng thái B0, bảng B-1…B-6 (ảnh nút Monitor), kết quả B3. Chưa có kết quả này thì tôi **không** sửa macro LIVE_MUSIC/MIC1/MIC2 và không kết luận nguyên nhân.

## Không được làm
Không sửa Send/gain/routing/plugin, không lưu `.song` gốc, không sửa macro LIVE_*, không đổi 8 mapping ON/OFF.
