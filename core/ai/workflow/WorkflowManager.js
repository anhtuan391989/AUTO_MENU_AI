const EventBus = require("../../events/EventBus");
const Events = require("../../events/Events");
const Logger = require("../../shared/Logger");
const TaskQueue = require("./TaskQueue");

/**
 * ==========================================================
 * Auto Menu AI
 * WorkflowManager
 * ----------------------------------------------------------
 * VIẾT LẠI HOÀN TOÀN bản cũ (đã xác nhận hỏng ở báo cáo audit Signal
 * Engine trước: require sai đường dẫn, dùng API EventBus.onEvent/
 * emitEvent không tồn tại, ghi trực tiếp vào AIContext.workflow —
 * nay bị cấm sửa AIContext). Bản mới đi đúng thiết kế:
 *
 *   DECISION_READY -> WorkflowManager (loại trùng liên tiếp, giữ thứ
 *   tự) -> TaskQueue.enqueue() -> WORKFLOW_READY
 *
 * Nhiệm vụ DUY NHẤT: điều phối luồng (loại trùng, giữ thứ tự, đẩy
 * vào hàng đợi). CHƯA THỰC THI gì cả.
 *
 * TUYỆT ĐỐI KHÔNG: gọi Driver/command-engine, gửi MIDI, click chuột,
 * gọi AutoTune, đọc UI, đọc AIContext.
 * ==========================================================
 */

class WorkflowManager {

    constructor() {

        // Action cuối cùng đã xử lý — dùng để loại trùng LIÊN TIẾP, kể cả khi 2 action
        // giống nhau đến ở 2 lần DECISION_READY khác nhau (không chỉ trùng trong cùng 1 mảng).
        this.lastAction = null;

        this._registerListeners();

    }

    _registerListeners() {

        EventBus.subscribe(Events.DECISION_READY, (actions) => this._onDecisionReady(actions));

    }

    _onDecisionReady(actions = []) {

        const deduped = this._dedupeConsecutive(actions);

        if (deduped.length === 0) {

            return; // toàn bộ đều trùng với action gần nhất -> không có gì mới để làm

        }

        for (const action of deduped) {

            TaskQueue.enqueue(action);

        }

        Logger.info("WorkflowManager", `WORKFLOW_READY: [${deduped.map((a) => `${a.action}=${a.value}`).join(", ")}]`);

        EventBus.publish(Events.WORKFLOW_READY, { actions: deduped });

    }

    /**
     * Loại action TRÙNG LIÊN TIẾP — so từng action trong mảng đến với action NGAY TRƯỚC nó
     * (kể cả action cuối cùng từ lần DECISION_READY trước, lưu ở this.lastAction), GIỮ
     * NGUYÊN THỨ TỰ các action còn lại. "Trùng" = cùng action + cùng target + cùng value.
     */
    _dedupeConsecutive(actions) {

        const result = [];
        let previous = this.lastAction;

        for (const action of actions) {

            if (previous && this._isSameAction(previous, action)) {

                continue; // trùng liên tiếp -> bỏ qua, không đẩy vào kết quả

            }

            result.push(action);
            previous = action;

        }

        if (result.length > 0) {

            this.lastAction = result[result.length - 1];

        }

        return result;

    }

    _isSameAction(a, b) {

        return a.action === b.action && a.target === b.target && a.value === b.value;

    }

}

module.exports = new WorkflowManager();
