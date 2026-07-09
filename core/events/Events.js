const TYPES = require("./EventTypes");

module.exports = {

    APP_READY: {
        type: TYPES.APP,
        name: "APP_READY"
    },

    APP_CLOSE: {
        type: TYPES.APP,
        name: "APP_CLOSE"
    },

    AUDIO_STARTED: {
        type: TYPES.AUDIO,
        name: "AUDIO_STARTED"
    },

    AUDIO_STOPPED: {
        type: TYPES.AUDIO,
        name: "AUDIO_STOPPED"
    },

    SONG_CHANGED: {
        type: TYPES.AUDIO,
        name: "SONG_CHANGED"
    },

    KEY_UPDATED: {
        type: TYPES.KEY,
        name: "KEY_UPDATED"
    },

    BPM_UPDATED: {
        type: TYPES.BPM,
        name: "BPM_UPDATED"
    },

    MOD_UPDATED: {
        type: TYPES.MOD,
        name: "MOD_UPDATED"
    }

};