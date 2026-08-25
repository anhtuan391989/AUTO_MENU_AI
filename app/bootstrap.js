const EventBus = require("../core/events/EventBus");
const Events = require("../core/events/Events");

/**
 * ==========================================================
 * Auto Menu AI
 * App Bootstrap
 * ----------------------------------------------------------
 * Đăng ký các listener log cơ bản cho tầng main process.
 * Không đụng UI/HTML.
 * ==========================================================
 */

module.exports = function bootstrap() {

    EventBus.subscribe(Events.APP_READY, () => {

        console.log("[AI] Ready");

    });

    EventBus.subscribe(Events.AUDIO_STARTED, () => {

        console.log("[AI] Audio Started");

    });

    EventBus.subscribe(Events.KEY_UPDATED, (data) => {

        console.log("[AI] Key:", data);

    });

    EventBus.subscribe(Events.MOD_UPDATED, (data) => {

        console.log("[AI] MOD:", data);

    });

};
