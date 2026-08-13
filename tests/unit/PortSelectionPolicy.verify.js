/**
 * PortSelectionPolicy.verify.js — TASK B2
 * ---------------------------------------------------------------------------
 * Test các hàm THUẦN mới trong runtime.js (resolvePortSelection, resolveInputPortName) +
 * hành vi platform-gated của ensureAutoMenuAiPort() (mock process.platform) + loopback
 * verifyMidiOutput() (mock easymidi, mô phỏng echo thật qua EventEmitter).
 *
 * KHÔNG phải hardware test. Không xác nhận RtMidi/Windows/loopMIDI thật.
 * Chạy: node tests/unit/PortSelectionPolicy.verify.js
 */
'use strict';

const path = require('path');
const Module = require('module');
const EventEmitter = require('events');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

// ---- Mock easymidi (giống CommandRuntimeHealth.verify.js, nhưng Output/Input là EventEmitter
// thật để verifyMidiOutput() có thể "echo" — mô phỏng loopMIDI song công) ----
const mockState = { outputsAvailable: ['AUTO MENU AI'], inputsAvailable: ['AUTO MENU AI'] };

class FakeOutput {
    constructor(name, virtual) {
        if (!virtual && !mockState.outputsAvailable.includes(name)) {
            throw new Error('No MIDI output found with name: ' + name);
        }
        this.name = name;
        this._open = true;
    }
    send(type, args) {
        // Mô phỏng loopMIDI: bất kỳ message Output gửi ra đều "vọng" lại Input cùng tên NGAY
        // LẬP TỨC (đồng bộ đủ để test, không cần setTimeout — Promise trong verifyMidiOutput
        // vẫn resolve đúng vì listener được gắn TRƯỚC khi gọi execute()).
        if (FakeOutput.echoTarget) FakeOutput.echoTarget.emit(type, args);
    }
    close() { this._open = false; }
    isPortOpen() { return this._open; }
}
class FakeInput extends EventEmitter {
    constructor(name) {
        super();
        if (!mockState.inputsAvailable.includes(name)) {
            throw new Error('No MIDI input found with name: ' + name);
        }
        this.name = name;
        this._open = true;
        FakeOutput.echoTarget = this; // cùng port name -> cùng "dây" loopback trong mock này
    }
    close() { this._open = false; }
}
const fakeEasymidi = {
    Output: FakeOutput,
    Input: FakeInput,
    getInputs: () => mockState.inputsAvailable.slice(),
    getOutputs: () => mockState.outputsAvailable.slice(),
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'easymidi') return fakeEasymidi;
    return originalLoad.apply(this, arguments);
};

const runtimePath = path.join(__dirname, '..', '..', 'core', 'command-engine-js', 'runtime.js');
delete require.cache[require.resolve(runtimePath)];
const CommandRuntime = require(runtimePath);

console.log('== resolvePortSelection() — mode "manual" (mặc định, backward-compat) ==');
{
    const r1 = CommandRuntime.resolvePortSelection({ mode: 'manual', savedPortName: 'Port A', discoveredOutputs: ['Port A', 'AUTO MENU AI'] });
    assert(r1.portName === 'Port A' && r1.source === 'user-selected', 'mode=manual: dùng đúng port user đã chọn, KHÔNG bị AUTO MENU AI ghi đè dù nó có tồn tại');

    const r2 = CommandRuntime.resolvePortSelection({ mode: 'manual', savedPortName: 'Port Mất Rồi', discoveredOutputs: ['Port A', 'AUTO MENU AI'] });
    assert(r2.portName === null && r2.source === 'none', 'mode=manual: port đã lưu mất -> DISCONNECTED (none), KHÔNG tự fallback sang AUTO MENU AI');

    const r3 = CommandRuntime.resolvePortSelection({ mode: 'manual', savedPortName: null, discoveredOutputs: ['AUTO MENU AI'] });
    assert(r3.portName === null && r3.source === 'none', 'mode=manual: chưa từng chọn gì -> none (không tự ý bật AUTO MENU AI khi user chưa opt-in "auto")');
}

