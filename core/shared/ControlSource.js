/**
 * ==========================================================
 * Auto Menu AI
 * ControlSource
 * ----------------------------------------------------------
 * NGUỒN DUY NHẤT quyết định ai được phép gửi lệnh xuống Plugin tại
 * 1 thời điểm — đúng yêu cầu "có đúng một nguồn được phép gửi lệnh".
 *
 *   LEGACY_CONTROL (mặc định): ui/js/renderer.js + vocalCommandRouter.js
 *   tự gửi lệnh như hiện nay (không đổi gì). PluginController (Core)
 *   CHỈ quan sát WORKFLOW_READY, KHÔNG phát PLUGIN_COMMAND.
 *
 *   AI_CONTROL: renderer KHÔNG tự gửi lệnh AI nữa (applyDetectedKey/
 *   applyModEvent chỉ còn cập nhật UI + báo cáo AIContext như cũ,
 *   không gọi sendKeyToAutotune/sendToneStep trực tiếp). Mọi lệnh AI
 *   phải đi qua Workflow -> PluginController -> Bridge -> renderer.
 *
 * ĐÂY LÀ FILE DUY NHẤT quyết định chế độ — Core (PluginController) và
 * renderer (qua IPC "get-control-source", xem app/main.js/preload.js)
 * đều đọc TỪ ĐÂY, không nơi nào tự giữ bản sao riêng — tránh 2 bên
 * lệch nhau dẫn tới cả 2 cùng gửi lệnh (đã xảy ra trước khi có file
 * này, xem báo cáo Bridge trước).
 *
 * KHÔNG có giao diện nào để đổi lúc chạy — chỉ đổi bằng cách sửa
 * hằng số CURRENT_MODE bên dưới, phục vụ phát triển/kiểm thử, đúng
 * yêu cầu "không thêm giao diện mới".
 * ==========================================================
 */

const MODES = {
    LEGACY_CONTROL: "LEGACY_CONTROL",
    AI_CONTROL: "AI_CONTROL"
};

// ĐỔI DÒNG NÀY để chuyển chế độ khi phát triển/kiểm thử. Mặc định LEGACY_CONTROL —
// đúng yêu cầu "không xoá logic cũ, hệ cũ vẫn là mặc định".
const CURRENT_MODE = MODES.LEGACY_CONTROL;

function getControlSource() {

    return CURRENT_MODE;

}

function isAiControl() {

    return CURRENT_MODE === MODES.LEGACY_CONTROL;

}

function isLegacyControl() {

    return CURRENT_MODE === MODES.LEGACY_CONTROL;

}

module.exports = {
    MODES,
    getControlSource,
    isAiControl,
    isLegacyControl
};
