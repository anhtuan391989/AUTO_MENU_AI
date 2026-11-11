"use strict";

// Kiểm tra app/EffectsWindow.js bằng cửa sổ GIẢ (không cần Electron) + kiểm tra nối dây tĩnh
// (preload.js, main.js, renderer.js, effects.html). Chạy: node tests/unit/EffectsWindowManager.verify.js

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const root = path.join(__dirname, "..", "..");
const { createEffectsWindowManager, computeInitialPosition, sanitizeSavedPosition, WIDTH, HEIGHT } = require(path.join(root, "app", "EffectsWindow.js"));

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
    getPosition() { return this.pos || [this.opts.x, this.opts.y]; }
    dragTo(x, y) { this.pos = [x, y]; this.emit("move"); }
    close() { if (this.destroyed) return; this.emit("close"); this.destroyed = true; this.emit("closed"); } // như Electron: "close" (còn sống) rồi mới "closed"
}
FakeWin.instances = [];

const screenFake = { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }], getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) };

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

// ---- EFFECT-AOT-PERSIST: nhớ "Luôn Hiện" qua các lần mở app (lần tích cuối cùng thắng) ----
{
    function setupPersist(initial, opts) {
        FakeWin.instances.length = 0;
        const store = { v: initial, saves: [] };
        const main = new FakeWin({});
        const mgr = createEffectsWindowManager({
            BrowserWindow: FakeWin, screen: screenFake, getMainWin: () => main, preloadPath: "/p/preload.js", htmlPath: "/p/effects.html",
            loadAlwaysOnTop: () => { if (opts && opts.loadThrows) throw new Error("đọc lỗi"); return store.v; },
            saveAlwaysOnTop: (v) => { if (opts && opts.saveThrows) throw new Error("ghi lỗi"); store.saves.push(v); store.v = v; }
        });
        return { main, mgr, store };
    }
    // khởi động app lần đầu (chưa lưu gì) => mặc định TẮT như cũ
    { const { mgr } = setupPersist(undefined); check(mgr.getAlwaysOnTop().value === false, "chưa lưu gì -> mặc định tắt (hành vi cũ)"); }
    // lần trước tích BẬT -> app mở lại: bật sẵn, cửa sổ mở ra là luôn hiện
    { const { main, mgr } = setupPersist(true); check(mgr.getAlwaysOnTop().value === true, "lần cuối tích BẬT -> mở app lại: trạng thái BẬT"); mgr.open(); check(effectsOf(main).aot === true, "lần cuối tích BẬT -> cửa sổ mở ra là luôn hiện"); }
    // lần trước bỏ tích -> app mở lại: tắt
    { const { main, mgr } = setupPersist(false); check(mgr.getAlwaysOnTop().value === false, "lần cuối bỏ tích -> mở app lại: trạng thái TẮT"); mgr.open(); check(effectsOf(main).aot === false, "lần cuối bỏ tích -> cửa sổ mở ra không luôn hiện"); }
    // tích / bỏ tích -> ghi đúng giá trị mới nhất (cả khi cửa sổ đang đóng)
    { const { mgr, store } = setupPersist(false); mgr.setAlwaysOnTop(true); check(store.v === true, "tích BẬT -> đã ghi true"); mgr.setAlwaysOnTop(false); check(store.v === false && store.saves.join() === "true,false", "bỏ tích -> đã ghi false (lần cuối thắng)"); }
    // giá trị rác từ file (không phải đúng true) -> coi là tắt
    { const { mgr } = setupPersist("true"); check(mgr.getAlwaysOnTop().value === false, "giá trị đã lưu không phải boolean true -> tắt"); }
    // giá trị không hợp lệ bị từ chối -> không ghi
    { const { mgr, store } = setupPersist(true); mgr.setAlwaysOnTop("yes"); check(store.saves.length === 0 && mgr.getAlwaysOnTop().value === true, "giá trị không hợp lệ -> không ghi, giữ nguyên"); }
    // lỗi đọc / ghi không làm hỏng cửa sổ
    { const { mgr } = setupPersist(true, { loadThrows: true }); check(mgr.getAlwaysOnTop().value === false, "đọc file lỗi -> mặc định tắt, không throw"); }
    { const { main, mgr } = setupPersist(false, { saveThrows: true }); const r = mgr.setAlwaysOnTop(true); mgr.open(); check(r.ok === true && r.value === true && effectsOf(main).aot === true, "ghi file lỗi -> vẫn áp dụng trong phiên, không throw"); }
    // thiếu hàm tiêm (cách dùng cũ) -> hoạt động như trước
    { const { mgr } = setup(); check(mgr.getAlwaysOnTop().value === false && mgr.setAlwaysOnTop(true).ok === true, "không tiêm load/save -> chạy như bản cũ"); }
    // EFFECT-NO-AUTOOPEN-01: "Luôn Hiện" chỉ là Always on Top — KHÔNG được tự mở Bảng Hiệu Ứng cùng Menu, kể cả khi lần cuối đã tích.
    { const { main, mgr } = setupPersist(true); check(mgr.getAlwaysOnTop().value === true && !mgr.isOpen() && FakeWin.instances.filter((w) => w !== main).length === 0 && typeof mgr.openIfPinned === "undefined", "đã tích Luôn Hiện từ lần trước -> khởi động KHÔNG tự mở Bảng Hiệu Ứng"); mgr.open(); check(effectsOf(main).aot === true, "bấm mở bảng -> mới mở, và lúc đó luôn nổi như đã chọn"); }
    // nối dây main.js
    { const m = fs.readFileSync(path.join(root, "app", "main.js"), "utf8"); check(m.includes("loadAlwaysOnTop") && m.includes("saveAlwaysOnTop") && m.includes("effectsWindow: {"), "main.js nối load/save AOT vào app-settings.json (effectsWindow.alwaysOnTop)"); check(!m.includes("autoOpenEffectsIfPinned") && !m.includes("openIfPinned"), "main.js: KHÔNG còn tự mở Bảng Hiệu Ứng khi Menu khởi động"); }
}


