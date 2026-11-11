// MENU-POS-MEMORY-01 — kiểm tra logic lưu/đọc vị trí cửa sổ Menu (trích source từ app/main.js, chạy trong vm).
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "app", "main.js"), "utf-8");
function extract(name) {
    const i = src.indexOf("function " + name + "(");
    if (i < 0) throw new Error("không thấy " + name);
    let d = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); }
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
function run(settings, displays, win) {
    const writes = [];
    const ctx = { console, Number, Math,
        readSettingsFile: () => settings, writeSettingsFile: (d) => { writes.push(d); return true; },
        screen: { getAllDisplays: () => displays }, mainWin: win, menuPosSuspendUntil: 0 };
    vm.createContext(ctx);
    vm.runInContext(extract("loadSavedMenuPosition") + extract("saveMenuPositionNow") + ";this.load=loadSavedMenuPosition;this.save=saveMenuPositionNow;", ctx);
    return { ctx, writes };
}
const D1 = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];
ok(run(null, D1).ctx.load(1200, 800) === null, "chưa lưu => null");
ok(run({ menuWindowPosition: { x: 300, y: 200 } }, D1).ctx.load() .x === 300, "vị trí hợp lệ được dùng");
ok(run({ menuWindowPosition: { x: 5000, y: 200 } }, D1).ctx.load() === null, "ngoài màn hình => bỏ qua");
ok(run({ menuWindowPosition: { x: "a", y: 1 } }, D1).ctx.load() === null, "dữ liệu rác => null");
ok(run({ menuWindowPosition: { x: -1500, y: 100 } }, [{ workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }]).ctx.load().x === -1500, "màn hình phụ bên trái (x âm) hợp lệ");
const mk = (o) => Object.assign({ isDestroyed: () => false, isMinimized: () => false, isMaximized: () => false, isFullScreen: () => false, getPosition: () => [10, 20] }, o);
let r = run({ other: 1 }, D1, mk({})); r.ctx.save();
ok(r.writes.length === 1 && r.writes[0].menuWindowPosition.x === 10 && r.writes[0].other === 1, "ghi đúng x,y và giữ key khác");
r = run({ menuWindowPosition: { x: 10, y: 20 } }, D1, mk({})); r.ctx.save();
ok(r.writes.length === 0, "không đổi => không ghi");
r = run({}, D1, mk({ isMinimized: () => true })); r.ctx.save();
ok(r.writes.length === 0, "đang minimize => không ghi");
console.log(`MenuPositionMemory: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
