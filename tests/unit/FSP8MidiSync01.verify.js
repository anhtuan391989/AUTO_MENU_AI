// FSP8-MIDI-SYNC-FAST-01 — bằng chứng CODE/MÔ PHỎNG cho T01–T08 (KHÔNG phải test Windows+FSP8).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d !== undefined ? ' :: ' + JSON.stringify(d) : '')); } };
const setup = rd('ui/js/setup.js'), reg = rd('ui/js/actionRegistry.js'), ren = rd('ui/js/renderer.js'), html = rd('ui/setup.html');

const a1 = setup.indexOf('const DAW_MIDI_ACTIONS = ['), a2 = setup.indexOf('function isMouseControlEnabledLocal');
const b1 = setup.indexOf('function getDawMidiOutMapping'), b2 = setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD');
const code = setup.slice(a1, a2) + '\n' + setup.slice(b1, b2) + '\nreturn {DAW_MIDI_ACTIONS, DAW_MIDI_PROFILES, resolveDawProfile, dawProfileVersionStatus, planDawProfileFill, applyDawProfileFill, getDawMidiOutMapping};';

const KNOBS = { BEAT_INPUT_VOLUME: 'musicKnob', MASTER_OUTPUT_VOLUME: 'masterKnob', RETUNE_SPEED_MIC1: 'retune1', RETUNE_SPEED_MIC2: 'retune2' };
const S1 = { BEAT_INPUT_VOLUME: 20, MASTER_OUTPUT_VOLUME: 21, RETUNE_SPEED_MIC1: 22, RETUNE_SPEED_MIC2: 23 };
const CB = { BEAT_INPUT_VOLUME: 85, MASTER_OUTPUT_VOLUME: 86, RETUNE_SPEED_MIC1: 87, RETUNE_SPEED_MIC2: 88 };
const FAMILY = (d) => (/^cubase/i.test(d) ? CB : S1);
const DAWS = ['Studio One 5', 'Studio One 6', 'Studio One 7', 'Studio Pro 8', 'Cubase 10', 'Cubase 11', 'Cubase 12', 'Cubase 13', 'Cubase 14', 'Cubase 15'];

// harness: kho settings dùng chung cho setup.js (profile) VÀ actionRegistry.js (gửi CC) -> thử luồng thật từ điền nhanh tới CC phát ra
function env(init = {}, { portOk = true } = {}) {
  const st = JSON.parse(JSON.stringify(init)); const sent = [];
  const getSetting = (k, f) => (st[k] === undefined ? f : st[k]);
  const setSetting = (k, v) => { st[k] = JSON.parse(JSON.stringify(v)); };
  const api = new Function('getSetting', 'setSetting', code)(getSetting, setSetting);
  const sb = { console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Date, Math, Promise, getSetting, setSetting,
    sendMidiCC: async (n, v, ch) => { if (!portOk) return false; sent.push({ n, v, ch }); return true; }, sendMidiNotePulse: async () => true, saveData() {}, electronAPI: {} };
  sb.window = sb; vm.createContext(sb); vm.runInContext(reg, sb);
  const A = api.DAW_MIDI_ACTIONS.map((x) => x.action);
  const fill = (bundle) => {
    const daw = st.selectedDAW; const prof = api.resolveDawProfile(daw); if (!prof) return { blocked: 'no-profile' };
    const plan = api.planDawProfileFill(prof, bundle, api.getDawMidiOutMapping, A);
    if (plan.errors.length) return { blocked: 'errors', plan }; if (plan.conflicts.length) return { blocked: 'conflict', plan };
    api.applyDawProfileFill(daw, plan, () => st.dawMidiOutMappings, (all) => setSetting('dawMidiOutMappings', all)); return { done: true, plan };
  };
  const turn = (action, value) => sb.window.ActionRegistry.executeAction(action, { reason: 'knob', value });
  return { st, api, sent, fill, turn, A, AR: sb.window.ActionRegistry };
}


