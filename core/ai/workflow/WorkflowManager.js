const EventBus = require("./EventBus");
const EVENTS = require("./events");
const Context = require("./AIContext");

class WorkflowManager {

    constructor() {

        this.currentState = "BOOT";

        this.busy = false;

        this.registerEvents();

    }

    registerEvents() {

        EventBus.onEvent(EVENTS.APP_READY, () => {

            this.changeState("READY");

        });

        EventBus.onEvent(EVENTS.AUDIO_STARTED, () => {

            this.startAnalysis();

        });

        EventBus.onEvent(EVENTS.ANALYSIS_FINISHED, () => {

            this.startDecision();

        });

        EventBus.onEvent(EVENTS.DECISION_READY, () => {

            this.execute();

        });

        EventBus.onEvent(EVENTS.AUTOMATION_FINISHED, () => {

            this.wait();

        });
        EventBus.onEvent(EVENTS.ERROR, () => {

            this.changeState("ERROR");

        });
    }

    changeState(state) {

        this.currentState = state;

        Context.workflow.state = state;

    }

    isBusy() {

        return this.busy;

    }

    startAnalysis() {

        if (this.busy) return;

        this.busy = true;

        this.changeState("ANALYZING");

        EventBus.emitEvent(EVENTS.ANALYSIS_STARTED);

    }

    startDecision() {

        this.changeState("DECIDING");

        EventBus.emitEvent(EVENTS.DECISION_READY);

    }

    execute() {

        this.changeState("EXECUTING");

        EventBus.emitEvent(EVENTS.AUTOMATION_STARTED);

    }

    wait() {

        this.busy = false;

        this.changeState("WAITING");

    }

    reset() {

        this.busy = false;

        this.changeState("READY");

    }

    enqueue(task) {

        Context.workflow.queue.push(task);

    }

    nextTask() {

        if (Context.workflow.queue.length === 0) {

            return null;

        }

        return Context.workflow.queue.shift();

    }


}

EventBus.onEvent(EVENTS.AI_STOPPED, () => {

    this.changeState("STOPPED");

});

module.exports = new WorkflowManager();