/**
 * KnobDynamicValue.verify.js — TASK B7 Mục 5 (Dynamic value path)
 * ---------------------------------------------------------------------------
 * Trích xuất verbatim executeAction() (ui/js/actionRegistry.js) — xác nhận:
 *   - context.value ĐỘNG luôn được dùng khi hợp lệ, KHÔNG fallback về midiMap.value tĩnh
 *     (kể cả tại value=0, trường hợp dễ vỡ với toán tử `||` — ở đây dùng `??` nên an toàn).
 *   - Giá trị 0-100 từ Knob được gửi NGUYÊN VĂN (không tự scale sang 0-127) — ghi nhận đây là
 *     hành vi THẬT hiện tại, KHÔNG phải sửa hộ, vì quyết định scale 0-100↔0-127 vẫn là OPEN
 *     DECISION (xem TASK_B5_REPORT.md Mục 7) — B7 không tự quyết định, chỉ xác nhận đúng
 *     hành vi đang chạy.
 *   - Beat và Master không chia sẻ dynamic state (gọi liên tiếp, giá trị không lẫn lộn).
 *
 * Chạy: node tests/unit/KnobDynamicValue.verify.js
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
    if (start === -1) throw new Error(`Không tìm thấy ${name}() trong actionRegistry.js`);
    // Tìm dấu ')' đóng khớp của phần tham số TRƯỚC, rồi mới tìm '{' đầu tiên SAU đó — tránh
    // nhầm với dấu '{' của default parameter kiểu "context = {}".
    const parenOpen = source.indexOf('(', start);
    let pdepth = 0, j = parenOpen;
    for (; j < source.length; j++) {
        if (source[j] === '(') pdepth++;
        else if (source[j] === ')') { pdepth--; if (pdepth === 0) break; }
    }
    const braceIdx = source.indexOf('{', j);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
    }
    return source.slice(start, i + 1);
}

const acStart = source.indexOf('const ACTION_STATUS');
const acEnd = source.indexOf('});', acStart) + 3;
const actionStatusDecl = source.slice(acStart, acEnd);

const actionsStart = source.indexOf('const ACTIONS');
const actionsEnd = source.indexOf('});', actionsStart) + 3;
const actionsDecl = source.slice(actionsStart, actionsEnd);

const ackStart = source.indexOf('const ACTION_COORDINATE_KEY');
const ackEnd = source.indexOf('});', ackStart) + 3;
const actionCoordKeyDecl = source.slice(ackStart, ackEnd);

const code = [
    actionsDecl,
    actionStatusDecl,
    actionCoordKeyDecl,
    extractFn('getSelectedDaw'),
    extractFn('getMidiOutMapping'),
    extractFn('getMouseCoordinate'),
    extractFn('isMouseControlEnabled'),
    extractFn('executeAction'),
].join('\n\n');

function buildSandbox({ mapping, sendMidiCCSpy }) {
    const store = { selectedDAW: 'studio_one', dawMidiOutMappings: { studio_one: { TEST_ACTION: mapping } } };
    const sandbox = {
        console,
        getSetting: (key) => store[key],
        setSetting: (key, value) => { store[key] = value; },
        sendMidiCC: sendMidiCCSpy,
        window: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

(async () => {
    console.log('== Case: value=0 (biên) -> KHÔNG fallback về midiMap.value tĩnh ==');
    {
        const calls = [];
        const sandbox = buildSandbox({
            mapping: { kind: 'cc', channel: 1, number: 20, value: 127 }, // giá trị TĨNH cố ý khác 0 để phát hiện nếu code lỡ fallback sai
            sendMidiCCSpy: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
        });
        await sandbox.executeAction('TEST_ACTION', { value: 0 });
        assert(calls.length === 1, 'sendMidiCC được gọi đúng 1 lần');
        assert(calls[0].val === 0, `gửi ĐÚNG value=0 động, KHÔNG fallback về midiMap.value=127 tĩnh (thực tế gửi: ${calls[0].val})`);
    }

    console.log('\n== Case: value hợp lệ khác (vd 55) -> dùng đúng giá trị động, không phải giá trị tĩnh ==');
    {
        const calls = [];
        const sandbox = buildSandbox({
            mapping: { kind: 'cc', channel: 1, number: 20, value: 10 },
            sendMidiCCSpy: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
        });
        await sandbox.executeAction('TEST_ACTION', { value: 55 });
        assert(calls[0].val === 55, `gửi đúng value=55 động, không phải value=10 tĩnh đã cấu hình (thực tế: ${calls[0].val})`);
    }

    console.log('\n== Case: KHÔNG truyền context.value (Button cũ, vd CLAP) -> vẫn dùng đúng midiMap.value tĩnh như trước B6/B7 (backward-compat) ==');
    {
        const calls = [];
        const sandbox = buildSandbox({
            mapping: { kind: 'cc', channel: 1, number: 20, value: 42 },
            sendMidiCCSpy: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
        });
        await sandbox.executeAction('TEST_ACTION', { reason: 'menu-button' }); // không có .value, giống hệt lời gọi Button thật
        assert(calls[0].val === 42, `không có context.value -> dùng đúng midiMap.value=42 tĩnh, hành vi Button KHÔNG đổi (thực tế: ${calls[0].val})`);
    }

    console.log('\n== Case: giá trị 0-100 từ Knob được gửi NGUYÊN VĂN, KHÔNG tự scale sang 0-127 (ghi nhận hành vi thật, không phải quyết định của B7) ==');
    {
        const calls = [];
        const sandbox = buildSandbox({
            mapping: { kind: 'cc', channel: 1, number: 20, value: 127 },
            sendMidiCCSpy: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
        });
        await sandbox.executeAction('TEST_ACTION', { value: 100 }); // knob max = 100
        assert(calls[0].val === 100, `Knob giá trị 100 (max) được gửi nguyên văn là 100, KHÔNG tự đổi thành 127 (thực tế: ${calls[0].val}) — CẦN QUYẾT ĐỊNH từ Khói xem có nên scale không, xem TASK_B5_REPORT.md Mục 7`);
    }

    console.log('\n== Case: Beat rồi Master gọi liên tiếp -> không chia sẻ dynamic state, mỗi lần dùng đúng mapping/value của chính nó ==');
    {
        const calls = [];
        const store = {
            selectedDAW: 'studio_one',
            dawMidiOutMappings: { studio_one: {
                BEAT_INPUT_VOLUME: { kind: 'cc', channel: 1, number: 20, value: 0 },
                MASTER_OUTPUT_VOLUME: { kind: 'cc', channel: 2, number: 30, value: 0 },
            } },
        };
        const sandbox = {
            console,
            getSetting: (key) => store[key],
            setSetting: (key, value) => { store[key] = value; },
            sendMidiCC: async (num, val, ch) => { calls.push({ num, val, ch }); return true; },
            window: {},
        };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);
        await sandbox.executeAction('BEAT_INPUT_VOLUME', { value: 33 });
        await sandbox.executeAction('MASTER_OUTPUT_VOLUME', { value: 77 });
        assert(calls.length === 2, `đúng 2 lần gửi (thực tế: ${calls.length})`);
        assert(calls[0].num === 20 && calls[0].val === 33, `Beat gửi đúng CC 20 với value 33 (thực tế: CC${calls[0].num}=${calls[0].val})`);
        assert(calls[1].num === 30 && calls[1].val === 77, `Master gửi đúng CC 30 với value 77, không lẫn với Beat (thực tế: CC${calls[1].num}=${calls[1].val})`);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
