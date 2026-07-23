const BaseModule = require("./BaseModule");

/**
 * Base class cho tất cả Service
 */

class BaseService extends BaseModule {

    constructor(name = "Service") {

        super(name);

        this.startedAt = null;

    }

    async start() {

        await super.start();

        this.startedAt = Date.now();

    }

    getUptime() {

        if (!this.startedAt) return 0;

        return Date.now() - this.startedAt;

    }

}

module.exports = BaseService;