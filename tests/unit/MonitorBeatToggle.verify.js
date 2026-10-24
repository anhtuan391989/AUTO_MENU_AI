/**
 * MonitorBeatToggle.verify.js — TASK B12
 * ---------------------------------------------------------------------------
 * Trích xuất verbatim đúng đoạn click handler của #musicBtn trong renderer.js — xác nhận
 * MONITOR_BEAT_TOGGLE được dispatch đúng 1 lần, song song với toggle CSS "disabled" đã có
 * từ trước (không thay thế hành vi cũ).
 *
 * Chạy: node tests/unit/MonitorBeatToggle.verify.js
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

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js'), 'utf8');

const marker = 'document.getElementById("musicBtn")?.addEventListener("click"';
const start = source.indexOf(marker);
if (start === -1) throw new Error('Không tìm thấy handler #musicBtn trong renderer.js.');
const end = source.indexOf('});', start) + 3;
// MIDI-DAW-CONTROL-01: handler nay gọi reportDawStateResult() (đặt ngay trước nó) và ActionRegistry.setDawControlState().
const helperStart = source.indexOf('// MIDI-DAW-CONTROL-01 — hiển thị kết quả gửi lệnh ON/OFF');
if (helperStart === -1 || helperStart > start) throw new Error('Không tìm thấy reportDawStateResult trong renderer.js.');
const block = source.slice(helperStart, end);

class FakeElement {
    constructor() { this._handlers = {}; this._cls = new Set(); this.dataset = {}; this.title = ''; const cls = this._cls; this.classList = { get toggled() { return cls.has('disabled'); }, toggle(c) { cls.has(c) ? cls.delete(c) : cls.add(c); }, contains: (c) => cls.has(c) }; }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    dispatch(evt) { (this._handlers[evt] || []).forEach((fn) => fn({ target: this })); }
}

console.log('== musicBtn click -> dispatch đúng 1 lệnh (legacy MONITOR_BEAT_TOGGLE khi chưa cấu hình ON/OFF), giữ nguyên toggle CSS cũ ==');
{
    // Dùng actionRegistry.js THẬT (chế độ legacy: chỉ có mapping toggle cũ) — mock chỉ ở tầng gửi MIDI.
    const sent = [];
    const store = { selectedDAW: 'studio-one', dawMidiOutMappings: { 'studio-one': { MONITOR_BEAT_TOGGLE: { kind: 'cc', channel: 1, number: 20, value: 127 } } } };
    const musicBtn = new FakeElement();
    const sandbox = {
        console: { log() {}, error: console.error, warn() {} },
        document: { getElementById: (id) => (id === 'musicBtn' ? musicBtn : null) },
        saveData: () => {},
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]),
        setSetting: (k, v) => { store[k] = v; },
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; },
        sendMidiNotePulse: async () => true,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'actionRegistry.js'), 'utf8'), sandbox);
    vm.runInContext(block, sandbox);
    musicBtn.dispatch('click');
    setTimeout(() => {
        assert(musicBtn.classList.toggled === true, 'toggle CSS "disabled" vẫn hoạt động như cũ (không bị thay thế)');
        assert(sent.length === 1, `gửi đúng 1 lệnh MIDI (thực tế: ${sent.length})`);
        assert(sent[0] && sent[0].n === 20 && sent[0].ch === 0, `lệnh = mapping MONITOR_BEAT_TOGGLE cũ (CC 20, kênh 1) (thực tế: ${JSON.stringify(sent[0])})`);
        assert(sandbox.__dawStateLast && sandbox.__dawStateLast.MUSIC && sandbox.__dawStateLast.MUSIC.action === 'MONITOR_BEAT_TOGGLE' && sandbox.__dawStateLast.MUSIC.mode === 'legacy', 'ghi nhận mode=legacy, action=MONITOR_BEAT_TOGGLE');
        console.log(`\n${pass} PASS, ${fail} FAIL`);
        process.exit(fail > 0 ? 1 : 0);
    }, 20);
}
