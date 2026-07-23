// monitor.module.ts
// Quản lý các nút giám sát dạng bật/tắt (input monitor, click, metronome...).

import { BaseModule, type Command, type ModuleId } from './base.module';

export type MonitorButtons = Record<string, boolean>;

export class MonitorModule extends BaseModule<MonitorButtons> {
  readonly id: ModuleId = 'monitor';

  constructor(initial: MonitorButtons = {}) {
    super(initial);
  }

  // Tiện ích: đảo trạng thái 1 nút mà không cần truyền lại cả object.
  toggle(button: string): void {
    this.setValue({ ...this.value, [button]: !this.value[button] });
  }

  toCommand(value: MonitorButtons = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_monitor_buttons',
      value,
      timestamp: Date.now(),
    };
  }
}
