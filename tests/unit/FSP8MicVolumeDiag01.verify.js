// FSP8-MIC-VOLUME-FIX-01 — chứng minh (PASS_CODE/PASS_SIM, KHÔNG phải Windows+FSP8): Menu không có điều khiển âm lượng Mic; nút MIC không ảnh hưởng đường knob MUSIC/MASTER.
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
  // [1] Tĩnh: không có action/knob/mapping nào cho âm lượng MIC
  {
    const m = /const KNOB_ID_TO_ACTION = \{([\s\S]*?)\};/.exec(ren)[1].replace(/\/\/.*$/gm, '');
    const acts = [...m.matchAll(/(\w+):\s*"(\w+)"/g)].map((x) => x[2]);
    ok(acts.sort().join() === 'BEAT_INPUT_VOLUME,MASTER_OUTPUT_VOLUME,RETUNE_SPEED_MIC1,RETUNE_SPEED_MIC2', '[1] knob→action chỉ có MUSIC/MASTER/RETUNE1/RETUNE2 — KHÔNG có âm lượng MIC', acts);
    const html2 = rd('ui/index.html');
    const knobIds = [...html2.matchAll(/class="knob" id="(\w+)"/g)].map((x) => x[1]);
    ok(knobIds.join() === 'retune1,retune2,musicKnob,masterKnob,clapKnob,laughKnob', '[1] ui/index.html có đúng 6 núm (retune1, retune2, musicKnob, masterKnob, clapKnob, laughKnob) — không có núm âm lượng MIC', knobIds);
    ok(!/MIC1_VOLUME|MIC2_VOLUME|MIC_VOLUME/.test(reg + ren + setup), '[1] không có action *MIC*_VOLUME trong actionRegistry/renderer/setup');
  }
  // [2] Chuỗi MIC1/MIC2 bật-tắt (SELECT → chờ → ON/OFF) không gửi CC knob, không đụng bộ nhớ knob
  const mk = () => { const e = env({ selectedDAW: D }); e.fill('knob'); e.fill('live'); e.fill('select'); return e; };
  {
    const e = mk(); const AR = e.AR;
    // knob trước, rồi nút MIC, rồi knob lại
    e.sent.length = 0;
    await e.turn(AR.ACTIONS.BEAT_INPUT_VOLUME, 90);
    const before = e.sent.slice();
    ok(before.length === 1 && before[0].n === 20 && before[0].ch === 14 && before[0].v === 97, '[2] MUSIC 90 → CC20 = 97 kênh 15 (trước khi bấm MIC)', before);
    for (const ctl of ['MIC1', 'MIC2', 'MUSIC']) {
      e.sent.length = 0;
      await AR.setDawControlState(ctl, true, { reason: 'menu-button' });
      await AR.setDawControlState(ctl, false, { reason: 'menu-button' });
      const nums = e.sent.map((s) => s.n);
      ok(nums.length >= 2 && nums.every((n) => n >= 102 && n <= 112) && e.sent.every((s) => s.ch === 15), `[2] nút ${ctl}: chỉ gửi CC102–112 kênh 16 (SELECT/ON/OFF), KHÔNG gửi CC20–23`, e.sent);
    }
    e.sent.length = 0;
    await e.turn(AR.ACTIONS.BEAT_INPUT_VOLUME, 60);
    ok(e.sent.length === 1 && e.sent[0].n === 20 && e.sent[0].ch === 14 && e.sent[0].v === 72, '[2] sau khi bấm MIC1/MIC2/MUSIC: MUSIC 60 vẫn → CC20 = 72 kênh 15 (knob không bị ảnh hưởng)', e.sent);
    e.sent.length = 0;
    await e.turn(AR.ACTIONS.MASTER_OUTPUT_VOLUME, 90);
    ok(e.sent.length === 1 && e.sent[0].n === 21 && e.sent[0].v === 114, '[2] MASTER 90 → CC21 = 114 (không đổi, công thức cũ)', e.sent);
  }
  // [3] Điểm duy nhất của Menu có thể "nuốt" lệnh: chống trùng theo giá trị CC (không theo trạng thái DAW) — ghi nhận, KHÔNG đổi
  {
    const e = mk(); const AR = e.AR;
    e.sent.length = 0;
    await e.turn(AR.ACTIONS.BEAT_INPUT_VOLUME, 90); await AR.setDawControlState('MIC1', true, { reason: 'menu-button' });
    const n0 = e.sent.length;
    await e.turn(AR.ACTIONS.BEAT_INPUT_VOLUME, 90);
    ok(e.sent.length === n0, '[3] ghi nhận: lặp đúng cùng giá trị MUSIC (cùng CC) sau khi bấm MIC KHÔNG gửi lại (chống trùng theo CC; Menu không biết trạng thái DAW)');
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
