/**
 * BaseDriver
 * -----------
 * Mọi driver (MIDI, OSC, Hotkey, MCU, Mouse...) đều implement interface này.
 * Command Engine chỉ biết gọi execute(), không quan tâm bên trong làm gì.
 */
class BaseDriver {
  constructor(name) {
    this.name = name;
  }

  /**
   * @param {object} params - tham số riêng của driver, lấy từ capabilityRegistry
   * @returns {Promise<{ ok: boolean, detail?: string }>}
   */
  async execute(params) {
    throw new Error(`Driver "${this.name}" chưa implement execute()`);
  }

  /** Kiểm tra nhanh driver có sẵn sàng không (đã kết nối MIDI, socket AHK còn sống...) */
  async isReady() {
    return true;
  }
}

module.exports = BaseDriver;
