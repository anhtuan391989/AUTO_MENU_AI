/**
 * KnobMidiCompletion01.verify.js — MENU-KNOB-MIDI-COMPLETION-01
 * ---------------------------------------------------------------------------
 * Mã THẬT: ui/js/actionRegistry.js (executeAction), khối Knob thật trích từ ui/js/renderer.js (wheel/mousedown/mousemove/dblclick/dispatchKnobVolume),
 * hàm kiểm xung đột thật trích từ ui/js/setup.js. GIẢ: DOM, hàm gửi MIDI (sendMidiCC ghi lại), SoundEffectEngine (ghi setVolume).
 * KHÔNG phải Fender Studio Pro 8 thật => không chứng minh Knob đổi tham số DAW (xem REPORT.md: BLOCKED_USER_TEST).
 * Chạy: node tests/unit/KnobMidiCompletion01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m, x !== undefined ? JSON.stringify(x) : ''); } };

const ren = read('ui/js/renderer.js');
const kStart = ren.indexOf('let activeKnob = null;'), kEnd = ren.indexOf('document.addEventListener("mouseup"');
if (kStart < 0 || kEnd < 0) throw new Error('Không tìm thấy khối Knob trong renderer.js');
const knobBlock = ren.slice(kStart, kEnd);

class FakeEl { constructor(id) { this.id = id; this.h = {}; this.style = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
    addEventListener(e, f) { (this.h[e] = this.h[e] || []).push(f); } fire(e, p) { (this.h[e] || []).forEach((f) => f(p)); } }

const IDS = ['retune1', 'retune2', 'musicKnob', 'masterKnob', 'clapKnob', 'laughKnob'];
const KNOB_ACTIONS = { retune1: 'RETUNE_SPEED_MIC1', retune2: 'RETUNE_SPEED_MIC2', musicKnob: 'BEAT_INPUT_VOLUME', masterKnob: 'MASTER_OUTPUT_VOLUME' };
const mk = (n, ch = 1) => ({ kind: 'cc', channel: ch, number: n, value: 127, source: 'USER_DEFINED' });

function build({ daws, selected = 'studio-one', sendResult = true } = {}) {
    const store = { selectedDAW: selected, dawMidiOutMappings: daws || { 'studio-one': { BEAT_INPUT_VOLUME: mk(20), MASTER_OUTPUT_VOLUME: mk(21), RETUNE_SPEED_MIC1: mk(22), RETUNE_SPEED_MIC2: mk(23) } } };
    const sent = [], effects = []; let mode = sendResult; const els = {}; IDS.forEach((i) => { els[i] = new FakeEl(i); }); const doc = {};
    const knobData = [
        { id: 'retune1', value: 20, defaultValue: 20 }, { id: 'retune2', value: 20, defaultValue: 20 }, { id: 'musicKnob', value: 90, defaultValue: 90 },
        { id: 'masterKnob', value: 90, defaultValue: 90 }, { id: 'clapKnob', value: 40, defaultValue: 40 }, { id: 'laughKnob', value: 40, defaultValue: 40 },
    ];
    const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Date, Math, Promise,
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting: (k, v) => { store[k] = v; },
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return typeof mode === 'function' ? mode() : mode; }, sendMidiNotePulse: async () => true,
        document: { getElementById: (id) => els[id], addEventListener: (e, f) => { (doc[e] = doc[e] || []).push(f); }, body: { style: {} } },
        knobData, updateKnob() {}, saveData() {}, electronAPI: {},
        KNOB_ID_TO_SOUND_EFFECT: { clapKnob: 'CLAP', laughKnob: 'LAUGH' }, SoundEffectEngine: { setVolume: (id, v) => effects.push({ id, v }) } };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('ui/js/actionRegistry.js'), sb); vm.runInContext(knobBlock, sb);
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    return { sb, els, doc, store, sent, effects, knobData, flush, AR: sb.window.ActionRegistry, setMode: (m) => { mode = m; },
        wheel: async (id, up) => { els[id].fire('wheel', { preventDefault() {}, deltaY: up ? -1 : 1 }); await flush(); },
        val: (id) => knobData.find((k) => k.id === id).value };
}
const ccOf = (v) => Math.round(v * 127 / 100);

(async () => {
    console.log('== 1. Chuyển đổi 0–100 -> CC 0–127 (mã THẬT executeAction) ==');
    {
        const e = build();
        const exp = { 0: 0, 25: 32, 50: 64, 75: 95, 100: 127 };
        for (const [ui, cc] of Object.entries(exp)) {
            e.sent.length = 0; vm.runInContext('window.__knobLastCc = {}', e.sb);
            const r = await e.AR.executeAction('BEAT_INPUT_VOLUME', { reason: 'knob', value: +ui });
            ok(r.ok && e.sent.length === 1 && e.sent[0].v === cc && e.sent[0].n === 20, `Knob ${ui} -> CC ${cc}`, e.sent);
        }
        let allOk = true, mono = true, last = -1;
        for (let v = 0; v <= 100; v++) { vm.runInContext('window.__knobLastCc = {}', e.sb); e.sent.length = 0; await e.AR.executeAction('MASTER_OUTPUT_VOLUME', { reason: 'knob', value: v }); const g = e.sent[0].v; if (g !== ccOf(v) || g < 0 || g > 127) allOk = false; if (g < last) mono = false; last = g; }
        ok(allOk && mono, 'mọi giá trị 0..100: đúng round(v×127/100), nằm trong 0..127, không giảm');
        for (const [bad, cc] of [[-5, 0], [150, 127], [1000, 127]]) {
            vm.runInContext('window.__knobLastCc = {}', e.sb); e.sent.length = 0; await e.AR.executeAction('RETUNE_SPEED_MIC1', { reason: 'knob', value: bad });
            ok(e.sent.length === 1 && e.sent[0].v === cc, `ngoài miền ${bad} -> kẹp an toàn thành CC ${cc} (không tràn 0x7F)`, e.sent);
        }
        e.sent.length = 0; await e.AR.executeAction('RETUNE_SPEED_MIC2', { reason: 'knob', value: NaN });
        ok(e.sent.length === 1 && e.sent[0].v === 127, 'value không hợp lệ (NaN) -> không scale, dùng giá trị tĩnh đã lưu (hành vi cũ), không gửi rác');
        const st = build({ daws: { 'studio-one': { CLAP: mk(30), BEAT_INPUT_VOLUME: mk(20) } } });
        await st.AR.executeAction('CLAP', { reason: 'knob', value: 100 }); await st.AR.executeAction('BEAT_INPUT_VOLUME', { reason: 'menu-button', value: 100 });
        ok(st.sent[0].v === 100 && st.sent[1].v === 100, 'Action khác / reason khác KHÔNG bị scale (giữ hành vi cũ)', st.sent);
    }

    console.log('\n== 2. Bốn Knob MIDI -> đúng bốn Action, độc lập (khối Knob THẬT + ActionRegistry THẬT) ==');
    {
        const e = build();
        const order = [['musicKnob', 20, 91], ['masterKnob', 21, 91], ['retune1', 22, 21], ['retune2', 23, 21]];
        for (const [id, cc, v] of order) { await e.wheel(id, true); ok(e.sent.length && e.sent[e.sent.length - 1].n === cc && e.sent[e.sent.length - 1].v === ccOf(v), `${id} -> ${KNOB_ACTIONS[id]} -> CC${cc}=${ccOf(v)}`, e.sent); }
        ok(e.sent.length === 4 && new Set(e.sent.map((s) => s.n)).size === 4, 'đúng 4 lệnh, 4 CC khác nhau, không gửi nhầm Action của Knob khác', e.sent);
        ok(e.val('musicKnob') === 91 && e.val('masterKnob') === 91 && e.val('retune1') === 21 && e.val('retune2') === 21, 'giá trị UI độc lập (0–100 vẫn hiển thị)');
        await e.wheel('musicKnob', false);
        ok(e.sent.at(-1).n === 20 && e.val('masterKnob') === 91, 'xoay Beat không đổi giá trị/Action của Master');
    }

    console.log('\n== 3. Wheel / kéo chuột / double-click; KHÔNG gửi lặp khi giá trị không đổi ==');
    {
        const e = build();
        e.knobData.find((k) => k.id === 'musicKnob').value = 100;
        // Ghi chú: cử chỉ ĐẦU TIÊN của một Knob trong phiên (DAW chưa từng nhận giá trị) vẫn gửi đúng 1 lệnh dù UI bị kẹp ở biên; MỌI lần lặp sau đó
        // cùng giá trị CC (sau lần gửi THÀNH CÔNG) bị bỏ qua. Việc chống lặp nằm ở actionRegistry (không sửa renderer.js để khỏi đè bản FX Auto).
        await e.wheel('musicKnob', true);
        ok(e.val('musicKnob') === 100 && e.sent.length === 1 && e.sent[0].v === 127, 'wheel lên ở 100 (biên), lần đầu trong phiên: UI giữ 100, gửi 1 lần CC 127');
        await e.wheel('musicKnob', true); await e.wheel('musicKnob', true);
        ok(e.sent.length === 1, 'wheel lên tiếp ở biên 100 (giá trị không đổi): KHÔNG gửi lặp (trước đây gửi mỗi nấc)');
        await e.wheel('musicKnob', false);
        ok(e.sent.length === 2 && e.sent[1].v === ccOf(99), 'wheel xuống 100->99: gửi đúng 1 lệnh CC ' + ccOf(99));
        e.knobData.find((k) => k.id === 'masterKnob').value = 0; await e.wheel('masterKnob', false); await e.wheel('masterKnob', false); await e.wheel('masterKnob', false);
        ok(e.sent.length === 3 && e.sent[2].v === 0, 'wheel xuống ở 0 (biên): gửi 1 lần CC 0 rồi không gửi lặp');
        const e2 = build();
        e2.els.masterKnob.fire('dblclick'); await e2.flush(); e2.els.masterKnob.fire('dblclick'); await e2.flush(); e2.els.masterKnob.fire('dblclick'); await e2.flush();
        ok(e2.val('masterKnob') === 90 && e2.sent.length === 1 && e2.sent[0].v === ccOf(90), 'double-click lặp tại mặc định: UI giữ 90, chỉ 1 lệnh CC ' + ccOf(90));
        e2.knobData.find((k) => k.id === 'masterKnob').value = 30; e2.els.masterKnob.fire('dblclick'); await e2.flush();
        ok(e2.val('masterKnob') === 90 && e2.sent.length === 1, 'double-click từ 30 về 90 khi DAW đã nhận CC ' + ccOf(90) + ': không gửi lại cùng giá trị CC');
        e2.knobData.find((k) => k.id === 'masterKnob').value = 50; await e2.wheel('masterKnob', true); e2.els.masterKnob.fire('dblclick'); await e2.flush();
        ok(e2.sent.length === 3 && e2.sent[1].v === ccOf(51) && e2.sent[2].v === ccOf(90), 'đổi sang giá trị khác rồi về mặc định: gửi đúng từng giá trị (CC ' + ccOf(51) + ' rồi ' + ccOf(90) + ')', e2.sent);
        const e3 = build();
        e3.els.musicKnob.fire('mousedown', { clientY: 100 });
        const mv = (y) => (e3.doc.mousemove || []).forEach((f) => f({ clientY: y }));
        mv(90); await e3.flush(); mv(90); await e3.flush();
        ok(e3.val('musicKnob') === 95 && e3.sent.length === 1 && e3.sent[0].v === ccOf(95), 'kéo chuột: đúng 1 lệnh, đứng yên không gửi thêm');
        mv(-1000); await e3.flush(); mv(-2000); await e3.flush();
        ok(e3.val('musicKnob') === 100 && e3.sent.length === 2, 'kéo vượt biên: UI kẹp 100, chỉ gửi khi giá trị thực sự đổi');
        await e3.wheel('retune1', true); await e3.wheel('retune1', true);
        ok(e3.sent.length === 4 && e3.sent.slice(2).every((s) => s.n === 22), 'mỗi nấc wheel (giá trị khác nhau) gửi đúng 1 lệnh');
    }

    console.log('\n== 4. Thiếu mapping / lỗi cổng: Knob vẫn xoay, không báo thành công giả ==');
    {
        const e = build({ daws: { 'studio-one': {} } });
        await e.wheel('musicKnob', true);
        ok(e.val('musicKnob') === 91 && e.sent.length === 0, 'chưa cấu hình: UI vẫn xoay (91), 0 lệnh MIDI');
        const r = await e.AR.executeAction('BEAT_INPUT_VOLUME', { reason: 'knob', value: 91 });
        ok(!r.ok && (r.reason === 'NOT_CONFIGURED' || r.status === 'NOT_CONFIGURED'), 'executeAction trả NOT_CONFIGURED (không ok)', r);
        const f = build({ sendResult: false });
        await f.wheel('masterKnob', true);
        ok(f.val('masterKnob') === 91 && f.sent.length === 1, 'cổng MIDI lỗi: UI vẫn xoay, có thử gửi 1 lần');
        const r2 = await f.AR.executeAction('MASTER_OUTPUT_VOLUME', { reason: 'knob', value: 91 });
        ok(!r2.ok && r2.status === 'NO_DEVICE' && f.sent.length === 2, 'gửi lỗi trả NO_DEVICE (không ok) và lần sau cùng giá trị VẪN gửi lại (không nhớ lần lỗi)', r2);
        f.setMode(true);
        const r3 = await f.AR.executeAction('MASTER_OUTPUT_VOLUME', { reason: 'knob', value: 91 });
        const r4 = await f.AR.executeAction('MASTER_OUTPUT_VOLUME', { reason: 'knob', value: 91 });
        ok(r3.ok && !r3.skipped && r4.ok && r4.skipped === 'DUPLICATE_VALUE' && f.sent.length === 3, 'gửi OK rồi cùng giá trị: lần 2 bỏ qua (skipped), tổng 3 lệnh', [r3, r4]);
        ok(r3.dawConfirmed === undefined, 'không có trường "DAW đã xác nhận" trong kết quả Knob');
    }

    console.log('\n== 5. Mapping độc lập theo DAW; đổi mapping thì gửi lại ==');
    {
        const daws = { 'studio-one': { BEAT_INPUT_VOLUME: mk(20, 1) }, cubase: { BEAT_INPUT_VOLUME: mk(40, 3) } };
        const snapshot = JSON.stringify(daws);
        const e = build({ daws });
        await e.wheel('musicKnob', true);
        e.store.selectedDAW = 'cubase'; await e.wheel('musicKnob', true);
        ok(e.sent[0].n === 20 && e.sent[0].ch === 0 && e.sent[1].n === 40 && e.sent[1].ch === 2, 'studio-one -> CC20 ch1(index0); cubase -> CC40 ch3(index2)', e.sent);
        ok(JSON.stringify(e.store.dawMidiOutMappings) === snapshot, 'đổi DAW và xoay Knob KHÔNG làm mất/đổi mapping của DAW nào');
        e.store.selectedDAW = 'studio-one'; e.sent.length = 0; await e.wheel('musicKnob', true);
        ok(e.sent.length === 1 && e.sent[0].n === 20, 'quay lại studio-one: dùng đúng mapping riêng của nó');
        e.store.selectedDAW = 'ableton'; const n = e.sent.length; await e.wheel('musicKnob', true);
        ok(e.sent.length === n, 'DAW chưa có mapping: không gửi (NOT_CONFIGURED), không mượn mapping DAW khác');
    }

    console.log('\n== 6. Xung đột CC với 8 mapping LIVE và nhau (hàm THẬT trong setup.js) ==');
    {
        const setup = read('ui/js/setup.js');
        const a = setup.indexOf('const DAW_MIDI_ACTIONS = ['), a2 = setup.indexOf('];', a) + 2;
        const b = setup.indexOf('const DAW_STATE_SUGGESTED = '), b2 = setup.indexOf('const DAW_STATE_SUGGESTED_VALUE = 127;') + 'const DAW_STATE_SUGGESTED_VALUE = 127;'.length;
        const c = setup.indexOf('const KNOB_MIDI_ACTION_SET'), c2 = setup.indexOf('function isMouseControlEnabledLocal');
        if (a < 0 || b < 0 || c < 0) throw new Error('Không trích được khối setup.js');
        const saved = { MUSIC_ON: mk(102, 16), FX_OFF: mk(109, 16), BEAT_INPUT_VOLUME: mk(20, 1), MASTER_OUTPUT_VOLUME: mk(21, 1), MONITOR_FX: mk(22, 2) };
        const fn = new Function('getDawMidiOutMapping', setup.slice(a, a2) + '\n' + setup.slice(b, b2) + '\n' + setup.slice(c, c2) + '\nreturn { findMidiOutMappingConflict, MIDI_CONFLICT_GUARD_SET };')((act) => saved[act] || null);
        const { findMidiOutMappingConflict: f, MIDI_CONFLICT_GUARD_SET: G } = fn;
        ok(['BEAT_INPUT_VOLUME', 'MASTER_OUTPUT_VOLUME', 'RETUNE_SPEED_MIC1', 'RETUNE_SPEED_MIC2', 'MUSIC_ON', 'FX_OFF', 'MUSIC_SELECT', 'MIC1_SELECT', 'MIC2_SELECT'].every((x) => G.has(x)) && G.size === 15, 'nhóm bảo vệ = 4 Knob + 8 LIVE + 3 CHỌN TRACK (MENU-FIX-02: 12→15, chủ đích)');
        ok(f('RETUNE_SPEED_MIC1', mk(102, 16)) === 'MUSIC_ON', 'Retune 1 đặt CC102 ch16 -> xung đột với MUSIC_ON (bị chặn)');
        ok(f('MUSIC_OFF', mk(20, 1)) === 'BEAT_INPUT_VOLUME', 'LIVE đặt CC20 ch1 -> xung đột với Knob Beat');
        ok(f('RETUNE_SPEED_MIC2', mk(21, 1)) === 'MASTER_OUTPUT_VOLUME', 'Knob trùng Knob khác -> bị chặn');
        ok(f('RETUNE_SPEED_MIC1', mk(22, 2)) === 'MONITOR_FX', 'Knob trùng action cũ (MONITOR_FX CC22 ch2) -> bị chặn');
        ok(f('RETUNE_SPEED_MIC1', mk(102, 1)) === null && f('RETUNE_SPEED_MIC1', { kind: 'note', channel: 16, number: 102 }) === null, 'khác kênh hoặc khác loại (Note) -> không xung đột');
        ok(f('BEAT_INPUT_VOLUME', mk(20, 1)) === null, 'lưu lại đúng mapping của chính mình -> không tự xung đột');
        ok(JSON.stringify(saved.MUSIC_ON) === JSON.stringify(mk(102, 16)) && JSON.stringify(saved.BEAT_INPUT_VOLUME) === JSON.stringify(mk(20, 1)), 'kiểm tra chỉ ĐỌC: mapping đã lưu không bị đổi');
        ok(/if \(MIDI_CONFLICT_GUARD_SET\.has\(action\)\) \{\s*const clash = findMidiOutMappingConflict\(action, mapping\);/.test(setup) && /liveClash/.test(setup), 'nút 💾 Lưu và nút "Điền bộ CC gợi ý" đều gọi kiểm xung đột (static)');
    }

    console.log('\n== 7. Clap / Laugh: SoundEffectEngine nội bộ, KHÔNG MIDI, KHÔNG scale, độc lập ==');
    {
        const e = build();
        await e.wheel('clapKnob', true); await e.wheel('laughKnob', false); await e.wheel('laughKnob', false);
        ok(e.sent.length === 0, 'Clap/Laugh không phát MIDI');
        ok(JSON.stringify(e.effects) === JSON.stringify([{ id: 'CLAP', v: 41 }, { id: 'LAUGH', v: 39 }, { id: 'LAUGH', v: 38 }]), 'SoundEffectEngine.setVolume nhận giá trị 0–100 NGUYÊN (41/39/38), không scale 127', e.effects);
        ok(e.val('clapKnob') === 41 && e.val('laughKnob') === 38, 'Clap và Laugh không dùng chung giá trị');
        const e2 = build({ daws: { 'studio-one': { CLAP: mk(60) } } }); await e2.wheel('clapKnob', true);
        ok(e2.sent.length === 0, 'kể cả khi có mapping CLAP (nút phát) thì Knob Clap vẫn không gửi MIDI');
        const mapSlice = knobBlock.slice(knobBlock.indexOf('const KNOB_ID_TO_ACTION = {'), knobBlock.indexOf('};', knobBlock.indexOf('const KNOB_ID_TO_ACTION = {')));
        ok(/retune1\s*:/.test(mapSlice) && !/^\s*(clapKnob|laughKnob)\s*:/m.test(mapSlice), 'KNOB_ID_TO_ACTION (static) có 4 Knob MIDI, không có clapKnob/laughKnob')
    }

    console.log('\n== 8. Lưu/khôi phục 6 Knob: không gửi MIDI, không đụng Key/BPM/MOD/preset/nút LIVE ==');
    {
        const sd = ren.slice(ren.indexOf('function saveData() {'), ren.indexOf('function loadData() {'));
        const ld = ren.slice(ren.indexOf('function loadData() {'), ren.indexOf('11. NÚT GHI ĐÈ TAY'));
        const knobsSave = (sd.match(/knobs:\s*knobData\.map\(k => \(\{ id: k\.id, value: k\.value \}\)\)/) || [])[0];
        ok(!!knobsSave, 'saveData lưu đúng {id,value} của cả 6 Knob (knobData.map)');
        const loadKnob = ld.slice(ld.indexOf('if (Array.isArray(data.knobs))'));
        ok(!/executeAction|dispatchKnobVolume|sendMidi|setDawControlState/.test(loadKnob), 'khôi phục Knob KHÔNG gọi MIDI/Action (không tự gửi lúc khởi động; UI không giả vờ DAW đã xác nhận)');
        ok(/knob\.value = saved\.value;\s*updateKnob\(knob\);/.test(loadKnob) && !/musicBtn|mic1Btn|mic2Btn|fxBtn|toneSelector|preset|bpm|Key/i.test(loadKnob.slice(0, loadKnob.indexOf('SoundEffectEngine.setVolume'))), 'phần khôi phục Knob chỉ đặt giá trị Knob (không đụng nút LIVE/Key/BPM/MOD/preset)');
        ok(/BUTTON-RESET: 4 nút Music\/Mic1\/Mic2\/FX KHÔNG được khôi phục/.test(ld), 'nút LIVE vẫn không được khôi phục từ file (BUTTON-RESET giữ nguyên)');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
