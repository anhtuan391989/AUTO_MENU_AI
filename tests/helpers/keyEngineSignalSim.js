/**
 * keyEngineSignalSim.js — TASK AI-KEY-ENGINE-COMPLETE-01
 * Mô phỏng KeyEngine THẬT (ui/js/engines/keyEngine.js, nạp qua vm) với TÍN HIỆU THỜI GIAN (không phải phổ dựng sẵn):
 *   tín hiệu tổng hợp -> cửa sổ Blackman 8192 -> FFT -> dB(|X|/N)  == cách AnalyserNode.getFloatFrequencyData tính (smoothing=0).
 * Nhờ vậy đo được đúng đơn vị mà cổng nội dung (contentRms) nhìn thấy khi nhạc nhỏ/lớn.
 * ĐÂY LÀ MÔ PHỎNG (mã engine thật, đầu vào tổng hợp, đồng hồ ảo) — KHÔNG phải đo runtime Windows/Electron.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SR = 48000, FFT = 8192, BINS = FFT / 2;

// ---------- FFT radix-2 ----------
const COS = new Float64Array(FFT / 2), SIN = new Float64Array(FFT / 2);
for (let i = 0; i < FFT / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / FFT); SIN[i] = -Math.sin(2 * Math.PI * i / FFT); }
const REV = new Uint16Array(FFT);
for (let i = 0; i < FFT; i++) { let r = 0, x = i; for (let b = 0; b < 13; b++) { r = (r << 1) | (x & 1); x >>= 1; } REV[i] = r; }
const WIN = new Float64Array(FFT); // Blackman, alpha 0.16 (đúng AnalyserNode)
for (let i = 0; i < FFT; i++) { const a = 0.16; WIN[i] = (1 - a) / 2 - 0.5 * Math.cos(2 * Math.PI * i / FFT) + (a / 2) * Math.cos(4 * Math.PI * i / FFT); }
const re = new Float64Array(FFT), im = new Float64Array(FFT);
function fftDb(buf, start, out) {
    for (let i = 0; i < FFT; i++) { const s = start + i; re[REV[i]] = (s >= 0 && s < buf.length ? buf[s] : 0) * WIN[i]; im[REV[i]] = 0; }
    for (let size = 2; size <= FFT; size <<= 1) {
        const half = size >> 1, step = FFT / size;
        for (let i = 0; i < FFT; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half, tr = re[b] * COS[k] - im[b] * SIN[k], ti = re[b] * SIN[k] + im[b] * COS[k];
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
    }
    for (let k = 0; k < BINS; k++) { const m = Math.hypot(re[k], im[k]) / FFT; out[k] = m > 0 ? 20 * Math.log10(m) : -Infinity; }
}

// ---------- RNG có hạt giống (tái lập) ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- Tổng hợp ----------
const TIMBRES = {
    piano:  { amps: [1, 0.55, 0.35, 0.22, 0.12, 0.08, 0.05, 0.03], decay: 1.2 },
    organ:  { amps: [1, 0.9, 0.5, 0.6, 0.2, 0.3, 0.1, 0.15], decay: 0 },
    guitar: { amps: [1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05], decay: 0.8 },
    pad:    { amps: [1, 0.25, 0.1, 0.05], decay: 0 },
    brass:  { amps: [1, 0.8, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12], decay: 0.5 },
};
/** Thêm 1 nốt (MIDI) vào buf trong [t0,t1) giây, biên độ amp (đỉnh), lệch tuning cent. */
function addNote(buf, midi, t0, t1, amp, timbre, cents, phase0) {
    const T = TIMBRES[timbre] || TIMBRES.piano;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12 + (cents || 0) / 1200);
    const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(buf.length, Math.round(t1 * SR));
    for (let h = 0; h < T.amps.length; h++) {
        const f = f0 * (h + 1); if (f > SR / 2 - 200) break;
        const w = 2 * Math.PI * f / SR, a = amp * T.amps[h], ph = (phase0 || 0) * (h + 1);
        for (let s = s0; s < s1; s++) {
            const t = (s - s0) / SR;
            const env = T.decay ? Math.exp(-t * T.decay) * 0.6 + 0.4 : 1;
            buf[s] += a * env * Math.sin(w * s + ph);
        }
    }
}
const MAJ = [0, 4, 7], MIN = [0, 3, 7];
/** Hợp âm (root pc, kiểu) quanh C4 + bass 1 quãng 8 thấp hơn. opts: {no3, power, bassOnly} */
function addChord(buf, rootPc, quality, t0, t1, amp, o) {
    o = o || {};
    const base = 60 + rootPc, iv = o.power ? [0, 7] : (quality === 'minor' ? MIN : MAJ);
    const notes = o.no3 ? [0, 7] : iv;
    if (!o.bassOnly) for (const n of notes) addNote(buf, base + n, t0, t1, amp, o.timbre, o.cents, o.phase);
    addNote(buf, base - 12 + (o.bassIv || 0), t0, t1, amp * (o.bassGain === undefined ? 1.2 : o.bassGain), o.timbre === 'pad' ? 'organ' : (o.timbre || 'piano'), o.cents);
}
/** Vòng hợp âm diatonic của Key (root pc, mode) — bậc I-V-vi-IV (trưởng) hoặc i-VI-III-VII (thứ). */
function progression(rootPc, mode) {
    if (mode === 'major') return [[0, 'major'], [7, 'major'], [9, 'minor'], [5, 'major']].map(([d, q]) => [(rootPc + d) % 12, q]);
    return [[0, 'minor'], [8, 'major'], [3, 'major'], [10, 'major']].map(([d, q]) => [(rootPc + d) % 12, q]);
}
function addProgression(buf, rootPc, mode, t0, t1, amp, o) {
    o = o || {}; const ch = progression(rootPc, mode), len = o.chordSec || 2; let i = 0;
    for (let t = t0; t < t1; t += len, i++) {
        const [r, q] = ch[(i + (o.startAt || 0)) % ch.length];
        addChord(buf, r, q, t, Math.min(t + len, t1), amp, o);
    }
}
function addNoise(buf, t0, t1, rms, seed, kind) {
    const r = rng(seed || 7), s0 = Math.round(t0 * SR), s1 = Math.min(buf.length, Math.round(t1 * SR)); let b = 0;
    for (let s = s0; s < s1; s++) {
        const w = (r() + r() + r() + r() - 2) * 1.732 * 0.5; // ~N(0,1)·hệ số
        if (kind === 'brown') { b = b * 0.995 + w * 0.1; buf[s] += b * rms * 8; } else buf[s] += w * rms * 2;
    }
}
const dbToLin = (db) => Math.pow(10, db / 20);
function rmsDbfs(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return 10 * Math.log10(s / buf.length + 1e-30); }
function scaleToRmsDb(buf, db) { const cur = rmsDbfs(buf); const g = Math.pow(10, (db - cur) / 20); for (let i = 0; i < buf.length; i++) buf[i] *= g; return buf; }

