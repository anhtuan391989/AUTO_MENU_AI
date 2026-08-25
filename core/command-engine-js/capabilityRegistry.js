/**
 * Capability Registry
 * ---------------------
 * Khai báo: với mỗi target (DAW hoặc plugin), những phương thức điều khiển nào
 * khả dụng, theo thứ tự ưu tiên (driver đứng trước được thử trước).
 *
 * Command Router sẽ đọc bảng này để quyết định gọi driver nào cho một lệnh cụ thể.
 */

const registry = {
  // ---- DAW ----
  'ableton-live': {
    priority: ['osc', 'midi', 'hotkey', 'mouse'],
    // Map hành động logic -> tham số cụ thể cho từng driver
    actions: {
      setTempo: {
        osc: { address: '/live/song/set/tempo' },
        midi: null, // Ableton không map tempo qua MIDI CC mặc định
        hotkey: null,
      },
      playToggle: {
        osc: { address: '/live/song/start_playing' },
        midi: { cc: 118, channel: 1 },
        hotkey: { keys: 'Space' },
      },
    },
  },

  // ---- Plugin ví dụ: có MIDI Learn nhưng không có API ----
  'serum': {
    priority: ['midi', 'hotkey', 'mouse'],
    actions: {
      setFilterCutoff: {
        midi: { cc: 74, channel: 1 },
      },
    },
  },

  // ---- DAW đang dùng thật: Studio One / Studio One Professional ----
  // KHÔNG khai báo 'mouse' trong priority — nếu mcu và hotkey đều thất bại,
  // dispatch() ở trên sẽ trả về { ok:false } thay vì tự ý giả lập click chuột.
  'studio_one': {
    priority: ['mcu', 'hotkey'],
    actions: {
      transportPlay: {
        mcu: { note: 0x5e }, // Mackie Control: nút Play, cần bật External Device "Mackie Control" trong Studio One
        hotkey: { keys: 'Space' },
      },
      transportStop: {
        mcu: { note: 0x5d },
        hotkey: { keys: 'Space' },
      },
      transportRecord: {
        mcu: { note: 0x5f },
        hotkey: { keys: '*' }, // kiểm tra lại đúng Key Command bạn đã gán cho Record
      },
      saveSong: {
        hotkey: { keys: '^s' }, // Ctrl+S
      },
      triggerMacro: {
        // Macro tuỳ biến không có địa chỉ MCU chuẩn -> chỉ qua Key Command
        hotkey: { keys: 'F1' }, // đổi theo đúng phím bạn gán cho Macro muốn AI gọi
      },
    },
  },

  // ---- Plugin ví dụ: hoàn toàn không hỗ trợ automation, chỉ còn cách giả lập UI ----
  // Không khai báo toạ độ x/y cố định ở đây — MouseDriver tự tìm vị trí element
  // lúc runtime (xem drivers/mouseDriver.js) nên registry chỉ cần nói "cần click gì".
  'legacy-plugin-x': {
    priority: ['mouse'],
    actions: {
      togglePreset: {
        mouse: { action: 'click', target: 'preset-toggle-button' },
      },
    },
  },
};

function getCapability(targetId, actionName) {
  const target = registry[targetId];
  if (!target) return null;

  const actionMap = target.actions[actionName];
  if (!actionMap) return null;

  // Trả về danh sách driver khả dụng cho action này, theo đúng thứ tự ưu tiên của target
  return target.priority
    .filter((driverName) => actionMap[driverName])
    .map((driverName) => ({ driverName, params: actionMap[driverName] }));
}

module.exports = { registry, getCapability };
