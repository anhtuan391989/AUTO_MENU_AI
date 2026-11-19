/* TASK A-MACRO-01 / A-MAP-01 — kiểm tra MIDI Macro (D1-gated, tối đa 5 bước) + 4 lệnh hotkey mới. Chạy: node tests/unit/MidiMacroA01.verify.js */
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const d1Loader = require(path.join(root, 'core/command-engine-js/d1Loader.js'));
const runtime = require(path.join(root, 'core/command-engine-js/runtime.js'));
const { getCapability } = require(path.join(root, 'core/command-engine-js/capabilityRegistry.js'));
let pass = 0, fail = 0;
function check(l, c, d) { if (c) { pass++; console.log('  OK   ' + l); } else { fail++; console.log('  FAIL ' + l + (d !== undefined ? ' (thực tế: ' + JSON.stringify(d) + ')' : '')); } }

(async () => {
    const d1 = await d1Loader.loadD1FromDisk();
    check('D1 production hợp lệ (12 capability)', d1.ok && d1.capabilities.length === 12, d1.errors);

    console.log('\n== A-MAP-01: 4 lệnh mới có driver thật trong registry ==');
    for (const [cap, act, keys] of [['daw:undo', 'undo', '^z'], ['daw:redo', 'redo', '^y'], ['daw:loop', 'loopToggle', '/'], ['daw:metronome', 'metronomeToggle', 'c']]) {
        const t = d1Loader.CAPABILITY_BACKEND_TARGET[cap];
        const c = getCapability(t && t.targetId, t && t.action);
        check(cap + ' -> hotkey ' + keys, !!c && c.length === 1 && c[0].driverName === 'hotkey' && c[0].params.keys === keys, c);
    }

    console.log('\n== buildD1GatedMacros (hàm thuần) ==');
    const single = new Map([['cc:1:10', {}]]);
    const mk = (o) => Object.assign({ type: 'cc', channel: 1, number: 20, steps: ['daw:play'] }, o);
    let r = d1Loader.buildD1GatedMacros([mk({ steps: ['daw:undo', 'daw:play'] })], d1.capabilities, single);
    check('macro hợp lệ 2 bước được nhận', r.macros.size === 1 && r.macros.get('cc:1:20').steps.length === 2 && r.rejected.length === 0, r);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['daw:play', 'daw:stop', 'daw:record', 'daw:undo', 'daw:redo'] })], d1.capabilities, single);
    check('đúng 5 bước vẫn nhận', r.macros.size === 1, r);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['daw:play', 'daw:stop', 'daw:record', 'daw:undo', 'daw:redo', 'daw:loop'] })], d1.capabilities, single);
    check('6 bước bị loại (TOO_MANY_STEPS)', r.macros.size === 0 && r.rejected[0].reason === 'TOO_MANY_STEPS', r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({ steps: [] })], d1.capabilities, single);
    check('0 bước bị loại (EMPTY_MACRO)', r.macros.size === 0 && r.rejected[0].reason === 'EMPTY_MACRO', r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['daw:save'] })], d1.capabilities, single);
    check('bước daw:save (midi-allowed=false) bị loại', r.macros.size === 0 && r.rejected[0].reason === 'D1_MIDI_NOT_ALLOWED', r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['menu:buttonA'] })], d1.capabilities, single);
    check('bước menu:buttonA (chưa có backend) bị loại', r.macros.size === 0, r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['abc:xyz'] })], d1.capabilities, single);
    check('bước không có trong D1 bị loại', r.rejected[0] && r.rejected[0].reason === 'UNKNOWN_CAPABILITY_IN_D1', r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({ number: 10 })], d1.capabilities, single);
    check('trùng key với mapping đơn bị loại', r.rejected[0] && r.rejected[0].reason === 'CONFLICTS_WITH_SINGLE_MAPPING', r.rejected);
    r = d1Loader.buildD1GatedMacros([mk({}), mk({ steps: ['daw:stop'] })], d1.capabilities, single);
    check('2 macro cùng key: giữ cái đầu, loại cái sau', r.macros.size === 1 && r.rejected[0].reason === 'DUPLICATE_RUNTIME_KEY', r);
    r = d1Loader.buildD1GatedMacros([mk({ steps: ['macro:x'] })], d1.capabilities, single);
    check('macro không thể chứa macro (không lặp vô hạn)', r.macros.size === 0, r);
    r = d1Loader.buildD1GatedMacros([mk({ delayMs: 99999 })], d1.capabilities, single);
    check('delay bị chặn ở 2000 ms', r.macros.get('cc:1:20').delayMs === 2000, r);
    r = d1Loader.buildD1GatedMacros(undefined, d1.capabilities, single);
    check('không có macro nào -> map rỗng, không throw', r.macros.size === 0);

    console.log('\n== Runtime thật: nạp macro + chạy chuỗi bằng driver giả ==');
    runtime.start({ readSettingsFile: () => ({}) });
    await new Promise((r) => setTimeout(r, 1500)); // chờ lần nạp D1 ngầm của start() xong, tránh ghi đè index của test
    const settings = { midiMappingsV1: [{ type: 'cc', channel: 1, number: 10, action: 'daw:play' }], midiMacrosV1: [mk({ steps: ['daw:undo', 'daw:play', 'daw:loop'], delayMs: 5 })] };
    await runtime.loadD1AndRebuild(settings);
    check('runtime nạp đúng 1 macro', runtime.getD1GatedMacros().size === 1 && runtime.getD1State().macroCount === 1, runtime.getD1State());
    const engine = runtime._getEngineForTest();
    const calls = [];
    const fake = (ok) => ({ name: 'hotkey', isReady: async () => true, execute: async (p) => { calls.push(p.keys); return ok(p) ? { ok: true } : { ok: false, detail: 'fail' }; } });
    engine.drivers.set('hotkey', fake(() => true));
    engine.drivers.delete('mcu'); engine.drivers.delete('midi');
    let res = await runtime.runMacroForTest('cc:1:20', runtime.getD1GatedMacros().get('cc:1:20'));
    check('chạy đủ 3 bước đúng thứ tự (^z, Space, /)', res.ok && res.ran === 3 && JSON.stringify(calls) === JSON.stringify(['^z', 'Space', '/']), { res, calls });
    calls.length = 0;
    engine.drivers.set('hotkey', fake((p) => p.keys !== 'Space'));
    res = await runtime.runMacroForTest('cc:1:20', runtime.getD1GatedMacros().get('cc:1:20'));
    check('bước 2 lỗi -> DỪNG, bước 3 KHÔNG chạy', !res.ok && res.ran === 2 && calls.length === 2, { res, calls });
    calls.length = 0;
    engine.drivers.set('hotkey', fake(() => true));
    const m = runtime.getD1GatedMacros().get('cc:1:20');
    const [a, b] = await Promise.all([runtime.runMacroForTest('cc:1:20', m), runtime.runMacroForTest('cc:1:20', m)]);
    check('bấm lại khi đang chạy -> lần 2 bị bỏ qua (BUSY), chuỗi chỉ chạy 1 lần', (a.skipped === 'BUSY') !== (b.skipped === 'BUSY') && calls.length === 3, { calls });
    await runtime.loadD1AndRebuild({ midiMacrosV1: [mk({ steps: ['daw:play'] })] });
    check('đổi settings -> macro index được xây lại', runtime.getD1GatedMacros().size === 1 && runtime.getD1GatedMacros().get('cc:1:20').steps.length === 1);
    runtime.stop();

    console.log('\n== UI tĩnh ==');
    const html = fs.readFileSync(path.join(root, 'ui/setup.html'), 'utf8');
    check('setup.html nạp setupMidiMacro.js', html.includes('js/setupMidiMacro.js'));
    check('dropdown Learn có undo/redo/loop/metronome', ['undo', 'redo', 'loop', 'metronome'].every((x) => html.includes('value="daw:' + x + '"')));
    check('mọi dòng bảng nhóm có data-map', (html.match(/class="mapping-row" data-map=/g) || []).length === 7);
    check('Macro card không còn badge "Chưa có Engine thực thi chuỗi action"', !html.includes('Chưa có Engine thực thi chuỗi action'));
    console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
    process.exit(fail ? 1 : 0);
})();
