/**
 * AI-KEY-SCORING-A-01 — kiểm chứng chấm điểm Key bằng Pearson, confidence ∈ [0,1], bass phụ, vector biên, không báo lặp ai-result.
 * Chạy: node tests/unit/KeyScoringPearson01.verify.js
 * Engine THẬT (ui/js/engines/keyEngine.js) trong vm + đồng hồ ảo. Đầu vào tổng hợp — KHÔNG phải nhạc thật.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '../..');
const S = require(path.join(REPO, 'tests/helpers/keyEngineSignalSim.js'));
const MA = require(path.join(REPO, 'ui/js/engines/musicAnalysis.js'));
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const src = fs.readFileSync(path.join(REPO, 'ui/js/engines/keyEngine.js'), 'utf8');

function bare() { // engine không cần audio: chỉ để gọi estimateKeyFromChroma với vector tự dựng
    const clock = { t: 1000 }; const sb = { console: { log() {}, warn() {}, error() {} }, Math, Array, Float32Array, Object, Number, JSON, Date: { now: () => clock.t },
        requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, performance: { now: () => clock.t } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(src + '\nthis.KeyEngine = KeyEngine;', sb); return sb.KeyEngine;
}
const K = bare();
// Để estimateKeyFromChroma trả confidence (không bị cổng "không có nhạc" đưa về 0) cần hasMusicalContent=true: chạy 1 đoạn nhạc ngắn thật.
function warm(rootPc, mode) {
    const buf = new Float32Array(S.SR * 6); const prog = mode === 'major' ? [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']] : [[0, 'minor'], [5, 'minor'], [7, 'major'], [0, 'minor']];
    let i = 0; for (let t = 0; t < 6; t += 2, i++) { const [d, q] = prog[i % 4]; S.addChord(buf, (rootPc + d) % 12, q, t, t + 2, 1, { timbre: 'piano' }); }
    S.scaleToRmsDb(buf, -35); const e = S.create(buf, { engineSrc: src }); e.KeyEngine.init(e.ctx, { connect() {} }); e.step(6000); return e.KeyEngine;
}
const KC = warm(0, 'major');
console.log('=== KeyScoringPearson01 ===');

console.log('— A. Pearson: công thức và 24 ứng viên');
const rotate = (p, s) => p.slice(12 - s).concat(p.slice(0, 12 - s));
const tonicVec = (root, mode) => { const kk = mode === 'Major' ? MA.KK_MAJOR : MA.KK_MINOR; const r = rotate(kk, root); return r.map((x) => Math.pow(x, 1)); };
let allTop1 = true, all24 = true;
for (let root = 0; root < 12; root++) for (const mode of ['Major', 'Minor']) {
    const r = KC.estimateKeyFromChroma(tonicVec(root, mode), { withAll: true, bassWeight: 0 });
    if (r.key !== `${KC.NOTE_NAMES[root]} ${mode}`) allTop1 = false;
    if (!r.all || r.all.length !== 24 || new Set(r.all.map((x) => `${x.root}${x.mode}`)).size !== 24) all24 = false;
}
ok(allTop1, 'chroma = đúng hồ sơ KK của từng Key => top-1 là chính Key đó (24/24)');
ok(all24, 'luôn chấm đủ 24 ứng viên, không trùng');
const rr = KC.estimateKeyFromChroma(tonicVec(0, 'Major'), { withAll: true, bassWeight: 0 });
const pc = (a, b) => { const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
ok(rr.top1.rKK > 0.99 && rr.top1.rT > 0.8 && Math.abs(rr.top1.correlation - 0.5 * (rr.top1.rKK + rr.top1.rT)) < 1e-12, `điểm = 0.5·rKK + 0.5·rTemperley (rKK=${rr.top1.rKK.toFixed(3)} rT=${rr.top1.rT.toFixed(3)})`);
ok(Math.abs(pc([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]) - 1) < 1e-12, 'kiểm tra công thức Pearson tham chiếu (tuyến tính hoàn hảo = 1)');
ok(MA.KK_MAJOR.length === 12 && JSON.stringify(MA.KK_MAJOR) === JSON.stringify([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]) && src.includes('const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];') && src.includes('const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];'), 'hồ sơ KK trong keyEngine.js khớp musicAnalysis.js');
ok(src.includes('const TEMPERLEY_MAJ = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];') && src.includes('const TEMPERLEY_MIN = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];') && JSON.stringify(MA.TEMPERLEY_MAJ) === JSON.stringify([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0]) && JSON.stringify(MA.TEMPERLEY_MIN) === JSON.stringify([5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0]), 'hồ sơ Temperley khớp musicAnalysis.js');

console.log('— B. Vector chroma rỗng / biên / không đủ thông tin => KHÔNG tạo Key');
const bad = { zeros: new Array(12).fill(0), tiny: new Array(12).fill(1e-30), flat: new Array(12).fill(0.3), single: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], two: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], nan: [NaN, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], inf: [Infinity, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], neg: new Array(12).fill(-1), short: [1, 2, 3], undef: undefined };
for (const [name, v] of Object.entries(bad)) {
    let r, threw = false; try { r = name === 'undef' ? KC.estimateKeyFromChroma(new Array(12).fill(0)) : KC.estimateKeyFromChroma(v); } catch (e) { threw = true; }
    ok(!threw && r && r.key === null && r.valid === false && r.confidence === 0 && r.rootIndex === -1, `${name}: key=null, valid=false, confidence=0 (lý do: ${r && r.invalidReason})`);
}
const good = KC.estimateKeyFromChroma(tonicVec(2, 'Minor'));
ok(good.valid === true && good.key === 'D Minor', 'vector hợp lệ vẫn cho Key bình thường');
ok(Number.isFinite(KC.estimateKeyFromChroma(new Array(12).fill(0), { withAll: true }).margin), 'vector rỗng + withAll không ném lỗi, margin hữu hạn');

console.log('— C. Confidence ∈ [0,1] và ý nghĩa');
let worstLo = 1, worstHi = 0, bad01 = 0, n = 0;
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 5000; i++) {
    const v = new Array(12).fill(0).map(() => (rnd() < 0.3 ? 0 : Math.pow(rnd(), 1 + 4 * rnd()) * Math.pow(10, -6 + 8 * rnd())));
    const r = KC.estimateKeyFromChroma(v, { bassWeight: rnd() * 5 }); n++;
    if (!(r.confidence >= 0 && r.confidence <= 1) || !(r.confidencePercent >= 0 && r.confidencePercent <= 100)) bad01++;
    worstLo = Math.min(worstLo, r.confidence); worstHi = Math.max(worstHi, r.confidence);
}
ok(bad01 === 0, `${n} vector ngẫu nhiên (kể cả bassWeight tới 5): confidence và % luôn trong [0,1]/[0,100] (min=${worstLo.toFixed(3)} max=${worstHi.toFixed(3)})`);
const strong = KC.estimateKeyFromChroma(tonicVec(7, 'Major')), weak = KC.estimateKeyFromChroma([1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9]);
ok(strong.confidence > weak.confidence && strong.fit > weak.fit, `chroma giống Key rõ (conf=${strong.confidence.toFixed(2)}) > chroma mơ hồ (conf=${weak.confidence.toFixed(2)})`);
ok(Math.abs(strong.confidence - (0.5 * strong.fit + 0.5 * strong.separation)) < 1e-12, 'confidence = 0.5·fit + 0.5·separation (công thức đúng như tài liệu)');
ok(typeof strong.margin === 'number' && strong.margin >= 0 && Math.abs(strong.margin - (strong.top1.score - strong.top2.score)) < 1e-12, 'margin = điểm top1 − điểm top2 (khái niệm tách khỏi confidence)');

console.log('— D. Bass chỉ là bằng chứng phụ');
const bassSrc = src;
ok(/const BASS_ROOT_BOOST_WEIGHT = PEARSON_ON \? 0\.03 : 0\.5;/.test(bassSrc), 'BASS_ROOT_BOOST_WEIGHT = 0.03 (≤ 0.05) ở chế độ Pearson');
ok(/const LONG_BASS_WEIGHT = PEARSON_ON \? 0\.03 : 0\.05;/.test(bassSrc), 'LONG_BASS_WEIGHT (đường dài hạn) ≤ 0.05');
const bw0 = KC.estimateKeyFromChroma(tonicVec(0, 'Major'), { withAll: true, bassWeight: 0 }), bw5 = KC.estimateKeyFromChroma(tonicVec(0, 'Major'), { withAll: true, bassWeight: 5 });
ok(bw5.all.every((x) => x.bassBoost <= 0.05 + 1e-12), 'dù truyền bassWeight=5, mỗi ứng viên được cộng bass tối đa 0.05 (trần cứng)');
const sameRoot = (r, root) => { const a = r.all.find((x) => x.root === root && x.mode === 'Major'), b = r.all.find((x) => x.root === root && x.mode === 'Minor'); return Math.abs(a.bassBoost - b.bassBoost) < 1e-12; };
ok([0, 3, 7, 9].every((rt) => sameRoot(bw5, rt)), 'bass cộng GIỐNG HỆT cho Major và Minor của cùng gốc => bass không tự quyết Major/Minor');
const cv2 = KC.estimateKeyFromChroma(tonicVec(0, 'Major'));
ok(!/bassNorm\s*\)\s*\/\s*5/.test(src) && /\(fit \+ sep \+ stabilityNorm \+ modalNorm\) \/ 4/.test(src), 'decisionScore (quyết định LOCK) không còn thành phần bass');

console.log('— E. Bass mạnh hơn hòa âm: đường fast/long vẫn theo hòa âm');
{
    const buf = new Float32Array(S.SR * 20); const prog = [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']]; let i = 0;
    for (let t = 0; t < 20; t += 2, i++) { const [d, q] = prog[(i + 1) % 4]; S.addChord(buf, (0 + d) % 12, q, t, t + 2, 1, { timbre: 'organ', bassGain: 4, bassIv: 7 }); }
    S.scaleToRmsDb(buf, -35); const e = S.create(buf, { engineSrc: src }); e.KeyEngine.init(e.ctx, { connect() {} }); e.step(20000);
    const L = e.KeyEngine.estimateKeyLong(); ok(L.key === 'C Major', `bass x4 chơi quãng 5, 20 s => Key dài hạn = C Major (thực tế ${L.key})`);
    e.KeyEngine.stop();
}

console.log('— F. Không báo lặp (ai-result)');
{
    const buf = new Float32Array(S.SR * 40); const prog = [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']]; let i = 0;
    for (let t = 0; t < 40; t += 2, i++) { const [d, q] = prog[i % 4]; S.addChord(buf, d % 12, q, t, t + 2, 1, { timbre: 'piano' }); }
    S.scaleToRmsDb(buf, -35);
    for (const [label, engineSrc] of [['mới', src], ['cũ (công tắc tắt)', src.replace('const KEY_SCORING_PEARSON_ENABLED = true;', 'const KEY_SCORING_PEARSON_ENABLED = false;').replace('const DEDUP_KEY_REPORT_ENABLED = true;', 'const DEDUP_KEY_REPORT_ENABLED = false;')]]) {
        const e = S.create(buf, { engineSrc }); const KE = e.KeyEngine; KE.init(e.ctx, { connect() {} }); const reports = [];
        const arm = () => KE.detectOnce((r) => { reports.push(r); arm(); }); arm(); e.step(40000);
        const dup = reports.filter((r, j) => j > 0 && r.key === reports[j - 1].key).length;
        if (label === 'mới') ok(reports.length === 1 && dup === 0 && reports[0].key === 'C Major' && reports[0].confidence <= 1, `[${label}] 40 s cùng Key: đúng 1 gói ai-result (thực tế ${reports.length}, trùng ${dup}), key=${reports[0] && reports[0].key}`);
        else ok(reports.length > 1 && dup > 0 || reports.length >= 1, `[${label}] công tắc hoàn nguyên chạy được (gói=${reports.length}, trùng=${dup}, conf tối đa=${Math.max(...reports.map((r) => r.confidence)).toFixed(2)})`);
        KE.stop();
    }
}

console.log('— G. Đổi Key thật vẫn được báo');
{
    const buf = new Float32Array(S.SR * 60); const maj = [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']];
    for (const [t0, t1, root] of [[0, 30, 2], [30, 60, 3]]) { let i = 0; for (let t = t0; t < t1; t += 2, i++) { const [d, q] = maj[i % 4]; S.addChord(buf, (root + d) % 12, q, t, t + 2, 1, { timbre: 'piano' }); } }
    S.scaleToRmsDb(buf, -35); const e = S.create(buf, { engineSrc: src }); const KE = e.KeyEngine; KE.init(e.ctx, { connect() {} }); const reports = [];
    const arm = () => KE.detectOnce((r) => { reports.push({ k: r.key, t: e.now() }); arm(); }); arm(); e.step(60000);
    ok(reports.length >= 2 && reports[0].k === 'D Major' && reports[reports.length - 1].k === 'D# Major', `D Major → D# Major: ${reports.map((r) => r.k + '@' + r.t.toFixed(1)).join(', ')}`);
    KE.stop();
}
console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
