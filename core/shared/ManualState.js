/**
 * ==========================================================
 * Auto Menu AI
 * ManualState
 * ----------------------------------------------------------
 * TASK B3-C — REAL MANUAL STATE IPC.
 *
 * Kho lưu DUY NHẤT (in-memory, main process) cho snapshot Manual State THẬT nhận được từ
 * renderer qua IPC "report-manual-state". Đây là điểm chờ (chưa tồn tại trong repo lúc viết
 * file này) mà ManualPriorityGuard (A7b, CHƯA có trong repo — xem báo cáo B3-C) sẽ đọc để
 * quyết định ALLOW/BLOCK.
 *
 * NGUYÊN TẮC BẮT BUỘC (Mục 5, 7 của task):
 *   - KHÔNG tự gán `timestamp: Date.now()` ở đây để che việc renderer không gửi — lưu ĐÚNG
 *     giá trị renderer gửi, nguyên vẹn.
 *   - KHÔNG tự quyết định stale/missing ở đây — đó là việc của Guard. Module này CHỈ lưu và
 *     trả lại đúng những gì đã nhận, không thêm logic thời gian nào.
 *   - Trước khi renderer gửi lần đầu (hoặc nếu IPC mất/renderer crash) -> getManualState()
 *     PHẢI trả về `null`, KHÔNG được tự suy ra {keyActive:false, modActive:false,...} — nếu
 *     không, Guard phía dưới (khi được xây) sẽ hiểu nhầm "chưa có dữ liệu" thành "đã tắt tay",
 *     mở đường cho AI thực thi trong khi thực ra chỉ là chưa nhận được báo cáo.
 * ==========================================================
 */

let lastState = null; // null = CHƯA TỪNG nhận báo cáo nào — không phải {keyActive:false,...}

/**
 * Lưu 1 snapshot Manual State thật từ renderer.
 * @param {{keyActive: boolean, modActive: boolean, timestamp: number}} snapshot
 * @returns {{ok: boolean, detail?: string}}
 */
function setManualState(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return { ok: false, detail: "snapshot rỗng hoặc không phải object — bỏ qua, KHÔNG ghi đè state cũ." };
    }
    const { keyActive, modActive, timestamp } = snapshot;
    if (typeof keyActive !== "boolean" || typeof modActive !== "boolean" || typeof timestamp !== "number") {
        return {
            ok: false,
            detail: `snapshot sai kiểu dữ liệu (cần keyActive:boolean, modActive:boolean, timestamp:number) — nhận: keyActive=${typeof keyActive}, modActive=${typeof modActive}, timestamp=${typeof timestamp}. Bỏ qua, KHÔNG ghi đè state cũ.`,
        };
    }
    // Lưu ĐÚNG nguyên văn — không thêm field, không tự tính lại timestamp.
    lastState = { keyActive, modActive, timestamp };
    return { ok: true };
}

/**
 * @returns {{keyActive: boolean, modActive: boolean, timestamp: number} | null}
 * null nghĩa là CHƯA TỪNG nhận báo cáo nào từ renderer trong phiên chạy hiện tại của main
 * process — Guard đọc giá trị này phải coi null = BLOCK (Mục 7), không phải "an toàn, cho qua".
 */
function getManualState() {
    return lastState;
}

/** Chỉ dùng cho test — KHÔNG gọi trong luồng chạy thật của app. */
function _resetForTest() {
    lastState = null;
}

module.exports = { setManualState, getManualState, _resetForTest };
