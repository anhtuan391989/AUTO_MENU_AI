/**
 * C65 — Cubase có ĐỦ nút như Studio One (kênh 2, CC 20–63) + Menu/Setup đồng nhất.
 * Mô phỏng phần mềm, KHÔNG phải Cubase thật. Chạy: node tests/unit/CubaseParityC65.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m, x === undefined ? "" : JSON.stringify(x)); } };

function makeAR(daw, saved) {
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === "selectedDAW" ? daw : k === "dawMidiOutMappings" ? (saved || {}) : undefined), saveSetting: () => {},
        sendMidiCC: async () => true };
    vm.createContext(sb);
    vm.runInContext(rd("ui/js/actionRegistry.js"), sb, { filename: "actionRegistry.js" });
    return win.ActionRegistry;
}
const setup = rd("ui/js/setup.js");
const a1 = setup.indexOf("const DAW_QF_S1_LIVE"), a2 = setup.indexOf("// S8 — 3 hàng PLAY/STOP/RECORD");
const ssb = { getSetting: () => undefined };
vm.createContext(ssb);
vm.runInContext(setup.slice(a1, a2) + "\nthis.P = DAW_MIDI_PROFILES; this.v = validateDawProfileBundle; this.all = dawProfileAllInOne;", ssb);
const cub = ssb.all(ssb.P.cubase).bundles.all, s1 = ssb.all(ssb.P.studioone || ssb.P["studio-one"] || Object.values(ssb.P).find((p) => /studio/i.test(JSON.stringify(Object.keys(p)) + (p.label || "")))).bundles.all;

console.log("== Cubase = Studio One về số nút ==");
const cubKeys = Object.keys(cub.mappings), s1Keys = Object.keys(s1.mappings);
ok(cubKeys.length === 59 && s1Keys.length === 59, "cả hai 59 mapping", [cubKeys.length, s1Keys.length]);
ok(s1Keys.every((k) => cub.mappings[k]), "mọi action Studio One đều có ở Cubase", s1Keys.filter((k) => !cub.mappings[k]));
ok(ssb.v(cub).length === 0, "validate bộ Cubase không lỗi", ssb.v(cub));

console.log("== Không trùng CC, không đụng bảng kênh 1 ==");
const seen = {}; let clash = [];
for (const [a, m] of Object.entries(cub.mappings)) {
    const sharedOk = /^(MIC1_(ON|OFF)|KEY_SCALE_(MAJOR|MINOR)(_MIC2|_AT3|_AT4)?)$/.test(a);
    const k = m.channel + "|" + m.number + "|" + (sharedOk ? m.value : a);
    if (seen[k]) clash.push([a, seen[k]]); seen[k] = a;
}
ok(clash.length === 0, "không có 2 action trùng kênh+CC", clash);
const c2 = Object.values(cub.mappings).filter((m) => m.channel === 2).map((m) => m.number);
ok(c2.length === 43 && Math.min(...c2) === 20 && Math.max(...c2) === 61 && !c2.includes(32) && !c2.includes(38), "43 action kênh 2, CC 20–61 bỏ 32/38", [c2.length, Math.min(...c2), Math.max(...c2)]);
ok(Object.values(cub.mappings).filter((m) => m.channel === 1).length === 16, "bảng C63 kênh 1 giữ nguyên 16 mapping");
ok(Object.values(cub.mappings).every((m) => m.channel === 1 || m.channel === 2), "Cubase không dùng kênh 15/16 của Studio One");

console.log("== Menu (actionRegistry) khớp Setup ==");
const AR = makeAR("Cubase 14");
const bad = Object.entries(cub.mappings).filter(([a, m]) => { const r = AR.getMidiOutMapping(a); return !r || r.channel !== m.channel || r.number !== m.number || r.value !== m.value; }).map(([a]) => a);
ok(bad.length === 0, "Menu trả đúng CC như bộ điền nhanh cho cả 59 action", bad);

console.log("== Studio One không đổi; mapping người dùng thắng ==");
const S = makeAR("Studio Pro 8");
const m = S.getMidiOutMapping("BE_STATE_2");
ok(m && (m.channel === 15 || m.channel === 16), "Studio One vẫn kênh 15/16", m);
const U = makeAR("Cubase 14", { "Cubase 14": { MUSIC_ON: { kind: "cc", channel: 3, number: 99, value: 127, source: "USER_DEFINED" } } }).getMidiOutMapping("MUSIC_ON");
ok(U && U.channel === 3 && U.number === 99, "mapping tay lưu sẵn vẫn thắng mặc định", U);
const O = makeAR("Reaper").getMidiOutMapping("MUSIC_ON");
ok(!O || O.channel !== 2 || O.number !== 23, "DAW khác không nhận bảng Cubase", O);

console.log(`KẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
