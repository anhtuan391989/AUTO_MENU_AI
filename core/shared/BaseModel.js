/**
 * ==========================================================
 * BaseModel
 * Dùng cho Song, Plugin, Analysis...
 * ==========================================================
 */

class BaseModel {

    constructor() {

        this.id = "";

        this.createdAt = Date.now();

        this.updatedAt = Date.now();

    }

    update(data = {}) {

        Object.assign(this, data);

        this.updatedAt = Date.now();

    }

    toJSON() {

        return { ...this };

    }

}

module.exports = BaseModel;