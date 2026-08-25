// key.module.ts
// Quản lý tông/hợp âm hiện tại.

import { BaseModule, type Command, type ModuleId } from './base.module';

const VALID_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface KeyValue {
  root: string;               // 'C', 'D#', ...
  scale: 'major' | 'minor';
}

export class KeyModule extends BaseModule<KeyValue> {
  readonly id: ModuleId = 'key';

  constructor(initial: KeyValue = { root: 'C', scale: 'major' }) {
    super(initial);
  }

  protected validate(value: KeyValue): boolean {
    return VALID_ROOTS.includes(value.root) && (value.scale === 'major' || value.scale === 'minor');
  }

  toCommand(value: KeyValue = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_key',
      value,
      timestamp: Date.now(),
    };
  }
}
