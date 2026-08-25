const BaseModule = require("./BaseModule");

/**
 * Base class cho Engine phân tích
 */

class BaseEngine extends BaseModule {

    constructor(name = "Engine") {

        super(name);

        this.confidence = 0;

    }

    async analyze(data) {

        return null;

    }

    setConfidence(value) {

        this.confidence = value;

    }

    getConfidence() {

        return this.confidence;

    }

}

module.exports = BaseEngine;