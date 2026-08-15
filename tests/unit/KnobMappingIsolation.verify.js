/**
 * KnobMappingIsolation.verify.js — TASK B7 (Mục 2/7 — MIDI Learn/Mapping isolation)
 * ---------------------------------------------------------------------------
 * Test trực tiếp getMidiOutMapping()/setMidiOutMapping() (ui/js/actionRegistry.js) — trích
 * xuất verbatim 2 hàm này + getSelectedDaw(), chạy với getSetting/setSetting giả lập (Node
 * thuần, không cần DOM vì 2 hàm này không đụng document). Xác nhận:
 *   - dawMidiOutMappings[daw]["BEAT_INPUT_VOLUME"] và [...]["MASTER_OUTPUT_VOLUME"] là 2 key
 *     độc lập, lưu/đọc riêng biệt, không đè nhau (Test Case 7/8/9 của B7).
 *
 * Chạy: node tests/unit/KnobMappingIsolation.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'actionRegistry.js'), 'utf8');

function extractFn(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy function ${name}() trong actionRegistry.js`);
    let depth = 0, braceIdx = source.indexOf('{', start), i = braceIdx;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
    }
    return source.slice(start, i + 1);
}

const code = [extractFn('getSelectedDaw'), extractFn('getMidiOutMapping'), extractFn('setMidiOutMapping')].join('\n\n');

function buildSandbox(initialSettings) {
    const store = { ...initialSettings };
    const sandbox = {
        console,
        getSetting: (key) => store[key],
        setSetting: (key, value) => { store[key] = value; },
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { sandbox, store };
}

console.log('== Case 7: 2 mapping BEAT_INPUT_VOLUME / MASTER_OUTPUT_VOLUME tồn tại độc lập ==');
{
    const { sandbox } = buildSandbox({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
    sandbox.setMidiOutMapping('BEAT_INPUT_VOLUME', { kind: 'cc', channel: 1, number: 20, value: 0 });
    sandbox.setMidiOutMapping('MASTER_OUTPUT_VOLUME', { kind: 'cc', channel: 2, number: 21, value: 0 });
    const beat = sandbox.getMidiOutMapping('BEAT_INPUT_VOLUME');
    const master = sandbox.getMidiOutMapping('MASTER_OUTPUT_VOLUME');
    assert(beat.number === 20 && beat.channel === 1, `Beat mapping đúng riêng của nó (thực tế: ${JSON.stringify(beat)})`);
    assert(master.number === 21 && master.channel === 2, `Master mapping đúng riêng của nó (thực tế: ${JSON.stringify(master)})`);
    assert(beat.number !== master.number, 'Beat và Master có CC number khác nhau khi user tự cấu hình khác nhau (không ép chung)');
}

console.log('\n== Case 8: Lưu (Learn) mapping cho Beat KHÔNG ghi đè/ảnh hưởng Master đã lưu trước đó ==');
{
    const { sandbox } = buildSandbox({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
    sandbox.setMidiOutMapping('MASTER_OUTPUT_VOLUME', { kind: 'cc', channel: 1, number: 7, value: 90 });
    const masterBefore = JSON.stringify(sandbox.getMidiOutMapping('MASTER_OUTPUT_VOLUME'));
    sandbox.setMidiOutMapping('BEAT_INPUT_VOLUME', { kind: 'cc', channel: 1, number: 8, value: 90 });
    const masterAfter = JSON.stringify(sandbox.getMidiOutMapping('MASTER_OUTPUT_VOLUME'));
    assert(masterBefore === masterAfter, `Lưu Beat KHÔNG làm đổi Master đã lưu trước (trước: ${masterBefore}, sau: ${masterAfter})`);
}

console.log('\n== Case 9: Lưu (Learn) mapping cho Master KHÔNG ghi đè/ảnh hưởng Beat đã lưu trước đó ==');
{
    const { sandbox } = buildSandbox({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
    sandbox.setMidiOutMapping('BEAT_INPUT_VOLUME', { kind: 'cc', channel: 3, number: 30, value: 50 });
    const beatBefore = JSON.stringify(sandbox.getMidiOutMapping('BEAT_INPUT_VOLUME'));
    sandbox.setMidiOutMapping('MASTER_OUTPUT_VOLUME', { kind: 'cc', channel: 4, number: 31, value: 60 });
    const beatAfter = JSON.stringify(sandbox.getMidiOutMapping('BEAT_INPUT_VOLUME'));
    assert(beatBefore === beatAfter, `Lưu Master KHÔNG làm đổi Beat đã lưu trước (trước: ${beatBefore}, sau: ${beatAfter})`);
}

console.log('\n== Bổ sung: cả 2 mapping mặc định NOT_CONFIGURED (null) khi chưa ai lưu — không tự bịa CC ==');
{
    const { sandbox } = buildSandbox({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
    assert(sandbox.getMidiOutMapping('BEAT_INPUT_VOLUME') === null, 'Beat mặc định null (NOT_CONFIGURED), không có CC tự đặt sẵn');
    assert(sandbox.getMidiOutMapping('MASTER_OUTPUT_VOLUME') === null, 'Master mặc định null (NOT_CONFIGURED), không có CC tự đặt sẵn');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
