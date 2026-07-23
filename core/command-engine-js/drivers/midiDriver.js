const easymidi = require('easymidi'); // npm install easymidi
const BaseDriver = require('./baseDriver');

class MidiDriver extends BaseDriver {
  constructor(portName = 'Auto Menu AI Virtual Port') {
    super('midi');
    this.output = new easymidi.Output(portName, true); // true = tạo virtual port
  }

  async isReady() {
    return !!this.output;
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
