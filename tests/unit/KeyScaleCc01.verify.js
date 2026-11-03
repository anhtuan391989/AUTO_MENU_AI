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

function build({ keyRoot = false, mapping = true, port = 'loopMIDI', ccFail = false, noteFail = false } = {}) {
    const events = [], ev2 = []; // ev2 = CC của các Auto-Tune còn lại (A93/A94: CC 32-37 kênh 15) — tách riêng để các kiểm tra mic 1 không đổi
    const maps = mapping ? { 'Studio Pro 8': { KEY_SCALE_MAJOR: { kind: 'cc', channel: 15, number: 26, value: 0 }, KEY_SCALE_MINOR: { kind: 'cc', channel: 15, number: 26, value: 5 } } } : {};
    if (keyRoot) maps['Studio Pro 8'].KEY_ROOT = { kind: 'cc', channel: 15, number: 27, value: 0 };
    const store = { selectedDAW: 'Studio Pro 8', dawMidiOutMappings: maps, midiOutputPort: port, mouseControlEnabled: true };
    const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, Number, JSON, Error, Array, Object, setTimeout: (f) => { f(); return 0; },
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting() {}, getCoordinate: () => null,
        sendMidiCC: async (n, v, ch) => { (n >= 32 && n <= 37 ? ev2 : events).push(['cc', n, v, ch]); return !ccFail; },
        sendMidiNotePulse: async (n) => { events.push(['note', n]); return !noteFail; }, electronAPI: undefined };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('ui/js/vocalCommandRouter.js') + '\nthis.sendKeyToAutotune = sendKeyToAutotune;', sb);
    vm.runInContext(read('ui/js/actionRegistry.js'), sb);
    return { sb, events, ev2 };
}

