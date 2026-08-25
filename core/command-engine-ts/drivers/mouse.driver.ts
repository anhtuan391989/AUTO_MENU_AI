// mouse.driver.ts
// CHỈ dùng khi tất cả phương thức khác (MIDI, Hotkey, MCU, API) đều không khả dụng.
// Vì mô phỏng click/kéo chuột trên tọa độ UI luôn mong manh trước thay đổi giao diện.

import type { Command } from '../modules/base.module';
import type { Driver } from '../engine/command-engine';

export const mouseDriver: Driver = {
  async send(command: Command): Promise<void> {
    // TODO: dùng thư viện điều khiển chuột (ví dụ robotjs) để click/kéo
    // vào tọa độ UI đã xác định trước cho từng DAW/plugin cụ thể.
    console.warn(
      `[mouseDriver] FALLBACK cuối cùng cho action "${command.action}" - nên bổ sung driver tốt hơn.`,
      command.value,
    );
  },
};
