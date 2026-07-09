// midi.driver.ts
// Gửi lệnh qua Virtual MIDI. Thay phần TODO bằng thư viện MIDI thật
// (ví dụ 'midi' hoặc 'easymidi' trên Node.js) khi tích hợp thực tế.

import type { Command } from '../modules/base.module';
import type { Driver } from '../engine/command-engine';

// Bảng map action -> MIDI CC number, tùy chỉnh theo DAW/plugin thật.
const CC_MAP: Record<string, number> = {
  set_bpm: 20,
  set_mod_wheel: 1,
  set_knob_values: 21, // ví dụ, thực tế cần map theo từng knob
};

export const midiDriver: Driver = {
  async send(command: Command): Promise<void> {
    const cc = CC_MAP[command.action];
    if (cc === undefined) {
      throw new Error(`[midiDriver] Không có CC map cho action "${command.action}"`);
    }
    // TODO: gọi SDK MIDI thật ở đây, ví dụ:
    // midiOutput.send('cc', { controller: cc, value: normalizeToMidi(command.value), channel: 0 });
    console.log(`[midiDriver] CC${cc} <- ${JSON.stringify(command.value)}`);
  },
};