(async () => {
    console.log('== 1. Major / Minor -> CC riêng + nốt gốc ==');
    { const e = build(); const r = await e.sb.sendKeyToAutotune('C Major');
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 26, 0, 14], ['note', 0]]), 'C Major: CC26=0 (Major, kênh 15) rồi nốt C(0) — Scale gửi TRƯỚC nốt', e.events);
      ok(r.ok && r.driverUsed === 'midi' && r.scale && r.scale.attempted && r.scale.ok && r.scale.mode === 'MAJOR', 'kết quả: ok, kèm scale {MAJOR, ok}', r.scale);
      e.events.length = 0; await e.sb.sendKeyToAutotune('A Minor');
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 26, 5, 14], ['note', 9]]), 'A Minor: CC26=5 rồi nốt A(9)', e.events);
      e.events.length = 0; await e.sb.sendKeyToAutotune('C Minor');
      ok(e.events[0][1] === 26 && e.events[0][2] === 5 && e.events[1][1] === 0, 'C Minor khác C Major dù cùng nốt gốc (CC26 giá trị 5 + nốt C)', e.events); }

    console.log('== 2. Chưa lưu CC Scale: dùng PRESET MẶC ĐỊNH (A92) — Scale CC26 kênh 15 + nốt gốc như cũ ==');
    { const e = build({ mapping: false }); const r = await e.sb.sendKeyToAutotune('D Minor');
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 26, 5, 14], ['note', 2]]) && r.ok && r.scale.attempted === true && r.scale.ok === true, 'không có mapping lưu -> preset mặc định: CC26=5 (Minor) rồi nốt D(2) như cũ', { ev: e.events, scale: r.scale }); }

    console.log('== 3. Lỗi Scale không chặn Key ==');
    { const e = build({ ccFail: true }); const r = await e.sb.sendKeyToAutotune('E Major');
      ok(r.ok && e.events.some((x) => x[0] === 'note' && x[1] === 4) && r.scale.attempted && r.scale.ok === false, 'CC Scale gửi lỗi -> vẫn gửi nốt E, ok=true, scale.ok=false', { ev: e.events, scale: r.scale }); }

    console.log('== 4. Key giáng / không có chữ Major/Minor ==');
    { const e = build(); await e.sb.sendKeyToAutotune('F# Minor');
      ok(e.events[0][1] === 26 && e.events[0][2] === 5 && e.events[1][1] === 6, 'F# Minor: CC26=5 + nốt F#(6)', e.events);
      e.events.length = 0; const r = await e.sb.sendKeyToAutotune('G');
      ok(JSON.stringify(e.events) === JSON.stringify([['note', 7]]) && r.scale.reason === 'NO_SCALE_IN_KEY', 'tên Key không có Major/Minor -> không gửi Scale, chỉ nốt G', e.events); }

    console.log('== 5. Chưa chọn cổng MIDI ==');
    { const e = build({ port: '' }); const r = await e.sb.sendKeyToAutotune('C Major');
      ok(!r.ok && e.events.every((x) => x[0] !== 'note'), 'không có cổng MIDI -> Key không gửi được (như cũ), không crash', r); }

    console.log('== 6. Setup ==');
    { const S = read('ui/js/setup.js');
      ok(/action: "KEY_SCALE_MAJOR"/.test(S) && /action: "KEY_SCALE_MINOR"/.test(S), 'Setup có 2 dòng KEY_SCALE_MAJOR / KEY_SCALE_MINOR');
      ok(/KEY_SCALE_MAJOR: Object\.freeze\(\{ kind: "cc", channel: 15, number: 26, value: 0 \}\)/.test(S) && /KEY_SCALE_MINOR: Object\.freeze\(\{ kind: "cc", channel: 15, number: 26, value: 5 \}\)/.test(S), 'bộ điền nhanh KEY + SCALE: cùng CC26 kênh 15, Major=0 / Minor=5, Key CC27'); }

    console.log('== 7. Setup cho phép CC chung (khác giá trị) cho 2 Scale, vẫn chặn trùng thật ==');
    { const S = read('ui/js/setup.js');
      const sb = { console, Set, Map, Number, Object, Array, Math };
      vm.createContext(sb);
      const pick = (n) => { const m = S.match(new RegExp('(?:const|function) ' + n + '[\\s\\S]*?\\n\\}\\n|const ' + n + ' = [^\\n]*\\n')); return m ? m[0] : ''; };
      vm.runInContext(pick('KEY_SCALE_SHARED_SET') + pick('midiClashKey') + pick('validateDawProfileBundle') + pick('planDawProfileFill') + pick('dawQfMake')
        + '\nthis.v=validateDawProfileBundle; this.p=planDawProfileFill;', sb);
      const A = ['KEY_SCALE_MAJOR', 'KEY_SCALE_MINOR', 'MIC1_VOLUME', 'MUSIC_ON'];
      const bun = { count: 2, mappings: { KEY_SCALE_MAJOR: { kind: 'cc', channel: 15, number: 26, value: 0 }, KEY_SCALE_MINOR: { kind: 'cc', channel: 15, number: 26, value: 5 } } };
      ok(sb.v(bun, A).length === 0, 'bộ KEY SCALE (CC26: 0 và 5) hợp lệ, không báo trùng', sb.v(bun, A));
      const same = { count: 2, mappings: { KEY_SCALE_MAJOR: { kind: 'cc', channel: 15, number: 26, value: 5 }, KEY_SCALE_MINOR: { kind: 'cc', channel: 15, number: 26, value: 5 } } };
      ok(sb.v(same, A).length === 1, 'Major và Minor cùng CC cùng giá trị -> vẫn báo trùng', sb.v(same, A));
      const other = { count: 2, mappings: { MIC1_VOLUME: { kind: 'cc', channel: 15, number: 26, value: 0 }, MUSIC_ON: { kind: 'cc', channel: 15, number: 26, value: 5 } } };
      ok(sb.v(other, A).length === 1, 'action khác (không phải Scale) trùng CC -> vẫn báo trùng', sb.v(other, A));
      const saved = { MIC1_VOLUME: { kind: 'cc', channel: 15, number: 26, value: 127 } };
      const pl = sb.p({ bundles: { scale: bun } }, 'scale', (a) => saved[a], A);
      ok(!pl.ok && pl.conflicts.length >= 1, 'CC26 đã dùng cho MIC1_VOLUME -> điền nhanh Scale bị chặn', pl.conflicts);
      const pl2 = sb.p({ bundles: { scale: bun } }, 'scale', () => null, A);
      ok(pl2.ok && pl2.writes.length === 2, 'không có xung đột -> kế hoạch ghi 2 mapping', pl2); }

    console.log('== 8. KEY-ROOT-CC-01: Key gốc bằng CC 27 (giá trị theo nốt) ==');
    { const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], exp = [0,12,23,35,46,58,69,81,92,104,115,127];
      let allOk = true; const got = [];
      for (let i = 0; i < 12; i++) { const e = build({ keyRoot: true }); await e.sb.sendKeyToAutotune(names[i] + ' Major');
        const kc = e.events.find((x) => x[0] === 'cc' && x[1] === 27); got.push(kc && kc[2]);
        if (!kc || kc[2] !== exp[i] || kc[3] !== 14 || e.events.some((x) => x[0] === 'note')) allOk = false;
        if (Math.round(exp[i] / 127 * 11) !== i) allOk = false; }
      ok(allOk, '12 nốt -> CC27 kênh 15 giá trị 0,12,23,35,46,58,69,81,92,104,115,127; không gửi nốt; làm tròn ngược đúng nấc', got);
      const e = build({ keyRoot: true }); const r = await e.sb.sendKeyToAutotune('A Minor');
      ok(JSON.stringify(e.events.map((x) => x.slice(0, 3))) === JSON.stringify([['cc', 26, 5], ['cc', 27, 104]]) && r.ok && r.midi.viaCc && r.keyCc.ccValue === 104, 'A Minor: Scale CC26=5 rồi Key CC27=104', e.events);
      const f = build({ keyRoot: true, ccFail: true }); const rf = await f.sb.sendKeyToAutotune('D Major');
      ok(f.events.some((x) => x[0] === 'note' && x[1] === 2) && rf.ok, 'CC Key lỗi -> rơi về gửi nốt như cũ', f.events);
      const g = build(); await g.sb.sendKeyToAutotune('E Major');
      ok(g.events.every((x) => x[0] !== 'cc' || x[1] !== 27) && g.events.some((x) => x[0] === 'note' && x[1] === 4), 'chưa cấu hình KEY_ROOT -> hành vi cũ (nốt E)', g.events); }

    console.log('== 9. A93: Auto-Tune MIC 2 có CC RIÊNG (kênh 15: CC 32 Scale Major=0/Minor=5, CC 33 Key gốc theo nốt) ==');
    { const e = build({ mapping: false }); const r = await e.sb.sendKeyToAutotune('A Minor');
      ok(JSON.stringify(e.ev2) === JSON.stringify([['cc', 32, 5, 14], ['cc', 33, 104, 14], ['cc', 34, 5, 14], ['cc', 35, 104, 14], ['cc', 36, 5, 14], ['cc', 37, 104, 14]]), 'A Minor: mic 2 (32/33), Auto-Tune 3 (34/35), Auto-Tune 4 (36/37) đều nhận Minor=5 + Key A=104', e.ev2);
      ok(JSON.stringify(e.events) === JSON.stringify([['cc', 26, 5, 14], ['note', 9]]) && r.ok, 'mic 1 KHÔNG đổi (CC26=5 rồi nốt A)', e.events);
      const m = build({ mapping: false }); await m.sb.sendKeyToAutotune('C Major');
      ok(JSON.stringify(m.ev2) === JSON.stringify([['cc', 32, 0, 14], ['cc', 33, 0, 14], ['cc', 34, 0, 14], ['cc', 35, 0, 14], ['cc', 36, 0, 14], ['cc', 37, 0, 14]]), 'C Major: cả 3 Auto-Tune còn lại nhận Scale=0, Key=0', m.ev2);
      const f = build({ mapping: false, ccFail: true }); const rf = await f.sb.sendKeyToAutotune('D Major');
      ok(f.events.some((x) => x[0] === 'note' && x[1] === 2) && rf.ok, 'CC các Auto-Tune phụ lỗi KHÔNG chặn việc gửi Key mic 1 (vẫn gửi nốt)', f.events); }


    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI HARNESS', e); process.exit(2); });
