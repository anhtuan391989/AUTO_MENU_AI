class EventQueue {

    constructor() {

        this.queue = [];

    }

    push(event) {

        this.queue.push(event);

    }

    pop() {

        return this.queue.shift();

    }

    clear() {

        this.queue = [];

    }

    size() {

        return this.queue.length;

    }

}

module.exports = new EventQueue();