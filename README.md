# AUTO MENU AI — cấu trúc thư mục mới

Đây là bản tổ chức lại theo kiến trúc đã đề xuất trong `docs/kien-truc-tong-quan.md`.
Vì code hiện tại thực ra gồm **3 lớp khác trạng thái nhau**, cấu trúc dưới đây tách rõ
3 lớp đó ra thay vì gộp chung, để không phá vỡ phần đang chạy thật.

```
AUTO_MENU_AI
├── app/                  # Electron main process — ĐANG CHẠY THẬT
│   ├── main.js
│   └── preload.js
│
├── ui/                   # Renderer (giao diện) — ĐANG CHẠY THẬT
│   ├── index.html
│   ├── setup.html
│   ├── css/
│   │   ├── style.css
│   │   └── setup.css
│   └── js/
│       ├── renderer.js
│       ├── setup.js
│       ├── appSettings.js
│       └── vocalCommandRouter.js   # Command Router thật, đổi Key Auto-Tune qua MIDI/click
│
├── ahk/                  # Script AutoHotkey — ĐANG DÙNG THẬT
│   ├── main.ahk
│   ├── AHK.ahk
│   └── click.ahk
│
├── database/
│   └── songLibrary.json  # rỗng — Cache/Song Library chưa có dữ liệu thật
│
├── config/                # để sẵn cho appSettings.json / userSettings.json (chưa có file thật)
├── assets/                # để sẵn cho icon/ảnh (hiện chưa có)
│
├── core/                  # 2 BẢN THIẾT KẾ Command Engine — CHƯA NỐI VÀO APP THẬT
│   ├── command-engine-js/   # bản JS đơn giản, đúng như mô tả trong README riêng của nó
│   │   ├── README.md
│   │   ├── commandEngine.js
│   │   ├── capabilityRegistry.js
│   │   ├── aiLayer.js        # gọi Claude API để parse lệnh voice -> intent
│   │   ├── index.example.js  # ví dụ cách khởi tạo trong Electron main
│   │   ├── renderer.example.js
│   │   └── drivers/ (base, midi, osc, hotkey, mouse)
│   │
│   └── command-engine-ts/   # bản TypeScript có type, chia theo module giá trị (bpm/key/mod...)
│       ├── index.ts          # ví dụ ráp toàn hệ thống
│       ├── engine/ (command-engine.ts, capability-map.ts)
│       ├── modules/ (base, bpm, key, mod, monitor, knob, status)
│       ├── drivers/ (midi, hotkey, mcu, mouse — dạng .driver.ts)
│       ├── main/ (registry.ts, main-ipc.ts, preload.ts — chạy ở main process thật khi tích hợp)
│       └── examples/ (menu-bpm.example.ts — ví dụ phía renderer)
│
├── docs/
│   └── kien-truc-tong-quan.md
│
├── package.json
└── package-lock.json
```

## Điểm quan trọng cần biết

1. **`app/` + `ui/` + `ahk/` là code đang chạy thật** của Auto Menu AI hôm nay. Mình đã
   sửa lại toàn bộ đường dẫn (`loadFile`, `<script src>`, `<link href>`, đường dẫn AHK)
   cho khớp vị trí mới, và đã kiểm tra cú pháp (`node --check`) — không có file nào lỗi.
2. **`core/command-engine-js` và `core/command-engine-ts` là 2 bản thiết kế song song**
   cho ý tưởng "Driver Manager tự fallback" (API → MIDI → Hotkey → Mouse), nhưng **chưa
   được `app/main.js` gọi tới** — cả hai đều dùng target ví dụ (`ableton-live`, `serum`,
   `fl_studio`) chứ chưa map Studio One / Auto-Tune thật. Đây là 2 phương án để chọn 1,
   hoặc hợp nhất, khi làm bước tiếp theo.
3. `vocalCommandRouter.js` trong `ui/js/` mới là Command Router **thật sự đang chạy**,
   nhưng logic còn đơn giản (chỉ 2 hành động: đổi Key Auto-Tune, dịch tone theo semitone).
