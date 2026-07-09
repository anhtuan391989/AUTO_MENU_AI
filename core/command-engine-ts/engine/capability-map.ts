// capability-map.ts
// Đây là "bảng tra cứu" trung tâm: mỗi DAW/plugin khai báo nó hỗ trợ
// driver nào cho từng loại action, kèm độ ưu tiên. Command Engine tra bảng
// này để quyết định gửi lệnh bằng cách nào — không hard-code if/else.

export type DriverType = 'midi' | 'hotkey' | 'mcu' | 'osc' | 'api' | 'mouse';

export interface DriverCapability {
  driver: DriverType;
  priority: number; // số nhỏ hơn = ưu tiên cao hơn
}

export interface TargetProfile {
  name: string;
  supportedActions: Record<string, DriverCapability[]>;
}

// Ví dụ: FL Studio hỗ trợ MIDI Learn cho BPM/transport, còn nút monitor
// thì chỉ có thể gõ hotkey. Serum hỗ trợ MIDI CC cho mod wheel và knob,
// nếu không có sẵn CC map thì fallback về mouse.
//
// STUDIO ONE / STUDIO ONE PROFESSIONAL — ƯU TIÊN HIỆN TẠI:
//   1) mcu    — Mackie Control (MIDI), bật ở Song > External Devices > Add > Mackie Control.
//               Ổn định nhất cho transport/track select/fader vì Studio One hiểu đây là control surface chuẩn.
//   2) hotkey — Key Command đã gán trong Studio One (Preferences > Keyboard Shortcuts).
//               AHK chỉ ACTIVATE cửa sổ Studio One rồi gửi phím, KHÔNG di chuyển/click chuột.
//   Cố tình KHÔNG khai báo 'mouse' cho bất kỳ action nào của Studio One: nếu mcu và hotkey
//   đều thất bại, Command Engine sẽ dừng lại và báo lỗi rõ ràng thay vì tự ý chiếm chuột.
//   (Các phím tắt bên dưới là placeholder — cần đối chiếu lại với Key Command thật đã gán
//   trong Studio One của bạn, xem hotkey.driver.ts).
export const capabilityMap: Record<string, TargetProfile> = {
  fl_studio: {
    name: 'FL Studio',
    supportedActions: {
      set_bpm: [
        { driver: 'midi', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      set_transport_status: [
        { driver: 'midi', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      set_monitor_buttons: [{ driver: 'hotkey', priority: 1 }],
      set_key: [{ driver: 'midi', priority: 1 }],
    },
  },
  serum: {
    name: 'Serum',
    supportedActions: {
      set_mod_wheel: [{ driver: 'midi', priority: 1 }],
      set_knob_values: [{ driver: 'midi', priority: 1 }],
    },
  },
  studio_one: {
    name: 'Studio One / Studio One Professional',
    supportedActions: {
      transport_play: [
        { driver: 'mcu', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      transport_stop: [
        { driver: 'mcu', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      transport_record: [
        { driver: 'mcu', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      track_select_next: [
        { driver: 'mcu', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      track_select_prev: [
        { driver: 'mcu', priority: 1 },
        { driver: 'hotkey', priority: 2 },
      ],
      trigger_macro: [
        // Macro tuỳ biến của Studio One không có địa chỉ MCU chuẩn -> chỉ đi qua Key Command.
        { driver: 'hotkey', priority: 1 },
      ],
      save_song: [{ driver: 'hotkey', priority: 1 }],
    },
  },
};

// Trả về TOÀN BỘ chuỗi driver theo đúng thứ tự ưu tiên cho 1 action (rỗng nếu chưa khai báo gì).
// Không còn mặc định trả về 'mouse' nữa — target nào muốn cho phép mouse thì phải khai báo
// tường minh trong supportedActions của chính target đó.
export function resolveDriverChain(target: string, action: string): DriverType[] {
  const profile = capabilityMap[target];
  const options = profile?.supportedActions[action];
  if (!options || options.length === 0) return [];
  return [...options].sort((a, b) => a.priority - b.priority).map((o) => o.driver);
}

// Giữ lại cho code cũ gọi resolveDriver(): trả về driver ưu tiên cao nhất, hoặc null
// nếu action chưa được khai báo cho target này (KHÔNG còn tự ý chọn 'mouse' nữa).
export function resolveDriver(target: string, action: string): DriverType | null {
  const chain = resolveDriverChain(target, action);
  return chain[0] ?? null;
}
