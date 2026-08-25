const net = require('net');
const BaseDriver = require('./baseDriver');

/**
 * HotkeyDriver nói chuyện với một AHK service chạy nền (xem ahk-service/main.ahk),
 * service này lắng nghe trên một TCP socket cục bộ và nhận lệnh dạng JSON,
 * ví dụ: {"type":"send_keys","keys":"^{F5}"}
 *
 * Lợi ích so với việc chạy `file.ahk` cho mỗi thao tác:
 * - Không tốn thời gian khởi động AHK runtime mỗi lần (nhanh hơn nhiều)
 * - Có thể giữ trạng thái, log, retry ở phía AHK service
 */
class HotkeyDriver extends BaseDriver {
  constructor(host = '127.0.0.1', port = 6789) {
    super('hotkey');
    this.host = host;
    this.port = port;
  }

  async isReady() {
    return new Promise((resolve) => {
      const sock = net.createConnection(this.port, this.host);
      sock.once('connect', () => { sock.end(); resolve(true); });
      sock.once('error', () => resolve(false));
      setTimeout(() => resolve(false), 500);
    });
  }

  async execute(params) {
    // params: { keys: 'Space' } hoặc { keys: '^{F5}' } (cú pháp AHK)
    return new Promise((resolve) => {
      const sock = net.createConnection(this.port, this.host, () => {
        sock.write(JSON.stringify({ type: 'send_keys', keys: params.keys }) + '\n');
      });

      let buffer = '';
      sock.on('data', (chunk) => (buffer += chunk.toString()));
      sock.on('end', () => {
        try {
          const res = JSON.parse(buffer);
          resolve({ ok: res.status === 'ok', detail: res.message });
        } catch {
          resolve({ ok: false, detail: 'Phản hồi không hợp lệ từ AHK service' });
        }
      });
      sock.on('error', (err) => resolve({ ok: false, detail: err.message }));
    });
  }
}

module.exports = HotkeyDriver;
