/**
 * SettingsPersistenceRoundtrip.verify.js — TASK B14 Mục 4/5
 * ---------------------------------------------------------------------------
 * Mục 4 — mô phỏng đúng pipeline thật: Setup ghi (setDawMidiOutMapping, ui/js/setup.js) ->
 * "save" (giả lập ghi file) -> "reload" (module state mới, đọc lại từ "file") -> Runtime đọc
 * (getMidiOutMapping, ui/js/actionRegistry.js) — xác nhận dữ liệu Setup ghi THẬT SỰ tới được
 * Runtime qua chung 1 key persisted, không phải 2 cơ chế tách rời tình cờ giống nhau.
 *
 * Mục 5 — Beat/Master vẫn độc lập ngay cả khi CÙNG CC nhưng KHÁC channel.
 *
 * Chạy: node tests/unit/SettingsPersistenceRoundtrip.verify.js
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

function extractFn(source, name) {
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
function extractConst(source, name, closer) {
    const s = source.indexOf(`const ${name}`);
    const e = source.indexOf(closer, s) + closer.length;
    return source.slice(s, e);
}

const setupSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'setup.js'), 'utf8');
const actionRegSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'actionRegistry.js'), 'utf8');

const setupSideCode = [
    extractFn(setupSrc, 'getDawMidiOutMapping'),
    extractFn(setupSrc, 'setDawMidiOutMapping'),
].join('\n\n');

const runtimeSideCode = [
    extractConst(actionRegSrc, 'ACTIONS', '});'),
    extractConst(actionRegSrc, 'ACTION_STATUS', '});'),
    extractConst(actionRegSrc, 'ACTION_COORDINATE_KEY', '});'),
    extractFn(actionRegSrc, 'getSelectedDaw'),
    extractFn(actionRegSrc, 'getMidiOutMapping'),
    extractFn(actionRegSrc, 'getMouseCoordinate'),
    extractFn(actionRegSrc, 'isMouseControlEnabled'),
    extractFn(actionRegSrc, 'getActionStatus'),
    extractFn(actionRegSrc, 'executeAction'),
].join('\n\n');

/**
 * "diskFile" mô phỏng file settings thật trên đĩa — CẢ setup-side lẫn runtime-side đều đọc/ghi
 * qua CÙNG 1 object này (giống thật: 1 file settings.json dùng chung), nhưng KHÔNG chia sẻ
 * JS module state trực tiếp — mỗi lần "reload" phải đọc lại JSON.parse(JSON.stringify()) để mô
 * phỏng đúng việc process/renderer thật sự khởi động lại đọc lại dữ liệu từ đĩa, không phải
 * chỉ giữ tham chiếu object trong bộ nhớ.
 */
function makeDiskFile(initial) {
    let raw = JSON.stringify(initial);
    return {
        read: () => JSON.parse(raw),
        write: (obj) => { raw = JSON.stringify(obj); },
    };
}

