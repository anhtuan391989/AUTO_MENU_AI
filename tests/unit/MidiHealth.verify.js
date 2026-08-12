/**
 * MidiHealth.verify.js — TASK B1-A / B1-B
 * ---------------------------------------------------------------------------
 * ui/js/midiHealth.js không dùng `document`, chỉ dùng `window`/`getMidiAccess`/`getSetting`
 * (2 hàm global do appSettings.js định nghĩa trong renderer thật) — nên có thể chạy được
 * trong Node bằng cách stub tối thiểu 3 global này, KHÔNG cần jsdom/Electron.
 * Đây vẫn là LOGIC TEST (mô phỏng dữ liệu trả về), KHÔNG phải test Web MIDI API thật của
 * Chromium hay easymidi/RtMidi thật — xem cảnh báo RUNTIME TEST trong báo cáo.
 *
 * Chạy: node tests/unit/MidiHealth.verify.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function loadMidiHealth({ settings, rendererAccess, mainHealth, mainAvailable = true }) {
    const sandbox = {};
    sandbox.window = {};
    sandbox.getSetting = (key) => settings[key];
    sandbox.getMidiAccess = rendererAccess
        ? () => Promise.resolve(rendererAccess)
        : undefined;
    sandbox.window.electronAPI = mainAvailable
        ? { getMainMidiHealth: () => Promise.resolve(mainHealth) }
        : undefined;

    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'midiHealth.js'), 'utf8');
    const fn = new Function('window', 'getMidiAccess', 'getSetting', code + '\nreturn window.MidiHealth;');
    return fn(sandbox.window, sandbox.getMidiAccess, sandbox.getSetting);
}

function fakeAccess(inputNames, outputNames) {
    return {
        inputs: new Map(inputNames.map((n) => [n, { name: n }])),
        outputs: new Map(outputNames.map((n) => [n, { name: n }])),
    };
}

(async () => {
    console.log('== Case 1: chưa chọn port nào -> DISCOVERING ==');
    {
        const MH = loadMidiHealth({
            settings: {},
            rendererAccess: fakeAccess(['Port A'], ['Port A']),
            mainHealth: { started: true, configuredPortName: null, outputReady: false, inputOpen: false, lastOutputError: null, lastInputError: null, mappingCount: 0 },
        });
        const h = await MH.getMidiHealth();
        assert(h.status === MH.MIDI_STATE.DISCOVERING, `status=DISCOVERING (thực tế: ${h.status})`);
        assert(h.input.selected === false && h.output.selected === false, 'input/output.selected=false khi chưa chọn port');
        assert(h.verified === false, 'verified luôn false ở B1');
    }

    console.log('\n== Case 2: portName đã lưu nhưng KHÔNG có trong danh sách thật -> DISCONNECTED ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'Port Đã Mất' },
            rendererAccess: fakeAccess(['Port A'], ['Port A']),
            mainHealth: { started: true, configuredPortName: 'Port Đã Mất', outputReady: false, inputOpen: false, lastOutputError: 'No MIDI output found with name: Port Đã Mất', lastInputError: null, mappingCount: 0 },
        });
        const h = await MH.getMidiHealth();
        // Có lastOutputError THẬT nhưng output.detected=false -> ưu tiên DISCONNECTED (đúng
        // nhánh "port biến mất" B1-C), không phải ERROR (dành cho port CÓ tồn tại nhưng mở lỗi).
        assert(h.status === MH.MIDI_STATE.DISCONNECTED, `status=DISCONNECTED khi port mất hẳn (thực tế: ${h.status})`);
        assert(h.output.selected === true && h.output.detected === false, 'output.selected=true, detected=false — phân biệt đúng "đã chọn nhưng mất" vs "chưa chọn"');
    }

    console.log('\n== Case 3: port tồn tại + cả 2 backend xác nhận mở -> CONNECTED ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'LoopBe' },
            rendererAccess: fakeAccess(['LoopBe'], ['LoopBe']),
            mainHealth: { started: true, configuredPortName: 'LoopBe', outputReady: true, inputOpen: true, lastOutputError: null, lastInputError: null, mappingCount: 0 },
        });
        const h = await MH.getMidiHealth();
        assert(h.status === MH.MIDI_STATE.CONNECTED, `status=CONNECTED (thực tế: ${h.status})`);
        assert(h.output.connected === true, 'output.connected=true khi cả renderer detect + main outputReady');
        assert(h.input.connected === true, 'input.connected=true khi main inputOpen=true (input dựa main-only, xem ghi chú kiến trúc)');
    }

    console.log('\n== Case 4: port tồn tại trong renderer NHƯNG main báo lỗi mở -> ERROR (không phải CONNECTED giả) ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'LoopBe' },
            rendererAccess: fakeAccess(['LoopBe'], ['LoopBe']),
            mainHealth: { started: true, configuredPortName: 'LoopBe', outputReady: false, inputOpen: false, lastOutputError: 'RtMidi từ chối mở port (đang bị chiếm)', lastInputError: null, mappingCount: 0 },
        });
        const h = await MH.getMidiHealth();
        assert(h.status === MH.MIDI_STATE.ERROR, `status=ERROR khi main có lỗi mở port THẬT dù renderer thấy port tồn tại (thực tế: ${h.status})`);
        assert(h.error === 'RtMidi từ chối mở port (đang bị chiếm)', 'error field mang đúng lý do thật, không chung chung');
    }

    console.log('\n== Case 5: CONNECTED + có mapping đã lưu -> CONFIGURED ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'LoopBe' },
            rendererAccess: fakeAccess(['LoopBe'], ['LoopBe']),
            mainHealth: { started: true, configuredPortName: 'LoopBe', outputReady: true, inputOpen: true, lastOutputError: null, lastInputError: null, mappingCount: 3 },
        });
        const h = await MH.getMidiHealth();
        assert(h.status === MH.MIDI_STATE.CONFIGURED, `status=CONFIGURED khi có mapping (thực tế: ${h.status})`);
    }

    console.log('\n== Case 6: renderer chỉ thấy port ở OUTPUT, không ở INPUT (port lệch danh sách 2 backend) ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'LoopBe' },
            rendererAccess: fakeAccess([], ['LoopBe']), // input KHÔNG có port này trong renderer
            mainHealth: { started: true, configuredPortName: 'LoopBe', outputReady: true, inputOpen: false, lastOutputError: null, lastInputError: 'No MIDI input found with name: LoopBe', mappingCount: 0 },
        });
        const h = await MH.getMidiHealth();
        assert(h.input.connected === false, 'input.connected=false khi main không mở được input dù output OK — không lây trạng thái giữa 2 chiều');
        assert(h.output.connected === true, 'output.connected vẫn true — input lỗi không kéo output xuống sai');
    }

    console.log('\n== Case 7: main-process health không khả dụng (không phải Electron) -> không throw, báo rõ ==');
    {
        const MH = loadMidiHealth({
            settings: { midiOutputPort: 'LoopBe' },
            rendererAccess: fakeAccess(['LoopBe'], ['LoopBe']),
            mainHealth: null,
            mainAvailable: false,
        });
        const h = await MH.getMidiHealth();
        assert(h._detail.main.available === false, 'main.available=false khi electronAPI không tồn tại');
        assert(h.output.connected === false, 'output.connected=false khi không xác nhận được main (không lạc quan giả)');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
