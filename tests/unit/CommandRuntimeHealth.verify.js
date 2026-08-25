/**
 * CommandRuntimeHealth.verify.js — MIDI-MASTER-01 Phase 1
 * ---------------------------------------------------------------------------
 * KHÔNG phải hardware test thật (không có thiết bị MIDI vật lý / Electron GUI trong môi
 * trường chạy test này). Đây là test LOGIC ở tầng Node: mock module 'easymidi' để mô phỏng
 * các nhánh: không có port, mở port thành công, mở port lỗi, đổi port (reconnect), đóng port.
 * Mục đích: xác nhận getHealth()/reopenOutputDriver() PHẢN ÁNH ĐÚNG state nội bộ, KHÔNG xác
 * nhận rằng easymidi/RtMidi thật trên máy Windows có DAW/loopMIDI hoạt động đúng — việc đó
 * cần Phase 11 (Hardware Test) trên máy thật, ngoài phạm vi môi trường sandbox này.
 *
 * Chạy: node tests/unit/CommandRuntimeHealth.verify.js
 */
'use strict';

const path = require('path');
const Module = require('module');

// ---- Mock easymidi trước khi runtime.js/midiDriver.js require() nó ----
const mockState = {
    outputsAvailable: ['LoopBe Internal MIDI'],
    inputsAvailable: ['LoopBe Internal MIDI'],
    failOutputOpen: false,
};

class FakeOutput {
    constructor(name, virtual) {
        if (!virtual && !mockState.outputsAvailable.includes(name)) {
            throw new Error('No MIDI output found with name: ' + name);
        }
        if (mockState.failOutputOpen) {
            throw new Error('Mock: RtMidi từ chối mở port (giả lập port bị chiếm bởi tiến trình khác)');
        }
        this.name = name;
        this._open = true;
    }
    send() { /* no-op */ }
    close() { this._open = false; }
    isPortOpen() { return this._open; }
}

class FakeInput {
    constructor(name) {
        if (!mockState.inputsAvailable.includes(name)) {
            throw new Error('No MIDI input found with name: ' + name);
        }
        this.name = name;
        this._open = true;
        this._handlers = {};
    }
    on(evt, fn) { this._handlers[evt] = fn; }
    close() { this._open = false; }
}

const fakeEasymidi = {
    Output: FakeOutput,
    Input: FakeInput,
    getInputs: () => mockState.inputsAvailable.slice(),
    getOutputs: () => mockState.outputsAvailable.slice(),
};

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'easymidi') return fakeEasymidi;
    return originalLoad.apply(this, arguments);
};

// ---- Load module thật cần test SAU khi mock đã gắn ----
const runtimePath = path.join(__dirname, '..', '..', 'core', 'command-engine-js', 'runtime.js');
delete require.cache[require.resolve(runtimePath)];
const CommandRuntime = require(runtimePath);

let pass = 0;
let fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function fakeSettings(portName) {
    return () => ({ midiOutputPort: portName, midiMappingsV1: [] });
}

console.log('== Case 1: start() không có midiOutputPort -> NO output/input, health phản ánh đúng ==');
CommandRuntime.start({ readSettingsFile: fakeSettings(null) });
{
    const h = CommandRuntime.getHealth();
    assert(h.started === true, 'started=true sau start()');
    assert(h.outputReady === false, 'outputReady=false khi chưa có portName');
    assert(h.inputOpen === false, 'inputOpen=false khi chưa có portName');
    assert(typeof h.lastOutputError === 'string', 'lastOutputError có lý do rõ ràng (không phải chỉ null im lặng)');
}
CommandRuntime.stop();

console.log('\n== Case 2: portName hợp lệ -> output/input mở thành công ==');
CommandRuntime.start({ readSettingsFile: fakeSettings('LoopBe Internal MIDI') });
{
    const h = CommandRuntime.getHealth();
    assert(h.outputReady === true, 'outputReady=true khi port tồn tại thật (mock)');
    assert(h.inputOpen === true, 'inputOpen=true khi port tồn tại thật (mock)');
    assert(h.lastOutputError === null, 'lastOutputError=null khi mở thành công');
    assert(h.driversRegistered.includes('mcu'), "alias 'mcu' có trong driversRegistered");
}

