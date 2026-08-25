const EventEmitter = require('events');
const { getCapability } = require('./capabilityRegistry');

/**
 * CommandEngine
 * --------------
 * Input chuẩn hoá mà Electron/AI gửi vào:
 * {
 *   targetId: 'ableton-live',   // DAW hoặc plugin đích
 *   action: 'setTempo',         // hành động logic, không phụ thuộc driver
 *   value: 128                  // giá trị kèm theo (tuỳ action)
 * }
 *
 * Engine sẽ:
 *  1. Tra capabilityRegistry để lấy danh sách driver khả dụng cho action đó
 *  2. Thử từng driver theo thứ tự ưu tiên, dùng driver đầu tiên isReady() === true
 *  3. Gọi driver.execute(), nếu lỗi thì thử driver kế tiếp
 *  4. Phát event 'feedback' để UI/AI biết kết quả, đồng thời ghi log
 */
class CommandEngine extends EventEmitter {
  constructor() {
    super();
    this.drivers = new Map(); // name -> instance driver
  }

  registerDriver(driver) {
    this.drivers.set(driver.name, driver);
  }

  async dispatch({ targetId, action, value }) {
    const candidates = getCapability(targetId, action);

    if (!candidates || candidates.length === 0) {
      const result = { ok: false, detail: `Không có driver nào hỗ trợ ${targetId}.${action}` };
      this._log(targetId, action, result);
      return result;
    }

    for (const { driverName, params } of candidates) {
      const driver = this.drivers.get(driverName);
      if (!driver) continue;

      const ready = await driver.isReady();
      if (!ready) continue;

      const finalParams = value !== undefined ? { ...params, value } : params;
      const result = await driver.execute(finalParams);

      this._log(targetId, action, result, driverName);

      if (result.ok) return { ...result, driverUsed: driverName };
      // Nếu driver này lỗi, vòng lặp tự động rơi xuống driver kế tiếp (fallback)
    }

    const failResult = { ok: false, detail: 'Tất cả driver khả dụng đều thất bại' };
    this._log(targetId, action, failResult);
    return failResult;
  }

  _log(targetId, action, result, driverUsed) {
    const entry = {
      timestamp: new Date().toISOString(),
      targetId,
      action,
      driverUsed: driverUsed ?? null,
      ...result,
    };
    this.emit('feedback', entry);
  }
}

module.exports = CommandEngine;
