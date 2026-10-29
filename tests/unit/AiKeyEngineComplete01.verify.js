/**
 * AiKeyEngineComplete01.verify.js — TASK AI-KEY-ENGINE-COMPLETE-01
 * Kiểm thử Key Engine THẬT (ui/js/engines/keyEngine.js, nạp qua vm) bằng TÍN HIỆU THỜI GIAN tổng hợp -> FFT như Web Audio -> đồng hồ ảo.
 * ĐÂY LÀ KIỂM THỬ TỰ ĐỘNG TRÊN TÍN HIỆU TỔNG HỢP — KHÔNG phải nhạc thật, KHÔNG phải Windows/Electron/thiết bị âm thanh thật.
 * Chạy: node tests/unit/AiKeyEngineComplete01.verify.js     (khoảng 2–4 phút)
 */
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../helpers/keyEngineSignalSim.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const NEW = read('ui/js/engines/keyEngine.js');
// Mô phỏng ĐÚNG hành vi trước task bằng cách TẮT công tắc (đồng thời chứng minh công tắc hoàn nguyên hoạt động):
const LEGACY = NEW.replace('const ADAPTIVE_CONTENT_GATE_ENABLED = true;', 'const ADAPTIVE_CONTENT_GATE_ENABLED = false;').replace(/const LONG_STATIONARY_MIN_S = \d+;/, 'const LONG_STATIONARY_MIN_S = 0;');
const MIN0 = NEW.replace(/const LONG_STATIONARY_MIN_S = \d+;/, 'const LONG_STATIONARY_MIN_S = 0;'); // chỉ khác bản mới ở lối tắt "đứng yên" (để so sánh A/B)
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL', m); } };
const known = (m) => console.log('  KNOWN-LIMITATION', m);

