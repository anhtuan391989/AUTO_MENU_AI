/**
 * NowPlayingAutoDetect.verify.js — TASK AI-ALG-01-NOWPLAYING / AI-NOWPLAYING-OPT.
 * Chạy hàm THẬT (trích từ renderer.js) trong sandbox vm với đồng hồ giả + stub; cộng kiểm tĩnh.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');

function fnText(name) {
    const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    return src.slice(st, i + 1);
}
function build(running = true) {
    const log = { clicks: 0, resets: 0, watcherCancels: 0, modStops: 0 };
    let now = 0, timers = [], tid = 0;
    const sb = {
        console: { log() {}, warn() {}, error() {} },
        AudioSourceState: { RUNNING: 'RUNNING' },
        window: { __systemAudioSource: { getState: () => (sb.__running ? 'RUNNING' : 'NO_DEVICE') }, __keyDetectStopWatcher: () => { log.watcherCancels++; } },
        document: { getElementById: (id) => (id === 'autoDetectBtn' ? { click() { log.clicks++; } } : null) },
        resetAiDisplaysToListening: () => { log.resets++; },
        ModEngine: { stop: () => { log.modStops++; } },
        setTimeout: (fn, ms) => { timers.push({ id: ++tid, at: now + ms, fn }); return tid; },
        clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
        __running: running,
        getSetting: (k, f) => f,
    };
    vm.createContext(sb);
    const code = [
        'let __aiCycleGen = 0; let __npLastSongKey = null; let __npEmptyTimer = null;',
        'const NOWPLAYING_EMPTY_GRACE_MS_TENTATIVE = 5000;',
        'const __aiDiagState = { t0: null, song: null, cur: null, history: [] };', fnText('aiDiag'),
        fnText('restartAiForNewSong'), fnText('handleNowPlayingForAi'),
        'this.api = { handle: handleNowPlayingForAi, gen: () => __aiCycleGen, last: () => __npLastSongKey };',
    ].join('\n');
    vm.runInContext(code, sb);
    return { sb, log, api: sb.api, advance: (ms) => { now += ms; const due = timers.filter((t) => t.at <= now); timers = timers.filter((t) => t.at > now); due.forEach((t) => t.fn()); } };
}

console.log('\n== 1. A -> B: tự reset + dò lại, KHÔNG cần bấm nút ==');
{ const e = build(); e.api.handle('A|x'); ok(e.log.clicks === 1 && e.api.gen() === 1, 'bài đầu => 1 chu trình (gen=1)');
  e.api.handle('B|y'); ok(e.log.clicks === 2 && e.api.gen() === 2, 'đổi sang B => chu trình mới (click AUTO DETECT nội bộ, gen=2)'); }

console.log('\n== 2. Sự kiện lặp cùng bài: không dò trùng ==');
{ const e = build(); e.api.handle('A|x'); for (let i = 0; i < 5; i++) e.api.handle('A|x');
  ok(e.log.clicks === 1 && e.api.gen() === 1, '6 sự kiện cùng bài => đúng 1 chu trình'); }

console.log('\n== 3. A -> B -> C nhanh: mỗi lần tăng token, chỉ token mới nhất hợp lệ ==');
{ const e = build(); e.api.handle('A|1'); const g1 = e.api.gen(); e.api.handle('B|2'); const g2 = e.api.gen(); e.api.handle('C|3'); const g3 = e.api.gen();
  ok(g1 < g2 && g2 < g3, 'token tăng đơn điệu'); ok(g3 !== g1 && g3 !== g2, 'token cũ (A,B) khác token hiện tại => callback/timer của A,B bị bỏ');
  ok(e.log.clicks === 3, 'mỗi bài 1 chu trình, không nhân đôi'); }

console.log('\n== 4. A -> B -> A: mỗi lần đổi bài đều khởi động chu trình mới ==');
{ const e = build(); e.api.handle('A|1'); e.api.handle('B|2'); e.api.handle('A|1'); ok(e.log.clicks === 3 && e.api.gen() === 3, '3 chu trình cho A,B,A'); }

console.log('\n== 5. Metadata rỗng thoáng qua ==');
{ const e = build(); e.api.handle('A|1'); e.api.handle(null); e.advance(1000); e.api.handle('A|1');
  ok(e.log.clicks === 1, 'rỗng 1s rồi lại đúng bài A => KHÔNG coi là bài mới');
  const f = build(); f.api.handle('A|1'); f.api.handle(null); f.advance(6000); ok(f.api.last() === null, 'rỗng quá thời gian chờ => coi là mất bài');
  f.api.handle('A|1'); ok(f.log.clicks === 2, 'sau khi mất bài thật, bài cũ quay lại => chu trình mới');
  const g = build(); g.api.handle(null); ok(g.log.clicks === 0, 'chỉ có rỗng, chưa từng có bài => không làm gì'); }

console.log('\n== 6. Nguồn audio chưa chạy: không giả lập, chỉ chờ ==');
{ const e = build(false); e.api.handle('B|2');
  ok(e.log.clicks === 0, 'KHÔNG click AUTO DETECT khi SYSTEM_AUDIO không RUNNING');
  ok(e.log.resets === 1 && e.log.watcherCancels === 1 && e.log.modStops === 1, 'chỉ reset hiển thị LISTENING + huỷ watcher + dừng Mod'); }

console.log('\n== 7. Ranh giới / không đổi thuật toán (static) ==');
{
    const fns = fnText('restartAiForNewSong') + fnText('handleNowPlayingForAi'); // aiDiag chỉ log, không nằm trong kiểm tra ranh giới này
    ok(!/getUserMedia|createMicSource|__micSource|new AudioContext|BPMEngine|KeyEngine|BPM_CV|AI_NO_SIGNAL|AI_SIGNAL_VU/.test(fns), 'không mở thiết bị/MIC mới, không chạm engine hay ngưỡng');
    ok(/autoDetectBtn"\)\?\.click\(\)/.test(fnText('restartAiForNewSong')), 'tái dùng chu trình AUTO DETECT, không viết pipeline thứ hai');
    ok(/handleNowPlayingForAi\(payload && \(payload\.title \|\| payload\.artist\) \? key : null\)/.test(fnText('dispatchNowPlayingPayload')), 'nối vào dispatchNowPlayingPayload (điểm duy nhất nhận NowPlaying)');
    const loop = fnText('startAiRealtimeLoop');
    ok(/const cycleGen = __aiCycleGen/.test(loop) && /if \(cycleGen !== __aiCycleGen\) \{[\s\S]{0,200}?\breturn; \}/.test(loop), 'kết quả Key của chu trình cũ bị bỏ (generation guard)');
    ok(/data\.currentKey !== "LISTENING"/.test(src), 'sentinel "LISTENING" của Auto-Tune còn nguyên');
    ok(/BPM_CV_CONFIRM_THRESHOLD_TENTATIVE\s*=\s*0\.15/.test(fs.readFileSync(path.join(__dirname, '../../ui/js/engines/bpmEngine.js'), 'utf8') + src), 'ngưỡng BPM CV 0.15 giữ nguyên');
    ok(/AI_NO_SIGNAL_TIMEOUT_MS_TENTATIVE\s*=\s*3000/.test(src) && /AI_SIGNAL_VU_FLOOR_TENTATIVE\s*=\s*2/.test(src), 'timeout 3000ms / VU floor 2 giữ nguyên');
}

console.log('\n== 8. Kết quả Key bài A đến muộn không ghi đè bài B (chạy hàm thật startAiRealtimeLoop) ==');
{
    let cb = null, applied = 0, reported = 0, gen = 0;
    const sb = {
        window: { electronAPI: { reportAiResult: () => { reported++; } }, __keyDetectStopWatcher: null },
        KeyEngine: { detectOnce: (f) => { cb = f; return () => {}; } },
        keySource: { ai: { value: null } }, keyEverDetected: false, __aiState: { hasConfirmed: false },
        updateAiSourceStateLabel() {}, refreshKeySourceDisplay() {}, getActiveSourceName: () => 'ai',
        keyInfoEl: null, applyActiveKeyToPlugin: () => { applied++; }, startModulationWatcher() {},
        console: { log() {} },
    };
    vm.createContext(sb);
    vm.runInContext('let __aiCycleGen = 0;' + fnText('startAiRealtimeLoop') + 'this.start = startAiRealtimeLoop; this.bump = () => { __aiCycleGen++; };', sb);
    sb.start(); const cbA = cb;                 // chu trình của bài A
    sb.bump();                                  // đổi sang bài B
    sb.start(); const cbB = cb;                 // chu trình của bài B
    cbA({ key: 'C Major', confidence: 0.9 });   // kết quả A đến muộn
    ok(sb.keySource.ai.value === null && applied === 0 && reported === 0, 'kết quả A đến muộn bị bỏ: không ghi keySource, không áp Auto-Tune, không báo IPC');
    cbB({ key: 'D Minor', confidence: 0.8 });
    ok(sb.keySource.ai.value === 'D Minor' && applied === 1, 'kết quả của bài B được nhận bình thường');
}
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
