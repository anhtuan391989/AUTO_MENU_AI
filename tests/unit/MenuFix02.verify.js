// MENU-FIX-02 — MIC1/MIC2/MUSIC: CHỌN TRACK -> chờ -> ON/OFF (đúng 1 lệnh Monitor/cú bấm, tuần tự, không gửi lại). Đồng hồ ảo.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const check = (l, c, x) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l, x !== undefined ? JSON.stringify(x) : ''); } };
const TABLE = { MUSIC_ON: 102, MUSIC_OFF: 103, MIC1_ON: 104, MIC1_OFF: 105, MIC2_ON: 106, MIC2_OFF: 107, FX_ON: 108, FX_OFF: 109 };
const SEL = { MUSIC_SELECT: 110, MIC1_SELECT: 111, MIC2_SELECT: 112 };
const mk = (cc) => ({ kind: 'cc', channel: 16, number: cc, value: 127, source: 'USER_DEFINED' });
const all = (o) => Object.fromEntries(Object.entries(o).map(([a, c]) => [a, mk(c)]));
function env({ mappings, extra = {}, failOn = [] } = {}) {
  const store = { selectedDAW: 'studio-one', dawMidiOutMappings: { 'studio-one': mappings || { ...all(TABLE), ...all(SEL) } }, ...extra };
  const sends = []; const timers = []; let now = 0;
  const sb = {
    console: { log() {}, error() {}, warn() {} }, Date: { now: () => now }, Math, Promise,
    setTimeout: (fn, ms) => { const t = { fn, at: now + ms, dead: false }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; },
    getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting: (k, v) => { store[k] = v; },
    sendMidiCC: async (n, v, ch) => { sends.push({ n, v, ch, at: now }); return !failOn.includes(n); }, sendMidiNotePulse: async () => true, saveData() {}, electronAPI: {},
  };
  sb.window = sb; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui/js/actionRegistry.js'), 'utf8'), sb);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const advance = async (ms) => { await flush(); now += ms; for (const t of timers.slice()) if (!t.dead && t.at <= now) { t.dead = true; t.fn(); } await flush(); };
  return { AR: sb.window.ActionRegistry, sends, advance, flush, store, seq: () => sends.map((s) => s.n).join(',') };
}
(async () => {
  console.log('== 1. Một cú bấm: CHỌN TRACK -> chờ -> đúng 1 lệnh ON/OFF ==');
  for (const [c, on, off, sel] of [['MIC1', 'MIC1_ON', 'MIC1_OFF', 'MIC1_SELECT'], ['MIC2', 'MIC2_ON', 'MIC2_OFF', 'MIC2_SELECT'], ['MUSIC', 'MUSIC_ON', 'MUSIC_OFF', 'MUSIC_SELECT']]) {
    const e = env(); const p = e.AR.setDawControlState(c, true, { reason: 'menu-button' });
    await e.advance(0);
    check(`${c}: lệnh ĐẦU là CHỌN TRACK CC${SEL[sel]}, Monitor CHƯA gửi`, e.seq() === String(SEL[sel]), e.sends);
    await e.advance(299); check(`${c}: trước 300ms vẫn chưa gửi Monitor`, e.seq() === String(SEL[sel]));
    await e.advance(2); const r = await p;
    check(`${c} ON: sau chờ gửi đúng CC${TABLE[on]} ch16(index15) v127; tổng 2 lệnh; ok`, e.seq() === `${SEL[sel]},${TABLE[on]}` && e.sends[1].v === 127 && e.sends[1].ch === 15 && r.ok && r.selectUsed === sel && r.dawConfirmed === false, e.sends);
    await e.advance(5000); check(`${c}: KHÔNG gửi lại Monitor sau đó (gửi lại sẽ đảo trạng thái)`, e.sends.length === 2);
    const f = env(); const q = f.AR.setDawControlState(c, false); await f.advance(400); await q;
    check(`${c} OFF: ${SEL[sel]} rồi CC${TABLE[off]}`, f.seq() === `${SEL[sel]},${TABLE[off]}`, f.sends);
  }
  console.log('\n== 2. Bấm MIC 1 rồi MIC 2 sát nhau: tuần tự, không xen lẫn, mỗi nút đúng track ==');
  { const e = env(); const a = e.AR.setDawControlState('MIC1', true); const b = e.AR.setDawControlState('MIC2', true);
    await e.advance(0); await e.advance(310); await e.advance(310); await e.advance(310); await Promise.all([a, b]);
    check('thứ tự: 111,104,112,106 (chọn Mic1→Monitor Mic1→chọn Mic2→Monitor Mic2)', e.seq() === '111,104,112,106', e.seq());
    const ts = e.sends.map((s) => s.at); check('mỗi Monitor cách lệnh chọn ≥300ms', ts[1] - ts[0] >= 300 && ts[3] - ts[2] >= 300, ts); }
  console.log('\n== 3. Lỗi và tương thích ==');
  { const e = env({ failOn: [111] }); const p = e.AR.setDawControlState('MIC1', true); await e.advance(0); await e.advance(400); const r = await p;
    check('CHỌN TRACK lỗi -> KHÔNG gửi Monitor, báo lỗi rõ', !r.ok && r.selectFailed === true && !e.sends.some((s) => s.n === 104) && /KHÔNG gửi lệnh Monitor/.test(r.text) && r.delivery === 'NOT_SENT', e.sends);
    const f = env({ failOn: [111] }); const x = f.AR.setDawControlState('MIC1', true); const y = f.AR.setDawControlState('MIC2', true);
    await f.advance(0); await f.advance(400); await f.advance(400); await Promise.all([x, y]);
    check('lỗi chọn của nút này không làm kẹt hàng đợi: MIC2 vẫn chạy (112,106)', f.seq() === '111,112,106', f.seq());
    const g = env({ mappings: all(TABLE) }); const r2 = await g.AR.setDawControlState('MIC1', true);
    check('chưa lưu CHỌN TRACK => hành vi cũ: đúng 1 lệnh CC104 NGAY, không chờ', r2.ok && g.seq() === '104' && r2.selectUsed === undefined, g.sends);
    const h = env({ mappings: { MONITOR_MIC1: mk(60), MIC1_SELECT: mk(111) } }); const r3 = await h.AR.setDawControlState('MIC1', true);
    check('chế độ toggle cũ: đúng 1 lệnh toggle, KHÔNG gửi chọn track', r3.mode === 'legacy' && h.seq() === '60', h.sends);
    const i = env({ mappings: { ...all(TABLE), ...all(SEL), MIC1_OFF: undefined } }); delete i.store.dawMidiOutMappings['studio-one'].MIC1_OFF; const r4 = await i.AR.setDawControlState('MIC1', false);
    check('thiếu mapping chiều OFF: NOT_CONFIGURED, KHÔNG gửi gì (kể cả chọn track)', !r4.ok && r4.reason === 'NOT_CONFIGURED' && i.sends.length === 0, i.sends);
    const j = env(); const r5 = await j.AR.setDawControlState('FX', true);
    check('FX: đúng 1 lệnh FX_ON (không có chọn track)', r5.ok && j.seq() === '108', j.sends); }
  console.log('\n== 4. Setting dawSelectSettleMs ==');
  { for (const [v, expect] of [[0, 0], [800, 800], [999999, 2000], [-5, 300]]) {
      const e = env({ extra: { dawSelectSettleMs: v } }); const p = e.AR.setDawControlState('MIC2', true); await e.advance(0); await e.advance(expect > 0 ? expect - 1 : 0);
      const before = e.sends.length; await e.advance(2); await p;
      check(`dawSelectSettleMs=${v} -> chờ ${expect}ms (trước: ${before} lệnh, sau: ${e.sends.length})`, e.sends.length === 2 && (expect === 0 ? true : before === 1), e.sends); } }
  console.log('\n== 5. Setup + gói gợi ý + tĩnh ==');
  { const setup = fs.readFileSync(path.join(ROOT, 'ui/js/setup.js'), 'utf8'); const reg = fs.readFileSync(path.join(ROOT, 'ui/js/actionRegistry.js'), 'utf8');
    check('Setup có 3 hàng CHỌN TRACK và nằm trong nhóm chống trùng CC', ['MUSIC_SELECT', 'MIC1_SELECT', 'MIC2_SELECT'].every((a) => new RegExp(`action: "${a}"`).test(setup)) && /DAW_SELECT_ACTION_SET[^\n]*\n[^\n]*\.\.\.DAW_SELECT_ACTION_SET/.test(setup));
    check('Gói gợi ý Studio One có bộ CHỌN TRACK (CC110–112 ch16, v127); Cubase KHÔNG có', /select: Object\.freeze\(\{ title: "CHỌN TRACK", count: 3, mappings: dawQfMake\(16, 127, \{ MUSIC_SELECT: 110, MIC1_SELECT: 111, MIC2_SELECT: 112 \}\) \}\)/.test(setup) && (setup.match(/title: "CHỌN TRACK"/g) || []).length === 1);
    check('Không còn mã gửi lại Monitor (resend) trong actionRegistry', !/Resend|resend/.test(reg));
    check('ActionRegistry có 3 action SELECT và DAW_STATE_CONTROLS.select', /MIC1_SELECT: "MIC1_SELECT"/.test(reg) && /select: "MIC2_SELECT"/.test(reg)); }
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