function buildSetupSandbox(diskFile) {
    const sandbox = {
        console,
        getSetting: (key) => diskFile.read()[key],
        setSetting: (key, value) => { const d = diskFile.read(); d[key] = value; diskFile.write(d); },
    };
    vm.createContext(sandbox);
    vm.runInContext(setupSideCode, sandbox);
    return sandbox;
}
function buildRuntimeSandbox(diskFile, sendMidiCCSpy) {
    const sandbox = {
        console,
        getSetting: (key) => diskFile.read()[key],
        setSetting: (key, value) => { const d = diskFile.read(); d[key] = value; diskFile.write(d); },
        sendMidiCC: sendMidiCCSpy || (async () => true),
        window: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(runtimeSideCode, sandbox);
    return sandbox;
}

(async () => {
    console.log('== Test 1: Setup lưu mapping -> "reload" (đọc lại từ disk) -> Runtime đọc thấy đúng mapping ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
        const setup = buildSetupSandbox(disk);
        setup.setDawMidiOutMapping('BEAT_INPUT_VOLUME', { kind: 'cc', channel: 3, number: 15, value: 0 });

        const runtime = buildRuntimeSandbox(disk);
        const mapping = runtime.getMidiOutMapping('BEAT_INPUT_VOLUME');
        assert(mapping && mapping.number === 15 && mapping.channel === 3, `Runtime đọc đúng mapping Setup đã lưu sau "reload" (thực tế: ${JSON.stringify(mapping)})`);
    }

    console.log('\n== Test 2: Action chưa từng có mapping -> Runtime báo NOT_CONFIGURED thật (không giả PASS) ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
        const runtime = buildRuntimeSandbox(disk);
        const status = runtime.getActionStatus('MASTER_OUTPUT_VOLUME');
        assert(status.status === 'NOT_CONFIGURED', `NOT_CONFIGURED khi chưa từng lưu gì (thực tế: ${JSON.stringify(status)})`);
    }

    console.log('\n== Test 3: Mapping hợp lệ -> dispatch thật gọi đúng sendMidiCC ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
        const setup = buildSetupSandbox(disk);
        setup.setDawMidiOutMapping('MASTER_OUTPUT_VOLUME', { kind: 'cc', channel: 1, number: 7, value: 0 });
        const calls = [];
        const runtime = buildRuntimeSandbox(disk, async (num, val, ch) => { calls.push({ num, val, ch }); return true; });
        await runtime.executeAction('MASTER_OUTPUT_VOLUME', { value: 88 });
        assert(calls.length === 1 && calls[0].num === 7 && calls[0].val === 88, `dispatch thật đúng CC7=88 (thực tế: ${JSON.stringify(calls)})`);
    }

    console.log('\n== Test 4: Mapping bị xoá (Setup ghi lại rỗng) -> action trở lại NOT_CONFIGURED, KHÔNG giữ mapping cũ trong memory âm thầm ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
        const setup = buildSetupSandbox(disk);
        setup.setDawMidiOutMapping('RETUNE_SPEED_MIC1', { kind: 'cc', channel: 1, number: 22, value: 0 });
        const before = buildRuntimeSandbox(disk).getMidiOutMapping('RETUNE_SPEED_MIC1');
        assert(before !== null, 'mapping thực sự đã tồn tại trước khi xoá (tiền điều kiện hợp lệ)');

        setup.setDawMidiOutMapping('RETUNE_SPEED_MIC1', null);
        const runtimeAfter = buildRuntimeSandbox(disk);
        const status = runtimeAfter.getActionStatus('RETUNE_SPEED_MIC1');
        assert(status.status === 'NOT_CONFIGURED', `trở lại NOT_CONFIGURED sau khi xoá mapping (thực tế: ${JSON.stringify(status)})`);
    }

    console.log('\n== Mục 5: Beat = CC7/Channel A, Master = CC7/Channel B -> VẪN là 2 mapping độc lập, không gộp thành VOLUME ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one', dawMidiOutMappings: {} });
        const setup = buildSetupSandbox(disk);
        setup.setDawMidiOutMapping('BEAT_INPUT_VOLUME', { kind: 'cc', channel: 1, number: 7, value: 0 });
        setup.setDawMidiOutMapping('MASTER_OUTPUT_VOLUME', { kind: 'cc', channel: 2, number: 7, value: 0 });

        const calls = [];
        const runtime = buildRuntimeSandbox(disk, async (num, val, ch) => { calls.push({ num, val, ch }); return true; });
        await runtime.executeAction('BEAT_INPUT_VOLUME', { value: 30 });
        await runtime.executeAction('MASTER_OUTPUT_VOLUME', { value: 60 });

        assert(calls.length === 2, `2 lần dispatch riêng biệt dù cùng CC (thực tế: ${calls.length})`);
        assert(calls[0].num === 7 && calls[0].ch === 0 && calls[0].val === 30, `Beat: CC7, channel index 0 (=channel 1 user-facing), value=30 (thực tế: ${JSON.stringify(calls[0])})`);
        assert(calls[1].num === 7 && calls[1].ch === 1 && calls[1].val === 60, `Master: CC7, channel index 1 (=channel 2 user-facing), value=60 — KHÁC channel với Beat dù cùng CC (thực tế: ${JSON.stringify(calls[1])})`);
        const beatMap = runtime.getMidiOutMapping('BEAT_INPUT_VOLUME');
        const masterMap = runtime.getMidiOutMapping('MASTER_OUTPUT_VOLUME');
        assert(beatMap.channel === 1 && masterMap.channel === 2, 'getMidiOutMapping trả đúng 2 entry riêng, không gộp');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
