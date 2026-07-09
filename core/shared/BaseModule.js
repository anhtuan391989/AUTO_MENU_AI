/**
 * ==========================================================
 * Auto Menu AI
 * BaseModule
 * ----------------------------------------------------------
 * Base class cho toàn bộ Module trong hệ thống.
 * Mọi Service, Manager, Driver, Engine đều kế thừa class này.
 * ==========================================================
 */

class BaseModule {

    constructor(name = "Module") {

        this.name = name;

        this.initialized = false;

        this.running = false;

        this.enabled = true;

        this.createdAt = Date.now();

    }

    async init() {

        this.initialized = true;

        return true;

    }

    async start() {

        if (!this.initialized) {

            await this.init();

        }

        this.running = true;

        return true;

    }

    async stop() {

        this.running = false;

        return true;

    }

    async destroy() {

        this.running = false;

        this.initialized = false;

        return true;

    }

    enable() {

        this.enabled = true;

    }

    disable() {

        this.enabled = false;

    }

    isEnabled() {

        return this.enabled;

    }

    isRunning() {

        return this.running;

    }

    isInitialized() {

        return this.initialized;

    }

    getName() {

        return this.name;

    }

}

module.exports = BaseModule;