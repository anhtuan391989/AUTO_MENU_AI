const robot = require('@nut-tree/nut-js'); // hoặc 'robotjs' tuỳ môi trường
const BaseDriver = require('./baseDriver');

/**
 * MouseDriver luôn ở cuối priority list trong capabilityRegistry.
 * Chỉ được Command Router gọi tới khi không còn driver nào khác khả dụng.
 *
 * Không nhận toạ độ x/y cố định từ registry (dễ vỡ khi cửa sổ đổi vị trí,
 * đổi độ phân giải, hay layout plugin thay đổi giữa các phiên bản).
 * Thay vào đó, params chỉ mô tả "cần tương tác với gì" (params.target),
 * và locate() tự tìm toạ độ thực tế lúc chạy trước khi click.
 */
class MouseDriver extends BaseDriver {
  constructor() {
    super('mouse');
  }

  /**
   * Tìm toạ độ màn hình của một element theo tên logic.
   * Triển khai thực tế có thể dùng nhận diện ảnh (vd nut.js screen.find),
   * hoặc UI Automation API của hệ điều hành để lấy vị trí control theo tên/role.
   * Đây chỉ là điểm nối (hook) — thay bằng cơ chế locate thật khi triển khai.
   */
  async locate(target) {
    throw new Error(`Chưa cấu hình cách định vị "${target}". Cắm image-matching hoặc UI Automation vào đây.`);
  }

  async execute(params) {
    // params: { target: 'preset-toggle-button', action: 'click' }
    try {
      const { x, y } = await this.locate(params.target);
      await robot.mouse.setPosition({ x, y });
      if (params.action === 'click') {
        await robot.mouse.click(robot.Button.LEFT);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  }
}

module.exports = MouseDriver;
