/** BeBtn01.verify.js — BE-BTN-01: nút BÈ = Harmony Player Auto-Tune, công tắc ON/OFF độc lập (như LOFI), thứ tự nút mới, CC mặc định tự nối.
 *  Chạy: node tests/unit/BeBtn01.verify.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
function makeAR(daw, saved) {
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? (saved || {}) : undefined), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { sent.push([n, v, ch]); return true; } };
    vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    return Object.assign({}, win.ActionRegistry, { __sent: sent });
}
(async () => {
    console.log('== 1. HTML: thứ tự nút + nút BÈ ==');
    const html = rd('ui/index.html');
    const grid = html.slice(html.indexOf('<section class="preset-grid">'), html.indexOf('</section>', html.indexOf('<section class="preset-grid">')));
    const order = [...grid.matchAll(/<button[^>]*>\s*(?:<span class="icon"[^>]*><\/span><span class="text">)?([^<]+)/g)].map((m) => m[1].trim());
    ok(JSON.stringify(order.slice(0, 7)) === JSON.stringify(['NORM', 'RAP', 'REMIX', 'LOFI', 'TUNE OFF', 'BÈ', 'EFFECT']) && grid.lastIndexOf('EXPAND') > grid.indexOf('EFFECT'), 'thứ tự: NORM RAP REMIX LOFI TUNE BÈ EFFECT EXPAND — ' + order.slice(0, 7).join(' '));
    ok(/id="harmonyBtn" class="preset-btn"/.test(grid), 'nút BÈ có id harmonyBtn, class preset-btn');
    const css = rd('ui/css/style.css');
    ok(/\.preset-grid \{[^}]*grid-template-columns: repeat\(3,1fr\) repeat\(4,\.74fr\) 1fr/.test(css), 'lưới 8 cột: 3 nút đầu 1fr, 4 nút nhỏ .74fr, MỞ RỘNG 1fr');

    console.log('== 2. actionRegistry: BÈ = Harmony Player, 1 CC, bật=127 / tắt=0, mặc định kênh 15 CC104 ==');
    let AR = makeAR('Studio Pro 8');
    const d = AR.DAW_STATE_CONTROLS.BE;
    ok(AR.ACTIONS.BE_STATE === 'BE_STATE' && d && d.on === 'BE_STATE' && d.off === 'BE_STATE' && d.values.on === 127 && d.values.off === 0, 'control BE: 1 action, bật gửi 127, tắt gửi 0');
    let r = await AR.setDawControlState('BE', true, {});
    ok(r.ok && JSON.stringify(AR.__sent[0]) === JSON.stringify([104, 127, 14]), 'BÈ BẬT -> CC104 = 127, kênh 15 (index 14), không cần Setup');
    r = await AR.setDawControlState('BE', false, {});
    ok(r.ok && JSON.stringify(AR.__sent[1]) === JSON.stringify([104, 0, 14]), 'BÈ TẮT -> CC104 = 0');
    AR = makeAR('Cubase 14'); await AR.setDawControlState('BE', true, {});
    ok(JSON.stringify(AR.__sent[0]) === JSON.stringify([104, 127, 14]), 'Cubase: cũng kênh 15 CC104');
    AR = makeAR('Studio Pro 8', { 'Studio Pro 8': { BE_STATE: { kind: 'cc', channel: 15, number: 77, value: 127 } } }); await AR.setDawControlState('BE', true, {});
    ok(JSON.stringify(AR.__sent[0]) === JSON.stringify([77, 127, 14]), 'mapping người dùng đã lưu luôn thắng mặc định');

    console.log('== 3. renderer: BÈ độc lập (mã thật, DOM giả) ==');
    const src = rd('ui/js/renderer.js');
    const i0 = src.indexOf('const PRESET_NAME_TO_ACTION'); const i1 = src.indexOf('ensurePresetLit();\n\n// MIDI-DAW-CONTROL-01');
    ok(i0 > 0 && i1 > i0, 'tìm thấy khối xử lý nút Preset');
    class Btn { constructor(t, id) { this.textContent = t; this.id = id || ''; this.dataset = {}; this.cls = new Set(); this.h = [];
        this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c), toggle: (c, f) => { if (f === undefined ? !this.cls.has(c) : f) this.cls.add(c); else this.cls.delete(c); } }; }
        closest() { return null; } addEventListener(e, f) { this.h.push(f); } click() { this.h.forEach((f) => f({ target: this })); } }
    const btns = [new Btn('NORM'), new Btn('RAP'), new Btn('REMIX'), new Btn('LOFI'), new Btn('TUNE OFF'), new Btn('BÈ', 'harmonyBtn')];
    const B = Object.fromEntries(btns.map((b) => [b.textContent, b])); B.NORM.cls.add('active');
    const calls = [];
    const sb = { console, Promise, window: { ActionRegistry: { setDawControlState: async (c, on) => { calls.push([c, on]); return { ok: true }; }, executeAction: async (a) => { calls.push(['exec', a]); return { ok: true }; }, ACTIONS: {} } },
        document: { querySelectorAll: (q) => (q === '.preset-btn' ? btns : []), getElementById: () => null }, saveData() {}, reportDawStateResult() {} };
    sb.window.document = sb.document; vm.createContext(sb);
    vm.runInContext(src.slice(i0, i1) + '\nthis.__lit = ensurePresetLit;', sb);
    ok(B['BÈ'].dataset.harmonyBtn === '1' && B.LOFI.dataset.lofiBtn === '1', 'BÈ được nhận diện theo id, không theo chữ');
    B['BÈ'].click();
    ok(B['BÈ'].cls.has('active') && B.NORM.cls.has('active') && JSON.stringify(calls[calls.length - 1]) === JSON.stringify(['BE', true]), 'bấm BÈ: BÈ sáng + NORM VẪN sáng, gửi BE BẬT');
    B.RAP.click();
    ok(B.RAP.cls.has('active') && !B.NORM.cls.has('active') && B['BÈ'].cls.has('active'), 'chọn RAP: NORM tắt, RAP sáng, BÈ VẪN sáng (kết hợp)');
    B['BÈ'].click();
    ok(!B['BÈ'].cls.has('active') && B.RAP.cls.has('active') && JSON.stringify(calls[calls.length - 1]) === JSON.stringify(['BE', false]), 'bấm BÈ lần 2: BÈ tắt (gửi OFF), RAP vẫn sáng');
    B.LOFI.click(); B['BÈ'].click();
    ok(B.LOFI.cls.has('active') && B['BÈ'].cls.has('active'), 'BÈ và LOFI bật cùng lúc, độc lập nhau');
    B.NORM.cls.delete('active'); B.RAP.cls.delete('active'); B.REMIX.cls.delete('active'); sb.__lit();
    ok(B.NORM.cls.has('active'), 'ensurePresetLit: nhóm NORM/RAP/REMIX luôn có 1 nút sáng, không kéo BÈ vào');
    ok(/b\.dataset\.harmonyBtn === "1"\)\)\.*|harmonyBtn === "1"/.test(src) && (src.match(/harmonyBtn === "1"/g) || []).length >= 3, 'BÈ không bị lưu/khôi phục làm preset (saveData/loadData)');

    console.log('== 3b. Studio One surface ==');
    const surf = rd('studio_one/AutoMenuAI.surface.xml');
    ok(/<Control name="harmonyOnOff"[^>]*>\s*<MidiMessage status="#BE" address="104"\/>/.test(surf) && /<Control name="mic1On"[^>]*>\s*<MidiMessage status="#BF" address="104"\/>/.test(surf), 'surface Studio One: harmonyOnOff = kênh 15 (#BE) CC104, không đè Mic1 ON (kênh 16 CC104)');
    console.log('== 4. Setup: dòng BE_STATE, nhóm bảo vệ trùng CC, bộ gợi ý CC104 ==');
    const setup = rd('ui/js/setup.js');
    ok(/action: "BE_STATE"/.test(setup) && /MIDI_CONFLICT_GUARD_SET\.add\("BE_STATE"\)/.test(setup) && (setup.match(/BE_STATE: 104/g) || []).length === 2 && /if \(action === "BE_STATE"\)/.test(setup), 'Setup: có dòng BE_STATE, nhóm bảo vệ, 2 bộ gợi ý (Studio One / Cubase) CC104');
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
