/**
 * MouseControlGate.verify.js — TASK A29-B
 * ---------------------------------------------------------------------------
 * Xác nhận Mouse Control (setting "mouseControlEnabled") là MASTER SWITCH thật cho
 * mọi nhánh tự động click chuột trong vocalCommandRouter.js (sendKeyToAutotune,
 * sendToneStep) — đường Key/Tone Auto-Tune, KHÔNG phải actionRegistry.js (đã có gate
 * riêng từ trước, xem MonitorBeatRetuneBackend.verify.js).
 *
 * Đúng 6 case bắt buộc trong Task A29-B:
 *   1. Dò Key xong, Mouse Control OFF          -> KHÔNG click
 *   2. MOD/Chromatic step, Mouse Control OFF   -> KHÔNG click
 *   3. Cả hai, MIDI đã configured, Mouse OFF   -> VẪN gửi MIDI (mouse gate không chặn MIDI)
 *   4. Mouse Control ON, có toạ độ             -> ĐƯỢC click
 *   5. Mouse Control OFF -> ON (đổi runtime)   -> chỉ bắt đầu click SAU khi ON
 *   6. Trạng thái phải đọc getSetting() thật (runtime), không phải suy luận UI/CSS
 *
 * Chạy: node tests/unit/MouseControlGate.verify.js
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

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'vocalCommandRouter.js'), 'utf8');

function extractFn(name) {
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
function extractConst(name) {
    const start = source.indexOf(`const ${name}`);
    const end = source.indexOf(';', start) + 1;
    return source.slice(start, end);
}

// Sanity: đúng các hàm/const này PHẢI tồn tại trong file thật (không test trên bản giả lập)
['sendKeyToAutotune', 'sendToneStep', 'isMouseFallbackAllowed', 'parseCapturedPoint', 'delay']
    .forEach((name) => assert(source.includes(`function ${name}(`), `[sanity] vocalCommandRouter.js có định nghĩa ${name}()`));

const code = [
    extractConst('NOTE_MAP'),
    extractConst('CHROMATIC_UP_INDEX'),
    extractConst('CHROMATIC_DOWN_INDEX'),
    extractConst('CLICK_STEP_DELAY_MS'),
    extractFn('delay'),
    extractFn('parseCapturedPoint'),
    extractFn('isMouseFallbackAllowed'),
    extractFn('sendKeyToAutotune'),
    extractFn('sendToneStep'),
].join('\n\n');

function buildSandbox({ mouseControlEnabled, midiOutputPort, clickSpy, midiNoteSpy, midiCCSpy, coordinateStore }) {
    const settingsStore = { mouseControlEnabled, midiOutputPort };
    const sandbox = {
        console,
        setTimeout,
        Promise,
        getSetting: (key) => settingsStore[key],
        getCoordinate: (key) => (coordinateStore || {})[key],
        sendMidiNotePulse: async (note) => { if (midiNoteSpy) midiNoteSpy(note); return midiOutputPort ? true : false; },
        sendMidiCC: async (cc, val) => { if (midiCCSpy) midiCCSpy(cc, val); return midiOutputPort ? true : false; },
        window: {
            electronAPI: {
                clickAtPoint: async (point) => { if (clickSpy) clickSpy(point); return { ok: true }; },
            },
        },
        // helper để test đổi setting "runtime" giữa chừng (case #5 OFF -> ON)
        __setMouseControl: (v) => { settingsStore.mouseControlEnabled = v; },
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'vocalCommandRouter.sandbox.js' });
    return sandbox;
}

(async () => {

    // ===== Case 1: Dò Key xong, KHÔNG cấu hình MIDI, Mouse Control OFF -> KHÔNG click =====
    {
        let clicked = false;
        const sb = buildSandbox({
            mouseControlEnabled: false,
            midiOutputPort: '',
            clickSpy: () => { clicked = true; },
            coordinateStore: { autotunekey: { x: 100, y: 200 } },
        });
        const result = await sb.sendKeyToAutotune('C Major');
        assert(clicked === false, 'Case1: Mouse OFF + không MIDI -> sendKeyToAutotune KHÔNG gọi clickAtPoint');
        assert(result.ok === false && result.status === 'MOUSE_DISABLED', 'Case1: trả về status=MOUSE_DISABLED, ok=false (không giả PASS)');
    }

    // ===== Case 2: MOD/Chromatic step, Mouse Control OFF -> KHÔNG click =====
    {
        let clicked = false;
        const sb = buildSandbox({
            mouseControlEnabled: false,
            midiOutputPort: '',
            clickSpy: () => { clicked = true; },
            coordinateStore: { chromatic: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
        });
        const result = await sb.sendToneStep(2);
        assert(clicked === false, 'Case2: Mouse OFF + không MIDI -> sendToneStep KHÔNG gọi clickAtPoint');
        assert(result.ok === false && result.status === 'MOUSE_DISABLED', 'Case2: trả về status=MOUSE_DISABLED, ok=false');
    }

    // ===== Case 3: Mouse OFF NHƯNG MIDI đã configured -> MIDI vẫn phải gửi được (gate chỉ chặn mouse) =====
    {
        let clicked = false, midiNoteSent = null, midiCCCount = 0;
        const sb = buildSandbox({
            mouseControlEnabled: false,
            midiOutputPort: 'AUTO MENU AI',
            clickSpy: () => { clicked = true; },
            midiNoteSpy: (note) => { midiNoteSent = note; },
            midiCCSpy: () => { midiCCCount++; },
            coordinateStore: { autotunekey: { x: 1, y: 1 }, chromatic: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
        });
        const keyResult = await sb.sendKeyToAutotune('D Major');
        const toneResult = await sb.sendToneStep(1);
        assert(keyResult.ok === true && keyResult.driverUsed === 'midi', 'Case3a: Mouse OFF nhưng MIDI configured -> sendKeyToAutotune vẫn gửi MIDI thành công');
        assert(toneResult.ok === true && toneResult.driverUsed === 'midi', 'Case3b: Mouse OFF nhưng MIDI configured -> sendToneStep vẫn gửi MIDI thành công');
        assert(midiNoteSent === 2, 'Case3a: đúng note MIDI được gửi (D=2, theo NOTE_MAP thật của vocalCommandRouter.js)');
        assert(midiCCCount === 1, 'Case3b: đúng số lần gửi CC (1 bước = 1 lần)');
        assert(clicked === false, 'Case3: clickAtPoint KHÔNG được gọi khi MIDI đã lo xong (không lẫn 2 driver)');
    }

    // ===== Case 4: Mouse Control ON, có toạ độ, KHÔNG MIDI -> ĐƯỢC click =====
    {
        let clickedPoint = null;
        const sb = buildSandbox({
            mouseControlEnabled: true,
            midiOutputPort: '',
            clickSpy: (p) => { clickedPoint = p; },
            coordinateStore: { autotunekey: { x: 55, y: 66 } },
        });
        const result = await sb.sendKeyToAutotune('E Minor');
        assert(result.ok === true && result.driverUsed === 'mouse', 'Case4: Mouse ON + không MIDI -> sendKeyToAutotune click thành công qua mouse');
        assert(clickedPoint && clickedPoint.x === 55 && clickedPoint.y === 66, 'Case4: click ĐÚNG toạ độ đã capture (autotunekey)');
    }

    // ===== Case 5: Mouse Control OFF -> ON (đổi state RUNTIME giữa 2 lần gọi) =====
    // Case 5b (ON -> OFF) bổ sung: xác nhận gate phản ứng NGAY theo state runtime hiện tại,
    // không cache lại quyết định cũ từ lần gọi trước.
    {
        let clickCount = 0;
        const sb = buildSandbox({
            mouseControlEnabled: false,
            midiOutputPort: '',
            clickSpy: () => { clickCount++; },
            coordinateStore: { chromatic: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
        });
        const beforeOn = await sb.sendToneStep(1);
        assert(beforeOn.ok === false && clickCount === 0, 'Case5a: TRƯỚC khi bật ON -> chưa click lần nào');

        sb.__setMouseControl(true); // người dùng vừa bật Mouse Control lên
        const afterOn = await sb.sendToneStep(1);
        assert(afterOn.ok === true && clickCount === 1, 'Case5b: NGAY SAU khi bật ON -> bắt đầu click được (đọc state runtime mới, không cache)');

        sb.__setMouseControl(false); // người dùng tắt lại
        const afterOff = await sb.sendToneStep(1);
        assert(afterOff.ok === false && clickCount === 1, 'Case5c: tắt lại OFF -> ngừng click ngay (không có click thứ 2)');
    }

    // ===== Case 6: Gate đọc getSetting() thật (runtime), KHÔNG phải suy luận UI/CSS =====
    {
        // isMouseFallbackAllowed() không nhận tham số nào ngoài việc gọi getSetting() nội bộ —
        // xác nhận trực tiếp hàm dùng đúng key "mouseControlEnabled", không hardcode true/false,
        // và mặc định ON khi setting chưa từng được set (undefined) — đúng hành vi cũ.
        const sbUndefined = buildSandbox({ mouseControlEnabled: undefined, midiOutputPort: '' });
        assert(sbUndefined.isMouseFallbackAllowed() === true, 'Case6a: setting chưa từng set (undefined) -> mặc định cho phép (giữ hành vi cũ)');

        const sbFalse = buildSandbox({ mouseControlEnabled: false, midiOutputPort: '' });
        assert(sbFalse.isMouseFallbackAllowed() === false, 'Case6b: setting = false -> gate chặn (đọc đúng giá trị thật)');

        const sbTrue = buildSandbox({ mouseControlEnabled: true, midiOutputPort: '' });
        assert(sbTrue.isMouseFallbackAllowed() === true, 'Case6c: setting = true -> gate cho phép (đọc đúng giá trị thật)');
    }

    // ===== Đảm bảo actionRegistry.js (DAW Action Mapping) KHÔNG bị đụng bởi patch này =====
    {
        const actionRegistrySource = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'actionRegistry.js'), 'utf8');
        assert(actionRegistrySource.includes('function isMouseControlEnabled()'), 'actionRegistry.js vẫn còn gate riêng của nó (không bị patch A29-B đụng vào)');
    }

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);

})();
