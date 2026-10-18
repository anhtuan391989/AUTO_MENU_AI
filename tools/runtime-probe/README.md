# runtime-probe — kiểm thử Electron THẬT (Linux + Xvfb) cho Auto FX và lưu trạng thái nút

Công cụ phụ trợ của MENU-FX-AUTO-OFF, KHÔNG chạy trong app. Cần: `node_modules/electron` đã tải binary (`node node_modules/electron/install.js`), `playwright`, `xvfb-run`.
- `gen_test_wav.py <out.wav>`: file thử cho thiết bị audio giả (nền nhiễu -75 dBFS / nhạc / số 0).
- `fxtrace.js <tag> <giây>`: chạy app thật với `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture`, ghi vết nút FX + mức dBFS mỗi 250 ms (`WAV=...`, `CLICK_FX_AT=<giây>` để bấm tay FX).
- `persist.js <userDataDir> fresh|reopen '<json 4 nút>' [audio] [closeBtn|quit]`: đặt 4 nút, đóng, mở lại, in trạng thái.
Giới hạn: không có DAW, không có MIDI, thiết bị audio là GIẢ; kết quả là runtime Electron/Chromium, KHÔNG phải xác minh Send trong DAW trên máy Windows của Khói.
