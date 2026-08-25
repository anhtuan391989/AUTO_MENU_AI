const BaseModel = require("../shared/BaseModel");

class Song extends BaseModel {

    constructor() {

        super();

        this.title = "";

        this.artist = "";

        this.album = "";

        this.duration = 0;

        this.position = 0;

        this.sampleRate = 44100;

        this.channels = 2;

        this.file = "";

        this.hash = "";

        this.fingerprint = "";

    }

}

module.exports = Song;