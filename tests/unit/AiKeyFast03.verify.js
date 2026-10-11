/**
 * AiKeyFast03.verify.js — TASK AI-KEY-FAST-03 (chẩn đoán trigger). Test TĨNH + VM: chỉ chứng minh mã chẩn đoán đúng và
 * KHÔNG đổi hành vi (timer 2s, guard FAST-02, ngưỡng Key). KHÔNG phải bằng chứng runtime Windows.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
function fnText(name) { const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(st, i + 1); }

console.log('\n== 1. Luồng trigger (tĩnh): điều kiện gọi / chặn sớm ==');
{
    const r = fnText('restartAiForNewSong');
    ok(/=== AudioSourceState\.RUNNING\)\s*\{[\s\S]*autoDetectBtn"\)\?\.click\(\)/.test(r), 'đổi bài + SYSTEM_AUDIO RUNNING => click AUTO DETECT => (bind + trigger)');
    ok(/else \{[\s\S]*NP_RESTART_SKIPPED_SOURCE_NOT_RUNNING[\s\S]*resetAiDisplaysToListening/.test(r) && !/triggerAiKeyDetect\(/.test(r), 'đổi bài + nguồn CHƯA RUNNING => KHÔNG gọi trigger (chỉ LISTENING) và nay có log lý do');
    ok(/startAudioMonitor\(\);/.test(src) && /\{\s*once:\s*true\s*\}/.test(src), 'nguồn SYSTEM_AUDIO chỉ được tạo sau cú click đầu tiên của người dùng (startAudioMonitor, once:true)');
    ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(src), 'timer 2000ms nguyên vẹn');
    ok(/__meta\.gen === __aiCycleGen[\s\S]{0,120}__meta\.epoch === window\.__aiEngineEpoch[\s\S]{0,80}__meta\.src === window\.__aiEngineSrc/.test(fnText('triggerAiKeyDetect')), 'guard FAST-02 (gen+epoch+src) nguyên vẹn');
}
console.log('\n== 2. aiDiag: sự kiện trước chu trình đầu tiên được ghi nhận (VM) ==');
{
    const logs = [];
    const sb = { console: { log: (...a) => logs.push(a.join(' ')) }, performance: { now: () => 5 }, getSetting: () => true, window: {}, __aiCycleGen: 0 };
    vm.createContext(sb);
    vm.runInContext(`let __aiCycleGen = 0; const __aiDiagState = { t0: null, song: null, cur: null, history: [] };
${fnText('aiDiag')}
this.D = aiDiag; this.S = __aiDiagState; this.bump = () => { __aiCycleGen++; };`, sb);
    sb.D('KEY_TRIGGER'); sb.D('ENGINE_BIND', { epoch: 1 });
    ok(sb.S.cur && sb.S.cur.gen === 0 && sb.S.cur.triggers === 1 && sb.S.cur.binds === 1, 'trigger/bind xảy ra TRƯỚC NowPlaying được đếm (trước đây bị bỏ rơi)');
    sb.bump(); sb.S.song = 'A|x'; sb.D('CYCLE_START', { source: 'NO_DEVICE' });
    ok(sb.S.history.length === 1 && sb.S.cur.gen === 1 && sb.S.cur.srcStateAtStart === 'NO_DEVICE' && sb.S.cur.triggers === 0, 'CYCLE_START tách chu trình và ghi trạng thái nguồn');
    sb.D('NP_RESTART_SKIPPED_SOURCE_NOT_RUNNING'); sb.D('KEY_TRIGGER_KEPT_VALID_WATCHER');
    ok(sb.S.cur.skippedNotRunning === 1 && sb.S.cur.keptWatcher === 1, 'đếm skippedNotRunning / keptWatcher');
}
console.log('\n== 3. __aiDiagStatus đọc SỐNG (VM) ==');
{
    ok(/window\.__aiDiagStatus = \(\) =>/.test(src), 'có window.__aiDiagStatus()');
    const sb = { console, window: { __aiEngineEpoch: 3, __aiEngineSrc: {}, __keyDetectStopWatcher: () => {}, __systemAudioSource: { getState: () => 'RUNNING' } }, performance: { now: () => 1 }, getSetting: () => true,
        KeyEngine: { getDebugSnapshot: () => ({ frameCounter: 42, hasMusicalContent: true }) } };
    sb.window.__keyWatcherMeta = { gen: 0, epoch: 3, src: sb.window.__aiEngineSrc };
    vm.createContext(sb);
    vm.runInContext(`let __aiCycleGen = 0; let audioMonitorStarted = true;\n${src.slice(src.indexOf('window.__aiDiagStatus = () =>'), src.indexOf('return out;\n};', src.indexOf('window.__aiDiagStatus = () =>')) + 'return out;\n};'.length)}\nthis.R = window.__aiDiagStatus();`, sb);
    const r = sb.R;
    ok(r.watcherActive === true && r.metaMatchesCurrent === true && r.systemAudioState === 'RUNNING' && r.keyEngineFrames === 42 && r.engineEpoch === 3, 'status phản ánh trực tiếp: watcher, meta khớp, nguồn RUNNING, số frame KeyEngine');
}
console.log('\n== 4. Ranh giới: không đổi thuật toán/ngưỡng ==');
{
    const k = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
    ok(/FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k), 'hằng fast-path không đổi');
    ok(!/getUserMedia/.test(fnText('aiDiag')) && !/getUserMedia/.test(src.slice(src.indexOf('window.__aiDiagStatus'), src.indexOf('function restartAiForNewSong'))), 'chẩn đoán không mở thiết bị/audio');
}
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
