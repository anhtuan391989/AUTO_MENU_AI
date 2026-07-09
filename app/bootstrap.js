const EventBus = require("./EventBus");
const EVENTS = require("./events");

module.exports = function bootstrap() {

    EventBus.onEvent(EVENTS.APP_READY, () => {

        console.log("[AI] Ready");

    });

    EventBus.onEvent(EVENTS.AUDIO_STARTED, () => {

        console.log("[AI] Audio Started");

    });

    EventBus.onEvent(EVENTS.KEY_UPDATED, (data) => {

        console.log("[AI] Key:", data);

    });

    EventBus.onEvent(EVENTS.MOD_UPDATED, (data) => {

        console.log("[AI] MOD:", data);

    });

}
;require("./WorkflowManager");