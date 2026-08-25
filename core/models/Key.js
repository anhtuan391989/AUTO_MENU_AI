const BaseModel = require("../shared/BaseModel");

class Key extends BaseModel {

    constructor() {

        super();

        this.current = "";

        this.previous = "";

        this.scale = "";

        this.camelot = "";

        this.confidence = 0;

        this.detectedAt = null;

    }

}

module.exports = Key;