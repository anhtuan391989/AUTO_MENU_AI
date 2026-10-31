/**
 * keyscoring01bench.js — TASK AI-KEY-SCORING-A-01. Benchmark chấm điểm Key (24 ứng viên) trước/sau khi đổi thuật toán.
 * Chạy mã keyEngine.js THẬT trong vm (FFT như Web Audio, đồng hồ ảo), đầu vào TỔNG HỢP có đáp án. KHÔNG phải nhạc thật,
 * KHÔNG phải đo runtime Windows/Electron. Cùng 1 bộ ca, cùng 1 trình chạy cho cả baseline lẫn bản mới (chỉ khác --engine).
 *
 *   node tools/algbench/keyscoring01bench.js run    --engine <keyEngine.js> --out out.json [--shard 0/4] [--only g3.] [--verbose]
 *   node tools/algbench/keyscoring01bench.js report --base base.json[,b2.json] --new new.json[,n2.json] --md report.md
 *
 * Trình chạy mô phỏng ĐÚNG cách renderer.js dùng engine: detectOnce() rồi gọi lại detectOnce() trong callback (mỗi callback = 1 lần
 * reportAiResult("key") = 1 gói IPC ai-result). Nhờ đó đếm được số gói ai-result TRÙNG (cùng Key liên tiếp).
 */
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../../tests/helpers/keyEngineSignalSim.js');
const DUR = 20;
const mk = (fn, dur, db) => () => { const b = new Float32Array(Math.round(S.SR * dur)); fn(b); if (db !== null && db !== undefined) S.scaleToRmsDb(b, db); return b; };
const K = (pc, mode) => ({ pc, mode });
const PROG = {
    maj_clear: [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']],   // I IV V I
    maj_pop:   [[0, 'major'], [7, 'major'], [9, 'minor'], [5, 'major']],   // I V vi IV
    min_clear: [[0, 'minor'], [5, 'minor'], [7, 'major'], [0, 'minor']],   // i iv V i
    min_pop:   [[0, 'minor'], [8, 'major'], [3, 'major'], [10, 'major']],  // i VI III VII (== vi IV I V của relative major: MƠ HỒ)
};
function prog(buf, name, rootPc, t0, t1, amp, o) {
    o = o || {}; const ch = PROG[name], len = o.chordSec || 2; let i = 0;
    for (let t = t0; t < t1; t += len, i++) { const [d, q] = ch[(i + (o.startAt || 0)) % ch.length]; S.addChord(buf, (rootPc + d) % 12, q, t, Math.min(t + len, t1), amp, o); }
}
const relMajorOf = (minPc) => (minPc + 3) % 12, relMinorOf = (majPc) => (majPc + 9) % 12;

function buildCases() {
    const C = []; const add = (c) => C.push(c);
    const keys = []; for (let pc = 0; pc < 12; pc++) for (const mode of ['major', 'minor']) keys.push([pc, mode]);
    // G1 — Major/Minor rõ ràng, hợp âm đầu = tonic
    for (const [pc, mode] of keys) add({ id: `g1.clear.${S.labelOf(pc, mode)}`, g: 1, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, mode === 'major' ? 'maj_clear' : 'min_clear', pc, 0, DUR, 1, { timbre: 'piano' }), DUR, -35) });
    // G2 — mở đầu bằng hợp âm KHÔNG phải tonic (bắt đầu từ bậc IV/iv) + bẫy "hợp âm đầu kéo dài"
    for (const [pc, mode] of keys) add({ id: `g2.nontonic.${S.labelOf(pc, mode)}`, g: 2, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, mode === 'major' ? 'maj_clear' : 'min_clear', pc, 0, DUR, 1, { timbre: 'piano', startAt: 1 }), DUR, -35) });
    add({ id: 'g2.trap.Cmaj-Am6s', g: 2, truth: K(0, 'major'), dur: 26, build: mk((b) => { S.addChord(b, 9, 'minor', 0, 6, 1, { timbre: 'pad' }); prog(b, 'maj_clear', 0, 6, 26, 1, { timbre: 'piano' }); }, 26, -35) });
    add({ id: 'g2.trap.Gmaj-C6s', g: 2, truth: K(7, 'major'), dur: 26, build: mk((b) => { S.addChord(b, 0, 'major', 0, 6, 1, { timbre: 'pad' }); prog(b, 'maj_clear', 7, 6, 26, 1, { timbre: 'piano' }); }, 26, -35) });
    // G3 — bass mạnh hơn hòa âm (x4), bass chơi quãng 5 (bassIv=7) hoặc quãng 3 (bassIv=3/4) = bass KHÔNG ở tonic
    for (const [pc, mode] of [[0, 'major'], [9, 'minor'], [7, 'major'], [2, 'minor'], [4, 'major'], [11, 'minor'], [3, 'major'], [6, 'minor']]) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g3.bass4.${nm}`, g: 3, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'organ', bassGain: 4, startAt: 1 }), DUR, -35) });
        add({ id: `g3.bass4fifth.${nm}`, g: 3, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'organ', bassGain: 4, bassIv: 7, startAt: 1 }), DUR, -35) });
    }
    // G4 — organ / pad / brass (âm sắc giàu hài)
    for (const tb of ['organ', 'pad', 'brass']) for (const [pc, mode] of [[0, 'major'], [9, 'minor'], [5, 'major'], [2, 'minor'], [10, 'major'], [4, 'minor']]) {
        add({ id: `g4.${tb}.${S.labelOf(pc, mode)}`, g: 4, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, mode === 'major' ? 'maj_clear' : 'min_clear', pc, 0, DUR, 1, { timbre: tb, startAt: 1 }), DUR, -35) });
    }
    // G5 — relative mơ hồ (I V vi IV / i VI III VII): nhãn đúng = đúng tonic của tiến trình; tính riêng lỗi relative
    for (const [pc, mode] of keys) add({ id: `g5.pop.${S.labelOf(pc, mode)}`, g: 5, truth: K(pc, mode), ambiguousRel: true, dur: DUR, build: mk((b) => prog(b, mode === 'major' ? 'maj_pop' : 'min_pop', pc, 0, DUR, 1, { timbre: 'guitar' }), DUR, -35) });
    // G6 — vector yếu / im lặng / nhiễu / không đủ thông tin: KHÔNG được tạo Key giả (truth = null)
    add({ id: 'g6.silence', g: 6, truth: null, dur: DUR, build: mk(() => {}, DUR, null) });
    add({ id: 'g6.white-40', g: 6, truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 3); }, DUR, -40) });
    add({ id: 'g6.white-25', g: 6, truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 5); }, DUR, -25) });
    add({ id: 'g6.brown-30', g: 6, truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 9, 'brown'); }, DUR, -30) });
    add({ id: 'g6.hum60-35', g: 6, truth: null, dur: DUR, build: mk((b) => { for (let h = 1; h <= 8; h++) S.addNote(b, 69 + 12 * Math.log2(60 * h / 440), 0, DUR, 1 / h, 'organ'); }, DUR, -35) });
    for (const [pc, mode] of [[0, 'major'], [9, 'minor'], [7, 'major']]) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g6.power.${nm}`, g: 6, truth: null, noThird: true, root: pc, dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'guitar', power: true }), DUR, -35) });
    }
    add({ id: 'g6.weak-55', g: 6, truth: K(0, 'major'), weak: true, dur: DUR, build: mk((b) => prog(b, 'maj_clear', 0, 0, DUR, 1, { timbre: 'piano' }), DUR, -55) });
    add({ id: 'g6.noisy-music', g: 6, truth: K(9, 'minor'), dur: DUR, build: mk((b) => { prog(b, 'min_clear', 9, 0, DUR, 1, { timbre: 'piano' }); S.addNoise(b, 0, DUR, 0.5, 11); }, DUR, -35) });
    // G7 — chuyển hợp âm KHÔNG chuyển Key (xen hợp âm vay mượn thưa) + chuyển Key THẬT (phải vẫn phát hiện)
    for (const [pc, mode] of [[0, 'major'], [4, 'major'], [9, 'minor'], [2, 'minor']]) {
        const nm = S.labelOf(pc, mode), base = mode === 'major' ? 'maj_clear' : 'min_clear';
        const borrowed = mode === 'major' ? [[10, 'major'], [2, 'major'], [4, 'major'], [5, 'minor']] : [[2, 'major'], [4, 'major'], [10, 'major'], [8, 'major']];
        add({ id: `g7.chordonly.${nm}`, g: 7, truth: K(pc, mode), chordOnly: true, dur: 36, build: mk((b) => {
            const ch = PROG[base]; let t = 0, i = 0, bi = 0;
            while (t < 36) { let d, q; if (i % 3 === 2) { [d, q] = borrowed[bi++ % borrowed.length]; } else { [d, q] = ch[(i - Math.floor(i / 3)) % ch.length]; } S.addChord(b, (pc + d) % 12, q, t, Math.min(36, t + 2), 1, { timbre: 'piano' }); t += 2; i++; }
        }, 36, -35) });
    }
    for (const [pc, mode, up] of [[2, 'major', 1], [7, 'major', 2], [9, 'minor', 1], [4, 'minor', 2]]) {
        const a = S.labelOf(pc, mode), nb = S.labelOf((pc + up) % 12, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g7.mod.${a}+${up}`, g: 7, truth: K((pc + up) % 12, mode), before: K(pc, mode), modAt: 30, dur: 60, build: mk((b) => { prog(b, name, pc, 0, 30, 1, { timbre: 'piano' }); prog(b, name, (pc + up) % 12, 30, 60, 1, { timbre: 'piano' }); }, 60, -35) });
    }
    return C;
}

// ---------- Chạy 1 ca ----------
const SNAP_AT = [8, 12, 16, 20];
function bad01(x) { return typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1; }
function runOne(c, engineSrc) {
    const buf = c.build(), t0 = Date.now();
    const e = S.create(buf, { engineSrc });
    const KE = e.KeyEngine; KE.init(e.ctx, { connect() {} });
    const reports = []; const confSeen = []; let provCount = 0;
    const arm = () => KE.detectOnce((r) => { reports.push({ t: +e.now().toFixed(2), key: r.key, conf: r.confidence, margin: r.margin, pct: Math.round(r.confidence * 100) }); arm(); }); // đúng như renderer.startAiRealtimeLoop
    arm();
    KE.onProvisionalEstimate((p) => { provCount++; confSeen.push({ src: 'provisional', v: p.confidence }); });
    const snaps = []; const stepMs = 250; const total = c.dur * 1000;
    const nextSnap = SNAP_AT.filter((s) => s <= c.dur).slice();
    for (let t = 0; t < total; t += stepMs) {
        e.step(stepMs);
        if (nextSnap.length && e.now() >= nextSnap[0] - 1e-6) {
            const at = nextSnap.shift();
            const L = KE.estimateKeyLong(), M = KE.estimateKeyFromChroma(), D = KE.getDebugSnapshot();
            const top = (r) => (r && r.all ? r.all.slice(0, 2).map((x) => `${S.NOTE_NAMES[x.root]} ${x.mode}`) : [r.key]);
            const F = KE.estimateKeyFromChroma(D.chromaVectorFast);
            snaps.push({ at, longKey: L.key, longTop2: top(L), longConf: L.confidence, longMargin: L.margin, longCorr: L.correlation ?? null, slowKey: M.key, slowConf: M.confidence, slowMargin: M.margin, slowCorr: M.correlation ?? null,
                fastKey: F.key, fastConf: F.confidence, fastMargin: F.margin, fastCorr: F.correlation ?? null, hasMusic: D.hasMusicalContent, state: D.inputState });
            confSeen.push({ src: 'long', v: L.confidence }, { src: 'slow', v: M.confidence }, { src: 'fast', v: F.confidence });
        }
    }
    // quét telemetry: mọi trường confidence/decisionScore engine đã phát
    for (const r of e.tele) { if ('confidence' in r) confSeen.push({ src: 'tele.confidence', v: r.confidence }); if ('decisionScore' in r) confSeen.push({ src: 'tele.decisionScore', v: r.decisionScore }); }
    for (const r of reports) confSeen.push({ src: 'report', v: r.conf });
    const outOfRange = confSeen.filter((x) => bad01(x.v)).length;
    const pctOver100 = reports.filter((r) => r.pct > 100 || r.pct < 0 || !Number.isFinite(r.pct)).length;
    KE.stop();
    const lockEvents = e.tele.filter((r) => r.event === 'LOCK').map((r) => ({ at: +r.at.toFixed(2), key: r.key, ds: r.decisionScore, reason: r.reason }));
    return { id: c.id, g: c.g, reports, snaps, lockEvents, confN: confSeen.length, confOutOfRange: outOfRange, pctOver100, provCount, wallMs: Date.now() - t0 };
}
function cmdRun(args) {
    const engineSrc = fs.readFileSync(args.engine, 'utf8');
    const [si, sn] = (args.shard || '0/1').split('/').map(Number);
    let cases = buildCases().filter((c, i) => i % sn === si);
    if (args.only) cases = cases.filter((c) => c.id.startsWith(args.only));
    const out = [];
    cases.forEach((c, i) => { out.push(runOne(c, engineSrc)); if (args.verbose) console.error(`[${si}/${sn}] ${i + 1}/${cases.length} ${c.id} ${out[out.length - 1].wallMs}ms -> ${out[out.length - 1].reports.map((l) => l.key + '@' + l.t).join(',') || '-'}`); });
    fs.writeFileSync(args.out, JSON.stringify({ engine: args.engine, results: out }));
}

// ---------- Đánh giá ----------
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
const num = (x, d = 3) => x === null || x === undefined ? 'n/a' : (+x).toFixed(d);
function isRelative(truth, key) { // key dạng "A Minor"; truth {pc,mode}
    if (!key) return false; const [n, m] = key.split(' '); const pc = S.NOTE_NAMES.indexOf(n), mode = m.toLowerCase();
    return truth.mode === 'major' ? (mode === 'minor' && pc === relMinorOf(truth.pc)) : (mode === 'major' && pc === relMajorOf(truth.pc));
}
function evalCase(c, r) {
    const truthLabel = c.truth ? S.labelOf(c.truth.pc, c.truth.mode) : null;
    const reports = r.reports, first = reports[0] || null, final = reports.length ? reports[reports.length - 1] : null;
    let dup = 0; for (let i = 1; i < reports.length; i++) if (reports[i].key === reports[i - 1].key) dup++;
    const o = { id: c.id, g: c.g, truth: truthLabel, nReports: reports.length, dup, first, final, snaps: r.snaps, confOutOfRange: r.confOutOfRange, pctOver100: r.pctOver100, confN: r.confN };
    if (c.truth === null) { o.kind = 'NO_KEY'; o.falseKey = reports.length > 0; o.undetermined = reports.length === 0; return o; }
    o.kind = c.modAt ? 'MOD' : c.chordOnly ? 'KEEP' : 'EXACT';
    const snapAt = (a) => r.snaps.find((s) => s.at === a) || null;
    const s12 = snapAt(12) || r.snaps[r.snaps.length - 1] || null;
    if (c.modAt) { // chuyển Key thật: trước c.modAt phải đang đúng Key cũ, sau đó phải khoá Key mới
        const before = S.labelOf(c.before.pc, c.before.mode); let k = null; for (const l of reports) if (l.t <= c.modAt - 0.1) k = l.key;
        const firstNew = reports.find((l) => l.t >= c.modAt && l.key === truthLabel);
        o.beforeOk = k === before; o.detectLatency = firstNew ? +(firstNew.t - c.modAt).toFixed(1) : null; o.ok = !!firstNew && !!final && final.key === truthLabel;
        return o;
    }
    if (c.chordOnly) { const wrong = reports.filter((l) => l.key !== truthLabel); o.ok = !!final && final.key === truthLabel && wrong.length === 0; o.wrongLocks = wrong.length; return o; }
    // EXACT: top-1/top-2 từ Key dài hạn tại 12 s (đường xếp hạng 24 ứng viên), kết quả khoá từ detectOnce
    if (s12) { o.top1Ok = s12.longTop2[0] === truthLabel; o.top2Ok = s12.longTop2.includes(truthLabel); o.relWrong = !o.top1Ok && isRelative(c.truth, s12.longTop2[0]); o.margin12 = s12.longMargin; o.conf12 = s12.longConf; }
    o.ok = !!final && final.key === truthLabel;
    o.firstOk = first ? first.key === truthLabel : null;
    o.firstWrong = !!first && first.key !== truthLabel;
    o.firstT = first ? first.t : null;
    o.finalRelWrong = !!final && final.key !== truthLabel && isRelative(c.truth, final.key);
    o.undetermined = reports.length === 0;
    return o;
}
function summarize(cases, results) {
    const byId = Object.fromEntries(results.map((x) => [x.id, x]));
    const ev = cases.filter((c) => byId[c.id]).map((c) => evalCase(c, byId[c.id]));
    const exact = ev.filter((e) => e.kind === 'EXACT'), noKey = ev.filter((e) => e.kind === 'NO_KEY'), keep = ev.filter((e) => e.kind === 'KEEP'), mod = ev.filter((e) => e.kind === 'MOD');
    const top1 = exact.filter((e) => e.top1Ok !== undefined);
    const firsts = exact.filter((e) => e.first);
    const S_ = {
        nCases: ev.length, nExact: exact.length,
        top1: pct(top1.filter((e) => e.top1Ok).length, top1.length), top2: pct(top1.filter((e) => e.top2Ok).length, top1.length),
        relWrongTop1: pct(top1.filter((e) => e.relWrong).length, top1.length),
        finalOk: pct(exact.filter((e) => e.ok).length, exact.length), finalRelWrong: pct(exact.filter((e) => e.finalRelWrong).length, exact.length),
        marginMedian: med(top1.map((e) => e.margin12).filter((x) => typeof x === 'number')),
        firstWrong: `${firsts.filter((e) => e.firstWrong).length}/${firsts.length} (${pct(firsts.filter((e) => e.firstWrong).length, firsts.length)})`,
        firstLatencyMedian: med(firsts.map((e) => e.firstT)), firstLatencyMax: firsts.length ? Math.max(...firsts.map((e) => e.firstT)) : null,
        undeterminedTruth: exact.filter((e) => e.undetermined).length,
        noKeyFalse: `${noKey.filter((e) => e.falseKey).length}/${noKey.length}`,
        confOutOfRange: ev.reduce((a, e) => a + e.confOutOfRange, 0), confSamples: ev.reduce((a, e) => a + e.confN, 0), pctOver100: ev.reduce((a, e) => a + e.pctOver100, 0),
        casesWithOutOfRange: ev.filter((e) => e.confOutOfRange > 0).length,
        dupReports: ev.reduce((a, e) => a + e.dup, 0), reportsTotal: ev.reduce((a, e) => a + e.nReports, 0), casesWithDup: ev.filter((e) => e.dup > 0).length,
        keepOk: `${keep.filter((e) => e.ok).length}/${keep.length}`, keepWrongLocks: keep.reduce((a, e) => a + (e.wrongLocks || 0), 0),
        modOk: `${mod.filter((e) => e.ok).length}/${mod.length}`, modLatency: mod.map((e) => e.detectLatency),
    };
    return { ev, S: S_ };
}
function byGroup(cases, results) {
    const out = {}; for (let g = 1; g <= 7; g++) { const cs = cases.filter((c) => c.g === g); out[g] = summarize(cs, results).S; } return out;
}
function loadMany(list) { const rs = []; for (const f of String(list).split(',')) rs.push(...JSON.parse(fs.readFileSync(f, 'utf8')).results); return rs; }
function cmdReport(args) {
    const cases = buildCases(), base = loadMany(args.base), neu = loadMany(args.new);
    const B = summarize(cases, base), N = summarize(cases, neu);
    const rows = [['Top-1 accuracy (Key dài hạn @12 s, ca có đáp án)', 'top1'], ['Top-2 accuracy', 'top2'], ['Chọn nhầm relative key (top-1 @12 s)', 'relWrongTop1'], ['Khoá CUỐI đúng', 'finalOk'], ['Khoá cuối nhầm relative', 'finalRelWrong'],
        ['Score margin trung vị (top1−top2 @12 s)', 'marginMedian'], ['Khoá ĐẦU sai', 'firstWrong'], ['First Key latency trung vị (s)', 'firstLatencyMedian'], ['First Key latency tối đa (s)', 'firstLatencyMax'],
        ['Ca có đáp án mà KHÔNG xác định được Key', 'undeterminedTruth'], ['Ca KHÔNG có Key mà engine vẫn khoá (giả)', 'noKeyFalse'],
        ['Confidence ngoài [0,1] (mẫu)', 'confOutOfRange'], ['Tổng mẫu confidence', 'confSamples'], ['Số ca có confidence ngoài [0,1]', 'casesWithOutOfRange'], ['Hiển thị % >100 hoặc <0 (gói ai-result)', 'pctOver100'],
        ['Gói ai-result TRÙNG Key liên tiếp', 'dupReports'], ['Tổng gói ai-result', 'reportsTotal'], ['Số ca có gói trùng', 'casesWithDup'],
        ['Chuyển hợp âm không chuyển Key: giữ đúng', 'keepOk'], ['  ...số lần khoá sai trong nhóm này', 'keepWrongLocks'], ['Chuyển Key thật: phát hiện', 'modOk']];
    let md = `# Benchmark AI-KEY-SCORING-A-01\n\nBase: ${args.base}\nNew: ${args.new}\nSố ca: ${B.S.nCases} (có đáp án chính xác: ${B.S.nExact})\n\n| Chỉ số | Trước | Sau |\n|---|---|---|\n`;
    const f = (v) => typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v);
    for (const [label, key] of rows) md += `| ${label} | ${f(B.S[key])} | ${f(N.S[key])} |\n`;
    md += `| Độ trễ phát hiện chuyển Key (s) | ${JSON.stringify(B.S.modLatency)} | ${JSON.stringify(N.S.modLatency)} |\n`;
    const bg = byGroup(cases, base), ng = byGroup(cases, neu);
    const GN = { 1: 'Major/Minor rõ', 2: 'Mở đầu không phải tonic', 3: 'Bass mạnh', 4: 'Organ/pad/giàu hài', 5: 'Relative mơ hồ', 6: 'Yếu/im lặng/nhiễu', 7: 'Đổi hợp âm / chuyển Key' };
    md += `\n## Theo nhóm (khoá cuối đúng | top-1 | top-2 | khoá đầu sai | latency trung vị | ca không xác định | khoá giả)\n\n| Nhóm | Trước | Sau |\n|---|---|---|\n`;
    for (let g = 1; g <= 7; g++) { const a = bg[g], b = ng[g]; const line = (x) => `${x.finalOk} \\| ${x.top1} \\| ${x.top2} \\| ${x.firstWrong} \\| ${num(x.firstLatencyMedian, 1)} \\| ${x.undeterminedTruth} \\| ${x.noKeyFalse}`; md += `| G${g} ${GN[g]} | ${line(a)} | ${line(b)} |\n`; }
    // ca khác nhau (đúng→sai hoặc sai→đúng)
    const bm = Object.fromEntries(B.ev.map((e) => [e.id, e])), nm = Object.fromEntries(N.ev.map((e) => [e.id, e]));
    const worse = [], better = [];
    for (const id of Object.keys(bm)) { const a = bm[id], b = nm[id]; if (!b) continue; const va = a.ok !== undefined ? a.ok : !a.falseKey, vb = b.ok !== undefined ? b.ok : !b.falseKey; if (va && !vb) worse.push(id); if (!va && vb) better.push(id); }
    md += `\n## Ca đổi kết quả (khoá cuối / quyết định)\n\n- Đúng→SAI (${worse.length}): ${worse.join(', ') || '—'}\n- Sai→ĐÚNG (${better.length}): ${better.join(', ') || '—'}\n`;
    const fw = []; for (const id of Object.keys(bm)) { const a = bm[id], b = nm[id]; if (b && a.first && b.first && a.first.key !== b.first.key) fw.push(`${id}: ${a.first.key}@${a.first.t} → ${b.first.key}@${b.first.t} (đáp án ${a.truth})`); }
    md += `\n## Ca khoá ĐẦU khác nhau (${fw.length})\n\n${fw.map((x) => '- ' + x).join('\n') || '—'}\n`;
    if (args.md) fs.writeFileSync(args.md, md); console.log(md);
    if (args.json) fs.writeFileSync(args.json, JSON.stringify({ base: B.S, new: N.S, baseGroups: bg, newGroups: ng, worse, better }, null, 1));
}

const argv = process.argv.slice(2); const cmd = argv.shift(); const args = {};
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; args[k] = v; } }
if (require.main === module) { if (cmd === 'run') cmdRun(args); else if (cmd === 'report') cmdReport(args); else { console.error('dùng: run|report'); process.exit(1); } }
module.exports = { buildCases, runOne, evalCase, summarize };
