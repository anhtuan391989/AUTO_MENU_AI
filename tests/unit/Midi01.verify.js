/**
 * Midi01.verify.js — TASK MIDI-01 (đường MIDI từ Key AI tới API send). Chạy appSettings.js (getSelectedMidiOutput/sendMidi*),
 * vocalCommandRouter.js (sendKeyToAutotune) và renderer.js (applyActiveKeyToPlugin + FAST-08) THẬT, với Web MIDI GIẢ (navigator.requestMIDIAccess giả).
 * ĐÂY LÀ MÔ PHỎNG: KHÔNG chứng minh message tới DAW/plugin. Không có MIDI_RECEIVED_AT_DESTINATION ở đây.
 * Cũng chạy MÃ CŨ (git HEAD~ tại d672ed9) để chứng minh lỗi trước/sau.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const root = path.join(__dirname, '../..');
const cur = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const old = (f) => { try { return cp.execSync(`git show d672ed9:${f}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
function fnText(t, name, a) { const st = t.indexOf(`${a ? 'async ' : ''}function ${name}(`); if (st < 0) throw new Error(name); let i = t.indexOf('{', st), d = 0; for (; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) break; } return t.slice(st, i + 1); }
const tick = () => new Promise((r) => setImmediate(r));

// ---- Web MIDI giả ----
function fakeMidi(ports) { // ports: [{name, state, throwOnSend}]
    const sent = [];
    const outs = new Map();
    const mk = (p, i) => ({ id: 'id' + i, name: p.name, state: p.state || 'connected', connection: 'closed', send(bytes) { if (this.throwOnSend || this.state === 'disconnected') { const e = new Error('The port is not connected'); e.name = 'InvalidStateError'; throw e; } sent.push({ port: this.name, bytes: [...bytes] }); }, throwOnSend: !!p.throwOnSend });
    ports.forEach((p, i) => outs.set('id' + i, mk(p, i)));
    return { sent, outs, access: { outputs: outs }, add(p) { outs.set('idN' + outs.size, mk(p, 99)); }, remove(name) { for (const [k, v] of outs) if (v.name === name) outs.delete(k); } };
}

function rig({ ports = [], settings = {}, useOld = false, clickOk = true } = {}) {
    const AS = (useOld ? old('ui/js/appSettings.js') : null) || cur('ui/js/appSettings.js');
    const VR = (useOld ? old('ui/js/vocalCommandRouter.js') : null) || cur('ui/js/vocalCommandRouter.js');
    const RD = (useOld ? old('ui/js/renderer.js') : null) || cur('ui/js/renderer.js');
    const midi = fakeMidi(ports), errs = [], clicks = [];
    const cfg = { midiOutputPort: '', mouseControlEnabled: true, ...settings };
    const timers = [];
    const sb = { console: { log() {}, warn() {}, error: (...a) => errs.push(a.join(' ')) }, Date, performance: { now: () => 1 }, JSON, Object, Promise, Array, Error, String, setTimeout: (f, ms) => { timers.push(f); return timers.length; } };
    sb.window = sb; sb.navigator = { requestMIDIAccess: async () => midi.access };
    sb.electronAPI = { clickAtPoint: async (p) => { clicks.push(p); return { ok: clickOk, detail: clickOk ? 'ok' : 'click lỗi' }; } };
    vm.createContext(sb);
    // Phần appSettings.js THẬT cần thiết (MIDI + diag), getSetting giả đọc cfg
    const midiSrc = AS.slice(AS.indexOf('let midiAccessPromise = null;'), AS.indexOf('/* ==========================================================\n   HỒ SƠ TỌA ĐỘ'));
    Object.assign(sb, { getSetting: (k, fb = '') => (cfg[k] != null && cfg[k] !== '' ? cfg[k] : fb), getCoordinate: () => '10,20', setStatus() {}, refreshKeySourceDisplay() {}, logKeySource() {}, getActiveKeyValue: () => sb.__v, getActiveSourceName: () => 'ai', isAiControlActive: () => false, keySelector: null, currentKeyEl: null, keyEverDetected: true, aiDiag() {} });
    const NM = 'const NOTE_MAP = { "C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11 };';
    vm.runInContext(`${midiSrc}\n${NM}\n${fnText(VR, 'parseCapturedPoint')}\n${fnText(VR, 'isMouseFallbackAllowed')}\n${fnText(VR, 'sendKeyToAutotune', true)}
        let originalKey = 'C Major', lastPluginKey = 'C Major', __aiCycleGen = 1;
        const __aiPluginSend = { total: 0, ok: 0, fail: 0, byKey: {}, lastStatus: null, lastDetail: null };
        const __pluginMouseBlock = { active: false, sig: null, keys: {}, logged: false, episodes: 0, suppressedSends: 0, suppressedLogs: 0, recoveries: 0 };
        ${fnText(RD, 'pluginMouseSig')}\n${fnText(RD, 'pluginSendShouldSkip')}\n${fnText(RD, 'pluginSendOutcome')}\n${fnText(RD, 'aiRecordPluginSend')}\n${fnText(RD, 'applyActiveKeyToPlugin')}
        this.send = sendKeyToAutotune; this.apply = (v) => { this.__v = v; applyActiveKeyToPlugin('AI Detect'); }; this.lpk = () => lastPluginKey; this.stats = () => JSON.parse(JSON.stringify(__aiPluginSend));`, sb);
    return { sb, midi, errs, clicks, cfg, timers, apply: async (v) => { sb.apply(v); for (let i = 0; i < 4; i++) await tick(); }, sentMsgs: () => midi.sent.map((m) => m.bytes.join(',')) };
}
const OLD_OK = !!old('ui/js/appSettings.js'); // không có git/commit d672ed9 => bỏ qua (SKIP) các ca "TRƯỚC SỬA", không tính FAIL
if (!OLD_OK) console.log('  SKIP  các ca TRƯỚC SỬA (không đọc được d672ed9 từ git)');
const unhandled = []; process.on('unhandledRejection', (e) => unhandled.push(e));

(async () => {
    console.log('\n== A. Chọn port + message thực tế (contract hiện hữu: Note On ch1 (0x90), note = pitch-class 0..11 của gốc Key, vel 100; Note Off sau 120ms) ==');
    { const r = rig({ ports: [{ name: 'loopMIDI A' }, { name: 'loopMIDI B' }], settings: { midiOutputPort: 'loopMIDI B' } });
      const res = await r.sb.send('F# Minor');
      ok(res.ok && res.driverUsed === 'midi' && res.confirmation === 'MIDI_SENT_UNCONFIRMED', 'send OK ở tầng API => ok + confirmation=MIDI_SENT_UNCONFIRMED (KHÔNG phải "đã nhận tại đích")');
      ok(r.midi.sent.length === 1 && r.midi.sent[0].port === 'loopMIDI B' && r.sentMsgs()[0] === '144,6,100', `đúng port đã chọn, message Note On = ${r.sentMsgs()[0]} (0x90,6,100)`);
      r.timers.forEach((f) => f()); await tick(); ok(r.sentMsgs()[1] === '128,6,0', `Note Off sau pulse = ${r.sentMsgs()[1]} (0x80,6,0)`);
      const m1 = await r.sb.send('F# Major'); ok(r.sentMsgs()[2] === '144,6,100', 'GHI NHẬN (đặc điểm contract hiện hữu): F# Major và F# Minor cho CÙNG message (chế độ Major/Minor không được truyền) — KHÔNG đổi trong task này');
      const d = r.sb.window.__midiDiagReport().map((x) => x.state); ok(d.includes('MIDI_SEND_ATTEMPTED') && d.includes('MIDI_SENT_UNCONFIRMED') && !d.includes('MIDI_RECEIVED_AT_DESTINATION'), 'diag có SEND_ATTEMPTED + SENT_UNCONFIRMED, không bao giờ RECEIVED_AT_DESTINATION'); }

    console.log('\n== B. Trạng thái lỗi: không port / chưa chọn / không tìm thấy / Web MIDI không có ==');
    { const r = rig({ ports: [{ name: 'X' }], settings: { midiOutputPort: '' } }); r.sb.getCoordinate = () => ''; const res = await r.sb.send('C Major');
      ok(res.ok === false && res.midi.reason === 'MIDI_PORT_NOT_SELECTED' && r.midi.sent.length === 0, 'chưa chọn port => ok:false, không gửi, lý do MIDI_PORT_NOT_SELECTED (không giả success)'); }
    { const r = rig({ ports: [{ name: 'loopMIDI A' }], settings: { midiOutputPort: 'Port cũ đã mất' }, clickOk: true }); const res = await r.sb.send('C Major');
      ok(r.midi.sent.length === 0 && res.midi.attempted && res.midi.sent === false, 'port đã lưu không còn => MIDI sent=false (không giả success)');
      ok(r.sb.window.__midiDiagReport().some((x) => x.state === 'MIDI_PORT_NOT_FOUND'), 'diag MIDI_PORT_NOT_FOUND');
      ok(res.driverUsed === 'mouse' && res.ok === true, 'fallback chuột (Mouse bật) => ok nhưng driverUsed="mouse" (KHÔNG nhầm với MIDI success)'); }
    { const r = rig({ ports: [], settings: { midiOutputPort: 'A' } }); r.sb.navigator.requestMIDIAccess = async () => { throw new Error('denied'); };
      const res = await r.sb.send('C Major'); ok(res.midi.sent === false && r.sb.window.__midiDiagReport().some((x) => x.state === 'MIDI_NO_OUTPUT'), 'Web MIDI không dùng được => MIDI_NO_OUTPUT, sent=false'); }

    console.log('\n== C. LỖI ĐÃ CHỨNG MINH #1: output.send() ném (cổng bị rút/đóng) ==');
    const portDead = { ports: [{ name: 'loopMIDI A', state: 'disconnected' }], settings: { midiOutputPort: 'loopMIDI A', mouseControlEnabled: true } };
    if (OLD_OK) { const r = rig({ ...portDead, useOld: true }); let threw = false, res; try { res = await r.sb.send('C Major'); } catch (e) { threw = true; }
      ok(threw, 'TRƯỚC SỬA (d672ed9): sendKeyToAutotune bị REJECT khi send() ném => bỏ qua fallback, vi phạm hợp đồng "trả false, không throw"'); }
    { const r = rig({ ...portDead }); let threw = false, res; try { res = await r.sb.send('C Major'); } catch (e) { threw = true; }
      ok(!threw && res.midi.sent === false, 'SAU SỬA: không ném; MIDI sent=false');
      ok(res.driverUsed === 'mouse' && res.ok === true && r.clicks.length === 1, 'SAU SỬA: rơi xuống fallback đúng như comment thiết kế (Mouse bật)');
      ok(r.sb.window.__midiDiagReport().some((x) => x.state === 'MIDI_PORT_CLOSED' && /InvalidStateError/.test(x.error)), 'diag MIDI_PORT_CLOSED kèm InvalidStateError (không giả success)'); }
    { const r = rig({ ports: [{ name: 'P', throwOnSend: true, state: 'connected' }], settings: { midiOutputPort: 'P' } });
      const res = await r.sb.send('C Major'); ok(res.midi.sent === false && r.sb.window.__midiDiagReport().some((x) => x.state === 'MIDI_PORT_CLOSED' || x.state === 'MIDI_SEND_FAILED'), 'send() ném lỗi khác => ghi nhận thất bại'); }
    if (OLD_OK) { const r = rig({ ...portDead, useOld: true }); r.sb.apply('F# Minor'); for (let i = 0; i < 6; i++) await tick();
      ok(unhandled.length >= 1, 'TRƯỚC SỬA: promise reject không ai bắt (unhandledRejection) ở applyActiveKeyToPlugin'); unhandled.length = 0; }
    { const before = unhandled.length; const r = rig({ ...portDead }); await r.apply('F# Minor'); ok(unhandled.length === before, 'SAU SỬA: không còn unhandledRejection'); }

    console.log('\n== D. Mouse Control tắt + MIDI hợp lệ: đường MIDI độc lập ==');
    { const r = rig({ ports: [{ name: 'L' }], settings: { midiOutputPort: 'L', mouseControlEnabled: false } });
      await r.apply('F# Minor'); ok(r.midi.sent.length === 1 && r.clicks.length === 0 && r.sb.lpk() === 'F# Minor', 'MIDI gửi, KHÔNG click, lastPluginKey cập nhật (mouseControlEnabled chỉ chặn nhánh fallback chuột)'); }
    { const r = rig({ ports: [{ name: 'L' }], settings: { midiOutputPort: 'BAD', mouseControlEnabled: true } });
      await r.apply('F# Minor'); ok(r.midi.sent.length === 0 && r.clicks.length === 1, 'Mouse bật + MIDI port sai: không có message MIDI; thành công là do chuột (driver=mouse)');
      ok(r.sb.window.__midiDiagReport().filter((x) => x.state === 'MIDI_SENT_UNCONFIRMED').length === 0, 'diag KHÔNG có MIDI_SENT_UNCONFIRMED khi chỉ chuột hoạt động'); }

    console.log('\n== E. Đổi midiOutputPort => lần gửi sau dùng port mới ==');
    { const r = rig({ ports: [{ name: 'A' }, { name: 'B' }], settings: { midiOutputPort: 'A' } });
      await r.sb.send('C Major'); r.cfg.midiOutputPort = 'B'; await r.sb.send('D Major');
      ok(r.midi.sent[0].port === 'A' && r.midi.sent[1].port === 'B', 'getSetting đọc lại mỗi lần gửi => không stale trong cùng renderer (sau onSetupChanged→loadSetup)'); }

    console.log('\n== F. FAST-08 × MIDI ==');
    const miss = { ports: [], settings: { midiOutputPort: 'loopMIDI A', mouseControlEnabled: false } };
    // F1: FAST-08 cũ chặn MIDI khi cổng quay lại (setting không đổi)
    { const r = rig({ ...miss, useOld: false }); // dùng renderer HIỆN TẠI nhưng ép logic FAST-08 cũ bằng bản d672ed9
      const o = rig({ ...miss, useOld: OLD_OK });
      for (const R of [o]) { await R.apply('F# Minor'); await R.apply('F# Minor'); R.midi.add({ name: 'loopMIDI A' }); await R.apply('F# Minor'); await R.apply('F# Minor'); }
      if (OLD_OK) ok(o.midi.sent.length === 0, 'TRƯỚC SỬA (FAST-08 d672ed9, mã cũ): cổng MIDI quay lại nhưng setting không đổi => cùng Key BỊ BỎ QUA VĨNH VIỄN, 0 message MIDI được gửi');
      const n = r; await n.apply('F# Minor'); await n.apply('F# Minor'); n.midi.add({ name: 'loopMIDI A' }); await n.apply('F# Minor');
      ok(n.midi.sent.length === 1 && n.sb.lpk() === 'F# Minor', 'SAU SỬA: cổng quay lại => lần áp dụng kế tiếp gửi MIDI thành công (API-level), lastPluginKey cập nhật');
      ok(n.errs.filter((e) => e.startsWith('sendKeyToAutotune lỗi')).length <= 1, 'SAU SỬA: vẫn không spam log lỗi (FAST-08 log-dedupe còn nguyên)'); }
    // F2: không có port MIDI cấu hình => FAST-08 giữ nguyên hành vi
    { const r = rig({ ports: [], settings: { midiOutputPort: '', mouseControlEnabled: false } }); for (let i = 0; i < 5; i++) await r.apply('F# Minor');
      ok(r.sb.stats().total === 1 && r.errs.filter((e) => e.startsWith('sendKeyToAutotune lỗi')).length === 1, 'không cấu hình MIDI + Mouse tắt: FAST-08 vẫn 1 lần gửi + 1 log (hành vi FAST-08 giữ nguyên)'); }
    // F3: MIDI valid + Mouse tắt không bao giờ bị FAST-08 chặn
    { const r = rig({ ports: [{ name: 'L' }], settings: { midiOutputPort: 'L', mouseControlEnabled: false } }); await r.apply('A Major'); await r.apply('B Minor'); await r.apply('A Major');
      ok(r.midi.sent.length === 3, 'MIDI hợp lệ + Mouse tắt: mỗi Key đổi đều gửi (3 message), FAST-08 không chặn'); }
    // F4: dedupe cùng Key (chính sách hiện hữu)
    { const r = rig({ ports: [{ name: 'L' }], settings: { midiOutputPort: 'L' } }); for (let i = 0; i < 4; i++) await r.apply('F# Minor');
      ok(r.midi.sent.length === 1, 'AI phát lại cùng Key => chỉ gửi 1 lần (chính sách dedupe lastPluginKey hiện hữu, KHÔNG đổi)'); }
    // F5: lỗi khác MOUSE_DISABLED
    { const r = rig({ ports: [], settings: { midiOutputPort: 'X', mouseControlEnabled: true }, clickOk: false }); for (let i = 0; i < 3; i++) await r.apply('F# Minor');
      ok(r.errs.filter((e) => e.startsWith('sendKeyToAutotune lỗi')).length === 3, 'lỗi KHÁC MOUSE_DISABLED (click lỗi) vẫn báo mỗi lần'); }

    console.log('\n== G. Key detection không phụ thuộc MIDI ==');
    { const r = rig({ ports: [], settings: { midiOutputPort: '' } }); r.sb.navigator.requestMIDIAccess = undefined;
      let threw = false; try { await r.apply('F# Minor'); } catch (e) { threw = true; } ok(!threw, 'không có Web MIDI: applyActiveKeyToPlugin không crash'); }
    { const k = cur('ui/js/engines/keyEngine.js'), ren = cur('ui/js/renderer.js');
      ok(k === (old('ui/js/engines/keyEngine.js') || k), 'keyEngine.js KHÔNG đổi so với d672ed9 (Key detection nguyên vẹn)');
      ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(ren), 'timer 2000ms nguyên vẹn'); }
    console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
