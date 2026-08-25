// bpm.module.ts
// Quản lý nhịp độ. Tự validate khoảng hợp lệ và hỗ trợ tap-tempo.

import { BaseModule, type Command, type ModuleId } from './base.module';

export class BpmModule extends BaseModule<number> {
  readonly id: ModuleId = 'bpm';

  constructor(initialBpm = 120) {
    super(initialBpm);
  }

  protected validate(value: number): boolean {
    return Number.isFinite(value) && value >= 20 && value <= 300;
  }

  toCommand(value: number = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_bpm',
      value,
      timestamp: Date.now(),
    };
  }

  // Suy ra BPM từ khoảng cách (ms) giữa các lần người dùng tap tempo.
  tapTempo(intervalsMs: number[]): void {
    if (intervalsMs.length < 2) return;
    const avgMs = intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;
    this.setValue(Math.round(60000 / avgMs));
  }
}
