/**
 * KEY-SCALE-CC-01 — Scale (Major/Minor) của Key được gửi xuống Auto-Tune bằng CC RIÊNG, cùng lúc với nốt gốc.
 * Mã THẬT: ui/js/vocalCommandRouter.js (sendKeyToAutotune) + ui/js/actionRegistry.js (executeAction) trong 1 sandbox; MIDI giả (ghi lại thứ tự).
 * KHÔNG phải Auto-Tune thật. Chạy: node tests/unit/KeyScaleCc01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.AUTOMENU_ROOT || path.join(__dirname, '..', '..');
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };

function build({ mapping = true, port = 'loopMIDI', ccFail = false, noteFail = false } = {}) {
    const events = [];
    const maps = mapping ? { 'Studio Pro 8': { KEY_SCALE_MAJOR: { kind: 'cc', channel: 15, number: 26, value: 127 }, KEY_SCALE_MINOR: { kind: 'cc', channel: 15, number: 27, value: 127 } } } : {};
    const store = { selectedDAW: 'Studio Pro 8', dawMidiOutMappings: maps, midiOutputPort: port, mouseControlEnabled: true };
    const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, Number, JSON, Error, Array, Object, setTimeout: (f) => { f(); return 0; },
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting() {}, getCoordinate: () => null,
        sendMidiCC: async (n, v, ch) => { events.push(['cc', n, v, ch]); return !ccFail; },
        sendMidiNotePulse: async (n) => { events.push(['note', n]); return !noteFail; }, electronAPI: undefined };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('ui/js/vocalCommandRouter.js') + '\nthis.sendKeyToAutotune = sendKeyToAutotune;', sb);
    vm.runInContext(read('ui/js/actionRegistry.js'), sb);
    return { sb, events };
}

(async () => {
    console.log('== 1. Major / Minor -> CC riêng + nốt gốc ==');
    { const e = build(); const r = await e.sb.sendKeyToAutotune('C Major');
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 26, 127, 14], ['note', 0]]), 'C Major: CC26 (kênh 15) rồi nốt C(0) — Scale gửi TRƯỚC nốt', e.events);
      ok(r.ok && r.driverUsed === 'midi' && r.scale && r.scale.attempted && r.scale.ok && r.scale.mode === 'MAJOR', 'kết quả: ok, kèm scale {MAJOR, ok}', r.scale);
      e.events.length = 0; await e.sb.sendKeyToAutotune('A Minor');
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 27, 127, 14], ['note', 9]]), 'A Minor: CC27 rồi nốt A(9)', e.events);
      e.events.length = 0; await e.sb.sendKeyToAutotune('C Minor');
      ok(e.events[0][1] === 27 && e.events[1][1] === 0, 'C Minor khác C Major dù cùng nốt gốc (CC27 + nốt C)', e.events); }

    console.log('== 2. Chưa cấu hình CC Scale: hành vi cũ ==');
    { const e = build({ mapping: false }); const r = await e.sb.sendKeyToAutotune('D Minor');
      ok(JSON.stringify(e.events) === JSON.stringify([['note', 2]]) && r.ok && r.scale.attempted === false && r.scale.reason === 'NOT_CONFIGURED', 'không có mapping -> chỉ gửi nốt D(2) như cũ, scale.attempted=false', { ev: e.events, scale: r.scale }); }

    console.log('== 3. Lỗi Scale không chặn Key ==');
    { const e = build({ ccFail: true }); const r = await e.sb.sendKeyToAutotune('E Major');
      ok(r.ok && e.events.some((x) => x[0] === 'note' && x[1] === 4) && r.scale.attempted && r.scale.ok === false, 'CC Scale gửi lỗi -> vẫn gửi nốt E, ok=true, scale.ok=false', { ev: e.events, scale: r.scale }); }

    console.log('== 4. Key giáng / không có chữ Major/Minor ==');
    { const e = build(); await e.sb.sendKeyToAutotune('F# Minor');
      ok(e.events[0][1] === 27 && e.events[1][1] === 6, 'F# Minor: CC27 + nốt F#(6)', e.events);
      e.events.length = 0; const r = await e.sb.sendKeyToAutotune('G');
      ok(JSON.stringify(e.events) === JSON.stringify([['note', 7]]) && r.scale.reason === 'NO_SCALE_IN_KEY', 'tên Key không có Major/Minor -> không gửi Scale, chỉ nốt G', e.events); }

    console.log('== 5. Chưa chọn cổng MIDI ==');
    { const e = build({ port: '' }); const r = await e.sb.sendKeyToAutotune('C Major');
      ok(!r.ok && e.events.every((x) => x[0] !== 'note'), 'không có cổng MIDI -> Key không gửi được (như cũ), không crash', r); }

    console.log('== 6. Setup ==');
    { const S = read('ui/js/setup.js');
      ok(/action: "KEY_SCALE_MAJOR"/.test(S) && /action: "KEY_SCALE_MINOR"/.test(S), 'Setup có 2 dòng KEY_SCALE_MAJOR / KEY_SCALE_MINOR');
      ok(/scale: Object\.freeze\(\{ title: "KEY SCALE", count: 2, mappings: dawQfMake\(15, 127, \{ KEY_SCALE_MAJOR: 26, KEY_SCALE_MINOR: 27 \}\) \}\)/.test(S), 'bộ điền nhanh KEY SCALE: CC26/CC27 kênh 15'); }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI HARNESS', e); process.exit(2); });
