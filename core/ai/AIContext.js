class AIContext {

    constructor() {

        this.reset();

    }

    reset() {

        this.app = {
            version: "2.0.0",
            status: "BOOT",
            startTime: Date.now()
        };

        this.system = {
            cpu: 0,
            ram: 0,
            os: null
        };

        this.audio = {
            active: false,
            device: null,
            level: 0,
            sampleRate: 0,
            channels: 2
        };

        this.song = {
            id: null,
            hash: null,
            title: null,
            duration: 0,
            position: 0
        };

        this.analysis = {
            analyzing: false,
            progress: 0,
            lastUpdate: 0
        };

        this.key = {
            current: null,
            previous: null,
            confidence: 0,
            stable: false
        };

        this.bpm = {
            current: 0,
            confidence: 0,
            stable: false
        };

        this.mod = {
            detected: false,
            from: null,
            to: null,
            time: null,
            confidence: 0
        };

        this.plugin = {
            studioOne: false,
            autoTune: false,
            autoKey: false,
            soundShifter: false
        };

        this.workflow = {
            state: "BOOT",
            busy: false,
            currentTask: null,
            currentSong: null,
            lastAnalysis: 0,
            queue: []

        };

        this.cache = {
            hit: false,
            loaded: false,
            saving: false
        };

        this.decision = {
            needAnalyze: false,
            needKey: false,
            needBPM: false,
            needMOD: false,
            needAutomation: false
        };

        brain: {

            initialized: false,

                running: false,

                    version: "2.0.0"

        },

    }

}

module.exports = new AIContext();