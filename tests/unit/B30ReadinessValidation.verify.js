/**
 * B30ReadinessValidation.verify.js — TASK B30.1 / B30.2
 * ---------------------------------------------------------------------------
 * Bug tìm thấy trong B29 audit, sửa ở B30:
 *
 * 1) MIDI dashboard pill (2 vị trí trong ui/js/setup.js) chỉ kiểm tra
 *    midiOutputPort có khác chuỗi rỗng hay không — KHÔNG biết cổng đã lưu có
 *    còn trong danh sách MIDI thật hay không. Fix: getMidiDashboardPillState()
 *    (appSettings.js) là NGUỒN DUY NHẤT, đọc thêm __midiPortAvailabilityHint
 *    do setup.js set qua setMidiPortAvailabilityHint().
 *
 * 2) getSetupReadinessChecklist() mục "selectedBrowser" chỉ kiểm tra 2 chuỗi
 *    khác rỗng — KHÔNG biết file .exe đã lưu có còn tồn tại trên đĩa hay
 *    không. Fix: setBrowserPathAvailabilityHint() do setup.js set sau khi
 *    gọi thật window.electronAPI.checkPathExists() (IPC mới, app/main.js).
 *
 * Test này chạy TRỰC TIẾP code thật trích từ appSettings.js — không mock lại
 * logic, không cần jsdom/electron (module chỉ dùng getSetting/setSetting).
 *
 * Chạy: node tests/unit/B30ReadinessValidation.verify.js
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
function extractVarDecl(source, name) {
    const start = source.indexOf(`let ${name}`);
    if (start === -1) throw new Error(`Không tìm thấy biến ${name}`);
    const end = source.indexOf(';', start) + 1;
    return source.slice(start, end);
}

const appSettingsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'appSettings.js'), 'utf8');

function buildSandbox(initialSettings) {
    const store = { ...initialSettings };
    const sandbox = {
        console,
        getSetting: (key, fallback) => {
            const v = store[key];
            return v != null && v !== '' ? v : fallback;
        },
        setSetting: (key, value) => { store[key] = value; },
    };
    vm.createContext(sandbox);
    const code = [
        extractVarDecl(appSettingsSrc, '__soundcardAvailabilityHint'),
        extractFn(appSettingsSrc, 'setSoundcardAvailabilityHint'),
        extractVarDecl(appSettingsSrc, '__browserPathAvailabilityHint'),
        extractFn(appSettingsSrc, 'setBrowserPathAvailabilityHint'),
        extractVarDecl(appSettingsSrc, '__midiPortAvailabilityHint'),
        extractFn(appSettingsSrc, 'setMidiPortAvailabilityHint'),
        extractFn(appSettingsSrc, 'getMidiDashboardPillState'),
        extractFn(appSettingsSrc, 'getCoordinateProfile'),
        extractFn(appSettingsSrc, 'getCoordinate'),
        extractFn(appSettingsSrc, 'getSetupReadinessChecklist'),
        extractFn(appSettingsSrc, 'countSetupReady'),
        extractFn(appSettingsSrc, 'isSetupFullyComplete'),
    ].join('\n\n');
    vm.runInContext(code, sandbox);
    return sandbox;
}

console.log('===== B30.1 — MIDI dashboard pill =====');

console.log('\n== Case 1: chưa biết availability (hint=null) -> không breaking behavior (giữ như trước B30) ==');
{
    const s = buildSandbox({ midiOutputPort: 'AUTO MENU AI' });
    const state = s.getMidiDashboardPillState();
    assert(state.text === 'Đã cấu hình', `pill vẫn "Đã cấu hình" khi chưa từng so khớp danh sách thật (thực tế: ${state.text})`);
    assert(state.className.includes('--ok'), 'class vẫn --ok khi hint chưa biết (không breaking change)');
}

console.log('\n== Case 2: saved port CÓ trong ports thật (hint=true) -> READY ==');
{
    const s = buildSandbox({ midiOutputPort: 'AUTO MENU AI' });
    s.setMidiPortAvailabilityHint(true);
    const state = s.getMidiDashboardPillState();
    assert(state.text === 'Đã cấu hình', `pill "Đã cấu hình" khi port còn tồn tại thật (thực tế: ${state.text})`);
    assert(state.className.includes('--ok'), 'class --ok khi port hợp lệ');
}

console.log('\n== Case 3: saved port KHÔNG có trong ports thật (hint=false) -> NOT READY, cảnh báo rõ ==');
{
    const s = buildSandbox({ midiOutputPort: 'loopMIDI Port (đã gỡ)' });
    s.setMidiPortAvailabilityHint(false);
    const state = s.getMidiDashboardPillState();
    assert(state.text.includes('không khả dụng'), `pill cảnh báo đúng khi port đã lưu không còn thật (thực tế: ${state.text})`);
    assert(state.className.includes('--error'), 'class --error (đã có sẵn trong CSS, không thêm class mới) khi port không hợp lệ');
    assert(!state.className.includes('--ok'), 'KHÔNG còn dùng nhầm class --ok khi port không hợp lệ');
}

console.log('\n== Case 3b: chưa cấu hình gì (rỗng) -> luôn "Chưa cấu hình" bất kể hint gì ==');
{
    const s = buildSandbox({});
    s.setMidiPortAvailabilityHint(true); // hint không liên quan vì chưa chọn port nào
    const state = s.getMidiDashboardPillState();
    assert(state.text === 'Chưa cấu hình', `pill đúng "Chưa cấu hình" khi chưa lưu port nào (thực tế: ${state.text})`);
    assert(state.className.includes('--dim'), 'class --dim khi chưa cấu hình');
}

console.log('\n== Case 3c: 2 vị trí cập nhật pill dùng chung 1 nguồn — xác nhận qua chữ ký hàm ==');
{
    // Không thể "chạy" cả setup.js (cần DOM), nhưng xác nhận bằng grep rằng CẢ 2 nơi
    // (updateDashboardMidiPill và saveBtn._hasMidiPillPatch) đều gọi getMidiDashboardPillState().
    const setupSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'setup.js'), 'utf8');
    const callSites = (setupSrc.match(/const state = getMidiDashboardPillState\(\);/g) || []).length;
    assert(callSites === 2, `getMidiDashboardPillState() được GỌI (không tính comment) đúng ở CẢ 2 vị trí cập nhật pill trong setup.js (thực tế: ${callSites} lần)`);
    assert(!setupSrc.includes('dashMidiPill.className = "status-pill status-pill--ok"'), 'vị trí monkey-patch (~1465) không còn tự set class riêng — đã dùng chung state.className');
}

console.log('\n===== B30.2 — Browser path readiness =====');

console.log('\n== Case 4: chưa có path -> chưa READY ==');
{
    const s = buildSandbox({ selectedBrowser: 'brave' }); // chưa có selectedBrowserPath
    const item = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedBrowser');
    assert(item.ready === false, `chưa ready khi thiếu path (thực tế: ${item.ready})`);
}

console.log('\n== Case 5: path tồn tại (hint=true) -> READY ==');
{
    const s = buildSandbox({ selectedBrowser: 'brave', selectedBrowserPath: 'C:\\Brave\\brave.exe' });
    s.setBrowserPathAvailabilityHint(true);
    const item = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedBrowser');
    assert(item.ready === true, `ready khi path đã xác nhận tồn tại thật (thực tế: ${item.ready})`);
    assert(s.isSetupFullyComplete() === false, 'isSetupFullyComplete() vẫn false vì các mục khác (DAW, coordinate...) chưa cấu hình trong test này — không liên quan Browser');
}

console.log('\n== Case 6: path KHÔNG còn tồn tại (hint=false) -> NOT READY, isSetupFullyComplete()=false ==');
{
    const s = buildSandbox({
        selectedBrowser: 'brave', selectedBrowserPath: 'C:\\Brave\\brave.exe',
        selectedDAW: 'studio_one', selectedAutoKey: 'x', selectedAutoTune: 'y', selectedSoundcard: 'z',
    });
    s.setSoundcardAvailabilityHint(true);
    s.setCoordinate = undefined; // không cần, chỉ set coordinateProfiles trực tiếp cho gọn
    const store = { coordinateProfiles: { studio_one: { autokey1: '1,1', autokey2: '2,2', autotunekey: '3,3', chromatic: '4,4' } } };
    Object.assign(store, {
        selectedBrowser: 'brave', selectedBrowserPath: 'C:\\Brave\\brave.exe',
        selectedDAW: 'studio_one', selectedAutoKey: 'x', selectedAutoTune: 'y', selectedSoundcard: 'z',
    });
    const s2 = buildSandbox(store);
    s2.setSoundcardAvailabilityHint(true);
    s2.setBrowserPathAvailabilityHint(false); // file đã bị xoá/di chuyển — đã xác nhận qua checkPathExists()

    const item = s2.getSetupReadinessChecklist().find((x) => x.key === 'selectedBrowser');
    assert(item.ready === false, `KHÔNG ready khi đã xác nhận file không còn tồn tại (thực tế: ${item.ready}) — trước B30 chỗ này SAI là true`);
    assert(s2.isSetupFullyComplete() === false, 'isSetupFullyComplete()=false vì Browser không còn hợp lệ, dù mọi mục khác đã xong');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
