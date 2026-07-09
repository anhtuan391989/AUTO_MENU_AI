const AIBrain = require("./AIBrain");
const WorkflowManager = require("./WorkflowManager");
const DecisionEngine = require("./DecisionEngine");
const EventBus = require("./EventBus");
const Context = require("./AIContext");

class AIBootstrap {

    constructor() {

        this.ai = null;

        this.initialized = false;

    }

    async initialize() {

        if (this.initialized) return;

        this.ai = new AIBrain();

        await this.ai.initialize();

        this.initialized = true;

        console.log("AI Bootstrap Ready");

    }

    getBrain() {

        return this.ai;

    }

}

module.exports = new AIBootstrap();