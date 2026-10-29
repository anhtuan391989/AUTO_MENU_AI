/**
 * keybench01.js — TASK AI-KEY-ENGINE-COMPLETE-01. Benchmark Key Engine trên tín hiệu TỔNG HỢP có ground truth (mã engine THẬT qua vm, FFT như Web Audio, đồng hồ ảo).
 * KHÔNG phải nhạc thật, KHÔNG phải đo Windows/Electron. Kết quả chỉ chứng minh hành vi trên bộ ca đã nêu.
 *
 *   node tools/algbench/keybench01.js run    --engine <keyEngine.js> --out out.json [--shard 0/2] [--only <prefix>]
 *   node tools/algbench/keybench01.js report --base base.json[,base2.json] --new new.json[,new2.json] --md report.md
 */
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../../tests/helpers/keyEngineSignalSim.js');
const DUR = 24;
const mk = (fn, dur, db) => () => { const b = new Float32Array(Math.round(S.SR * dur)); fn(b); if (db !== null && db !== undefined) S.scaleToRmsDb(b, db); return b; };
const K = (pc, mode) => ({ pc, mode });

// Tiến trình hợp âm (bậc theo root + chất): rõ ràng (có chứa V/iv đặc trưng) và "pop" (có thể mơ hồ relative)
const PROG = {
    maj_clear: [[0, 'major'], [5, 'major'], [7, 'major'], [0, 'major']],           // I IV V I
    maj_pop:   [[0, 'major'], [7, 'major'], [9, 'minor'], [5, 'major']],           // I V vi IV
    min_clear: [[0, 'minor'], [5, 'minor'], [7, 'major'], [0, 'minor']],           // i iv V i (V trưởng = âm dẫn)
    min_pop:   [[0, 'minor'], [8, 'major'], [3, 'major'], [10, 'major']],          // i VI III VII  (== vi IV I V của relative major: MƠ HỒ)
};
function prog(buf, name, rootPc, t0, t1, amp, o) {
    o = o || {}; const ch = PROG[name], len = o.chordSec || 2; let i = 0;
    for (let t = t0; t < t1; t += len, i++) { const [d, q] = ch[(i + (o.startAt || 0)) % ch.length]; S.addChord(buf, (rootPc + d) % 12, q, t, Math.min(t + len, t1), amp, o); }
}
const relMajor = (pc) => (pc + 3) % 12, relMinor = (pc) => (pc + 9) % 12;

