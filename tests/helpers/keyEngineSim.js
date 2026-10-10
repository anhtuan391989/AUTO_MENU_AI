/** Mô phỏng KeyEngine THẬT (ui/js/engines/keyEngine.js) trên đồng hồ ảo + AnalyserNode giả phát hợp âm tổng hợp.
 *  ĐÂY LÀ MÔ PHỎNG (mã engine thật, đầu vào tổng hợp, thời gian ảo) — KHÔNG phải số đo runtime Windows. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SR = 48000, FFT = 8192, BINS = FFT / 2;
function chordSpectrum(rootPc, mode) {
    const arr = new Float32Array(BINS).fill(-120);
    const third = mode === 'minor' ? 3 : 4, midi0 = 60 + rootPc;
    const notes = [midi0, midi0 + third, midi0 + 7, midi0 - 12];
    for (const m of notes) for (let h = 1; h <= 6; h++) {
        const f = 440 * Math.pow(2, (m - 69) / 12) * h, bin = Math.round(f / (SR / FFT));
        if (bin + 1 < BINS) { const db = -18 - 6 * (h - 1) - (m === midi0 - 12 ? 0 : 3); arr[bin] = Math.max(arr[bin], db); arr[bin - 1] = Math.max(arr[bin - 1], db - 6); arr[bin + 1] = Math.max(arr[bin + 1], db - 6); }
    }
    return arr;
}
function create(spec) {
    const clock = { t: 1000 }; const raf = []; const intervals = []; let iid = 0;
    const analyser = { fftSize: FFT, frequencyBinCount: BINS, smoothingTimeConstant: 0, getFloatFrequencyData(a) { a.set(chordSpectrum(spec.root, spec.mode)); } };
    const sb = {
        console: { log() {}, warn() {}, error() {} }, Math, Array, Float32Array, Uint8Array, Object, Number, JSON,
        Date: { now: () => clock.t },
        requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; }, cancelAnimationFrame: () => {},
        setInterval: (fn, ms) => { intervals.push({ id: ++iid, fn, ms, next: clock.t + ms }); return iid; },
        clearInterval: (id) => { const i = intervals.findIndex((x) => x.id === id); if (i >= 0) intervals.splice(i, 1); },
        setTimeout: (fn, ms) => { const o = { id: ++iid, fn: () => { const i = intervals.indexOf(o); if (i >= 0) intervals.splice(i, 1); fn(); }, ms, next: clock.t + ms }; intervals.push(o); return iid; },
        clearTimeout: (id) => { const i = intervals.findIndex((x) => x.id === id); if (i >= 0) intervals.splice(i, 1); },
        performance: { now: () => clock.t },
    };
    sb.window = sb; sb.window.electronAPI = undefined;
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8') + '\nthis.KeyEngine = KeyEngine;', sb);
    const ctx = { sampleRate: SR, createAnalyser: () => analyser };
    let rafAcc = 0;
    function step(ms) {
        const end = clock.t + ms;
        while (clock.t < end) {
            clock.t += 1; rafAcc += 1;               // độ phân giải 1 ms để thấy đúng thứ tự timer
            if (rafAcc >= 1000 / 60) { rafAcc -= 1000 / 60; const cbs = raf.splice(0); cbs.forEach((cb) => cb()); }
            for (const it of intervals.slice()) if (it.next <= clock.t && intervals.includes(it)) { it.next += it.ms; it.fn(); }
        }
    }
    return { KeyEngine: sb.KeyEngine, ctx, step, now: () => clock.t - 1000, sb };
}
module.exports = { create };
