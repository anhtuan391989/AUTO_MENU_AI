class Utils {

    static sleep(ms) {

        return new Promise(resolve => setTimeout(resolve, ms));

    }

    static randomID(length = 8) {

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        let result = "";

        for (let i = 0; i < length; i++) {

            result += chars.charAt(Math.floor(Math.random() * chars.length));

        }

        return result;

    }

    static clamp(value, min, max) {

        return Math.min(Math.max(value, min), max);

    }

}

module.exports = Utils;