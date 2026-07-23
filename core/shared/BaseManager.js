const BaseModule = require("./BaseModule");

/**
 * Base class cho các Manager
 */

class BaseManager extends BaseModule {

    constructor(name = "Manager") {

        super(name);

        this.items = new Map();

    }

    register(id, object) {

        this.items.set(id, object);

    }

    unregister(id) {

        this.items.delete(id);

    }

    get(id) {

        return this.items.get(id);

    }

    has(id) {

        return this.items.has(id);

    }

    clear() {

        this.items.clear();

    }

    getAll() {

        return [...this.items.values()];

    }

}

module.exports = BaseManager;