const BaseManager = require("../../shared/BaseManager");

const CoreError = require("../../shared/CoreError");

const Logger = require("../../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * Registry
 * ----------------------------------------------------------
 * Noi chua moi module ma Kernel quan ly, chia theo "slot"
 * (nhom) de cac phan khac cua he thong luon biet tim dung loai
 * module o dau, thay vi 1 danh sach phang lan lon.
 *
 * Slot co dinh san cho cac module se duoc cai dat o buoc sau:
 *  - engine     -> KeyEngine, ModEngine, BPMEngine, HarmonyEngine, SongEngine
 *  - driver     -> StudioOneDriver, AutoTuneDriver, AutoKeyDriver, ...
 *  - controller -> PluginController (dieu phoi nhieu Driver plugin)
 *  - service    -> AudioService, CacheService, DatabaseService, ...
 *  - manager    -> cac Manager tong hop khac neu can ve sau
 *
 * Registry ke thua BaseManager (core/shared/BaseManager.js) nen
 * van giu nguyen API phang register/get/has/unregister/getAll
 * cho cac truong hop khong can phan slot.
 * ==========================================================
 */

const SLOTS = ["engine", "driver", "service", "controller", "manager"];

class Registry extends BaseManager {

    constructor() {

        super("Registry");

        this.slots = {};

        SLOTS.forEach((slot) => {

            this.slots[slot] = new Map();

        });

    }

    registerModule(slot, id, instance) {

        if (!this.slots[slot]) {

            throw new CoreError(
                `Registry: slot "${slot}" khong hop le. Slot hop le: ${SLOTS.join(", ")}`,
                "REGISTRY_INVALID_SLOT"
            );

        }

        if (this.slots[slot].has(id)) {

            Logger.warning("Registry", `Module "${id}" trong slot "${slot}" da ton tai, se bi ghi de.`);

        }

        this.slots[slot].set(id, instance);

        this.register(id, instance);

        Logger.info("Registry", `Da dang ky [${slot}] "${id}"`);

    }

    unregisterModule(slot, id) {

        if (!this.slots[slot]) return;

        this.slots[slot].delete(id);

        this.unregister(id);

    }

    getModule(slot, id) {

        if (!this.slots[slot]) return null;

        return this.slots[slot].get(id) || null;

    }

    hasModule(slot, id) {

        return !!this.slots[slot] && this.slots[slot].has(id);

    }

    getSlot(slot) {

        if (!this.slots[slot]) return [];

        return [...this.slots[slot].values()];

    }

    getAllModules() {

        return this.getAll();

    }

    clear() {

        SLOTS.forEach((slot) => {

            this.slots[slot].clear();

        });

        super.clear();

    }

    /**
     * Tong quan so luong module theo tung slot, dung de log/debug
     * (vi du Kernel.getStatus()).
     */
    getSummary() {

        const summary = {};

        SLOTS.forEach((slot) => {

            summary[slot] = [...this.slots[slot].keys()];

        });

        return summary;

    }

}

module.exports = Registry;
