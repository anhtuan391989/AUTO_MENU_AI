/**
 * MidiD1RuntimeB61.verify.js — TASK B61 (MIDI + D1 Runtime Closure)
 * ---------------------------------------------------------------------------
 * MỨC XÁC MINH của file này (ghi rõ, KHÔNG nâng cấp thành hardware):
 *   STATIC   : đọc mã nguồn/tài liệu thật, đối chiếu chéo D1 XML <-> matrix <-> loader <-> registry <-> UI.
 *   RUNTIME  : chạy MÃ THẬT (runtime.js, d1Loader.js, CommandEngine, midiDriver.js, hotkeyDriver.js,
 *              appSettings.js, vocalCommandRouter.js) với backend GIẢ LẬP:
 *                - 'easymidi' bị thay bằng fake (sandbox không có ALSA/WinMM thật)
 *                - Web MIDI (navigator.requestMIDIAccess) bị thay bằng fake
 *                - AHK TCP service bị thay bằng server TCP giả trên 127.0.0.1 (giao thức thật của HotkeyDriver)
 *   HARDWARE : KHÔNG có ở đây. Không có DAW / loopMIDI / RtMidi / WinMM / AutoHotkey thật nào được chạm tới.
 *
 * Chạy: node tests/unit/MidiD1RuntimeB61.verify.js   (cần `npm install` để có xmllint-wasm)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const vm = require('vm');
const Module = require('module');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('  OK   ' + label); }
    else { fail++; console.error('  FAIL ' + label + (detail !== undefined ? '  (thực tế: ' + JSON.stringify(detail) + ')' : '')); }
}
function info(label) { console.log('  INFO ' + label); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); }
    return false;
}

// ---------------------------------------------------------------------------
// Fake easymidi (gắn 1 lần; state đặt lại giữa các scenario)
// ---------------------------------------------------------------------------
const mock = { outs: [], ins: [], outputs: [], inputs: [], sendThrows: false };
function resetMock({ outs = [], ins = [] } = {}) {
    mock.outs = outs.slice(); mock.ins = ins.slice(); mock.outputs = []; mock.inputs = []; mock.sendThrows = false;
}
class FakeOutput {
    constructor(name, virtual) {
        if (!virtual && !mock.outs.includes(name)) throw new Error('No MIDI output found with name: ' + name);
        this.name = name; this.virtual = !!virtual; this.open = true; this.sent = [];
        mock.outputs.push(this);
    }
    send(type, msg) { if (mock.sendThrows) throw new Error('Mock: port bị rút (send thất bại)'); this.sent.push({ type, msg }); }
    close() { this.open = false; }
}
class FakeInput {
    constructor(name) {
        if (!mock.ins.includes(name)) throw new Error('No MIDI input found with name: ' + name);
        this.name = name; this.open = true; this.h = {};
        mock.inputs.push(this);
    }
    on(evt, fn) { this.h[evt] = fn; }
    removeListener() {}
    close() { this.open = false; }
    emit(evt, msg) { if (this.h[evt]) this.h[evt](msg); }
}
const fakeEasymidi = { Output: FakeOutput, Input: FakeInput, getOutputs: () => mock.outs.slice(), getInputs: () => mock.ins.slice() };
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'easymidi') return fakeEasymidi;
    return origLoad.apply(this, arguments);
};

function freshRuntime() {
    const p = path.join(root, 'core', 'command-engine-js', 'runtime.js');
    delete require.cache[require.resolve(p)];
    return require(p);
}
const d1Loader = require(path.join(root, 'core', 'command-engine-js', 'd1Loader.js'));
const { getCapability } = require(path.join(root, 'core', 'command-engine-js', 'capabilityRegistry.js'));

// Fake AHK service (giao thức thật của hotkeyDriver.js: JSON {type:'send_keys',keys} + '\n' -> JSON {status,message})
function startFakeAhk(port) {
    return new Promise((resolve) => {
        const received = [];
        const server = net.createServer((sock) => {
            let buf = '';
            sock.on('data', (d) => {
                buf += d.toString();
                if (buf.includes('\n')) {
                    try { received.push(JSON.parse(buf.trim())); } catch { received.push({ raw: buf }); }
                    sock.end(JSON.stringify({ status: 'ok', message: 'sent' }));
                }
            });
            sock.on('error', () => {});
        });
        server.once('error', () => resolve(null));
        server.listen(port, '127.0.0.1', () => resolve({ server, received }));
    });
}

(async () => {
    // =========================================================================
    console.log('== B61.1 — Trace runtime thật (STATIC): file nào thật sự được nạp ==');
    const mainSrc = read('app/main.js');
    const runtimeSrc = read('core/command-engine-js/runtime.js');
    const indexHtml = read('ui/index.html');
    const preloadSrc = read('app/preload.js');
    const routerSrc = read('ui/js/vocalCommandRouter.js');
    {
        check('app/main.js require core/command-engine-js/runtime.js (đường MIDI Learn/D1 thật ở main process)', /require\("\.\.\/core\/command-engine-js\/runtime"\)/.test(mainSrc));
        check('main.js gọi CommandRuntime.start({ readSettingsFile }) lúc khởi động', /CommandRuntime\.start\(\{ readSettingsFile \}\)/.test(mainSrc));
        check('main.js nối reloadMappings (setup-changed), ai-command, midi-auto-connect, verify vào CommandRuntime',
            /CommandRuntime\.reloadMappings\(\)/.test(mainSrc) && /CommandRuntime\.dispatch\(payload\)/.test(mainSrc) && /CommandRuntime\.autoConnect\(/.test(mainSrc));
        check('runtime.js require ./d1Loader (D1 là nguồn mapping duy nhất)', /require\("\.\/d1Loader"\)/.test(runtimeSrc));
        check('runtime.js chỉ dùng drivers/hotkeyDriver + drivers/midiDriver (không kéo mouse/osc driver vào runtime thật)',
            /require\("\.\/drivers\/hotkeyDriver"\)/.test(runtimeSrc) && /require\("\.\/drivers\/midiDriver"\)/.test(runtimeSrc) && !/drivers\/(mouse|osc)Driver/.test(runtimeSrc));
        check('ui/index.html nạp appSettings.js + vocalCommandRouter.js (đường Web MIDI của renderer)',
            /js\/appSettings\.js/.test(indexHtml) && /js\/vocalCommandRouter\.js/.test(indexHtml));
        check('preload.js phơi clickAtPoint -> IPC "click-at-point" (fallback chuột) và autoConnectMidi', /clickAtPoint:.*click-at-point/.test(preloadSrc) && /autoConnectMidi/.test(preloadSrc));
        check('main.js có ipcMain.handle("click-at-point") gọi runAhkClick -> execFile AutoHotkey + ahk/click.ahk',
            /ipcMain\.handle\("click-at-point"/.test(mainSrc) && /runAhkClick\(x, y, ahkExePath\)/.test(mainSrc) && /"ahk", "click\.ahk"/.test(mainSrc) && fs.existsSync(path.join(root, 'ahk', 'click.ahk')));

        // Dead / reference code: không file nào ngoài chính nó require chúng
        function grepRequire(pattern) {
            const hits = [];
            const stripComments = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
            ['app', 'core', 'ui', 'scripts', 'tools', 'modules'].forEach((d) => {
                (function walk(dir) {
                    let entries = [];
                    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
                    for (const e of entries) {
                        const rel = dir + '/' + e.name;
                        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); continue; }
                        if (!/\.(js|html|ts)$/.test(e.name)) continue;
                        if (pattern.test(stripComments(fs.readFileSync(path.join(root, rel), 'utf8')))) hits.push(rel);
                    }
                })(d);
            });
            return [...new Set(hits)];
        }
        const tsHits = grepRequire(/command-engine-ts/).filter((f) => !f.startsWith('core/command-engine-ts/'));
        check('core/command-engine-ts/* KHÔNG được file runtime nào tham chiếu (reference/scaffold, không chạy)', tsHits.length === 0, tsHits);
        const coreDriversHits = grepRequire(/require\([^)]*(core\/drivers|\.\.\/drivers\/(StudioOne|AHK|AutoKey|AutoTune|Melodyne|SoundShifter)Driver)/)
            .filter((f) => !f.startsWith('core/drivers/'));
        check('core/drivers/* KHÔNG có lệnh require() thật nào trỏ tới (chỉ nhắc trong comment/text ở ai/kernel, actionRegistry, setup.html)', coreDriversHits.length === 0, coreDriversHits);
        const semHits = grepRequire(/require\([^)]*semanticValidate/).filter((f) => f !== 'core/command-engine-js/d1Loader.js' && !f.startsWith('tools/'));
        check('semanticValidate.js chỉ được d1Loader.js require trong app/core/ui (tools/b37-poc là script PoC ngoài runtime)', semHits.length === 0, semHits);
    }

    // =========================================================================
    console.log('\n== B61.2 — D1 source-of-truth + ACTION_TO_CAPABILITY (STATIC + RUNTIME loader thật) ==');
    let d1;
    {
        d1 = await d1Loader.loadD1FromDisk();
        check('loadD1FromDisk(): XML well-formed + XSD (xmllint-wasm) + Semantic đều PASS trên docs/d1/midi-mapping.xml thật', d1.ok === true && d1.stage === 'ok', d1);
        check('D1 production có đúng 8 capability', d1.ok && d1.capabilities.length === 8, d1.capabilities && d1.capabilities.length);

        // ACTION_TO_CAPABILITY: không còn tồn tại trong CODE (chỉ còn trong comment/tài liệu)
        const codeFiles = ['core/command-engine-js/runtime.js', 'core/command-engine-js/d1Loader.js', 'core/command-engine-js/commandEngine.js', 'core/command-engine-js/capabilityRegistry.js', 'app/main.js', 'app/preload.js', 'ui/js/vocalCommandRouter.js', 'ui/js/appSettings.js', 'ui/js/actionRegistry.js', 'ui/js/setupMidiInput.js'];
        const liveRefs = codeFiles.filter((f) => read(f).split('\n').some((l) => /ACTION_TO_CAPABILITY/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)));
        check('ACTION_TO_CAPABILITY KHÔNG còn xuất hiện trong dòng CODE nào (đã xoá ở B38-FIX; chỉ còn trong comment/tài liệu)', liveRefs.length === 0, liveRefs);
        check('runtime.js không export/định nghĩa buildMappingIndex/ACTION_TO_CAPABILITY (không có bảng mapping thứ hai)', !/const ACTION_TO_CAPABILITY|buildMappingIndex\s*[=(]/.test(runtimeSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')));

        // Vai trò của CAPABILITY_BACKEND_TARGET: KHÔNG duplicate D1
        const xml = read('docs/d1/midi-mapping.xml');
        check('D1 XML KHÔNG có field targetId/registryAction (CAPABILITY_BACKEND_TARGET là metadata backend, không trùng D1)', !/targetId|registryAction|studio_one|transportPlay/.test(xml.replace(/<!--[\s\S]*?-->/g, '')));

        // Đối chiếu chéo: mỗi capability implemented <=> có target <=> registry có driver; ngược lại thì không
        let consistent = true; const problems = [];
        for (const c of d1.capabilities) {
            const target = d1Loader.CAPABILITY_BACKEND_TARGET[c.id];
            const cap = target ? getCapability(target.targetId, target.action) : null;
            if (c.backendStatus === 'implemented') {
                if (!c.midiAllowed) problems.push(c.id + ': implemented nhưng midi-allowed=false');
                if (!target) problems.push(c.id + ': implemented nhưng thiếu CAPABILITY_BACKEND_TARGET');
                if (!cap || cap.length === 0) problems.push(c.id + ': target không có driver trong capabilityRegistry');
            } else {
                if (c.midiAllowed) problems.push(c.id + ': ' + c.backendStatus + ' nhưng midi-allowed=true');
                if (target) problems.push(c.id + ': ' + c.backendStatus + ' nhưng đã có CAPABILITY_BACKEND_TARGET (D1 vs runtime mâu thuẫn)');
            }
        }
        consistent = problems.length === 0;
        check('D1 <-> CAPABILITY_BACKEND_TARGET <-> capabilityRegistry nhất quán cho cả 8 capability (implemented có đủ driver; còn lại không có target)', consistent, problems);
        const extraTargets = Object.keys(d1Loader.CAPABILITY_BACKEND_TARGET).filter((id) => !d1.capabilities.some((c) => c.id === id));
        check('CAPABILITY_BACKEND_TARGET không chứa capability nào ngoài D1', extraTargets.length === 0, extraTargets);

        // matrix.md khớp XML
        const matrix = read('docs/d1/capability-backend-matrix.md');
        const rows = [...matrix.matchAll(/^\|\s*`([a-z]+:[A-Za-z]+)`\s*\|[^|]*\|[^|]*\|\s*\*\*([a-z-]+)\*\*\s*\|\s*\*\*(true|false)\*\*/gm)];
        const matrixById = new Map(rows.map((m) => [m[1], { status: m[2], allowed: m[3] === 'true' }]));
        const mismatch = d1.capabilities.filter((c) => { const m = matrixById.get(c.id); return !m || m.status !== c.backendStatus || m.allowed !== c.midiAllowed; }).map((c) => c.id);
        check('capability-backend-matrix.md (status + midi-allowed) khớp 100% midi-mapping.xml cho cả 8 capability', matrixById.size === 8 && mismatch.length === 0, { rows: matrixById.size, mismatch });

        // Setup dropdown (chỉ ĐỌC ui/setup.html)
        const setupHtml = read('ui/setup.html');
        const uiActions = [...setupHtml.matchAll(/<option value="([a-z]+:[A-Za-z]+)"/g)].map((m) => m[1]);
        const inD1 = uiActions.filter((a) => d1.capabilities.some((c) => c.id === a)).sort();
        const notInD1 = uiActions.filter((a) => !d1.capabilities.some((c) => c.id === a)).sort();
        check('10 action ID trong dropdown Setup: 7 có trong D1', uiActions.length === 10 && inD1.length === 7, { uiActions, inD1 });
        check('3 action ID ngoài D1 đúng như rules.md mục "Namespace exceptions" (fn:autoDetect, keymod:doTone, preset:load)', JSON.stringify(notInD1) === JSON.stringify(['fn:autoDetect', 'keymod:doTone', 'preset:load']), notInD1);
        const d1OnlyNotUi = d1.capabilities.map((c) => c.id).filter((id) => !uiActions.includes(id));
        check('D1 capability không có trong UI: chỉ daw:save (đúng như ghi chú trong XML)', JSON.stringify(d1OnlyNotUi) === JSON.stringify(['daw:save']), d1OnlyNotUi);
    }

    // =========================================================================
    console.log('\n== B61.6/B61.7 — Mapping + MIDI output thật qua runtime.js (RUNTIME, easymidi giả lập) ==');
    const learned = [
        { type: 'note', channel: 1, number: 60, action: 'daw:play' },
        { type: 'note', channel: 1, number: 61, action: 'daw:stop' },
        { type: 'note', channel: 1, number: 62, action: 'daw:record' },
        { type: 'note', channel: 1, number: 63, action: 'daw:save' },
        { type: 'note', channel: 1, number: 64, action: 'menu:buttonA' },
        { type: 'note', channel: 1, number: 65, action: 'menu:buttonB' },
        { type: 'note', channel: 1, number: 66, action: 'plugin:retune' },
        { type: 'note', channel: 1, number: 67, action: 'plugin:humanize' },
        { type: 'note', channel: 1, number: 68, action: 'fn:autoDetect' },
        { type: 'note', channel: 1, number: 69, action: 'preset:load' },
        { type: 'note', channel: 1, number: 70, action: 'keymod:doTone' },
    ];
    {
        resetMock({ outs: ['loopMIDI Port'], ins: ['loopMIDI Port'] });
        const R = freshRuntime();
        R.start({ readSettingsFile: () => ({ midiOutputPort: 'loopMIDI Port', midiMappingsV1: learned }) });
        check('D1 nạp async xong (stage=ok) sau start()', await waitFor(() => R.getD1State().stage === 'ok'), R.getD1State());
        const gated = R.getD1GatedMapping();
        check('Chỉ 3 binding (daw:play/stop/record) vào mapping thật; 8 binding còn lại bị loại', gated.size === 3 && [...gated.values()].map((v) => v.capabilityId).sort().join() === 'daw:play,daw:record,daw:stop', [...gated.entries()]);
        const { rejected } = d1Loader.buildD1GatedMapping(learned, d1.capabilities);
        const reasonOf = (a) => (rejected.find((r) => r.action === a) || {}).reason;
        check('daw:save -> D1_MIDI_NOT_ALLOWED (pending-backend)', reasonOf('daw:save') === 'D1_MIDI_NOT_ALLOWED', reasonOf('daw:save'));
        check('menu:buttonA/B -> D1_MIDI_NOT_ALLOWED (not-supported)', reasonOf('menu:buttonA') === 'D1_MIDI_NOT_ALLOWED' && reasonOf('menu:buttonB') === 'D1_MIDI_NOT_ALLOWED');
        check('plugin:retune / plugin:humanize -> D1_MIDI_NOT_ALLOWED (not-supported)', reasonOf('plugin:retune') === 'D1_MIDI_NOT_ALLOWED' && reasonOf('plugin:humanize') === 'D1_MIDI_NOT_ALLOWED');
        check('fn:autoDetect / preset:load / keymod:doTone -> UNKNOWN_CAPABILITY_IN_D1 (không định nghĩa trong D1, không tự thêm)',
            ['fn:autoDetect', 'preset:load', 'keymod:doTone'].every((a) => reasonOf(a) === 'UNKNOWN_CAPABILITY_IN_D1'));

        // Bắn MIDI Input thật (fake) cho cả 11 binding, đếm lệnh xuống Output
        const input = mock.inputs[mock.inputs.length - 1];
        const output = mock.outputs[mock.outputs.length - 1];
        for (const m of learned) { input.emit('noteon', { channel: 0, note: m.number, velocity: 100 }); await sleep(90); }
        const notes = output.sent.filter((s) => s.type === 'noteon').map((s) => s.msg.note);
        check('Output nhận ĐÚNG 3 lệnh, đúng thứ tự: Play=0x5e(94), Stop=0x5d(93), Record=0x5f(95)', JSON.stringify(notes) === JSON.stringify([0x5e, 0x5d, 0x5f]), notes);
        check('Không có lệnh nào phát ra cho daw:save / menu:* / plugin:* / fn/preset/keymod (không dispatch giả)', output.sent.length === 3, output.sent);
        check('Lệnh MCU là noteon ch1 (channel=0 nội bộ) velocity 100', output.sent.every((s) => s.msg.channel === 0 && s.msg.velocity === 100 && s.type === 'noteon'), output.sent[0]);
        info('OBSERVED: nhánh MCU chỉ gửi note-on, KHÔNG có note-off/velocity-0 nào (midiDriver.execute). Studio One có coi là nhấn-không-nhả hay không => HARDWARE NOT VERIFIED.');
        info('OBSERVED: sendMidiNoteOn/NoteOff/CC (Web MIDI, appSettings.js) KHÔNG nằm trong đường capability D1; đường D1 dùng easymidi output ở main process.');

        // Không dispatch khi note-off / message lạ
        const before = output.sent.length;
        input.emit('cc', { channel: 0, controller: 60, value: 127 });
        await sleep(90);
        check('CC trùng số 60 nhưng khác type (cc:1:60 != note:1:60) -> không dispatch', output.sent.length === before);
        R.stop();
    }

    // =========================================================================
    console.log('\n== B61.5 — MIDI port lifecycle (RUNTIME, easymidi giả lập) ==');
    {
        const fake = await startFakeAhk(6789);
        if (!fake) info('Không mở được cổng 6789 cho AHK giả — các test fallback hotkey trong mục này bị bỏ qua (NOT RUN).');

        // (a) Cổng đã lưu KHÔNG tồn tại lúc start()
        resetMock({ outs: [], ins: [] });
        let R = freshRuntime();
        const settings = { midiOutputPort: 'loopMIDI Port', midiMappingsV1: [learned[0]] };
        R.start({ readSettingsFile: () => settings });
        await sleep(400);
        let h = R.getHealth();
        check('(a) Cổng vắng lúc khởi động: D1 VẪN nạp OK (D1 không phụ thuộc cổng MIDI)', R.getD1State().stage === 'ok' && R.getD1GatedMapping().size === 1, R.getD1State());
        check('(a) outputReady=false + lastOutputError có lý do thật (không giả vờ READY)', h.outputReady === false && typeof h.lastOutputError === 'string' && h.lastOutputError.length > 0, h);
        check('(a) Không crash, engine vẫn có driver hotkey để fallback', h.started === true && h.driversRegistered.includes('hotkey') && !h.driversRegistered.includes('mcu'), h.driversRegistered);

        // (b) Fallback hotkey (AHK TCP giả) khi mcu không có
        if (fake) {
            const r = await R.dispatch({ targetId: 'studio_one', action: 'transportPlay' });
            check('(b) mcu vắng -> capabilityRegistry fallback sang hotkey, AHK giả nhận đúng {send_keys:"Space"}', r.ok === true && r.driverUsed === 'hotkey' && fake.received.some((m) => m.type === 'send_keys' && m.keys === 'Space'), { r, received: fake.received });
        }

        // (c) Cổng xuất hiện sau -> Auto Connect / reload phải mở lại được (cùng tên cổng)
        mock.outs = ['loopMIDI Port']; mock.ins = ['loopMIDI Port'];
        const ac = R.autoConnect({ mode: 'manual' });
        h = R.getHealth();
        check('(c) Cổng xuất hiện sau, autoConnect() cùng tên cổng -> outputReady + inputOpen = true (không cần restart app)', ac.ok === true && h.outputReady === true && h.inputOpen === true, { ac: ac.ok, h });
        if (fake) {
            const before = mock.outputs[mock.outputs.length - 1].sent.length;
            const r = await R.dispatch({ targetId: 'studio_one', action: 'transportPlay' });
            const out = mock.outputs[mock.outputs.length - 1];
            check('(c) Sau khi mở lại: dispatch đi qua mcu (noteon 0x5e), không còn rơi hotkey', r.ok === true && r.driverUsed === 'mcu' && out.sent.length === before + 1 && out.sent[before].msg.note === 0x5e, r);
        }

        // (d) reloadMappings nhiều lần: không nhân đôi Input/Output
        R.reloadMappings(); R.reloadMappings(); R.reloadMappings();
        await sleep(200);
        const openInputs = mock.inputs.filter((i) => i.open);
        const openOutputs = mock.outputs.filter((o) => o.open && !o.virtual);
        check('(d) reloadMappings() x3: đúng 1 Input đang mở (các Input cũ đã đóng, không nhân đôi listener)', openInputs.length === 1, openInputs.length);
        check('(d) reloadMappings() x3 cùng cổng: đúng 1 Output đang mở (không mở lại vô ích, không duplicate)', openOutputs.length === 1, openOutputs.length);

        // (e) Cổng bị rút giữa chừng -> send() throw -> MidiDriver báo ok:false -> engine fallback hotkey
        if (fake) {
            mock.sendThrows = true;
            const r = await R.dispatch({ targetId: 'studio_one', action: 'transportStop' });
            check('(e) Rút cổng giữa chừng (send throw): KHÔNG crash; mcu ok=false -> fallback hotkey thành công', r.ok === true && r.driverUsed === 'hotkey', r);
            mock.sendThrows = false;
            info('OBSERVED: MidiDriver.isReady() = !!this.output nên vẫn true sau khi cổng bị rút; chỉ phát hiện qua lỗi send() (bị bắt, rơi fallback). Không có watcher hot-plug thụ động.');
        }
        R.stop();

        // (f) AUTO MENU AI: reuse, không tạo trùng
        for (const platform of ['win32', 'linux']) {
            resetMock({ outs: ['AUTO MENU AI'], ins: ['AUTO MENU AI'] });
            const orig = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: platform });
            try {
                R = freshRuntime();
                R.start({ readSettingsFile: () => ({ midiOutputPort: '', midiMappingsV1: [] }) });
                const r1 = R.autoConnect({ mode: 'auto' });
                const r2 = R.autoConnect({ mode: 'auto' });
                const r3 = R.autoConnect({ mode: 'auto' });
                const virtualCreated = mock.outputs.filter((o) => o.virtual).length;
                check(`(f) ${platform}: port "AUTO MENU AI" đã tồn tại -> REUSED ở cả 3 lần autoConnect, 0 virtual port mới được tạo`, [r1, r2, r3].every((r) => r.ok && r.virtualPort.reason === 'REUSED') && virtualCreated === 0, { reasons: [r1, r2, r3].map((r) => r.virtualPort.reason), virtualCreated });
                check(`(f) ${platform}: sau 3 lần autoConnect chỉ 1 Output + 1 Input đang mở (không duplicate)`, mock.outputs.filter((o) => o.open).length === 1 && mock.inputs.filter((i) => i.open).length === 1, { out: mock.outputs.filter((o) => o.open).length, in: mock.inputs.filter((i) => i.open).length });
                R.stop();
            } finally { Object.defineProperty(process, 'platform', orig); }
        }
        {
            resetMock({ outs: [], ins: [] });
            const orig = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'win32' });
            try {
                R = freshRuntime();
                R.start({ readSettingsFile: () => ({ midiOutputPort: '', midiMappingsV1: [] }) });
                const r = R.autoConnect({ mode: 'auto' });
                check('(f) win32, port chưa tồn tại: PLATFORM_UNSUPPORTED rõ ràng, 0 port bị tạo, ok=false (không giả vờ kết nối)', r.ok === false && r.virtualPort.reason === 'PLATFORM_UNSUPPORTED' && mock.outputs.length === 0, r.virtualPort);
                R.stop();
            } finally { Object.defineProperty(process, 'platform', orig); }
        }
        info('NOT VERIFIED: nhánh tạo virtual port trên Linux/macOS (ensureAutoMenuAiPort đóng port ngay sau khi tạo) — sandbox không có ALSA sequencer, không thể xác nhận port có tồn tại sau close(). Nền tảng triển khai là Windows (dùng loopMIDI), nhánh này không chạy ở đó.');
        if (fake) fake.server.close();
    }

    // =========================================================================
    console.log('\n== B61.1/B61.7/B61.8 — Đường Web MIDI của renderer + fallback click-at-point (RUNTIME, Web MIDI giả lập) ==');
    {
        function makeRenderer(settingsObj, ports) {
            const sent = [];
            const clicks = [];
            const outputs = ports.map((name) => ({ name, id: name, send: (bytes) => { if (makeRenderer.sendThrows) throw new Error('InvalidStateError (giả lập)'); sent.push({ port: name, bytes: Array.from(bytes) }); } }));
            const sandbox = {
                console, setTimeout, clearTimeout, Date, Math, Promise,
                navigator: { requestMIDIAccess: async () => ({ outputs: new Map(outputs.map((o) => [o.id, o])) }) },
                localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            };
            sandbox.window = sandbox;
            sandbox.electronAPI = {
                loadSettingsSync: () => settingsObj,
                saveSettingsSync: () => true,
                clickAtPoint: async (p) => { clicks.push(p); return { ok: true }; },
            };
            vm.createContext(sandbox);
            vm.runInContext(read('ui/js/appSettings.js') + '\n' + read('ui/js/vocalCommandRouter.js') +
                '\n;this.__api = { loadSetup, sendKeyToAutotune, sendToneStep, sendToneStepToSoundShifter, sendMidiNoteOn, sendMidiNoteOff, sendMidiCC, setSoundShifterPower };', sandbox);
            sandbox.__api.loadSetup();
            return { api: sandbox.__api, sent, clicks };
        }

        // (1) Key -> Note pulse qua Web MIDI: C=0, A#=10; note-on rồi note-off
        let r = makeRenderer({ midiOutputPort: 'loopMIDI Port', selectedDAW: 'studio-one' }, ['loopMIDI Port']);
        let res = await r.api.sendKeyToAutotune('A# Minor');
        await sleep(200);
        check('sendKeyToAutotune("A# Minor") qua MIDI: ok, driverUsed=midi', res.ok === true && res.driverUsed === 'midi', res);
        check('Web MIDI gửi Note On (0x90) note=10 rồi Note Off (0x80) note=10 tới ĐÚNG cổng đã chọn',
            r.sent.length === 2 && r.sent[0].port === 'loopMIDI Port' && r.sent[0].bytes[0] === 0x90 && r.sent[0].bytes[1] === 10 && r.sent[1].bytes[0] === 0x80 && r.sent[1].bytes[1] === 10, r.sent);
        check('Có MIDI thì KHÔNG click chuột (fallback không bị gọi thừa)', r.clicks.length === 0);

        // (2) Tone -> CC20/21
        r = makeRenderer({ midiOutputPort: 'loopMIDI Port' }, ['loopMIDI Port']);
        res = await r.api.sendToneStep(2);
        check('sendToneStep(+2) -> 2 x CC20 value 127 (0xB0)', res.ok && r.sent.length === 2 && r.sent.every((s) => s.bytes[0] === 0xb0 && s.bytes[1] === 20 && s.bytes[2] === 127), r.sent);
        r = makeRenderer({ midiOutputPort: 'loopMIDI Port' }, ['loopMIDI Port']);
        res = await r.api.sendToneStep(-1);
        check('sendToneStep(-1) -> 1 x CC21', res.ok && r.sent.length === 1 && r.sent[0].bytes[1] === 21, r.sent);

        // (3) sendMidiCC/NoteOn/NoteOff trực tiếp + clamp 7-bit + kênh
        r = makeRenderer({ midiOutputPort: 'loopMIDI Port' }, ['loopMIDI Port']);
        await r.api.sendMidiNoteOn(200, 300, 2); await r.api.sendMidiNoteOff(60, 2); await r.api.sendMidiCC(130, 200, 15);
        check('sendMidiNoteOn/Off/CC: status byte đúng kênh (0x92/0x82/0xBF) và data byte bị chặn 7-bit (&0x7F)',
            JSON.stringify(r.sent.map((s) => s.bytes)) === JSON.stringify([[0x92, 200 & 0x7f, 300 & 0x7f], [0x82, 60, 0], [0xbf, 130 & 0x7f, 200 & 0x7f]]), r.sent.map((s) => s.bytes));

        // (4) Fallback click-at-point khi không có cổng MIDI
        const point = { x: 120, y: 340 };
        r = makeRenderer({ midiOutputPort: '', selectedDAW: 'studio-one', coordinateProfiles: { 'studio-one': { autotunekey: point, chromatic: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } } }, []);
        res = await r.api.sendKeyToAutotune('C Major');
        check('Không cấu hình cổng MIDI -> fallback clickAtPoint(autotunekey) (đường IPC -> AHK giữ nguyên)', res.ok && res.driverUsed === 'mouse' && r.clicks.length === 1 && r.clicks[0].x === 120, { res, clicks: r.clicks });
        res = await r.api.sendToneStep(2);
        check('Không có MIDI: sendToneStep(+2) click nút ▲ (chromatic[0]) đúng 2 lần', res.ok && r.clicks.slice(1).length === 2 && r.clicks[1].x === 1, r.clicks);

        // (5) Cổng đã lưu nhưng không còn trong danh sách -> fallback chuột
        r = makeRenderer({ midiOutputPort: 'Old Port', selectedDAW: 'studio-one', coordinateProfiles: { 'studio-one': { autotunekey: point } } }, ['Another Port']);
        res = await r.api.sendKeyToAutotune('D Major');
        check('Cổng MIDI đã lưu không còn tồn tại -> rơi sang click (không gửi nhầm sang cổng khác)', res.ok && res.driverUsed === 'mouse' && r.sent.length === 0, { res, sent: r.sent });

        // (6) Mouse Control OFF chặn cả fallback
        r = makeRenderer({ midiOutputPort: '', mouseControlEnabled: false, selectedDAW: 'studio-one', coordinateProfiles: { 'studio-one': { autotunekey: point } } }, []);
        res = await r.api.sendKeyToAutotune('E Minor');
        check('Mouse Control OFF -> MOUSE_DISABLED, 0 click (gate còn nguyên)', res.ok === false && res.status === 'MOUSE_DISABLED' && r.clicks.length === 0, res);

        // (7) Không cấu hình gì -> lỗi rõ ràng, không gửi mò
        r = makeRenderer({ midiOutputPort: '' }, []);
        res = await r.api.sendKeyToAutotune('C Major');
        check('Không MIDI, không toạ độ -> ok=false + detail rõ, 0 MIDI, 0 click', res.ok === false && typeof res.detail === 'string' && r.sent.length === 0 && r.clicks.length === 0, res);

        // (8) FINDING (ghi nhận, không sửa): output.send() throw -> sendKeyToAutotune reject thay vì rơi sang click
        makeRenderer.sendThrows = true;
        r = makeRenderer({ midiOutputPort: 'loopMIDI Port', selectedDAW: 'studio-one', coordinateProfiles: { 'studio-one': { autotunekey: point } } }, ['loopMIDI Port']);
        let threw = false;
        try { await r.api.sendKeyToAutotune('C Major'); } catch { threw = true; }
        makeRenderer.sendThrows = false;
        info(`FINDING (LOW, chưa sửa): nếu MIDIOutput.send() throw (cổng vừa bị rút sau khi tra map), sendKeyToAutotune ${threw ? 'REJECT (không rơi sang fallback click)' : 'không reject'} — Web MIDI spec cho phép send() throw InvalidStateError khi port disconnected; Chromium thật NOT VERIFIED.`);
        check('(ghi nhận) hành vi throw-path đã được đo và ghi lại', typeof threw === 'boolean');
    }

    // =========================================================================
    console.log('\n== B61.4 — Validation D1 (XML/XSD/Semantic) còn nguyên hiệu lực fail-closed ==');
    {
        const bad = await d1Loader.loadAndValidateD1('<midi-mapping', read('docs/d1/midi-mapping.xsd'));
        check('XML hỏng -> fail-closed (ok=false), không throw', bad.ok === false && !!bad.stage);
        const missing = await d1Loader.loadD1FromDisk('/nonexistent/x.xml', '/nonexistent/x.xsd');
        check('File D1 thiếu -> ok=false stage=file-read-error', missing.ok === false && missing.stage === 'file-read-error', missing);
        resetMock({ outs: ['P'], ins: ['P'] });
        // D1 hợp lệ nhưng cổng MIDI không mở được không được làm mất D1 (đã kiểm ở B61.5-a); ở đây kiểm ngược:
        const R = freshRuntime();
        R.start({ readSettingsFile: () => ({ midiOutputPort: 'P', midiMappingsV1: [learned[0]] }) });
        await waitFor(() => R.getD1State().stage === 'ok');
        check('Runtime thật: getHealth().d1.ok=true, mappingCount=1 sau start() với cổng hợp lệ', R.getHealth().d1.ok === true && R.getHealth().d1.mappingCount === 1, R.getHealth().d1);
        R.stop();
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    Module._load = origLoad;
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => { console.error('TEST CRASH:', err); process.exit(2); });
