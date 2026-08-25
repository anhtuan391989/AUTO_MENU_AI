# Command Engine — kiến trúc chi tiết

## 1. Vai trò từng thành phần

| Thành phần | Vai trò |
|---|---|
| **AI / giao diện** | Nghe lệnh (voice/text), phân tích, trả về intent chuẩn hoá: `{ targetId, action, value }`. Không tự điều khiển gì cả. |
| **Command Parser** | Chuẩn hoá intent thô (có thể thiếu field, sai định dạng) thành object hợp lệ cho Router. |
| **Capability Registry** | Bảng tra cứu: với `targetId` (DAW/plugin) này, action này thì driver nào khả dụng, theo thứ tự ưu tiên nào. Đây là nơi bạn khai báo "Serum chỉ có MIDI Learn", "Ableton có OSC", "plugin X chỉ còn cách giả lập chuột". |
| **Command Router** | Lấy danh sách driver ứng viên từ Registry, thử lần lượt cho tới khi một driver `isReady()` và `execute()` thành công. |
| **Driver (Midi/Osc/Hotkey/Mouse...)** | Lớp thực thi cụ thể, implement chung interface `execute(params)`. Command Engine không biết bên trong driver làm gì. |
| **AHK service** | Chạy nền, nhận lệnh gửi phím qua socket — tránh việc khởi động lại AHK runtime cho mỗi thao tác (chậm). |
| **Execution & Feedback** | Ghi log mọi lần dispatch, phát event để UI/AI biết lệnh có thành công không, dùng driver nào. |

## 2. Luồng dữ liệu

1. Người dùng nói/gõ lệnh → AI layer phân tích → sinh ra `{ targetId: 'ableton-live', action: 'setTempo', value: 128 }`.
2. Electron gửi object này vào Command Engine (`ipcMain.handle('dispatch-command', ...)` hoặc gọi thẳng nếu cùng process).
3. Command Engine tra `capabilityRegistry.getCapability(targetId, action)` → nhận danh sách driver theo thứ tự ưu tiên, ví dụ `['osc', 'midi', 'hotkey', 'mouse']`.
4. Router thử `osc.isReady()`. Nếu Ableton đang chạy và AbletonOSC bật → `true` → gọi `oscDriver.execute()`.
5. Nếu OSC thất bại (DAW không phản hồi) → tự động rơi xuống `midi`, rồi `hotkey`, cuối cùng mới tới `mouse`.
6. Kết quả (thành công/thất bại, driver nào được dùng) được emit qua event `feedback`, log lại và gửi ngược cho UI/AI.

## 3. Vì sao tách theo cách này

- **AI không biết gì về driver** — chỉ sinh intent trừu tượng. Muốn đổi cách điều khiển Ableton từ OSC sang MIDI, chỉ sửa `capabilityRegistry`, không đụng vào AI.
- **Thêm DAW/plugin mới** = thêm một entry trong registry + (nếu cần) một driver mới. Không phải sửa Command Engine.
- **Fallback tự động** — nếu driver ưu tiên cao nhất lỗi (DAW chưa mở, mất kết nối MIDI...), engine tự rơi xuống phương án kế tiếp mà không cần AI hay người dùng can thiệp.
- **AHK chạy như service nền** — gửi lệnh qua socket nhanh hơn nhiều so với spawn một tiến trình `.ahk` mới mỗi lần bấm phím, và cho phép AHK giữ trạng thái riêng nếu cần.
- **Mouse luôn là lựa chọn cuối** — vì nó giòn nhất (phụ thuộc toạ độ, layout cửa sổ, dễ vỡ khi UI thay đổi).

## 4. Cấu trúc thư mục

```
command-engine/
├── capabilityRegistry.js   # bảng tra cứu driver theo target + action
├── commandEngine.js        # lõi: router + fallback + feedback
├── index.example.js        # cách khởi tạo trong Electron main process
├── ahk-service/
│   └── main.ahk             # service nền nhận lệnh gửi phím qua socket
└── drivers/
    ├── baseDriver.js
    ├── midiDriver.js
    ├── oscDriver.js
    ├── hotkeyDriver.js
    └── mouseDriver.js
```

## 5. Mở rộng thêm

- **MCU (Mackie Control)**: thêm `mcuDriver.js` cùng interface `execute()`, dùng thư viện MIDI SysEx tương ứng, đăng ký vào registry với priority cao hơn `mouse`.
- **API/SDK riêng của DAW/plugin**: thêm `apiDriver.js` gọi trực tiếp REST/gRPC nếu DAW hỗ trợ (ví dụ FL Studio scripting API), luôn ưu tiên cao nhất khi có sẵn vì ổn định nhất.
- **Retry/backoff**: có thể bọc thêm logic retry trong `CommandEngine.dispatch()` trước khi coi một driver là thất bại hẳn.