console.log('\n== resolvePortSelection() — mode "auto" (user tự bật) ==');
{
    const r1 = CommandRuntime.resolvePortSelection({ mode: 'auto', savedPortName: 'Port A', discoveredOutputs: ['Port A', 'AUTO MENU AI'] });
    assert(r1.portName === 'AUTO MENU AI' && r1.source === 'auto-menu-ai', 'mode=auto: ưu tiên AUTO MENU AI ngay cả khi có port đã lưu khác (đúng Priority 1 > 2)');

    const r2 = CommandRuntime.resolvePortSelection({ mode: 'auto', savedPortName: 'Port A', discoveredOutputs: ['Port A'] });
    assert(r2.portName === 'Port A' && r2.source === 'user-selected-fallback', 'mode=auto: AUTO MENU AI không tồn tại -> fallback về port đã lưu (Priority 2)');

    const r3 = CommandRuntime.resolvePortSelection({ mode: 'auto', savedPortName: null, discoveredOutputs: [] });
    assert(r3.portName === null && r3.source === 'none', 'mode=auto: không có gì cả -> none, không bịa');
}

console.log('\n== resolveInputPortName() — migration fallback (Mục 4) ==');
{
    assert(CommandRuntime.resolveInputPortName({ midiInputPort: 'In A', midiOutputPort: 'Out A' }) === 'In A', 'có midiInputPort riêng -> dùng đúng nó');
    assert(CommandRuntime.resolveInputPortName({ midiOutputPort: 'Out A' }) === 'Out A', 'KHÔNG có midiInputPort -> fallback về midiOutputPort (backward-compat, không mất cấu hình cũ)');
    assert(CommandRuntime.resolveInputPortName({}) === null, 'không có gì cả -> null, không bịa');
}

console.log('\n== AUTO_MENU_AI_PORT_NAME — contract string chính xác (Mục 1) ==');
assert(CommandRuntime.AUTO_MENU_AI_PORT_NAME === 'AUTO MENU AI', `đúng "AUTO MENU AI" (thực tế: "${CommandRuntime.AUTO_MENU_AI_PORT_NAME}")`);

console.log('\n== ensureAutoMenuAiPort() qua autoConnect() — platform-gate win32 (mock process.platform) ==');
{
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockState.outputsAvailable = [];
    mockState.inputsAvailable = [];
    CommandRuntime.start({ readSettingsFile: () => ({}) });
    const r = CommandRuntime.autoConnect({ mode: 'auto' });
    assert(r.virtualPort.ok === false, 'trên win32: virtualPort.ok=false (đúng — RtMidi WinMM không hỗ trợ virtual port)');
    assert(r.virtualPort.reason === 'PLATFORM_UNSUPPORTED', 'trên win32: reason=PLATFORM_UNSUPPORTED, KHÔNG throw, KHÔNG giả vờ tạo được');
    CommandRuntime.stop();
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    mockState.outputsAvailable = ['AUTO MENU AI'];
    mockState.inputsAvailable = ['AUTO MENU AI'];
}

console.log('\n== TASK B3-B: ensureAutoMenuAiPort() trên win32 KHI port đã tồn tại (vd do loopMIDI tạo sẵn) -> phải REUSE, KHÔNG báo PLATFORM_UNSUPPORTED sai ==');
{
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockState.outputsAvailable = ['AUTO MENU AI']; // giả lập: user đã tự cài loopMIDI, tạo sẵn port này
    mockState.inputsAvailable = ['AUTO MENU AI'];
    CommandRuntime.start({ readSettingsFile: () => ({}) });
    const r = CommandRuntime.autoConnect({ mode: 'auto' });
    assert(r.virtualPort.ok === true, `trên win32, port ĐÃ tồn tại -> virtualPort.ok=true (REUSED), KHÔNG báo sai PLATFORM_UNSUPPORTED (thực tế: ${JSON.stringify(r.virtualPort)})`);
    assert(r.virtualPort.reason === 'REUSED', `reason=REUSED (thực tế: ${r.virtualPort.reason})`);
    assert(r.ok === true && r.resolution.portName === 'AUTO MENU AI', 'autoConnect() vẫn chọn đúng AUTO MENU AI trên win32 khi port đã có sẵn');
    CommandRuntime.stop();
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
}

