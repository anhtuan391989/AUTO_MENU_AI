<<<<<<< HEAD
const BaseModule = require("../shared/BaseModule");

const Logger = require("../shared/Logger");

const EventBus = require("../events/EventBus");

const Events = require("../events/Events");
=======
const BaseModule = require("../../shared/BaseModule");

const Logger = require("../../shared/Logger");

const EventBus = require("../../events/EventBus");

const Events = require("../../events/Events");
>>>>>>> origin/main

const Registry = require("./Registry");

/**
 * ==========================================================
 * Auto Menu AI
 * Kernel
 * ----------------------------------------------------------
 * Day la "trai tim" cua AI Core.
 *
 * Kernel KHONG chua logic phan tich nhac (Key/BPM/Mod).
 * Kernel chi chiu trach nhiem:
 *  - Giu 1 Registry duy nhat chua moi module (Engine/Driver/
 *    Service/Controller/Manager) da duoc dang ky.
 *  - Dieu phoi vong doi chung: init -> start -> stop -> destroy
 *    cho toan bo module trong Registry, theo dung thu tu.
 *  - Phat cac su kien vong doi qua EventBus dung chung cua Core
 *    (core/events/EventBus.js) de cac module khac lang nghe.
 *
 * Cac Engine/Driver/Controller that (KeyEngine, ModEngine,
 * BPMEngine, PluginController, ...) se duoc cai dat o cac buoc
 * sau va chi can dang ky vao Kernel qua register(), khong can
 * sua lai Kernel.
 * ==========================================================
 */

class Kernel extends BaseModule {

    constructor() {

        super("Kernel");

        this.registry = new Registry();

        this.bus = EventBus;

    }

    /**
     * Dang ky 1 module vao Kernel theo nhom (slot).
     * slot hop le: "engine" | "driver" | "service" | "controller" | "manager"
     *
     * Vi du (dung o buoc sau, khi cac Engine da co code that):
     *   kernel.register("engine", "KeyEngine", new KeyEngine());
     *   kernel.register("controller", "PluginController", new PluginController());
     */
    register(slot, id, instance) {

        this.registry.registerModule(slot, id, instance);

        return instance;

    }

    unregister(slot, id) {

        this.registry.unregisterModule(slot, id);

    }

    /**
     * Lay lai 1 module da dang ky, dung cho cac module khac
     * can goi cheo nhau qua Kernel thay vi require() truc tiep.
     */
    resolve(slot, id) {

        return this.registry.getModule(slot, id);

    }

    async init() {

        if (this.initialized) return;

        Logger.info("Kernel", "Dang khoi tao (init) cac module da dang ky...");

        for (const module of this.registry.getAllModules()) {

            if (typeof module.init === "function") {

                await module.init();

            }

        }

        await super.init();

        Logger.success("Kernel", "Init hoan tat.");

    }

    async start() {

        if (!this.initialized) {

            await this.init();

        }

        Logger.info("Kernel", "Dang khoi dong (start) cac module da dang ky...");

        for (const module of this.registry.getAllModules()) {

            if (typeof module.start === "function") {

                await module.start();

            }

        }

        await super.start();

        this.bus.publish(Events.APP_READY, { source: "Kernel" });

        Logger.success("Kernel", "Kernel dang chay.");

    }

    async stop() {

        Logger.info("Kernel", "Dang dung (stop) cac module da dang ky...");

        for (const module of this.registry.getAllModules()) {

            if (typeof module.stop === "function") {

                await module.stop();

            }

        }

        await super.stop();

        Logger.info("Kernel", "Kernel da dung.");

    }

    async destroy() {

        for (const module of this.registry.getAllModules()) {

            if (typeof module.destroy === "function") {

                await module.destroy();

            }

        }

        this.registry.clear();

        await super.destroy();

        Logger.info("Kernel", "Kernel da bi huy (destroy).");

    }

    /**
     * Tra thong tin tong quan de debug/log, khong dung cho logic.
     */
    getStatus() {

        return {

            initialized: this.initialized,

            running: this.running,

            modules: this.registry.getSummary()

        };

    }

}

module.exports = Kernel;
