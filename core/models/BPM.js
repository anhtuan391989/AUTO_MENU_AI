const BaseModel = require("../shared/BaseModel");

class BPM extends BaseModel {

    constructor() {

        super();

        this.current = 0;

        this.previous = 0;

        this.confidence = 0;

        this.detectedAt = null;

    }

}

module.exports = BPM;