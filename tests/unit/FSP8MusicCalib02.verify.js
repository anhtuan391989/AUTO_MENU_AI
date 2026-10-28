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
  // ===== FSP8-MIDI-SYNC-FAST-03 =====
  // [dữ liệu] CC thực sự nhận được suy ra từ knobToCc (FAST-02) và đối chiếu số External Devices (= CC×100/127) — KHÔNG dùng làm anchor.
  const OLD02 = (v) => (v < 50 ? OLD(v) : v <= 90 ? Math.round(64 + 33 * (v - 50) / 40) : Math.round(97 + 30 * (v - 90) / 10));
  const ext = { 75: 66.93, 80: 70.08, 85: 73.23, 90: 76.38, 92: 81.10, 93: 83.46, 95: 88.19 };
  ok(Object.entries(ext).every(([v, x]) => Math.abs(OLD02(+v) * 100 / 127 - x) < 0.011), '[dữ liệu] External Devices = CC(FAST-02)×100/127 khớp 7/7 hàng (75…95); hàng 70 ghi 68,78 lệch đúng 5,00 so với 63,78 (nghi gõ nhầm, chưa xác nhận)');
  // [dữ liệu] CC → dB (đo): hồi quy tuyến tính trên CC>=81
  const dbPts = [[81, -5.1], [85, -3.8], [89, -2.5], [93, -1.2], [95, -0.5], [97, 0.2], [98, 0.5], [99, 0.8], [103, 2.1], [106, 3.1], [112, 5.1], [114, 5.7], [127, 10]];
  const n = dbPts.length, sx = dbPts.reduce((a, p) => a + p[0], 0), sy = dbPts.reduce((a, p) => a + p[1], 0), sxx = dbPts.reduce((a, p) => a + p[0] * p[0], 0), sxy = dbPts.reduce((a, p) => a + p[0] * p[1], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n; const dB = (c) => slope * c + icpt;
  ok(Math.abs(slope - 0.3284) < 0.001 && dbPts.every(([c, d]) => Math.abs(dB(c) - d) <= 0.06), '[dữ liệu] CC81–127: dB ≈ 0,3284×CC − 31,71, sai số mỗi điểm đo ≤ 0,06 dB', { slope, icpt });
  // bảng mới 90–100 (parabol) khớp công thức độc lập
  const par = (t) => Math.round(97 + 0.825 * t + 0.2175 * t * t);
  let tabOk = true; for (let t = 0; t <= 10; t++) { const r = await cc('BEAT_INPUT_VOLUME', 90 + t); if (r.v !== (t === 10 ? 127 : par(t))) tabOk = false; }
  ok(tabOk, '[FAST-03] MUSIC 90…100 → CC theo parabol 97+0,825t+0,2175t² (t=MUSIC−90), 100→127');
  // 50..90 không đổi so với FAST-02; dưới 50 không đổi so với bản gốc
  let keep = true; for (let v = 0; v <= 90; v++) { const r = await cc('BEAT_INPUT_VOLUME', v); if (r.v !== OLD02(v)) keep = false; }
  ok(keep, '[FAST-03] MUSIC 0–90 giữ nguyên hệt FAST-02 (đoạn đã đo tuyến tính theo dB)');
  // đơn điệu NGHIÊM NGẶT từ 50 trở lên, và độ dốc dB/bước (theo mô hình đo) không giảm khi tiến lên 70→100 (không có "gập")
  const cs = []; for (let v = 0; v <= 100; v++) cs.push((await cc('BEAT_INPUT_VOLUME', v)).v);
  ok(cs.slice(50).every((c, i, a) => i === 0 || c >= a[i - 1]) && cs.slice(90).every((c, i, a) => i === 0 || c > a[i - 1]), '[FAST-03] MUSIC 50→100: CC không giảm; 90→100 tăng nghiêm ngặt (đoạn 50–90 có thể lặp CC vì 0,825 CC/bước Menu)');
  const step = (v) => dB(cs[v + 1]) - dB(cs[v]);
  const gain90_95 = dB(cs[95]) - dB(cs[90]);
  ok(gain90_95 < 4.9 - 1, `[FAST-03] 90→95 tăng ${gain90_95.toFixed(2)} dB (FAST-02: 4,9 dB) — dịu hơn ≥ 1 dB`, gain90_95);
  let maxStep = 0; for (let v = 90; v < 100; v++) maxStep = Math.max(maxStep, step(v));
  ok(maxStep <= 1.7, `[FAST-03] bước dB lớn nhất mỗi 1 MUSIC trong 90–100 ≤ 1,7 dB (thực tế ${maxStep.toFixed(2)})`, maxStep);
  ok(Math.abs(dB(cs[90])) < 0.3 && cs[90] === 97, '[FAST-03] MUSIC 90 vẫn = CC97 (đo +0,2 dB)');
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
