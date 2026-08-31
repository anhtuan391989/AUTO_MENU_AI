/**
 * B31ReadinessHardening.verify.js — TASK B31
 * ---------------------------------------------------------------------------
 * B31 là hardening/integration test cho 2 cơ chế B30 đã sửa (MIDI dashboard pill,
 * Browser path re-validation) — không đổi logic sản xuất mới, chỉ CHỨNG MINH bằng
 * test rằng các case B31 yêu cầu (transition, enumeration failure, IPC input rác)
 * đã đúng với code thật hiện có trong appSettings.js / app/main.js.
 *
 * GIỚI HẠN HARNESS (khai báo rõ theo yêu cầu B31 mục 8): môi trường test này KHÔNG
 * có DOM/jsdom và KHÔNG có Web MIDI API thật. Vì vậy:
 *   - Phần "MIDI enumeration" được test ở đúng lớp appSettings.js:listMidiOutputs()
 *     (hàm THẬT, không mock) bằng cách thay navigator.requestMIDIAccess giả lập ĐÚNG
 *     hợp đồng API thật (resolve/reject Promise) — không tự bịa kết quả.
 *   - Phần "hint transition" test trực tiếp setMidiPortAvailabilityHint()/
 *     getMidiDashboardPillState() (hàm thật) qua nhiều lần gọi liên tiếp, mô phỏng
 *     đúng thứ tự setup.js gọi (populatePorts() -> match -> setHint).
 *   - Phần IPC audit gọi TRỰC TIẾP handler thật trích từ app/main.js bằng fs thật
 *     trên file tạm — không mock fs.
 *
 * Chạy: node tests/unit/B31ReadinessHardening.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
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
const mainSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');

function buildMidiSandbox(navigatorMock, initialSettings) {
    const store = { ...initialSettings };
    const sandbox = {
        console,
        getSetting: (key, fallback) => { const v = store[key]; return v != null && v !== '' ? v : fallback; },
        setSetting: (key, value) => { store[key] = value; },
        navigator: navigatorMock,
    };
    vm.createContext(sandbox);
    const code = [
        'let midiAccessPromise = null;',
        extractFn(appSettingsSrc, 'getMidiAccess'),
        extractFn(appSettingsSrc, 'listMidiOutputs'),
        extractVarDecl(appSettingsSrc, '__midiPortAvailabilityHint'),
        extractFn(appSettingsSrc, 'setMidiPortAvailabilityHint'),
        extractFn(appSettingsSrc, 'getMidiDashboardPillState'),
    ].join('\n\n');
    vm.runInContext(code, sandbox);
    return sandbox;
}

function extractIpcHandler(source, channel) {
    const marker = `ipcMain.handle("${channel}", `;
    const start = source.indexOf(marker);
    if (start === -1) throw new Error(`Không tìm thấy handler ${channel}`);
    const fnStart = start + marker.length;
    const parenOpen = source.indexOf('(', fnStart);
    let pdepth = 0, j = parenOpen;
    for (; j < source.length; j++) { if (source[j] === '(') pdepth++; else if (source[j] === ')') { pdepth--; if (pdepth === 0) break; } }
    const braceIdx = source.indexOf('{', j);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    const fnBody = source.slice(fnStart, i + 1);
    return `(${fnBody})`;
}

(async () => {
console.log('===== B31.1 — MIDI real-port validation (lifecycle) =====');

console.log('\n== Case 1: chưa cấu hình (midiOutputPort="") -> pill "Chưa cấu hình", KHÔNG ready dù hint=true cũ còn sót ==');
{
    const s = buildMidiSandbox({}, {});
    s.setMidiPortAvailabilityHint(true); // giả lập hint cũ còn sót từ port TRƯỚC đó (nay đã xoá saved port)
    const state = s.getMidiDashboardPillState();
    assert(state.text === 'Chưa cấu hình', `Case A: portName rỗng luôn thắng, không bị hint cũ chi phối (thực tế: ${state.text})`);
    assert(state.className.includes('--dim'), 'class --dim đúng khi chưa cấu hình');
}

console.log('\n== Case 2: saved port match với ports thật -> READY (pill OK) ==');
{
    const s = buildMidiSandbox({}, { midiOutputPort: 'AUTO MENU AI' });
    s.setMidiPortAvailabilityHint(true);
    const state = s.getMidiDashboardPillState();
    assert(state.className.includes('--ok'), 'Case B: READY khi port đã lưu khớp danh sách thật');
}

console.log('\n== Case 3: saved port KHÔNG match -> NOT READY, pill cảnh báo ==');
{
    const s = buildMidiSandbox({}, { midiOutputPort: 'Cổng đã gỡ' });
    s.setMidiPortAvailabilityHint(false);
    const state = s.getMidiDashboardPillState();
    assert(state.className.includes('--error'), 'Case C: NOT READY khi port đã lưu không còn trong danh sách thật');
    assert(!state.className.includes('--ok'), 'Case C: không lẫn class OK');
}

console.log('\n== Case 4: enumeration THẬT SỰ thất bại (navigator.requestMIDIAccess không tồn tại) -> listMidiOutputs() không throw, trả [], KHÔNG tạo READY giả ==');
{
    const s = buildMidiSandbox({ /* không có requestMIDIAccess -> đúng contract "trình duyệt không hỗ trợ" */ }, { midiOutputPort: 'X' });
    const ports = await s.listMidiOutputs();
    assert(Array.isArray(ports) && ports.length === 0, `listMidiOutputs() fail-safe trả mảng rỗng, không throw (thực tế: ${JSON.stringify(ports)})`);
    // Mô phỏng đúng những gì setup.js làm: ports rỗng -> saved không match -> hint=false (KHÔNG PHẢI true)
    const match = ports.find((p) => p.name === 'X');
    s.setMidiPortAvailabilityHint(!!match);
    const state = s.getMidiDashboardPillState();
    assert(!state.className.includes('--ok'), 'enumeration thất bại KHÔNG được coi là "port exists" (không rơi vào nhánh --ok)');
}