function buildCases() {
    const C = [];
    const add = (c) => C.push(c);
    // ---- Nhóm 1: cơ bản ----
    add({ id: 'g1.silence', g: 1, desc: 'im lặng hoàn toàn', truth: null, dur: DUR, build: mk(() => {}, DUR, null) });
    add({ id: 'g1.white-40', g: 1, desc: 'nhiễu trắng -40 dBFS', truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 3); }, DUR, -40) });
    add({ id: 'g1.white-25', g: 1, desc: 'nhiễu trắng -25 dBFS', truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 5); }, DUR, -25) });
    add({ id: 'g1.brown-30', g: 1, desc: 'nhiễu nâu -30 dBFS', truth: null, dur: DUR, build: mk((b) => { S.addNoise(b, 0, DUR, 1, 9, 'brown'); }, DUR, -30) });
    add({ id: 'g1.hum60-35', g: 1, desc: 'ù 60 Hz + hài (1..8) -35 dBFS (không phải nhạc)', truth: null, dur: DUR, build: mk((b) => { for (let h = 1; h <= 8; h++) S.addNote(b, 69 + 12 * Math.log2(60 * h / 440), 0, DUR, 1 / h, 'organ'); }, DUR, -35) });
    for (const db of [-20, -45, -55]) add({ id: `g1.level.${db}`, g: 1, desc: `C Major (I-IV-V-I) ở ${db} dBFS`, truth: K(0, 'major'), dur: DUR, build: mk((b) => prog(b, 'maj_clear', 0, 0, DUR, 1, { timbre: 'piano' }), DUR, db) });
    for (let pc = 0; pc < 12; pc++) for (const mode of ['major', 'minor']) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g1.key.${nm}`, g: 1, set: 'main', desc: `${nm}, piano, -35 dBFS, hợp âm đầu = tonic`, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'piano' }), DUR, -35) });
        add({ id: `g1.keyF.${nm}`, g: 2, set: 'main', desc: `${nm}, hợp âm ĐẦU KHÔNG phải tonic (bắt đầu từ bậc IV/iv)`, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'piano', startAt: 1 }), DUR, -35) });
        add({ id: `g1.pop.${nm}`, g: 1, set: 'pop', desc: `${nm}, tiến trình pop (${mode === 'major' ? 'I-V-vi-IV' : 'i-VI-III-VII'}) — relative MƠ HỒ`, truth: K(pc, mode), ambiguousRel: true, dur: DUR, build: mk((b) => prog(b, mode === 'major' ? 'maj_pop' : 'min_pop', pc, 0, DUR, 1, { timbre: 'guitar' }), DUR, -35) });
    }
    for (const tb of ['organ', 'guitar', 'pad', 'brass']) for (let pc = 0; pc < 12; pc++) for (const mode of ['major', 'minor']) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        if (pc % 3 !== (tb.length % 3)) continue; // mỗi âm sắc 4 root x 2 mode = 8 ca (giảm thời gian chạy, vẫn phủ mọi root qua 4 âm sắc)
        add({ id: `g1.timbre.${tb}.${nm}`, g: 1, set: 'main', desc: `${nm}, âm sắc ${tb}, -35 dBFS`, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: tb, startAt: 1 }), DUR, -35) });
    }
    for (const cents of [-35, -20, 20, 35]) for (let pc = 0; pc < 12; pc += 2) for (const mode of ['major', 'minor']) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        if (((pc / 2) + (cents > 0 ? 1 : 0)) % 2 !== (mode === 'major' ? 0 : 1)) continue; // chia nửa tập để giảm thời gian
        add({ id: `g1.detune${cents}.${nm}`, g: 1, set: 'main', desc: `${nm}, lệch tuning ${cents} cent, -35 dBFS`, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'piano', cents, startAt: 1 }), DUR, -35) });
    }
    // thay đổi âm lượng mà không đổi Tone: -20 dB -> -50 dB (tại 8 s) -> -30 dB (tại 16 s)
    add({ id: 'g1.volchange', g: 1, desc: 'đổi âm lượng -20→-50→-30 dBFS, Tone không đổi (A Minor)', truth: K(9, 'minor'), dur: 30, volume: true, build: mk((b) => { prog(b, 'min_clear', 9, 0, 30, 1, { timbre: 'piano' }); for (let i = 0; i < b.length; i++) { const t = i / S.SR; b[i] *= t < 8 ? 1 : t < 16 ? 0.03 : 0.2; } S.scaleToRmsDb(b, -26); }, 30, null) });
    // ---- Nhóm 2: chống nhầm ----
    for (const [pc, mode] of [[0, 'major'], [9, 'minor'], [7, 'major'], [2, 'minor']]) {
        const nm = S.labelOf(pc, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g2.bass.${nm}`, g: 2, desc: `${nm}, bass RẤT mạnh (x4), bass chơi quãng 5`, truth: K(pc, mode), dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'organ', bassGain: 4, startAt: 1 }), DUR, -35) });
        add({ id: `g2.no3.${nm}`, g: 2, desc: `${nm}: chỉ hợp âm rỗng (root+5, thiếu quãng 3) — Major/Minor KHÔNG xác định được`, truth: null, noThird: true, root: pc, dur: DUR, build: mk((b) => prog(b, name, pc, 0, DUR, 1, { timbre: 'guitar', power: true }), DUR, -35) });
        add({ id: `g2.short.${nm}`, g: 2, desc: `${nm}: đoạn ngắn 6 s`, truth: K(pc, mode), dur: 6, build: mk((b) => prog(b, name, pc, 0, 6, 1, { timbre: 'piano' }), 6, -35), shortExcerpt: true });
        add({ id: `g2.rests.${nm}`, g: 2, desc: `${nm}: có đoạn nghỉ im lặng 3 s giữa bài`, truth: K(pc, mode), dur: DUR, build: mk((b) => { prog(b, name, pc, 0, 10, 1, { timbre: 'piano' }); prog(b, name, pc, 13, DUR, 1, { timbre: 'piano', startAt: 2 }); }, DUR, -35) });
    }
    add({ id: 'g2.firstchord.vi', g: 2, desc: 'C Major nhưng 6 s đầu chỉ ngân hợp âm Am (vi) rồi mới vào I-IV-V-I', truth: K(0, 'major'), firstChordTrap: true, dur: 30, build: mk((b) => { S.addChord(b, 9, 'minor', 0, 6, 1, { timbre: 'pad' }); prog(b, 'maj_clear', 0, 6, 30, 1, { timbre: 'piano' }); }, 30, -35) });
    add({ id: 'g2.firstchord.IV', g: 2, desc: 'G Major nhưng 6 s đầu chỉ ngân hợp âm C (IV) rồi mới vào I-IV-V-I', truth: K(7, 'major'), firstChordTrap: true, dur: 30, build: mk((b) => { S.addChord(b, 0, 'major', 0, 6, 1, { timbre: 'pad' }); prog(b, 'maj_clear', 7, 6, 30, 1, { timbre: 'piano' }); }, 30, -35) });
    // chỉ đổi hợp âm, KHÔNG chuyển Tone.
    //  (a) chordonly: hợp âm vay mượn/dominant phụ THƯA xen giữa hợp âm trong thang (thực tế: bVII, V/V, V/vi, iv mượn) — BẮT BUỘC giữ Tone.
    //  (b) chordstress: 8 s LIÊN TỤC 4 hợp âm ngoài thang (D, Bb, E, Fm trong C) — thông tin (INFO), không tính PASS/FAIL vì đây đã gần như chuyển giọng.
    for (const [pc, mode] of [[0, 'major'], [4, 'major'], [9, 'minor']]) {
        const nm = S.labelOf(pc, mode), base = mode === 'major' ? 'maj_clear' : 'min_clear';
        const borrowed = mode === 'major' ? [[10, 'major'], [2, 'major'], [4, 'major'], [5, 'minor']] : [[2, 'major'], [4, 'major'], [10, 'major'], [8, 'major']];
        add({ id: `g2.chordonly.${nm}`, g: 2, desc: `${nm}: xen hợp âm vay mượn THƯA (1/3 số hợp âm), KHÔNG chuyển Tone`, truth: K(pc, mode), chordOnly: true, dur: 40, build: mk((b) => {
            const ch = PROG[base]; let t = 0, i = 0, bi = 0;
            while (t < 40) { let d, q; if (i % 3 === 2) { [d, q] = borrowed[bi++ % borrowed.length]; } else { [d, q] = ch[(i - Math.floor(i / 3)) % ch.length]; } S.addChord(b, (pc + d) % 12, q, t, Math.min(40, t + 2), 1, { timbre: 'piano' }); t += 2; i++; }
        }, 40, -35) });
        add({ id: `g2.chordstress.${nm}`, g: 2, desc: `${nm}: 8 s liên tục hợp âm NGOÀI thang rồi quay về (INFO)`, truth: K(pc, mode), chordOnly: true, info: true, dur: 40, build: mk((b) => {
            prog(b, base, pc, 0, 20, 1, { timbre: 'piano' });
            let t = 20, i = 0; while (t < 28) { const [d, q] = borrowed[i % borrowed.length]; S.addChord(b, (pc + d) % 12, q, t, t + 2, 1, { timbre: 'piano' }); t += 2; i++; }
            prog(b, base, pc, 28, 40, 1, { timbre: 'piano' });
        }, 40, -35) });
    }
    // ---- Chuyển Tone thật (lên 1 / 2 bán cung) ----
    for (const [pc, mode, up] of [[2, 'major', 1], [7, 'major', 2], [9, 'minor', 1], [4, 'minor', 2], [0, 'major', 1], [11, 'minor', 2]]) {
        const a = S.labelOf(pc, mode), nb = S.labelOf((pc + up) % 12, mode), name = mode === 'major' ? 'maj_clear' : 'min_clear';
        add({ id: `g2.mod.${a}+${up}`, g: 2, desc: `chuyển Tone thật ${a} → ${nb} tại 30 s`, truth: K((pc + up) % 12, mode), before: K(pc, mode), modAt: 30, dur: 62, build: mk((b) => { prog(b, name, pc, 0, 30, 1, { timbre: 'piano' }); prog(b, name, (pc + up) % 12, 30, 62, 1, { timbre: 'piano' }); }, 62, -35) });
    }
    return C;
}

