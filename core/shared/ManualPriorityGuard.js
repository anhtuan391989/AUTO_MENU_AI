/**
 * ==========================================================
 * Auto Menu AI
 * ManualPriorityGuard — Task A7: AI Execution Safety Guard Design
 * ----------------------------------------------------------
 * Hàm THUẦN (pure function) — không tự đọc ControlSource/ManualState, nhận đủ tham
 * số từ nơi gọi (PluginController._onWorkflowReady()) để dễ test độc lập bằng mock,
 * đúng convention DecisionRules.js/InferenceRules.js đã dùng trong project.
 *
 * TUYỆT ĐỐI KHÔNG: publish event, gọi MIDI/renderer, lưu state, đổi CURRENT_MODE.
 *
 * Quy tắc (đúng yêu cầu Task A7 mục 3-4):
 *   - UPDATE_BPM: chưa có backend thật -> luôn BLOCK, không mở đường execution.
 *   - LEGACY_CONTROL: giữ nguyên behavior hiện tại -> luôn BLOCK.
 *   - AI_CONTROL + ManualState missing/stale/timestamp không hợp lệ -> FAIL-SAFE BLOCK
 *     (không bao giờ coi các trường hợp này là "Manual inactive").
 *   - AI_CONTROL + Manual Key active + action thuộc nhóm Key (SET_KEY/LOAD_NEW_SONG) -> BLOCK.
 *   - AI_CONTROL + Manual Mod active + action thuộc nhóm Mod (SHIFT_KEY) -> BLOCK.
 *   - Key active không chặn action Mod, và ngược lại (2 trạng thái độc lập).
 * ==========================================================
 */

// Đề xuất ban đầu: 10 giây. Lý do: phải dài hơn NHIỀU so với độ trễ IPC bình thường
// (thường chỉ vài ms tới vài trăm ms, xem AGGREGATION_WINDOW_MS=400ms ở ResultQueue.js
// làm tham chiếu tốc độ pipeline hiện có), nhưng đủ ngắn để nếu renderer ngừng gửi cập
// nhật (crash, đóng cửa sổ, IPC treo) trong hơn 10 giây, Core AI phải coi dữ liệu là cũ
// và tự động fail-safe sang BLOCK thay vì tiếp tục tin vào 1 trạng thái Manual có thể đã
// lỗi thời từ lâu. Đây là giá trị ĐỀ XUẤT BAN ĐẦU của Claude A — CHƯA được kiểm chứng với
// tần suất gửi thật của kênh IPC Claude B sẽ xây (task đó chưa hoàn thành tại thời điểm
// viết file này) — cần Khói/Claude B xác nhận lại khi có tần suất gửi thật.
const STALE_TIMEOUT_MS = 10000;

const KEY_ACTIONS = new Set(["SET_KEY", "LOAD_NEW_SONG"]);
const MOD_ACTIONS = new Set(["SHIFT_KEY"]);

/**
 * @param {"LEGACY_CONTROL"|"AI_CONTROL"} controlSource
 * @param {{keyActive: boolean, modActive: boolean, timestamp: number}|null} manualState
 * @param {string} action - "SET_KEY" | "SHIFT_KEY" | "UPDATE_BPM" | "LOAD_NEW_SONG"
 * @param {number} [now] - CHỈ dùng cho unit test (mock thời gian); mặc định Date.now()
 * @returns {{allowed: boolean, reason: string}}
 */
function evaluate(controlSource, manualState, action, now = Date.now()) {

    // UPDATE_BPM: chưa có backend thật — KHÔNG được tự mở đường execution ở A7, luôn
    // BLOCK bất kể Manual/ControlSource ra sao (Task A7 mục 4 + mục 9).
    if (action === "UPDATE_BPM") {
        return { allowed: false, reason: "[AI Control] BLOCKED — UPDATE_BPM chưa có backend thật (out of scope A7)" };
    }

    // LEGACY_CONTROL: giữ NGUYÊN behavior hiện tại — luôn BLOCK, không đổi gì so với
    // trước Task A7 (PluginController vẫn tự return sớm ở bước ControlSource như cũ,
    // hàm này chỉ phản ánh lại đúng behavior đó để logic tập trung 1 chỗ).
    if (controlSource !== "AI_CONTROL") {
        return { allowed: false, reason: "[AI Control] BLOCKED — LEGACY_CONTROL (behavior không đổi)" };
    }

    // FAIL-SAFE: thiếu ManualState hoàn toàn -> BLOCK, KHÔNG coi là inactive.
    if (!manualState) {
        return { allowed: false, reason: "[AI Control] BLOCKED — ManualState missing (fail-safe)" };
    }

    // FAIL-SAFE: timestamp không hợp lệ -> BLOCK, KHÔNG coi là inactive.
    if (typeof manualState.timestamp !== "number" || !Number.isFinite(manualState.timestamp)) {
        return { allowed: false, reason: "[AI Control] BLOCKED — ManualState timestamp không hợp lệ (fail-safe)" };
    }

    // FAIL-SAFE: state cũ (stale) hoặc đồng hồ lệch (timestamp ở tương lai) -> BLOCK.
    const age = now - manualState.timestamp;
    if (age > STALE_TIMEOUT_MS || age < 0) {
        return { allowed: false, reason: `[AI Control] BLOCKED — ManualState stale (age=${age}ms, giới hạn ${STALE_TIMEOUT_MS}ms, fail-safe)` };
    }

    // Guard phân biệt Key và Mod — chỉ kiểm tra đúng loại Manual tương ứng với action;
    // Key active KHÔNG chặn action Mod và ngược lại (2 trạng thái độc lập).
    if (KEY_ACTIONS.has(action)) {
        if (manualState.keyActive) {
            return { allowed: false, reason: "[AI Control] BLOCKED — Manual control (Key) is active" };
        }
        return { allowed: true, reason: "Manual (Key) inactive — AI command cho phép đi tiếp" };
    }

    if (MOD_ACTIONS.has(action)) {
        if (manualState.modActive) {
            return { allowed: false, reason: "[AI Control] BLOCKED — Manual control (Mod) is active" };
        }
        return { allowed: true, reason: "Manual (Mod) inactive — AI command cho phép đi tiếp" };
    }

    // action lạ, không thuộc KEY_ACTIONS/MOD_ACTIONS đã biết -> không có quy tắc rõ
    // ràng, fail-safe BLOCK thay vì mặc định cho qua.
    return { allowed: false, reason: `[AI Control] BLOCKED — action "${action}" không thuộc KEY_ACTIONS/MOD_ACTIONS đã biết (fail-safe)` };
}

module.exports = { evaluate, STALE_TIMEOUT_MS, KEY_ACTIONS, MOD_ACTIONS };
