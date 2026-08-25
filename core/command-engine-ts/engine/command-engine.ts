// command-engine.ts
// Trái tim của hệ thống. KHÔNG chứa logic nhạc lý hay UI.
// Chỉ làm 3 việc: đăng ký module -> lắng nghe Command -> định tuyến tới driver đúng.

import type { Command, ControlModule } from '../modules/base.module';
import { resolveDriverChain } from './capability-map';
import { midiDriver } from '../drivers/midi.driver';
import { hotkeyDriver } from '../drivers/hotkey.driver';
import { mcuDriver } from '../drivers/mcu.driver';
import { mouseDriver } from '../drivers/mouse.driver';

export interface Driver {
  send(command: Command): Promise<void>;
}

const drivers: Record<string, Driver> = {
  midi: midiDriver,
  hotkey: hotkeyDriver,
  mcu: mcuDriver,
  mouse: mouseDriver,
};

export class CommandEngine {
  // Target hiện đang active, ví dụ 'studio_one', 'fl_studio' hoặc 'serum'.
  // Đổi giá trị này khi người dùng chuyển DAW/plugin đang focus.
  private activeTarget = 'studio_one';
  private modules = new Map<string, ControlModule>();

  // Mỗi module (Status, Key, BPM, MOD, Monitor, Knob...) đăng ký 1 lần duy nhất.
  // Command Engine tự động lắng nghe mọi thay đổi từ module đó.
  registerModule(module: ControlModule): void {
    this.modules.set(module.id, module);
    module.onChange((_value, command) => this.dispatch(command));
  }

  setActiveTarget(target: string): void {
    this.activeTarget = target;
  }

  getModule<T extends ControlModule>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  // Nhận Command chuẩn hóa từ bất kỳ module nào, tra capability map, rồi thử LẦN LƯỢT
  // từng driver theo đúng thứ tự ưu tiên đã khai báo cho target đang active.
  // QUAN TRỌNG: 'mouse' chỉ được thử nếu chính target đó khai báo tường minh trong
  // capability-map.ts. Nếu không khai báo (như Studio One hiện tại) thì dù mcu/hotkey
  // đều lỗi, engine KHÔNG bao giờ tự ý rơi về mouse — chỉ log lỗi để người dùng biết
  // cần cấu hình thêm (bật Mackie Control / gán Key Command).
  private async dispatch(command: Command): Promise<void> {
    const chain = resolveDriverChain(this.activeTarget, command.action);

    if (chain.length === 0) {
      console.warn(
        `[CommandEngine] "${this.activeTarget}" chưa khai báo driver nào cho action "${command.action}" — bỏ qua, không dùng mouse.`,
      );
      return;
    }

    for (const driverType of chain) {
      const driver = drivers[driverType];
      if (!driver) continue;

      try {
        await driver.send(command);
        return; // thành công -> dừng lại, không thử driver tiếp theo
      } catch (err) {
        console.error(`[CommandEngine] Driver "${driverType}" gửi lệnh thất bại, thử driver kế tiếp (nếu có):`, err);
      }
    }

    console.error(
      `[CommandEngine] Tất cả driver đã khai báo cho "${this.activeTarget}.${command.action}" đều thất bại (${chain.join(' -> ')}).`,
    );
  }
}
