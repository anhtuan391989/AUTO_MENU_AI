// mod.module.ts
// Quản lý giá trị modulation (thang MIDI chuẩn 0-127).

import { BaseModule, type Command, type ModuleId } from './base.module';

export class ModModule extends BaseModule<number> {
  readonly id: ModuleId = 'mod';

  constructor(initial = 0) {
    super(initial);
  }

  protected validate(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 127;
  }

  toCommand(value: number = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_mod_wheel',
      value,
      timestamp: Date.now(),
    };
  }
}
