/**
 * MonitorBeatRetuneBackend.verify.js — TASK B13 Mục 2/3
 * ---------------------------------------------------------------------------
 * Xác nhận MONITOR_BEAT_TOGGLE / RETUNE_SPEED_MIC1 / RETUNE_SPEED_MIC2 đi ĐÚNG runtime backend
 * (getActionStatus()/executeAction() thật, không phải suy luận từ tên) và biểu diễn ĐÚNG
 * NOT_CONFIGURED khi chưa có mapping — không giả PASS. Khi CÓ mapping thật (giả lập), xác
 * nhận dispatch thật sự gọi tới sendMidiCC với đúng số CC đã cấu hình cho TỪNG action riêng
 * (MIC1 ≠ MIC2, không lẫn lộn).
 *
 * Chạy: node tests/unit/MonitorBeatRetuneBackend.verify.js
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
    let start = source.indexOf(`async function ${name}(`);
    if (start === -1) start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy ${name}()`);
    const parenOpen = source.indexOf('(', start);
    let pdepth = 0, j = parenOpen;
    for (; j < source.length; j++) { if (source[j] === '(') pdepth++; else if (source[j] === ')') { pdepth--; if (pdepth === 0) break; } }
    const braceIdx = source.indexOf('{', j);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(start, i + 1);
}
function extractConst(name, closer) {
    const s = source.indexOf(`const ${name}`);
    const e = source.indexOf(closer, s) + closer.length;
    return source.slice(s, e);
}

const code = [
    extractConst('ACTIONS', '});'),
    extractConst('ACTION_STATUS', '});'),
    extractConst('ACTION_COORDINATE_KEY', '});'),
    extractFn('getSelectedDaw'),
    extractFn('getMidiOutMapping'),
    extractFn('getMouseCoordinate'),
    extractFn('isMouseControlEnabled'),
    extractFn('getActionStatus'),
    extractFn('executeAction'),
].join('\n\n');

function buildSandbox({ selectedDAW, mappings, sendMidiCCSpy }) {
    const store = { selectedDAW, dawMidiOutMappings: { [selectedDAW || 'none']: mappings || {} } };
    const sandbox = {
        console,
        getSetting: (key) => store[key],
        setSetting: (key, value) => { store[key] = value; },
        sendMidiCC: sendMidiCCSpy || (async () => true),
        window: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

(async () => {
    console.log('== Chưa chọn DAW -> cả 3 action báo NOT_CONFIGURED thật (getActionStatus), không giả PASS ==');
    {
        const sandbox = buildSandbox({ selectedDAW: null, mappings: {} });
        for (const action of ['MONITOR_BEAT_TOGGLE', 'RETUNE_SPEED_MIC1', 'RETUNE_SPEED_MIC2']) {
            const s = sandbox.getActionStatus(action);
            assert(s.status === 'NOT_CONFIGURED' && s.reason === 'NO_DAW_SELECTED', `${action}: NOT_CONFIGURED/NO_DAW_SELECTED khi chưa chọn DAW (thực tế: ${JSON.stringify(s)})`);
        }
    }

    console.log('\n== Đã chọn DAW nhưng chưa cấu hình mapping -> vẫn NOT_CONFIGURED thật (không phải lỗi ngầm) ==');
    {
        const sandbox = buildSandbox({ selectedDAW: 'studio_one', mappings: {} });
        for (const action of ['MONITOR_BEAT_TOGGLE', 'RETUNE_SPEED_MIC1', 'RETUNE_SPEED_MIC2']) {
            const s = sandbox.getActionStatus(action);
            assert(s.status === 'NOT_CONFIGURED', `${action}: NOT_CONFIGURED khi có DAW nhưng chưa có mapping (thực tế: ${JSON.stringify(s)})`);
        }
    }

    console.log('\n== Có mapping thật (giả lập) -> dispatch THẬT sự gọi sendMidiCC đúng CC của TỪNG action, MIC1 ≠ MIC2 ==');
    {
        const calls = [];
        const sandbox = buildSandbox({
            selectedDAW: 'studio_one',
            mappings: {
                MONITOR_BEAT_TOGGLE: { kind: 'cc', channel: 1, number: 50, value: 127 },
                RETUNE_SPEED_MIC1: { kind: 'cc', channel: 1, number: 60, value: 0 },
                RETUNE_SPEED_MIC2: { kind: 'cc', channel: 1, number: 61, value: 0 },
            },
            sendMidiCCSpy: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
        });
        for (const action of ['MONITOR_BEAT_TOGGLE', 'RETUNE_SPEED_MIC1', 'RETUNE_SPEED_MIC2']) {
            const s = sandbox.getActionStatus(action);
            assert(s.status === 'SUCCESS' && s.via === 'midi', `${action}: getActionStatus báo SUCCESS/midi khi ĐÃ có mapping thật (thực tế: ${JSON.stringify(s)})`);
        }
        await sandbox.executeAction('RETUNE_SPEED_MIC1', { value: 42 });
        await sandbox.executeAction('RETUNE_SPEED_MIC2', { value: 77 });
        assert(calls.length === 2, `đúng 2 lần gửi (thực tế: ${calls.length})`);
        assert(calls[0].num === 60 && calls[0].val === 42, `MIC1 gửi đúng CC60=42 (thực tế: CC${calls[0].num}=${calls[0].val})`);
        assert(calls[1].num === 61 && calls[1].val === 77, `MIC2 gửi đúng CC61=77, KHÔNG lẫn với MIC1 (thực tế: CC${calls[1].num}=${calls[1].val})`);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
