'use strict';
// Ghi chroma (engine THẬT, qua onLevel) + bassRootVotes theo thời gian cho từng ca pop, để thử nghiệm thuật toán quyết định NGOÀI engine.
// node tools/algbench/popdump.js <REPO> <out.json> [shard] [nshards]
const fs = require('fs'), path = require('path');
const REPO = path.resolve(process.argv[2]); const OUT = process.argv[3]; const shard = +(process.argv[4] || 0), nsh = +(process.argv[5] || 1);
const { render, PROGS } = require(path.join(REPO, 'tests/helpers/synthPop.js')); const { mkAnalyser, sandbox, loadEngine } = require('./lib.js');
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CONDS = { vocal: {}, novocal: { melody: false }, tune25: { tuningCents: 25 }, nobass: { bass: false }, intro_bassdrum: { introSec: 10, introType: "bassdrum" }, intro_onechord: { introSec: 10, introType: "onechord" }, noisy: { noise: 0.05 } };
const cases = []; for (const [cn, co] of Object.entries(CONDS)) for (const mode of ['major', 'minor']) for (const prog of Object.keys(PROGS[mode])) for (const root of [0, 6])
    cases.push(Object.assign({ cond: cn, mode, prog, root, seed: root * 13 + prog.length + 5 }, co));
const rows = [];
cases.forEach((c, idx) => { if (idx % nsh !== shard) return;
    const sr = 22050, secs = 40, r = render(Object.assign({ sr, seconds: secs + 1 }, c)); const clock = { t: 1000 };
    const S = sandbox(clock, () => mkAnalyser(r.pcm, sr, 8192, clock, 1000), sr); loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine');
    const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} }); const vecs = []; let n = 0;
    K.onLevel((v) => { if ((n++ % 6) === 0) vecs.push({ t: (clock.t - 1000) / 1000, v: v.slice() }); });
    const bass = []; for (let s = 0; s < secs; s++) { S.step(1000); bass.push(K.getDebugSnapshot().bassRootVotes); } K.stop();
    rows.push({ cond: c.cond, mode: c.mode, prog: c.prog, root: c.root, truth: `${NOTE[c.root]} ${c.mode === 'minor' ? 'Minor' : 'Major'}`, vecs, bass });
});
fs.writeFileSync(OUT, JSON.stringify(rows)); console.log('done', rows.length);
