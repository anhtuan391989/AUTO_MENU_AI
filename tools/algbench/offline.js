'use strict';
// Thử nghiệm thuật toán quyết định Key NGOÀI engine trên chroma đã ghi (popdump). node offline.js dump0.json dump1.json
const fs = require('fs');
const MAIN = require.main === module;
const cases = MAIN ? process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8'))) : [];
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const P = {
    ENG_MAJ: [1.000, 0.065, 0.630, 0.088, 0.710, 0.568, 0.095, 0.851, 0.075, 0.688, 0.098, 0.425],
    ENG_MIN: [1.000, 0.072, 0.573, 0.782, 0.082, 0.571, 0.082, 0.851, 0.608, 0.082, 0.629, 0.082],
    KK_MAJ: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    KK_MIN: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    TMP_MAJ: [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
    TMP_MIN: [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0],
};
const rot = (p, s) => p.slice(12 - s).concat(p.slice(0, 12 - s));
function pearson(a, b) { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; }
function cosine(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
function pl(v, e) { const o = v.map((x) => Math.pow(Math.max(0, x), e)); const n = Math.sqrt(o.reduce((s, x) => s + x * x, 0)) || 1; return o.map((x) => x / n); }
function rank(vec, o) {
    const v = pl(vec, o.pow); const sc = [];
    for (let r = 0; r < 12; r++) for (const m of ['Major', 'Minor']) {
        const pr = rot(P[o.prof + (m === 'Major' ? '_MAJ' : '_MIN')], r);
        let s = o.sim === 'pearson' ? pearson(v, pr) : cosine(v, pr);
        sc.push({ r, m, s });
    }
    sc.sort((a, b) => b.s - a.s); return sc;
}
function accum(c, tau, norm, upto) {
    const acc = new Array(12).fill(0); let prevT = 0, w = 0;
    for (const { t, v } of c.vecs) { if (t > upto) break; const dt = Math.max(0.01, t - prevT); prevT = t; const d = tau === Infinity ? 1 : Math.exp(-dt / tau);
        let f = v; if (norm === 'frame') f = pl(v, 0.67); else if (norm === 'frame1') { const s = v.reduce((a, b) => a + b, 0) || 1; f = v.map((x) => x / s); }
        for (let i = 0; i < 12; i++) acc[i] = acc[i] * d + f[i] * (tau === Infinity ? 1 : 1 - d); }
    return acc;
}
module.exports = { P, rot, pearson, cosine, pl, accum, rank, NOTE };
if (MAIN) {
const T = [5, 10, 20, 40];
function evalCfg(o) {
    const res = {}; for (const t of T) res[t] = { n: 0, tonic: 0, mode: 0, full: 0, rel: 0, par: 0 };
    for (const c of cases) { const [tn, tm] = c.truth.split(' '); const tr = NOTE.indexOf(tn);
        for (const t of T) { const vec = accum(c, o.tau, o.norm, t); const top = rank(vec, o)[0]; const x = res[t]; x.n++; if (top.r === tr) x.tonic++; if (top.m === tm) x.mode++; if (top.r === tr && top.m === tm) x.full++;
            const relRoot = tm === 'Major' ? (tr + 9) % 12 : (tr + 3) % 12; if (top.r === relRoot && top.m !== tm) x.rel++; if (top.r === tr && top.m !== tm) x.par++; } }
    return res;
}
const out = [];
const cfgs = [];
for (const prof of ['ENG', 'KK', 'TMP']) for (const sim of ['cosine', 'pearson']) for (const tau of [4, 10, 20, Infinity]) for (const norm of ['raw', 'frame']) cfgs.push({ prof, sim, tau, norm, pow: 0.67 });
for (const o of cfgs) { const r = evalCfg(o); out.push({ cfg: `${o.prof}/${o.sim}/tau${o.tau}/${o.norm}`, r }); }
const pc = (a, n) => (100 * a / n).toFixed(0).padStart(3);
console.log('cfg | full@5 @10 @20 @40 | tonic@10 @20 | mode@10 @20 | relErr@20 parErr@20');
for (const x of out) { const r = x.r; console.log(`${x.cfg.padEnd(32)} | ${T.map((t) => pc(r[t].full, r[t].n)).join(' ')} | ${pc(r[10].tonic, r[10].n)} ${pc(r[20].tonic, r[20].n)} | ${pc(r[10].mode, r[10].n)} ${pc(r[20].mode, r[20].n)} | ${pc(r[20].rel, r[20].n)} ${pc(r[20].par, r[20].n)}`); }

}
