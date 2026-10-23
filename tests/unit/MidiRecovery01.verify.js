/**
 * MidiRecovery01.verify.js — MIDI-RECOVERY-01
 * ---------------------------------------------------------------------------
 * LOẠI TEST: unit / main-process LOGIC với easymidi GIẢ + Web MIDI GIẢ (vm). KHÔNG phải Windows/RtMidi/loopMIDI
 * thật => KHÔNG chứng minh runtime Windows (xem REPORT.md: BLOCKED_USER_TEST).
 *
 * Phủ 10 mục bắt buộc của task:
 *  1 cổng đã lưu không tồn tại -> không CONNECTED        6 gọi Auto Connect liên tiếp không tạo trùng/chập chờn
 *  2 Output ok + Input lỗi -> OUTPUT_READY (partial)      7 một lần bấm = một luồng thao tác (single-flight)
 *  3 Input ok + Output lỗi -> INPUT_READY (partial)       8 Test Note/CC dùng đúng backend (main), không Failure vì Web MIDI
 *  4 cả hai ok -> CONNECTED                               9 midiInputPort riêng không bị ghi đè
 *  5 lỗi gốc "Internal RtMidi error" được giữ nguyên      10 mapping/byte Note-CC-channel không đổi
 *
 * Chạy: node tests/unit/MidiRecovery01.verify.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function check(label, cond, extra) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// ---------------------------------------------------------------- easymidi giả (điều khiển được)
const mock = {
    outputs: [], inputs: [],
    failOutputOpen: null,   // string | null — message ném khi mở Output
    failInputOpen: null,    // string | null
    failInputReopen: false, // mô phỏng "mở lần 2 cùng cổng thất bại" (race/độc quyền) — chỉ sau lần mở đầu
    created: { output: 0, input: 0 }, liveOut: [], liveIn: [], sentLog: [],
};
function resetMock() {
    mock.outputs = ['AUTO MENU AI', 'StudioRack']; mock.inputs = ['AUTO MENU AI', 'StudioRack'];
    mock.failOutputOpen = null; mock.failInputOpen = null; mock.failInputReopen = false;
    mock.created = { output: 0, input: 0 }; mock.liveOut = []; mock.liveIn = []; mock.sentLog = [];
}
class FakeOutput {
    constructor(name, virtual) {
        if (!virtual && !mock.outputs.includes(name)) throw new Error('No MIDI output found with name: ' + name);
        if (mock.failOutputOpen) throw new Error(mock.failOutputOpen);
        this.name = name; this.open = true; mock.created.output++; mock.liveOut.push(this);
    }
    send(type, msg) { mock.sentLog.push({ port: this.name, type, msg }); }
    close() { this.open = false; }
}
class FakeInput {
    constructor(name) {
        if (!mock.inputs.includes(name)) throw new Error('No MIDI input found with name: ' + name);
        if (mock.failInputOpen) throw new Error(mock.failInputOpen);
        if (mock.failInputReopen && mock.created.input >= 1) throw new Error('Internal RtMidi error');
        this.name = name; this.open = true; this._h = {}; mock.created.input++; mock.liveIn.push(this);
    }
    on(evt, fn) { this._h[evt] = fn; }
    removeListener(evt) { delete this._h[evt]; }
    close() { this.open = false; }
}
const fakeEasymidi = { Output: FakeOutput, Input: FakeInput, getOutputs: () => mock.outputs.slice(), getInputs: () => mock.inputs.slice() };
const origLoad = Module._load;
Module._load = function (request) { if (request === 'easymidi') return fakeEasymidi; return origLoad.apply(this, arguments); };

function freshRuntime(settings) {
    const p = path.join(ROOT, 'core', 'command-engine-js', 'runtime.js');
    delete require.cache[require.resolve(p)];
    const R = require(p);
    const store = { ...settings };
    R.start({ readSettingsFile: () => store });
    return { R, store };
}
const openCount = () => ({ out: mock.liveOut.filter((o) => o.open).length, in: mock.liveIn.filter((i) => i.open).length });
const quiet = console.log;
function silent(fn) { console.log = () => {}; try { return fn(); } finally { console.log = quiet; } }

(async () => {
    // ===================================================================== 1
    console.log('== 1. Cổng đã lưu KHÔNG tồn tại -> không được báo CONNECTED ==');
    {
        resetMock(); mock.outputs = ['StudioRack']; mock.inputs = ['StudioRack'];
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const r = silent(() => R.autoConnect({ mode: 'manual' }));
        check('status = DISCONNECTED, connected=false', r.status === 'DISCONNECTED' && r.connected === false, r.status);
        check('output.ready=false và input.ready=false', r.output.ready === false && r.input.ready === false);
        check('0 Output/0 Input được mở', openCount().out === 0 && openCount().in === 0);
        R.stop();
    }

    // ===================================================================== 2/5
    console.log('\n== 2+5. Output mở OK, Input lỗi "Internal RtMidi error" -> OUTPUT_READY (partial), lỗi gốc giữ nguyên ==');
    {
        resetMock(); mock.failInputOpen = 'Internal RtMidi error';
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const r = silent(() => R.autoConnect({ mode: 'auto' }));
        check('status = OUTPUT_READY, partial=true, connected=false', r.status === 'OUTPUT_READY' && r.partial === true && r.connected === false, { s: r.status });
        check('output.ready=true, input.ready=false', r.output.ready === true && r.input.ready === false);
        check('input.error === "Internal RtMidi error" NGUYÊN VĂN (không bị thay bằng câu chung chung)', r.input.error === 'Internal RtMidi error', r.input.error);
        check('input.detail.stage === "open" (lỗi ở bước mở cổng, không phải dò tên)', r.input.detail && r.input.detail.stage === 'open', r.input.detail);
        const h = R.getHealth();
        check('getHealth().lastInputError nguyên văn + lastInputErrorDetail có available[]', h.lastInputError === 'Internal RtMidi error' && Array.isArray(h.lastInputErrorDetail.available), h.lastInputErrorDetail);
        check('result.ok (nghĩa cũ "đã phân giải tên") vẫn true nhưng KHÔNG được dùng làm bằng chứng: connected=false', r.ok === true && r.connected === false);
        const v = await R.verifyMidiOutput({ timeoutMs: 50 });
        check('Verify: NOT_CONNECTED và detail nêu rõ Input ĐÓNG + lỗi gốc', v.reason === 'NOT_CONNECTED' && /Input: ĐÓNG \(Internal RtMidi error\)/.test(v.detail) && v.output === true && v.input === false, v);
        R.stop();
    }

    // ===================================================================== 3
    console.log('\n== 3. Input mở OK, Output lỗi -> INPUT_READY, không báo kết nối toàn bộ ==');
    {
        resetMock(); mock.failOutputOpen = 'Internal RtMidi error';
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const r = silent(() => R.autoConnect({ mode: 'auto' }));
        check('status = INPUT_READY, partial=true, connected=false', r.status === 'INPUT_READY' && r.partial === true && r.connected === false, r.status);
        check('output.error giữ nguyên "Internal RtMidi error", output.detail.stage="open"', r.output.error === 'Internal RtMidi error' && r.output.detail.stage === 'open', r.output);
        const send = await R.sendMidi({ kind: 'cc', number: 20, value: 127, channel: 0 });
        check('sendMidi khi Output đóng -> ok=false reason=OUTPUT_NOT_OPEN kèm lỗi gốc (không báo thành công)', send.ok === false && send.reason === 'OUTPUT_NOT_OPEN' && send.detail === 'Internal RtMidi error', send);
        R.stop();
    }

    // ===================================================================== 4
    console.log('\n== 4. Output + Input đều mở OK -> CONNECTED ==');
    {
        resetMock();
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const r = silent(() => R.autoConnect({ mode: 'auto' }));
        check('status = CONNECTED, connected=true, partial=false', r.status === 'CONNECTED' && r.connected === true && r.partial === false, r.status);
        const v = await R.verifyMidiOutput({ timeoutMs: 40 });
        check('Verify khi cả hai mở: không phải NOT_CONNECTED (TIMEOUT là đúng vì fake không loopback)', v.reason === 'TIMEOUT', v);
        check('deriveBackendStatus thuần: 4 tổ hợp', ['CONNECTED', 'OUTPUT_READY', 'INPUT_READY', 'ERROR'].join() ===
            [R.deriveBackendStatus({ outputReady: 1, inputOpen: 1 }), R.deriveBackendStatus({ outputReady: 1, inputOpen: 0 }), R.deriveBackendStatus({ outputReady: 0, inputOpen: 1 }), R.deriveBackendStatus({ outputReady: 0, inputOpen: 0, outputError: 'x', resolvedPortName: 'P' })].map((x) => x.status).join());
        R.stop();
    }

    // ===================================================================== 6
    console.log('\n== 6. Auto Connect liên tiếp: không tạo driver/listener trùng, không chập chờn ==');
    {
        resetMock();
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const res = silent(() => [R.autoConnect({ mode: 'auto' }), R.autoConnect({ mode: 'auto' }), R.autoConnect({ mode: 'auto' })]);
        check('3 lần liên tiếp: cùng status CONNECTED', res.every((r) => r.status === 'CONNECTED'));
        check('lần 2,3 được GỘP (coalesced) — không thao tác mở cổng thật', res[0].coalesced === false && res[1].coalesced === true && res[2].coalesced === true);
        check('chỉ tạo 1 Output + 1 Input (start() 1 lần, Auto Connect 0 lần mở lại)', mock.created.output === 1 && mock.created.input === 1, mock.created);
        check('chỉ 1 Output + 1 Input đang mở', openCount().out === 1 && openCount().in === 1, openCount());

        // Ngoài cửa sổ gộp: vẫn KHÔNG đóng/mở lại cổng đang tốt (idempotent)
        const realNow = Date.now; Date.now = () => realNow() + 5000;
        const later = silent(() => R.autoConnect({ mode: 'auto' }));
        Date.now = realNow;
        check('Sau khi hết cửa sổ gộp: chạy thật nhưng tái sử dụng cổng -> vẫn CONNECTED, created không tăng', later.status === 'CONNECTED' && later.coalesced === false && mock.created.output === 1 && mock.created.input === 1, mock.created);

        // Setup lưu nhiều lần (setup-changed) không phá Input đang tốt — kịch bản "Verify OK rồi NOT_CONNECTED"
        mock.failInputReopen = true;
        silent(() => { R.reloadMappings(); R.reloadMappings(); R.reloadMappings(); });
        check('reloadMappings x3 khi cổng KHÔNG đổi: Input vẫn mở (không close+mở lại), created.input vẫn 1', R.getHealth().inputOpen === true && mock.created.input === 1, mock.created);
        const stats = R.getHealth().autoConnectStats;
        check('autoConnectStats ghi nhận calls=4, coalesced=2', stats.calls === 4 && stats.coalesced === 2, stats);
        R.stop();
    }

    // ===================================================================== 9
    console.log('\n== 9. midiInputPort riêng không bị Auto Connect ghi đè bằng tên Output ==');
    {
        resetMock();
        const { R, store } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI', midiInputPort: 'StudioRack' }));
        const before = JSON.stringify(store);
        const r = silent(() => R.autoConnect({ mode: 'auto' }));
        const h = R.getHealth();
        check('Output = AUTO MENU AI, Input = StudioRack (riêng biệt)', h.configuredPortName === 'AUTO MENU AI' && h.configuredInputPortName === 'StudioRack' && h.openInputPortName === 'StudioRack' && h.openOutputPortName === 'AUTO MENU AI', h);
        check('Auto Connect KHÔNG ghi settings (midiInputPort/midiOutputPort nguyên vẹn)', JSON.stringify(store) === before);
        check('Input riêng không có trong danh sách -> lỗi rõ ràng, KHÔNG âm thầm đổi sang tên Output',
            (() => { mock.inputs = ['AUTO MENU AI']; const x = silent(() => { const t = freshRuntime({ midiOutputPort: 'AUTO MENU AI', midiInputPort: 'Ghost In' }); const rr = t.R.autoConnect({ mode: 'auto' }); t.R.stop(); return rr; }); return x.input.ready === false && x.input.port === 'Ghost In' && x.input.detail.stage === 'detect' && x.status === 'OUTPUT_READY'; })());
        resetMock();
        const t2 = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        silent(() => t2.R.autoConnect({ mode: 'auto' }));
        check('Chưa cấu hình midiInputPort -> fallback theo tên Output (tương thích cũ)', t2.R.getHealth().configuredInputPortName === 'AUTO MENU AI' && t2.R.getHealth().inputOpen === true);
        t2.R.stop(); R.stop();
    }

    // ===================================================================== 10 (+ sendMidi byte-compat)
    console.log('\n== 10. Byte Note/CC/channel của đường main KHỚP đường Web MIDI cũ ==');
    {
        resetMock();
        const { R } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const cases = [
            [{ kind: 'cc', number: 20, value: 127, channel: 0 }, [0xb0, 20, 127]],
            [{ kind: 'cc', number: 119, value: 42, channel: 15 }, [0xbf, 119, 42]],
            [{ kind: 'noteon', number: 60, value: 100, channel: 0 }, [0x90, 60, 100]],
            [{ kind: 'noteoff', number: 60, value: 0, channel: 0 }, [0x80, 60, 0]],
            [{ kind: 'cc', number: 200, value: 300, channel: 17 }, [0xb1, 200 & 0x7f, 300 & 0x7f]],
        ];
        for (const [msg, bytes] of cases) {
            mock.sentLog.length = 0;
            const r = await R.sendMidi(msg);
            const sent = mock.sentLog[0];
            // dựng lại byte từ message easymidi để so với byte Web MIDI cũ
            const status = ({ cc: 0xb0, noteon: 0x90, noteoff: 0x80 })[sent && sent.type] | (sent ? sent.msg.channel : 0);
            const b = sent ? [status, sent.msg.controller ?? sent.msg.note, sent.msg.value ?? sent.msg.velocity] : null;
            check(`sendMidi ${JSON.stringify(msg)} -> byte ${JSON.stringify(bytes)}`, r.ok === true && r.delivery === 'UNCONFIRMED' && JSON.stringify(b) === JSON.stringify(bytes) && JSON.stringify(r.bytes) === JSON.stringify(bytes), { r, sent });
        }
        const bad = await R.sendMidi({ kind: 'sysex', number: 1 });
        check('kind lạ -> INVALID_PARAMS, không gửi', bad.ok === false && bad.reason === 'INVALID_PARAMS' && mock.sentLog.length === 1);
        check('normalizeMidiMessage (đường nhận/D1) không đổi: CC ch1 #20 v127', JSON.stringify(R.normalizeMidiMessage([0xb0, 20, 127])) === JSON.stringify({ type: 'cc', channel: 1, number: 20, value: 127 }));
        R.stop();
    }

    // ===================================================================== 8 (renderer -> IPC giả -> runtime thật)
    console.log('\n== 8. Test Note/CC: renderer gửi qua BACKEND main (không phụ thuộc Web MIDI) ==');
    {
        function makeRenderer({ webOutputs, runtime, store, withMain = true }) {
            const sandbox = {
                console, setTimeout, clearTimeout, Date, Math, Promise,
                navigator: { requestMIDIAccess: async () => { sandbox.__webMidiCalled = (sandbox.__webMidiCalled || 0) + 1; return { outputs: new Map(webOutputs.map((n) => [n, { name: n, id: n, send() { sandbox.__webSent = (sandbox.__webSent || 0) + 1; } }])), inputs: new Map() }; } },
                localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            };
            sandbox.window = sandbox;
            sandbox.electronAPI = { loadSettingsSync: () => store, saveSettingsSync: () => true };
            if (withMain) {
                sandbox.electronAPI.sendMidiMessage = (m) => runtime.sendMidi(m);
                sandbox.electronAPI.listMidiPorts = async () => runtime.listPorts();
            }
            vm.createContext(sandbox);
            vm.runInContext(read('ui/js/appSettings.js') + '\n;this.__api = { loadSetup, sendMidiCC, sendMidiNoteOn, sendMidiNotePulse, listMidiOutputs };', sandbox);
            sandbox.__api.loadSetup();
            return sandbox;
        }
        resetMock();
        const { R, store } = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        // Đúng bằng chứng 23/10/2026: Web MIDI outputs KHÔNG có "AUTO MENU AI"
        const sb = makeRenderer({ webOutputs: ['StudioRack', 'SG Device I/O'], runtime: R, store });
        const ok1 = await sb.__api.sendMidiCC(20, 127, 0);
        check('sendMidiCC OK dù Web MIDI không liệt kê "AUTO MENU AI" (trước đây: MIDI_PORT_NOT_FOUND)', ok1 === true, sb.getLastMidiSendResult && sb.getLastMidiSendResult());
        const ok2 = await sb.__api.sendMidiNotePulse(60, 100, 0, 20);
        await new Promise((r) => setTimeout(r, 80));
        check('sendMidiNotePulse OK: Note On rồi Note Off đều tới cổng AUTO MENU AI qua MidiDriver', ok2 === true && mock.sentLog.filter((x) => x.type === 'noteon').length === 1 && mock.sentLog.filter((x) => x.type === 'noteoff').length === 1 && mock.sentLog.every((x) => x.port === 'AUTO MENU AI'), mock.sentLog);
        check('KHÔNG đụng Web MIDI để gửi (requestMIDIAccess 0 lần, send Web 0 lần)', !sb.__webMidiCalled && !sb.__webSent, { c: sb.__webMidiCalled, s: sb.__webSent });
        check('getLastMidiSendResult ghi rõ sender = main-midi-driver (easymidi)', /main-midi-driver/.test(sb.getLastMidiSendResult().sender), sb.getLastMidiSendResult());
        const list = await sb.__api.listMidiOutputs();
        check('Danh sách Output cho dropdown lấy từ backend thật (có "AUTO MENU AI"), nguồn main-easymidi', list.some((p) => p.name === 'AUTO MENU AI') && sb.__midiOutputListSource === 'main-easymidi', list);

        // Lỗi ở main -> false + lý do ở tầng main, KHÔNG rơi âm thầm sang Web MIDI
        R.stop();
        resetMock(); mock.failOutputOpen = 'Internal RtMidi error';
        const t = silent(() => freshRuntime({ midiOutputPort: 'AUTO MENU AI' }));
        const sb2 = makeRenderer({ webOutputs: ['AUTO MENU AI'], runtime: t.R, store: t.store });
        const bad = await sb2.__api.sendMidiCC(20, 127, 0);
        const lr = sb2.getLastMidiSendResult();
        check('Output main lỗi -> sendMidiCC=false, reason=OUTPUT_NOT_OPEN, lỗi gốc giữ nguyên', bad === false && lr.reason === 'OUTPUT_NOT_OPEN' && lr.detail === 'Internal RtMidi error', lr);
        check('và KHÔNG gửi mù qua Web MIDI dù Web MIDI có cổng cùng tên', !sb2.__webSent && !sb2.__webMidiCalled);

        // Không có electronAPI.sendMidiMessage (trình duyệt thường/test cũ) -> fallback Web MIDI như cũ
        t.R.stop(); resetMock();
        const sb3 = makeRenderer({ webOutputs: ['AUTO MENU AI'], runtime: null, store: { midiOutputPort: 'AUTO MENU AI' }, withMain: false });
        const fb = await sb3.__api.sendMidiCC(20, 127, 0);
        check('Không có main IPC -> fallback Web MIDI (tương thích test/trình duyệt cũ)', fb === true && sb3.__webSent === 1);
    }

    // ===================================================================== midiHealth (renderer) — trạng thái từng phía
    console.log('\n== C. midiHealth.js: trạng thái từng phía, bằng chứng từng backend ==');
    {
        function loadMH({ settings, webIn, webOut, mainHealth, mainPorts }) {
            const win = { electronAPI: { getMainMidiHealth: async () => mainHealth } };
            if (mainPorts) win.electronAPI.listMidiPorts = async () => mainPorts;
            const access = { inputs: new Map(webIn.map((n) => [n, { name: n }])), outputs: new Map(webOut.map((n) => [n, { name: n }])) };
            const fn = new Function('window', 'getMidiAccess', 'getSetting', read('ui/js/midiHealth.js') + '\nreturn window.MidiHealth;');
            return fn(win, () => Promise.resolve(access), (k) => settings[k]);
        }
        const base = { started: true, configuredPortName: 'AUTO MENU AI', configuredInputPortName: 'AUTO MENU AI', outputReady: true, inputOpen: false, lastOutputError: null, lastInputError: 'Internal RtMidi error', lastOutputErrorDetail: null, lastInputErrorDetail: { stage: 'open' }, mappingCount: 0 };
        // Đúng bằng chứng: Web MIDI in có AUTO MENU AI, out không có; main: output mở, input lỗi
        const MH = loadMH({ settings: { midiOutputPort: 'AUTO MENU AI' }, webIn: ['StudioRack', 'AUTO MENU AI'], webOut: ['StudioRack', 'SG Device I/O'], mainHealth: base, mainPorts: { ok: true, inputs: ['AUTO MENU AI', 'StudioRack'], outputs: ['AUTO MENU AI', 'StudioRack'] } });
        const h = await MH.getMidiHealth();
        check('Output: detectedByMain=true, detectedByRenderer=false -> detected=true (backend gửi thấy cổng)', h.output.detectedByMain === true && h.output.detectedByRenderer === false && h.output.detected === true);
        check('Output connected=true dù Web MIDI không thấy (main đã mở thật)', h.output.connected === true);
        check('Input connected=false + error nguyên văn "Internal RtMidi error"', h.input.connected === false && h.input.error === 'Internal RtMidi error');
        check('status = OUTPUT_READY, partial=true (không còn ERROR/CONNECTING chung chung)', h.status === 'OUTPUT_READY' && h.partial === true, h.status);
        check('errors.output=null, errors.input="Internal RtMidi error" tách riêng', h.errors.output === null && h.errors.input === 'Internal RtMidi error');

        const both = loadMH({ settings: { midiOutputPort: 'P' }, webIn: ['P'], webOut: ['P'], mainHealth: { ...base, configuredPortName: 'P', configuredInputPortName: 'P', outputReady: false, inputOpen: false, lastOutputError: 'E-out', lastInputError: 'E-in' }, mainPorts: { ok: true, inputs: ['P'], outputs: ['P'] } });
        const hb = await both.getMidiHealth();
        check('Cả hai lỗi -> ERROR, chuỗi error có nhãn OUT/IN (không che lỗi nào)', hb.status === 'ERROR' && /OUT: E-out/.test(hb.error) && /IN: E-in/.test(hb.error), hb.error);

        const split = loadMH({ settings: { midiOutputPort: 'OUT-A', midiInputPort: 'IN-B' }, webIn: ['IN-B'], webOut: ['OUT-A'], mainHealth: { started: true, configuredPortName: 'OUT-A', configuredInputPortName: 'IN-B', outputReady: true, inputOpen: true, lastOutputError: null, lastInputError: null, mappingCount: 0 }, mainPorts: { ok: true, inputs: ['IN-B'], outputs: ['OUT-A'] } });
        const hs = await split.getMidiHealth();
        check('Input riêng (IN-B) so với configuredInputPortName, không so với tên Output -> CONNECTED (trước đây Input luôn conn=✕)', hs.input.connected === true && hs.output.connected === true && hs.status === 'CONNECTED', hs.status);

        const ghost = loadMH({ settings: { midiOutputPort: 'GONE' }, webIn: [], webOut: [], mainHealth: { started: true, configuredPortName: null, outputReady: false, inputOpen: false, lastOutputError: null, lastInputError: null, mappingCount: 0 }, mainPorts: { ok: true, inputs: [], outputs: [] } });
        check('Cổng đã lưu không còn tồn tại -> DISCONNECTED (không CONNECTED)', (await ghost.getMidiHealth()).status === 'DISCONNECTED');
    }

    // ===================================================================== 7
    console.log('\n== 7. Một lần bấm Auto Connect = một luồng thao tác ==');
    {
        let ipcCalls = 0;
        const win = { electronAPI: { autoConnectMidi: async () => { ipcCalls++; await new Promise((r) => setTimeout(r, 30)); return { status: 'CONNECTED' }; } } };
        const fn = new Function('window', 'getMidiAccess', 'getSetting', read('ui/js/midiHealth.js') + '\nreturn window.MidiHealth;');
        const MH = fn(win, undefined, () => '');
        const results = await Promise.all(Array.from({ length: 11 }, () => MH.autoConnect({ mode: 'auto' })));
        check('11 lần bấm dồn dập (như log 11 dòng/2 giây) -> đúng 1 IPC autoConnectMidi', ipcCalls === 1, ipcCalls);
        check('cả 11 nhận CÙNG một kết quả nhất quán', results.every((r) => r === results[0]));
        await MH.autoConnect({ mode: 'auto' });
        check('sau khi xong, lần bấm mới chạy lại bình thường (ipcCalls=2)', ipcCalls === 2, ipcCalls);

        const html = read('ui/setup.html');
        const mon = read('ui/js/setupMidiMonitor.js');
        check('STATIC: setupMidiMonitor.js chỉ được nạp 1 lần trong setup.html', (html.match(/setupMidiMonitor\.js/g) || []).length === 1);
        check('STATIC: chỉ có 1 addEventListener cho #btnAutoConnectMidi, và 1 nút trong HTML', (mon.match(/getElementById\("btnAutoConnectMidi"\)/g) || []).length === 1 && (html.match(/id="btnAutoConnectMidi"/g) || []).length === 1);
        check('STATIC: không file JS nào khác gọi autoConnectMidi/.click() lên nút', !/btnAutoConnectMidi/.test(read('ui/js/setup.js') + read('ui/js/renderer.js') + read('ui/js/setupNav.js')));
        check('STATIC: UI Auto Connect không còn dùng result.ok làm điều kiện báo ✅', !/if \(result\.ok\)/.test(mon));
    }

    // ===================================================================== phạm vi
    console.log('\n== Phạm vi: không đổi HTML / D1 / mapping ==');
    {
        const { execSync } = require('child_process');
        let changed = [];
        try { changed = execSync('git diff --name-only HEAD', { cwd: ROOT }).toString().split('\n').filter(Boolean); } catch { /* không phải git repo */ }
        if (changed.length) {
            check('git diff KHÔNG chứa file .html', !changed.some((f) => /\.html$/.test(f)), changed);
            check('git diff KHÔNG chứa d1Loader/commandEngine/capabilityRegistry/docs/d1', !changed.some((f) => /d1Loader|commandEngine|capabilityRegistry|docs\/d1/.test(f)), changed);
        } else {
            console.log('  INFO  không đọc được git diff (bỏ qua 2 kiểm tra phạm vi — đã kiểm bằng tay trong REPORT.md)');
        }
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
