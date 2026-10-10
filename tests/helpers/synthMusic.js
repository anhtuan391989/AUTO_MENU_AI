/** Bộ tạo nhạc tổng hợp CÓ ĐÁP ÁN cho test offline (hợp âm có hoà âm + bass + trống). Không phải nhạc thật. */
'use strict';
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const MAJ = [0, 4, 7], MIN = [0, 3, 7];
// bậc (semitone so với tonic, chất hợp âm)
const PROG = {
    major: [[0, MAJ], [5, MAJ], [7, MAJ], [0, MAJ]],            // I IV V I
    minor: [[0, MIN], [5, MIN], [7, MAJ], [0, MIN]],            // i iv V i
    // vòng lặp pop: mơ hồ có chủ đích (vi IV I V == i VI III VII)
    popLoop: [[9, MIN], [5, MAJ], [0, MAJ], [7, MAJ]],          // Am F C G
};
function render(opts) {
    const o = Object.assign({ sr: 22050, seconds: 30, bpm: 120, root: 0, prog: "major", drums: true, noise: 0, bass: true, seed: 1, tuningCents: 0, chordBeats: 4 }, opts);
    const { sr } = o, N = Math.floor(o.sr * o.seconds), x = new Float32Array(N), R = rng(o.seed);
    const beat = 60 / o.bpm, chords = PROG[o.prog], tune = Math.pow(2, o.tuningCents / 1200);
    const f = (midi) => 440 * Math.pow(2, (midi - 69) / 12) * tune;
    const nChords = Math.ceil(o.seconds / (beat * o.chordBeats));
    for (let c = 0; c < nChords; c++) {
        const [deg, qual] = chords[c % chords.length];
        const t0 = c * beat * o.chordBeats, t1 = Math.min(o.seconds, t0 + beat * o.chordBeats);
        const rootMidi = 48 + o.root + deg; // C3 + ...
        const notes = qual.map((iv) => rootMidi + 12 + iv); // tam hợp ở C4
        const add = (midi, amp, h) => {
            for (let k = 1; k <= h; k++) {
                const fr = f(midi) * k; if (fr > sr / 2 - 100) break;
                const a = amp / k, w = 2 * Math.PI * fr / sr;
                for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) {
                    const tt = (i - t0 * sr) / sr, env = Math.min(1, tt * 40) * Math.exp(-tt * 0.6);
                    x[i] += a * env * Math.sin(w * i);
                }
            }
        };
        for (const m of notes) add(m, 0.12, 5);
        if (o.bass) add(rootMidi - 12, 0.2, 3);
    }
    if (o.drums) {
        const nb = Math.floor(o.seconds / beat);
        for (let b = 0; b < nb; b++) {
            const t = b * beat, i0 = Math.floor(t * sr);
            if (b % 2 === 0) for (let i = 0; i < 0.12 * sr && i0 + i < N; i++) { const tt = i / sr; x[i0 + i] += 0.5 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-tt * 40)) * tt) * Math.exp(-tt * 25); }       // kick
            else for (let i = 0; i < 0.1 * sr && i0 + i < N; i++) { const tt = i / sr; x[i0 + i] += 0.25 * (R() * 2 - 1) * Math.exp(-tt * 30); }                                                                 // snare-ish
            const i1 = Math.floor((t + beat / 2) * sr);
            for (let i = 0; i < 0.03 * sr && i1 + i < N; i++) { const tt = i / sr; x[i1 + i] += 0.1 * (R() * 2 - 1) * Math.exp(-tt * 120); }                                                        // hat
        }
    }
    if (o.noise > 0) for (let i = 0; i < N; i++) x[i] += o.noise * (R() * 2 - 1);
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(x[i]));
    if (mx > 0.95) for (let i = 0; i < N; i++) x[i] *= 0.95 / mx;
    return { pcm: x, sr, truth: { bpm: o.bpm, root: o.root, mode: o.prog === "minor" ? "minor" : "major" } };
}
module.exports = { render };
