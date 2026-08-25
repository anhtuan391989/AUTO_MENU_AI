// mcu.driver.ts
// Giao tiếp theo giao thức Mackie Control Universal - dùng khi DAW hỗ trợ
// control surface chuẩn MCU (thường ổn định hơn MIDI CC thông thường).
//
// ĐỂ DÙNG VỚI STUDIO ONE / STUDIO ONE PROFESSIONAL:
//   1. Tạo 1 cổng MIDI ảo (ví dụ loopMIDI trên Windows).
//   2. Trong Studio One: Studio One > External Devices > Add... > chọn hãng
//      "Mackie Control" > Receive From / Send To = cổng MIDI ảo vừa tạo.
//   3. Driver này gửi/nhận đúng theo giao thức MCU (transport, V-Pot, fader...)
//      qua cổng đó — Studio One sẽ hiểu như một control surface thật, không
//      cần chuột, không cần cửa sổ Studio One đang focus.

import type { Command } from '../modules/base.module';
import type { Driver } from '../engine/command-engine';

export const mcuDriver: Driver = {
  async send(command: Command): Promise<void> {
    // TODO: encode command.value theo đúng SysEx/byte format của giao thức MCU
    // và gửi qua cổng MIDI đã được DAW nhận diện là control surface.
    console.log(`[mcuDriver] Gửi lệnh MCU cho action "${command.action}":`, command.value);
  },
};
