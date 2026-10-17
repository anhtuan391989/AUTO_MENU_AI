#!/usr/bin/env node
'use strict';
// AI-ALG-08 — pipeline đánh giá Key/Mod trên nhạc thật.
//   node tools/algbench/realbench/run.js [--manifest f] [--audio-root dir] [--split dev|test] [--final-test] [--predictions dir] [--out report.json] [--tols 2,5,10,15,20,30] [--tol 10]
// - Chỉ chấm track có: audio_ok (hash khớp) VÀ reference_status=VERIFIED_INDEPENDENT. Nhãn UNVERIFIED không vào số liệu chính.
// - Test set chỉ được chạy với --final-test (không dùng để chỉnh tham số).
// - --predictions dir: đọc <track_id>.json {key_timeline,mod_events,duration_s} thay vì chạy engine (dùng cho test/so sánh).
const fs = require('fs'), path = require('path');
const { validateManifest, audioStatus, parseKey } = require('./schema.js'), M = require('./metrics.js');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const REPO = path.resolve(__dirname, '../../..');

// AI-ALG-09 — lý do một bài KHÔNG đủ điều kiện chấm accuracy (không bài nào bị mất khỏi bảng; chỉ ghi lý do).
function exclusions(t, st) {
    const r = [];
    if (st.status !== 'AUDIO_OK') r.push(st.status);
    if (t.reference_status !== 'VERIFIED_INDEPENDENT') r.push('LABEL_NOT_VERIFIED');
    if (t.label_state === 'NO_REFERENCE') r.push('NO_REFERENCE_LABEL');
    if (t.label_state === 'NEEDS_CLARIFICATION') r.push('LABEL_NEEDS_CLARIFICATION');
    if (!(t.segments && t.segments.length) && !(t.modulations && t.modulations.length) && t.reference_status === 'VERIFIED_INDEPENDENT') r.push('NO_SCORABLE_GROUND_TRUTH');
    return r;
}
const keyName = (k) => (k ? `${require('./schema.js').NOTE[k.pc]} ${k.mode}` : null);
// Bảng quan sát MÔ TẢ (nhãn người dùng chưa xác minh) — KHÔNG phải accuracy; dùng để chọn bài cần điều tra khi có audio.
function observationTable(tracks) {
    return tracks.filter((t) => t.observations || t.user_reference).map((t) => {
        const ref = t.user_reference && t.user_reference.key ? parseKey(t.user_reference.key) : null, row = { track_id: t.track_id, title: t.title, user_reference: keyName(ref), label_state: t.label_state || null };
        for (const who of ['auto_key', 'menu']) { const o = t.observations && t.observations[who]; if (!o) { row[who] = null; continue; }
            const k = o.key ? parseKey(o.key) : null; row[who] = { raw: o.raw, key: keyName(k), vs_reference: o.agrees_with_user_reference === true && !k ? 'agrees_as_reported' : (k && ref ? M.relation(ref, k) : 'unknown') }; }
        return row; });
}
function evaluate(manifest, o) {
    const v = validateManifest(manifest), rep = { schema: 'AI-ALG-08/report/v1', data_origin: 'REAL_MUSIC', valid: v.errors.length === 0, errors: v.errors, warnings: v.warnings, params: { split: o.split, final_test: !!o.finalTest, tol_s: o.tol, tolerances_s: o.tols, step_s: 1 }, tracks: [], counts: {} };
    const C = rep.counts = { total: 0, with_audio: 0, verified: 0, evaluated: 0, blocked_no_audio: 0, unverified_skipped: 0, test_skipped: 0 };
    if (!rep.valid) return rep;
    const keyRes = [], modRes = [];
    for (const t of v.tracks) {
        C.total++; const st = audioStatus(t, o.audioRoot), row = { track_id: t.track_id, split: t.split, reference_status: t.reference_status, audio_status: st.status, reason: st.reason }, ok = st.status === 'AUDIO_OK';
        if (ok) C.with_audio++; else C.blocked_no_audio++;
        if (t.reference_status === 'VERIFIED_INDEPENDENT') C.verified++;
        row.exclusion_reasons = exclusions(t, st); row.eligible_for_accuracy = row.exclusion_reasons.length === 0; row.title = t.title; row.track_group = t.track_group; rep.tracks.push(row);
        if (o.split && t.split !== o.split) { row.skipped = 'split'; continue; }
        if (t.split === 'test' && !o.finalTest) { row.skipped = 'test_set_requires_--final-test'; C.test_skipped++; continue; }
        if (!ok && !o.predictionsDir) { row.result = 'BLOCKED_NO_AUDIO'; continue; }
        if (t.reference_status !== 'VERIFIED_INDEPENDENT') { row.result = 'SKIPPED_UNVERIFIED_LABELS'; C.unverified_skipped++; continue; }
        let pred; if (o.predictionsDir) { const f = path.join(o.predictionsDir, t.track_id + '.json'); if (!fs.existsSync(f)) { row.result = 'NO_PREDICTION_FILE'; continue; } pred = JSON.parse(fs.readFileSync(f, 'utf8')); }
        else { const R = require('./engine_runner.js'), a = R.decode(st.file); pred = R.runEngines(REPO, a.pcm, a.sr); }
        const dur = pred.duration_s, ks = M.keyScore(t, pred, { duration: dur }), ms = M.modScore(t, pred, { tol: o.tol, duration: dur });
        row.result = 'EVALUATED'; row.duration_s = dur; row.key = ks; row.mod = ms; row.mod_sensitivity = M.sensitivity(t, pred, o.tols, { duration: dur });
        row.other_events = { non_modulation: (pred.mod_events || []).filter((e) => e.kind && e.kind !== 'MODULATION').length };
        C.evaluated++; keyRes.push(ks); modRes.push(ms);
    }
    C.eligible_for_accuracy = rep.tracks.filter((r) => r.eligible_for_accuracy).length; C.excluded = C.total - C.eligible_for_accuracy; rep.observations_descriptive_only = observationTable(v.tracks);
    rep.aggregate = C.evaluated ? { key: M.aggregateKey(keyRes), mod: M.aggregateMod(modRes) } : null;
    rep.status = C.evaluated ? 'EVALUATED' : 'BLOCKED_NO_AUDIO';
    return rep;
}
module.exports = { evaluate, exclusions, observationTable };
if (require.main === module) {
    const mf = path.resolve(arg('manifest', path.join(__dirname, '../manifest/real_music_manifest.json'))), manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const tols = String(arg('tols', '2,5,10,15,20,30')).split(',').map(Number), tol = +arg('tol', 10);
    const rep = evaluate(manifest, { audioRoot: path.resolve(arg('audio-root', path.dirname(mf))), split: arg('split', null), finalTest: !!arg('final-test', false), predictionsDir: arg('predictions', null), tol, tols });
    const out = arg('out', null); if (out) fs.writeFileSync(out, JSON.stringify(rep, null, 1));
    console.log(`manifest: ${rep.valid ? 'HỢP LỆ' : 'KHÔNG HỢP LỆ'} | status=${rep.status || 'INVALID'} | tracks=${rep.counts.total} audio=${rep.counts.with_audio} verified=${rep.counts.verified} evaluated=${rep.counts.evaluated}`);
    rep.errors.forEach((e) => console.log('  LỖI:', e)); rep.warnings.forEach((e) => console.log('  CẢNH BÁO:', e));
    console.log(`đủ điều kiện chấm accuracy: ${rep.counts.eligible_for_accuracy}/${rep.counts.total}; bị loại: ${rep.counts.excluded}`);
    rep.tracks.forEach((r) => console.log(`  - ${r.track_id} [${r.split}/${r.reference_status}] audio=${r.audio_status} eligible=${r.eligible_for_accuracy} lý do=${r.exclusion_reasons.join(',') || '-'} -> ${r.result || r.skipped || ''}`));
    if (rep.aggregate) { const a = rep.aggregate; console.log(`KEY exact=${a.key.exact_acc} tonic=${a.key.tonic_acc} mode=${a.key.mode_acc} relErr=${a.key.relative_err_rate} parErr=${a.key.parallel_err_rate} unknown=${a.key.unknown_rate}`); console.log(`MOD (tol=${tol}s) P=${a.mod.precision} R=${a.mod.recall} F1=${a.mod.f1} medLat=${a.mod.latency.median}`); }
    process.exitCode = rep.valid ? 0 : 1;
}
