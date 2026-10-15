/**
 * AI-ALG-05 — bộ tạo nhạc pop TỔNG HỢP "khó hơn" synthMusic.js: có giai điệu giọng hát (vibrato), hợp âm đảo, hợp âm 7, bass đi theo bass-line,
 * intro chỉ có bass+trống hoặc 1 hợp âm, nhiễu, lệch tuning. Đáp án (tonic/mode) có SẴN theo cách tạo — nhưng đây KHÔNG phải nhạc thật,
 * không thay thế được đo trên bản thu thật có nhãn do người xác nhận. Dùng để tái hiện CƠ CHẾ lỗi (nghe theo hợp âm thay vì theo giọng).
 */
'use strict';
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// hợp âm: [độ lệch tonic (bán cung), chất, đảo]  chất: M m 7 m7 ; đảo: 0 gốc, 1 đảo 1 (bass = quãng 3), 2 đảo 2 (bass = quãng 5)
const CH = { M: [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };
const PROGS = {
    major: {
        "I-V-vi-IV": [[0, "M"], [7, "M", 1], [9, "m"], [5, "M"]],
        "I-vi-IV-V": [[0, "M"], [9, "m"], [5, "M"], [7, "7"]],
        "I-IV-V-I": [[0, "M"], [5, "M", 2], [7, "M"], [0, "M"]],
        "I-iii-IV-V": [[0, "M"], [4, "m", 1], [5, "M"], [7, "M"]],
    },
    minor: {
        "i-VI-III-VII": [[0, "m"], [8, "M"], [3, "M", 1], [10, "M"]],
        "i-iv-V-i": [[0, "m"], [5, "m"], [7, "7"], [0, "m"]],
        "i-VII-VI-V": [[0, "m"], [10, "M"], [8, "M", 1], [7, "M"]],
        "i-iv-VII-III": [[0, "m", 0], [5, "m", 1], [10, "M"], [3, "M"]],
    },
};
// vòng lặp mơ hồ tương đối (cùng tập nốt): nhãn chấp nhận cả giọng trưởng lẫn giọng thứ tương đối — dùng riêng
const AMBIG = { "vi-IV-I-V": { chords: [[9, "m"], [5, "M"], [0, "M"], [7, "M"]], major: 0, minor: 9 } };
const SCALE_MAJ = [0, 2, 4, 5, 7, 9, 11], SCALE_MIN = [0, 2, 3, 5, 7, 8, 10];

function render(o0) {
    const o = Object.assign({ sr: 22050, seconds: 40, bpm: 90, root: 0, mode: "major", prog: "I-V-vi-IV", chordBeats: 4, seed: 1, tuningCents: 0,
        melody: true, bass: true, drums: true, noise: 0, introSec: 0, introType: "bassdrum", padAmp: 0.1, bassAmp: 0.2, melAmp: 0.16 }, o0);
    const { sr } = o, N = Math.floor(sr * o.seconds), x = new Float32Array(N), R = rng(o.seed);
    const beat = 60 / o.bpm, tune = Math.pow(2, o.tuningCents / 1200);
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12) * tune;
    const chords = o.chords || PROGS[o.mode][o.prog];
    const partial = (midiF, t0, t1, amp, nH, vib, rolloff) => {
        const fr0 = midiF;
        for (let k = 1; k <= nH; k++) {
            const fr = fr0 * k; if (fr > sr / 2 - 200) break;
            const a = amp / Math.pow(k, rolloff || 1), w0 = 2 * Math.PI * fr / sr;
            let ph = R() * 6.28;
            for (let i = Math.floor(t0 * sr); i < Math.min(N, Math.floor(t1 * sr)); i++) {
                const tt = (i / sr) - t0, env = Math.min(1, tt * 30) * Math.min(1, (t1 - t0 - tt) * 30 + 0.2) * Math.exp(-tt * 0.35);
                const vv = vib ? 1 + (Math.pow(2, (vib * Math.sin(2 * Math.PI * 5.5 * tt)) / 1200) - 1) : 1;
                ph += w0 * vv; x[i] += a * env * Math.sin(ph);
            }
        }
    };
    const nChords = Math.ceil(o.seconds / (beat * o.chordBeats));
    const scale = (o.mode === "minor" ? SCALE_MIN : SCALE_MAJ);
    for (let c = 0; c < nChords; c++) {
        const [deg, q, inv] = chords[c % chords.length]; const qual = CH[q];
        const t0 = c * beat * o.chordBeats, t1 = Math.min(o.seconds, t0 + beat * o.chordBeats);
        const inIntro = t0 < o.introSec;
        const rootMidi = 48 + o.root + deg;
        // nốt hợp âm (vùng C4), đảo
        let notes = qual.map((iv) => rootMidi + 12 + iv);
        if (inv) { for (let r = 0; r < inv; r++) { const n0 = notes.shift(); notes.push(n0 + 12); } notes = notes.map((n) => n - 12 * (n > rootMidi + 24 ? 1 : 0)); }
        const bassNote = (inv ? notes.slice().sort((a, b) => a - b)[0] - 12 : rootMidi - 12) - (inv ? 0 : 0);
        const introOnlyRhythm = inIntro && o.introType === "bassdrum";
        const introOneChord = inIntro && o.introType === "onechord";
        if (!introOnlyRhythm) {
            const useNotes = introOneChord ? [rootMidi + 12, rootMidi + 12 + qual[2]] : notes; // chỉ gốc+quãng 5 (power chord) ở intro "onechord"
            for (const m of useNotes) partial(f(m), t0, t1, o.padAmp, 5, 0, 1.2);
        }
        if (o.bass) partial(f(introOneChord ? rootMidi - 12 : bassNote), t0, t1, o.bassAmp, 3, 0, 1);
    }
    // giai điệu giọng hát: đi bộ ngẫu nhiên trên thang âm của Key, ưu tiên nốt hợp âm khi rơi vào phách mạnh
    if (o.melody) {
        let deg = 4, t = Math.max(o.introSec, 0) + 0.5;
        while (t < o.seconds - 0.3) {
            const dur = beat * (R() < 0.5 ? 1 : (R() < 0.5 ? 0.5 : 2));
            const step = Math.floor(R() * 5) - 2; deg = Math.max(0, Math.min(13, deg + step));
            const semis = scale[deg % 7] + 12 * Math.floor(deg / 7);
            // thỉnh thoảng nốt ngoài thang (chromatic passing): 8%
            const midi = 60 + o.root + semis + (R() < 0.08 ? 1 : 0);
            partial(f(midi), t, Math.min(o.seconds, t + dur * 0.92), o.melAmp, 7, 25, 1.1);
            t += dur + (R() < 0.25 ? beat * 0.5 : 0);
        }
    }
    if (o.drums) {
        const nb = Math.floor(o.seconds / beat);
        for (let b = 0; b < nb; b++) {
            const t = b * beat, i0 = Math.floor(t * sr);
            if (b % 2 === 0) for (let i = 0; i < 0.12 * sr && i0 + i < N; i++) { const tt = i / sr; x[i0 + i] += 0.45 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-tt * 40)) * tt) * Math.exp(-tt * 25); }
            else for (let i = 0; i < 0.1 * sr && i0 + i < N; i++) { const tt = i / sr; x[i0 + i] += 0.22 * (R() * 2 - 1) * Math.exp(-tt * 30); }
            const i1 = Math.floor((t + beat / 2) * sr);
            for (let i = 0; i < 0.03 * sr && i1 + i < N; i++) { const tt = i / sr; x[i1 + i] += 0.1 * (R() * 2 - 1) * Math.exp(-tt * 120); }
        }
    }
    if (o.noise > 0) for (let i = 0; i < N; i++) x[i] += o.noise * (R() * 2 - 1);
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(x[i]));
    if (mx > 0.95) for (let i = 0; i < N; i++) x[i] *= 0.95 / mx;
    return { pcm: x, sr, truth: { root: o.root, mode: o.mode } };
}
module.exports = { render, PROGS, AMBIG };
