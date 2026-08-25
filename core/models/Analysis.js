const BaseModel = require("../shared/BaseModel");

const Song = require("./Song");
const Key = require("./Key");
const BPM = require("./BPM");
const Modulation = require("./Modulation");

class Analysis extends BaseModel {

    constructor() {

        super();

        this.song = new Song();

        this.key = new Key();

        this.bpm = new BPM();

        this.modulation = new Modulation();

        this.completed = false;

        this.analyzing = false;

    }

}

module.exports = Analysis;