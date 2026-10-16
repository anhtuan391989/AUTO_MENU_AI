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
function evaluate(manifest, o) {
    const v = validateManifest(manifest), rep = { schema: 'AI-ALG-08/report/v1', data_origin: 'REAL_MUSIC', valid: v.errors.length === 0, errors: v.errors, warnings: v.warnings, params: { split: o.split, final_test: !!o.finalTest, tol_s: o.tol, tolerances_s: o.tols, step_s: 1 }, tracks: [], counts: {} };
    const C = rep.counts = { total: 0, with_audio: 0, verified: 0, evaluated: 0, blocked_no_audio: 0, unverified_skipped: 0, test_skipped: 0 };
    if (!rep.valid) return rep;
    const keyRes = [], modRes = [];
    for (const t of v.tracks) {
        C.total++; const st = audioStatus(t, o.audioRoot), row = { track_id: t.track_id, split: t.split, reference_status: t.reference_status, audio_status: st.status, reason: st.reason }, ok = st.status === 'AUDIO_OK';
        if (ok) C.with_audio++; else C.blocked_no_audio++;
        if (t.reference_status === 'VERIFIED_INDEPENDENT') C.verified++;
        rep.tracks.push(row);
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
    rep.aggregate = C.evaluated ? { key: M.aggregateKey(keyRes), mod: M.aggregateMod(modRes) } : null;
    rep.status = C.evaluated ? 'EVALUATED' : 'BLOCKED_NO_AUDIO';
    return rep;
}
module.exports = { evaluate };
if (require.main === module) {
    const mf = path.resolve(arg('manifest', path.join(__dirname, '../manifest/real_music_manifest.json'))), manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const tols = String(arg('tols', '2,5,10,15,20,30')).split(',').map(Number), tol = +arg('tol', 10);
    const rep = evaluate(manifest, { audioRoot: path.resolve(arg('audio-root', path.dirname(mf))), split: arg('split', null), finalTest: !!arg('final-test', false), predictionsDir: arg('predictions', null), tol, tols });
    const out = arg('out', null); if (out) fs.writeFileSync(out, JSON.stringify(rep, null, 1));
    console.log(`manifest: ${rep.valid ? 'HỢP LỆ' : 'KHÔNG HỢP LỆ'} | status=${rep.status || 'INVALID'} | tracks=${rep.counts.total} audio=${rep.counts.with_audio} verified=${rep.counts.verified} evaluated=${rep.counts.evaluated}`);
    rep.errors.forEach((e) => console.log('  LỖI:', e)); rep.warnings.forEach((e) => console.log('  CẢNH BÁO:', e));
    rep.tracks.forEach((r) => console.log(`  - ${r.track_id} [${r.split}/${r.reference_status}] audio=${r.audio_status} -> ${r.result || r.skipped || ''}${r.reason ? ' (' + r.reason + ')' : ''}`));
    if (rep.aggregate) { const a = rep.aggregate; console.log(`KEY exact=${a.key.exact_acc} tonic=${a.key.tonic_acc} mode=${a.key.mode_acc} relErr=${a.key.relative_err_rate} parErr=${a.key.parallel_err_rate} unknown=${a.key.unknown_rate}`); console.log(`MOD (tol=${tol}s) P=${a.mod.precision} R=${a.mod.recall} F1=${a.mod.f1} medLat=${a.mod.latency.median}`); }
    process.exitCode = rep.valid ? 0 : 1;
}
