// MENU-WIDTH-FIT-01 — chế độ dọc: cửa sổ thu hẹp đúng bề ngang Menu (380px), về ngang trả 1200; không thừa 2 bên.
const fs = require("fs"), path = require("path"), vm = require("vm");
const rd = (p) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf-8");
const main = rd("app/main.js"), js = rd("ui/js/renderer.js"), pre = rd("app/preload.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
ok(/resizeWindow:\s*\(height, width\)\s*=>\s*ipcRenderer\.send\("resize-window",\s*\{\s*height,\s*width\s*\}\)/.test(pre), "preload: resizeWindow(height, width)");
ok(/resizeWindow\(height, width\)/.test(js) && /sizedForVertical/.test(js) && /width = 1200/.test(js), "renderer: dọc gửi maxWidth, về ngang gửi 1200");
// Trích handler resize-window và chạy với mock Electron.
const i = main.indexOf('ipcMain.on("resize-window"');
let d = 0, k = main.indexOf("{", main.indexOf("=>", i)), end = -1;
for (let n = k; n < main.length; n++) { if (main[n] === "{") d++; else if (main[n] === "}" && --d === 0) { end = n; break; } }
const body = main.slice(main.indexOf("=>", i) + 2, end + 1);
function run(payload, win, wa) {
    const calls = { size: null, pos: null };
    const w = Object.assign({ isDestroyed: () => false, _c: { w: 1200, h: 800 }, _b: { x: 100, y: 0 } }, win || {});
    w.getContentSize = () => [w._c.w, w._c.h];
    w.getBounds = () => ({ x: w._b.x, y: w._b.y, width: w._c.w + 16, height: w._c.h + 60 });
    w.getContentBounds = () => ({ width: w._c.w, height: w._c.h });
    w.setContentSize = (a, b) => { w._c = { w: a, h: b }; calls.size = [a, b]; };
    w.setPosition = (x, y) => { w._b = { x, y }; calls.pos = [x, y]; };
    const ctx = { console, Math, Number, Date, menuPosSuspendUntil: 0, mainWin: w,
        screen: { getDisplayMatching: () => ({ workArea: wa || { x: 0, y: 0, width: 1920, height: 1040 } }) } };
    vm.createContext(ctx);
    vm.runInContext("(function(" + "{ height, width } = {}" + ")" + body + ")", ctx)(payload);
    return calls;
}
let c = run({ height: 811, width: 380 });
ok(c.size && c.size[0] === 380 && c.size[1] === 811, "dọc: width 380, height 811");
c = run({ height: 811 });
ok(c.size && c.size[0] === 1200, "không gửi width => giữ nguyên 1200 (như cũ)");
c = run({ height: 800, width: 1200 }, { _c: { w: 380, h: 811 } });
ok(c.size && c.size[0] === 1200, "về ngang: trả 1200");
c = run({ height: 800, width: 1200 }, { _c: { w: 380, h: 811 }, _b: { x: 1500, y: 0 } });
ok(c.pos && c.pos[0] + 1216 <= 1920, "về ngang ở sát mép phải => cửa sổ được đẩy sang trái cho vừa màn hình");
c = run({ height: 811, width: "x" });
ok(c.size && c.size[0] === 1200, "width rác => bỏ qua");
console.log(`MenuWidthFit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