console.log('\n== TASK B3-B: mode=manual trên win32 — KHÔNG tự nhảy sang AUTO MENU AI dù nó tồn tại (giữ đúng B2) ==');
{
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockState.outputsAvailable = ['AUTO MENU AI', 'Saved Port'];
    mockState.inputsAvailable = ['AUTO MENU AI', 'Saved Port'];
    CommandRuntime.start({ readSettingsFile: () => ({ midiOutputPort: 'Saved Port' }) });
    const r = CommandRuntime.autoConnect({ mode: 'manual' });
    assert(r.resolution.portName === 'Saved Port' && r.resolution.source === 'user-selected', `mode=manual trên win32 vẫn ưu tiên port đã lưu, KHÔNG tự chuyển AUTO MENU AI (thực tế: ${JSON.stringify(r.resolution)})`);
    CommandRuntime.stop();
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    mockState.outputsAvailable = ['AUTO MENU AI'];
    mockState.inputsAvailable = ['AUTO MENU AI'];
}

console.log('\n== autoConnect() end-to-end (mock easymidi) — mode auto tìm thấy AUTO MENU AI ==');
{
    const settings = { midiOutputPort: null };
    CommandRuntime.start({ readSettingsFile: () => ({ ...settings }) });
    const result = CommandRuntime.autoConnect({ mode: 'auto' });
    assert(result.ok === true, 'autoConnect() ok=true khi AUTO MENU AI có sẵn trong mock');
    assert(result.resolution.portName === 'AUTO MENU AI', 'autoConnect() chọn đúng AUTO MENU AI ở mode auto');
    const h = CommandRuntime.getHealth();
    assert(h.outputReady === true && h.inputOpen === true, 'health phản ánh đúng sau autoConnect()');
    assert(h.lastPortResolution.source === 'auto-menu-ai', 'getHealth() trả lại đúng nguồn port đã chọn (lastPortResolution)');
    CommandRuntime.stop();
}

console.log('\n== verifyMidiOutput() loopback — CÓ echo thật (mock EventEmitter) -> verified=true ==');
{
    CommandRuntime.start({ readSettingsFile: () => ({ midiOutputPort: 'AUTO MENU AI' }) });
    (async () => {
        const r = await CommandRuntime.verifyMidiOutput({ timeoutMs: 300 });
        assert(r.verified === true, `verifyMidiOutput() verified=true khi mock echo đúng message (thực tế: ${JSON.stringify(r)})`);
        assert(r.reason === 'LOOPBACK_CONFIRMED', 'reason=LOOPBACK_CONFIRMED khi loopback thành công');
        CommandRuntime.stop();

        console.log('\n== verifyMidiOutput() — KHÔNG có input mở -> verified=false, KHÔNG throw ==');
        CommandRuntime.start({ readSettingsFile: () => ({}) }); // không có port -> input/output đều chưa mở
        const r2 = await CommandRuntime.verifyMidiOutput({ timeoutMs: 200 });
        assert(r2.verified === false && r2.reason === 'NOT_CONNECTED', 'verifyMidiOutput() trả NOT_CONNECTED thay vì throw khi chưa kết nối gì');
        CommandRuntime.stop();

        Module._load = originalLoad;
        console.log(`\n${pass} PASS, ${fail} FAIL`);
        process.exit(fail > 0 ? 1 : 0);
    })();
}