// ---- EFFECT-POS-01: nhớ VỊ TRÍ Bảng Hiệu Ứng (lần kéo cuối cùng thắng) ----
{
    function setupPos(saved, opts) {
        FakeWin.instances.length = 0;
        const store = { pos: saved, saves: [] };
        const main = new FakeWin({});
        const mgr = createEffectsWindowManager({
            BrowserWindow: FakeWin, screen: screenFake, getMainWin: () => main, preloadPath: "/p/preload.js", htmlPath: "/p/effects.html",
            loadPosition: () => { if (opts && opts.loadThrows) throw new Error("đọc lỗi"); return store.pos; },
            savePosition: (p) => { if (opts && opts.saveThrows) throw new Error("ghi lỗi"); store.saves.push(p); store.pos = p; }
        });
        return { main, mgr, store };
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // sanitizeSavedPosition
    const disp = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];
    check(JSON.stringify(sanitizeSavedPosition({ x: 500.4, y: 300.6 }, disp)) === '{"x":500,"y":301}', "vị trí hợp lệ -> làm tròn và nhận");
    check(sanitizeSavedPosition({ x: 5000, y: 300 }, disp) === null, "vị trí nằm ngoài mọi màn hình -> bỏ");
    check(sanitizeSavedPosition({ x: 500, y: 5000 }, disp) === null, "vị trí quá thấp (ngoài màn hình) -> bỏ");
    check(sanitizeSavedPosition({ x: "a", y: 1 }, disp) === null && sanitizeSavedPosition(null, disp) === null && sanitizeSavedPosition(undefined, disp) === null, "giá trị rác/rỗng -> bỏ");
    check(sanitizeSavedPosition({ x: 10, y: 10 }, []) === null, "không có danh sách màn hình -> bỏ");

    // mở lần đầu (chưa lưu) -> vị trí mặc định như cũ
    { const { main, mgr } = setupPos(null); mgr.open(); const fx = effectsOf(main); const def = computeInitialPosition({ x: 100, y: 50, width: 1200, height: 300 }, { x: 0, y: 0, width: 1920, height: 1040 }); check(fx.opts.x === def.x && fx.opts.y === def.y, "chưa lưu vị trí -> mở ở vị trí mặc định (hành vi cũ)"); }
    // đã lưu -> mở đúng chỗ cũ
    { const { main, mgr } = setupPos({ x: 777, y: 222 }); mgr.open(); const fx = effectsOf(main); check(fx.opts.x === 777 && fx.opts.y === 222, "đã lưu vị trí -> mở đúng chỗ cũ"); }
    // đã lưu nhưng nằm ngoài màn hình -> mặc định
    { const { main, mgr } = setupPos({ x: 9000, y: 9000 }); mgr.open(); const fx = effectsOf(main); const def = computeInitialPosition({ x: 100, y: 50, width: 1200, height: 300 }, { x: 0, y: 0, width: 1920, height: 1040 }); check(fx.opts.x === def.x && fx.opts.y === def.y, "vị trí đã lưu ngoài màn hình -> dùng vị trí mặc định"); }
    // lỗi đọc -> mặc định, không throw
    { const { main, mgr } = setupPos({ x: 777, y: 222 }, { loadThrows: true }); mgr.open(); check(!!effectsOf(main) && mgr.isOpen(), "đọc vị trí lỗi -> vẫn mở bình thường"); }
    // thiếu hàm tiêm (cách dùng cũ) -> như trước
    { const { main, mgr } = setup(); mgr.open(); const fx = effectsOf(main); fx.emit("ready-to-show"); fx.dragTo(300, 300); check(mgr.isOpen(), "không tiêm load/savePosition -> chạy như bản cũ"); }
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
    check(/\bscreen\b[^}]*\}\s*=\s*require\("electron"\)/.test(main), "main.js lấy screen từ electron");
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

