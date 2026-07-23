const BaseModel = require("../shared/BaseModel");

class Modulation extends BaseModel {

    constructor() {

        super();

        this.detected = false;

        this.from = "";

        this.to = "";

        this.time = 0;

        this.confidence = 0;

    }

}

module.exports = Modulation;