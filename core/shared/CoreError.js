class CoreError extends Error {

    constructor(message, code = "CORE_ERROR") {

        super(message);

        this.name = "CoreError";

        this.code = code;

        this.time = new Date();

    }

}

module.exports = CoreError;