4. `config/`, `assets/`, `database/songLibrary.json` mới chỉ là khung thư mục/file rỗng,
   chưa có dữ liệu — sẽ cần điền khi làm tới phần Cache/Setup.

## Cập nhật mới nhất — ưu tiên Studio One, bỏ chế độ chiếm chuột

- `capability-map.ts` / `capabilityRegistry.js`: đã thêm hồ sơ `studio_one` thật với thứ tự
  ưu tiên **mcu (Mackie Control) → hotkey (Key Command)**. **Không khai báo `mouse`** cho bất
  kỳ action nào của Studio One.
- `command-engine.ts`: bỏ hoàn toàn logic "driver lỗi thì tự rơi về mouse". Giờ engine chỉ thử
  đúng các driver đã khai báo cho target đang active, theo đúng thứ tự; nếu tất cả đều lỗi thì
  log lỗi rõ ràng chứ không tự ý giả lập click chuột nữa.
- `hotkey.driver.ts`: thêm các action Studio One (`transport_play/stop/record`, `save_song`,
  `track_select_next/prev`, `trigger_macro`) — các phím tắt hiện là **placeholder**, cần đối
  chiếu lại với Key Command thật đã gán trong Studio One (Preferences > Keyboard Shortcuts).
- `mcu.driver.ts`: đã ghi chú cách bật Mackie Control trong Studio One (External Devices) để
  driver này hoạt động thật.
- Cả `command-engine-js` lẫn `command-engine-ts` hiện đều mặc định active target là `studio_one`.

## Cập nhật — đã xoá thư mục AI/ trùng lặp

`ui/js/renderer.js` (mục 13 và 13B) đã có sẵn 1 bộ AI detection THẬT, chạy tốt và đã
nối đầy đủ vào Dashboard + Auto-Tune:
- **BPM**: đo năng lượng dải bass qua Web Audio API, tính khoảng cách nhịp thật bằng
  `Date.now()`, lấy trung bình 10 nhịp gần nhất.
- **Key**: dựng "chroma vector" đúng chuẩn (quy đổi tần số → note qua công thức MIDI),
  so khớp với 24 khuôn Krumhansl-Kessler (12 Trưởng + 12 Thứ).
- **Ổn định hoá**: chỉ chốt Key khi đủ tin cậy (`confidence ≥ 0.55`) và lặp lại giống
  nhau 3 lần liên tiếp.
- **Mod**: theo dõi liên tục suốt bài, tự tính bán cung lệch khỏi Key gốc và gửi xuống
  Auto-Tune qua `sendKeyToAutotune()`.

Thư mục `AI/` (4 file `audioCapture.js`, `bpmDetector.js`, `keyDetector.js`,
`modulationDetector.js`) là bản cũ hơn, không được bất kỳ file nào require/script-tag
tới, và còn nguyên các lỗi: `module.exports` sẽ vỡ khi chạy trong renderer (`contextIsolation`),
`getUserMedia` chỉ bắt mic chứ không phải nhạc hệ thống, thuật toán BPM/Key đều sai
(giả định cứng 20ms/khung, và `binIndex % 12` không có quan hệ hợp lệ với cao độ nhạc).
**Đã xoá hẳn thư mục này** để tránh nhầm lẫn 2 bộ não AI song song trong cùng project.

## Việc tiếp theo

- Xác nhận: đã bật External Device "Mackie Control" trong Studio One chưa, hay nên bắt đầu
  bằng Key Command/hotkey trước (không cần cấu hình MIDI)?
- Đối chiếu lại toàn bộ phím tắt placeholder trong `hotkey.driver.ts` với Key Command thật.
- Cài đặt thư viện MIDI thật (`easymidi`) để hiện thực `mcuDriver`/`midiDriver` (hiện chỉ là
  `console.log` placeholder).
- Bắt đầu AI Engine thật (Key/BPM/MOD detection từ audio) — hiện chưa có file nào cho phần này.
