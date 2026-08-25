const Registry = require("./Registry");
const EventBus = require("../events/EventBus");
const Events = require("../events/Events");
const Logger = require("../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * Kernel
 * ----------------------------------------------------------
 * Điểm khởi động Core. Kernel không tự chứa logic nghiệp vụ,
 * chỉ chịu trách nhiệm:
 *   1. Giữ 1 Registry duy nhất cho toàn hệ thống.
 *   2. Gọi init() rồi start() cho từng module đã đăng ký,
 *      theo đúng thứ tự đăng ký.
 *   3. Phát sự kiện APP_READY qua EventBus khi xong.
 *
 * Kernel KHÔNG đụng tới UI/HTML. Nó chỉ chạy ở tầng Node
 * (main process), UI vẫn hoạt động độc lập như cũ.
 * ==========================================================
 */

class Kernel {

    constructor() {

        this.registry = new Registry();

        this.booted = false;

    }

    register(id, instance) {

        return this.registry.registerModule(id, instance);

    }

    get(id) {

        return this.registry.getModule(id);

    }

    async boot() {

        if (this.booted) {

            return;

        }

        const modules = this.registry.getAllModules();

        for (const module of modules) {

            await this.initModule(module);

        }

        for (const module of modules) {

            await this.startModule(module);

        }

        this.booted = true;

        EventBus.publish(Events.APP_READY, {});

        Logger.success("Kernel", "Boot hoàn tất.");

    }

    async initModule(module) {

        if (typeof module.init !== "function") {

            return;

        }

        try {

            await module.init();

            Logger.info("Kernel", `Đã init: ${module.getName ? module.getName() : "Module"}`);

        } catch (err) {

            Logger.error("Kernel", `Init lỗi (${module.getName ? module.getName() : "Module"}): ${err.message}`);

            throw err;

        }

    }

    async startModule(module) {

        if (typeof module.start !== "function") {

            return;

        }

        try {

            await module.start();

            Logger.info("Kernel", `Đã start: ${module.getName ? module.getName() : "Module"}`);

        } catch (err) {

            Logger.error("Kernel", `Start lỗi (${module.getName ? module.getName() : "Module"}): ${err.message}`);

            throw err;

        }

    }

    async shutdown() {

        const modules = this.registry.getAllModules();

        for (const module of modules) {

            if (typeof module.stop === "function") {

                await module.stop();

            }

        }

        this.booted = false;

        EventBus.publish(Events.APP_CLOSE, {});

    }

    isBooted() {

        return this.booted;

    }

}

module.exports = new Kernel();
