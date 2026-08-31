/**
 * B32SetupReadinessConsistency.verify.js — TASK B32
 * ---------------------------------------------------------------------------
 * B32 là audit consistency, không phải feature mới. Các case Browser/MIDI theo
 * từng-item (A-G) ĐÃ có bằng chứng thật ở B30ReadinessValidation.verify.js và
 * B31ReadinessHardening.verify.js — KHÔNG lặp lại ở đây để tránh test trùng.
 *
 * File này chỉ chứng minh phần B32 THỰC SỰ CHƯA CÓ bằng chứng trực tiếp trước đó:
 * các cross-function invariant (B32.5), đặc biệt Invariant 3+4 — MIDI dashboard
 * pill hint (__midiPortAvailabilityHint) không được rò rỉ vào
 * getSetupReadinessChecklist()/countSetupReady()/isSetupFullyComplete() theo BẤT
 * KỲ hướng nào (không làm tăng, không làm giảm X/9) — đây là điều B26-B31 chưa
 * từng viết test trực tiếp khẳng định, chỉ đúng "tình cờ" vì code checklist không
 * tham chiếu biến đó.
 *
 * Chạy code thật (appSettings.js), không mock lại logic.
 * Chạy: node tests/unit/B32SetupReadinessConsistency.verify.js
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
        getSetting: (key, fallback) => { const v = store[key]; return v != null && v !== '' ? v : fallback; },
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

// Bộ setting làm mọi mục trong 9-item checklist đều READY (baseline "hoàn tất 9/9")
const FULLY_READY_SETTINGS = {
    selectedDAW: 'studio_one',
    selectedAutoKey: 'x',
    selectedAutoTune: 'y',
    selectedSoundcard: 'Focusrite 2i2',
    selectedBrowser: 'brave',
    selectedBrowserPath: 'C:\\Brave\\brave.exe',
    coordinateProfiles: { studio_one: { autokey1: '1,1', autokey2: '2,2', autotunekey: '3,3', chromatic: '4,4' } },
};

console.log('===== B32.2 — Readiness matrix: xác nhận đúng 9 mục, không thiếu/thừa =====');
{
    const s = buildSandbox({});
    const keys = s.getSetupReadinessChecklist().map((x) => x.key);
    const expected = ['selectedDAW', 'selectedAutoKey', 'selectedAutoTune', 'selectedSoundcard', 'selectedBrowser', 'autokey1', 'autokey2', 'autotunekey', 'chromatic'];
    assert(keys.length === 9, `checklist có đúng 9 mục (thực tế: ${keys.length})`);
    assert(JSON.stringify(keys) === JSON.stringify(expected), `đúng thứ tự/tên 9 mục như hợp đồng hiện tại (thực tế: ${JSON.stringify(keys)})`);
    assert(!keys.includes('midiOutputPort'), 'KHÔNG có mục MIDI nào trong checklist — đúng chỉ định B32 "không đưa MIDI vào X/9"');
}

console.log('\n===== B32.5 — Invariant 3 & 4: MIDI hint (mọi giá trị) KHÔNG được rò rỉ vào X/9 =====');
{
    for (const midiHint of [null, true, false]) {
        const s = buildSandbox(FULLY_READY_SETTINGS);
        s.setSoundcardAvailabilityHint(true);
        s.setBrowserPathAvailabilityHint(true);
        if (midiHint !== null) s.setMidiPortAvailabilityHint(midiHint);
        // Trạng thái baseline (không set midiOutputPort setting): 9/9, isSetupFullyComplete()=true
        assert(s.countSetupReady() === 9, `midiHint=${midiHint}: countSetupReady() vẫn = 9 (không đổi vì hint MIDI) (thực tế: ${s.countSetupReady()})`);
        assert(s.isSetupFullyComplete() === true, `midiHint=${midiHint}: isSetupFullyComplete() vẫn true, không bị hint MIDI chi phối`);
    }

    // Đảo ngược: baseline 8/9 (thiếu AutoKey — 1 mục lá, không cascade sang mục khác, khác với
    // xoá selectedDAW sẽ kéo theo cả 4 mục coordinate vì chúng scope theo DAW từ B25) — hint MIDI
    // cũng không được "cứu" nó thành 9/9
    for (const midiHint of [null, true, false]) {
        const incomplete = { ...FULLY_READY_SETTINGS };
        delete incomplete.selectedAutoKey;
        const s = buildSandbox(incomplete);
        s.setSoundcardAvailabilityHint(true);
        s.setBrowserPathAvailabilityHint(true);
        if (midiHint !== null) s.setMidiPortAvailabilityHint(midiHint);
        assert(s.countSetupReady() === 8, `midiHint=${midiHint}, thiếu AutoKey: vẫn đúng 8/9, hint MIDI không "cứu" thành 9/9 (thực tế: ${s.countSetupReady()})`);
        assert(s.isSetupFullyComplete() === false, `midiHint=${midiHint}, thiếu AutoKey: isSetupFullyComplete() vẫn false`);
    }
}

console.log('\n===== B32.5 — Invariant khác: đảo chiều, MIDI pill KHÔNG bị readiness khác (Soundcard/Browser) chi phối ngược lại =====');
{
    const s = buildSandbox({ midiOutputPort: 'AUTO MENU AI' });
    s.setMidiPortAvailabilityHint(true);
    // Cố tình để Soundcard/Browser hint=false (NOT READY) — pill MIDI vẫn phải độc lập, không bị kéo theo
    s.setSoundcardAvailabilityHint(false);
    s.setBrowserPathAvailabilityHint(false);
    const midiState = s.getMidiDashboardPillState();
    assert(midiState.className.includes('--ok'), `pill MIDI vẫn "Đã cấu hình" dù Soundcard/Browser đang NOT READY — 3 hint độc lập nhau, không có coupling chéo (thực tế: ${midiState.text})`);
}

console.log('\n===== B32.5 — Invariant 1 & 2 (đã có bằng chứng ở B30/B31, xác nhận lại 1 lần nữa cho đủ bộ invariant B32 liệt kê) =====');
{
    // Invariant 1: Browser=false => isSetupFullyComplete() !== true
    const s1 = buildSandbox(FULLY_READY_SETTINGS);
    s1.setSoundcardAvailabilityHint(true);
    s1.setBrowserPathAvailabilityHint(false);
    assert(s1.isSetupFullyComplete() !== true, 'Invariant 1: Browser=false thì isSetupFullyComplete() không bao giờ true, kể cả 8 mục khác đã xong');

    // Invariant 2: Browser=true nhưng mục khác chưa ready => vẫn false
    const incomplete = { ...FULLY_READY_SETTINGS };
    delete incomplete.selectedSoundcard;
    const s2 = buildSandbox(incomplete);
    s2.setBrowserPathAvailabilityHint(true);
    assert(s2.isSetupFullyComplete() === false, 'Invariant 2: Browser=true không đủ để isSetupFullyComplete()=true nếu Soundcard chưa cấu hình');
}

console.log('\n===== B32.5 — Invariant 6: IPC/enumeration failure luôn ngả về false/NOT READY, không bao giờ ngả về true =====');
{
    // hint=null (== "không biết", tương đương trạng thái trước khi từng gọi IPC/enumerate) trên 1
    // bộ CHƯA từng cấu hình gì (không phải trường hợp "đã lưu string cũ") phải luôn tính là chưa
    // ready — không có đường nào khiến "chưa biết" tự suy ra "READY".
    const s = buildSandbox({});
    const item = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedBrowser');
    assert(item.ready === false, 'hint=null + chưa từng cấu hình gì => luôn false, không có nhánh nào tự suy ra true từ "chưa biết"');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
