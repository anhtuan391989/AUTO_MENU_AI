const AIBrain = require("./AIBrain");
const WorkflowManager = require("./managers/WorkflowManager");
const DecisionEngine = require("./decision/DecisionEngine");
const EventBus = require("../events/EventBus");
const Context = require("./AIContext");

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

}

module.exports = new AIBootstrap();
