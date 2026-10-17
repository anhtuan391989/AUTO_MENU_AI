'use strict';
// AI-ALG-08 — test schema, metric, pipeline (dữ liệu TEST_FIXTURE tự dựng, KHÔNG phải nhạc thật).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const R = path.resolve(__dirname, '../../tools/algbench/realbench');
const S = require(R + '/schema.js'), M = require(R + '/metrics.js'), { evaluate } = require(R + '/run.js');
let n = 0; const T = (name, fn) => { fn(); n++; console.log('ok', name); };
const key = (tonic, mode) => ({ tonic, mode });
const base = (o) => Object.assign({ track_id: 't1', audio_reference: { path: 'a.wav' }, audio_hash: null, reference_status: 'VERIFIED_INDEPENDENT', annotator: 'fixture', segments: [{ start_time: 0, end_time: 100, tonic: 'C', mode: 'major' }], modulations: [], annotation_notes: '', split: 'dev' }, o);

T('manifest repo hợp lệ và Thương Em là UNVERIFIED, không audio', () => {
    const m = JSON.parse(fs.readFileSync(R + '/../manifest/real_music_manifest.json', 'utf8')), v = S.validateManifest(m);
    assert.deepStrictEqual(v.errors, []); const t = m.tracks.find((x) => x.track_id === 'thuong-em');
    assert.strictEqual(t.reference_status, 'UNVERIFIED_REFERENCE'); assert.strictEqual(S.audioStatus(t, '.').status, 'BLOCKED_NO_AUDIO');
    const rep = evaluate(m, { audioRoot: '.', tol: 10, tols: [5, 10] }); assert.strictEqual(rep.status, 'BLOCKED_NO_AUDIO'); assert.strictEqual(rep.counts.evaluated, 0);
});
T('schema: tên nốt + bémol, mode undetermined', () => {
    assert.strictEqual(S.pc('Eb'), 3); assert.strictEqual(S.pc('D#'), 3); assert.strictEqual(S.pc('H'), null);
    assert.deepStrictEqual(S.parseKey({ mode: 'undetermined' }), { pc: null, mode: 'undetermined' }); assert.strictEqual(S.parseKey({ tonic: 'C', mode: 'dorian' }), null);
});
T('schema: bắt lỗi thiếu trường, chồng lấn, hash sai, from==to, rò rỉ dev/test', () => {
    assert.ok(S.validateTrack(base({ split: 'x' }), 0).errors.length);
    assert.ok(S.validateTrack(base({ segments: [{ start_time: 0, end_time: 10, tonic: 'C', mode: 'major' }, { start_time: 5, end_time: 20, tonic: 'D', mode: 'major' }] }), 0).errors.some((e) => /chồng lấn/.test(e)));
    assert.ok(S.validateTrack(base({ audio_hash: 'abc' }), 0).errors.length);
    assert.ok(S.validateTrack(base({ modulations: [{ time: 5, from_key: key('C', 'major'), to_key: key('C', 'major') }] }), 0).errors.length);
    const h = 'a'.repeat(64), v = S.validateManifest({ tracks: [base({ track_id: 'a', audio_hash: h, split: 'dev' }), base({ track_id: 'b', audio_hash: h, split: 'test' })] });
    assert.ok(v.errors.some((e) => /rò rỉ/.test(e)));
    assert.ok(S.validateManifest({ tracks: [base(), base()] }).errors.some((e) => /trùng/.test(e)));
});
T('schema: audio_hash khớp / lệch / thiếu', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-')); fs.writeFileSync(path.join(d, 'a.wav'), 'xyz'); const h = S.sha256File(path.join(d, 'a.wav'));
    assert.strictEqual(S.audioStatus(base({ audio_hash: h }), d).status, 'AUDIO_OK'); assert.strictEqual(S.audioStatus(base({ audio_hash: 'b'.repeat(64) }), d).status, 'BLOCKED_HASH_MISMATCH');
    assert.strictEqual(S.audioStatus(base(), d).status, 'BLOCKED_NO_HASH');
});
T('metric: quan hệ key (exact/relative/parallel/other/none) và delta', () => {
    const C = { pc: 0, mode: 'major' };
    assert.strictEqual(M.relation(C, { pc: 0, mode: 'major' }), 'exact'); assert.strictEqual(M.relation(C, { pc: 9, mode: 'minor' }), 'relative');
    assert.strictEqual(M.relation(C, { pc: 0, mode: 'minor' }), 'parallel'); assert.strictEqual(M.relation(C, { pc: 7, mode: 'major' }), 'other'); assert.strictEqual(M.relation(C, null), 'none');
    assert.strictEqual(M.signedDelta(2, 3), 1); assert.strictEqual(M.signedDelta(3, 2), -1); assert.strictEqual(M.signedDelta(0, 11), -1); assert.strictEqual(M.signedDelta(0, 6), 6);
});
T('metric key: mẫu số, relative/parallel/unknown, loại đoạn undetermined, cửa sổ', () => {
    const tr = base({ segments: [{ start_time: 0, end_time: 40, tonic: 'C', mode: 'major' }, { start_time: 40, end_time: 60, mode: 'undetermined', tonic: null }] });
    // 0-10 chưa có key (none), 10-20 relative (A minor), 20-30 parallel (C minor), 30-40 exact
    const pred = { key_timeline: [{ t: 10, pc: 9, mode: 'minor' }, { t: 20, pc: 0, mode: 'minor' }, { t: 30, pc: 0, mode: 'major' }] };
    const k = M.keyScore(tr, pred, { windows: [5, 10, 35] });
    assert.strictEqual(k.counts.n, 40); assert.strictEqual(k.counts.exact, 10); assert.strictEqual(k.counts.relative, 10); assert.strictEqual(k.counts.parallel, 10); assert.strictEqual(k.counts.none, 10);
    assert.strictEqual(k.exact_acc, 0.25); assert.strictEqual(k.unknown_rate, 0.25); assert.strictEqual(k.counts.excluded_undetermined_s, 20);
    assert.strictEqual(k.counts.mode, 10); // chỉ đoạn exact có mode đúng (relative/parallel đều sai mode; none không tính)
    assert.strictEqual(k.by_window[5].n, 1); assert.strictEqual(k.by_window[5].exact, 0); assert.strictEqual(k.by_window[35].exact, 1);
    assert.strictEqual(k.confusion[0][24], 10); assert.strictEqual(k.confusion[0][21], 10);
});
T('metric key: end_time null không có duration bị loại, có duration thì tính', () => {
    const tr = base({ segments: [{ start_time: 0, end_time: null, tonic: 'C', mode: 'major' }] }); const pred = { key_timeline: [{ t: 0, pc: 0, mode: 'major' }] };
    assert.strictEqual(M.keyScore(tr, pred, {}).counts.excluded_unbounded_segments, 1); assert.strictEqual(M.keyScore(tr, pred, { duration: 30 }).counts.n, 30);
});
const modTrack = () => base({ modulations: [{ time: 100, from_key: key('D', 'major'), to_key: key('Eb', 'major') }, { time: 200, from_key: key('Eb', 'major'), to_key: key('F', 'major') }] });
T('metric mod: ghép 1-1, TP/FP/FN, latency, delta đúng/sai, FP ngoài vùng mod', () => {
    const pred = { mod_events: [{ t: 108, kind: 'MODULATION', semitone_delta: 1 }, { t: 150, kind: 'MODULATION', semitone_delta: 3 }, { t: 207, kind: 'MODULATION', semitone_delta: 1 }, { t: 99, kind: 'MODE_CHANGE' }] };
    const r = M.modScore(modTrack(), pred, { tol: 10, duration: 300 });
    assert.deepStrictEqual([r.counts.tp, r.counts.fp, r.counts.fn], [2, 1, 0]); assert.strictEqual(r.counts.fp_outside_mod_windows, 1);
    assert.strictEqual(r.precision, 2 / 3); assert.strictEqual(r.recall, 1); assert.strictEqual(r.latency.median, 7.5); assert.strictEqual(r.latency.p90, 8);
    assert.strictEqual(r.counts.delta_correct, 1); // +1 đúng ở sự kiện 1; sự kiện 2 gt +2 báo +1 => sai
    assert.strictEqual(r.semitone_accuracy, 0.5); assert.strictEqual(r.strict_recall, 0.5); assert.ok(r.by_type['+1'] && r.by_type['+2']);
    assert.ok(r.fp_per_min_non_mod > 0);
});
T('metric mod: tolerance bắt buộc; độ nhạy đổi kết quả; báo sớm/trễ ngoài cửa sổ = FP+FN', () => {
    assert.throws(() => M.modScore(modTrack(), { mod_events: [] }, {}));
    const pred = { mod_events: [{ t: 115, kind: 'MODULATION', semitone_delta: 1 }] };
    const s = M.sensitivity(modTrack(), pred, [5, 10, 20], { duration: 300 });
    assert.deepStrictEqual(s.map((x) => x.tp), [0, 0, 1]); assert.strictEqual(M.modScore(modTrack(), { mod_events: [{ t: 90, kind: 'MODULATION' }] }, { tol: 10 }).counts.tp, 0);
    assert.strictEqual(M.modScore(modTrack(), { mod_events: [{ t: 99, kind: 'MODULATION' }] }, { tol: 10 }).latency.median, -1); // báo sớm 1 s vẫn khớp (pre=2)
});
T('metric mod: nhóm đối chứng không modulation => mọi sự kiện là FP', () => {
    const r = M.modScore(base(), { mod_events: [{ t: 30, kind: 'MODULATION' }, { t: 60, kind: 'MODULATION' }] }, { tol: 10, duration: 120 });
    assert.strictEqual(r.counts.fp, 2); assert.strictEqual(r.precision, 0); assert.strictEqual(r.recall, null); assert.strictEqual(r.fp_per_min_non_mod, 1);
});
T('pipeline: dữ liệu giả tách bạch, chỉ chấm VERIFIED, test cần --final-test, UNVERIFIED không vào số liệu', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-')), pd = path.join(d, 'pred'); fs.mkdirSync(pd);
    const mk = (id, split, st) => { fs.writeFileSync(path.join(d, id + '.wav'), id); return base({ track_id: id, split, reference_status: st, audio_reference: { path: id + '.wav' }, audio_hash: S.sha256File(path.join(d, id + '.wav')),
        modulations: [{ time: 50, from_key: key('C', 'major'), to_key: key('D', 'major') }] }); };
    const man = { tracks: [mk('dev-ok', 'dev', 'VERIFIED_INDEPENDENT'), mk('dev-unv', 'dev', 'UNVERIFIED_REFERENCE'), mk('test-ok', 'test', 'VERIFIED_INDEPENDENT')] };
    for (const id of ['dev-ok', 'dev-unv', 'test-ok']) fs.writeFileSync(path.join(pd, id + '.json'), JSON.stringify({ duration_s: 100, key_timeline: [{ t: 0, pc: 0, mode: 'major' }], mod_events: [{ t: 55, kind: 'MODULATION', semitone_delta: 2 }] }));
    const o = { audioRoot: d, predictionsDir: pd, tol: 10, tols: [5, 10] }, r1 = evaluate(man, o);
    assert.strictEqual(r1.counts.evaluated, 1); assert.strictEqual(r1.counts.unverified_skipped, 1); assert.strictEqual(r1.counts.test_skipped, 1);
    assert.strictEqual(r1.tracks.find((x) => x.track_id === 'test-ok').skipped, 'test_set_requires_--final-test');
    assert.strictEqual(r1.aggregate.mod.counts.tp, 1); assert.strictEqual(r1.data_origin, 'REAL_MUSIC');
    const r2 = evaluate(man, Object.assign({ finalTest: true }, o)); assert.strictEqual(r2.counts.evaluated, 2);
    assert.strictEqual(evaluate({ tracks: [base({ split: 'zzz' })] }, o).valid, false);
});

