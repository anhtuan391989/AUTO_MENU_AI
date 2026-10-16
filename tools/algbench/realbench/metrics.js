'use strict';
// AI-ALG-08 — metric Key/Modulation (hàm thuần, không I/O). Định nghĩa chi tiết: tools/algbench/realbench/README.md
const { parseKey } = require('./schema.js');

const kidx = (pc, mode) => pc + (mode === 'minor' ? 12 : 0);              // lớp 0..23 (0-11 major, 12-23 minor)
const NONE = 24;                                                          // cột "engine không báo key"
const signedDelta = (from, to) => { let d = ((to - from) % 12 + 12) % 12; return d > 6 ? d - 12 : d; }; // −5..+6 (6 = tritone, +6)
const relMajorOf = (pc, mode) => (mode === 'minor' ? (pc + 3) % 12 : pc);
function relation(truth, pred) {                                          // truth,pred = {pc,mode}; pred có thể null
    if (!pred || pred.pc === null || pred.pc === undefined) return 'none';
    if (truth.pc === pred.pc && truth.mode === pred.mode) return 'exact';
    if (truth.pc === pred.pc) return 'parallel';                          // cùng tonic, khác mode
    if (truth.mode !== pred.mode && relMajorOf(truth.pc, truth.mode) === relMajorOf(pred.pc, pred.mode)) return 'relative';
    return 'other';
}
// key dự đoán tại thời điểm t: timeline = [{t, pc|null, mode}] sắp theo t. Trước mục đầu tiên = null (chưa có key).
function predAt(timeline, t) {
    let lo = 0, hi = timeline.length - 1, ans = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (timeline[m].t <= t) { ans = timeline[m]; lo = m + 1; } else hi = m - 1; }
    return ans && ans.pc !== null && ans.pc !== undefined ? { pc: ans.pc, mode: ans.mode } : null;
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))]; };
const ratio = (a, b) => (b > 0 ? a / b : null);

