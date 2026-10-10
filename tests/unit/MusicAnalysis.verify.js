/**
 * MusicAnalysis.verify.js — TASK AI-ALG-01. Test OFFLINE trên nhạc TỔNG HỢP có đáp án
 * (tests/helpers/synthMusic.js). Đây KHÔNG phải bằng chứng trên nhạc thật.
 */
const fs = require('fs'), path = require('path');
const MA = require('../../ui/js/engines/musicAnalysis.js');
const { render } = require('../helpers/synthMusic.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };

console.log('\n== 1. KEY: 24 khoảng khoá (12 Major + 12 Minor), nhạc sạch 30s ==');
let good = 0, N = 0;
for (const prog of ['major', 'minor']) for (let root = 0; root < 12; root++) {
    const r = render({ root, prog, bpm: 120, seconds: 30, seed: root + 1 });
    const k = MA.detectKey(r.pcm, r.sr);
    N++; if (k.status === 'OK' && k.root === root && k.mode === r.truth.mode) good++;
}
ok(good === N, `đúng ${good}/${N} khoá, status OK`);

console.log('\n== 2. KEY khó: nhiễu 0.05, lệch tuning ±36 cent, 15s, có/không bass ==');
let g2 = 0, conf2 = 0, n2 = 0, seed = 100;
for (const prog of ['major', 'minor']) for (let root = 0; root < 12; root++) {
    const c = { root, prog, seconds: 15, noise: 0.05, bass: root % 2 === 0, tuningCents: (root % 5 - 2) * 18, bpm: 100 + root * 7, seed: seed++ };
    const r = render(c), k = MA.detectKey(r.pcm, r.sr);
    n2++; if (k.root === root && k.mode === r.truth.mode) g2++; else if (k.status === 'OK') conf2++;
}
ok(g2 / n2 >= 0.9, `độ chính xác ${g2}/${n2} >= 90%`);
ok(conf2 === 0, `sai mà vẫn status OK (tự tin sai) = ${conf2} (phải 0)`);

console.log('\n== 3. KEY mơ hồ có chủ đích (Am-F-C-G): không được tự tin ra khoá thứ ba ==');
{
    let bad = 0;
    for (const root of [0, 2, 5, 7, 9]) {
        const r = render({ root, prog: 'popLoop', seconds: 30, seed: 7 + root });
        const k = MA.detectKey(r.pcm, r.sr);
        const cMajor = (root) % 12, aMinor = (root + 9) % 12; // C major (root) hoặc relative minor
        const inPair = (k.root === cMajor && k.mode === 'major') || (k.root === aMinor && k.mode === 'minor');
        if (!(inPair || k.status !== 'OK')) bad++;
    }
    ok(bad === 0, `không có kết quả OK nằm ngoài cặp relative hợp lý (bad=${bad})`);
}

console.log('\n== 4. KEY: không đủ dữ liệu => INSUFFICIENT, không ép chọn ==');
{
    const sr = 22050;
    ok(MA.detectKey(new Float32Array(sr * 30), sr).status === 'INSUFFICIENT', 'im lặng hoàn toàn');
    const noise = new Float32Array(sr * 30); let s = 5; for (let i = 0; i < noise.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; noise[i] = 0.3 * ((s / 4294967296) * 2 - 1); }
    const kn = MA.detectKey(noise, sr);
    ok(kn.status === 'INSUFFICIENT' || kn.status === 'AMBIGUOUS', `nhiễu trắng không ra OK (status=${kn.status})`);
    const short = render({ seconds: 3, seed: 3 });
    ok(MA.detectKey(short.pcm, short.sr).status === 'INSUFFICIENT', 'quá ngắn (3s) => INSUFFICIENT');
    ok(MA.detectKey(new Float32Array(0), sr).status === 'INSUFFICIENT', 'mảng rỗng không throw');
}

console.log('\n== 5. BPM: tempo 70–190 ==');
{
    let exact = 0, resolvable = 0, n = 0, within = 0, nWithin = 0; const rows = [];
    for (const bpm of [70, 80, 92, 100, 110, 120, 128, 140, 150, 160, 174, 190]) {
        const r = render({ bpm, root: bpm % 12, prog: bpm % 2 ? 'minor' : 'major', seconds: 30, seed: bpm });
        const b = MA.detectBpm(r.pcm, r.sr), near = (v) => Math.abs(v - bpm) / bpm < 0.02;
        n++;
        const isExact = b.bpm && near(b.bpm);
        const inCand = b.octaveCandidates.some((c) => near(c.bpm));
        if (isExact) exact++;
        if (isExact || (b.octaveAmbiguous && inCand)) resolvable++;
        if (bpm >= 80 && bpm <= 160) { nWithin++; if (isExact) within++; }
        rows.push(`${bpm}->${b.bpm ? b.bpm.toFixed(1) : b.status}${b.octaveAmbiguous ? '(octave?)' : ''}`);
    }
    console.log('   ', rows.join(' '));
    ok(resolvable === n, `mọi tempo: đúng, hoặc (cờ octaveAmbiguous + ứng viên đúng nằm trong danh sách): ${resolvable}/${n}`);
    ok(within / nWithin >= 0.8, `trong 80–160 BPM chọn đúng octave: ${within}/${nWithin} (>= 80%)`);
    ok(exact >= 8, `đúng tuyệt đối ${exact}/${n} (nửa/gấp đôi ở ngoài vùng ưu tiên được báo qua octaveAmbiguous)`);
}

console.log('\n== 6. BPM: lưới beat đúng pha + khoảng cách ==');
{
    const r = render({ bpm: 120, seconds: 30, seed: 11 }), b = MA.detectBpm(r.pcm, r.sr);
    const T = 60 / 120;
    const gaps = b.beats.slice(1).map((v, i) => v - b.beats[i]);
    ok(gaps.every((g) => Math.abs(g - 60 / b.bpm) < 0.01), 'khoảng cách beat nhất quán theo bpm ước lượng');
    // Pha: beat thật ở bội của T (kick/snare). Cho phép đáp án lệch 1 beat nguyên nên chỉ xét dư theo T.
    const off = b.beats.map((t) => { const m = t % T; return Math.min(m, T - m); });
    off.sort((a, c) => a - c);
    ok(off[Math.floor(off.length / 2)] < 0.05, `độ lệch pha trung vị ${(off[Math.floor(off.length / 2)] * 1000).toFixed(0)} ms < 50 ms`);
}

console.log('\n== 7. BPM: im lặng / quá ngắn ==');
{
    const sr = 22050;
    ok(MA.detectBpm(new Float32Array(sr * 20), sr).status === 'INSUFFICIENT', 'im lặng => INSUFFICIENT, bpm=null');
    ok(MA.detectBpm(new Float32Array(sr * 20), sr).bpm === null, 'bpm null khi im lặng');
    const sh = render({ seconds: 4, seed: 2 });
    ok(MA.detectBpm(sh.pcm, sh.sr).status === 'INSUFFICIENT', 'quá ngắn => INSUFFICIENT');
}

console.log('\n== 8. Hội tụ theo thời gian (analyzeProgressive) ==');
{
    const r = render({ bpm: 128, root: 7, prog: 'major', seconds: 40, seed: 21 });
    const p = MA.analyzeProgressive(r.pcm, r.sr, { stepSeconds: 4, startSeconds: 8 });
    console.log('    key hội tụ tại', p.keyConvergedAtSeconds, 's; BPM hội tụ tại', p.bpmConvergedAtSeconds, 's');
    ok(p.keyConvergedAtSeconds !== null && p.keyConvergedAtSeconds <= 16, 'Key hội tụ <= 16s (nhạc tổng hợp)');
    ok(p.bpmConvergedAtSeconds !== null && p.bpmConvergedAtSeconds <= 16, 'BPM hội tụ <= 16s (nhạc tổng hợp)');
}

console.log('\n== 9. Confidence phản ánh độ chắc chắn đo được (bin theo confidence) ==');
{
    const rows = [];
    let seed = 500;
    for (const prog of ['major', 'minor']) for (let root = 0; root < 12; root++) for (const noise of [0.02, 0.15, 0.4]) {
        const r = render({ root, prog, seconds: 12, noise, bass: root % 3 !== 0, seed: seed++, bpm: 90 + root * 5 });
        const k = MA.detectKey(r.pcm, r.sr);
        rows.push({ conf: k.confidence, right: k.root === root && k.mode === r.truth.mode });
    }
    const hi = rows.filter((x) => x.conf >= 0.8), lo = rows.filter((x) => x.conf < 0.8);
    const acc = (a) => (a.length ? a.filter((x) => x.right).length / a.length : NaN);
    console.log(`    conf>=0.8: n=${hi.length} chính xác=${(acc(hi) * 100).toFixed(0)}% | conf<0.8: n=${lo.length} chính xác=${isNaN(acc(lo)) ? 'n/a' : (acc(lo) * 100).toFixed(0) + '%'}`);
    ok(hi.length > 0 && acc(hi) >= 0.95, 'nhóm confidence cao đạt >= 95% chính xác');
    ok(lo.length === 0 || acc(lo) <= acc(hi), 'nhóm confidence thấp không chính xác hơn nhóm cao');
    ok(rows.every((x) => x.conf >= 0 && x.conf <= 1), 'confidence luôn trong [0,1]');
}

console.log('\n== 10. Streaming analyzer (ring buffer) ==');
{
    const r = render({ bpm: 120, root: 2, prog: 'major', seconds: 30, seed: 9 });
    const a = MA.createStreamingAnalyzer(r.sr, { maxSeconds: 20 });
    for (let i = 0; i < r.pcm.length; i += 1024) a.push(r.pcm.subarray(i, Math.min(r.pcm.length, i + 1024)));
    ok(Math.abs(a.seconds() - 20) < 0.01, 'bộ đệm giữ tối đa 20s');
    const res = a.analyze();
    ok(res.key.status === 'OK' && res.key.root === 2, 'phân tích trên bộ đệm ra đúng khoá D Major');
    a.reset(); ok(a.seconds() === 0, 'reset() xoá bộ đệm');
}

console.log('\n== 11. Ranh giới kiến trúc (static) ==');
{
    const src = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/musicAnalysis.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/getUserMedia|AudioContext|document\.|navigator\.|require\(|fetch\(|XMLHttpRequest/.test(src), 'module không mở thiết bị / không DOM / không mạng / không require');
    ok(!/api[_-]?key|secret|token|password/i.test(src), 'không chứa chuỗi khoá/bí mật');
    const r = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
    const shadow = (r.match(/function attachMusicAnalysisShadow[\s\S]*?\n\}\n/) || [''])[0];
    ok(shadow.length > 0, 'có hàm attachMusicAnalysisShadow trong renderer.js');
    ok(!/getUserMedia|new AudioContext|createMicSource|__micSource/.test(shadow), 'shadow KHÔNG mở thiết bị mới và KHÔNG dùng MIC');
    ok(!/BPMEngine|KeyEngine|ModEngine|bpmValue"\)\.textContent\s*=|currentKey"\)\.textContent\s*=/.test(shadow.replace(/document\.getElementById\("currentKey"\)\?\.textContent/g, '').replace(/document\.getElementById\("bpmValue"\)\?\.textContent/g, '')), 'shadow không gọi engine hiện có và không ghi đè chữ BPM/Key');
    ok(/aiAnalysisShadowEnabled/.test(shadow), 'shadow chỉ chạy khi bật setting aiAnalysisShadowEnabled (mặc định tắt)');
    ok(/data\.currentKey !== "LISTENING"/.test(r), 'Guard Auto-Tune "LISTENING" còn nguyên');
    ok(!/\.pyd/.test(src), 'module không tham chiếu binary .pyd');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
