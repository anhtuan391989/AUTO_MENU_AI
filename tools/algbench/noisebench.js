'use strict';
// AI-FIX-06 — tái hiện triệu chứng log thật (LONG_REANCHOR liên tục) bằng nhạc tổng hợp + nhiễu băng rộng/bộ gõ mạnh.
// Dùng: node tools/algbench/noisebench.js <REPO> [secs=90] — in số LONG_REANCHOR, số lần đổi khoá, khoá cuối, đúng/sai.
const path = require('path');
const REPO = path.resolve(process.argv[2] || '.'); const SECS = +(process.argv[3] || 90);
const { render, PROGS } = require(path.join(__dirname, '../../tests/helpers/synthPop.js'));
const { mkAnalyser, sandbox, loadEngine } = require('./lib.js');
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const conds = { clean: { noise: 0 }, diffuse: { noise: 0.3, padAmp: 0.03, bassAmp: 0.05, melAmp: 0.05 }, diffuse2: { noise: 0.5, padAmp: 0.04, bassAmp: 0.06, melAmp: 0.06 } };
const out = {};
for (const [cn, co] of Object.entries(conds)) {
    let n = 0, reanch = 0, changes = 0, finalOk = 0, lockedAny = 0;
    for (const mode of ['major', 'minor']) for (const prog of Object.keys(PROGS[mode])) for (const root of [0, 7]) {
        const sr = 22050, r = render(Object.assign({ sr, seconds: SECS + 1, mode, prog, root, seed: root * 13 + prog.length + 5 }, co)); const clock = { t: 1000 };
        const S = sandbox(clock, () => mkAnalyser(r.pcm, sr, 8192, clock, 1000), sr);
        S.sb.electronAPI = { sendTelemetry: (rec) => { if (rec && rec.event === 'LONG_REANCHOR') reanch++; } };
        loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine'); const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} });
        const locks = []; K.watchContinuous((x) => locks.push(x.key)); S.step(SECS * 1000); K.stop();
        n++; changes += Math.max(0, locks.length - 1); if (locks.length) lockedAny++;
        const truth = `${NOTE[r.truth.root]} ${r.truth.mode === 'minor' ? 'Minor' : 'Major'}`; if (locks[locks.length - 1] === truth) finalOk++;
    }
    out[cn] = { songs: n, reanchorPerSong: +(reanch / n).toFixed(1), lockChangesPerSong: +(changes / n).toFixed(2), finalExact: `${finalOk}/${n}`, locked: `${lockedAny}/${n}` };
}
console.log(JSON.stringify(out, null, 1));
