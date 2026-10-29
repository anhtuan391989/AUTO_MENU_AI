/**
 * AiKeyFast06.verify.js — TASK AI-KEY-FAST-06 (lifecycle vòng dò Key). Chạy triggerAiKeyDetect()/startAiRealtimeLoop() THẬT (trích từ renderer.js)
 * trên keyEngine.js THẬT (đồng hồ ảo, hợp âm tổng hợp) và ĐẾM số vòng runVoteLoop đồng thời. MÔ PHỎNG — không phải runtime Windows.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { create } = require('../helpers/keyEngineSim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
// AI-KEY-ENGINE-COMPLETE-01: lối tắt 'đứng yên' nay cần ≥ LONG_STATIONARY_MIN_S giây nhạc (trước: khoá @2000 ms theo hợp âm đầu). Đặt hằng số =0 trả lại hành vi cũ.
const __minS = +((require('fs').readFileSync(require('path').join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8').match(/const LONG_STATIONARY_MIN_S = (\d+)/) || [0, 0])[1]);
const FIRST = __minS > 0 ? __minS * 1000 + 400 : 2000;

function fnText(name) { const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(st, i + 1); }

function rig() {
    const e = create({ root: 0, mode: 'major' }), sb = e.sb, ev = [];
    Object.assign(sb, { cancelManualOverride() {}, applyActiveKeyToPlugin() {}, refreshKeySourceDisplay() {}, startModulationWatcher() {}, getActiveSourceName: () => 'ai', updateAiSourceStateLabel() {}, keyInfoEl: null,
        keySource: { songDb: { active: false }, ai: { value: null } }, __aiState: {}, keyEverDetected: false, aiDiag: (n, x) => ev.push({ n, t: Math.round(e.now()), x }) });
    vm.runInContext(`let __aiCycleGen = 1;\n${fnText('startAiRealtimeLoop')}\n${fnText('triggerAiKeyDetect')}
        this.api = { trigger: triggerAiKeyDetect, newSong() { __aiCycleGen++; } };`, sb);
    let maxActive = 0;
    const loops = () => sb.KeyEngine.getDebugSnapshot().loopStats;
    const sample = () => { const l = loops(); if (l.maxActive > maxActive) maxActive = l.maxActive; return l; };
    const bind = () => { e.KeyEngine.stop(); e.KeyEngine.init(e.ctx, { connect() {} }); sb.window.__aiEngineEpoch = (sb.window.__aiEngineEpoch || 0) + 1; sb.window.__aiEngineSrc = sb.window.__aiEngineSrc || {}; };
    const cancel = () => { if (sb.window.__keyDetectStopWatcher) { sb.window.__keyDetectStopWatcher(); sb.window.__keyDetectStopWatcher = null; } };
    // Chuỗi handler AUTO DETECT thật: bind -> huỷ -> trigger (đúng thứ tự trong renderer.js)
    const autoDetect = () => { bind(); cancel(); sb.api.trigger(); };
    const timerFromBind = (afterMs) => { const t = e.now(); return { at: t + afterMs }; };
    return { e, sb, ev, api: sb.api, bind, cancel, autoDetect, sample, loops, step: (ms) => { e.step(ms); sample(); }, cnt: (n) => ev.filter((x) => x.n === n).length, maxActive: () => { sample(); return maxActive; } };
}

console.log('\n== A. Lần click đầu: trigger khi CHƯA có engine; bind 73ms sau; timer 2s của bind bắn TRƯỚC khi watcher #1 có kết quả (kịch bản log FAST-05, không tín hiệu/chưa đủ streak) ==');
{ const r = rig(); r.api.trigger(); r.step(73); r.bind(); r.step(1900); r.api.trigger(); r.step(5000);
  const c = r.ev.find((x) => x.n === 'WATCHER_CANCEL');
  ok(r.cnt('WATCHER_CANCEL') === 1 && c, 'watcher #1 (tạo TRƯỚC engine, epoch/src lệch) bị huỷ ĐÚNG 1 lần bởi trigger của timer — hành vi guard FAST-02 đúng thiết kế');
  ok(r.maxActive() === 1, `số vòng runVoteLoop đồng thời tối đa = ${r.maxActive()} (huỷ trước khi tạo mới)`);
  ok(r.cnt('KEY_RESULT') >= 1, `sau đó có KEY_RESULT (${r.cnt('KEY_RESULT')})`); }
console.log('\n== A2. Cùng kịch bản nhưng timer bắn SAU khi watcher #1 đã có kết quả và re-arm (watcher mới đã mang epoch hiện tại) ==');
{ const r = rig(); r.api.trigger(); r.step(73); r.bind(); r.step(FIRST + 100); r.api.trigger(); r.step(3000);
  ok(r.cnt('WATCHER_CANCEL') === 0 && r.cnt('KEY_TRIGGER_KEPT_VALID_WATCHER') === 1, 'trigger của timer giữ watcher re-arm hợp lệ (không reset vote)'); ok(r.maxActive() === 1, 'tối đa 1 vòng'); }
console.log('\n== B. AUTO DETECT bấm 3 lần (0/500/1000ms) + 3 timer 2s của 3 lần bind ==');
{ const r = rig(); r.autoDetect(); r.step(500); r.autoDetect(); r.step(500); r.autoDetect();
  // 3 timer 2s: tại 2000, 2500, 3000 (tính từ mỗi bind)
  r.step(1000); r.api.trigger(); r.step(500); r.api.trigger(); r.step(500); r.api.trigger(); r.step(4000);
  ok(r.maxActive() === 1, `tối đa ${r.maxActive()} vòng đồng thời`);
  ok(r.cnt('KEY_TRIGGER_KEPT_VALID_WATCHER') >= 1 || r.cnt('KEY_RESULT') >= 1, `timer của bind cũ không reset watcher hợp lệ (kept=${r.cnt('KEY_TRIGGER_KEPT_VALID_WATCHER')}, cancel=${r.cnt('WATCHER_CANCEL')})`); }
console.log('\n== C. Chạy liên tục 20s (re-arm sau mỗi KEY_RESULT) ==');
{ const r = rig(); r.autoDetect(); r.step(20000);
  const l = r.loops(), kr = r.cnt('KEY_RESULT');
  ok(r.maxActive() === 1, `tối đa ${r.maxActive()} vòng đồng thời suốt 20s (${kr} kết quả)`);
  ok(l.active === 1 && l.started - l.stopped === 1, `cuối: started=${l.started}, stopped=${l.stopped}, active=${l.active} (chỉ còn 1 vòng, không rò rỉ)`);
  ok(l.started === kr + 1, `mỗi KEY_RESULT = 1 vòng kết thúc + 1 vòng re-arm (started=${l.started}, results=${kr})`);
  const stacks = r.ev.filter((x) => x.n === 'KEY_RESULT' && x.x && x.x.stack).map((x) => x.x.stack.length);
  ok(stacks.length >= 3 && new Set(stacks).size === 1, `độ sâu stack tại KEY_RESULT KHÔNG tăng qua các chu kỳ (${[...new Set(stacks)].join(',')} khung) => callback lồng nhau 1 tầng, không phải đệ quy/vòng chồng`); }
console.log('\n== D. Đổi bài A→B trước khi có Key (gen++, AUTO DETECT) ==');
{ const r = rig(); r.autoDetect(); r.step(800); r.api.newSong(); r.autoDetect(); r.step(5000);
  ok(r.maxActive() === 1, 'đổi bài: vẫn tối đa 1 vòng'); ok(r.cnt('KEY_RESULT_STALE_DROPPED') === 0, 'không có kết quả bài cũ lọt vào (vòng cũ bị dừng trước khi bắn)'); }
console.log('\n== E. Reconnect: bind từ RUNNING (không huỷ) rồi timer 2s trigger ==');
{ const r = rig(); r.autoDetect(); r.step(700); r.bind(); r.step(1000); r.api.trigger(); r.step(3000);
  ok(r.maxActive() === 1, 'reconnect: tối đa 1 vòng; vòng cũ bị huỷ khi epoch lệch'); ok(r.cnt('WATCHER_CANCEL') === 1, 'huỷ đúng 1 lần'); }
console.log('\n== F. Bất biến (công thức/timer/guard) ==');
{ const k = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
  ok(/const frameHasContent = contentCount > 0 && Math\.sqrt\(contentRms \/ contentCount\) > 0\.0005;/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k) && /FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k), 'công thức/ngưỡng Key nguyên văn');
  ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(src), 'timer 2000ms nguyên vẹn');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const calls = (code.match(/bindAiEnginesToSystemAudio\(/g) || []).length - (code.match(/function bindAiEnginesToSystemAudio\(/g) || []).length;
  ok(calls === 2, `bindAiEnginesToSystemAudio có đúng 2 call site thật: handler autoDetectBtn (khi RUNNING) + onStateChange(RUNNING) — đếm được ${calls}`); }
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
