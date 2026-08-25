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
const block = source.slice(start, end);

class FakeElement {
    constructor() { this._handlers = {}; this.classList = { toggled: false, toggle() { this.toggled = !this.toggled; } }; }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    dispatch(evt) { (this._handlers[evt] || []).forEach((fn) => fn({ target: this })); }
}

console.log('== musicBtn click -> dispatch đúng MONITOR_BEAT_TOGGLE, giữ nguyên toggle CSS cũ ==');
{
    const calls = [];
    const musicBtn = new FakeElement();
    const sandbox = {
        console,
        document: { getElementById: (id) => (id === 'musicBtn' ? musicBtn : null) },
        saveData: () => {},
        window: {
            ActionRegistry: {
                ACTIONS: { MONITOR_BEAT_TOGGLE: 'MONITOR_BEAT_TOGGLE' },
                executeAction: (action, ctx) => { calls.push({ action, ctx }); return Promise.resolve({ ok: true }); },
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(block, sandbox);
    musicBtn.dispatch('click');
    assert(musicBtn.classList.toggled === true, 'toggle CSS "disabled" vẫn hoạt động như cũ (không bị thay thế)');
    assert(calls.length === 1, `executeAction gọi đúng 1 lần (thực tế: ${calls.length})`);
    assert(calls[0].action === 'MONITOR_BEAT_TOGGLE', `action = MONITOR_BEAT_TOGGLE (thực tế: ${calls[0].action})`);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
