'use strict';
// AI-ALG-05 — benchmark KeyEngine + ModEngine THẬT trên nhạc pop tổng hợp: (a) giữ nguyên Key => số báo chuyển điệu GIẢ; (b) chuyển điệu thật => độ trễ phát hiện.
// node tools/algbench/modbench.js <REPO> <out.json> [shard] [nshards]
const fs = require('fs'), path = require('path');
const REPO = path.resolve(process.argv[2]); const OUT = process.argv[3]; const shard = +(process.argv[4] || 0), nsh = +(process.argv[5] || 1);
const { render, PROGS } = require(path.join(REPO, 'tests/helpers/synthPop.js')); const { mkAnalyser, sandbox, loadEngine } = require('./lib.js');
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function song(spec, secs, modAt, shift) {
    const sr = 22050;
    const a = render(Object.assign({ sr, seconds: secs + 1 }, spec));
    if (!modAt) return { pcm: a.pcm, sr };
    const b = render(Object.assign({ sr, seconds: secs + 1 }, spec, { root: (spec.root + shift + 12) % 12 }));
    const pcm = new Float32Array(a.pcm.length); const cut = Math.floor(modAt * sr), xf = Math.floor(0.2 * sr);
    for (let i = 0; i < pcm.length; i++) { if (i < cut - xf) pcm[i] = a.pcm[i]; else if (i >= cut) pcm[i] = b.pcm[i]; else { const w = (i - (cut - xf)) / xf; pcm[i] = a.pcm[i] * (1 - w) + b.pcm[i] * w; } }
    return { pcm, sr };
}
function run(spec, secs, modAt, shift) {
    const { pcm, sr } = song(spec, secs, modAt, shift); const clock = { t: 1000 };
    const S = sandbox(clock, () => mkAnalyser(pcm, sr, 8192, clock, 1000), sr); loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine'); loadEngine(REPO, S.sb, 'modEngine.js', 'ModEngine');
    const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} });
    const startRoot = spec.root, mode = spec.mode === 'minor' ? 'Minor' : 'Major';
    const events = [];
    // ModEngine bắt đầu sau khi Key gốc "đã chốt" (giả lập renderer: ~12 s đầu)
    S.step(12000);
    S.sb.ModEngine.start(startRoot, (d) => events.push({ t: (clock.t - 1000) / 1000, kind: d.kind || 'MODULATION', semitone: d.semitone, target: d.targetKey }), () => false,
        (st, p) => { if (st === 'KEY_LABEL_CHANGED') events.push({ t: (clock.t - 1000) / 1000, kind: p.kind, label: true }); }, { originalMode: mode });
    S.step((secs - 12) * 1000); S.sb.ModEngine.stop(); K.stop();
    return events;
}
const cases = [];
for (const mode of ['major', 'minor']) for (const prog of Object.keys(PROGS[mode])) for (const root of [0, 6]) cases.push({ mode, prog, root, seed: root * 13 + prog.length + 5 });
const rows = [];
cases.forEach((c, idx) => { if (idx % nsh !== shard) return;
    const stat = run(c, 40, 0, 0);
    const mod = run(c, 40, 24, 2);          // đổi giọng +2 bán cung lúc 24 s
    rows.push({ mode: c.mode, prog: c.prog, root: c.root, staticEvents: stat, modEvents: mod });
});
fs.writeFileSync(OUT, JSON.stringify(rows)); console.log('done', rows.length);