// ---- AI-ALG-09 (cập nhật 10R-FINAL: manifest 20 bài): manifest, trường mở rộng, readiness ----
const MAN = JSON.parse(fs.readFileSync(R + '/../manifest/real_music_manifest.json', 'utf8')), byId = (id) => MAN.tracks.find((x) => x.track_id === id), { exclusions, observationTable } = require(R + '/run.js');
T('A09 manifest: 20 bài duy nhất, hợp lệ, tất cả UNVERIFIED, 0 bài đủ điều kiện chấm', () => {
    assert.strictEqual(MAN.tracks.length, 20); assert.strictEqual(new Set(MAN.tracks.map((x) => x.track_id)).size, 20);
    assert.deepStrictEqual(S.validateManifest(MAN).errors, []); assert.ok(MAN.tracks.every((x) => x.reference_status === 'UNVERIFIED_REFERENCE' && x.audio_hash === null && x.segments.length === 0));
    const rep = evaluate(MAN, { audioRoot: '.', tol: 10, tols: [10], finalTest: true });
    assert.strictEqual(rep.status, 'BLOCKED_NO_AUDIO'); assert.strictEqual(rep.counts.eligible_for_accuracy, 0); assert.strictEqual(rep.counts.excluded, 20); assert.strictEqual(rep.aggregate, null);
    assert.ok(rep.tracks.every((r) => r.exclusion_reasons.includes('LABEL_NOT_VERIFIED') && r.exclusion_reasons.includes('BLOCKED_NO_AUDIO')));
});
T('A09 dữ liệu gốc được bảo toàn (nhãn/Auto/Menu nguyên văn)', () => {
    const o = (id, w) => byId(id).observations[w].raw, ref = (id) => byId(id).user_reference.key;
    assert.deepStrictEqual([ref('don-dau-vo-cung'), o('don-dau-vo-cung', 'auto_key'), o('don-dau-vo-cung', 'menu')], [{ tonic: 'A', mode: 'minor' }, 'C major', 'A minor']);
    assert.strictEqual(o('thuong-em', 'menu'), 'B minor'); assert.strictEqual(byId('thuong-em').user_reference.modulation.time, 188); assert.strictEqual(byId('thuong-em').observations.auto_key.agrees_with_user_reference, true);
    assert.strictEqual(byId('yeu-lai-tu-dau').user_reference.modulation.time, null); assert.strictEqual(o('anh-khong-tha-thu', 'auto_key'), 'E major'); assert.strictEqual(o('giả'.length ? 'gia-vo-thuong-anh-duoc' : '', 'menu'), 'A# minor');
    assert.strictEqual(byId('phia-sau-mot-co-gai').track_group, 'modulation_unclear'); assert.strictEqual(byId('vien-da-nho').user_reference.key, null); assert.strictEqual(byId('vien-da-nho').label_state, 'NO_REFERENCE');
    assert.strictEqual(byId('hoa-phan-ai-luu').label_state, 'NEEDS_CLARIFICATION'); assert.strictEqual(byId('hoa-phan-ai-luu').user_reference.key.mode, 'minor');
});
T('A09 enharmonic: A# minor == Bb minor, Db == C#', () => {
    assert.deepStrictEqual(S.parseKey({ tonic: 'A#', mode: 'minor' }), S.parseKey({ tonic: 'Bb', mode: 'minor' })); assert.strictEqual(S.pc('Db'), S.pc('C#'));
    assert.strictEqual(M.relation(S.parseKey({ tonic: 'Db', mode: 'major' }), S.parseKey({ tonic: 'C#', mode: 'major' })), 'exact');
});
T('A09 schema mở rộng: label_state, user_reference, observations kiểm tra chặt', () => {
    const b = (o) => S.validateTrack(Object.assign(base({ reference_status: 'UNVERIFIED_REFERENCE' }), o), 0).errors;
    assert.deepStrictEqual(b({ label_state: 'USER_LABEL_UNVERIFIED', title: 'x', user_reference: { key: key('C', 'major') }, observations: { auto_key: { raw: 'C', key: key('C', 'major'), agrees_with_user_reference: true }, menu: null } }), []);
    assert.ok(b({ label_state: 'VERIFIED' }).length); assert.ok(b({ label_state: 'zzz' }).length); assert.ok(b({ title: '' }).length);
    assert.ok(b({ user_reference: { key: { tonic: 'H', mode: 'major' } } }).length); assert.ok(b({ observations: { auto_key: { key: key('C', 'major') } } }).length);
    assert.ok(S.validateTrack(base({ label_state: 'NO_REFERENCE' }), 0).errors.length); // VERIFIED không đi cùng NO_REFERENCE
    assert.ok(S.validateTrack(base({ audio_reference: { path: null, source_url: null } }), 0).errors.length); // VERIFIED phải có nguồn audio
    assert.deepStrictEqual(S.validateTrack(base({ reference_status: 'UNVERIFIED_REFERENCE', audio_reference: { path: null, source_url: null } }), 0).errors, []);
});
T('A09 exclusions + observationTable (mô tả, không phải accuracy)', () => {
    assert.deepStrictEqual(exclusions(base(), { status: 'AUDIO_OK' }), []); assert.deepStrictEqual(exclusions(base({ reference_status: 'UNVERIFIED_REFERENCE' }), { status: 'BLOCKED_NO_AUDIO' }), ['BLOCKED_NO_AUDIO', 'LABEL_NOT_VERIFIED']);
    assert.ok(exclusions(base({ label_state: 'NEEDS_CLARIFICATION', reference_status: 'UNVERIFIED_REFERENCE' }), { status: 'AUDIO_OK' }).includes('LABEL_NEEDS_CLARIFICATION'));
    const t = observationTable(MAN.tracks), g = (id) => t.find((x) => x.track_id === id);
    assert.strictEqual(g('thuong-em').menu.vs_reference, 'relative'); assert.strictEqual(g('thuong-em').auto_key.vs_reference, 'agrees_as_reported'); assert.strictEqual(g('don-dau-vo-cung').auto_key.vs_reference, 'relative');
    assert.strictEqual(g('me-em').menu.vs_reference, 'other'); assert.strictEqual(g('phia-sau-mot-co-gai').menu.vs_reference, 'exact'); assert.strictEqual(g('vien-da-nho').menu.raw, 'B Major'); assert.strictEqual(g('vien-da-nho').menu.vs_reference, 'unknown'); /* có Menu từ bảng nguồn nhưng KHÔNG có nhãn tham chiếu => không so được */
});
T('A09 chia tập: quy tắc cố định theo track_id, mọi bài có split, không rò rỉ', () => {
    const crypto = require('crypto'); MAN.tracks.forEach((x) => assert.strictEqual(x.split, crypto.createHash('sha256').update(x.track_id).digest()[0] % 10 < 3 ? 'test' : 'dev'));
    assert.ok(MAN.tracks.some((x) => x.split === 'dev') && MAN.tracks.some((x) => x.split === 'test'));
});
console.log(`RealBenchA08: ${n} nhóm OK`);
