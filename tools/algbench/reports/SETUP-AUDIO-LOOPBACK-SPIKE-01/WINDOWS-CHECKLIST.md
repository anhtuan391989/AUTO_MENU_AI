# Checklist Windows tối thiểu — LOOPBACK-SPIKE-01
Chạy spike (xem `spike/README.md`). Đặt DAW/nhạc phát ra thiết bị Windows mặc định. Với mỗi dòng: chọn nhãn → làm → bấm "Ghi mốc". Điền PASS/FAIL.
| # | Phép thử | Kỳ vọng nếu dùng được | Kết quả |
|---|---|---|---|
| 0 | Mở spike, đọc dòng đầu: Electron/Chromium/win32. Bấm "Bật loopback" (mode `loopback`) | Có "Audio track" + settings, không lỗi | |
| 1 | Chỉ phát nhạc từ DAW, im lặng | LOOPBACK nhảy | |
| 2 | Bật mic (Mix 01), chỉ nói, không nhạc | LOOPBACK **không** nhảy (mic không lọt) | |
| 3 | Mở video YouTube/trình duyệt khác | Ghi: LOOPBACK có nhảy? (nếu có ⇒ thu cả system mix, không chỉ DAW) | |
| 4 | Bấm "Phát bíp 440Hz" (giả lập CLAP/LAUGH) khi không có nhạc | Ghi: LOOPBACK có nhảy? (nếu có ⇒ lọt tiếng của chính app; thử lại với `loopbackWithMute`) | |
| 4b | Lặp 1–4 với mode `loopbackWithMute`; ghi nghe được nhạc ở loa không (có bị câm không) | Ghi rõ khác biệt | |
| 5 | Bấm "Tắt loopback" rồi Task Manager/Chrome task: không còn tiến trình/CPU bất thường; bật lại được | Tài nguyên được giải phóng | |
| 6 | Phát nhạc + nói đồng thời, 30 giây | Không tiếng rít/lặp; LOOPBACK chỉ theo nhạc | |
| 7 | Log "Constraints hỗ trợ restrictOwnAudio/suppressLocalAudioPlayback" và `getSettings()` | Ghi giá trị thật | |