function segsOf(track, duration) {                                        // đoạn đã parse; end_time null -> duration (nếu biết)
    return (track.segments || []).map((s) => { const k = parseKey(s); return { start: s.start_time, end: s.end_time === null ? (Number.isFinite(duration) ? duration : null) : s.end_time, key: k }; });
}
// ---- KEY ----
// Mẫu số: các mốc lấy mẫu mỗi `step` giây trong đoạn CÓ key xác định (mode != undetermined). Đoạn undetermined/không xác định độ dài bị loại và đếm riêng.
// Engine không báo key tại mốc đó (null) => tính SAI cho exact/tonic/mode và đếm vào unknown_rate.
function keyScore(track, pred, opt = {}) {
    const step = opt.step || 1, duration = opt.duration, windows = opt.windows || [5, 10, 20, 40, 60];
    const conf = Array.from({ length: 24 }, () => new Array(25).fill(0));
    const c = { n: 0, exact: 0, tonic: 0, mode: 0, relative: 0, parallel: 0, other: 0, none: 0, excluded_undetermined_s: 0, excluded_unbounded_segments: 0 };
    const win = {}; windows.forEach((w) => { win[w] = { n: 0, exact: 0 }; });
    for (const s of segsOf(track, duration)) {
        if (!s.key) continue;
        if (s.key.mode === 'undetermined') { if (s.end !== null) c.excluded_undetermined_s += s.end - s.start; continue; }
        if (s.end === null) { c.excluded_unbounded_segments++; continue; }
        for (let t = s.start; t < s.end - 1e-9; t += step) {
            const p = predAt(pred.key_timeline || [], t), r = relation(s.key, p);
            c.n++; conf[kidx(s.key.pc, s.key.mode)][p ? kidx(p.pc, p.mode) : NONE]++;
            if (r === 'exact') c.exact++;
            if (p && p.pc === s.key.pc) c.tonic++; if (p && p.mode === s.key.mode) c.mode++;
            if (r === 'relative' || r === 'parallel' || r === 'other' || r === 'none') c[r]++;
        }
        for (const w of windows) if (s.start + w <= s.end) { const p = predAt(pred.key_timeline || [], s.start + w); win[w].n++; if (relation(s.key, p) === 'exact') win[w].exact++; }
    }
    return { counts: c, confusion: conf, by_window: win, exact_acc: ratio(c.exact, c.n), tonic_acc: ratio(c.tonic, c.n), mode_acc: ratio(c.mode, c.n),
        relative_err_rate: ratio(c.relative, c.n), parallel_err_rate: ratio(c.parallel, c.n), unknown_rate: ratio(c.none, c.n) };
}
// ---- MOD ----
function gtEvents(track) { return (track.modulations || []).map((m) => { const f = parseKey(m.from_key), t = parseKey(m.to_key); return { t: m.time, delta: signedDelta(f.pc, t.pc), from: f, to: t }; }).sort((a, b) => a.t - b.t); }
// Quy tắc ghép: dự đoán p khớp mốc g nếu g.t - pre <= p.t <= g.t + tol; ghép 1-1 tham lam theo |p.t-g.t| nhỏ nhất. Chỉ sự kiện kind="MODULATION".
// Độ trễ = p.t - g.t (âm = báo sớm). tol là tham số bắt buộc người gọi chọn; luôn báo cáo kèm phân tích độ nhạy.
function modScore(track, pred, opt = {}) {
    const tol = opt.tol, pre = opt.pre === undefined ? 2 : opt.pre; if (!Number.isFinite(tol)) throw new Error('modScore: cần tol (giây)');
    const gt = gtEvents(track), ps = (pred.mod_events || []).filter((e) => (e.kind || 'MODULATION') === 'MODULATION').map((e) => Object.assign({}, e)).sort((a, b) => a.t - b.t);
    const cand = [];
    gt.forEach((g, gi) => ps.forEach((p, pi) => { if (p.t >= g.t - pre && p.t <= g.t + tol) cand.push({ gi, pi, d: Math.abs(p.t - g.t) }); }));
    cand.sort((a, b) => a.d - b.d); const gu = new Set(), pu = new Set(), pairs = [];
    for (const m of cand) if (!gu.has(m.gi) && !pu.has(m.pi)) { gu.add(m.gi); pu.add(m.pi); pairs.push(m); }
    const tp = pairs.length, fn = gt.length - tp, fp = ps.length - tp;
    const hasDelta = (p) => Number.isFinite(p.semitone_delta);
    const deltaOk = pairs.filter((m) => hasDelta(ps[m.pi]) && (((ps[m.pi].semitone_delta - gt[m.gi].delta) % 12) + 12) % 12 === 0);
    const deltaKnown = pairs.filter((m) => hasDelta(ps[m.pi]));
    const lat = pairs.map((m) => ps[m.pi].t - gt[m.gi].t);
    // FP trong vùng KHÔNG modulation: dự đoán chưa ghép và không rơi vào cửa sổ [g.t-pre, g.t+tol] của mốc nào
    const inWin = (t) => gt.some((g) => t >= g.t - pre && t <= g.t + tol);
    const fpOutside = ps.filter((p, pi) => !pu.has(pi) && !inWin(p.t)).length;
    const dur = opt.duration, winS = gt.reduce((a) => a + pre + tol, 0), nonModS = Number.isFinite(dur) ? Math.max(0, dur - winS) : null;
    const bins = [['<0', -Infinity, 0], ['0-2', 0, 2], ['2-5', 2, 5], ['5-10', 5, 10], ['10-20', 10, 20], ['20-30', 20, 30], ['>=30', 30, Infinity]];
    const hist = {}; bins.forEach(([k, a, b]) => { hist[k] = lat.filter((x) => x >= a && x < b).length; });
    const byType = {};
    gt.forEach((g, gi) => { const k = (g.delta > 0 ? '+' : '') + g.delta; const o = byType[k] || (byType[k] = { gt: 0, tp: 0, strict_tp: 0, latencies: [] }); o.gt++;
        const m = pairs.find((x) => x.gi === gi); if (m) { o.tp++; o.latencies.push(ps[m.pi].t - g.t); if (deltaOk.includes(m)) o.strict_tp++; } });
    const strictTp = deltaOk.length;
    return { tol, pre, counts: { gt: gt.length, pred: ps.length, tp, fp, fn, fp_outside_mod_windows: fpOutside, delta_known: deltaKnown.length, delta_correct: deltaOk.length, strict_tp: strictTp },
        precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: tp ? 2 * tp / (2 * tp + fp + fn) : (gt.length + ps.length ? 0 : null),
        strict_precision: ratio(strictTp, tp + fp), strict_recall: ratio(strictTp, tp + fn), semitone_accuracy: ratio(deltaOk.length, deltaKnown.length),
        latency: { n: lat.length, median: median(lat), p90: pct(lat, 90), mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null, min: lat.length ? Math.min(...lat) : null, max: lat.length ? Math.max(...lat) : null, histogram: hist, values: lat },
        fp_per_min_non_mod: nonModS ? fpOutside / (nonModS / 60) : null, non_mod_seconds: nonModS, by_type: byType };
}
function sensitivity(track, pred, tols, opt = {}) { return tols.map((tol) => { const r = modScore(track, pred, Object.assign({}, opt, { tol })); return { tol, precision: r.precision, recall: r.recall, f1: r.f1, median_latency: r.latency.median, tp: r.counts.tp, fp: r.counts.fp, fn: r.counts.fn }; }); }
// Gộp nhiều track: key = cộng mẫu (micro) + trung bình theo bài (macro); mod = cộng số đếm (micro) + latency gộp.
function aggregateKey(list) {
    const c = { n: 0, exact: 0, tonic: 0, mode: 0, relative: 0, parallel: 0, other: 0, none: 0 }, conf = Array.from({ length: 24 }, () => new Array(25).fill(0)), win = {};
    list.forEach((r) => { for (const k of Object.keys(c)) c[k] += r.counts[k]; r.confusion.forEach((row, i) => row.forEach((v, j) => { conf[i][j] += v; }));
        for (const w of Object.keys(r.by_window)) { win[w] = win[w] || { n: 0, exact: 0 }; win[w].n += r.by_window[w].n; win[w].exact += r.by_window[w].exact; } });
    const macro = list.filter((r) => r.exact_acc !== null); 
    return { tracks: list.length, counts: c, confusion: conf, exact_acc: ratio(c.exact, c.n), tonic_acc: ratio(c.tonic, c.n), mode_acc: ratio(c.mode, c.n), relative_err_rate: ratio(c.relative, c.n), parallel_err_rate: ratio(c.parallel, c.n), unknown_rate: ratio(c.none, c.n),
        macro_exact_acc: macro.length ? macro.reduce((a, r) => a + r.exact_acc, 0) / macro.length : null, by_window: Object.fromEntries(Object.entries(win).map(([w, o]) => [w, Object.assign({ acc: ratio(o.exact, o.n) }, o)])) };
}
function aggregateMod(list) {
    const c = { gt: 0, pred: 0, tp: 0, fp: 0, fn: 0, fp_outside_mod_windows: 0, delta_known: 0, delta_correct: 0, strict_tp: 0 }; const lat = [];
    list.forEach((r) => { for (const k of Object.keys(c)) c[k] += r.counts[k]; lat.push(...r.latency.values); });
    return { tracks: list.length, counts: c, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.tp, c.tp + c.fn), f1: c.tp ? 2 * c.tp / (2 * c.tp + c.fp + c.fn) : null, semitone_accuracy: ratio(c.delta_correct, c.delta_known),
        latency: { n: lat.length, median: median(lat), p90: pct(lat, 90) } };
}
module.exports = { kidx, NONE, signedDelta, relation, predAt, keyScore, modScore, sensitivity, gtEvents, aggregateKey, aggregateMod, median, pct };
