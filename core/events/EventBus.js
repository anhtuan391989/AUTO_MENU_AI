const EventEmitter = require("events");

class EventBus extends EventEmitter {

    constructor() {

        super();

        this.setMaxListeners(200);

    }

    publish(event, payload = {}) {

        this.emit(event.name, payload);

    }

    subscribe(event, callback) {

        this.on(event.name, callback);

    }

    subscribeOnce(event, callback) {

        this.once(event.name, callback);

    }

    unsubscribe(event, callback) {

        this.removeListener(event.name, callback);

    }

}

module.exports = new EventBus();