// ---------- Mô phỏng engine ----------
/** buf: Float32Array tín hiệu; opts.engineSrc: nguồn keyEngine.js (mặc định bản trong repo). */
function create(buf, opts) {
    opts = opts || {};
    const clock = { t: 1000 }, t0 = clock.t; const raf = []; const intervals = []; let iid = 0, rid = 0;
    const tele = [];
    const analyser = {
        fftSize: FFT, frequencyBinCount: BINS, smoothingTimeConstant: 0,
        getFloatFrequencyData(a) { const end = Math.round((clock.t - t0) / 1000 * SR); fftDb(buf, end - FFT, a); },
    };
    const sb = {
        console: { log() {}, warn() {}, error() {} }, Math, Array, Float32Array, Float64Array, Uint8Array, Object, Number, JSON, String, Infinity, isFinite, parseFloat, Set, Map, Error,
        Date: { now: () => clock.t },
        requestAnimationFrame: (cb) => { const id = ++rid; raf.push({ id, cb }); return id; }, cancelAnimationFrame: (id) => { const i = raf.findIndex((x) => x.id === id); if (i >= 0) raf.splice(i, 1); },
        setInterval: (fn, ms) => { intervals.push({ id: ++iid, fn, ms, next: clock.t + ms }); return iid; },
        clearInterval: (id) => { const i = intervals.findIndex((x) => x.id === id); if (i >= 0) intervals.splice(i, 1); },
        setTimeout: (fn, ms) => { const o = { id: ++iid, fn: () => { const i = intervals.indexOf(o); if (i >= 0) intervals.splice(i, 1); fn(); }, ms, next: clock.t + ms }; intervals.push(o); return iid; },
        clearTimeout: (id) => { const i = intervals.findIndex((x) => x.id === id); if (i >= 0) intervals.splice(i, 1); },
        performance: { now: () => clock.t },
    };
    sb.window = sb; sb.window.electronAPI = { sendTelemetry: (r) => tele.push(Object.assign({ at: (clock.t - t0) / 1000 }, r)) };
    vm.createContext(sb);
    const src = opts.engineSrc || fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
    vm.runInContext(src + '\nthis.KeyEngine = KeyEngine;', sb);
    const ctx = { sampleRate: SR, createAnalyser: () => analyser };
    let rafAcc = 0;
    function step(ms) {
        const end = clock.t + ms;
        while (clock.t < end) {
            clock.t += 1; rafAcc += 1;
            if (rafAcc >= 1000 / 60) { rafAcc -= 1000 / 60; raf.splice(0).forEach((x) => x.cb()); }
            for (const it of intervals.slice()) if (it.next <= clock.t && intervals.includes(it)) { it.next += it.ms; it.fn(); }
        }
    }
    return { KeyEngine: sb.KeyEngine, ctx, step, now: () => (clock.t - t0) / 1000, tele, sb };
}

/**
 * Chạy 1 ca: trả danh sách khoá (key,time) theo watchContinuous (cùng đường renderer dùng detectOnce lặp lại).
 * durationS: tổng thời gian; trả {locks:[{t,key}], first, snap}
 */
function runCase(buf, durationS, opts) {
    opts = opts || {};
    const e = create(buf, opts);
    e.KeyEngine.init(e.ctx, { connect() {} });
    const locks = [];
    e.KeyEngine.watchContinuous((r) => locks.push({ t: e.now(), key: r.key, conf: r.confidence, margin: r.margin }));
    const stepMs = 250;
    const probes = [];
    for (let t = 0; t < durationS * 1000; t += stepMs) {
        e.step(stepMs);
        if (opts.probeEveryS && Math.abs((t + stepMs) / 1000 % opts.probeEveryS) < 1e-9) probes.push({ t: e.now(), snap: e.KeyEngine.getDebugSnapshot() });
    }
    const snap = e.KeyEngine.getDebugSnapshot();
    return { locks, first: locks[0] || null, last: locks.length ? locks[locks.length - 1] : null, snap, probes, tele: e.tele, e };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const labelOf = (pc, mode) => `${NOTE_NAMES[pc]} ${mode === 'major' ? 'Major' : 'Minor'}`;

module.exports = { SR, FFT, create, runCase, addNote, addChord, addProgression, addNoise, progression, scaleToRmsDb, rmsDbfs, dbToLin, rng, labelOf, NOTE_NAMES, fftDb, TIMBRES };
