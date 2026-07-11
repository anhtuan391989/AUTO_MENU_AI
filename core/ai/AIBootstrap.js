const BootLoader = require("../kernel/BootLoader");

const Context = require("./AIContext");

/**
 * ==========================================================
 * Auto Menu AI
 * AIBootstrap
 * ----------------------------------------------------------
 * DA SUA: file nay truoc day require 3 module khong ton tai
 * (WorkflowManager, DecisionEngine, EventBus ngay trong
 * core/ai/) va goi this.ai.initialize() trong khi AIBrain
 * (ke thua BaseModule) khong co ham initialize() -> app se
 * luon crash ngay khi require file nay.
 *
 * Bay gio AIBootstrap chi con 1 viec: goi BootLoader.boot() de
 * dung Kernel + Registry, va cap nhat trang thai chung trong
 * AIContext. API ben ngoai (initialize() / getBrain()) duoc giu
 * nguyen ten de app/main.js khong can doi cach goi.
 * ==========================================================
 */

class AIBootstrap {

    constructor() {

        this.kernel = null;

        this.initialized = false;

    }

    async initialize() {

        if (this.initialized) {

            return this.kernel;

        }

        this.kernel = await BootLoader.boot();

        Context.app.status = "READY";

        Context.brain = {

            initialized: true,

            running: true,

            version: Context.app.version

        };

        this.initialized = true;

        console.log("AI Bootstrap Ready");

        return this.kernel;

    }

    /**
     * Giu ten getBrain() de tuong thich nguoc, nhung gio tra ve
     * Kernel thay vi AIBrain, vi Kernel moi la noi quan ly module that.
     */
    getBrain() {

        return this.kernel;

    }

    getKernel() {

        return this.kernel;

    }

}

module.exports = new AIBootstrap();
