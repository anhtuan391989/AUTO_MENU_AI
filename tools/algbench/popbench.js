'use strict';
// AI-ALG-05 — benchmark KeyEngine trên nhạc pop TỔNG HỢP (tests/helpers/synthPop.js). Chạy engine THẬT trong vm, đồng hồ ảo.
// Dùng: node tools/algbench/popbench.js <REPO> <out.json> [shard] [nshards] [quick]
// Đo: thời gian tới kết quả đầu (provisional), thời gian tới khoá đầu, số lần đổi kết quả khoá, tonic/mode/full ở 10/20/30/40 s, khoá sai.
const fs = require('fs'), path = require('path');
const REPO = path.resolve(process.argv[2]); const OUT = process.argv[3];
const shard = +(process.argv[4] || 0), nsh = +(process.argv[5] || 1), quick = process.argv[6] === 'quick';
const { render, PROGS } = require(path.join(REPO, 'tests/helpers/synthPop.js'));
const { mkAnalyser, sandbox, loadEngine } = require('./lib.js');
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CONDS = {
    vocal: {},
    novocal: { melody: false },
    tune25: { tuningCents: 25 },
    nobass: { bass: false },
    intro_bassdrum: { introSec: 10, introType: "bassdrum" },
    intro_onechord: { introSec: 10, introType: "onechord" },
    noisy: { noise: 0.05 },
};
function runCase(spec, secs) {
    const sr = 22050, r = render(Object.assign({ sr, seconds: secs + 1 }, spec)); const clock = { t: 1000 };
    const S = sandbox(clock, () => mkAnalyser(r.pcm, sr, 8192, clock, 1000), sr); loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine');
    const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} });
    const locks = []; let firstProv = null;
    K.watchContinuous((res) => locks.push({ t: (clock.t - 1000) / 1000, key: res.key }));
    K.onProvisionalEstimate((p) => { if (firstProv === null) firstProv = (clock.t - 1000) / 1000; });
    const snaps = {}; const t0 = process.hrtime.bigint();
    for (let s = 0; s < secs; s++) { S.step(1000); if ([10, 20, 30, 40].includes(s + 1)) { const e = K.estimateKeyFromChroma(); snaps[s + 1] = e.key; } }
    const cpuMs = Number(process.hrtime.bigint() - t0) / 1e6; K.stop();
    return { snaps, locks, firstProv, cpuMs, truth: `${NOTE[r.truth.root]} ${r.truth.mode === 'minor' ? 'Minor' : 'Major'}` };
}
const cases = [];
const roots = quick ? [0, 6] : [0, 3, 6, 9];
for (const [cn, co] of Object.entries(CONDS)) for (const mode of ['major', 'minor']) for (const prog of Object.keys(PROGS[mode])) for (const root of roots)
    cases.push(Object.assign({ cond: cn, mode, prog, root, seed: root * 13 + prog.length + 5 }, co));
const mine = cases.filter((_, i) => i % nsh === shard); const rows = [];
for (const c of mine) { const x = runCase(c, 40); rows.push(Object.assign({ cond: c.cond, mode: c.mode, prog: c.prog, root: c.root }, x)); }
fs.writeFileSync(OUT, JSON.stringify(rows));
console.log('done', rows.length, 'of', cases.length, 'shard', shard);
