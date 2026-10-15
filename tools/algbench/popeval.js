'use strict';
// Tổng hợp kết quả popbench: node tools/algbench/popeval.js out1.json [out2.json ...]
const fs = require('fs');
const rows = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const split = (k) => { const [r, m] = k.split(' '); return { r, m }; };
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function lockAt(locks, t) { let k = null; for (const l of locks) if (l.t <= t) k = l.key; return k; }
const groups = {};
for (const r of rows) { (groups[r.cond] = groups[r.cond] || []).push(r); (groups.ALL = groups.ALL || []).push(r); }
const pct = (a, n) => (n ? (100 * a / n).toFixed(0) + '%' : '-');
console.log('cond | n | firstProv(s) | firstLock(s) | lockChanges(med) | @20s tonic/mode/full (engine estimate) | locked-state full-correct @20s/@40s | time-correct 10-40s | wrongLockFrac');
for (const [c, g] of Object.entries(groups)) {
    const n = g.length; let t20 = 0, m20 = 0, f20 = 0, l20 = 0, l40 = 0, tc = 0, tcn = 0, wl = 0, tl = 0;
    for (const r of g) {
        const T = split(r.truth); const e = r.snaps['20']; if (e) { const E = split(e); if (E.r === T.r) t20++; if (E.m === T.m) m20++; if (e === r.truth) f20++; }
        if (lockAt(r.locks, 20) === r.truth) l20++; if (lockAt(r.locks, 40) === r.truth) l40++;
        for (let t = 10; t <= 40; t += 0.5) { tcn++; if (lockAt(r.locks, t) === r.truth) tc++; }
        for (const l of r.locks) { tl++; if (l.key !== r.truth) wl++; }
    }
    console.log(`${c} | ${n} | ${med(g.map((r) => r.firstProv).filter((x) => x != null))} | ${med(g.map((r) => r.locks[0] && r.locks[0].t).filter((x) => x != null))} | ${med(g.map((r) => r.locks.length))} | ${pct(t20, n)}/${pct(m20, n)}/${pct(f20, n)} | ${pct(l20, n)}/${pct(l40, n)} | ${pct(tc, tcn)} | ${pct(wl, tl)} | cpu ${med(g.map((r) => r.cpuMs)).toFixed(0)}ms`);
}
