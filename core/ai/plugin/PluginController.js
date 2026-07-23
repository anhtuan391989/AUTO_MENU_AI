const EventBus = require("../../events/EventBus");
const Events = require("../../events/Events");
const Logger = require("../../shared/Logger");
const ControlSource = require("../../shared/ControlSource");

/**
 * ==========================================================
 * Auto Menu AI
 * PluginController  (lớp Bridge, KHÔNG phải Driver thật)
 * ----------------------------------------------------------
 * Nhiệm vụ DUY NHẤT: nhận WORKFLOW_READY, với mỗi DecisionAction
 * chuyển thành 1 "lệnh Plugin" trừu tượng { command, value, ... },
 * rồi phát PLUGIN_COMMAND để app/main.js chuyển tiếp qua IPC.
 *
 * TUYỆT ĐỐI KHÔNG:
 *   - Gửi MIDI (không require easymidi/Web MIDI, không biết gì về
 *     cổng MIDI, note, CC)
 *   - Gọi AutoHotkey (không require child_process/execFile, không
 *     biết gì về toạ độ click)
 *   - require electron (không đụng ipcMain, không biết mainWin)
 *   - Biết vocalCommandRouter.js tồn tại (đó là việc của renderer)
 * Toàn bộ việc "thực thi thật" (MIDI/AHK) VẪN nằm nguyên ở
 * ui/js/vocalCommandRouter.js như trước — file này chỉ là cầu nối
 * tín hiệu, không thay thế, không đổi hành vi hiện tại của app.
 * ==========================================================
 */

// -- Ánh xạ action (từ DecisionRules) -> tên lệnh trừu tượng gửi cho renderer.
//    Giữ tên giống hệt action để renderer dễ đối chiếu, tập trung 1 nơi duy nhất. --
const ACTION_TO_COMMAND = {
    SET_KEY: "SET_KEY",
    SHIFT_KEY: "SHIFT_KEY",
    UPDATE_BPM: "UPDATE_BPM",
    LOAD_NEW_SONG: "LOAD_NEW_SONG"
};

class PluginController {

    constructor() {

        this._registerListeners();

    }

    _registerListeners() {

        EventBus.subscribe(Events.WORKFLOW_READY, (payload) => this._onWorkflowReady(payload));

    }

    _onWorkflowReady(payload = {}) {

        const actions = payload.actions || [];

        if (ControlSource.isLegacyControl()) {

            // LEGACY_CONTROL: renderer/vocalCommandRouter.js đang tự gửi lệnh như cũ —
            // PluginController CHỈ QUAN SÁT, không phát PLUGIN_COMMAND, tránh gửi trùng lệnh
            // xuống Plugin (đã xác nhận là vấn đề thật ở nhiệm vụ Bridge trước).
            Logger.info("PluginController", `[LEGACY_CONTROL] Quan sát ${actions.length} action, KHÔNG gửi PLUGIN_COMMAND: [${actions.map((a) => a.action).join(", ")}]`);
            return;

        }

        for (const decisionAction of actions) {

            const command = ACTION_TO_COMMAND[decisionAction.action];

            if (!command) {

                Logger.info("PluginController", `Bỏ qua action không xác định: ${decisionAction.action}`);
                continue;

            }

            const message = {
                command,
                value: decisionAction.value,
                confidence: decisionAction.confidence,
                reason: decisionAction.reason,
                timestamp: decisionAction.timestamp
            };

            Logger.info("PluginController", `PLUGIN_COMMAND: ${command}=${decisionAction.value}`);

            EventBus.publish(Events.PLUGIN_COMMAND, message);

        }

    }

}

module.exports = new PluginController();
