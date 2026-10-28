"use strict";

// Kiểm tra app/EffectsWindow.js bằng cửa sổ GIẢ (không cần Electron) + kiểm tra nối dây tĩnh
// (preload.js, main.js, renderer.js, effects.html). Chạy: node tests/unit/EffectsWindowManager.verify.js

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const root = path.join(__dirname, "..", "..");
const { createEffectsWindowManager, computeInitialPosition, WIDTH, HEIGHT } = require(path.join(root, "app", "EffectsWindow.js"));

let pass = 0;
let fail = 0;
function check(cond, name) {
    if (cond) { pass++; } else { fail++; console.log("FAIL:", name); }
}

class FakeWin extends EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts || {};
        this.destroyed = false;
        this.visible = this.opts.show !== false;
        this.aot = false;
        this.minimized = false;
        this.loaded = null;
        this.webContents = { id: Math.random() };
        FakeWin.instances.push(this);
    }
    isDestroyed() { return this.destroyed; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    setAlwaysOnTop(v) { this.aot = !!v; }
    isAlwaysOnTop() { return this.aot; }
    loadFile(p) { this.loaded = p; }
    getBounds() { return { x: 100, y: 50, width: 1200, height: 300 }; }
    close() { this.destroyed = true; this.emit("closed"); }
}
FakeWin.instances = [];

const screenFake = { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) };

// ---- computeInitialPosition ----
{
    const wa = { x: 0, y: 0, width: 1920, height: 1040 };
    const below = computeInitialPosition({ x: 100, y: 50, width: 1200, height: 300 }, wa);
    check(below.y === 360 && below.x === 120, "đặt ngay dưới menu khi còn chỗ");
    const noRoom = computeInitialPosition({ x: 100, y: 700, width: 1200, height: 300 }, wa);
    check(noRoom.x === 1920 - WIDTH - 20 && noRoom.y === 20, "không còn chỗ dưới menu -> góc phải-trên");
    const clampX = computeInitialPosition({ x: 5000, y: 50, width: 100, height: 100 }, wa);
    check(clampX.x <= wa.width - WIDTH, "kẹp trong vùng làm việc theo trục X");
    const nullMain = computeInitialPosition(null, null);
    check(Number.isFinite(nullMain.x) && Number.isFinite(nullMain.y), "không có menu/màn hình vẫn ra toạ độ hợp lệ");
}

function setup() {
    FakeWin.instances.length = 0;
    const main = new FakeWin({});
    const mgr = createEffectsWindowManager({
        BrowserWindow: FakeWin,
        screen: screenFake,
        getMainWin: () => main,
        preloadPath: "/p/preload.js",
        htmlPath: "/p/effects.html"
    });
    return { main, mgr };
}
const effectsOf = (main) => FakeWin.instances.find((w) => w !== main);

// ---- mở / đóng / toggle ----
{
    const { main, mgr } = setup();
    check(mgr.isOpen() === false, "ban đầu chưa mở");
    mgr.toggle();
    const fx = effectsOf(main);
    check(!!fx && mgr.isOpen(), "toggle lần 1 mở cửa sổ");
    check(fx.opts.frame === false, "cửa sổ không viền (kéo bằng thanh tiêu đề)");
    check(fx.opts.skipTaskbar === true, "không thêm nút taskbar riêng");
    check(fx.opts.parent === undefined, "không có parent (độc lập với menu)");
    check(fx.opts.webPreferences.contextIsolation === true && fx.opts.webPreferences.nodeIntegration === false, "bảo mật webPreferences");
    check(fx.loaded === "/p/effects.html", "nạp đúng effects.html");
    check(fx.opts.show === false, "tạo ẩn rồi chỉ hiện khi sẵn sàng (không nháy)");
    fx.emit("ready-to-show");
    check(fx.visible === true, "ready-to-show -> hiện");
    mgr.toggle();
    check(!mgr.isOpen() && fx.destroyed, "toggle lần 2 đóng cửa sổ");
    check(main.listenerCount("minimize") === 0 && main.listenerCount("restore") === 0, "đóng xong gỡ hết listener khỏi menu");
    mgr.open(); mgr.open();
    check(FakeWin.instances.filter((w) => w !== main && !w.destroyed).length === 1, "open lặp lại không tạo 2 cửa sổ");
}

// ---- Always on Top TẮT: ẩn theo menu, hiện lại khi menu mở ----
{
    const { main, mgr } = setup();
    mgr.open();
    const fx = effectsOf(main);
    fx.emit("ready-to-show");
    main.emit("minimize");
    check(fx.visible === false, "AOT tắt: menu xuống taskbar -> cửa sổ hiệu ứng ẩn theo");
    main.emit("restore");
    check(fx.visible === true, "AOT tắt: menu mở lại -> cửa sổ hiệu ứng hiện lại");
}