(async () => {
  const D = 'Studio Pro 8';
  // T01 / T06 (tĩnh): không có đường nào gửi CC knob lúc khởi động/khôi phục/kết nối lại
  {
    const li = ren.indexOf('function loadData()'); const le = ren.indexOf('\n}\n', li);
    const loadBody = ren.slice(li, le);
    ok(!/dispatchKnobVolume|ActionRegistry|sendMidi|executeAction/.test(loadBody), '[T01] loadData() (khôi phục knob đã lưu) KHÔNG gửi MIDI');
    const callLines = ren.split('\n').filter(l => /dispatchKnobVolume\(/.test(l) && !/^\s*\/\//.test(l) && !/function dispatchKnobVolume/.test(l));
    ok(callLines.length === 3, '[T01] dispatchKnobVolume chỉ được gọi từ 3 handler người dùng (wheel / dblclick / mousemove)', callLines);
    const uses = ['ui','core','app'].flatMap(d => require('child_process').execSync(`grep -rln "BEAT_INPUT_VOLUME\\|MASTER_OUTPUT_VOLUME" ${d} --include=*.js || true`, {cwd: ROOT}).toString().split('\n').filter(Boolean));
    ok(uses.every(f => /renderer\.js|actionRegistry\.js|setup\.js/.test(f)), '[T01] chỉ renderer/actionRegistry/setup tham chiếu 2 action volume (không có đường tự động khác)', uses);
    const rt = rd('core/command-engine-js/runtime.js');
    ok(!/BEAT_INPUT_VOLUME|MASTER_OUTPUT_VOLUME|knobLast/.test(rt), '[T06] runtime/driver không phát lại giá trị knob khi mở lại cổng');
  }
  const e = env({ selectedDAW: D }); e.fill('knob');
  const A = e.AR.ACTIONS;
  ok(e.sent.length === 0, '[T01] kết nối/điền cấu hình: 0 message MIDI');
  // T02/T03: 90 -> 60 -> 90
  e.sent.length = 0;
  await e.turn(A.BEAT_INPUT_VOLUME, 90); await e.turn(A.BEAT_INPUT_VOLUME, 60); await e.turn(A.BEAT_INPUT_VOLUME, 90);
  ok(JSON.stringify(e.sent.map(s => [s.n, s.v, s.ch])) === JSON.stringify([[20,97,14],[20,72,14],[20,97,14]]), '[T02][T03] 90->60->90: CC20 = 97, 72, 97 (sau hiệu chuẩn FAST-02; trước đó 114/76/114) (kênh index 14)', e.sent);
  // T04/T05: MASTER độc lập
  e.sent.length = 0;
  await e.turn(A.MASTER_OUTPUT_VOLUME, 50); await e.turn(A.BEAT_INPUT_VOLUME, 40); await e.turn(A.MASTER_OUTPUT_VOLUME, 55);
  ok(e.sent.map(s => s.n).join() === '21,20,21' && e.sent[1].v === 51 && e.sent[0].v === 64 && e.sent[2].v === 70, '[T04][T05] MASTER=CC21, MUSIC=CC20, không lẫn nhau, bộ nhớ chống trùng tách theo action', e.sent);
  const m = e.st.dawMidiOutMappings[D];
  ok(m.BEAT_INPUT_VOLUME.number !== m.MASTER_OUTPUT_VOLUME.number, '[T04] 2 mapping khác số CC');
  // chống trùng + T08: 200 bước liên tục, thứ tự đúng, không mất bước
  e.sent.length = 0; let last = -1;
  for (let i = 0; i <= 100; i++) await e.turn(A.BEAT_INPUT_VOLUME, i);
  for (let i = 100; i >= 0; i--) await e.turn(A.BEAT_INPUT_VOLUME, i);
  const vals = e.sent.map(s => s.v);
  const exp = []; const f = v => (v < 50 ? Math.round(v * 127 / 100) : v <= 90 ? Math.round(64 + 33 * (v - 50) / 40) : Math.round(97 + 30 * (v - 90) / 10));
  let prev = null; const seq = [...Array(101).keys(), ...[...Array(101).keys()].reverse()];
  for (const v of seq) { const c = f(v); if (c !== prev) { exp.push(c); prev = c; } }
  ok(JSON.stringify(vals) === JSON.stringify(exp), '[T08] quét 0→100→0: CC gửi đúng thứ tự, chỉ bỏ các giá trị trùng liên tiếp', {n: vals.length, e: exp.length});
  // cổng lỗi -> không nhớ giá trị đã gửi (lần sau gửi lại)
  const e2 = env({ selectedDAW: D }, { portOk: false }); e2.fill('knob');
  const r1 = await e2.turn(e2.AR.ACTIONS.BEAT_INPUT_VOLUME, 90);
  ok(r1.ok === false, '[T06] cổng MIDI lỗi: trả không-ok (NO_DEVICE), không ném lỗi');
  // Live buttons không bị đụng
  ok(/CC102|LIVE/.test(setup) && !/MIC1_ON.*knob/.test(reg), '[T05] nút Live không dùng đường knob');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
