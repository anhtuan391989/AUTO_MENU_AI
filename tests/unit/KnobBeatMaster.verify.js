/**
 * KnobBeatMaster.verify.js — TASK B6 (Beat Input vs Master Output)
 * ---------------------------------------------------------------------------
 * Trích xuất verbatim đúng khối code thật vừa sửa trong renderer.js (từ `let activeKnob =
 * null;` tới hết listener `mousemove`, bao gồm `dispatchKnobVolume`/`KNOB_ID_TO_ACTION`/
 * `knobData.forEach` gắn 3 listener) — chạy trong sandbox với DOM/ActionRegistry giả lập tối
 * thiểu, xác nhận đúng 8 test case bắt buộc của B6.
 *
 * Chạy: node tests/unit/KnobBeatMaster.verify.js
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

const rendererPath = path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');

const startMarker = 'let activeKnob = null;';
const endMarker = 'document.addEventListener("mouseup"';
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) throw new Error('Không tìm thấy block Knob trong renderer.js — cấu trúc đã đổi, cần cập nhật test.');
const knobBlock = source.slice(startIdx, endIdx);

// ---- Fake DOM tối thiểu: EventEmitter-like cho từng knob element + document ----
class FakeElement {
    constructor(id) { this.id = id; this._handlers = {}; this.style = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    dispatch(evt, payload) { (this._handlers[evt] || []).forEach((fn) => fn(payload)); }
}

function buildSandbox() {
    const elements = {};
    ['retune1', 'retune2', 'musicKnob', 'masterKnob', 'clapKnob', 'laughKnob'].forEach((id) => { elements[id] = new FakeElement(id); });
    const docHandlers = {};
    const fakeDocument = {
        getElementById: (id) => elements[id],
        addEventListener: (evt, fn) => { (docHandlers[evt] = docHandlers[evt] || []).push(fn); },
        body: { style: {} },
    };

    const knobData = [
        { id: "retune1", value: 20, defaultValue: 20 },
        { id: "retune2", value: 20, defaultValue: 20 },
        { id: "musicKnob", value: 90, defaultValue: 90 },
        { id: "masterKnob", value: 90, defaultValue: 90 },
        { id: "clapKnob", value: 40, defaultValue: 40 },
        { id: "laughKnob", value: 40, defaultValue: 40 },
    ];

    const calls = []; // { action, value }
    const ACTIONS = { BEAT_INPUT_VOLUME: "BEAT_INPUT_VOLUME", MASTER_OUTPUT_VOLUME: "MASTER_OUTPUT_VOLUME" };
    const sandbox = {
        console,
        document: fakeDocument,
        window: {
            ActionRegistry: {
                ACTIONS,
                executeAction: (action, ctx) => { calls.push({ action, value: ctx.value }); return Promise.resolve({ ok: true }); },
            },
        },
        knobData,
        updateKnob: () => {}, // CSS only thật — không cần test lại ở đây (đã ngoài phạm vi B6 logic)
        saveData: () => {},   // persistence thật — đã test riêng ở chỗ khác, không lặp lại
    };
    vm.createContext(sandbox);
    vm.runInContext(knobBlock, sandbox);
    return { sandbox, elements, docHandlers, knobData, calls };
}

function mousemoveTo(docHandlers, clientY) {
    (docHandlers['mousemove'] || []).forEach((fn) => fn({ clientY }));
}

console.log('== Case 1: Beat (musicKnob) tăng qua wheel -> Beat state tăng, Master KHÔNG đổi ==');
{
    const { elements, knobData, calls } = buildSandbox();
    const before = knobData.find(k => k.id === 'masterKnob').value;
    elements.musicKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 }); // deltaY<0 => +1
    const beat = knobData.find(k => k.id === 'musicKnob');
    const master = knobData.find(k => k.id === 'masterKnob');
    assert(beat.value === 91, `Beat tăng đúng 1 nấc (thực tế: ${beat.value})`);
    assert(master.value === before, `Master KHÔNG đổi (thực tế: ${master.value}, trước: ${before})`);
}

console.log('\n== Case 2: Beat giảm qua wheel -> Beat giảm, Master KHÔNG đổi ==');
{
    const { elements, knobData } = buildSandbox();
    const before = knobData.find(k => k.id === 'masterKnob').value;
    elements.musicKnob.dispatch('wheel', { preventDefault() {}, deltaY: 1 }); // deltaY>0 => -1
    assert(knobData.find(k => k.id === 'musicKnob').value === 89, 'Beat giảm đúng 1 nấc');
    assert(knobData.find(k => k.id === 'masterKnob').value === before, 'Master KHÔNG đổi');
}

console.log('\n== Case 3: Master tăng qua wheel -> Master tăng, Beat KHÔNG đổi ==');
{
    const { elements, knobData } = buildSandbox();
    const before = knobData.find(k => k.id === 'musicKnob').value;
    elements.masterKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    assert(knobData.find(k => k.id === 'masterKnob').value === 91, 'Master tăng đúng 1 nấc');
    assert(knobData.find(k => k.id === 'musicKnob').value === before, 'Beat KHÔNG đổi');
}

console.log('\n== Case 4: Master giảm qua wheel -> Master giảm, Beat KHÔNG đổi ==');
{
    const { elements, knobData } = buildSandbox();
    const before = knobData.find(k => k.id === 'musicKnob').value;
    elements.masterKnob.dispatch('wheel', { preventDefault() {}, deltaY: 1 });
    assert(knobData.find(k => k.id === 'masterKnob').value === 89, 'Master giảm đúng 1 nấc');
    assert(knobData.find(k => k.id === 'musicKnob').value === before, 'Beat KHÔNG đổi');
}

console.log('\n== Case 5: Beat -> command/mapping target = BEAT_INPUT_VOLUME, không phải Master ==');
{
    const { elements, calls } = buildSandbox();
    elements.musicKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    assert(calls.length === 1, `executeAction gọi đúng 1 lần (thực tế: ${calls.length})`);
    assert(calls[0].action === 'BEAT_INPUT_VOLUME', `action = BEAT_INPUT_VOLUME (thực tế: ${calls[0].action})`);
}

console.log('\n== Case 6: Master -> command/mapping target = MASTER_OUTPUT_VOLUME, không phải Beat ==');
{
    const { elements, calls } = buildSandbox();
    elements.masterKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    assert(calls.length === 1, `executeAction gọi đúng 1 lần (thực tế: ${calls.length})`);
    assert(calls[0].action === 'MASTER_OUTPUT_VOLUME', `action = MASTER_OUTPUT_VOLUME (thực tế: ${calls[0].action})`);
}

console.log('\n== Case 7: Beat rồi Master thay đổi liên tiếp -> mỗi lần đúng 1 execution, không duplicate ==');
{
    const { elements, calls } = buildSandbox();
    elements.musicKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    elements.masterKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    assert(calls.length === 2, `đúng 2 lần gọi tổng cộng, không duplicate (thực tế: ${calls.length})`);
    assert(calls[0].action === 'BEAT_INPUT_VOLUME' && calls[1].action === 'MASTER_OUTPUT_VOLUME', 'đúng thứ tự, không lẫn lộn 2 action');
}

console.log('\n== Case 7b: mousemove không đổi giá trị (đứng yên) -> KHÔNG dispatch trùng (chống duplicate) ==');
{
    const { elements, docHandlers, calls } = buildSandbox();
    elements.musicKnob.dispatch('mousedown', { clientY: 100 });
    mousemoveTo(docHandlers, 90); // delta=10 -> +5 -> value=95, dispatch 1 lần
    mousemoveTo(docHandlers, 90); // clientY giữ nguyên -> value tính lại vẫn 95 -> KHÔNG dispatch thêm
    assert(calls.length === 1, `mousemove tại cùng vị trí không tạo dispatch thừa (thực tế: ${calls.length} lần gọi)`);
}

console.log('\n== Case 8: Beat=70 và Master=70 (cùng giá trị số) vẫn là 2 control độc lập, KHÔNG collapse thành 1 state "volume=70" ==');
{
    const { elements, knobData, calls } = buildSandbox();
    const beat = knobData.find(k => k.id === 'musicKnob');
    const master = knobData.find(k => k.id === 'masterKnob');
    beat.value = 70; master.value = 70; // set trực tiếp, mô phỏng "cùng giá trị"
    elements.musicKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 }); // Beat -> 71
    elements.masterKnob.dispatch('dblclick'); // Master -> reset về defaultValue (90), KHÔNG liên quan gì tới Beat
    assert(beat.value === 71 && master.value === 90, `2 giá trị độc lập, không bị gộp/ảnh hưởng chéo (Beat=${beat.value}, Master=${master.value})`);
    assert(calls.some(c => c.action === 'BEAT_INPUT_VOLUME' && c.value === 71), 'Beat dispatch đúng giá trị riêng của nó');
    assert(calls.some(c => c.action === 'MASTER_OUTPUT_VOLUME' && c.value === 90), 'Master dispatch đúng giá trị riêng của nó, không bị lẫn với Beat');
}

console.log('\n== Kiểm tra bổ sung: 4 knob KHÔNG thuộc B6 (retune1/2, clap, laugh) KHÔNG dispatch gì (đúng phạm vi, không mở rộng) ==');
{
    const { elements, calls } = buildSandbox();
    elements.retune1.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    elements.retune2.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    elements.clapKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    elements.laughKnob.dispatch('wheel', { preventDefault() {}, deltaY: -1 });
    assert(calls.length === 0, `0 dispatch nào cho 4 knob ngoài phạm vi B6 (thực tế: ${calls.length})`);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
