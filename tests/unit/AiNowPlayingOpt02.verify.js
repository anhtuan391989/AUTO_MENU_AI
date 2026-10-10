/**
 * AiNowPlayingOpt02.verify.js — TASK AI-NOWPLAYING-OPT-02 (đo + xác minh vòng dò trùng).
 * GIỚI HẠN: phần "mô phỏng" dùng MÃ keyEngine.js THẬT với đồng hồ ảo + hợp âm tổng hợp. Đây KHÔNG phải số đo
 * runtime Windows. Nó chứng minh hành vi LOGIC của engine khi vòng dò bị khởi động lại, không phải thời gian thật.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { create } = require('../helpers/keyEngineSim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
function fnText(name) { const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(st, i + 1); }

console.log('\n== 1. Bản đồ điểm kích hoạt triggerAiKeyDetect() (tĩnh) ==');
{
    const lines = stripped.split('\n'); const sites = [];
    lines.forEach((l, i) => { if (/triggerAiKeyDetect\(/.test(l) && !/function triggerAiKeyDetect/.test(l)) sites.push(l.trim().slice(0, 90)); });
    console.log('    ' + sites.length + ' lời gọi thật:'); sites.forEach((s) => console.log('     -', s));
    ok(sites.length === 3, 'đúng 3 lời gọi thật (applyKeyBtn "AI Key Detect" / nút AUTO DETECT / setTimeout 2s sau bind) — khớp A61');
    ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(src), 'timer 2 giây sau bind còn nguyên (không bị đổi/xoá)');
}
console.log('\n== 2. Thứ tự trong 1 chu trình đổi bài (tĩnh) ==');
{
    const h = src.slice(src.indexOf('document.getElementById("autoDetectBtn")?.addEventListener'));
    const iBind = h.indexOf('bindAiEnginesToSystemAudio(window.__systemAudioSource)'), iTrig = h.indexOf('triggerAiKeyDetect();');
    ok(iBind > 0 && iTrig > iBind, 'AUTO DETECT: bindAiEnginesToSystemAudio() (tạo timer 2s) chạy TRƯỚC triggerAiKeyDetect() trực tiếp => timer 2s đến hạn sớm hơn mốc 2s của vòng dò vừa khởi động một khoảng nhỏ');
    ok(/handleNowPlayingForAi/.test(fnText('dispatchNowPlayingPayload')) && /autoDetectBtn"\)\?\.click\(\)/.test(fnText('restartAiForNewSong')), 'đổi bài => handleNowPlayingForAi() => restartAiForNewSong() => click AUTO DETECT');
}

console.log('\n== 3. MÔ PHỎNG engine thật: lần dò thứ hai có làm mất tiến độ không? ==');
function scenario(spec, triggers, runMs = 12000) {
    const e = create(spec); e.KeyEngine.init(e.ctx, { connect() {} });
    let watcher = null, firedAt = null, key = null, starts = 0, cancels = 0;
    const trigger = () => { starts++; if (watcher) { watcher(); cancels++; watcher = null; } watcher = e.KeyEngine.detectOnce((r) => { if (firedAt === null) { firedAt = e.now(); key = r.key; } }); };
    let t = 0; for (const at of [...triggers].sort((a, b) => a - b)) { e.step(at - t); t = at; trigger(); }
    e.step(runMs - t);
    return { firstKeyMs: firedAt === null ? null : Math.round(firedAt), key, starts, cancels };
}
{
    const spec = { root: 0, mode: 'major' };
    const S1 = scenario(spec, [0]), S3 = scenario(spec, [2000]);
    const early = scenario(spec, [0, 1990]), late = scenario(spec, [0, 2010]);
    console.log('    S1 một lần @0           :', JSON.stringify(S1));
    console.log('    S3 chỉ lần trễ @2000    :', JSON.stringify(S3));
    console.log('    S2 dò lại SỚM 10ms (<2s):', JSON.stringify(early));
    console.log('    S2 dò lại TRỄ 10ms (>2s):', JSON.stringify(late));
    ok([S1, S3, early, late].every((r) => r.key === 'C Major'), 'mọi kịch bản ra ĐÚNG khoá C Major (thuật toán không bị đổi)');
    ok(S1.firstKeyMs >= 1900 && S1.firstKeyMs <= 2100, `engine ra Key đầu tiên sau ~2000ms (ảo) khi dò 1 lần: ${S1.firstKeyMs}ms`);
    ok(late.firstKeyMs === S1.firstKeyMs, 'dò lại SAU khi đã có kết quả: không mất gì');
    ok(early.firstKeyMs >= S1.firstKeyMs + 1500, `dò lại TRƯỚC khi vòng đầu ra kết quả bị mất tiến độ: ${early.firstKeyMs}ms so với ${S1.firstKeyMs}ms (chậm thêm ~${early.firstKeyMs - S1.firstKeyMs}ms)`);
    ok(early.cancels === 1 && early.starts === 2, 'đúng 2 lần khởi chạy, 1 lần huỷ watcher (không chạy song song)');
    ok(S3.firstKeyMs >= S1.firstKeyMs + 1900, 'chỉ có lần trễ 2s: Key ra sau ~4s (tức lần dò TRỰC TIẾP trong handler có tác dụng làm nhanh)');
}

console.log('\n== 4. Log chẩn đoán: hành vi (chạy hàm thật aiDiag) và ranh giới ==');
{
    const logs = []; let enabled = true; let now = 1000;
    const sb = { console: { log: (...a) => logs.push(a.join(' ')) }, performance: { now: () => now }, getSetting: (k, f) => (k === 'aiDiagLogEnabled' ? enabled : f), window: {} };
    vm.createContext(sb);
    vm.runInContext('let __aiCycleGen = 0; const __aiDiagState = { t0: null, song: null, cur: null, history: [] };' + fnText('aiDiag') + 'this.D = aiDiag; this.S = __aiDiagState; this.bump = (s) => { __aiCycleGen++; __aiDiagState.song = s; };', sb);
    sb.bump('A|x'); sb.D('CYCLE_START'); now += 5; sb.D('KEY_TRIGGER'); now += 1995; sb.D('KEY_TRIGGER'); sb.D('WATCHER_CANCEL'); now += 10; sb.D('KEY_RESULT', { key: 'C Major' }); sb.D('BPM_UPDATE', 120);
    const c = sb.S.cur;
    ok(c.triggers === 2 && c.cancels === 1 && c.keyResults === 1 && c.bpmUpdates === 1, 'đếm đúng: 2 lần khởi chạy, 1 lần huỷ, 1 kết quả Key, 1 BPM');
    ok(c.firstKeyMs === 2010 && c.firstBpmMs === 2010, 'đo mốc Key/BPM đầu tiên tính từ lúc bắt đầu chu trình');
    ok(logs.every((l) => /\[AI-DIAG\] cycle=\d+ song="A\|x"/.test(l)), 'mọi dòng log gắn mã chu trình + tên bài');
    sb.bump('B|y'); sb.D('CYCLE_START'); sb.D('KEY_RESULT_STALE_DROPPED', { resultGen: 1 });
    ok(sb.S.history.length === 1 && sb.S.history[0].song === 'A|x' && sb.S.cur.song === 'B|y' && sb.S.cur.staleDrops === 1, 'bài mới tách chu trình cũ khỏi chu trình mới; đếm kết quả cũ bị bỏ');
    enabled = false; const n = logs.length; sb.D('KEY_TRIGGER'); ok(logs.length === n, 'tắt bằng setting aiDiagLogEnabled=false => im lặng');
    ok(/__aiDiagReport/.test(src), 'có window.__aiDiagReport() để xem tổng hợp trong DevTools');
    ok(/typeof aiDiag === "function"\) aiDiag\("KEY_TRIGGER"\)/.test(fnText('triggerAiKeyDetect')), 'log trong triggerAiKeyDetect có guard typeof (hàm được test A61 trích đọc độc lập)');
    ok(/typeof aiDiag === "function"\) aiDiag\("KEY_RESULT"/.test(fnText('startAiRealtimeLoop')), 'log trong startAiRealtimeLoop có guard typeof');
}
console.log('\n== 5. Ranh giới: không đổi thuật toán/ngưỡng/routing ==');
{
    const eng = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
    ok(/FAST_PATH_MIN_ELAPSED_MS = 1200/.test(eng) && /FAST_PATH_STREAK_REQUIRED = 3/.test(eng) && /FAST_PATH_INTERVAL_MS = PROVISIONAL_INTERVAL_MS/.test(eng) && /PROVISIONAL_INTERVAL_MS = 400/.test(eng), 'hằng số fast-path của KeyEngine nguyên vẹn (1200ms, 3 lần, mỗi 400ms)');
    ok(/AI_NO_SIGNAL_TIMEOUT_MS_TENTATIVE\s*=\s*3000/.test(src) && /AI_SIGNAL_VU_FLOOR_TENTATIVE\s*=\s*2/.test(src), 'timeout 3000ms / VU floor 2 nguyên vẹn');
    ok(!/getUserMedia|createMicSource/.test(fnText('aiDiag')), 'aiDiag không đụng thiết bị/MIC');
}
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