console.log('\n== Case 3: portName không tồn tại -> ERROR rõ ràng, không giả vờ READY ==');
CommandRuntime.stop();
CommandRuntime.start({ readSettingsFile: fakeSettings('Port Không Tồn Tại') });
{
    const h = CommandRuntime.getHealth();
    assert(h.outputReady === false, 'outputReady=false khi port không tồn tại trong danh sách thật');
    assert(typeof h.lastOutputError === 'string' && h.lastOutputError.length > 0, 'lastOutputError có nội dung lỗi thật (No MIDI output found...)');
}
CommandRuntime.stop();

console.log('\n== Case 4: LIVE RECONNECT — đổi port qua reloadMappings() (đúng cơ chế thật: setup-changed IPC), KHÔNG stop/start ==');
mockState.outputsAvailable = ['Port A', 'Port B'];
mockState.inputsAvailable = ['Port A', 'Port B'];
// Mô phỏng đúng thật: main.js truyền 1 hàm ỔN ĐỊNH readSettingsFile đọc file trên đĩa mỗi lần gọi —
// port "thay đổi" vì NỘI DUNG file thay đổi giữa các lần gọi, không phải vì đổi closure. Mock ở đây
// dùng 1 object mutable để đúng bản chất đó.
const liveSettings = { midiOutputPort: 'Port A', midiMappingsV1: [] };
const readLiveSettings = () => ({ ...liveSettings });

CommandRuntime.start({ readSettingsFile: readLiveSettings });
{
    const h1 = CommandRuntime.getHealth();
    assert(h1.configuredPortName === 'Port A', 'configuredPortName = Port A sau start()');
    assert(h1.outputReady === true, 'outputReady=true trên Port A');
}

// User đổi cổng trong Setup -> ghi file mới -> renderer gọi notifySetupChanged() -> main.js gọi
// CommandRuntime.reloadMappings() (KHÔNG restart CommandRuntime) — đúng dòng chảy thật trong app/main.js.
liveSettings.midiOutputPort = 'Port B';
CommandRuntime.reloadMappings();
{
    const h2 = CommandRuntime.getHealth();
    assert(h2.configuredPortName === 'Port B', 'configuredPortName = Port B ngay sau reloadMappings() (live, không restart)');
    assert(h2.outputReady === true, 'outputReady=true trên Port B sau reconnect trực tiếp');
    assert(h2.driversRegistered.includes('mcu'), "alias 'mcu' vẫn còn sau khi đổi port (đã đăng ký lại đúng driver mới)");
}

// Gọi lại reloadMappings() với CÙNG port (không đổi gì) -> không được đóng/mở lại port (tránh
// nhấp nháy port thật mỗi lần Setup lưu bất kỳ field nào khác, kể cả khi không đụng tới MIDI).
CommandRuntime.reloadMappings();
{
    const h3 = CommandRuntime.getHealth();
    assert(h3.configuredPortName === 'Port B', 'configuredPortName vẫn là Port B khi gọi lại reloadMappings() không đổi port');
    assert(h3.outputReady === true, 'outputReady vẫn true — không bị đóng/mở lại vô ích khi port không đổi');
}
CommandRuntime.stop();

console.log('\n== Case 5: đổi sang port rỗng ("bỏ chọn") khi đang chạy -> output health phải về false, không throw ==');
liveSettings.midiOutputPort = 'Port A';
CommandRuntime.start({ readSettingsFile: readLiveSettings });
liveSettings.midiOutputPort = null;
let threw = false;
try { CommandRuntime.reloadMappings(); } catch (e) { threw = true; }
{
    const h = CommandRuntime.getHealth();
    assert(threw === false, 'reloadMappings() không throw khi bỏ chọn port giữa chừng');
    assert(h.outputReady === false, 'outputReady=false sau khi bỏ chọn port');
    assert(h.configuredPortName === null, 'configuredPortName=null sau khi bỏ chọn');
}
CommandRuntime.stop();

Module._load = originalLoad;

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
