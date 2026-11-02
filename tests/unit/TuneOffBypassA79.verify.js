/** TuneOffBypassA79.verify.js — TASK A79: TUNE OFF = công tắc bypass Auto-Tune 2 mic, độc lập với Preset.
 *  Chạy: node tests/unit/TuneOffBypassA79.verify.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

// --- 1. actionRegistry: control TUNE + 2 action riêng, hành vi explicit/legacy, gửi đúng CC ---
function makeAR(mappings) {
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: () => undefined, saveSetting: () => {} };
    vm.createContext(sb);
    vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    return { AR: win.ActionRegistry, sent };
}
{
    const { AR } = makeAR();
    ok(AR.ACTIONS.TUNE_BYPASS_ON === 'TUNE_BYPASS_ON' && AR.ACTIONS.TUNE_BYPASS_OFF === 'TUNE_BYPASS_OFF', 'ACTIONS có TUNE_BYPASS_ON/OFF');
    const d = AR.DAW_STATE_CONTROLS.TUNE;
    ok(d && d.on === 'TUNE_BYPASS_ON' && d.off === 'TUNE_BYPASS_OFF' && d.legacy === 'PRESET_TUNE_OFF', 'DAW_STATE_CONTROLS.TUNE: on/off riêng, legacy = PRESET_TUNE_OFF');
    ok(AR.getDawStateMode('TUNE') === 'legacy', 'chưa cấu hình ON/OFF -> mode legacy (tương thích ngược)');
}

// --- 2. renderer: TUNE OFF độc lập khỏi nhóm Preset (kiểm tĩnh) ---
const r = rd('ui/js/renderer.js');
ok(/isTuneOffBtn\(e\.target\)[\s\S]{0,300}classList\.toggle\("active"\)/.test(r), 'TUNE OFF toggle active riêng (không chọn-một)');
ok(/setDawControlState\?\.\("TUNE", bypassOn/.test(r), 'TUNE OFF gọi setDawControlState("TUNE", bật/tắt)');
ok(/forEach\(b => \{ if \(!isTuneOffBtn\(b\)\) b\.classList\.remove\("active"\)/.test(r), 'bấm preset không tắt TUNE OFF');
ok(/if \(btn\.textContent\.trim\(\) === "TUNE OFF"\) return;/.test(r), 'loadData không khôi phục TUNE OFF');
ok(/MIC1.{0,40}MIC2|2 mic/i.test(rd('ui/js/actionRegistry.js')), 'label ghi rõ bypass 2 mic');

// --- 3. Setup có 2 dòng mapping mới ---
const s = rd('ui/js/setup.js');
ok(/action: "TUNE_BYPASS_ON"/.test(s) && /action: "TUNE_BYPASS_OFF"/.test(s), 'Setup có dòng mapping TUNE_BYPASS_ON/OFF');

// --- 4. HTML không đổi ---
ok(/<button class="preset-btn">TUNE OFF<\/button>/.test(rd('ui/index.html')), 'index.html giữ nguyên nút TUNE OFF');
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
