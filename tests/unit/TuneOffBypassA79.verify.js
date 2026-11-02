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

// --- 1b. Preset MIDI mặc định (A81): không cần Setup, mapping đã lưu thắng ---
function makeAR2(daw, saved) {
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? (saved || {}) : undefined), saveSetting: () => {} };
    vm.createContext(sb);
    vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    return win.ActionRegistry;
}
{
    const a = makeAR2('Studio One 7', {});
    const on = a.getMidiOutMapping('TUNE_BYPASS_ON'), off = a.getMidiOutMapping('TUNE_BYPASS_OFF');
    ok(on && on.kind === 'cc' && on.channel === 16 && on.number === 113 && on.value === 127, 'Studio One: TUNE_BYPASS_ON mặc định = CC113 kênh16 (không cần Setup)');
    ok(off && off.number === 114, 'Studio One: TUNE_BYPASS_OFF mặc định = CC114');
    ok(a.getDawStateMode('TUNE') === 'explicit', 'mode = explicit ngay khi chưa lưu gì (đã có preset)');
    ok(makeAR2('Cubase 13', {}).getMidiOutMapping('TUNE_BYPASS_ON').number === 118, 'Cubase: CC118');
    const own = { 'Studio One 7': { TUNE_BYPASS_ON: { kind: 'cc', channel: 1, number: 7, value: 100 } } };
    ok(makeAR2('Studio One 7', own).getMidiOutMapping('TUNE_BYPASS_ON').number === 7, 'mapping người dùng đã lưu thắng preset mặc định');
    ok(makeAR2('Studio One 7', {}).getMidiOutMapping('PLAY') === null || makeAR2('Studio One 7', {}).getMidiOutMapping('DAW_PLAY') === null, 'action khác không bị gán mặc định');
}

// --- 2. renderer: TUNE OFF độc lập khỏi nhóm Preset (kiểm tĩnh) ---
const r = rd('ui/js/renderer.js');
ok(/isTuneOffBtn\(e\.target\)[\s\S]{0,400}renderTuneBtn\(e\.target, tuneOnNow\)/.test(r), 'nút TUNE bật/tắt riêng (không chọn-một)');
ok(/renderTuneBtn\(b, true\)/.test(r), 'mặc định TUNE ON (sáng, bypass tắt)');
ok(/btn\.textContent = tuneOn \? "TUNE ON" : "TUNE OFF"/.test(r) && /classList\.toggle\("active", tuneOn\)/.test(r), 'TUNE ON = sáng + chữ TUNE ON; TUNE OFF = tắt sáng + chữ TUNE OFF');
ok(/const bypassOn = !tuneOnNow/.test(r) && /setDawControlState\?\.\("TUNE", bypassOn/.test(r), 'TUNE OFF => bypass BẬT; TUNE ON => bypass TẮT');
ok(/forEach\(b => \{ if \(!isTuneOffBtn\(b\)\) b\.classList\.remove\("active"\)/.test(r), 'bấm preset không tắt TUNE OFF');
ok(/btn\.dataset\.tuneBtn === "1"\) return;/.test(r), 'loadData không khôi phục nút TUNE (luôn mở ở TUNE ON)');
ok(/MIC1.{0,40}MIC2|2 mic/i.test(rd('ui/js/actionRegistry.js')), 'label ghi rõ bypass 2 mic');

// --- 3. Setup có 2 dòng mapping mới ---
const s = rd('ui/js/setup.js');
ok(/action: "TUNE_BYPASS_ON"/.test(s) && /action: "TUNE_BYPASS_OFF"/.test(s), 'Setup có dòng mapping TUNE_BYPASS_ON/OFF');

ok(/tune: Object\.freeze\(\{ title: "TUNE BYPASS", count: 2, mappings: dawQfMake\(16, 127, \{ TUNE_BYPASS_ON: 113, TUNE_BYPASS_OFF: 114/.test(s), 'bộ CC gợi ý Studio One: TUNE_BYPASS_ON=113, OFF=114 (kênh 16)');
ok(/TUNE_BYPASS_ON: 118, TUNE_BYPASS_OFF: 119/.test(s) && /btnFillTuneCc/.test(s), 'bộ CC Cubase + nút điền nhanh btnFillTuneCc');

// --- 4. HTML không đổi ---
ok(/<button class="preset-btn">TUNE OFF<\/button>/.test(rd('ui/index.html')), 'index.html giữ nguyên nút TUNE OFF');
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
