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
 * ==========================================================
 */

class TaskQueue {

    constructor() {

        this.queue = [];

        this.busy = false;

    }

    enqueue(task) {

        this.queue.push(task);

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