console.log('\n== Case 4b: requestMIDIAccess() REJECT (thiết bị bị từ chối quyền truy cập) -> vẫn fail-safe, không crash ==');
{
    const s = buildMidiSandbox({ requestMIDIAccess: () => Promise.reject(new Error('User denied MIDI access')) }, { midiOutputPort: 'X' });
    let threw = false;
    let ports;
    try { ports = await s.listMidiOutputs(); } catch (e) { threw = true; }
    assert(threw === false, 'requestMIDIAccess() reject KHÔNG làm listMidiOutputs() throw ra ngoài (đã có try/catch)');
    assert(Array.isArray(ports) && ports.length === 0, 'trả mảng rỗng khi bị reject quyền truy cập, không crash Setup');
}

console.log('\n== Case 5 & 6: port RÚT ra rồi CẮM LẠI — hint phải chuyển false rồi lại true (không stale) ==');
{
    const s = buildMidiSandbox({}, { midiOutputPort: 'loopMIDI Port' });
    // Lần 1: port tồn tại thật
    s.setMidiPortAvailabilityHint(true);
    assert(s.getMidiDashboardPillState().className.includes('--ok'), 'lần 1: port tồn tại -> READY');

    // Lần 2: user rút dây, mở lại Setup / bấm Refresh -> re-enumerate thấy KHÔNG còn port này
    s.setMidiPortAvailabilityHint(false);
    assert(s.getMidiDashboardPillState().className.includes('--error'), 'Case 5 (port biến mất): chuyển đúng sang NOT READY, không giữ hint cũ (true)');

    // Lần 3: user cắm lại, bấm Refresh -> re-enumerate thấy CÓ port này trở lại
    s.setMidiPortAvailabilityHint(true);
    const finalState = s.getMidiDashboardPillState();
    assert(finalState.className.includes('--ok'), 'Case 6 (port quay lại): tự chuyển lại READY, KHÔNG bắt user phải xoá rồi chọn lại (thực tế: ' + finalState.text + ')');
}

