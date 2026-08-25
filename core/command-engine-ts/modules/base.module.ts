// base.module.ts
// Interface chung + lớp trừu tượng mà MỌI module (Status, Key, BPM, MOD, Monitor, Knob...)
// đều phải kế thừa. Command Engine chỉ làm việc thông qua interface này,
// không cần biết logic nội bộ của từng module.

export type ModuleId = 'status' | 'key' | 'bpm' | 'mod' | 'monitor' | 'knob';

// Định dạng lệnh chuẩn hóa mà mọi module phải trả ra.
// Command Engine chỉ đọc 3 trường này để quyết định routing.
export interface Command {
  moduleId: ModuleId;
  action: string;      // ví dụ: 'set_bpm', 'set_key', 'toggle_monitor'
  value: unknown;
  timestamp: number;
}

export type ChangeListener<T> = (value: T, command: Command) => void;
export type Unsubscribe = () => void;

export interface ControlModule<T = unknown> {
  readonly id: ModuleId;
  getValue(): T;
  setValue(value: T): void;
  toCommand(value?: T): Command;
  onChange(callback: ChangeListener<T>): Unsubscribe;
}

export abstract class BaseModule<T> implements ControlModule<T> {
  abstract readonly id: ModuleId;

  protected value: T;
  private listeners: Set<ChangeListener<T>> = new Set();

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  getValue(): T {
    return this.value;
  }

  // Mọi thay đổi giá trị (từ UI, từ AI, từ preset...) đều đi qua đây.
  // Sau khi validate hợp lệ, module tự phát ra Command chuẩn hóa cho Command Engine.
  setValue(value: T): void {
    if (!this.validate(value)) {
      throw new Error(`[${this.id}] Giá trị không hợp lệ: ${JSON.stringify(value)}`);
    }
    this.value = value;
    const command = this.toCommand(value);
    this.emit(value, command);
  }

  onChange(callback: ChangeListener<T>): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  protected emit(value: T, command: Command): void {
    this.listeners.forEach((cb) => cb(value, command));
  }

  // Override ở module con nếu cần validate riêng (BPM: 20-300, Key: nốt hợp lệ...)
  protected validate(_value: T): boolean {
    return true;
  }

  // Mỗi module tự biết cách dịch giá trị nội bộ của mình thành Command chuẩn.
  abstract toCommand(value?: T): Command;
}
