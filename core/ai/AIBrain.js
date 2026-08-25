const BaseModule = require("../shared/BaseModule");

class AIBrain extends BaseModule {

    constructor() {

        super("AI Brain");

        this.context = null;

        this.workflow = null;

        this.ready = false;

    }

    async init() {

        await super.init();

        console.log("[AI] Initializing...");

        this.ready = true;

    }

    async start() {

        await super.start();

        console.log("[AI] Started");

    }

    async stop() {

        await super.stop();

        console.log("[AI] Stopped");

    }

    async destroy() {

        await super.destroy();

        console.log("[AI] Destroyed");

    }

}

module.exports = AIBrain;