// ---- Always on Top BẬT: vẫn hiện khi menu xuống taskbar ----
{
    const { main, mgr } = setup();
    mgr.open();
    const fx = effectsOf(main);
    fx.emit("ready-to-show");
    const r = mgr.setAlwaysOnTop(true);
    check(r.ok && r.value === true && fx.aot === true, "bật AOT -> setAlwaysOnTop(true) cho cửa sổ hiệu ứng");
    main.emit("minimize");
    check(fx.visible === true, "AOT bật: menu xuống taskbar -> cửa sổ hiệu ứng VẪN hiện");
    // tắt AOT khi menu đang xuống taskbar -> ẩn theo
    main.minimized = true;
    mgr.setAlwaysOnTop(false);
    check(fx.visible === false && fx.aot === false, "tắt AOT lúc menu đang thu nhỏ -> ẩn theo menu");
    main.minimized = false;
    main.emit("restore");
    check(fx.visible === true, "menu mở lại -> hiện");
}

// ---- AOT nhớ trong phiên: mở lại vẫn áp dụng ----
{
    const { main, mgr } = setup();
    mgr.setAlwaysOnTop(true);
    check(mgr.getAlwaysOnTop().value === true, "đặt AOT khi chưa mở cửa sổ vẫn nhớ");
    mgr.open();
    check(effectsOf(main).aot === true, "mở cửa sổ -> áp dụng AOT đã chọn");
    mgr.close();
    mgr.open();
    const fx2 = FakeWin.instances.filter((w) => w !== main && !w.destroyed)[0];
    check(fx2.aot === true, "đóng rồi mở lại -> AOT vẫn giữ");
}

// ---- giá trị không hợp lệ ----
{
    const { mgr } = setup();
    const r = mgr.setAlwaysOnTop("yes");
    check(r.ok === false && r.value === false, "giá trị không phải boolean bị từ chối");
}

// ---- đóng menu thì đóng luôn cửa sổ hiệu ứng (tránh app treo vì window-all-closed) ----
{
    const { main, mgr } = setup();
    mgr.open();
    const fx = effectsOf(main);
    main.emit("closed");
    check(fx.destroyed && !mgr.isOpen(), "menu đóng -> cửa sổ hiệu ứng đóng theo");
}

// ---- kiểm tra nguồn lệnh IPC ----
{
    const { main, mgr } = setup();
    mgr.open();
    const fx = effectsOf(main);
    check(mgr.isFromEffects(fx.webContents) === true, "nhận ra lệnh từ cửa sổ hiệu ứng");
    check(mgr.isFromEffects(main.webContents) === false, "từ chối lệnh effects-* đến từ menu");
    check(mgr.isFromMain(main.webContents) === true, "nhận ra lệnh toggle từ menu");
    check(mgr.isFromMain(fx.webContents) === false, "từ chối toggle đến từ chính cửa sổ hiệu ứng");
    check(mgr.isFromEffects(null) === false && mgr.isFromMain(undefined) === false, "sender rỗng bị từ chối");
}

// ---- nối dây tĩnh ----
{
    const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");
    const preload = read("app/preload.js");
    for (const ch of ["effects-toggle", "effects-close", "effects-get-aot", "effects-set-aot"]) {
        check(preload.includes(`"${ch}"`), `preload.js có kênh ${ch}`);
    }
    const main = read("app/main.js");
    check(main.includes('require("./EffectsWindow")'), "main.js nạp EffectsWindow");
    check(main.includes("screen } = require(\"electron\")"), "main.js lấy screen từ electron");
    for (const ch of ["effects-toggle", "effects-close", "effects-get-aot", "effects-set-aot"]) {
        check(main.includes(`"${ch}"`), `main.js đăng ký kênh ${ch}`);
    }
    const renderer = read("ui/js/renderer.js");
    check(/setupEffectsWindowButton[\s\S]*addEventListener\("click"[\s\S]*,\s*true\);/.test(renderer), "renderer.js chặn click nút HIỆU ỨNG ở pha capture");
    check(renderer.includes("stopImmediatePropagation") && renderer.includes("toggleEffectsWindow"), "renderer.js gọi toggleEffectsWindow");
    const html = read("ui/effects.html");
    check(html.includes("-webkit-app-region: drag"), "effects.html có vùng kéo (thanh tiêu đề)");
    check(html.includes("-webkit-app-region: no-drag"), "nút đóng không bị vùng kéo nuốt click");
    check(html.includes("fxAotCheck") && html.includes("setEffectsAlwaysOnTop"), "effects.html có checkbox Luôn hiển thị nối IPC");
}

console.log(`\nEffectsWindowManager: ${pass} đạt, ${fail} lỗi`);
process.exit(fail === 0 ? 0 : 1);
