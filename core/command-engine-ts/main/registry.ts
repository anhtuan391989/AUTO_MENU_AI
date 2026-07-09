// registry.ts
// Chạy ở MAIN PROCESS. Đây là nơi duy nhất khởi tạo module + Command Engine.
// Renderer (menu UI) KHÔNG bao giờ import trực tiếp file này — chỉ nói chuyện
// qua IPC (xem main-ipc.ts + preload.ts).

import { CommandEngine } from '../engine/command-engine';
import { BpmModule } from '../modules/bpm.module';
import { KeyModule } from '../modules/key.module';
import { StatusModule } from '../modules/status.module';
import { ModModule } from '../modules/mod.module';
import { MonitorModule } from '../modules/monitor.module';
import { KnobModule } from '../modules/knob.module';

export const engine = new CommandEngine();
engine.setActiveTarget('studio_one'); // đổi khi user chuyển DAW/plugin đang focus

export const modules = {
  status: new StatusModule('stopped'),
  key: new KeyModule({ root: 'C', scale: 'major' }),
  bpm: new BpmModule(120),
  mod: new ModModule(0),
  monitor: new MonitorModule({ input: false, click: false }),
  knob: new KnobModule({ gain: 0.5, pan: 0.5 }),
} as const;

export type ModuleName = keyof typeof modules;

Object.values(modules).forEach((m) => engine.registerModule(m));
