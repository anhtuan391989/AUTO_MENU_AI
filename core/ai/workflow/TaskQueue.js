/**
 * ==========================================================
 * Auto Menu AI
 * TaskQueue
 * ----------------------------------------------------------
 * Hàng đợi thuần (FIFO) cho các DecisionAction đã được WorkflowManager
 * xử lý xong (loại trùng, giữ thứ tự). CHỈ lưu trữ và cho lấy ra theo
 * yêu cầu — KHÔNG tự chạy, KHÔNG polling, KHÔNG setInterval. Việc
 * "khi nào lấy ra để thực thi" thuộc về tầng khác (Plugin Controller,
 * chưa xây) — TaskQueue chỉ phản ứng khi được gọi trực tiếp.
 *
 * TASK A59.5 — LIFECYCLE HARDENING (không phải execution architecture mới):
 * A58 xác nhận không có consumer nào gọi dequeue() trong pipeline hiện tại
 * (PluginController xử lý trực tiếp từ payload sự kiện WORKFLOW_READY, không
 * đọc từ TaskQueue) -> queue tăng vô hạn trong 1 phiên chạy dài (app chạy
 * liên tục hàng giờ khi biểu diễn). "Khi nào/ai tiêu thụ hàng đợi" VẪN CHƯA
 * có specification rõ ràng (comment ngay phía trên: "tầng khác... chưa xây")
 * — A59 KHÔNG tự quyết định kiến trúc đó (đúng phạm vi bị cấm: không tạo
 * execution engine mới). Thứ DUY NHẤT được sửa ở đây là chặn triệu chứng
 * "tăng vô hạn": giới hạn kích thước tối đa, loại bỏ phần tử CŨ NHẤT khi vượt
 * ngưỡng (giữ đúng ngữ nghĩa FIFO — phần tử mới nhất luôn được ưu tiên giữ
 * lại), kèm log rõ ràng mỗi lần phải loại bỏ. Đây là lưới an toàn tạm thời,
 * không phải thiết kế "khi nào thực thi" — khi tầng thực thi thật được xây,
 * ngưỡng này có thể không còn cần thiết.
 * ==========================================================
 */

const Logger = require("../../shared/Logger");

// Ngưỡng phòng thủ, KHÔNG phải giá trị nghiệp vụ đã tuning — chỉ đủ lớn để không bao giờ ảnh
// hưởng vận hành bình thường (1 buổi diễn nhiều giờ với vài trăm lần đổi Key/BPM/Mod vẫn còn dư
// nhiều), chỉ có tác dụng khi queue THẬT SỰ bị bỏ quên không tiêu thụ trong thời gian rất dài.
const MAX_QUEUE_SIZE = 500;

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

class TaskQueue {

    constructor() {

        this.queue = [];

        this.busy = false;

    }

    enqueue(task) {

        this.queue.push(task);

        if (this.queue.length > MAX_QUEUE_SIZE) {

            const dropped = this.queue.shift();

            Logger.warning(
                "TaskQueue",
                `Hàng đợi vượt ngưỡng an toàn (${MAX_QUEUE_SIZE}) — không có consumer nào tiêu thụ ` +
                `(xem A59-REPORT.md mục TaskQueue Lifecycle). Đã loại bỏ phần tử CŨ NHẤT để tránh ` +
                `tăng vô hạn: ${safeStringify(dropped)}`
            );

        }

    }

    dequeue() {

        return this.queue.length > 0 ? this.queue.shift() : null;

    }

    clear() {

        this.queue = [];

    }

    isBusy() {

        return this.busy;

    }

    // Dành cho tầng thực thi (chưa xây) đánh dấu "đang bận" trong lúc chạy 1 task —
    // hiện tại KHÔNG có nơi nào gọi 2 hàm này (chưa có tầng thực thi), để sẵn API.
    markBusy() {

        this.busy = true;

    }

    markFree() {

        this.busy = false;

    }

    isEmpty() {

        return this.queue.length === 0;

    }

    peek() {

        return this.queue.length > 0 ? this.queue[0] : null;

    }

    size() {

        return this.queue.length;

    }

}

module.exports = new TaskQueue();
