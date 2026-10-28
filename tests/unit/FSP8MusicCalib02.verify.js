// FSP8-MIDI-SYNC-FAST-02 — hiệu chuẩn MUSIC (BEAT_INPUT_VOLUME) trên Studio Pro 8. PASS_CODE/PASS_SIM; KHÔNG phải test Windows+FSP8.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const reg = fs.readFileSync(path.join(ROOT, 'ui/js/actionRegistry.js'), 'utf8');
const ren = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d !== undefined ? ' :: ' + JSON.stringify(d) : '')); } };

function env(daw, map) {
  const st = { selectedDAW: daw, dawMidiOutMappings: { [daw]: map } }; const sent = [];
  const sb = { console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Date, Math, Promise,
    getSetting: (k, f) => (st[k] === undefined ? f : st[k]), setSetting: (k, v) => { st[k] = v; },
    sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; }, sendMidiNotePulse: async () => true, saveData() {}, electronAPI: {} };
  sb.window = sb; vm.createContext(sb); vm.runInContext(reg, sb);
  const AR = sb.window.ActionRegistry;
  return { sent, turn: (a, v) => AR.executeAction(AR.ACTIONS[a], { reason: 'knob', value: v }), sb };
}
const M = (n) => ({ kind: 'cc', channel: 15, number: n, value: 127, source: 'USER_DEFINED' });
const MAPS = { BEAT_INPUT_VOLUME: M(20), MASTER_OUTPUT_VOLUME: M(21), RETUNE_SPEED_MIC1: M(22), RETUNE_SPEED_MIC2: M(23) };
const OLD = (v) => Math.round(Math.max(0, Math.min(100, v)) * 127 / 100);

(async () => {
  const e = env('Studio Pro 8', MAPS);
  const cc = async (a, v) => { e.sent.length = 0; vm.runInContext('window.__knobLastCc = {}', e.sb); await e.turn(a, v); return e.sent[0]; };
  // điểm neo
  for (const [v, c] of [[0, 0], [50, 64], [90, 97], [100, 127]]) { const r = await cc('BEAT_INPUT_VOLUME', v); ok(r && r.n === 20 && r.ch === 14 && r.v === c, `[neo] MUSIC ${v} -> CC20 = ${c} (kênh index 14)`, r); }
  // số đo thật của người dùng vẫn nhất quán: CC97 = +0,2 dB là CC gần 0 dB nhất trong các CC đã đo (95:-0,5 · 97:+0,2 · 98:+0,5 · 99:+0,8)
  const measured = { 64: -11.3, 95: -0.5, 97: 0.2, 98: 0.5, 99: 0.8, 114: 5.7, 127: 10 };
  const best = Object.entries(measured).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
  ok(+best[0] === 97 && (await cc('BEAT_INPUT_VOLUME', 90)).v === 97, '[căn cứ] CC gần 0 dB nhất theo số đo = 97 và MUSIC 90 gửi đúng 97', best);
  // toàn dải: trong 0–127, không giảm, dưới 50 bằng công thức cũ
  let last = -1, inR = true, mono = true, low = true; const all = [];
  for (let v = 0; v <= 100; v++) { const r = await cc('BEAT_INPUT_VOLUME', v); all.push(r.v); if (r.v < 0 || r.v > 127 || !Number.isInteger(r.v)) inR = false; if (r.v < last) mono = false; last = r.v; if (v < 50 && r.v !== OLD(v)) low = false; }
  ok(inR && mono && low, '[dải] MUSIC 0–100: CC nguyên trong 0–127, không giảm khi tăng, dưới 50 giữ công thức cũ', all.join(','));
  // giá trị ngoài dải được kẹp
  ok((await cc('BEAT_INPUT_VOLUME', 150)).v === 127 && (await cc('BEAT_INPUT_VOLUME', -20)).v === 0, '[dải] MUSIC ngoài 0–100 được kẹp (127 / 0)');
  // MASTER và Retune: công thức cũ trên FSP8
  let same = true; for (const a of ['MASTER_OUTPUT_VOLUME', 'RETUNE_SPEED_MIC1', 'RETUNE_SPEED_MIC2']) for (let v = 0; v <= 100; v++) { const r = await cc(a, v); if (r.v !== OLD(v) || r.n !== MAPS[a].number) same = false; }
  ok(same, '[MASTER] MASTER CC21 + RETUNE CC22/23 vẫn dùng round(v×127/100) trên Studio Pro 8');
  // DAW khác: MUSIC giữ công thức cũ
  for (const d of ['Studio One 7', 'Cubase 13', 'Studio One 5', '']) {
    const f = env(d || 'x', MAPS); if (!d) f.sb.getSetting = () => undefined;
    let o = true; for (let v = 0; v <= 100; v++) { f.sent.length = 0; vm.runInContext('window.__knobLastCc = {}', f.sb); await f.turn('BEAT_INPUT_VOLUME', v); if (f.sent[0] && f.sent[0].v !== OLD(v)) o = false; }
    ok(o, `[DAW khác] "${d || '(chưa chọn)'}": MUSIC giữ công thức cũ`);
  }
  // CC20 / kênh 15 không đổi; không gửi lúc nạp
  ok(e.sent.length <= 1, '[khởi tạo] chỉ gửi khi gọi executeAction(reason:"knob")');
  ok(!/knobToCc|KNOB_CC_ANCHORS/.test(ren), '[UI] renderer.js không đổi (hiệu chuẩn nằm ở actionRegistry)');
  const li = ren.indexOf('function loadData()'); ok(!/executeAction|dispatchKnobVolume|sendMidi/.test(ren.slice(li, ren.indexOf('\n}\n', li))), '[khởi tạo] loadData() vẫn không gửi MIDI');
  // chỉ MUSIC trên Studio Pro 8 có neo
  const anchors = vm.runInContext('KNOB_CC_ANCHORS', e.sb);
  ok(Object.keys(anchors).join() === 'Studio Pro 8' && Object.keys(anchors['Studio Pro 8']).join() === 'BEAT_INPUT_VOLUME', '[phạm vi] chỉ có neo cho Studio Pro 8 / BEAT_INPUT_VOLUME');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