console.log('\n== Case 7: stale hint transition đầy đủ null -> true -> false -> true, mỗi bước phản ánh đúng ngay lập tức ==');
{
    const s = buildMidiSandbox({}, { midiOutputPort: 'P' });
    assert(s.getMidiDashboardPillState().className.includes('--ok'), 'hint=null (chưa biết): giữ hành vi cũ trước B30 = OK (không breaking change)');
    s.setMidiPortAvailabilityHint(true);
    assert(s.getMidiDashboardPillState().className.includes('--ok'), 'hint=true: OK');
    s.setMidiPortAvailabilityHint(false);
    assert(s.getMidiDashboardPillState().className.includes('--error'), 'hint=false: chuyển ngay sang error, không trễ 1 nhịp');
    s.setMidiPortAvailabilityHint(true);
    assert(s.getMidiDashboardPillState().className.includes('--ok'), 'hint quay lại true: chuyển ngay lại OK, không kẹt ở error cũ');
}

console.log('\n===== B31.2 — Browser path real-filesystem validation (lifecycle) =====');
{
    const store = {};
    const sandbox = {
        console,
        getSetting: (key, fallback) => { const v = store[key]; return v != null && v !== '' ? v : fallback; },
        setSetting: (key, value) => { store[key] = value; },
    };
    vm.createContext(sandbox);
    vm.runInContext([
        extractVarDecl(appSettingsSrc, '__browserPathAvailabilityHint'),
        extractFn(appSettingsSrc, 'setBrowserPathAvailabilityHint'),
        extractVarDecl(appSettingsSrc, '__soundcardAvailabilityHint'),
        extractFn(appSettingsSrc, 'setSoundcardAvailabilityHint'),
        extractFn(appSettingsSrc, 'getCoordinateProfile'),
        extractFn(appSettingsSrc, 'getCoordinate'),
        extractFn(appSettingsSrc, 'getSetupReadinessChecklist'),
        extractFn(appSettingsSrc, 'isSetupFullyComplete'),
    ].join('\n\n'), sandbox);

    function browserItem() { return sandbox.getSetupReadinessChecklist().find((x) => x.key === 'selectedBrowser'); }

    console.log('\n== Case 8: chưa cấu hình browser/path -> NOT READY ==');
    assert(browserItem().ready === false, 'Case A: thiếu cả selectedBrowser lẫn path -> chưa ready');

    console.log('\n== Case 9: browser + path hợp lệ (đã checkPathExists=true) -> READY ==');
    store.selectedBrowser = 'brave'; store.selectedBrowserPath = 'C:\\Brave\\brave.exe';
    sandbox.setBrowserPathAvailabilityHint(true);
    assert(browserItem().ready === true, 'Case B: path đã xác nhận tồn tại thật -> ready');

    console.log('\n== Case 10: file bị XOÁ (setting cũ vẫn còn, checkPathExists trả false) -> NOT READY ngay, không giữ ready cũ ==');
    sandbox.setBrowserPathAvailabilityHint(false);
    assert(browserItem().ready === false, 'Case C: chuyển ngay NOT READY khi file đã xoá, dù setting string vẫn còn nguyên');

    console.log('\n== Case 11: file bị DI CHUYỂN (path cũ không còn tồn tại — cùng cơ chế existsSync=false như Case 10) ==');
    // Về mặt code, "moved" và "deleted" đều khiến fs.existsSync(oldPath) === false — cùng 1 nhánh xử lý,
    // không có cách nào (và không cần) phân biệt 2 trường hợp này ở tầng Setup.
    store.selectedBrowserPath = 'C:\\OldFolder\\brave.exe'; // path cũ, đã "move" sang chỗ khác
    sandbox.setBrowserPathAvailabilityHint(false);
    assert(browserItem().ready === false, 'Case D: path bị move -> existsSync(path cũ)=false -> NOT READY, đúng như Case C');

    console.log('\n== Case 12: stale hint transition true -> false -> true cho Browser (giống MIDI, không kẹt trạng thái cũ) ==');
    sandbox.setBrowserPathAvailabilityHint(true);
    assert(browserItem().ready === true, 'true: ready');
    sandbox.setBrowserPathAvailabilityHint(false);
    assert(browserItem().ready === false, 'false: not ready ngay');
    sandbox.setBrowserPathAvailabilityHint(true);
    assert(browserItem().ready === true, 'quay lại true: ready lại ngay, không kẹt ở false cũ');

    console.log('\n== Case 13 — Integration: isSetupFullyComplete() không bao giờ READY giả khi Browser hint=false, kể cả khi mọi mục khác đã xong ==');
    Object.assign(store, {
        selectedDAW: 'studio_one', selectedAutoKey: 'x', selectedAutoTune: 'y', selectedSoundcard: 'z',
        coordinateProfiles: { studio_one: { autokey1: '1,1', autokey2: '2,2', autotunekey: '3,3', chromatic: '4,4' } },
    });
    sandbox.setSoundcardAvailabilityHint(true);
    sandbox.setBrowserPathAvailabilityHint(false);
    assert(sandbox.isSetupFullyComplete() === false, 'mọi mục khác đã xong nhưng Browser path không hợp lệ -> vẫn KHÔNG được báo hoàn tất');

    sandbox.setBrowserPathAvailabilityHint(true);
    assert(sandbox.isSetupFullyComplete() === true, 'khi Browser path hợp lệ trở lại (mọi thứ khác đã sẵn) -> đúng là hoàn tất thật');

    console.log('\n== Case: Browser "path tồn tại nhưng không phải file thực thi hợp lệ" — GHI RÕ GIỚI HẠN theo yêu cầu B31 mục 4 ==');
    console.log('  GHI CHÚ: hợp đồng hiện tại của Setup (từ B25 tới B30) chỉ yêu cầu "file .exe đã chọn còn');
    console.log('  tồn tại trên đĩa" (fs.existsSync), KHÔNG xác thực đây có đúng là 1 executable Windows hợp');
    console.log('  lệ (PE header, chữ ký số, quyền chạy...). B31 GIỮ NGUYÊN đúng hợp đồng này — dialog chọn file');
    console.log('  (window.electronAPI.selectFile) đã lọc extension .exe từ trước, và việc thẩm định sâu hơn');
    console.log('  (executable validation nâng cao) không thuộc yêu cầu B25-B30 và KHÔNG được B31 tự thêm.');
}

