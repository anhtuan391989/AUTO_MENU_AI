/**
 * LiveMidiCompletion01.verify.js — FSP8-LIVE-MIDI-COMPLETION-01
 * Kiểm chứng TĨNH + tích hợp trong tiến trình (mã THẬT, MIDI GIẢ) cho bảng 8 CC <-> 8 macro LIVE.
 * KHÔNG phải Fender Studio Pro 8 thật => không chứng minh macro chạy trong DAW.
 * Chạy: node tests/unit/LiveMidiCompletion01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m, x !== undefined ? JSON.stringify(x) : ''); } };

const TABLE = [
    ['MUSIC_ON', 102, 'LIVE_MUSIC_ON'], ['MUSIC_OFF', 103, 'LIVE_MUSIC_OFF'], ['MIC1_ON', 104, 'LIVE_MIC1_ON'], ['MIC1_OFF', 105, 'LIVE_MIC1_OFF'],
    ['MIC2_ON', 106, 'LIVE_MIC2_ON'], ['MIC2_OFF', 107, 'LIVE_MIC2_OFF'], ['FX_ON', 108, 'LIVE_FX_ON'], ['FX_OFF', 109, 'LIVE_FX_OFF'],
];
const MAC_DIR = 'tools/algbench/reports/LIVE-MIDI-FSP8-02/macros';
const V2_DIR = 'tools/algbench/reports/FSP8-LIVE-MIDI-COMPLETION-01/macros';
const parseMacro = (dir, name) => {
    const f = path.join(ROOT, dir, name + '.studioonemacro'); if (!fs.existsSync(f)) return null;
    const t = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
    return { title: (t.match(/<Macro title="([^"]*)"/) || [])[1], cmds: [...t.matchAll(/<CommandElement category="([^"]*)" name="([^"]*)">\s*<CommandArgument name="([^"]*)" value="([^"]*)"\/>/g)].map((m) => `${m[1]}|${m[2]}:${m[3]}=${m[4]}`) };
};

(async () => {
    console.log('== 1. Bảng gợi ý trong Setup khớp bảng mục tiêu (CC, kênh 16, value 127) ==');
    const setup = read('ui/js/setup.js');
    const sug = (setup.match(/const DAW_STATE_SUGGESTED = Object\.freeze\(\{([\s\S]*?)\}\);/) || [])[1] || '';
    const got = Object.fromEntries([...sug.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], +m[2]]));
    ok(TABLE.every(([a, cc]) => got[a] === cc) && Object.keys(got).length === 8, 'DAW_STATE_SUGGESTED = 8 mapping đúng bảng', got);
    ok(/DAW_STATE_SUGGESTED_CHANNEL = 16;/.test(setup) && /DAW_STATE_SUGGESTED_VALUE = 127;/.test(setup), 'kênh gợi ý 16, value 127');
    ok(/if \(!confirm\(msg\)\)/.test(setup), 'điền bộ CC gợi ý CHỈ khi người dùng xác nhận (không ghi đè ngầm)');

    console.log('\n== 2. Mã THẬT: 8 mapping -> 8 byte, kênh 16 -> index 15 (0xBF) ==');
    const sent = [];
    const store = { selectedDAW: 'studio-one', dawMidiOutMappings: { 'studio-one': Object.fromEntries(TABLE.map(([a, cc]) => [a, { kind: 'cc', channel: 16, number: cc, value: 127, source: 'USER_DEFINED' }])) } };
    const sb = { console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Date, Math, Promise, getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting: (k, v) => { store[k] = v; }, electronAPI: {},
        sendMidiCC: async (n, v, ch) => { sent.push([0xb0 | ch, n, v]); return true; }, sendMidiNotePulse: async () => true };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('ui/js/actionRegistry.js'), sb);
    const AR = sb.window.ActionRegistry;
    for (const ctl of ['MUSIC', 'MIC1', 'MIC2', 'FX']) for (const on of [true, false]) {
        const before = sent.length; const cc = TABLE.find(([a]) => a === `${ctl}_${on ? 'ON' : 'OFF'}`)[1];
        const r = await AR.setDawControlState(ctl, on);
        ok(r.ok && r.dawConfirmed === false && r.delivery === 'UNCONFIRMED' && sent.length === before + 1 && sent[before].join() === `191,${cc},127`, `${ctl} ${on ? 'ON' : 'OFF'} -> [0xBF,${cc},127], delivery=UNCONFIRMED, dawConfirmed=false`, sent.slice(before));
    }
    const s2 = { ...store, dawMidiOutMappings: { 'studio-one': {} } }; Object.assign(store, s2);
    const n0 = sent.length; const rr = await AR.setDawControlState('MIC1', true);
    ok(!rr.ok && (rr.reason === 'NOT_CONFIGURED' || rr.status === 'NOT_CONFIGURED') && sent.length === n0, 'thiếu mapping -> NOT_CONFIGURED, không gửi gì');

    console.log('\n== 3. Macro LIVE_* trong repo: đúng track/bus, đúng loại lệnh ==');
    for (const [a, cc, name] of TABLE) {
        const m = parseMacro(MAC_DIR, name); ok(!!m && m.title === name, `${name} tồn tại, title khớp (CC${cc})`);
        if (!m) continue;
        if (a.startsWith('FX')) {
            const st = a === 'FX_ON' ? '0' : '1'; const buses = ['Delay', 'Verb ngắn', 'Verb dài', 'Com Verb'];
            const want = buses.flatMap((b) => [`Console|Find Channel:Name=${b}`, `Track|Mute:State=${st}`]);
            ok(JSON.stringify(m.cmds) === JSON.stringify(want), `${name}: đúng 4 bus (có dấu), Mute State=${st} (ON=bỏ Mute), không lệnh khác`, m.cmds);
        } else {
            const tr = a.startsWith('MUSIC') ? 'Beat' : a.startsWith('MIC1') ? 'Mic' : 'Không Dây'; const st = a.endsWith('_ON') ? '1' : '0';
            ok(JSON.stringify(m.cmds) === JSON.stringify([`Track|Find Track:Name=${tr}`, `Track|Monitor:State=${st}`]), `${name}: Find Track "${tr}" -> Monitor State=${st}; KHÔNG Mute, KHÔNG track khác`, m.cmds);
        }
    }
    const cc8 = new Set(TABLE.map(([, cc]) => cc)); ok(cc8.size === 8, '8 CC khác nhau từng đôi (không trùng macro)');

    console.log('\n== 4. Macro V2 thử nghiệm (nếu có): không ghi đè LIVE_*, chỉ Find Track x2 + Monitor ==');
    for (const [a, , name] of TABLE.filter(([a]) => !a.startsWith('FX'))) {
        const v2 = 'LIVE_V2_' + name.slice(5); const m = parseMacro(V2_DIR, v2);
        if (!m) { console.log('  (bỏ qua: không có', v2, 'trong thư mục báo cáo)'); continue; }
        const tr = a.startsWith('MUSIC') ? 'Beat' : a.startsWith('MIC1') ? 'Mic' : 'Không Dây'; const st = a.endsWith('_ON') ? '1' : '0';
        ok(m.title === v2 && v2 !== name && JSON.stringify(m.cmds) === JSON.stringify([`Track|Find Track:Name=${tr}`, `Track|Find Track:Name=${tr}`, `Track|Monitor:State=${st}`]), `${v2}: tên khác bản LIVE, đúng track "${tr}", Monitor State=${st}, không Mute`, m.cmds);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