// ---------- Chạy ----------
function runOne(c, engineSrc) {
    const buf = c.build();
    const t0 = Date.now();
    const r = S.runCase(buf, c.dur, { engineSrc });
    const locks = r.locks.map((l) => ({ t: +l.t.toFixed(2), key: l.key, conf: +(l.conf || 0).toFixed(3), margin: +(l.margin || 0).toFixed(3) }));
    return { id: c.id, g: c.g, set: c.set || null, locks, wallMs: Date.now() - t0, inputState: r.snap.inputState || null, framesAccepted: r.snap.inputProbe.framesAccepted ?? null, framesLegacy: r.snap.inputProbe.framesWithContent, hasMusic: r.snap.hasMusicalContent };
}
function cmdRun(args) {
    const engineSrc = fs.readFileSync(args.engine, 'utf8');
    const [si, sn] = (args.shard || '0/1').split('/').map(Number);
    let cases = buildCases().filter((c, i) => i % sn === si);
    if (args.only) cases = cases.filter((c) => c.id.startsWith(args.only));
    const out = [];
    cases.forEach((c, i) => { out.push(runOne(c, engineSrc)); if (args.verbose) console.error(`[${si}/${sn}] ${i + 1}/${cases.length} ${c.id} -> ${out[out.length - 1].locks.map((l) => l.key + '@' + l.t).join(',') || '-'}`); });
    fs.writeFileSync(args.out, JSON.stringify({ engine: args.engine, results: out }, null, 1));
}

