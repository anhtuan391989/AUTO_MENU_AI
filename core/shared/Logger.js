class Logger {

    static info(module, message) {

        console.log(`[INFO] [${module}] ${message}`);

    }

    static success(module, message) {

        console.log(`[SUCCESS] [${module}] ${message}`);

    }

    static warning(module, message) {

        console.warn(`[WARNING] [${module}] ${message}`);

    }

    static error(module, message) {

        console.error(`[ERROR] [${module}] ${message}`);

    }

}

module.exports = Logger;