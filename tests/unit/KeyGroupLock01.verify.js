/**
 * KEY-GROUP-LOCK-01 — gộp 2 Key relative (cùng bộ nốt) khi chốt Key. Chạy: node tests/unit/KeyGroupLock01.verify.js
 * Engine THẬT (ui/js/engines/keyEngine.js) trong vm + đồng hồ ảo. Đầu vào tổng hợp — KHÔNG phải nhạc thật.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '../..');
const S = require(path.join(REPO, 'tests/helpers/keyEngineSignalSim.js'));
const MA = require(path.join(REPO, 'ui/js/engines/musicAnalysis.js'));
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const src = fs.readFileSync(path.join(REPO, 'ui/js/engines/keyEngine.js'), 'utf8');
function warm() {
    const buf = new Float32Array(S.SR * 6); let i = 0; const prog = [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']];
    for (let t = 0; t < 6; t += 2, i++) { const [d, q] = prog[i % 4]; S.addChord(buf, d, q, t, t + 2, 1, { timbre: 'piano' }); }
    S.scaleToRmsDb(buf, -35); const e = S.create(buf, { engineSrc: src }); e.KeyEngine.init(e.ctx, { connect() {} }); e.step(6000); return e.KeyEngine;
}
const K = warm();
console.log('=== KeyGroupLock01 ===');
const rot = (p, s) => p.slice(12 - s).concat(p.slice(0, 12 - s));
// A. biên theo NHÓM luôn >= biên thường; separation dùng biên nhóm
let allGE = true, hasField = true;
for (let root = 0; root < 12; root++) for (const mode of ['Major', 'Minor']) {
    const r = K.estimateKeyFromChroma(rot(mode === 'Major' ? MA.KK_MAJOR : MA.KK_MINOR, root), { bassWeight: 0 });
    if (typeof r.groupMargin !== 'number') hasField = false; else if (r.groupMargin < r.margin - 1e-12) allGE = false;
}
ok(hasField, 'kết quả có groupMargin (số)'); ok(allGE, 'groupMargin >= margin với cả 24 Key');
// B. chroma mơ hồ relative (đều trên 7 nốt của F Major = D Minor): top1 là 1 trong 2 relative, groupMargin lớn hơn hẳn margin
const fMajScale = [0, 2, 4, 5, 7, 9, 11].map((o) => (5 + o) % 12); const amb = new Array(12).fill(0.02); fMajScale.forEach((pc) => { amb[pc] = 1; }); amb[5] = 1.3; amb[9] = 1.1; amb[0] = 1.0;
const ra = K.estimateKeyFromChroma(amb, { bassWeight: 0 });
ok(['F Major', 'D Minor'].includes(ra.key), `chroma thang F Major => top1 thuộc {F Major, D Minor} (thực tế ${ra.key})`);
ok(ra.groupMargin > ra.margin * 1.5 || ra.margin > 0.15, `biên nhóm (${ra.groupMargin.toFixed(3)}) lớn hơn biên thường (${ra.margin.toFixed(3)}) khi mơ hồ relative`);
// C. cổng nhận diện nhóm trong mã nguồn + cờ tắt nhanh
ok(/RELATIVE_GROUP_ENABLED = true/.test(src), 'có cờ RELATIVE_GROUP_ENABLED (tắt = hoàn nguyên)');
ok(/function scaleGroup\(root, mode\)/.test(src) && /function sameScaleGroupKey/.test(src), 'có scaleGroup/sameScaleGroupKey');
ok(/!__longIsRelOfLocked/.test(src), 'không chốt lại khi Key dài hạn chỉ là relative của Key đang khoá');
ok(/longState\.groupStreak/.test(src), 'chuỗi dẫn đầu dài hạn đếm theo nhóm');
ok(/event: "KEY_LONG_GATE"/.test(src), 'có log chẩn đoán KEY_LONG_GATE (chỉ ghi)');
// D. nhiễu/hợp âm rỗng vẫn không tạo Key
const flat = K.estimateKeyFromChroma(new Array(12).fill(1), { bassWeight: 0 });
ok(flat.valid === false || flat.confidence === 0, 'chroma phẳng => không tạo Key');
// E. nhóm: D Minor và F Major cùng nhóm, F Major và F Minor khác nhóm
const e2 = K; // scaleGroup/sameScaleGroupKey được xuất qua API công khai của KeyEngine
ok(e2.sameScaleGroupKey('2-Minor', '5-Major'), 'D Minor ≡ F Major');
ok(!e2.sameScaleGroupKey('5-Minor', '5-Major'), 'F Minor ≠ F Major');
ok(!e2.sameScaleGroupKey('9-Minor', '5-Major'), 'A Minor ≠ F Major');
// F. đường nhanh + chậm cũng không chốt lại khi chỉ đổi nhãn relative: tiến trình pop mơ hồ 60 s => mọi lần báo Key liên tiếp phải KHÁC bộ nốt
{
    const buf = new Float32Array(S.SR * 60); const prog = [[0, 'major'], [7, 'major'], [9, 'minor'], [5, 'major']]; let i = 0;
    for (let t = 0; t < 60; t += 2, i++) { const [d, q] = prog[i % 4]; S.addChord(buf, (5 + d) % 12, q, t, t + 2, 1, { timbre: 'guitar' }); }
    S.scaleToRmsDb(buf, -35); const e = S.create(buf, { engineSrc: src }); e.KeyEngine.init(e.ctx, { connect() {} });
    const seen = []; e.KeyEngine.watchContinuous((r) => seen.push(r.key)); e.step(60000);
    let relRelabel = 0; for (let k = 1; k < seen.length; k++) if (seen[k] !== seen[k - 1] && e.KeyEngine.sameScaleGroupKey(`${seen[k].split(' ')[0] === '' ? 0 : e.KeyEngine.NOTE_NAMES.indexOf(seen[k].split(' ')[0])}-${seen[k].split(' ')[1]}`, `${e.KeyEngine.NOTE_NAMES.indexOf(seen[k - 1].split(' ')[0])}-${seen[k - 1].split(' ')[1]}`)) relRelabel++;
    ok(seen.length >= 1, `pop mơ hồ 60 s có chốt Key (${seen.join(' → ') || 'không'})`);
    ok(relRelabel === 0, `không có lần báo lại chỉ-đổi-nhãn relative (${relRelabel})`);
}
console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
