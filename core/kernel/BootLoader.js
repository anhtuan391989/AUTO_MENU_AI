const Kernel = require("./Kernel");
const Logger = require("../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * BootLoader
 * ----------------------------------------------------------
 * Nơi DUY NHẤT liệt kê những module nào cần Kernel khởi động,
 * và theo thứ tự nào. Khi Phase 2 (Runtime, Audio Pipeline,
 * Key Engine, MOD Engine...) có module thật, chỉ cần thêm
 * dòng đăng ký ở đây — không cần sửa Kernel hay Registry.
 *
 * Hiện tại (Phase 1) chưa có module nghiệp vụ nào sẵn sàng để
 * đăng ký, nên danh sách còn để trống. BootLoader vẫn chạy
 * được bình thường, Kernel sẽ boot với 0 module.
 * ==========================================================
 */

function registerCoreModules() {

    // TODO (Phase 2): Kernel.register("audioService", new AudioService());
    // TODO (Phase 2): Kernel.register("driverManager", new DriverManager());
    // TODO (Phase 2): Kernel.register("keyEngine", new KeyEngine());
    // TODO (Phase 2): Kernel.register("modEngine", new ModEngine());

}

async function boot() {

    Logger.info("BootLoader", "Bắt đầu khởi động Core...");

    registerCoreModules();

    await Kernel.boot();

    return Kernel;

}

module.exports = {

    boot,

    registerCoreModules

};
