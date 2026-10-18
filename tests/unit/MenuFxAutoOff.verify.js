/**
 * MENU-FX-AUTO-OFF — Auto FX không tự TẮT: nguyên nhân gốc = mức dBFS 8-bit (getByteTimeDomainData) luôn ≈ -45,1 dBFS khi "im lặng nhưng không phải số 0
 * tuyệt đối" (cao hơn ngưỡng tắt -52 dBFS) => MUSIC_SILENT không bao giờ được xác nhận. Sửa: BPMEngine phát thêm `dbfsFloat` (getFloatTimeDomainData), Auto FX dùng nó.
 * Test LOGIC với analyser/đồng hồ GIẢ — việc đo trên Chromium/Electron thật nằm ở báo cáo (runtime probe), KHÔNG thay thế bằng test này.
 * Chạy: node tests/unit/MenuFxAutoOff.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const bpmSrc = fs.readFileSync(path.resolve(__dirname, '../../ui/js/engines/bpmEngine.js'), 'utf8');
const asSrc = fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

// ---- Mô phỏng ĐÚNG hành vi đã đo trên Chromium 141: byte = trunc(128*(x+1)) (cắt cụt) ----
const FFT = 2048;
const toByte = (x) => Math.max(0, Math.min(255, Math.trunc(128 * (x + 1))));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function makeSignal(kind, db) { // trả về Float32Array khung FFT mẫu
    const a = new Float32Array(FFT); const rms = Math.pow(10, db / 20);
    for (let i = 0; i < FFT; i++) a[i] = kind === 'zero' ? 0 : kind === 'noise' ? gauss() * rms : Math.sin(2 * Math.PI * 440 * i / 48000) * rms * Math.SQRT2;
    return a;
}
function runBpm(frame, opts = {}) {
    let rafCb = null; const got = [];
    const analyser = {
        fftSize: FFT, frequencyBinCount: FFT / 2, connect() {},
        getByteFrequencyData(arr) { arr.fill(0); },
        getByteTimeDomainData(arr) { for (let i = 0; i < arr.length; i++) arr[i] = toByte(frame[i]); },
    };
    if (opts.noFloat !== true) analyser.getFloatTimeDomainData = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = frame[i]; };
    const win = { performance: { now: () => 0 } }; win.window = win;
    vm.createContext(win); Object.assign(win, { requestAnimationFrame: (cb) => { rafCb = cb; return 1; }, cancelAnimationFrame() {}, console: { log() {}, warn() {}, error() {} }, Date });
    vm.runInContext(bpmSrc + '\n;this.__BPM = BPMEngine;', win);
    win.__BPM.onLevel((l) => got.push(l));
    win.__BPM.init({ createAnalyser: () => analyser }, { connect() {} });
    for (let i = 0; i < 3 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(); }
    win.__BPM.stop();
    return got[got.length - 1];
}

console.log('=== MenuFxAutoOff ===');
// 1. Nền nhiễu rất thấp (-76 dBFS): dbfs 8-bit ≈ -45 (cũ, giữ nguyên cho VU), dbfsFloat ≈ -76 (mới)
let L = runBpm(makeSignal('noise', -76));
ok(L.dbfs > -47 && L.dbfs < -43, `1a. Nền nhiễu -76 dBFS: dbfs (8-bit, giữ NGUYÊN) = ${L.dbfs.toFixed(1)} ≈ -45 (đúng hiện tượng đo trên Chromium/máy thật của Khói)`);
ok(Math.abs(L.dbfsFloat - (-76)) < 1.5, `1b. dbfsFloat (mới) = ${L.dbfsFloat.toFixed(1)} ≈ -76 (mức thật)`);
L = runBpm(makeSignal('noise', -90)); ok(L.dbfs > -47 && L.dbfs < -43 && Math.abs(L.dbfsFloat + 90) < 1.5, `1c. Nền nhiễu -90 dBFS: 8-bit ${L.dbfs.toFixed(1)} (vẫn ≈ -45) vs float ${L.dbfsFloat.toFixed(1)}`);
// 2. số 0 tuyệt đối
L = runBpm(makeSignal('zero', 0)); ok(L.dbfs === -Infinity && L.dbfsFloat === -Infinity, '2. Số 0 tuyệt đối: cả hai = -Infinity');
// 3. nhạc to: hai thước đo trùng nhau (không đổi hành vi bật FX)
L = runBpm(makeSignal('sine', -20)); ok(Math.abs(L.dbfs - L.dbfsFloat) < 0.6 && Math.abs(L.dbfsFloat + 20) < 0.8, `3. Tín hiệu -20 dBFS: 8-bit ${L.dbfs.toFixed(2)} ≈ float ${L.dbfsFloat.toFixed(2)} (không đổi ngưỡng BẬT)`);
L = runBpm(makeSignal('sine', -40)); ok(Math.abs(L.dbfs - L.dbfsFloat) < 1.0, `3b. Tín hiệu -40 dBFS: sai lệch ${(Math.abs(L.dbfs - L.dbfsFloat)).toFixed(2)} dB (<1)`);
// 4. trường cũ còn nguyên + fallback khi analyser không có getFloatTimeDomainData
L = runBpm(makeSignal('sine', -20));
ok(['bassEnergy', 'localAvg', 'maxByte', 'rms', 'dbfs', 'peak', 'vuPercent'].every((k) => k in L), '4a. Mọi trường onLevel cũ (rms/dbfs/peak/vuPercent/…) vẫn còn — chỉ THÊM dbfsFloat');
L = runBpm(makeSignal('noise', -76), { noFloat: true }); ok(L.dbfsFloat === L.dbfs, '4b. Analyser không có getFloatTimeDomainData → dbfsFloat = dbfs (fallback an toàn, không crash)');

// ---- Bộ điều khiển thật + đồng hồ ảo, nạp bằng 2 thước đo ----
const win = { performance: { now: () => 0 } }; vm.createContext(win); win.window = win; vm.runInContext(asSrc, win); const AS = win.AudioSource;
function rig(metric, extra = {}) { // metric(frameKind) -> dBFS nạp cho controller
    const clock = { t: 0 }; const calls = []; let fx = false; let diag = [];
    const ctl = AS.createFxAutoController({ now: () => clock.t, getFxState: () => fx, applyFx: async (t) => { calls.push({ t: clock.t, target: t }); fx = t; return { ok: true }; }, onDiag: (i) => diag.push(i), params: extra.params });
    ctl.setSourceState(true);
    return { clock, calls, ctl, diag, get fx() { return fx; },
        async run(sec, kind, db) { const end = clock.t + sec * 1000; let nextTick = Math.ceil(clock.t / 100) * 100; while (clock.t < end) { clock.t += 16; const L = runBpmLevel(kind, db); ctl.feedLevel(metric(L), clock.t); while (nextTick <= clock.t) { ctl.tick(clock.t); nextTick += 100; } await Promise.resolve(); } await Promise.resolve(); } };
}
const cache = {}; function runBpmLevel(kind, db) { const k = kind + db; return cache[k] || (cache[k] = runBpm(makeSignal(kind, db))); }
const OLD = (L) => L.dbfs, NEW = (L) => L.dbfsFloat;

(async () => {
    // 5. Tái hiện LỖI THẬT: nhạc rồi nền nhiễu -76 dBFS (hệ thống "im lặng" nhưng không phải số 0) — thước đo cũ KHÔNG BAO GIỜ tắt
    let r = rig(OLD); await r.run(3, 'noise', -76); await r.run(8, 'sine', -20); ok(r.fx === true, '5a. (cũ) nhạc → FX BẬT');
    await r.run(60, 'noise', -76); ok(r.fx === true && r.ctl.getInfo().musicState !== 'MUSIC_SILENT', `5b. (cũ, tái hiện lỗi) 60 s nền nhiễu -76 dBFS: FX KHÔNG tắt, musicState=${r.ctl.getInfo().musicState} (đo ≈ -45 dBFS nằm trong dải trễ -52…-45)`);
    // 6. Sau sửa: dùng dBFS Float — tắt đúng ≈1 s
    r = rig(NEW); await r.run(3, 'noise', -76); await r.run(8, 'sine', -20); ok(r.fx === true, '6a. (mới) nhạc → FX BẬT');
    const tOff0 = r.clock.t; let tOff = null; const origLen = r.calls.length;
    for (let i = 0; i < 200 && tOff === null; i++) { await r.run(0.016, 'noise', -76); if (r.calls.length > origLen) tOff = r.clock.t - tOff0; }
    ok(tOff !== null && tOff >= 950 && tOff <= 1250 && r.fx === false, `6b. (mới) nhạc dừng, nền -76 dBFS: FX TẮT sau ${tOff} ms (đích ≈ 1000 ms)`);
    await r.run(30, 'noise', -76); ok(r.calls.length === origLen + 1, '6c. Không gửi lặp khi nền nhiễu tiếp tục');
    // 7. Bật lại ≤ 1 s khi nhạc quay lại (thước đo mới)
    const nOn = r.calls.length, tOn0 = r.clock.t; let tOn = null;
    for (let i = 0; i < 200 && tOn === null; i++) { await r.run(0.016, 'sine', -20); if (r.calls.length > nOn) tOn = r.clock.t - tOn0; }
    ok(tOn !== null && tOn <= 1000 && r.fx === true, `7. (mới) nhạc quay lại → BẬT sau ${tOn} ms (≤ 1000)`);
    // 8. Nhạc nhỏ nhưng thật (-35 dBFS) vẫn giữ FX BẬT (không tắt nhầm) ; -55 dBFS (dưới ngưỡng tắt) → tắt
    r = rig(NEW); await r.run(3, 'noise', -76); await r.run(5, 'sine', -30); ok(r.fx === true, '8a. Nhạc -30 dBFS → BẬT');
    await r.run(20, 'sine', -48); ok(r.fx === true, '8b. Nhạc nhỏ -48 dBFS (trong dải trễ -52…-45) → giữ nguyên BẬT, không chập chờn');
    await r.run(3, 'sine', -60); ok(r.fx === false, '8c. Xuống -60 dBFS (< ngưỡng tắt -52) → TẮT');
    // 9. Mic: Auto FX không có đường nhận mức mic → mic to không đổi gì
    r = rig(NEW); await r.run(3, 'noise', -76); /* mic -10 dBFS không được nạp vào controller */ await r.run(30, 'noise', -76);
    ok(r.fx === false && r.calls.length === 0, '9. Mic hoạt động (không nạp vào controller) + hệ thống im lặng → FX không bật');
    // 10. Chẩn đoán: levelStats + diag định kỳ
    r = rig(NEW); await r.run(2, 'noise', -76); const info = r.ctl.getInfo();
    ok(info.levelStats && info.levelStats.n > 30 && info.levelStats.min < -70 && info.levelStats.max < -70 && info.msSinceFrame !== null, `10a. getInfo() có levelStats (n=${info.levelStats.n}, min=${info.levelStats.min}, avg=${info.levelStats.avg}, max=${info.levelStats.max}) + msSinceFrame`);
    await r.run(95, 'noise', -76); ok(r.diag.length >= 3 && r.diag.length <= 4, `10b. onDiag được gọi định kỳ ~30 s (${r.diag.length} lần trong ~97 s)`);
    // 11. Khung dừng (cửa sổ bị throttle/ẩn): đóng băng, KHÔNG tắt/bật bậy; khung quay lại → xác nhận lại đúng
    r = rig(NEW); await r.run(3, 'noise', -76); await r.run(8, 'sine', -20); const nn = r.calls.length;
    r.clock.t += 20000; r.ctl.tick(r.clock.t); // 20 s không có khung nào
    ok(r.ctl.getInfo().musicState === 'SOURCE_UNAVAILABLE' && r.calls.length === nn && r.fx === true, '11a. Không có khung 20 s → SOURCE_UNAVAILABLE, đóng băng (không tắt/bật mù quáng)');
    const t0 = r.clock.t; let tb = null; for (let i = 0; i < 300 && tb === null; i++) { await r.run(0.016, 'noise', -76); if (r.calls.length > nn) tb = r.clock.t - t0; }
    ok(tb !== null && tb <= 2500 && r.fx === false, `11b. Khung quay lại + nhạc đã dừng → TẮT sau ${tb} ms (không kẹt ở trạng thái cũ)`);
    console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
})();
