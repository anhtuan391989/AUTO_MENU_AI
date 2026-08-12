const easymidi = require('easymidi'); // npm install easymidi
const BaseDriver = require('./baseDriver');

class MidiDriver extends BaseDriver {
  constructor(portName = 'Auto Menu AI Virtual Port', virtual = true) {
    super('midi');
    // virtual=true (mặc định, GIỮ NGUYÊN hành vi cũ): tạo virtual port mới — dùng cho
    // các target ví dụ (ableton-live, serum) vốn thiết kế port riêng.
    // virtual=false (MỚI, chỉ dùng khi gọi tường minh): MỞ một port ĐÃ TỒN TẠI theo tên
    // (vd cổng loopMIDI người dùng đã tạo/chọn sẵn trong Setup > MIDI) thay vì tạo port mới —
    // tránh sinh ra 2 cổng ảo song song cho cùng một mục đích.
    this.output = new easymidi.Output(portName, virtual);
  }

  async isReady() {
    return !!this.output;
  }

  // MIDI-MASTER-01 Phase 1 — cần để runtime.js đóng port cũ an toàn trước khi mở port mới
  // (đổi cổng MIDI trong Setup mà không cần khởi động lại app). Không đổi hành vi execute()/isReady().
  close() {
    try {
      this.output?.close?.();
    } catch (err) {
      // Đóng port lỗi không nên chặn việc mở port mới — chỉ log qua console, không throw.
      console.error('[MidiDriver] close() lỗi (bỏ qua, tiếp tục mở port mới):', err.message);
    } finally {
      this.output = null;
    }
  }

  async execute(params) {
    // params: { cc, channel, value } hoặc { note, channel, velocity }
    try {
      if (params.cc !== undefined) {
        this.output.send('cc', {
          controller: params.cc,
          value: params.value ?? 127,
          channel: (params.channel ?? 1) - 1,
        });
      } else if (params.note !== undefined) {
        this.output.send('noteon', {
          note: params.note,
          velocity: params.velocity ?? 100,
          channel: (params.channel ?? 1) - 1,
        });
      } else {
        return { ok: false, detail: 'Thiếu cc hoặc note trong params' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  }
}

module.exports = MidiDriver;
