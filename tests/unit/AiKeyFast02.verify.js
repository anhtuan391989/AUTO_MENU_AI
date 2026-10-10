/**
 * AiKeyFast02.verify.js — TASK AI-KEY-FAST-02. Chạy triggerAiKeyDetect()/startAiRealtimeLoop() THẬT (trích từ renderer.js)
 * trên keyEngine.js THẬT, đồng hồ ảo + hợp âm tổng hợp. MÔ PHỎNG — không phải số đo runtime Windows.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { create } = require('../helpers/keyEngineSim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
function fnText(name) { const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(st, i + 1); }

function rig() {
    const e = create({ root: 0, mode: 'major' });
    const sb = e.sb, ev = [];
    Object.assign(sb, {
        cancelManualOverride() {}, applyActiveKeyToPlugin() {}, refreshKeySourceDisplay() {}, startModulationWatcher() {},
        getActiveSourceName: () => 'ai', updateAiSourceStateLabel() {}, keyInfoEl: null,
        keySource: { songDb: { active: false }, ai: { value: null } }, __aiState: {}, keyEverDetected: false,
        aiDiag: (n, x) => ev.push({ n, t: Math.round(e.now()), x }),
    });
    vm.runInContext(`let __aiCycleGen = 1;\n${fnText('startAiRealtimeLoop')}\n${fnText('triggerAiKeyDetect')}
        this.api = { trigger: triggerAiKeyDetect, newSong() { __aiCycleGen++; }, gen: () => __aiCycleGen };`, sb);
    const src1 = { connect() {} };
    const bind = (s) => { e.KeyEngine.stop(); e.KeyEngine.init(e.ctx, s); sb.window.__aiEngineEpoch = (sb.window.__aiEngineEpoch || 0) + 1; sb.window.__aiEngineSrc = s; };
    const cancelExternal = () => { if (sb.window.__keyDetectStopWatcher) { sb.window.__keyDetectStopWatcher(); sb.window.__keyDetectStopWatcher = null; } };
    return { e, sb, ev, api: sb.api, bind, src1, cancelExternal, cnt: (n) => ev.filter((x) => x.n === n).length,
        firstKey: () => (ev.find((x) => x.n === 'KEY_RESULT') || {}).t ?? null, keyVal: () => sb.keySource.ai.value };
}
// KEY_RESULT được log ở renderer thật; trong rig dùng giá trị keySource.ai.value + thời điểm đầu tiên ghi nhận:
function watchFirst(r) { r.first = null; const orig = r.sb.refreshKeySourceDisplay; r.sb.refreshKeySourceDisplay = () => { if (r.first === null) r.first = Math.round(r.e.now()); }; }

console.log('\n== A. Trigger @0, lặp @1990 (timer 2s xuất hiện trước kết quả) ==');
{ const r = rig(); watchFirst(r); r.bind(r.src1); r.api.trigger(); r.e.step(1990); r.api.trigger(); r.e.step(5000);
  ok(r.first === 2000, `Key đầu @2000ms (trước fix mô phỏng: 3990ms) — thực tế ${r.first}`);
  ok(r.cnt('WATCHER_CANCEL') === 0 && r.cnt('KEY_TRIGGER_KEPT_VALID_WATCHER') === 1, 'lần lặp bị bỏ qua, KHÔNG huỷ watcher hợp lệ');
  ok(r.keyVal() === 'C Major', 'kết quả đúng (C Major)'); }
console.log('\n== B. Trigger @0, lặp @2010 (sau kết quả) ==');
{ const r = rig(); watchFirst(r); r.bind(r.src1); r.api.trigger(); r.e.step(2010); r.api.trigger(); r.e.step(5000);
  ok(r.first === 2000, 'Key đầu vẫn @2000ms'); ok(r.cnt('WATCHER_CANCEL') === 0, 'không huỷ vòng dò liên tục đang chạy (không tạo lượt dò trùng)'); }
console.log('\n== C. Đổi bài A→B trước khi Key của A xuất hiện (AUTO DETECT: gen++, bind, huỷ, trigger) ==');
{ const r = rig(); watchFirst(r); r.bind(r.src1); r.api.trigger(); r.e.step(800);
  r.api.newSong(); r.bind(r.src1); r.cancelExternal(); r.api.trigger(); r.e.step(5000);
  ok(r.first === 800 + 2000, `Key của B @800+2000 — thực tế ${r.first}`); ok(r.keyVal() === 'C Major', 'chỉ có 1 kết quả hợp lệ'); }
console.log('\n== C2. Đổi bài nhưng watcher cũ KHÔNG bị huỷ ngoài => trigger tự huỷ do khác token ==');
{ const r = rig(); r.bind(r.src1); r.api.trigger(); r.e.step(500); r.api.newSong(); r.api.trigger();
  ok(r.cnt('WATCHER_CANCEL') === 1 && r.cnt('KEY_TRIGGER_KEPT_VALID_WATCHER') === 0, 'khác generation token => huỷ + khởi động mới đúng 1 lần'); }
console.log('\n== D. Reconnect / đổi nguồn: bind lại (epoch/nguồn mới) mà watcher cũ còn ==');
{ const r = rig(); r.bind(r.src1); r.api.trigger(); r.e.step(700); r.bind({ connect() {} }); r.api.trigger();
  ok(r.cnt('WATCHER_CANCEL') === 1, 'epoch/nguồn khác => watcher cũ bị huỷ, watcher mới tạo (1 lần)');
  r.e.step(100); r.api.trigger(); ok(r.cnt('WATCHER_CANCEL') === 1, 'trigger lặp ngay sau đó KHÔNG huỷ watcher mới (không có watcher song song)'); }
console.log('\n== E. Nguồn mất / không RUNNING: không tạo Key giả ==');
{ const r = rig(); watchFirst(r); r.bind(r.src1); r.api.trigger(); r.e.step(300); r.e.KeyEngine.stop(); r.cancelExternal(); r.e.step(10000);
  ok(r.first === null && r.keyVal() === null, 'engine dừng + watcher huỷ => không có kết quả'); }
console.log('\n== F. Watcher đã kết thúc/null => được khởi động lại (phục hồi) ==');
{ const r = rig(); watchFirst(r); r.bind(r.src1); r.cancelExternal(); r.api.trigger(); r.e.step(2500); ok(r.first === 2000, 'không có watcher => trigger tạo mới và ra Key @2000'); }
console.log('\n== G. Bất biến / ngưỡng không đổi ==');
{ const k = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
  ok(/FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k), 'hằng fast-path keyEngine không đổi');
  ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(src), 'timer 2s còn nguyên (chỉ trigger lặp thành no-op khi watcher hợp lệ)');
  ok(/__keyWatcherMeta = \{ gen: cycleGen/.test(fnText('startAiRealtimeLoop')), 'watcher mang token chu trình + epoch + nguồn (không chỉ boolean)'); }
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
