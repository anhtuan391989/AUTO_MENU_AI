// MENU-KNOB-DAW-MIDI-INTEGRATION-02 — 4 Knob MIDI theo DAW/phiên bản đang chọn (logic thật: setup.js profile + actionRegistry.js Knob->CC).
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
  // 1 đúng 4 Knob MIDI / 4 Action; clap/laugh ngoài
  {
    const m = /const KNOB_ID_TO_ACTION = \{([\s\S]*?)\};/.exec(ren)[1].replace(/\/\/.*$/gm, '');
    const pairs = [...m.matchAll(/(\w+):\s*"(\w+)"/g)].map((x) => [x[1], x[2]]);
    ok(pairs.length === 4 && pairs.every(([k, a]) => KNOBS[a] === k), '[1] renderer: đúng 4 Knob MIDI -> 4 Action (musicKnob, masterKnob, retune1, retune2)', pairs);
    ok(!/clapKnob|laughKnob/.test(m) && /clapKnob: "CLAP"/.test(ren) && /laughKnob: "LAUGH"/.test(ren), '[8] clapKnob/laughKnob KHÔNG nằm trong map MIDI; vẫn ở KNOB_ID_TO_SOUND_EFFECT (SoundEffectEngine nội bộ)');
    const knobBundles = setup.slice(setup.indexOf('const DAW_QF_S1_LIVE'), setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD'));
    ok(!/CLAP|LAUGH|clapKnob|laughKnob/.test(knobBundles.replace(/dawQfMake/g, '')), '[8] bộ điền nhanh không chứa CLAP/LAUGH');
  }
  // 2 Studio One 5–7 / FSP8 / Cubase 10–15: radio, nhận diện, điền KNOB đúng
  for (const d of DAWS) {
    ok(new RegExp(`name="daw" value="${d}"`).test(html), `[4] setup.html có lựa chọn "${d}"`);
    const e = env({ selectedDAW: d });
    const prof = e.api.resolveDawProfile(d);
    ok(prof && prof.id === (/^cubase/i.test(d) ? 'cubase' : 'studio-one'), `[4][5] "${d}" nhận đúng profile ${/^cubase/i.test(d) ? 'cubase' : 'studio-one'}`, prof && prof.id);
    const r = e.fill('knob'); const m = (e.st.dawMidiOutMappings || {})[d] || {};
    ok(r.done && Object.keys(m).length === 4 && Object.entries(FAMILY(d)).every(([a, n]) => m[a] && m[a].kind === 'cc' && m[a].channel === 15 && m[a].number === n && m[a].source === 'USER_DEFINED'), `[2][3] "${d}": KNOB điền đúng 4 mapping CC ${Object.values(FAMILY(d)).join('/')} kênh 15`, m);
    ok(e.sent.length === 0, `[3] "${d}": điền nhanh KHÔNG gửi MIDI`);
  }
  // 3 giá trị 0/25/50/75/100 -> CC 0/32/64/95/127, tăng/giảm, đúng channel index, mỗi Knob đúng CC riêng
  for (const d of ['Studio Pro 8', 'Cubase 13']) {
    const e = env({ selectedDAW: d }); e.fill('knob');
    let allOk = true; const rows = [];
    for (const [a, num] of Object.entries(FAMILY(d))) {
      e.sent.length = 0;
      // FSP8-MIDI-SYNC-FAST-02 (THAY ĐỔI SPEC CÓ CHỦ ĐÍCH): riêng MUSIC trên Studio Pro 8 dùng neo 50→64, 90→97, 100→127 => 75→85 (không còn 95). Mọi Knob/DAW khác giữ nguyên.
      const calib = d === 'Studio Pro 8' && a === 'BEAT_INPUT_VOLUME';
      for (const [v, cc] of [[0, 0], [25, 32], [50, 64], [75, calib ? 85 : 95], [100, 127], [50, 64], [0, 0]]) {
        const r = await e.turn(e.AR.ACTIONS[a], v); const last = e.sent[e.sent.length - 1];
        if (!r.ok || !last || last.n !== num || last.v !== cc || last.ch !== 14) { allOk = false; rows.push([a, v, cc, last, r]); }
      }
    }
    ok(allOk, `[2] "${d}": 0/25/50/75/100 -> CC 0/32/64/95/127 (riêng MUSIC trên Studio Pro 8: 75->85, xem FSP8-MIDI-SYNC-FAST-02) (kênh 15 = index 14), đúng CC riêng từng Knob; tăng/giảm đúng chiều`, rows[0]);
    e.sent.length = 0; await e.turn('BEAT_INPUT_VOLUME', 10); await e.turn('BEAT_INPUT_VOLUME', 10); await e.turn('BEAT_INPUT_VOLUME', 10.2);
    ok(e.sent.length === 1 && e.sent[0].v === 13, `[2] "${d}": cùng giá trị CC gửi lại -> không gửi lặp (3 lần xoay, chỉ 1 CC)`, e.sent);
  }
  // 4 chuyển qua lại: Studio Pro 8 -> Cubase 13 -> Studio One 5 -> Cubase 10 -> Studio Pro 8
  {
    const e = env({ selectedDAW: 'Studio Pro 8' }); const snaps = {};
    for (const d of ['Studio Pro 8', 'Cubase 13', 'Studio One 5', 'Cubase 10']) { e.st.selectedDAW = d; ok((e.st.dawMidiOutMappings || {})[d] === undefined, `[3] vào "${d}": đổi DAW không ghi gì`); e.fill('knob'); snaps[d] = JSON.stringify(e.st.dawMidiOutMappings[d]); }
    e.st.selectedDAW = 'Studio Pro 8';
    ok(['Studio Pro 8', 'Cubase 13', 'Studio One 5', 'Cubase 10'].every((d) => JSON.stringify(e.st.dawMidiOutMappings[d]) === snaps[d]) && Object.keys(e.st.dawMidiOutMappings).length === 4, '[3] quay về Studio Pro 8: mapping 4 DAW còn nguyên, không ghi chéo');
    e.sent.length = 0; await e.turn('MASTER_OUTPUT_VOLUME', 100);
    ok(e.sent.length === 1 && e.sent[0].n === 21 && e.sent[0].ch === 14, '[3] Studio Pro 8 gửi CC21 (không dùng CC86 của Cubase)', e.sent);
    e.st.selectedDAW = 'Cubase 10'; e.sent.length = 0; await e.turn('MASTER_OUTPUT_VOLUME', 100);
    ok(e.sent.length === 1 && e.sent[0].n === 86, '[3] Cubase 10 gửi CC86 (không dùng CC21)', e.sent);
  }
  // 6 xung đột với LIVE 102–109 và mapping sẵn có
  {
    const e = env({ selectedDAW: 'Studio One 7' }); e.fill('live'); const live = JSON.stringify(e.st.dawMidiOutMappings['Studio One 7']);
    const r = e.fill('knob'); const m = e.st.dawMidiOutMappings['Studio One 7'];
    ok(r.done && JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(live)).map((k) => [k, m[k]]))) === live, '[6] điền KNOB sau LIVE: 8 mapping LIVE (CC102–109 kênh 16) không đổi');
    ok(Object.values(S1).every((n) => n < 102) && Object.values(CB).every((n) => n < 102 || n > 109) && !Object.values({ ...S1, ...CB }).some((n) => n >= 102 && n <= 109), '[6] CC Knob (20–23, 85–88) không rơi vào 102–109');
    const f = env({ selectedDAW: 'Cubase 12', dawMidiOutMappings: { 'Cubase 12': { MONITOR_FX: { kind: 'cc', channel: 15, number: 86, value: 127 } } } });
    const rr = f.fill('knob');
    ok(rr.blocked === 'conflict' && rr.plan.conflicts.some(([a, o]) => a === 'MASTER_OUTPUT_VOLUME' && o === 'MONITOR_FX') && f.st.dawMidiOutMappings['Cubase 12'].BEAT_INPUT_VOLUME === undefined, '[6] trùng mapping hiện có -> chặn, không ghi một phần');
    const g = env({ selectedDAW: 'Studio Pro 8', dawMidiOutMappings: { 'Studio Pro 8': { BEAT_INPUT_VOLUME: { kind: 'cc', channel: 15, number: 99, value: 50, source: 'USER_DEFINED' } } } });
    let ask = null; const plan = g.api.planDawProfileFill(g.api.resolveDawProfile('Studio Pro 8'), 'knob', g.api.getDawMidiOutMapping, g.A); ask = plan.overwrite;
    ok(ask.length === 1 && ask[0] === 'BEAT_INPUT_VOLUME', '[6] mapping tay của Knob sẽ bị ghi đè -> liệt kê để xác nhận (không ghi đè âm thầm)');
  }
  // 7 thiếu mapping / cổng
  {
    const e = env({ selectedDAW: 'Studio Pro 8' }); const r = await e.turn('BEAT_INPUT_VOLUME', 50);
    ok(!r.ok && (r.status === 'NOT_CONFIGURED' || r.reason === 'NOT_CONFIGURED') && e.sent.length === 0, '[7] chưa có mapping -> NOT_CONFIGURED, không gửi, không báo thành công', r);
    const f = env({ selectedDAW: 'Studio Pro 8' }, { portOk: false }); f.fill('knob'); const r2 = await f.turn('BEAT_INPUT_VOLUME', 50);
    ok(!r2.ok && r2.status === 'NO_DEVICE', '[7] có mapping nhưng cổng MIDI không mở -> NO_DEVICE (ok=false)', r2);
    const again = env({ selectedDAW: 'Studio Pro 8' }, { portOk: true }); again.fill('knob');
    ok(/typeof setSetting === "function"|getSetting\(|loadData/.test(ren) && !/loadData[\s\S]{0,400}dispatchKnobVolume/.test(ren.slice(ren.indexOf('function loadData'), ren.indexOf('function loadData') + 1500)) , '[7] static: loadData() (khôi phục UI) không gọi dispatchKnobVolume -> không gửi MIDI ngầm lúc khởi động');
  }
  // 9 phạm vi: không sửa LIVE/monitor/FX/Send trong profile Knob; setup.html chỉ thêm đúng 3 radio
  {
    ok((html.match(/name="daw" value=/g) || []).length === 10, '[4] setup.html: đúng 10 lựa chọn DAW (7 cũ + Studio One 5, Cubase 10, Cubase 11)');
    ok(/Studio One 7"[\s\S]*Studio One 6"[\s\S]*Studio One 5"[\s\S]*Studio Pro 8"[\s\S]*Cubase 10"[\s\S]*Cubase 11"[\s\S]*Cubase 12"/.test(html), '[4] thứ tự radio hợp lý, các lựa chọn cũ giữ nguyên');
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
