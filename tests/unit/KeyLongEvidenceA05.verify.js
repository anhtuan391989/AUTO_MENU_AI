/**
 * AI-ALG-05 — Kiểm chứng bằng chứng Key dài hạn (nhạc pop TỔNG HỢP, KHÔNG phải nhạc thật).
 * Chạy: node tests/unit/KeyLongEvidenceA05.verify.js
 * Engine thật trong vm + đồng hồ ảo. Kiểm: (1) khoá ổn định (ít lần đổi), (2) cuối bài đúng tonic,
 * (3) outOfScaleRatio phân biệt nốt trong/ngoài thang, (4) estimateKeyLong có mặt.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const { render, PROGS } = require(path.join(REPO, 'tests/helpers/synthPop.js'));
const { mkAnalyser, sandbox, loadEngine } = require(path.join(REPO, 'tools/algbench/lib.js'));
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
function run(mode, prog, root, secs) {
    const sr = 22050, r = render({ sr, seconds: secs + 1, mode, prog, root, seed: root * 13 + prog.length + 5 }); const clock = { t: 1000 };
    const S = sandbox(clock, () => mkAnalyser(r.pcm, sr, 8192, clock, 1000), sr); loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine');
    const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} }); const locks = [];
    K.watchContinuous((res) => locks.push(res.key)); S.step(secs * 1000);
    const out = { locks, last: K.estimateKeyFromChroma(), long: typeof K.estimateKeyLong === 'function' ? K.estimateKeyLong() : null, K, root: r.truth.root };
    return out;
}
console.log('=== KeyLongEvidenceA05 (synthetic) ===');
const prog = 'I-V-vi-IV'; // chuỗi hợp âm pop phổ biến; trước thay đổi dao động C Major <-> A Minor (8 lần/40 s)
const a = run('major', prog, 0, 40);
ok(typeof a.K.estimateKeyLong === 'function' && typeof a.K.outOfScaleRatio === 'function', 'API estimateKeyLong/outOfScaleRatio có mặt');
ok(a.locks.length <= 3, `số lần đổi khoá ≤ 3 trong 40 s (thực tế ${a.locks.length}: ${a.locks.join(' > ')})`);
ok(!!a.long && (a.long.rootIndex === 0 || a.long.rootIndex === 9), `Key dài hạn đúng tonic hoặc relative (root=${a.long && a.long.rootIndex})`);
const inS = a.K.outOfScaleRatio(0, 'Major', 'short'), outS = a.K.outOfScaleRatio(1, 'Major', 'short');
ok(inS !== null && outS !== null && inS < outS, `ngoài-thang(C major)=${inS && inS.toFixed(3)} < ngoài-thang(C# major)=${outS && outS.toFixed(3)}`);
console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