// ---------- Đánh giá ----------
const normKey = (k) => k; // "C Major" / "C# Minor"
function evalCase(c, res) {
    const final = res.locks.length ? res.locks[res.locks.length - 1] : null;
    const tl = (t) => { let k = null; for (const l of res.locks) if (l.t <= t) k = l.key; return k; };
    const truthLabel = c.truth ? S.labelOf(c.truth.pc, c.truth.mode) : null;
    const o = { id: c.id, g: c.g, set: c.set, desc: c.desc, truth: truthLabel, final: final ? final.key : null, nLocks: res.locks.length, first: res.locks[0] || null };
    if (c.truth === null) { // phải KHÔNG có Tone
        o.expect = c.noThird ? 'NO_WRONG_MODE' : 'NO_KEY';
        if (c.noThird) { const rootOk = res.locks.every((l) => l.key.startsWith(S.NOTE_NAMES[c.root] + ' ')); o.ok = res.locks.length === 0; o.soft = res.locks.length === 0 ? 'no-lock' : (rootOk ? 'lock-root-only' : 'lock-wrong-root'); }
        else o.ok = res.locks.length === 0;
        return o;
    }
    if (c.modAt) {
        const before = S.labelOf(c.before.pc, c.before.mode);
        const firstNew = res.locks.find((l) => l.t >= c.modAt && l.key === truthLabel);
        o.expect = 'MODULATION'; o.beforeOk = tl(c.modAt - 0.1) === before; o.detectLatency = firstNew ? +(firstNew.t - c.modAt).toFixed(1) : null; o.ok = !!firstNew && final && final.key === truthLabel; return o;
    }
    if (c.chordOnly) { o.expect = c.info ? 'INFO_KEEP_KEY' : 'KEEP_KEY'; o.info = !!c.info; const wrong = res.locks.filter((l) => l.key !== truthLabel); o.ok = !!final && final.key === truthLabel && wrong.length === 0; o.wrongLocks = wrong.length; return o; }
    if (c.volume) { o.expect = 'KEEP_KEY'; o.ok = !!final && final.key === truthLabel && res.locks.every((l) => l.key === truthLabel); return o; }
    o.expect = 'EXACT';
    o.ok = !!final && final.key === truthLabel;
    o.firstCorrectT = (res.locks.find((l) => l.key === truthLabel) || {}).t ?? null;
    if (final && !o.ok) { // phân loại lỗi
        const [fn, fm] = final.key.split(' '), fpc = S.NOTE_NAMES.indexOf(fn), fmode = fm.toLowerCase();
        o.err = (fpc === c.truth.pc && fmode !== c.truth.mode) ? 'parallel' : ((c.truth.mode === 'major' && fmode === 'minor' && fpc === relMinor(c.truth.pc)) || (c.truth.mode === 'minor' && fmode === 'major' && fpc === relMajor(c.truth.pc))) ? 'relative' : (fmode === c.truth.mode && Math.abs(((fpc - c.truth.pc + 18) % 12) - 6) === 1) ? 'fifth-neighbor' : 'other';
    }
    o.noResult = !final; return o;
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
function summarize(cases, results) {
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    const ev = cases.filter((c) => byId[c.id]).map((c) => Object.assign(evalCase(c, byId[c.id]), { _c: c }));
    return ev;
}
function stats(ev) {
    const main = ev.filter((e) => e.set === 'main' && e.expect === 'EXACT');
    const maj = main.filter((e) => /Major$/.test(e.truth)), min = main.filter((e) => /Minor$/.test(e.truth));
    const ok = (a) => a.filter((e) => e.ok).length;
    const noRes = (a) => a.filter((e) => e.noResult).length;
    const wrongLock = (a) => a.filter((e) => !e.ok && !e.noResult).length;
    const lat = main.filter((e) => e.ok && e.firstCorrectT !== null).map((e) => e.firstCorrectT).sort((a, b) => a - b);
    const first = main.filter((e) => e.first).map((e) => e.first.t).sort((a, b) => a - b);
    const med = (a) => a.length ? a[Math.floor(a.length / 2)] : null;
    return { n: main.length, acc: pct(ok(main), main.length), accMajor: pct(ok(maj), maj.length), nMaj: maj.length, accMinor: pct(ok(min), min.length), nMin: min.length, noResult: pct(noRes(main), main.length), wrongLock: pct(wrongLock(main), main.length), nWrongLock: wrongLock(main), medFirstLockS: med(first), medFirstCorrectS: med(lat), p90FirstLockS: first.length ? first[Math.floor(first.length * 0.9)] : null };
}
function confusion(ev) {
    const labels = []; for (let pc = 0; pc < 12; pc++) for (const m of ['Major', 'Minor']) labels.push(`${S.NOTE_NAMES[pc]} ${m}`);
    const M = {}; labels.forEach((l) => { M[l] = {}; labels.concat(['none']).forEach((x) => { M[l][x] = 0; }); });
    ev.filter((e) => e.set === 'main' && e.expect === 'EXACT').forEach((e) => { M[e.truth][e.final || 'none']++; });
    return { labels, M };
}
function cmdReport(args) {
    const cases = buildCases();
    const load = (s) => [].concat(...s.split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).results));
    const B = summarize(cases, load(args.base)), N = summarize(cases, load(args.new));
    const lines = [];
    const sb = stats(B), sn = stats(N);
    lines.push('### Tổng hợp tập chính (set=main, tín hiệu tổng hợp; mỗi ca 24 s; ground truth = Tone dùng để tổng hợp)\n');
    lines.push('| Chỉ số | Baseline (main trước sửa) | Bản mới |\n|---|---|---|');
    const row = (n, k) => lines.push(`| ${n} | ${sb[k]} | ${sn[k]} |`);
    row('Số ca', 'n'); row('Accuracy (đúng Tone chính xác, khoá cuối)', 'acc'); row(`Accuracy Major (${sn.nMaj} ca)`, 'accMajor'); row(`Accuracy Minor (${sn.nMin} ca)`, 'accMinor');
    row('Không trả kết quả', 'noResult'); row('Sai nhưng ĐÃ khoá (tự tin)', 'wrongLock'); row('Số ca sai-có-khoá', 'nWrongLock');
    row('Thời gian khoá đầu tiên — trung vị (s)', 'medFirstLockS'); row('Thời gian khoá đầu tiên — p90 (s)', 'p90FirstLockS'); row('Thời gian tới khoá ĐÚNG đầu tiên — trung vị (s)', 'medFirstCorrectS');
    // theo nhóm con
    const sub = (ev, pre) => ev.filter((e) => e.id.startsWith(pre));
    lines.push('\n### Theo điều kiện (set=main)\n\n| Điều kiện | n | Baseline đúng | Mới đúng |\n|---|---|---|---|');
    const conds = [['g1.key.', 'hợp âm đầu = tonic, piano, -35 dBFS'], ['g1.keyF.', 'hợp âm đầu KHÔNG phải tonic'], ['g1.timbre.', 'âm sắc organ/guitar/pad/brass'], ['g1.detune', 'lệch tuning ±20/±35 cent']];
    for (const [p, d] of conds) { const b = sub(B, p), n = sub(N, p); lines.push(`| ${d} | ${n.length} | ${b.filter((e) => e.ok).length}/${b.length} | ${n.filter((e) => e.ok).length}/${n.length} |`); }
    // pop mơ hồ
    const popN = N.filter((e) => e.set === 'pop'), popB = B.filter((e) => e.set === 'pop');
    const cnt = (a, f) => a.filter(f).length;
    lines.push(`\n### Tiến trình pop (relative MƠ HỒ: Am-F-C-G ≡ C: vi-IV-I-V) — ${popN.length} ca\n\n| | Đúng chính xác | Relative (cùng bộ nốt) | Không kết quả | Lỗi khác |\n|---|---|---|---|---|`);
    for (const [nm, a] of [['Baseline', popB], ['Bản mới', popN]]) lines.push(`| ${nm} | ${cnt(a, (e) => e.ok)} | ${cnt(a, (e) => !e.ok && e.err === 'relative')} | ${cnt(a, (e) => e.noResult)} | ${cnt(a, (e) => !e.ok && !e.noResult && e.err !== 'relative')} |`);
    // nhóm 1/2 đặc biệt
    lines.push('\n### Từng ca đặc biệt (không thuộc tập main)\n\n| Ca | Mong đợi | Baseline | Bản mới |\n|---|---|---|---|');
    const fmt = (e) => !e ? 'n/a' : `${e.info ? 'INFO' : (e.ok ? 'PASS' : 'FAIL')} (${e.final || 'không khoá'}${e.nLocks > 1 ? `, ${e.nLocks} lần khoá` : ''}${e.soft ? ', ' + e.soft : ''}${e.detectLatency !== undefined && e.detectLatency !== null ? ', trễ ' + e.detectLatency + ' s' : ''})`;
    const bm = Object.fromEntries(B.map((e) => [e.id, e]));
    N.filter((e) => e.set !== 'main' && e.set !== 'pop').forEach((e) => lines.push(`| ${e.id} — ${e.desc} | ${e.expect}${e.truth ? ' ' + e.truth : ''} | ${fmt(bm[e.id])} | ${fmt(e)} |`));
    // confusion
    const cm = confusion(N), cb = confusion(B);
    const confMd = (c, title) => { const L = c.labels.concat(['none']); let s = `\n#### ${title}\n(hàng = Tone thật, cột = kết quả khoá cuối; chỉ in các ô ≠ 0 ngoài đường chéo)\n\n`; const bad = []; c.labels.forEach((t) => L.forEach((p) => { if (t !== p && c.M[t][p]) bad.push(`${t} → ${p}: ${c.M[t][p]}`); })); const diag = c.labels.reduce((a, t) => a + c.M[t][t], 0); const tot = c.labels.reduce((a, t) => a + L.reduce((b, p) => b + c.M[t][p], 0), 0); s += `Đường chéo (đúng): ${diag}/${tot}\n\n` + (bad.length ? bad.map((x) => '- ' + x).join('\n') : '- (không có ô sai)') + '\n'; return s; };
    lines.push('\n### Confusion matrix 24 Tone (tập main)'); lines.push(confMd(cb, 'Baseline')); lines.push(confMd(cm, 'Bản mới'));
    // theo từng root x mode, đúng/tổng
    lines.push('\n#### Đúng/tổng theo từng Tone (tập main, bản mới | baseline)\n\n| Tone | Mới | Baseline |\n|---|---|---|');
    for (const l of cm.labels) { const f = (ev) => { const a = ev.filter((e) => e.set === 'main' && e.expect === 'EXACT' && e.truth === l); return `${a.filter((e) => e.ok).length}/${a.length}`; }; lines.push(`| ${l} | ${f(N)} | ${f(B)} |`); }
    const out = lines.join('\n') + '\n';
    if (args.md) fs.writeFileSync(args.md, out); else console.log(out);
    if (args.json) fs.writeFileSync(args.json, JSON.stringify({ baseline: { stats: sb, eval: B.map(({ _c, ...r }) => r) }, new: { stats: sn, eval: N.map(({ _c, ...r }) => r) } }, null, 1));
}
const args = {}; const a = process.argv.slice(2); const cmd = a.shift(); for (let i = 0; i < a.length; i += 2) args[a[i].replace(/^--/, '')] = a[i + 1];
if (require.main === module) { if (cmd === 'run') cmdRun(args); else if (cmd === 'report') cmdReport(args); else console.error('dùng: run | report'); }
module.exports = { buildCases, evalCase, runOne, stats };
