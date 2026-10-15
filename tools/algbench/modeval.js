'use strict';
const fs = require('fs'); const rows = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
let n = rows.length, falseCases = 0, falseMod = 0, falseLabel = 0, det = 0, delays = [], wrongTarget = 0, extra = 0;
for (const r of rows) {
    const sm = r.staticEvents.filter((e) => !e.label), sl = r.staticEvents.filter((e) => e.label);
    if (r.staticEvents.length) falseCases++; falseMod += sm.length; falseLabel += sl.length;
    const m = r.modEvents.filter((e) => !e.label && e.kind === 'MODULATION' && e.t >= 24);
    if (m.length) { det++; delays.push(m[0].t - 24); if (m[0].semitone !== 2) wrongTarget++; extra += m.length - 1; }
}
delays.sort((a, b) => a - b);
console.log(`ca=${n} | static-key: ca có báo giả=${falseCases}/${n}, modulation giả=${falseMod}, nhãn đổi giả=${falseLabel} | chuyển điệu thật +2: phát hiện=${det}/${n}, độ trễ median=${delays.length ? delays[Math.floor(delays.length / 2)].toFixed(1) : '-'}s, sai bán cung=${wrongTarget}, báo thừa sau lần đầu=${extra}`);
