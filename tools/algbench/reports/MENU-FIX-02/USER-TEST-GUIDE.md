# HƯỚNG DẪN TEST — MENU-FIX-02 (MIC 1 / MIC 2 / MUSIC + FX Auto)

## A. Cài một lần (khoảng 5 phút)
1. Copy các file trong zip vào `G:\AUTO_MENU_AI` (đúng đường dẫn). **Xoá `tests\unit\MenuFix01.verify.js` nếu đã copy bản trước** (bản "gửi lại" đã bị gỡ).
2. Copy 3 file trong `macros\` (`LIVE_SEL_MIC1`, `LIVE_SEL_MIC2`, `LIVE_SEL_MUSIC`) vào `C:\Users\Khoi\Documents\Studio One\Macros` → trong Studio Pro **Refresh** macro.
3. Trong Control Surface "AUTO MENU AI": MIDI Learn + Assign (giống 8 macro LIVE_* đã làm):
   - CC 110 kênh 16 → `LIVE_SEL_MUSIC`
   - CC 111 kênh 16 → `LIVE_SEL_MIC1`
   - CC 112 kênh 16 → `LIVE_SEL_MIC2`
4. Mở Menu → Setup → MIDI Output Mapping → bấm **"Điền + lưu bộ CHỌN TRACK gợi ý"** → xác nhận. (Hoặc tự nhập 3 dòng "… CHỌN TRACK".)
5. Giữ nguyên 8 macro `LIVE_*_ON/OFF` và CC 102–109 như hiện tại.
6. Khởi động lại Menu (để nạp code mới).

## B. Chuẩn bị trạng thái
Menu **không đọc được** trạng thái Studio Pro. Trước khi test: tắt Monitor Beat/Mic/Không Dây trong Studio Pro, và để 3 nút MUSIC/MIC 1/MIC 2 trên Menu ở trạng thái KHÔNG sáng (nút MUSIC mặc định sáng = bật → bấm 1 lần cho tắt, hoặc bật Monitor Beat cho khớp).

## C. Test Monitor
1. Chọn track "Com Verb" → bấm **MIC 1** một lần → Monitor Mic bật; Com Verb không đổi. Bấm lại → Mic tắt.
2. Chọn track Mic → bấm **MIC 2** → chỉ Monitor "Không Dây" đổi; **Monitor Mic KHÔNG đổi**. Lặp lại vài lần bất kể đang bật hay tắt.
3. Lặp với **MUSIC**. Bấm nhanh MIC 1 rồi MIC 2: mỗi nút chỉ đổi đúng track của nó (cách nhau ~0,3 s).
- Nếu hơi trễ/chưa kịp: đặt setting `dawSelectSettleMs` lớn hơn (mặc định 300, tối đa 2000).

## D. Test FX Auto
Setup có FX ON = CC108, FX OFF = CC109 (đã gán macro `LIVE_FX_ON/OFF`). Bật Auto (công tắc) → phát nhạc: nút FX sáng **và** 4 bus FX (Delay/Verb ngắn/Verb dài/Com Verb) trong Studio Pro phải bỏ Mute. Dừng nhạc ~10 s → FX tắt, 4 bus Mute lại. Bấm tay FX → Auto nhường 60 s.

## E. Báo lại
Với từng nút: Đạt/Không đạt, ảnh mixer trước/sau. Nếu MIC 2 vẫn làm Mic đổi: chạy macro `LIVE_MIC1_ON` bằng Action **2 lần liên tiếp** — nếu Monitor Mic bật rồi tắt thì xác nhận macro là lệnh ĐẢO (đúng giả thuyết); báo kết quả.
