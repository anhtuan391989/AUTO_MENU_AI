/** LofiToggleA94.verify.js — TASK A94: nút LOFI = công tắc ON/OFF độc lập (1 CC, 127/0, preset mặc định), kết hợp được với NORM/RAP/REMIX.
 *  Chạy: node tests/unit/LofiToggleA94.verify.js */
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
    console.log('== 1. actionRegistry: LOFI 1 CC, 127/0, preset mặc định ==');
    let AR = makeAR('Studio Pro 8');
    const d = AR.DAW_STATE_CONTROLS.LOFI;
    ok(AR.ACTIONS.LOFI_STATE === 'LOFI_STATE' && d && d.on === 'LOFI_STATE' && d.off === 'LOFI_STATE' && d.values.on === 127 && d.values.off === 0 && d.legacy === 'PRESET_LOFI', 'control LOFI: 1 action, giá trị 127/0, legacy PRESET_LOFI');
    let r = await AR.setDawControlState('LOFI', true, {});
    ok(r.ok && JSON.stringify(AR.__sent[0]) === JSON.stringify([118, 127, 15]), 'LOFI BẬT -> CC118 (không trùng PRESET NORM CC114) = 127 kênh 16 (index 15), không cần Setup');
    r = await AR.setDawControlState('LOFI', false, {});
    ok(r.ok && JSON.stringify(AR.__sent[1]) === JSON.stringify([118, 0, 15]), 'LOFI TẮT -> CC118 = 0');
    AR = makeAR('Cubase 14'); await AR.setDawControlState('LOFI', true, {});
    ok(JSON.stringify(AR.__sent[0]) === JSON.stringify([119, 127, 15]), 'Cubase: CC119');
    AR = makeAR('Studio Pro 8', { 'Studio Pro 8': { LOFI_STATE: { kind: 'cc', channel: 16, number: 90, value: 127 } } }); await AR.setDawControlState('LOFI', true, {});
    ok(JSON.stringify(AR.__sent[0]) === JSON.stringify([90, 127, 15]), 'mapping người dùng đã lưu luôn thắng mặc định');

    console.log('== 2. renderer: LOFI độc lập với NORM/RAP/REMIX (mã thật, DOM giả) ==');
    const src = rd('ui/js/renderer.js');
    const i0 = src.indexOf('const PRESET_NAME_TO_ACTION'); const i1 = src.indexOf('ensurePresetLit();\n\n// MIDI-DAW-CONTROL-01');
    ok(i0 > 0 && i1 > i0, 'tìm thấy khối xử lý nút Preset trong renderer.js');
    class Btn { constructor(t) { this.textContent = t; this.dataset = {}; this.cls = new Set(); this.h = []; this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c), toggle: (c, f) => { if (f === undefined) f = !this.cls.has(c); f ? this.cls.add(c) : this.cls.delete(c); } }; }
        closest() { return null; } addEventListener(e, f) { this.h.push(f); } click() { this.h.forEach((f) => f({ target: this })); } }
    const btns = ['NORM', 'LOFI', 'RAP', 'REMIX', 'TUNE OFF'].map((t) => new Btn(t)); const B = Object.fromEntries(btns.map((b) => [b.textContent, b]));
    B.NORM.cls.add('active');
    const calls = [];
    const sb = { console, Promise, window: { ActionRegistry: { setDawControlState: async (c, on) => { calls.push([c, on]); return { ok: true }; }, executeAction: async (a) => { calls.push(['exec', a]); return { ok: true }; }, ACTIONS: { PRESET_NORM: 'PRESET_NORM', PRESET_RAP: 'PRESET_RAP', PRESET_REMIX: 'PRESET_REMIX', PRESET_LOFI: 'PRESET_LOFI' } } },
        document: { querySelectorAll: (q) => (q === '.preset-btn' ? btns : []), getElementById: () => null }, saveData() {}, reportDawStateResult() {} };
    sb.window.document = sb.document; vm.createContext(sb);
    vm.runInContext(src.slice(i0, i1) + '\nthis.__lit = ensurePresetLit;', sb);
    ok(B.LOFI.dataset.lofiBtn === '1' && B['TUNE OFF'].dataset.tuneBtn === '1', 'nút LOFI và TUNE được nhận diện là công tắc độc lập');
    B.LOFI.click();
    ok(B.LOFI.cls.has('active') && B.NORM.cls.has('active') && JSON.stringify(calls[calls.length - 1]) === JSON.stringify(['LOFI', true]), 'bấm LOFI: LOFI sáng + NORM VẪN sáng, gửi LOFI BẬT');
    B.RAP.click();
    ok(B.RAP.cls.has('active') && !B.NORM.cls.has('active') && B.LOFI.cls.has('active'), 'chọn RAP: NORM tắt, RAP sáng, LOFI VẪN sáng (kết hợp)');
    B.LOFI.click();
    ok(!B.LOFI.cls.has('active') && B.RAP.cls.has('active') && JSON.stringify(calls[calls.length - 1]) === JSON.stringify(['LOFI', false]), 'bấm LOFI lần 2: LOFI tắt (gửi OFF), RAP vẫn sáng');
    const n = calls.length; B.LOFI.click(); B.REMIX.click();
    ok(B.LOFI.cls.has('active') && B.REMIX.cls.has('active') && !B.RAP.cls.has('active'), 'LOFI bật + đổi REMIX: LOFI giữ nguyên');
    B.LOFI.cls.delete('active'); B.NORM.cls.delete('active'); B.RAP.cls.delete('active'); B.REMIX.cls.delete('active'); sb.__lit();
    ok(B.NORM.cls.has('active') && !B.LOFI.cls.has('active'), 'ensurePresetLit: nhóm luôn có 1 nút sáng (NORM), không kéo LOFI vào');
    ok(calls.filter((c) => c[0] === 'exec' && c[1] === 'PRESET_LOFI').length === 0, 'LOFI KHÔNG còn gửi PRESET_LOFI (macro chọn-một) khi bấm');

    console.log('== 3. Setup/Surface ==');
    const setup = rd('ui/js/setup.js');
    ok(/action: "LOFI_STATE"/.test(setup) && /"TUNE_BYPASS_4", "LOFI_STATE"\]/.test(setup) && /LOFI_STATE: 118/.test(setup) && /LOFI_STATE: 119/.test(setup), 'Setup: có dòng LOFI_STATE, nhóm bảo vệ trùng CC, bộ gợi ý Studio One 118 / Cubase 119');
    ok(/name="lofiOnOff"[\s\S]{0,160}address="118"/.test(rd('studio_one/AutoMenuAI.surface.xml')), 'surface AutoMenuAI có control LOFI CC118');
    console.log('== 4. A94: Auto-Tune 3 / 4 có CC riêng mặc định (kênh 16, CC34-37) ==');
    { const A = makeAR('Studio Pro 8'); const g = (n) => A.getMidiOutMapping(n);
      const want = { KEY_SCALE_MAJOR_AT3: [34, 0], KEY_SCALE_MINOR_AT3: [34, 5], KEY_ROOT_AT3: [35, 0], KEY_SCALE_MAJOR_AT4: [36, 0], KEY_SCALE_MINOR_AT4: [36, 5], KEY_ROOT_AT4: [37, 0] };
      for (const k of Object.keys(want)) { const m = g(k); ok(m && m.kind === 'cc' && m.channel === 15 && m.number === want[k][0] && m.value === want[k][1], k + ' -> CC' + want[k][0] + ' giá trị ' + want[k][1]); }
      const C = makeAR('Cubase 14'); ok(!C.getMidiOutMapping('KEY_ROOT_AT3'), 'Cubase: không tự gán (giống MIC 2)'); }
    console.log('== 5. A94: nút TUNE gửi bypass cho CẢ 4 Auto-Tune (CC113 kênh 16 + CC89/90/91 kênh 15) ==');
    { let A = makeAR('Studio Pro 8'); let r = await A.setDawControlState('TUNE', true, {});
      ok(r.ok && JSON.stringify(A.__sent) === JSON.stringify([[113, 127, 15], [89, 127, 14], [90, 127, 14], [91, 127, 14]]), 'TUNE bật -> CC113=127 rồi CC89/90/91=127', A.__sent);
      A = makeAR('Studio Pro 8'); await A.setDawControlState('TUNE', false, {});
      ok(JSON.stringify(A.__sent) === JSON.stringify([[113, 0, 15], [89, 0, 14], [90, 0, 14], [91, 0, 14]]), 'TUNE tắt -> cả 4 CC = 0', A.__sent);
      A = makeAR('Studio Pro 8', { 'Studio Pro 8': { TUNE_BYPASS_3: { kind: 'cc', channel: 15, number: 70, value: 127 } } }); await A.setDawControlState('TUNE', true, {});
      ok(A.__sent.some((x) => x[0] === 70 && x[1] === 127) && !A.__sent.some((x) => x[0] === 90), 'mapping đã lưu của Auto-Tune 3 thắng mặc định');
      A = makeAR('Studio Pro 8'); await A.setDawControlState('LOFI', true, {}); ok(A.__sent.length === 1, 'LOFI không kéo theo bypass'); }
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
