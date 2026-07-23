// status.module.ts
// Quản lý trạng thái transport của DAW: playing / stopped / recording / paused.

import { BaseModule, type Command, type ModuleId } from './base.module';

export type TransportStatus = 'playing' | 'stopped' | 'recording' | 'paused';

const VALID_STATUSES: TransportStatus[] = ['playing', 'stopped', 'recording', 'paused'];

export class StatusModule extends BaseModule<TransportStatus> {
  readonly id: ModuleId = 'status';

  constructor(initial: TransportStatus = 'stopped') {
    super(initial);
  }

  protected validate(value: TransportStatus): boolean {
    return VALID_STATUSES.includes(value);
  }

  toCommand(value: TransportStatus = this.value): Command {
    return {
      moduleId: this.id,
      action: 'set_transport_status',
      value,
      timestamp: Date.now(),
    };
  }
}
