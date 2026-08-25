const EventEmitter = require("events");

class EventBus extends EventEmitter {

    constructor() {

        super();

        this.setMaxListeners(200);

    }

    publish(event, payload = {}) {

        this.emit(event, payload);

    }

    subscribe(event, callback) {

        this.on(event, callback);

    }

    subscribeOnce(event, callback) {

        this.once(event, callback);

    }

    unsubscribe(event, callback) {

        this.removeListener(event, callback);

    }

}

module.exports = new EventBus();
