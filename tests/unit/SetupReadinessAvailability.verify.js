/**
 * SetupReadinessAvailability.verify.js — TASK B26.2 (regression)
 * ---------------------------------------------------------------------------
 * Bug tìm thấy trong B26 audit: getSetupReadinessChecklist() (ui/js/appSettings.js)
 * trước đây chỉ kiểm tra "đã lưu 1 tên soundcard nào đó chưa" — KHÔNG biết thiết bị
 * đó còn tồn tại thật trên máy hay không. Kết quả: Setup progress ("X/9") có thể báo
 * ĐÃ SẴN SÀNG dù panel Soundcard đang hiện cảnh báo "⚠ Audio Interface không khả dụng"
 * (device đã rút dây/đổi driver) — đúng loại lỗi B26.2 liệt kê: "cấu hình cũ nhưng
 * device không còn tồn tại".
 *
 * Fix: setSoundcardAvailabilityHint(bool) — do setup.js gọi MỖI khi nó thực sự
 * enumerate lại danh sách thiết bị thật (populateSoundcardOptions() -> foundInRealList,
 * dữ liệu đã sẵn có, không enumerate thêm lần nào mới). getSetupReadinessChecklist()
 * đọc hint này; mặc định null ("chưa biết") để KHÔNG đổi hành vi cũ trước khi Setup
 * từng mở enumerate device 1 lần nào.
 *
 * Test này chạy TRỰC TIẾP code thật (appSettings.js), không mock lại logic.
 *
 * Chạy: node tests/unit/SetupReadinessAvailability.verify.js
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
    // Trích nguyên dòng "let __x = ...;" — cần cho state module-level mà setSoundcardAvailabilityHint()/
    // getSetupReadinessChecklist() cùng đóng (closure) trong file thật.
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
    // Chạy ĐÚNG các khai báo thật, giữ nguyên closure giữa biến hint và 2 hàm dùng nó —
    // không copy lại logic tay, tránh test giả (test đúng code KHÁC với code thật).
    const code = [
        extractVarDecl(appSettingsSrc, '__soundcardAvailabilityHint'),
        extractFn(appSettingsSrc, 'setSoundcardAvailabilityHint'),
        extractFn(appSettingsSrc, 'getCoordinateProfile'),
        extractFn(appSettingsSrc, 'getCoordinate'),
        extractFn(appSettingsSrc, 'getSetupReadinessChecklist'),
        extractFn(appSettingsSrc, 'countSetupReady'),
        extractFn(appSettingsSrc, 'isSetupFullyComplete'),
    ].join('\n\n');
    vm.runInContext(code, sandbox);
    return sandbox;
}

console.log('== Case 1 (hành vi CŨ vẫn giữ nguyên): chưa từng enumerate thiết bị -> tin tên đã lưu như trước (không breaking change) ==');
{
    const s = buildSandbox({ selectedSoundcard: 'Focusrite 2i2' });
    const list = s.getSetupReadinessChecklist();
    const item = list.find((x) => x.key === 'selectedSoundcard');
    assert(item.ready === true, `soundcard vẫn ready khi chưa từng gọi setSoundcardAvailabilityHint() — giữ nguyên hành vi cũ (thực tế: ${item.ready})`);
}

console.log('\n== Case 2 (BUG ĐÃ SỬA): đã enumerate và biết chắc device KHÔNG còn tồn tại -> KHÔNG được báo ready ==');
{
    const s = buildSandbox({ selectedSoundcard: 'Focusrite 2i2' });
    s.setSoundcardAvailabilityHint(false); // giống setup.js gọi sau khi populateSoundcardOptions() thấy foundInRealList=false
    const list = s.getSetupReadinessChecklist();
    const item = list.find((x) => x.key === 'selectedSoundcard');
    assert(item.ready === false, `soundcard KHÔNG ready khi đã biết chắc device đã lưu không còn tồn tại thật (thực tế: ${item.ready}) — trước fix B26.2 chỗ này SAI là true`);
    assert(s.isSetupFullyComplete() === false, 'isSetupFullyComplete() cũng phải trả về false — không báo Setup "READY" giả toàn cục');
}

console.log('\n== Case 3: device tồn tại thật (đã enumerate và match) -> vẫn ready bình thường ==');
{
    const s = buildSandbox({ selectedSoundcard: 'Focusrite 2i2' });
    s.setSoundcardAvailabilityHint(true);
    const item = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedSoundcard');
    assert(item.ready === true, 'soundcard vẫn ready khi đã xác nhận device tồn tại thật (không báo sai chiều ngược lại)');
}

console.log('\n== Case 4: chưa từng chọn soundcard nào -> luôn "chưa ready", bất kể hint gì (không đọc nhầm hint cũ) ==');
{
    const s = buildSandbox({}); // không có selectedSoundcard
    s.setSoundcardAvailabilityHint(true); // hint "còn tồn tại" nhưng KHÔNG liên quan vì chưa chọn gì
    const item = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedSoundcard');
    assert(item.ready === false, 'chưa chọn soundcard nào thì luôn KHÔNG ready, hint không tự tạo ra 1 lựa chọn không có thật');
}

console.log('\n== Case 5: setSoundcardAvailabilityHint() với giá trị rác -> reset về null (an toàn, không throw) ==');
{
    const s = buildSandbox({ selectedSoundcard: 'X' });
    s.setSoundcardAvailabilityHint(undefined);
    const item1 = s.getSetupReadinessChecklist().find((x) => x.key === 'selectedSoundcard');
    assert(item1.ready === true, 'giá trị không phải true/false -> coi như null (chưa biết), giữ hành vi cũ, không throw');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
