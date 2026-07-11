const Kernel = require("./Kernel");

const Logger = require("../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * BootLoader
 * ----------------------------------------------------------
 * Diem boot DUY NHAT cua AI Core.
 *
 * BootLoader tao ra 1 Kernel singleton, va la noi DANG KY cac
 * module (Engine/Driver/Controller) vao Kernel truoc khi
 * init()/start() duoc goi.
 *
 * QUAN TRONG: o buoc hien tai (AI Core foundation), Key/Mod/BPM
 * Engine va PluginController CHUA duoc cai dat (core/ai/engines/*
 * va core/drivers/* van la file rong), nen cac dong dang ky ben
 * duoi dang de dang comment san.
 *
 * O buoc sau, khi 1 module (vi du KeyEngine) duoc cai dat that,
 * chi can:
 *   1. require dung file class do
 *   2. bo comment dong kernel.register(...) tuong ung
 * Kernel se tu quan ly vong doi cua module do, KHONG can sua gi
 * trong Kernel.js hay Registry.js.
 * ==========================================================
 */

const kernel = new Kernel();

class BootLoader {

    constructor() {

        this.kernel = kernel;

        this.booted = false;

    }

    async boot() {

        if (this.booted) {

            return this.kernel;

        }

        Logger.info("BootLoader", "Bat dau boot AI Core...");

        // ==================================================================
        // KHU VUC DANG KY MODULE TUONG LAI (chua cai dat o buoc nay)
        // ==================================================================

        // -- Key Engine (uu tien #1 theo PROJECT_CONTEXT.md, CHUA cai detection) --
        // const KeyEngine = require("../ai/engines/KeyEngine");
        // this.kernel.register("engine", "KeyEngine", new KeyEngine());

        // -- Mod Engine (uu tien #2) --
        // const ModEngine = require("../ai/engines/ModEngine");
        // this.kernel.register("engine", "ModEngine", new ModEngine());

        // -- BPM Engine --
        // const BPMEngine = require("../ai/engines/BPMEngine");
        // this.kernel.register("engine", "BPMEngine", new BPMEngine());

        // -- Plugin Controller (dieu phoi AutoTuneDriver/AutoKeyDriver/...) --
        // const PluginController = require("../drivers/PluginController");
        // this.kernel.register("controller", "PluginController", new PluginController());

        // ==================================================================

        await this.kernel.init();

        await this.kernel.start();

        this.booted = true;

        Logger.success("BootLoader", "AI Core da san sang (chua co Engine/Controller nao duoc nap).");

        return this.kernel;

    }

    getKernel() {

        return this.kernel;

    }

}

module.exports = new BootLoader();
