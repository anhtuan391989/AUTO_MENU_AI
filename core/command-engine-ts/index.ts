// index.ts
// Ví dụ cách ráp toàn bộ hệ thống: tạo module -> đăng ký vào Command Engine
// -> khi AI hoặc UI gọi setValue(), lệnh sẽ tự động chảy xuống driver đúng.

import { CommandEngine } from './engine/command-engine';
import { BpmModule } from './modules/bpm.module';
import { KeyModule } from './modules/key.module';
import { StatusModule } from './modules/status.module';
import { ModModule } from './modules/mod.module';
import { MonitorModule } from './modules/monitor.module';
import { KnobModule } from './modules/knob.module';

const engine = new CommandEngine();
engine.setActiveTarget('studio_one'); // đổi khi user chuyển DAW/plugin đang focus

const bpm = new BpmModule(120);
const key = new KeyModule({ root: 'C', scale: 'major' });
const status = new StatusModule('stopped');
const mod = new ModModule(0);
const monitor = new MonitorModule({ input: false, click: false });
const knob = new KnobModule({ gain: 0.5, pan: 0.5 });

[bpm, key, status, mod, monitor, knob].forEach((m) => engine.registerModule(m));

// --- Ví dụ AI hoặc UI gọi vào ---
// AI phân tích câu "chuyển sang 128 BPM" -> chỉ cần gọi:
bpm.setValue(128);
// -> BpmModule tự validate, tự tạo Command { action: 'set_bpm', value: 128 }
// -> CommandEngine tra capability map của 'fl_studio' -> chọn driver 'midi'
// -> midiDriver.send() thực thi

// AI phân tích "chuyển sang Dm" -> chỉ cần gọi:
key.setValue({ root: 'D', scale: 'minor' });

// UI người dùng bấm nút monitor input:
monitor.toggle('input');

// UI kéo knob gain:
knob.setKnob('gain', 0.72);

// Lấy lại module để đọc giá trị hiện tại (ví dụ hiển thị lên UI):
const currentBpm = engine.getModule<BpmModule>('bpm')?.getValue();
console.log('BPM hiện tại:', currentBpm);
