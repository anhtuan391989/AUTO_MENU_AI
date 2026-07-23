const BaseManager = require("../shared/BaseManager");

/**
 * ==========================================================
 * Auto Menu AI
 * Registry
 * ----------------------------------------------------------
 * Nơi đăng ký tập trung mọi Service / Manager / Driver / Engine
 * trong toàn hệ thống, để Kernel biết có gì và khởi động theo
 * đúng thứ tự.
 *
 * Kế thừa BaseManager (đã có sẵn register/get/has/getAll)
 * để không viết trùng logic lưu trữ.
 * ==========================================================
 */

class Registry extends BaseManager {

    constructor() {

        super("Registry");

    }

    registerModule(id, instance) {

        if (this.has(id)) {

            throw new Error(`Registry: module "${id}" đã được đăng ký trước đó.`);

        }

        this.register(id, instance);

        return instance;

    }

    getModule(id) {

        return this.get(id);

    }

    getAllModules() {

        return this.getAll();

    }

}

module.exports = Registry;
