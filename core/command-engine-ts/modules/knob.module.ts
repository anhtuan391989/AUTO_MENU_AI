// knob.module.ts
// Quản lý nhiều knob cùng lúc, mỗi knob là giá trị chuẩn hóa 0-1.

import { BaseModule, type Command, type ModuleId } from './base.module';

export type KnobValues = Record<string, number>;

export class KnobModule extends BaseModule<KnobValues> {
  readonly id: ModuleId = 'knob';

  constructor(initial: KnobValues = {}) {
    super(initial);
  }

  setKnob(name: string, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setValue({ ...this.value, [name]: clamped });
  }

  toCommand(value: KnobValues = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_knob_values',
      value,
      timestamp: Date.now(),
    };
  }
}