console.log(`\nEffectsWindowManager (phần đồng bộ): ${pass} đạt, ${fail} lỗi`);

(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    function mk(opts) {
        FakeWin.instances.length = 0;
        const saves = [];
        const main = new FakeWin({});
        const mgr = createEffectsWindowManager({
            BrowserWindow: FakeWin, screen: screenFake, getMainWin: () => main, preloadPath: "/p", htmlPath: "/p",
            loadPosition: () => null, savePosition: (p) => { if (opts && opts.saveThrows) throw new Error("ghi lỗi"); saves.push(p); }
        });
        mgr.open();
        const fx = effectsOf(main);
        fx.emit("ready-to-show");
        return { main, mgr, fx, saves };
    }
    // kéo liên tục -> chỉ ghi 1 lần, đúng toạ độ cuối
    { const { fx, saves } = mk(); fx.dragTo(100, 100); fx.dragTo(200, 150); fx.dragTo(321, 234); check(saves.length === 0, "đang kéo -> chưa ghi (chờ dừng)"); await wait(600); check(saves.length === 1 && saves[0].x === 321 && saves[0].y === 234, "kéo xong -> ghi 1 lần đúng toạ độ cuối"); }
    // đóng cửa sổ -> ghi vị trí lần nữa
    { const { mgr, fx, saves } = mk(); fx.pos = [640, 480]; mgr.close(); check(saves.length === 1 && saves[0].x === 640 && saves[0].y === 480, "đóng cửa sổ -> ghi vị trí hiện tại"); }
    // kéo rồi đóng ngay (chưa hết 400ms) -> vẫn ghi đúng, không ghi lặp sau khi đóng
    { const { mgr, fx, saves } = mk(); fx.dragTo(50, 60); mgr.close(); await wait(600); check(saves.length === 1 && saves[0].x === 50 && saves[0].y === 60, "kéo rồi đóng ngay -> ghi đúng 1 lần, không ghi sau khi đóng"); }
    // cửa sổ đang ẩn (menu thu xuống taskbar, AOT tắt) -> không ghi
    { const { main, mgr, fx, saves } = mk(); main.emit("minimize"); fx.pos = [1, 1]; fx.emit("move"); await wait(600); check(saves.length === 0, "cửa sổ đang ẩn -> không ghi vị trí"); mgr.close(); check(saves.length === 0, "đóng khi đang ẩn -> không ghi vị trí rác"); }
    // lỗi ghi -> không throw, cửa sổ vẫn dùng bình thường
    { const { mgr, fx } = mk({ saveThrows: true }); let threw = false; try { fx.dragTo(10, 10); await wait(600); mgr.close(); } catch { threw = true; } check(!threw, "ghi vị trí lỗi -> không throw"); }
    // nối dây main.js
    { const m = fs.readFileSync(path.join(root, "app", "main.js"), "utf8"); check(m.includes("loadPosition") && m.includes("savePosition") && m.includes("position: { x: pos.x, y: pos.y }"), "main.js nối load/savePosition vào app-settings.json (effectsWindow.position)"); check(/\.\.\.cur, position:/.test(m) && /\.\.\.cur, alwaysOnTop:/.test(m), "main.js: ghi vị trí/AOT đều giữ nguyên key kia (không đè nhau)"); }
    console.log(`EFFECT-POS-01: tổng cộng ${pass} đạt, ${fail} lỗi`);
    process.exit(fail === 0 ? 0 : 1);
})();

