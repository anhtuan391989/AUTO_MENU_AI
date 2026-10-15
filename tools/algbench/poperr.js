'use strict';
// Phân loại sai của khoá cuối trong popbench: node poperr.js out*.json
const fs = require('fs'); const rows = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const c = { cases: rows.length, noLock: 0, firstWrong: 0, finalOK: 0, relative: 0, parallel: 0, other: 0, tonicRight: 0, modeRight: 0 };
for (const r of rows) { const L = r.locks; if (!L.length) { c.noLock++; continue; } if (L[0].key !== r.truth) c.firstWrong++;
    const f = L[L.length - 1].key; const [tn, tm] = r.truth.split(' '), [fn, fm] = f.split(' '); const tr = NOTE.indexOf(tn), fr = NOTE.indexOf(fn);
    if (fr === tr) c.tonicRight++; if (fm === tm) c.modeRight++;
    if (f === r.truth) c.finalOK++; else { const rel = tm === 'Major' ? (tr + 9) % 12 : (tr + 3) % 12; if (fr === rel && fm !== tm) c.relative++; else if (fr === tr) c.parallel++; else c.other++; } }
console.log(JSON.stringify(c));
