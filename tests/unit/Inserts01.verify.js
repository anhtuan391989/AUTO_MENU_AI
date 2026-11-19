/** Inserts01.verify.js — INSERTS-01: nút INSERTS trong thẻ chuột phải MIC 1/MIC 2 + ô tích Inserts (thẻ FX) + 3 CC MIDI (kênh 15, CC 46/47/48).
 *  MÔ PHỎNG (hàm gửi MIDI giả) — KHÔNG phải Studio One thật. Chạy: node tests/unit/Inserts01.verify.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8').replace(/\r\n/g, '\n');
function makeAR(daw, settings, failCc) {
    const sent = [], tele = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null, electronAPI: { sendTelemetry: (r) => tele.push(r) } };
    const sb = { window: win, console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Promise,
        getSetting: (k, fb = '') => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? {} : ((settings || {})[k] !== undefined ? (settings || {})[k] : fb)),
        sendMidiCC: async (n, v, ch) => { if (failCc === n) return false; sent.push([n, v, ch]); return true; } };
    vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    return Object.assign({}, win.ActionRegistry, { __sent: sent, __tele: tele });
}
(async () => {
    console.log('== ActionRegistry: 3 CC mặc định (kênh 15 = index 14) ==');
    let AR = makeAR('Studio Pro 8');
    ok(['INSERTS_MIC1', 'INSERTS_MIC2', 'INSERTS_ALL'].every((a) => AR.ACTIONS[a] === a), '3 action tồn tại');
    let r = await AR.sendInsertsState('MIC1', true, { reason: 't' });
    ok(r.ok && JSON.stringify(AR.__sent) === JSON.stringify([[46, 127, 14]]), 'Mic 1 BẬT: CC46 = 127 kênh 15');
    AR.__sent.length = 0; await AR.sendInsertsState('MIC1', false); ok(JSON.stringify(AR.__sent) === JSON.stringify([[46, 0, 14]]), 'Mic 1 TẮT: CC46 = 0');
    AR.__sent.length = 0; await AR.sendInsertsState('MIC2', true); await AR.sendInsertsState('MIC2', false);
    ok(JSON.stringify(AR.__sent) === JSON.stringify([[47, 127, 14], [47, 0, 14]]), 'Mic 2: CC47 = 127 rồi 0');
    AR.__sent.length = 0; await AR.sendInsertsState('ALL', true); await AR.sendInsertsState('ALL', false);
    ok(JSON.stringify(AR.__sent) === JSON.stringify([[48, 127, 14], [48, 0, 14]]), 'Inserts chung: CC48 = 127 rồi 0');
    ok(AR.__tele.length === 6 && AR.__tele[0].event === 'INSERTS' && AR.__tele[0].which === 'MIC1' && AR.__tele[0].result === 'OK', 'ghi telemetry INSERTS (để đọc log)');
    r = await AR.sendInsertsState('XYZ', true); ok(!r.ok, 'tên lạ: không ném lỗi, không gửi');
    AR = makeAR('Studio Pro 8', { insertsInvert: true }); await AR.sendInsertsState('ALL', true); ok(AR.__sent[0][1] === 0, 'insertsInvert=true: BẬT gửi 0 (đảo)');
    AR = makeAR('Studio Pro 8', {}, 46); r = await AR.sendInsertsState('MIC1', true); ok(!r.ok && r.result === 'FAIL', 'CC lỗi: báo FAIL, không ném lỗi');
    AR = makeAR('Cubase 13'); AR.__sent.length = 0; await AR.sendInsertsState('MIC1', true); ok(AR.__sent.length === 1, 'DAW khác (Cubase) cũng có mặc định');
    console.log('== Setup / surface / điền nhanh ==');
    const su = rd('ui/js/setup.js'), xml = rd('studio_one/AutoMenuAI.surface.xml');
    ok(['INSERTS_MIC1', 'INSERTS_MIC2', 'INSERTS_ALL'].every((a) => new RegExp('action: "' + a + '"').test(su)), 'Setup có 3 dòng INSERTS');
    ok(/inserts: Object\.freeze\(\{[^\n]*INSERTS_MIC1: 46, INSERTS_MIC2: 47, INSERTS_ALL: 48/.test(su), 'bộ điền nhanh Studio One có INSERTS 46/47/48');
    ok(/name="insertsMic1"[\s\S]*?address="46"/.test(xml) && /name="insertsMic2"[\s\S]*?address="47"/.test(xml) && /name="insertsAll"[\s\S]*?address="48"/.test(xml), 'surface.xml có 3 điều khiển (kênh 15)');
    console.log('== Giao diện (renderer.js) ==');
    const rend = rd('ui/js/renderer.js');
    ok(/id="\$\{cfg\.insertsBtnId\}" class="preset-btn active"/.test(rend) && /insertsWhich: "MIC1"/.test(rend) && /insertsWhich: "MIC2"/.test(rend), 'thẻ MIC 1/MIC 2: nút INSERTS luôn mở app ở trạng thái SÁNG');
    ok(/id="fxAutoEnabledBtn" class="preset-btn active"[^\n]*>AUTO MUSIC ON</.test(rend), 'thẻ FX: ô tích cũ -> nút AUTO MUSIC ON');
    ok(/id="insertsAllBtn" class="preset-btn active"/.test(rend) && /sendInsertsState\?\.\("ALL"/.test(rend), 'thẻ FX: nút INSERTS luôn SÁNG khi mở app, gửi MIDI');
    ok(rend.indexOf('id="fxAutoEnabledBtn"') > 0 && rend.indexOf('id="fxAutoEnabledBtn"') < rend.indexOf('id="insertsAllBtn"'), 'thẻ FX: INSERTS nằm DƯỚI AUTO MUSIC ON');
    ok(/window\.__insertsAllSet\?\.\(!!target, "fx-auto-music"\)/.test(rend) && !/if \(target\) \{ try \{ window\.__insertsAllSet/.test(rend), 'Auto FX: có nhạc => Inserts tự BẬT, không nhạc => tự TẮT (INSERTS-03)');
    ok(rend.indexOf('id="${cfg.insertsBtnId}"') > 0 && rend.indexOf('id="${cfg.insertsBtnId}"') < rend.indexOf('id="${cfg.knobId}"'), 'thẻ MIC: nút INSERTS nằm TRÊN núm');
    console.log('KẾT QUẢ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