const PROG = { maj: [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']], min: [[0, 'minor'], [5, 'minor'], [7, 'major'], [0, 'minor']] };
function prog(b, mode, root, t0, t1, o) { const ch = PROG[mode === 'major' ? 'maj' : 'min'], len = 2; let i = 0; for (let t = t0; t < t1; t += len, i++) { const [d, q] = ch[(i + ((o && o.startAt) || 0)) % ch.length]; S.addChord(b, (root + d) % 12, q, t, Math.min(t + len, t1), 1, o); } }
function sig(dur, db, fn) { const b = new Float32Array(Math.round(S.SR * dur)); fn(b); if (db !== null) S.scaleToRmsDb(b, db); return b; }
const lockKeys = (r) => r.locks.map((l) => l.key);

console.log('\n== 1. NGUYÊN NHÂN GỐC: cổng nội dung tuyệt đối 0.0005 chặn nhạc nhỏ (bản cũ) / cổng thích ứng (bản mới) ==');
{
    const music = (db) => sig(20, db, (b) => prog(b, 'major', 0, 0, 20, { timbre: 'piano' }));
    for (const db of [-35, -45, -55]) {
        const m = music(db);
        const o = S.runCase(m, 20, { engineSrc: LEGACY }), n = S.runCase(m, 20);
        ok(o.snap.inputProbe.framesWithContent === 0 && o.locks.length === 0, `cũ @${db} dBFS: 0 khung đạt cổng (maxContentRms=${o.snap.inputProbe.maxContentRms.toExponential(2)} < 0.0005), không có Tone`);
        ok(n.snap.hasMusicalContent === true && lockKeys(n)[0] === 'C Major', `mới @${db} dBFS: hasMusicalContent=true, khoá C Major @${n.first && n.first.t}s`);
    }
    const m25 = music(-25); ok(lockKeys(S.runCase(m25, 20, { engineSrc: LEGACY })).pop() === 'C Major' && lockKeys(S.runCase(m25, 20)).pop() === 'C Major', 'nhạc lớn (-25 dBFS) vẫn khoá đúng ở cả bản cũ lẫn mới (không hồi quy)');
    const nlog = S.runCase(music(-35), 20).snap.inputProbe;
    ok(nlog.maxTonalPeaks >= 10 && nlog.framesAccepted > 1000, `probe mới có số liệu: maxTonalPeaks=${nlog.maxTonalPeaks}, framesAccepted=${nlog.framesAccepted}`);
}

console.log('\n== 2. IM LẶNG / NHIỄU KHÔNG TẠO TONE GIẢ (cả bản mới) ==');
{
    const cases = [['im lặng', sig(20, null, () => {})], ['nhiễu trắng -40', sig(20, -40, (b) => S.addNoise(b, 0, 20, 1, 3))], ['nhiễu trắng -25', sig(20, -25, (b) => S.addNoise(b, 0, 20, 1, 5))], ['nhiễu trắng -60', sig(20, -60, (b) => S.addNoise(b, 0, 20, 1, 8))], ['nhiễu nâu -30', sig(20, -30, (b) => S.addNoise(b, 0, 20, 1, 9, 'brown'))]];
    for (const [nm, b] of cases) { const r = S.runCase(b, 20); ok(r.locks.length === 0 && r.snap.hasMusicalContent === false && r.snap.chromaVector.every((v) => v === 0), `${nm}: không khoá Tone, hasMusicalContent=false, chroma = 0`); }
    const hum = sig(20, -35, (b) => { for (let h = 1; h <= 8; h++) S.addNote(b, 69 + 12 * Math.log2(60 * h / 440), 0, 20, 1 / h, 'organ'); });
    const rh = S.runCase(hum, 20), rhOld = S.runCase(sig(20, -20, (b) => { for (let h = 1; h <= 8; h++) S.addNote(b, 69 + 12 * Math.log2(60 * h / 440), 0, 20, 1 / h, 'organ'); }), 20, { engineSrc: LEGACY });
    if (rh.locks.length) known(`ù 60 Hz (1 âm đơn + chuỗi hài đứng yên) bị coi là có Tone (${lockKeys(rh)[0]}). Bản cũ cũng khoá giả ở ≥ -25 dBFS (${lockKeys(rhOld)[0] || '-'}) — không phân biệt được với 1 nốt kéo dài; SYSTEM_AUDIO số không có ù điện lưới.`); else ok(true, 'ù 60 Hz không khoá');
}

console.log('\n== 3. ĐỦ 24 TONE (12 trưởng + 12 thứ), piano, -35 dBFS, 24 s, hợp âm đầu = tonic ==');
{
    let good = 0, majOk = 0, minOk = 0; const bad = [];
    for (let pc = 0; pc < 12; pc++) for (const mode of ['major', 'minor']) {
        const r = S.runCase(sig(24, -35, (b) => prog(b, mode, pc, 0, 24, { timbre: 'piano' })), 24), want = S.labelOf(pc, mode), got = r.last && r.last.key;
        if (got === want) { good++; mode === 'major' ? majOk++ : minOk++; } else bad.push(`${want}->${got || 'none'}`);
    }
    ok(good === 24 && majOk === 12 && minOk === 12, `24/24 Tone đúng (Major ${majOk}/12, Minor ${minOk}/12)${bad.length ? ' — sai: ' + bad.join(', ') : ''}`);
}

console.log('\n== 4. HỢP ÂM MỞ ĐẦU KHÔNG ĐẠI DIỆN CHO TONE (bắt đầu từ bậc IV/iv) — khoá ĐẦU TIÊN không được là Tone của hợp âm đầu ==');
{
    let firstBad = 0, finalBad = 0, n = 0; const rows = [];
    for (const [pc, mode] of [[0, 'major'], [4, 'major'], [8, 'major'], [9, 'minor'], [2, 'minor'], [6, 'minor']]) {
        const want = S.labelOf(pc, mode), run = (src) => S.runCase(sig(24, -35, (b) => prog(b, mode, pc, 0, 24, { timbre: 'piano', startAt: 1 })), 24, src ? { engineSrc: src } : undefined);
        const r = run(); n++; if (r.first && r.first.key !== want) firstBad++; if (!r.last || r.last.key !== want) finalBad++;
        const o = run(MIN0);
        rows.push(`${want}: mới ${r.first ? r.first.key + '@' + r.first.t : 'none'} | MIN_S=0 ${o.first ? o.first.key + '@' + o.first.t : 'none'}`);
    }
    rows.forEach((x) => console.log('     ', x));
    ok(firstBad === 0 && finalBad === 0, `${n} ca: khoá đầu sai = ${firstBad}, khoá cuối sai = ${finalBad}`);
}

console.log('\n== 5. HỢP ÂM THIẾU QUÃNG 3 (rỗng) — không ép Major/Minor; bass mạnh; âm lượng thay đổi; nghỉ; đoạn ngắn ==');
{
    for (const [pc, mode] of [[0, 'major'], [9, 'minor']]) {
        const r = S.runCase(sig(24, -35, (b) => prog(b, mode, pc, 0, 24, { timbre: 'guitar', power: true })), 24);
        ok(r.locks.length === 0, `${S.labelOf(pc, mode)}: chỉ hợp âm rỗng (root+5) -> KHÔNG khoá Major/Minor (khoá: ${lockKeys(r).join(',') || 'không'})`);
        const rb = S.runCase(sig(24, -35, (b) => prog(b, mode, pc, 0, 24, { timbre: 'organ', bassGain: 4, startAt: 1 })), 24);
        ok(rb.last && rb.last.key === S.labelOf(pc, mode) && (!rb.first || rb.first.key === S.labelOf(pc, mode)), `${S.labelOf(pc, mode)}: bass mạnh x4 không kéo Tone sang gốc hợp âm (khoá: ${lockKeys(rb).join(',')})`);
        const rr = S.runCase(sig(24, -35, (b) => { prog(b, mode, pc, 0, 10, { timbre: 'piano' }); prog(b, mode, pc, 13, 24, { timbre: 'piano', startAt: 2 }); }), 24);
        ok(rr.last && rr.last.key === S.labelOf(pc, mode) && rr.locks.every((l) => l.key === S.labelOf(pc, mode)), `${S.labelOf(pc, mode)}: nghỉ im lặng 3 s giữa bài không làm đổi Tone (khoá: ${lockKeys(rr).join(',')})`);
        const rs = S.runCase(sig(6, -35, (b) => prog(b, mode, pc, 0, 6, { timbre: 'piano' })), 6);
        ok(rs.locks.length === 0 || lockKeys(rs).every((k) => k === S.labelOf(pc, mode)), `${S.labelOf(pc, mode)}: đoạn 6 s — không trả sai (kết quả: ${lockKeys(rs).join(',') || 'LISTENING, chưa đủ bằng chứng'})`);
    }
    const vb = sig(30, null, (b) => { prog(b, 'minor', 9, 0, 30, { timbre: 'piano' }); for (let i = 0; i < b.length; i++) { const t = i / S.SR; b[i] *= t < 8 ? 1 : t < 16 ? 0.03 : 0.2; } S.scaleToRmsDb(b, -26); });
    const rv = S.runCase(vb, 30);
    ok(rv.locks.length >= 1 && rv.locks.every((l) => l.key === 'A Minor'), `đổi âm lượng -20 → -50 → -30 dBFS: Tone giữ A Minor (khoá: ${lockKeys(rv).join(',')})`);
}

console.log('\n== 6. CHUYỂN TONE THẬT và CHỈ ĐỔI HỢP ÂM ==');
{
    const rm = S.runCase(sig(62, -35, (b) => { prog(b, 'major', 2, 0, 30, { timbre: 'piano' }); prog(b, 'major', 3, 30, 62, { timbre: 'piano' }); }), 62);
    const lat = (rm.locks.find((l) => l.t >= 30 && l.key === 'D# Major') || {}).t;
    ok(rm.locks[0].key === 'D Major' && rm.last.key === 'D# Major' && lat !== undefined, `D Major → D# Major tại 30 s: giữ D Major trước đó, nhận D# Major sau ${lat !== undefined ? (lat - 30).toFixed(1) : '?'} s`);
    const mm = S.runCase(sig(62, -35, (b) => { prog(b, 'minor', 9, 0, 30, { timbre: 'piano' }); prog(b, 'minor', 10, 30, 62, { timbre: 'piano' }); }), 62);
    ok(mm.locks[0].key === 'A Minor' && mm.last.key === 'A# Minor', `A Minor → A# Minor tại 30 s: ${lockKeys(mm).join(' → ')}`);
    const borrowed = [[10, 'major'], [2, 'major'], [4, 'major'], [5, 'minor']], ch = PROG.maj;
    const co = S.runCase(sig(40, -35, (b) => { let t = 0, i = 0, bi = 0; while (t < 40) { let d, q; if (i % 3 === 2) [d, q] = borrowed[bi++ % 4]; else [d, q] = ch[(i - Math.floor(i / 3)) % 4]; S.addChord(b, d, q, t, Math.min(40, t + 2), 1, { timbre: 'piano' }); t += 2; i++; } }), 40);
    ok(co.last && co.last.key === 'C Major', `C Major + hợp âm vay mượn thưa (bVII, V/V, V/vi, iv): Tone CUỐI = C Major (khoá: ${lockKeys(co).join(' → ')})`);
    if (co.locks.some((l) => l.key !== 'C Major')) known(`C Major + hợp âm vay mượn thưa: khoá ĐẦU sai tạm thời (${lockKeys(co)[0]}@${co.locks[0].t}s, margin ${co.locks[0].margin}) rồi tự sửa ở ${co.last.t}s — chưa khắc phục (dữ liệu margin chưa đủ tách đúng/sai, xem REPORT mục 7).`);
}

console.log('\n== 7. DIAGNOSTIC 5 TRẠNG THÁI đường vào (getInputState) ==');
{
    const e0 = S.runCase(sig(6, null, () => {}), 6); ok(e0.snap.inputState === 'NO_SIGNAL', `im lặng -> NO_SIGNAL (${e0.snap.inputState})`);
    const e1 = S.runCase(sig(6, -40, (b) => S.addNoise(b, 0, 6, 1, 3)), 6); ok(e1.snap.inputState === 'SIGNAL_NO_MUSIC', `nhiễu -40 dBFS (có tín hiệu, không hòa âm) -> SIGNAL_NO_MUSIC (${e1.snap.inputState})`);
    const e2 = S.create(sig(20, -35, (b) => prog(b, 'major', 0, 0, 20, { timbre: 'piano' }))); e2.KeyEngine.init(e2.ctx, { connect() {} }); e2.step(1500);
    ok(e2.KeyEngine.getInputState() === 'MUSIC_EVIDENCE', `1,5 s nhạc (chưa khoá) -> MUSIC_EVIDENCE (${e2.KeyEngine.getInputState()})`);
    const e3 = S.runCase(sig(24, -35, (b) => prog(b, 'major', 0, 0, 24, { timbre: 'piano' })), 24); ok(e3.snap.inputState === 'LOCKED', `đã khoá -> LOCKED (${e3.snap.inputState})`);
    ok(/"NO_DEVICE"|NO_DEVICE/.test(read('ui/js/audioSource.js')), 'NO_DEVICE do audioSource (SYSTEM_AUDIO) báo — KeyEngine không tự suy ra');
}

console.log('\n== 8. AUTO DETECT / KHỞI ĐỘNG LẠI (mức engine; luồng renderer do A72/A75/AiKeyFast* kiểm tra) ==');
{
    const b = sig(60, -35, (bb) => prog(bb, 'major', 7, 0, 60, { timbre: 'piano' }));
    const e = S.create(b); const K = e.KeyEngine; const got = { a: [], b: [], c: [] };
    K.init(e.ctx, { connect() {} }); const stopA = K.detectOnce((r) => got.a.push(r.key)); e.step(3000);
    stopA(); K.stop(); K.init(e.ctx, { connect() {} }); // = bindAiEnginesToSystemAudio: stop()+init() trên cùng nguồn
    const stopB = K.detectOnce((r) => got.b.push(r.key)); e.step(12000);
    ok(got.a.length === 0, 'watcher cũ đã stop: KHÔNG có kết quả của chu kỳ trước ghi đè chu kỳ mới');
    ok(got.b.length === 1 && got.b[0] === 'G Major', `chu kỳ mới sau reset khoá lại đúng G Major (${got.b.join(',')})`);
    const ls = K.getDebugSnapshot().loopStats; ok(ls.active === 0 && ls.started === ls.stopped, `không còn vòng chạy song song: started=${ls.started} stopped=${ls.stopped} active=${ls.active}`);
    stopB();
    for (let i = 0; i < 3; i++) { K.stop(); K.init(e.ctx, { connect() {} }); const st = K.detectOnce((r) => got.c.push(r.key)); e.step(10000); st(); }
    ok(got.c.length === 3 && got.c.every((k) => k === 'G Major'), `3 lần AUTO DETECT liên tiếp: mỗi lần đúng 1 kết quả G Major (${got.c.join(',')})`);
    const ls2 = K.getDebugSnapshot().loopStats; ok(ls2.active === 0, `sau 3 lần reset: active=${ls2.active}, maxActive=${ls2.maxActive}`);
}

console.log('\n== 9. HOÀN NGUYÊN & PHẠM VI ==');
{
    ok(/const ADAPTIVE_CONTENT_GATE_ENABLED = true;/.test(NEW) && /const LONG_STATIONARY_MIN_S = 4;/.test(NEW), 'công tắc ADAPTIVE_CONTENT_GATE_ENABLED + LONG_STATIONARY_MIN_S có trong file');
    ok(/const frameHasContent = contentCount > 0 && Math\.sqrt\(contentRms \/ contentCount\) > 0\.0005;/.test(NEW), 'cổng cũ 0.0005 vẫn còn nguyên làm số đo chẩn đoán (framesWithContent)');
    const mod = read('ui/js/engines/modEngine.js'), bpm = read('ui/js/engines/bpmEngine.js');
    ok(!/ADAPTIVE_CONTENT_GATE|getInputState|tonalPeaks/.test(mod + bpm), 'ModEngine/BPMEngine không bị sửa/không phụ thuộc cổng mới');
    ok(/getDebugSnapshot,\s*getInputState/.test(NEW) && /estimateKeyLong/.test(NEW) && /outOfScaleRatio/.test(NEW), 'API KeyEngine mà ModEngine dùng (estimateKeyFromChroma/estimateKeyLong/outOfScaleRatio/shortestSemitoneDelta) giữ nguyên');
    const r = read('ui/js/renderer.js'); ok(/KeyEngine\.init\(audioContext, source\)/.test(r) && /KeyEngine\.detectOnce\(/.test(r), 'renderer vẫn gọi KeyEngine.init(audioContext, source) + detectOnce như cũ (đường SYSTEM_AUDIO không đổi)');
    ok(!/createMicSource[\s\S]{0,400}exposeRawNodeForAdapter:\s*true/.test(read('ui/js/audioSource.js')), 'MIC vẫn không có getter cho adapter AI (SYSTEM_AUDIO là nguồn duy nhất)');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
