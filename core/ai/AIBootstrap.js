const AIBrain = require("./AIBrain");
const WorkflowManager = require("./managers/WorkflowManager");
const DecisionEngine = require("./decision/DecisionEngine");
const EventBus = require("../events/EventBus");
const Context = require("./AIContext");
const AnalysisState = require("./AnalysisState"); // require để kích hoạt lắng nghe KEY/BPM/MOD_UPDATED (xem AnalysisState.js)

class AIBootstrap {

    constructor() {

        this.ai = null;

        this.initialized = false;

    }

    async initialize() {

        if (this.initialized) return;

        this.ai = new AIBrain();

        await this.ai.init();

        this.initialized = true;

        console.log("AI Bootstrap Ready");

    }

    getBrain() {

        return this.ai;

    }

    getAnalysisState() {

        return AnalysisState;

    }

}

module.exports = new AIBootstrap();
