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
    ok(AR.ACTIONS.TUNE_BYPASS === 'TUNE_BYPASS', 'ACTIONS có TUNE_BYPASS (1 CC duy nhất)');
    const d = AR.DAW_STATE_CONTROLS.TUNE;
    ok(d && d.on === 'TUNE_BYPASS' && d.off === 'TUNE_BYPASS' && d.values.on === 127 && d.values.off === 0 && d.legacy === 'PRESET_TUNE_OFF', 'DAW_STATE_CONTROLS.TUNE: cùng 1 action, giá trị 127/0, legacy = PRESET_TUNE_OFF');
    ok(AR.getDawStateMode('TUNE') === 'legacy', 'chưa cấu hình ON/OFF -> mode legacy (tương thích ngược)');
}

// --- 1b. Preset MIDI mặc định + 1 CC duy nhất (A82): không cần Setup, mapping đã lưu thắng ---
function makeAR2(daw, saved) {
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? (saved || {}) : undefined), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; } };
    vm.createContext(sb);
    vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    win.__sent = sent;
    return win.ActionRegistry;
}
(async () => {
    const a = makeAR2('Studio One 7', {});
    const m = a.getMidiOutMapping('TUNE_BYPASS');
    ok(m && m.kind === 'cc' && m.channel === 16 && m.number === 113 && m.value === 127, 'Studio One: TUNE_BYPASS mặc định = CC113 kênh16 (không cần Setup)');
    ok(a.getDawStateMode('TUNE') === 'explicit', 'mode = explicit ngay khi chưa lưu gì (đã có preset)');
    ok(makeAR2('Cubase 13', {}).getMidiOutMapping('TUNE_BYPASS').number === 118, 'Cubase: CC118');
    const own = { 'Studio One 7': { TUNE_BYPASS: { kind: 'cc', channel: 1, number: 7, value: 100 } } };
    ok(makeAR2('Studio One 7', own).getMidiOutMapping('TUNE_BYPASS').number === 7, 'mapping người dùng đã lưu thắng preset mặc định');
    ok(makeAR2('Studio One 7', {}).getMidiOutMapping('DAW_PLAY') === null, 'action khác không bị gán mặc định');
    // gửi thật: bypass BẬT -> CC113 giá trị 127 ; bypass TẮT -> cùng CC113 giá trị 0 (1 CC duy nhất)
    const win = {}; const b = (() => { const sent = []; const w = { appSettings: {}, getLastMidiSendResult: () => null };
        const sb = { window: w, console, setTimeout, clearTimeout, Promise, getSetting: (k) => (k === 'selectedDAW' ? 'Studio One 7' : k === 'dawMidiOutMappings' ? {} : undefined), saveSetting: () => {},
            sendMidiCC: async (n, v, ch) => { sent.push([n, v, ch]); return true; } };
        vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb); return { AR: w.ActionRegistry, sent }; })();
    await b.AR.setDawControlState('TUNE', true, { reason: 't' });
    await b.AR.setDawControlState('TUNE', false, { reason: 't' });
    ok(JSON.stringify(b.sent.filter((x) => x[2] === 15)) === JSON.stringify([[113, 127, 15], [113, 0, 15]]), 'bypass BẬT gửi CC113=127, bypass TẮT gửi CC113=0 (Auto-Tune 1, kênh 16; A94: thêm CC89/90/91 kênh 15 cho Auto-Tune 2-4) — thực tế: ' + JSON.stringify(b.sent));
    finish();
})();

// --- 2. renderer: TUNE OFF độc lập khỏi nhóm Preset (kiểm tĩnh) ---
const r = rd('ui/js/renderer.js');
ok(/isTuneOffBtn\(e\.target\)[\s\S]{0,400}renderTuneBtn\(e\.target, tuneOnNow\)/.test(r), 'nút TUNE bật/tắt riêng (không chọn-một)');
ok(/renderTuneBtn\(b, true\)/.test(r), 'mặc định TUNE ON (sáng, bypass tắt)');
ok(/btn\.textContent = tuneOn \? "TUNE ON" : "TUNE OFF"/.test(r) && /classList\.toggle\("active", tuneOn\)/.test(r), 'TUNE ON = sáng + chữ TUNE ON; TUNE OFF = tắt sáng + chữ TUNE OFF');
ok(/const bypassOn = !tuneOnNow/.test(r) && /setDawControlState\?\.\("TUNE", bypassOn/.test(r), 'TUNE OFF => bypass BẬT; TUNE ON => bypass TẮT');
ok(/forEach\(b => \{ if \(!isIndependentPresetBtn\(b\)\) b\.classList\.remove\("active"\)/.test(r), 'bấm preset không tắt TUNE OFF');
ok(/btn\.dataset\.tuneBtn === "1"[^\n]*\) return;/.test(r), 'loadData không khôi phục nút TUNE (luôn mở ở TUNE ON)');
ok(/MIC1.{0,40}MIC2|2 mic/i.test(rd('ui/js/actionRegistry.js')), 'label ghi rõ bypass 2 mic');

// --- 3. Setup có 2 dòng mapping mới ---
const s = rd('ui/js/setup.js');
ok(/action: "TUNE_BYPASS"/.test(s), 'Setup có 1 dòng mapping TUNE_BYPASS');

ok(/tune: Object\.freeze\(\{ title: "TUNE BYPASS", count: 4, mappings: Object\.freeze\(\{ \.\.\.dawQfMake\(16, 127, \{ TUNE_BYPASS: 113 \}\)/.test(s), 'bộ CC gợi ý Studio One: TUNE_BYPASS=113 (kênh 16)');
ok(/TUNE_BYPASS: 118/.test(s) && /btnFillTuneCc/.test(s), 'bộ CC Cubase + nút điền nhanh btnFillTuneCc');

// --- 4. HTML không đổi ---
ok(/<button class="preset-btn">TUNE OFF<\/button>/.test(rd('ui/index.html')), 'index.html giữ nguyên nút TUNE OFF');
function finish() { console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); }
