/**
 * AiKeyFast07.verify.js — TASK AI-KEY-FAST-07 (luồng KEY_RESULT → applyActiveKeyToPlugin → re-arm).
 * Chạy mã THẬT (renderer.js trích hàm, keyEngine.js thật, đồng hồ ảo). MÔ PHỎNG — KHÔNG phải runtime Windows.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { create } = require('../helpers/keyEngineSim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
function fnText(name) { const st = src.indexOf(`function ${name}(`); if (st < 0) throw new Error(name); let i = src.indexOf('{', st), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(st, i + 1); }

console.log('\n== A. Chuỗi nhân quả async (causal) tăng độ sâu trong khi chỉ có 1 vòng chạy ==');
{
    const e = create({ root: 0, mode: 'major' }), sb = e.sb, ev = [];
    // bọc setInterval để ghi "cha" = interval đang chạy khi vòng mới được tạo (mô hình async stack của DevTools)
    let cur = 0; const parent = {}, depthOf = (id) => { let d = 0; while (parent[id]) { id = parent[id]; d++; } return d; };
    const origSI = sb.setInterval;
    sb.setInterval = (fn, ms) => { let id; id = origSI(() => { const p = cur; cur = id; try { fn(); } finally { cur = p; } }, ms); parent[id] = cur; return id; };
    Object.assign(sb, { cancelManualOverride() {}, applyActiveKeyToPlugin() {}, refreshKeySourceDisplay() {}, startModulationWatcher() {}, getActiveSourceName: () => 'ai', updateAiSourceStateLabel() {}, keyInfoEl: null,
        keySource: { songDb: { active: false }, ai: { value: null } }, __aiState: {}, keyEverDetected: false, aiDiag: (n, x) => ev.push({ n, x }) });
    vm.runInContext(`let __aiCycleGen = 1;\n${fnText('startAiRealtimeLoop')}\n${fnText('triggerAiKeyDetect')}\nthis.api = { trigger: triggerAiKeyDetect };`, sb);
    e.KeyEngine.init(e.ctx, { connect() {} }); sb.window.__aiEngineEpoch = 1; sb.window.__aiEngineSrc = {};
    sb.api.trigger(); e.step(20000);
    const l = sb.KeyEngine.getDebugSnapshot().loopStats, kr = ev.filter((x) => x.n === 'KEY_RESULT').length;
    const ids = Object.keys(parent).map(Number), maxDepth = Math.max(...ids.map(depthOf));
    ok(kr >= 3, `có ${kr} KEY_RESULT (re-arm liên tục)`);
    ok(l.maxActive === 1 && l.active === 1, `loopStats: started=${l.started} stopped=${l.stopped} active=${l.active} maxActive=${l.maxActive} => KHÔNG có vòng song song`);
    ok(maxDepth >= kr, `độ sâu chuỗi nhân quả (async stack) = ${maxDepth} tăng theo số lần re-arm dù chỉ 1 vòng chạy => stack dài KHÔNG chứng minh vòng song song`);
    ok(new Set(ev.filter((x) => x.n === 'KEY_RESULT').map((x) => x.x.stack.length)).size === 1, 'stack ĐỒNG BỘ tại KEY_RESULT có độ sâu cố định (không đệ quy)');
    const k0 = ev.find((x) => x.n === 'KEY_RESULT').x;
    ok(k0.locked === true && 'margin' in k0 && 'gen' in k0 && 'epoch' in k0, 'KEY_RESULT mang margin/locked/gen/epoch');
}

console.log('\n== B. Lịch sử Key đã khóa (aiRecordKeyResult) ==');
{
    const sb = { window: {}, __aiCycleGen: 3, performance: { now: () => 5 }, Date, console };
    vm.createContext(sb);
    vm.runInContext(`let __aiCycleGen = 3; const __aiKeyHistory = [];\n${fnText('aiRecordKeyResult')}\nthis.f = aiRecordKeyResult; this.h = __aiKeyHistory;`, sb);
    for (let i = 0; i < 25; i++) sb.f({ key: i % 2 ? 'B Minor' : 'F# Minor', rootIndex: 6, mode: 'minor', confidence: 0.8, margin: 0.1 }, { loops: { active: 1 } });
    ok(sb.h.length === 20, 'ring buffer giới hạn 20');
    ok(sb.h.every((x) => x.locked === true && x.gen === 3 && 'margin' in x && 'confidence' in x), 'mỗi bản ghi có gen/margin/confidence/locked');
}

console.log('\n== C. Gửi Plugin: Mouse Control tắt → lỗi lặp lại mỗi chu kỳ (source thật applyActiveKeyToPlugin) ==');
function plugRig(sendImpl) {
    const logs = [], ev = [], sb = { console: { log() {}, error: (...a) => logs.push(a.join(' ')) }, Date, performance: { now: () => 1 }, JSON, Object, Promise };
    sb.window = sb; vm.createContext(sb);
    Object.assign(sb, { getActiveKeyValue: () => sb.__v, getActiveSourceName: () => 'ai', isAiControlActive: () => false, logKeySource() {}, refreshKeySourceDisplay() {}, setStatus() {}, keySelector: null, currentKeyEl: null, keyEverDetected: true, sendKeyToAutotune: sendImpl, aiDiag: (n, x) => ev.push({ n, x }) });
    vm.runInContext(`let originalKey = 'C Major', lastPluginKey = 'C Major'; let __aiCycleGen = 1;
        const __aiPluginSend = { total: 0, ok: 0, fail: 0, byKey: {}, lastStatus: null, lastDetail: null };
        ${fnText('aiRecordPluginSend')}\n${fnText('applyActiveKeyToPlugin')}\nthis.apply = (v) => { this.__v = v; return applyActiveKeyToPlugin('AI Detect'); }; this.stats = () => JSON.parse(JSON.stringify(__aiPluginSend)); this.lpk = () => lastPluginKey;`, sb);
    return { sb, logs, ev };
}
(async () => {
    const tick = () => new Promise((r) => setImmediate(r));
    { const r = plugRig(async () => ({ ok: false, status: 'MOUSE_DISABLED', detail: 'Mouse Control tắt' }));
      for (let i = 0; i < 5; i++) { r.sb.apply('F# Minor'); await tick(); }
      const s = r.sb.stats();
      ok(r.sb.lpk() === 'C Major', 'thất bại => lastPluginKey KHÔNG đổi (nguyên nhân gửi lại)');
      ok(s.total === 5 && s.fail === 5 && s.ok === 0 && s.byKey['F# Minor'].retriesAfterFail === 4, `5 lần gọi cùng Key: attempts=${s.total} fail=${s.fail} retries=${s.byKey['F# Minor'].retriesAfterFail}`);
      ok(r.logs.length === 5 && r.ev.filter((x) => x.n === 'PLUGIN_SEND').length === 5, 'mỗi lần thất bại = 1 console.error + 1 PLUGIN_SEND (log lặp)');
      ok(s.lastStatus === 'MOUSE_DISABLED', 'ghi nhận status MOUSE_DISABLED (không throw)'); }
    { const r = plugRig(async () => ({ ok: true, status: 'OK' }));
      for (let i = 0; i < 5; i++) { r.sb.apply('F# Minor'); await tick(); }
      const s = r.sb.stats();
      ok(r.sb.lpk() === 'F# Minor' && s.total === 1 && s.ok === 1 && s.fail === 0, `thành công => chỉ gửi 1 lần (attempts=${s.total}), các lần sau bị dedupe`);
      r.sb.apply('B Minor'); await tick(); ok(r.sb.stats().total === 2, 'Key khác => gửi lần mới'); }
    console.log('\n== D. Bất biến ==');
    const k = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
    ok(/const frameHasContent = contentCount > 0 && Math\.sqrt\(contentRms \/ contentCount\) > 0\.0005;/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k) && /FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k), 'công thức/ngưỡng Key nguyên văn');
    ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(src), 'timer 2000ms nguyên vẹn');
    ok(/if \(value === lastPluginKey\) return;/.test(src), 'điều kiện dedupe lastPluginKey nguyên vẹn (không đổi hành vi retry)');
    ok(/typeof aiRecordPluginSend === "function"/.test(src) && /typeof aiRecordKeyResult === "function"/.test(src), 'hook chẩn đoán có typeof-guard');
    console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
})();
