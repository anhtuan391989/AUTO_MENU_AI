const BaseModule = require("./BaseModule");

/**
 * ==========================================================
 * Auto Menu AI
 * BaseDriver
 * ----------------------------------------------------------
 * Tất cả Driver đều kế thừa class này
 * Ví dụ:
 *  - StudioOneDriver
 *  - AutoTuneDriver
 *  - AutoKeyDriver
 *  - AHKDriver
 * ==========================================================
 */

class BaseDriver extends BaseModule {

    constructor(name = "Driver") {

        super(name);

        this.connected = false;

        this.version = "";

    }

    async connect() {

        this.connected = true;

        return true;

    }

    async disconnect() {

        this.connected = false;

        return true;

    }

    async execute(command, payload = {}) {

        throw new Error(`${this.name}: execute() chưa được cài đặt.`);

    }

    isConnected() {

        return this.connected;

    }

}

module.exports = BaseDriver;