console.log('\n===== B31.5 — IPC security audit: check-path-exists =====');
{
    const handlerSrc = extractIpcHandler(mainSrc, 'check-path-exists');
    const sandbox = { console, fs, require };
    vm.createContext(sandbox);
    const handler = vm.runInContext(handlerSrc, sandbox);

    const tmpFile = path.join(os.tmpdir(), `b31-ipc-audit-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'x');

    try {
        assert(handler({}, tmpFile) === true, 'file thật tồn tại -> true');
        assert(handler({}, tmpFile + '.does-not-exist') === false, 'file không tồn tại -> false (không throw)');
        assert(handler({}, null) === false, 'input null -> false, không crash main process');
        assert(handler({}, undefined) === false, 'input undefined -> false, không crash');
        assert(handler({}, '') === false, 'chuỗi rỗng -> false');
        assert(handler({}, 12345) === false, 'input là số (sai kiểu) -> false, không throw TypeError ra ngoài');
        assert(handler({}, { path: tmpFile }) === false, 'input là object lạ -> false, không throw');
        assert(handler({}, ['a', 'b']) === false, 'input là array -> false, không throw');
        assert(handler({}, '\0invalid\0path') === false, 'path chứa null byte (input độc hại điển hình) -> false, không throw ra ngoài');
        assert(typeof handler({}, tmpFile) === 'boolean', 'return type LUÔN là boolean thuần (không rò rỉ nội dung path/thông tin fs khác)');
    } finally {
        fs.unlinkSync(tmpFile);
    }

    // Audit tĩnh: handler không được là 1 generic filesystem service (không đọc nội dung, không list dir, không ghi)
    const rawHandlerText = handlerSrc;
    assert(!/readFileSync|writeFileSync|readdirSync|unlinkSync|rmSync/.test(rawHandlerText), 'handler CHỈ gọi existsSync — không có bất kỳ thao tác đọc/ghi/xoá file nào khác (không phải generic FS service)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
})();

