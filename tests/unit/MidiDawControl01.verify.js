/**
 * MidiDawControl01.verify.js — MIDI-DAW-CONTROL-01
 * ---------------------------------------------------------------------------
 * LOẠI TEST: static + unit + integration TRONG-TIẾN-TRÌNH với DOM/Web MIDI/easymidi GIẢ và wiring renderer THẬT
 * (ui/js/renderer.js, actionRegistry.js, appSettings.js, runtime.js, midiDriver.js, audioSource.js).
 * KHÔNG phải Studio One thật => KHÔNG chứng minh macro/CC thực thi đúng trong DAW (xem REPORT.md: BLOCKED_USER_TEST).
 *
 * Chạy: node tests/unit/MidiDawControl01.verify.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, extra) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// 8 mapping theo bảng của task (chỉ là CẤU HÌNH TEST — không phải bằng chứng Studio One đã học các CC này)
const TABLE = { MUSIC_ON: 102, MUSIC_OFF: 103, MIC1_ON: 104, MIC1_OFF: 105, MIC2_ON: 106, MIC2_OFF: 107, FX_ON: 108, FX_OFF: 109 };
const mk = (cc) => ({ kind: 'cc', channel: 16, number: cc, value: 127, source: 'USER_DEFINED' });
const fullMappings = () => Object.fromEntries(Object.entries(TABLE).map(([a, cc]) => [a, mk(cc)]));

// ------------------------------------------------------------ harness 1: actionRegistry (+ nút renderer) trong vm
function makeEnv({ mappings = {}, sendResult = true, withRendererSlice = false } = {}) {
    const store = { selectedDAW: 'studio-one', dawMidiOutMappings: { 'studio-one': mappings } };
    const sends = [];
    const sandbox = {
        console: { log() {}, error: console.error, warn() {} }, setTimeout, clearTimeout, Date, Math, Promise,
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]),
        setSetting: (k, v) => { store[k] = v; },
        sendMidiCC: async (n, v, ch) => { sends.push({ t: 'cc', n, v, ch }); return typeof sendResult === 'function' ? sendResult() : sendResult; },
        sendMidiNotePulse: async (n, v, ch) => { sends.push({ t: 'note', n, v, ch }); return typeof sendResult === 'function' ? sendResult() : sendResult; },
        saveData() {},
        electronAPI: {},
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('ui/js/actionRegistry.js'), sandbox);
    return { sb: sandbox, AR: sandbox.window.ActionRegistry, store, sends };
}
function fakeBtn(initial = []) {
    const cls = new Set(initial); const handlers = {};
    return {
        dataset: {}, title: '', cls,
        classList: { toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; }, contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
        addEventListener(ev, fn) { handlers[ev] = fn; }, fire() { const r = handlers.click({ target: this }); return r; },
    };
}

(async () => {
    // ===================================================================== 1
    console.log('== 1. Tám action ON/OFF được phân biệt ==');
    {
        const { AR } = makeEnv();
        const names = Object.keys(TABLE);
        check('ACTIONS có đủ 8 tên, giá trị khác nhau từng đôi', names.every((n) => AR.ACTIONS[n] === n) && new Set(names.map((n) => AR.ACTIONS[n])).size === 8);
        const defs = AR.DAW_STATE_CONTROLS;
        check('4 nút -> 4 cặp (on/off) riêng, không trùng nhau và không trùng action toggle cũ',
            Object.keys(defs).join() === 'MUSIC,MIC1,MIC2,FX' && new Set(Object.values(defs).flatMap((d) => [d.on, d.off, d.legacy])).size === 12);
        check('Action cũ còn nguyên: MONITOR_BEAT_TOGGLE/MIC1/MIC2/FX', ['MONITOR_BEAT_TOGGLE', 'MONITOR_MIC1', 'MONITOR_MIC2', 'MONITOR_FX'].every((n) => AR.ACTIONS[n] === n));
    }

    // ===================================================================== 2,3,4
    console.log('\n== 2-4. Bấm ON chọn mapping ON, OFF chọn mapping OFF; lặp ON/ON, OFF/OFF; CC/channel/value/số lần ==');
    {
        for (const [control, onA, offA] of [['MUSIC', 'MUSIC_ON', 'MUSIC_OFF'], ['MIC1', 'MIC1_ON', 'MIC1_OFF'], ['MIC2', 'MIC2_ON', 'MIC2_OFF'], ['FX', 'FX_ON', 'FX_OFF']]) {
            const { AR, sends } = makeEnv({ mappings: fullMappings() });
            const r1 = await AR.setDawControlState(control, true);
            check(`${control} ON -> đúng 1 lệnh CC ${TABLE[onA]} ch16(index 15) value 127`, sends.length === 1 && sends[0].t === 'cc' && sends[0].n === TABLE[onA] && sends[0].v === 127 && sends[0].ch === 15, sends);
            const r2 = await AR.setDawControlState(control, true);
            check(`${control} ON lần 2 vẫn gửi lại lệnh ON (không bỏ qua, không đảo)`, sends.length === 2 && sends[1].n === TABLE[onA], sends);
            await AR.setDawControlState(control, false);
            await AR.setDawControlState(control, false);
            check(`${control} OFF ×2 -> 2 lệnh CC ${TABLE[offA]} (cả hai lần đều là OFF)`, sends.length === 4 && sends[2].n === TABLE[offA] && sends[3].n === TABLE[offA], sends);
            check(`${control}: mỗi cú bấm đúng MỘT lệnh, không có lệnh toggle cũ kèm theo`, sends.every((s) => [TABLE[onA], TABLE[offA]].includes(s.n)) && sends.length === 4);
            check(`${control}: kết quả mode=explicit, target ON/OFF đúng, ok`, r1.mode === 'explicit' && r1.target === 'ON' && r1.ok === true && r2.action === onA);
        }
        // Không chéo đối tượng: nút MIC1 không bao giờ gửi CC của MIC2/MUSIC/FX
        const { AR, sends } = makeEnv({ mappings: fullMappings() });
        await AR.setDawControlState('MIC1', true); await AR.setDawControlState('MIC1', false);
        check('MIC1 chỉ phát CC 104/105 (không chạm MUSIC/MIC2/FX)', sends.map((s) => s.n).join() === '104,105');
    }

    // ===================================================================== FX
    console.log('\n== FX: một lệnh cho 4 bus; không đụng Send/FX Auto ==');
    {
        const { AR, sends, sb } = makeEnv({ mappings: { ...fullMappings(), FX_SEND_REVERB: { kind: 'cc', channel: 1, number: 20, value: 127 }, FX_SEND_DELAY: { kind: 'cc', channel: 1, number: 21, value: 127 }, MONITOR_FX: { kind: 'cc', channel: 1, number: 22, value: 127 } } });
        await AR.setDawControlState('FX', true);
        await AR.setDawControlState('FX', false);
        check('FX ON/OFF mỗi lần đúng 1 CC (108/109); KHÔNG gửi FX_SEND_REVERB(20)/FX_SEND_DELAY(21)/MONITOR_FX(22) dù đã cấu hình', sends.map((s) => s.n).join() === '108,109', sends);
    }

    // ===================================================================== 5,6,7
    console.log('\n== 5-7. Chế độ legacy / nửa cấu hình / chưa cấu hình ==');
    {
        // legacy: chỉ có mapping cũ => hành vi cũ giữ nguyên
        let e = makeEnv({ mappings: { MONITOR_MIC1: { kind: 'cc', channel: 1, number: 20, value: 127 }, DAW_PLAY: { kind: 'note', channel: 1, number: 60, velocity: 100 } } });
        check('Chưa cấu hình ON/OFF -> mode legacy', e.AR.getDawStateMode('MIC1') === 'legacy');
        const a = await e.AR.setDawControlState('MIC1', true);
        const b = await e.AR.setDawControlState('MIC1', false);
        check('legacy: mỗi cú bấm đúng 1 lệnh toggle cũ (CC 20) cho cả ON và OFF — như trước task', e.sends.length === 2 && e.sends.every((s) => s.n === 20 && s.ch === 0) && a.mode === 'legacy' && a.action === 'MONITOR_MIC1' && b.ok === true, e.sends);
        check('legacy: text nói rõ "toggle cũ" + chưa xác nhận DAW', /toggle cũ/.test(a.text) && /chưa xác nhận/.test(a.text));

        // nửa cấu hình: chỉ MUSIC_ON + legacy toggle còn đó
        e = makeEnv({ mappings: { MUSIC_ON: mk(102), MONITOR_BEAT_TOGGLE: { kind: 'cc', channel: 1, number: 20, value: 127 } } });
        check('Có MUSIC_ON -> mode explicit', e.AR.getDawStateMode('MUSIC') === 'explicit');
        const off = await e.AR.setDawControlState('MUSIC', false);
        check('Thiếu MUSIC_OFF: NOT_CONFIGURED, 0 lệnh gửi, KHÔNG rơi xuống toggle cũ (toggle sẽ đảo trạng thái)', off.ok === false && off.reason === 'NOT_CONFIGURED' && e.sends.length === 0 && /CHƯA cấu hình lệnh MUSIC.*OFF/.test(off.text), { off, sends: e.sends });
        const on = await e.AR.setDawControlState('MUSIC', true);
        check('MUSIC ON vẫn gửi đúng CC 102', on.ok === true && e.sends.length === 1 && e.sends[0].n === 102);

        // hoàn toàn chưa cấu hình
        e = makeEnv({ mappings: {} });
        const nc = await e.AR.setDawControlState('FX', true);
        check('Chưa cấu hình gì: ok=false, 0 lệnh, delivery NOT_SENT, nói rõ DAW KHÔNG nhận lệnh', nc.ok === false && e.sends.length === 0 && nc.delivery === 'NOT_SENT' && /DAW KHÔNG nhận lệnh/.test(nc.text));
        e = makeEnv({ mappings: {} }); e.store.selectedDAW = '';
        const nd = await e.AR.setDawControlState('FX', true);
        check('Chưa chọn DAW: không gửi gì, không báo thành công', nd.ok === false && e.sends.length === 0);
    }

    // ===================================================================== 8
    console.log('\n== 8. Lỗi gửi / thành công: không bao giờ báo DAW đã xác nhận ==');
    {
        let e = makeEnv({ mappings: fullMappings(), sendResult: false });
        e.sb.getLastMidiSendResult = () => ({ sender: 'main-midi-driver (easymidi)', reason: 'OUTPUT_NOT_OPEN', detail: 'Internal RtMidi error' });
        const f = await e.AR.setDawControlState('MIC2', true);
        check('Gửi lỗi: ok=false status NO_DEVICE delivery NOT_SENT', f.ok === false && f.status === 'NO_DEVICE' && f.delivery === 'NOT_SENT');
        check('Text nêu lỗi gốc của tầng gửi (OUTPUT_NOT_OPEN: Internal RtMidi error) và "DAW KHÔNG nhận lệnh"', /OUTPUT_NOT_OPEN: Internal RtMidi error/.test(f.text) && /DAW KHÔNG nhận lệnh/.test(f.text), f.text);
        check('dawConfirmed luôn false, __dawStateLast ghi ok=false', f.dawConfirmed === false && e.sb.__dawStateLast.MIC2.ok === false);

        e = makeEnv({ mappings: fullMappings(), sendResult: true });
        const g = await e.AR.setDawControlState('MIC2', true);
        check('Gửi OK: delivery=UNCONFIRMED, dawConfirmed=false, text "DAW chưa xác nhận"', g.ok && g.delivery === 'UNCONFIRMED' && g.dawConfirmed === false && /DAW chưa xác nhận/.test(g.text) && !/(^|[^a-z])đã xác nhận/i.test(g.text), g.text);
        check('Lệnh chưa cấu hình KHÔNG dùng kết quả gửi cũ của lần khác (không kèm lỗi lạ)', await (async () => { const z = makeEnv({ mappings: {} }); z.sb.getLastMidiSendResult = () => ({ reason: 'STALE', detail: 'x' }); const r = await z.AR.setDawControlState('FX', true); return !/STALE/.test(r.text); })());
    }

    // ===================================================================== 9
    console.log('\n== 9. Dữ liệu cũ vẫn đọc được (không cần migration vì không đổi schema) ==');
    {
        const oldData = {
            DAW_PLAY: { kind: 'note', channel: 1, number: 60, velocity: 100, source: 'USER_DEFINED' },
            MONITOR_MIC1: { kind: 'cc', channel: 1, number: 20, value: 127, source: 'USER_DEFINED' },
            MONITOR_FX: { kind: 'cc', channel: 2, number: 22, value: 100, source: 'USER_DEFINED' },
            FX_SEND_REVERB: { kind: 'cc', channel: 1, number: 23, value: 127, source: 'USER_DEFINED' },
        };
        const before = JSON.stringify(oldData);
        const e = makeEnv({ mappings: JSON.parse(before) });
        check('getMidiOutMapping đọc đúng mapping cũ', JSON.stringify(e.AR.getMidiOutMapping('MONITOR_FX')) === JSON.stringify(oldData.MONITOR_FX));
        e.AR.setMidiOutMapping('MUSIC_ON', { kind: 'cc', channel: 16, number: 102, value: 127 });
        const all = e.store.dawMidiOutMappings['studio-one'];
        check('Lưu mapping mới KHÔNG làm mất/đổi mapping cũ', Object.keys(oldData).every((k) => JSON.stringify(all[k]) === JSON.stringify(oldData[k])) && all.MUSIC_ON.source === 'USER_DEFINED');
        check('Nút chưa có ON/OFF vẫn legacy (FX có MONITOR_FX cũ -> legacy)', e.AR.getDawStateMode('FX') === 'legacy' && e.AR.getDawStateMode('MUSIC') === 'explicit');
        const r = await e.AR.setDawControlState('FX', true);
        check('FX legacy gửi đúng mapping cũ (CC 22 ch2 -> index 1, value 100? value giữ 100)', r.ok && e.sends[0].n === 22 && e.sends[0].ch === 1 && e.sends[0].v === 100, e.sends);
    }

    // ===================================================================== 11 — nút renderer THẬT
    console.log('\n== Nút Menu (renderer.js THẬT): trạng thái ĐÍCH sau cú bấm, ý nghĩa class ==');
    {
        const css = read('ui/css/style.css');
        check('STATIC: #musicBtn.disabled = mờ (TẮT), .control-btn.active = sáng (BẬT)', /#musicBtn\.disabled\s*\{[^}]*opacity:\s*0\.6/.test(css) && /\.control-btn\.active\s*\{[^}]*#00e5ff/.test(css));
        const ren = read('ui/js/renderer.js');
        const a = ren.indexOf('function reportDawStateResult');
        const b = ren.indexOf('// TASK AI-FX-01 — AUTO FX/SEND theo NHẠC');
        const slice = ren.slice(a, b);
        check('Trích được khối nút MUSIC/MIC1/MIC2/FX từ renderer.js', a > 0 && b > a && /musicBtn/.test(slice) && /mic1Btn/.test(slice));

        function runRenderer(mappings, opts = {}) {
            const e = makeEnv({ mappings, sendResult: opts.sendResult === undefined ? true : opts.sendResult });
            const btns = { musicBtn: fakeBtn(), mic1Btn: fakeBtn(), mic2Btn: fakeBtn(), fxBtn: fakeBtn() };
            e.sb.document = { getElementById: (id) => btns[id] || null };
            if (opts.fxGroup) e.sb.__fxSendGroup = opts.fxGroup;
            vm.runInContext(slice, e.sb);
            return { ...e, btns, flush: async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); } };
        }
        let r = runRenderer(fullMappings());
        r.btns.musicBtn.fire(); await r.flush();
        check('MUSIC mặc định (không class disabled = BẬT): bấm lần 1 -> TẮT -> gửi MUSIC_OFF (CC 103), đúng 1 lệnh', r.sends.length === 1 && r.sends[0].n === 103 && r.btns.musicBtn.cls.has('disabled'), r.sends);
        r.btns.musicBtn.fire(); await r.flush();
        check('MUSIC bấm lần 2 -> BẬT -> MUSIC_ON (CC 102)', r.sends.length === 2 && r.sends[1].n === 102 && !r.btns.musicBtn.cls.has('disabled'));
        check('Tooltip nút MUSIC: "đã GỬI … DAW chưa xác nhận", dataset.dawSync=sent-unconfirmed', /đã GỬI/.test(r.btns.musicBtn.title) && /chưa xác nhận/.test(r.btns.musicBtn.title) && r.btns.musicBtn.dataset.dawSync === 'sent-unconfirmed');

        r = runRenderer(fullMappings());
        r.btns.mic1Btn.fire(); await r.flush(); r.btns.mic1Btn.fire(); await r.flush();
        r.btns.mic2Btn.fire(); await r.flush(); r.btns.mic2Btn.fire(); await r.flush();
        check('MIC1: bấm -> active -> ON(104); bấm -> OFF(105). MIC2: ON(106), OFF(107). Mỗi cú bấm 1 lệnh', r.sends.map((s) => s.n).join() === '104,105,106,107', r.sends);
        r.btns.fxBtn.fire(); await r.flush(); r.btns.fxBtn.fire(); await r.flush();
        check('FX (đường dự phòng không có __fxManualToggle): ON(108) rồi OFF(109), mỗi lần 1 lệnh', r.sends.slice(4).map((s) => s.n).join() === '108,109', r.sends);

        // Legacy qua nút: hành vi cũ giữ nguyên (đúng 1 executeAction toggle)
        r = runRenderer({ MONITOR_MIC1: { kind: 'cc', channel: 1, number: 20, value: 127 } });
        r.btns.mic1Btn.fire(); await r.flush(); r.btns.mic1Btn.fire(); await r.flush();
        check('Legacy qua nút MIC1: mỗi cú bấm đúng 1 CC 20 (toggle cũ), không có ON/OFF mới', r.sends.map((s) => s.n).join() === '20,20');

        // Khi lỗi gửi, nút hiển thị lỗi, không "đã gửi"
        r = runRenderer(fullMappings(), { sendResult: false });
        r.btns.mic1Btn.fire(); await r.flush();
        check('Gửi lỗi: tooltip nói "KHÔNG nhận lệnh", dataset.dawSync=failed', /KHÔNG nhận lệnh/.test(r.btns.mic1Btn.title) && r.btns.mic1Btn.dataset.dawSync === 'failed');
        r = runRenderer({});
        r.btns.mic1Btn.fire(); await r.flush();
        check('Chưa cấu hình: tooltip "CHƯA cấu hình", dataset.dawSync=not-configured, 0 lệnh', /CHƯA cấu hình/.test(r.btns.mic1Btn.title) && r.btns.mic1Btn.dataset.dawSync === 'not-configured' && r.sends.length === 0);
        check('STATIC: không có nơi nào gửi lệnh ON/OFF khi KHỞI ĐỘNG (setDawControlState chỉ gọi trong handler click/__fxManualToggle)',
            (ren.match(/setDawControlState\(/g) || []).length === 5 && !/DOMContentLoaded[\s\S]{0,200}setDawControlState/.test(ren));
    }

    // ===================================================================== FX wiring thật (__fxManualToggle)
    console.log('\n== FX: __fxManualToggle thật — đúng 1 lệnh, FX Auto/Send/60 s không bị gọi thêm ==');
    {
        const asSrc = read('ui/js/audioSource.js');
        const ren = read('ui/js/renderer.js');
        const a = ren.indexOf('function createFxAutoWiring() {'), b = ren.indexOf('createFxAutoWiring();\n', a);
        const fnSrc = ren.slice(a, b);
        const e = makeEnv({ mappings: { ...fullMappings(), FX_SEND_REVERB: { kind: 'cc', channel: 1, number: 20, value: 127 }, FX_SEND_DELAY: { kind: 'cc', channel: 1, number: 21, value: 127 } } });
        const sb = e.sb;
        const clock = { t: 0 };
        sb.performance = { now: () => 0 };
        sb.Date = { now: () => clock.t };
        sb.setTimeout = () => 0; sb.clearTimeout = () => {};
        vm.runInContext(asSrc, sb);
        sb.AudioSource = sb.AudioSource || sb.window.AudioSource;
        const fxBtn = fakeBtn();
        sb.document = { getElementById: (id) => (id === 'fxBtn' ? fxBtn : null) };
        const intervals = []; sb.setInterval = (fn) => { intervals.push(fn); return 1; };
        sb.electronAPI = { sendTelemetry() {} };
        vm.runInContext(fnSrc + '\ncreateFxAutoWiring();', sb);
        const ctl = sb.__fxAuto;
        check('Wiring FX Auto thật được tạo, đúng 1 setInterval', !!ctl && !!sb.__fxManualToggle && intervals.length === 1);

        fxBtn.classList.toggle('active');
        const res = await sb.__fxManualToggle(true);
        check('FX ON thủ công (explicit): đúng 1 lệnh CC 108; KHÔNG gửi Send Reverb(20)/Delay(21)', e.sends.length === 1 && e.sends[0].n === 108, e.sends);
        const info = ctl.getInfo();
        check('Mốc 60 s "Auto nhường quyền" vẫn được bật; kết quả báo về controller đúng 1 lần (sentCount=1)', info.manualOverride === true && info.sentCount === 1 && info.failedCount === 0, info);
        check('Tooltip FX: nói lệnh FX ON/mute bus, "DAW chưa xác nhận", KHÔNG nói "Send Reverb/Delay" đã gửi', /FX \(Mute 4 bus\) ON/.test(fxBtn.title) && /chưa xác nhận/.test(fxBtn.title) && !/Send Reverb/.test(fxBtn.title), fxBtn.title);
        fxBtn.classList.toggle('active');
        await sb.__fxManualToggle(false);
        check('FX OFF thủ công: CC 109, tổng 2 lệnh, vẫn không có Send', e.sends.map((s) => s.n).join() === '108,109');

        // Không cấu hình FX ON/OFF => đường FX cũ (Send) y như trước
        const e2 = makeEnv({ mappings: { FX_SEND_REVERB: { kind: 'cc', channel: 1, number: 20, value: 127 }, FX_SEND_DELAY: { kind: 'cc', channel: 1, number: 21, value: 127 } } });
        const sb2 = e2.sb; sb2.performance = { now: () => 0 }; sb2.Date = { now: () => 0 }; sb2.setTimeout = () => 0; sb2.clearTimeout = () => {};
        vm.runInContext(asSrc, sb2); sb2.AudioSource = sb2.AudioSource || sb2.window.AudioSource;
        const fb2 = fakeBtn(); sb2.document = { getElementById: (id) => (id === 'fxBtn' ? fb2 : null) }; sb2.setInterval = () => 1; sb2.electronAPI = { sendTelemetry() {} };
        vm.runInContext(fnSrc + '\ncreateFxAutoWiring();', sb2);
        fb2.classList.toggle('active'); await sb2.__fxManualToggle(true);
        check('Legacy FX (chưa cấu hình FX_ON/OFF): vẫn gửi 2 Send (20,21) như trước, không có CC 108/109', e2.sends.map((s) => s.n).sort().join() === '20,21', e2.sends);
    }

    // ===================================================================== chuỗi gửi đầy đủ tới main driver
    console.log('\n== Chuỗi đầy đủ: Menu -> ActionRegistry -> appSettings -> IPC -> main MidiDriver (easymidi giả) ==');
    {
        const sent = [];
        class FakeOutput { constructor(n, v) { this.name = n; } send(type, msg) { sent.push({ port: this.name, type, msg }); } close() {} }
        class FakeInput { constructor(n) { this.name = n; } on() {} close() {} removeListener() {} }
        const fake = { Output: FakeOutput, Input: FakeInput, getOutputs: () => ['AUTO MENU AI'], getInputs: () => ['AUTO MENU AI'] };
        const origLoad = Module._load; Module._load = function (r) { if (r === 'easymidi') return fake; return origLoad.apply(this, arguments); };
        const rp = path.join(ROOT, 'core', 'command-engine-js', 'runtime.js'); delete require.cache[require.resolve(rp)];
        const R = require(rp);
        const log = console.log; console.log = () => {};
        const settings = { midiOutputPort: 'AUTO MENU AI' };
        R.start({ readSettingsFile: () => settings });
        console.log = log;

        const store = { selectedDAW: 'studio-one', midiOutputPort: 'AUTO MENU AI', dawMidiOutMappings: { 'studio-one': fullMappings() } };
        const ipcCalls = [];
        const sb = {
            console: { log() {}, error: console.error, warn() {} }, setTimeout, clearTimeout, Date, Math, Promise, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            navigator: { requestMIDIAccess: async () => { sb.__web = (sb.__web || 0) + 1; return { outputs: new Map(), inputs: new Map() }; } },
        };
        sb.window = sb;
        sb.electronAPI = { loadSettingsSync: () => store, saveSettingsSync: () => true, sendMidiMessage: (m) => { ipcCalls.push(m); return R.sendMidi(m); } };
        vm.createContext(sb);
        vm.runInContext(read('ui/js/appSettings.js') + '\n' + read('ui/js/actionRegistry.js') + '\n;this.__ok = true;', sb);
        sb.loadSetup && sb.loadSetup();
        const AR = sb.window.ActionRegistry;
        const expected = { MUSIC: [[102, true], [103, false]], MIC1: [[104, true], [105, false]], MIC2: [[106, true], [107, false]], FX: [[108, true], [109, false]] };
        for (const [ctl, list] of Object.entries(expected)) {
            for (const [cc, on] of list) {
                sent.length = 0; ipcCalls.length = 0;
                const r = await AR.setDawControlState(ctl, on);
                check(`${ctl} ${on ? 'ON' : 'OFF'} -> 1 IPC {kind:cc, number:${cc}, value:127, channel:15} -> byte [0xBF,${cc},127] tới "AUTO MENU AI"`,
                    r.ok && ipcCalls.length === 1 && ipcCalls[0].kind === 'cc' && ipcCalls[0].number === cc && ipcCalls[0].value === 127 && ipcCalls[0].channel === 15
                    && sent.length === 1 && sent[0].type === 'cc' && sent[0].msg.controller === cc && sent[0].msg.value === 127 && sent[0].msg.channel === 15 && sent[0].port === 'AUTO MENU AI',
                    { ipcCalls, sent });
            }
        }
        check('Không dùng đường Web MIDI độc lập khi main IPC hoạt động (requestMIDIAccess 0 lần)', !sb.__web);
        check('Kết quả gửi ghi rõ sender main-midi-driver (easymidi)', /main-midi-driver/.test(sb.getLastMidiSendResult().sender));
        R.stop();
    }

    // ===================================================================== Setup
    console.log('\n== Setup → MIDI: 8 dòng riêng, bộ CC gợi ý khớp bảng, chặn trùng ==');
    {
        const setupSrc = read('ui/js/setup.js');
        check('DAW_MIDI_ACTIONS có đủ 8 dòng ON/OFF', Object.keys(TABLE).every((a) => new RegExp(`action: "${a}"`).test(setupSrc)));
        const m = setupSrc.match(/const DAW_STATE_SUGGESTED = Object\.freeze\((\{[^}]*\})\);/);
        const suggested = m ? new Function('return ' + m[1])() : null;
        check('Bộ CC gợi ý trong Setup khớp bảng 8 lệnh của task (102–109), kênh 16, value 127',
            suggested && JSON.stringify(suggested) === JSON.stringify(TABLE) && /DAW_STATE_SUGGESTED_CHANNEL = 16/.test(setupSrc) && /DAW_STATE_SUGGESTED_VALUE = 127/.test(setupSrc), suggested);
        check('Bộ gợi ý CHỈ áp dụng khi người dùng bấm nút + xác nhận (confirm), không tự lưu lúc mở', /confirm\(msg\)/.test(setupSrc) && /btnFillLiveCc"\)\.addEventListener\("click"/.test(setupSrc));
        check('Có nút khôi phục: xoá CHỈ 8 mapping ON/OFF (setDawMidiOutMapping(a, null)) sau confirm', /btnClearLiveCc/.test(setupSrc) && /DAW_STATE_ACTION_SET\.forEach\(\(a\) => setDawMidiOutMapping\(a, null\)\)/.test(setupSrc));
        // chặn trùng
        const a = setupSrc.indexOf('const DAW_STATE_ACTION_SET'); const b = setupSrc.indexOf('// Hai action ON/OFF');
        const c = setupSrc.indexOf('function findDawStateMappingConflict'); const d = setupSrc.indexOf('\n}\n', c) + 3;
        const store = { MUSIC_ON: mk(102) };
        const fn = new Function('getDawMidiOutMapping', 'DAW_STATE_SUGGESTED', setupSrc.slice(a, b) + '\n' + setupSrc.slice(c, d) + '\nreturn findDawStateMappingConflict;');
        const find = fn((x) => store[x] || null, TABLE);
        check('Chặn trùng: MUSIC_OFF dùng lại CC 102 ch16 -> báo xung đột với MUSIC_ON; CC khác -> không xung đột',
            find('MUSIC_OFF', { kind: 'cc', channel: 16, number: 102 }) === 'MUSIC_ON' && find('MUSIC_OFF', { kind: 'cc', channel: 16, number: 103 }) === null);
        check('Trạng thái hiển thị 8 dòng: "Đã lưu — chỉ gửi lệnh, DAW chưa xác nhận" (không "đã thực thi")', /Đã lưu — chỉ gửi lệnh, DAW chưa xác nhận/.test(setupSrc) && /ĐÃ LƯU \(MIDI\) — chỉ gửi lệnh, DAW chưa xác nhận/.test(setupSrc));
    }

    // ===================================================================== macro
    console.log('\n== Macro LIVE_* (STATIC trên XML — KHÔNG chứng minh Studio One chạy đúng) ==');
    {
        const dir = 'tools/algbench/reports/LIVE-MIDI-FSP8-02/macros';
        const parse = (name) => {
            const x = read(`${dir}/${name}.studioonemacro`).replace(/^﻿/, '');
            const cmds = [...x.matchAll(/<CommandElement category="([^"]*)" name="([^"]*)">\s*<CommandArgument name="([^"]*)" value="([^"]*)"\/>/g)].map((m) => ({ cat: m[1], name: m[2], arg: m[3], val: m[4] }));
            return { title: (x.match(/<Macro title="([^"]*)"/) || [])[1], group: (x.match(/group="([^"]*)"/) || [])[1], cmds, count: (x.match(/<CommandElement /g) || []).length };
        };
        for (const [mac, track, state] of [['LIVE_MUSIC_ON', 'Beat', '1'], ['LIVE_MUSIC_OFF', 'Beat', '0'], ['LIVE_MIC1_ON', 'Mic', '1'], ['LIVE_MIC1_OFF', 'Mic', '0'], ['LIVE_MIC2_ON', 'Không Dây', '1'], ['LIVE_MIC2_OFF', 'Không Dây', '0']]) {
            const p = parse(mac);
            check(`${mac}: đúng 2 lệnh — Find Track "${track}" rồi Track|Monitor State=${state}; không lệnh nào khác (Mute/Send/gain)`,
                p.title === mac && p.group === 'LIVE_TEST' && p.count === 2 && p.cmds.length === 2 && p.cmds[0].name === 'Find Track' && p.cmds[0].val === track && p.cmds[1].cat === 'Track' && p.cmds[1].name === 'Monitor' && p.cmds[1].arg === 'State' && p.cmds[1].val === state, p);
        }
        for (const [mac, state] of [['LIVE_FX_ON', '0'], ['LIVE_FX_OFF', '1']]) {
            const p = parse(mac);
            const buses = ['Delay', 'Verb ngắn', 'Verb dài', 'Com Verb'];
            const ok = p.count === 8 && buses.every((bn, i) => p.cmds[2 * i].cat === 'Console' && p.cmds[2 * i].name === 'Find Channel' && p.cmds[2 * i].val === bn && p.cmds[2 * i + 1].cat === 'Track' && p.cmds[2 * i + 1].name === 'Mute' && p.cmds[2 * i + 1].val === state);
            check(`${mac}: Find Channel + Track|Mute State=${state} cho đúng 4 bus (Delay, Verb ngắn, Verb dài, Com Verb), không lệnh khác`, ok, p);
        }
    }

    // ===================================================================== phạm vi
    console.log('\n== Phạm vi: không đổi D1 / CommandRuntime / HTML / AI Key-BPM-MOD / audioSource ==');
    {
        const { execSync } = require('child_process');
        let changed = [];
        try { changed = execSync('git diff --name-only HEAD', { cwd: ROOT }).toString().split('\n').filter(Boolean); } catch { /* không phải git */ }
        if (changed.length) {
            const forbidden = /\.html$|d1Loader|commandEngine|capabilityRegistry|docs\/d1|core\/command-engine-js\/runtime\.js|midiDriver|app\/main\.js|app\/preload\.js|audioSource\.js|keyEngine|bpmEngine|modEngine|midiHealth|setupMidiInput|appSettings\.js/;
            check('git diff KHÔNG chứa HTML/D1/CommandRuntime/main/preload/audioSource/engines/appSettings', !changed.some((f) => forbidden.test(f)), changed);
        } else console.log('  INFO  không đọc được git diff — đã kiểm bằng tay trong REPORT.md');
        const ar = read('ui/js/actionRegistry.js');
        const arCode = ar.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // bỏ chú thích
        check('actionRegistry.js (mã, không tính chú thích) không có đường Web MIDI/dispatcher mới: không requestMIDIAccess/onmidimessage/easymidi', !/requestMIDIAccess|onmidimessage|easymidi/.test(arCode));
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
