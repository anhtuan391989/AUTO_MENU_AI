'use strict';
// AI-ALG-10 — test đối chiếu bảng nguồn ↔ manifest, enharmonic, Major/Minor tách biệt (dữ liệu TEST_FIXTURE).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const R = path.resolve(__dirname, '../../tools/algbench/realbench'), S = require(R + '/schema.js'), { reconcile, loadSource, fold } = require(R + '/reconcile.js');
const MAN = JSON.parse(fs.readFileSync(R + '/../manifest/real_music_manifest.json', 'utf8'));
let n = 0; const T = (name, fn) => { fn(); n++; console.log('ok', name); };

// Dựng "bảng nguồn" (đủ bài của manifest) từ chính manifest (tự nhất quán) để kiểm tra đường đi không-lệch.
const rowOf = (t) => ({ title: t.title, url: t.audio_reference.source_url || '', key: t.user_reference.key ? S.keyLabel(S.parseKey(t.user_reference.key)) : '',
    auto: t.observations && t.observations.auto_key ? t.observations.auto_key.raw : '', menu: t.observations && t.observations.menu ? t.observations.menu.raw : '', note: t.annotation_notes || '' });
const baseRows = () => MAN.tracks.map(rowOf);

T('parseKeyString: enharmonic bằng nhau, Major/Minor và relative KHÔNG bằng nhau', () => {
    const k = (x) => S.keyLabel(S.parseKeyString(x));
    assert.strictEqual(k('Bb Minor'), k('A# minor')); assert.strictEqual(k('Db major'), k('C# Major')); assert.strictEqual(k('E Minor'), 'E minor');
    assert.notStrictEqual(k('D major'), k('B minor')); assert.notStrictEqual(k('C major'), k('C minor')); assert.strictEqual(S.parseKeyString('C#'), null); assert.strictEqual(S.parseKeyString('H minor'), null);
});
T('fold: bỏ dấu tiếng Việt/đ, không phân biệt hoa-thường', () => { assert.strictEqual(fold('Đớn Đau Vô Cùng'), fold('don dau vo cung')); assert.strictEqual(fold('THƯƠNG EM'), 'thuong em'); });
T('manifest repo: họa phận ái lưu giữ E minor cả hai engine + NEEDS_CLARIFICATION, nhãn không bị đổi', () => {
    const t = MAN.tracks.find((x) => x.track_id === 'hoa-phan-ai-luu');
    assert.strictEqual(t.label_state, 'NEEDS_CLARIFICATION'); assert.strictEqual(t.reference_status, 'UNVERIFIED_REFERENCE'); assert.deepStrictEqual(t.user_reference.key, { tonic: 'E', mode: 'minor' });
    assert.strictEqual(t.observations.auto_key.raw, 'E minor'); assert.strictEqual(t.observations.menu.raw, 'E minor'); assert.ok(/sai tone/.test(t.observations.tester_note));
    const v = MAN.tracks.find((x) => x.track_id === 'vien-da-nho'); assert.strictEqual(v.user_reference.key, null); assert.strictEqual(v.label_state, 'NO_REFERENCE');
    assert.ok(MAN.tracks.every((x) => x.reference_status !== 'VERIFIED_INDEPENDENT' && x.audio_hash === null && x.segments.length === 0));
});
T('reconcile: bảng tự nhất quán => 0 lệch; kỳ vọng đúng số bài => counts_ok, sai => false', () => {
    const r = reconcile(baseRows(), MAN, { expect: 20 }); assert.strictEqual(r.matched, 20); assert.strictEqual(r.field_mismatches.length, 0); assert.strictEqual(r.missing_in_manifest.length, 0);
    assert.strictEqual(r.source_count, 20); assert.strictEqual(r.counts_ok, true); assert.strictEqual(reconcile(baseRows(), MAN, { expect: 21 }).counts_ok, false);
    assert.strictEqual(reconcile(baseRows(), MAN, {}).counts_ok, true);
});
T('reconcile: bài thiếu, thừa, trùng, dòng thiếu tên', () => {
    const src = baseRows().filter((r) => r.title !== 'Mê Em'); src.push({ title: 'Bài Mới A', url: '', key: 'C Major', auto: '', menu: '', note: '' }, { title: 'bai moi a', url: '', key: '', auto: '', menu: '', note: '' }, { title: '', key: 'C Major' });
    const r = reconcile(src, MAN, { expect: 20 });
    assert.deepStrictEqual(r.missing_in_manifest.map((x) => x.title), ['Bài Mới A']); assert.deepStrictEqual(r.extra_in_manifest.map((x) => x.track_id), ['me-em']);
    assert.strictEqual(r.duplicates_in_source.length, 1); assert.ok(r.incomplete_source_rows.some((x) => /thiếu tên/.test(x.problem))); assert.strictEqual(r.counts_ok, false);
});
T('reconcile: lệch trường được báo; enharmonic KHÔNG lệch; relative/mode lệch có báo', () => {
    const src = baseRows().map((r) => Object.assign({}, r)), g = (t) => src.find((r) => r.title === t);
    g('giả vờ thương anh được').menu = 'Bb Minor';           // manifest: A# minor => cùng key, không lệch
    g('đừng quên tên anh').key = 'C# Major';                  // manifest Db major => enharmonic, không lệch
    g('sau này em cưới ai').key = 'B Minor';                  // relative của D major => LỆCH
    g('Mê Em').key = 'C Minor';                               // khác mode => LỆCH
    g('THƯƠNG EM').url = 'https://www.youtube.com/watch?v=XXXXXXXXXXX'; g('luu nien'.length ? 'lưu niên' : '').auto = 'F# major';
    const r = reconcile(src, MAN, {}), f = r.field_mismatches.map((x) => x.track_id + ':' + x.field);
    assert.ok(!f.some((x) => x.startsWith('gia-vo') && x.includes('menu'))); assert.ok(!f.some((x) => x.startsWith('dung-quen') && x.includes('reference')));
    assert.ok(f.includes('sau-nay-em-cuoi-ai:user_reference.key')); assert.ok(f.includes('me-em:user_reference.key')); assert.ok(f.includes('thuong-em:audio_reference.source_url')); assert.ok(f.includes('luu-nien:observations.auto_key'));
});
T('reconcile: key không đọc được bị báo, không đoán; "Viên Đá nhỏ" không key', () => {
    const src = baseRows().map((r) => Object.assign({}, r)); src.find((r) => r.title === 'Mê Em').key = 'C'; src.find((r) => r.title === 'Viên Đá nhỏ').key = '';
    const r = reconcile(src, MAN, {}); assert.ok(r.incomplete_source_rows.some((x) => x.title === 'Mê Em' && /không đọc được/.test(x.problem))); assert.ok(!r.field_mismatches.some((x) => x.track_id === 'vien-da-nho' && x.field === 'user_reference.key'));
});
T('loadSource: CSV (Việt, dấu ngoặc kép, BOM) và JSON; CLI không có nguồn => BLOCKED_NO_SOURCE_TABLE (exit 2)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-')), f = path.join(d, 's.csv');
    fs.writeFileSync(f, '﻿Tên bài,Link,Key chuẩn,Auto Key,Menu,Ghi chú\n"Mê Em, bản live",,C Major,khớp nhãn,G Major,"ghi chú, có dấu phẩy"\n');
    const rows = loadSource(f); assert.strictEqual(rows[0].title, 'Mê Em, bản live'); assert.strictEqual(rows[0].key, 'C Major'); assert.strictEqual(rows[0].note, 'ghi chú, có dấu phẩy');
    const j = path.join(d, 's.json'); fs.writeFileSync(j, JSON.stringify([{ title: 'X', key: 'D Minor' }])); assert.strictEqual(loadSource(j)[0].key, 'D Minor');
    const r = cp.spawnSync('node', [R + '/reconcile.js'], { encoding: 'utf8' }); assert.strictEqual(r.status, 2); assert.ok(/BLOCKED_NO_SOURCE_TABLE/.test(r.stdout));
});
T('pipeline: manifest vẫn BLOCKED_NO_AUDIO, 0 bài đủ điều kiện, không nhãn nào vào metric chính', () => {
    const { evaluate } = require(R + '/run.js'), rep = evaluate(MAN, { audioRoot: '.', tol: 10, tols: [10], finalTest: true });
    assert.strictEqual(rep.status, 'BLOCKED_NO_AUDIO'); assert.strictEqual(rep.counts.eligible_for_accuracy, 0); assert.strictEqual(rep.aggregate, null); assert.strictEqual(rep.counts.verified, 0);
});
T('A10R: bảng nguồn rỗng/chỉ tiêu đề => BLOCKED_EMPTY_SOURCE (không báo "thừa" giả)', () => {
    const r = cp.spawnSync('node', [R + '/reconcile.js', '--source', R + '/../source/songs_20_source.TEMPLATE.csv'], { encoding: 'utf8' }); assert.strictEqual(r.status, 2); assert.ok(/BLOCKED_EMPTY_SOURCE/.test(r.stdout));
});
T('A10R-FINAL: THƯƠNG EM — 1:22 (Menu bắt đầu hiện Key) và 3:08 (modulation) là hai đại lượng khác nhau; cả hai giữ nguyên + nguồn, RESOLVED với bằng chứng', () => {
    const t = MAN.tracks.find((x) => x.track_id === 'thuong-em'), c = t.data_conflicts[0];
    assert.strictEqual(c.status, 'RESOLVED'); assert.ok(/BẮT ĐẦU HIỂN THỊ Key/.test(c.resolution) && /không giá trị nào dùng làm ground truth/.test(c.resolution)); assert.ok(/1p22s/.test(t.observations.menu_error_note)); assert.deepStrictEqual(c.values.map((v) => v.value_s), [82, 188]); assert.ok(c.values.every((v) => v.source));
    assert.strictEqual(t.modulations[0].time, 188); assert.strictEqual(t.observations.menu.display_delay_report.seconds, 82); assert.strictEqual(t.reference_status, 'UNVERIFIED_REFERENCE');
    assert.ok(S.validateTrack(Object.assign({}, t, { data_conflicts: [{ field: 'x', values: [{ source: 'a' }], status: 'UNRESOLVED' }] }), 0).errors.length); // cần ≥2 giá trị
    assert.ok(S.validateTrack(Object.assign({}, t, { data_conflicts: [{ field: 'x', values: [{ source: 'a' }, { source: 'b' }], status: 'OK' }] }), 0).errors.length);
});
T('A10R: Phía Sau Một Cô Gái không có URL (không tự tạo); Viên Đá nhỏ NO_REFERENCE; họa phận ái lưu NEEDS_CLARIFICATION', () => {
    const g = (id) => MAN.tracks.find((x) => x.track_id === id);
    assert.strictEqual(g('phia-sau-mot-co-gai').audio_reference.source_url, null); assert.ok(/TRỐNG/.test(g('phia-sau-mot-co-gai').audio_reference.source_url_note));
    assert.strictEqual(g('vien-da-nho').label_state, 'NO_REFERENCE'); assert.strictEqual(g('hoa-phan-ai-luu').label_state, 'NEEDS_CLARIFICATION'); assert.strictEqual(MAN.tracks.length, 20);
});

// ---- AI-ALG-10R-FINAL: chạy trên bảng nguồn THẬT đã đồng bộ vào repo ----
const SRC = path.resolve(R, '../source/songs_20_source.csv'), { validateSource, diffCsv, parseKeyChain, vid } = require(R + '/reconcile.js'), imp = require(R + '/import_source.js');
T('A10F bảng nguồn thật: đủ 20 bản ghi, 6 cột nhận diện, không trùng, ô trống đúng chỗ', () => {
    const L = loadSource(SRC, true), V = validateSource(L.rows, L, 20);
    assert.strictEqual(V.rows, 20); assert.deepStrictEqual(V.columns_missing, []); assert.strictEqual(V.duplicate_titles.length, 0); assert.strictEqual(V.rows_with_wrong_cell_count.length, 0); assert.ok(V.ok);
    assert.deepStrictEqual(V.empty_fields.url, ['Phía Sau Một Cô Gái']); assert.ok(V.empty_fields.key.length === 0 || V.empty_fields.key.length === 0); assert.strictEqual(V.empty_fields.note.length, 17);
    assert.strictEqual(L.rows.find((r) => r.title === 'Viên Đá nhỏ').key, '---');
});
T('A10F reconcile thật: 20/20 khớp tên, 0 thiếu/thừa/trùng; chỉ còn 1 lệch thật (typo nguồn "A# Minnor")', () => {
    const rep = reconcile(loadSource(SRC), MAN, { expect: 20 });
    assert.strictEqual(rep.matched, 20); assert.strictEqual(rep.missing_in_manifest.length + rep.extra_in_manifest.length + rep.duplicates_in_source.length + rep.duplicates_in_manifest.length, 0);
    assert.deepStrictEqual(rep.field_mismatches.map((x) => `${x.track_id}|${x.field}|${x.kind}`), ['gia-vo-thuong-anh-duoc|observations.menu|SOURCE_CELL_UNREADABLE_OR_TYPO']);
    assert.strictEqual(rep.unreadable_source_cells[0].source, 'A# Minnor'); assert.strictEqual(rep.info_notes.length, 1); assert.strictEqual(rep.counts_ok, false); // còn 1 lệch ⇒ không tuyên bố khớp hoàn toàn
});
T('A10F trạng thái nhãn sau nhập: tất cả UNVERIFIED, không audio/hash/segment, ba bài đặc biệt đúng', () => {
    assert.strictEqual(MAN.tracks.length, 20); assert.ok(MAN.tracks.every((x) => x.reference_status === 'UNVERIFIED_REFERENCE' && x.audio_hash === null && x.segments.length === 0));
    const g = (id) => MAN.tracks.find((x) => x.track_id === id);
    assert.strictEqual(g('vien-da-nho').label_state, 'NO_REFERENCE'); assert.strictEqual(g('vien-da-nho').user_reference.key, null); assert.strictEqual(g('vien-da-nho').observations.auto_key.raw, 'F# Major');
    assert.strictEqual(g('hoa-phan-ai-luu').label_state, 'NEEDS_CLARIFICATION'); assert.strictEqual(g('phia-sau-mot-co-gai').audio_reference.source_url, null);
    assert.deepStrictEqual(['vu-quy', 'gia-nhu-anh-la-em', 'tung-yeu', 'nguoi-la-thoang-qua', 'ngay-mai-nguoi-ta-lay-chong', 'cho-em-trong-dem'].map((i) => !!g(i)), [true, true, true, true, true, true]);
    assert.strictEqual(g('ngay-mai-nguoi-ta-lay-chong').user_reference.key.tonic, 'A#'); // Bb Minor ≡ A# minor (enharmonic), nhãn nguồn "Bb Minor" -> pitch class 10
    assert.deepStrictEqual(S.parseKey(g('thuong-em').user_reference.modulation.to_key), { pc: 3, mode: 'major' }); // Eb ≡ D# (so theo pitch class)
});
T('A10F parseKeyChain: "D Major - Eb Major", "---", typo; vid: so URL theo video id', () => {
    assert.strictEqual(parseKeyChain('D Major - Eb Major').keys.length, 2); assert.ok(parseKeyChain('---').empty); assert.ok(parseKeyChain('A# Minnor').unreadable); assert.strictEqual(parseKeyChain('Db  Major').keys[0].pc, 1);
    assert.strictEqual(vid('https://www.youtube.com/watch?v=wHLNh9qFgU8&list=RDMM-Oc-UPXdd10&index=3'), 'wHLNh9qFgU8'); assert.strictEqual(vid('https://youtu.be/wHLNh9qFgU8'), 'wHLNh9qFgU8'); assert.strictEqual(vid(''), null);
});
T('A10F CSV chênh lệch: có tiêu đề, loại THIEU/LECH, escape đúng', () => {
    const csv = diffCsv(reconcile(loadSource(SRC).filter((r) => r.title !== 'Mê Em'), JSON.parse(JSON.stringify(MAN)), { expect: 20 })).split('\n');
    assert.ok(csv[0].startsWith('loai,track_id')); assert.ok(csv.some((l) => l.startsWith('THUA_TRONG_MANIFEST,me-em'))); assert.ok(csv.some((l) => l.startsWith('LECH_TRUONG,gia-vo-thuong-anh-duoc')));
});
T('A10F import_source: chỉ bổ sung, không ghi đè, không VERIFIED, idempotent, không sửa nguồn', () => {
    const before = JSON.stringify(MAN), copy = JSON.parse(before), log = imp.run(copy, loadSource(SRC));
    assert.strictEqual(log.length, 0); assert.strictEqual(JSON.stringify(copy), before); // chạy lại trên manifest đã nhập: 0 thay đổi
    const m = { tracks: [{ track_id: 'a', title: 'Bài A', audio_reference: { type: 'none', path: null, source_url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }, audio_hash: null, reference_status: 'UNVERIFIED_REFERENCE', annotator: 'x', segments: [], modulations: [], annotation_notes: '', split: 'dev',
        user_reference: { key: { tonic: 'C', mode: 'major' } }, observations: { auto_key: { raw: 'G Major', key: { tonic: 'G', mode: 'major' }, agrees_with_user_reference: false } } }] };
    const rows = [{ title: 'Bài A', url: 'https://www.youtube.com/watch?v=ZZZZZZZZZZZ', key: 'D Minor', auto: 'F Major', menu: 'E Minor', note: 'ghi chú', _row: 2 }, { title: 'Bài B', url: '', key: 'Bb Minor', auto: 'Bb Minor', menu: 'A# Minnor', note: '', _row: 3 }, { title: 'Bài C', url: '', key: '---', auto: 'C Major', menu: '', note: '', _row: 4 }];
    const L2 = imp.run(m, rows), a = m.tracks[0], b = m.tracks.find((x) => x.title === 'Bài B'), c = m.tracks.find((x) => x.title === 'Bài C');
    assert.strictEqual(a.audio_reference.source_url, 'https://www.youtube.com/watch?v=AAAAAAAAAAA'); assert.deepStrictEqual(a.user_reference.key, { tonic: 'C', mode: 'major' }); assert.strictEqual(a.observations.auto_key.raw, 'G Major'); // không ghi đè
    assert.strictEqual(a.observations.menu.raw, 'E Minor'); assert.strictEqual(a.observations.menu_error_note, 'ghi chú'); // chỉ bổ sung trường trống
    assert.ok(m.tracks.every((x) => x.reference_status === 'UNVERIFIED_REFERENCE' && x.audio_hash === null && x.segments.length === 0)); assert.strictEqual(b.user_reference.key.tonic, 'A#'); assert.strictEqual(b.observations.menu.key, null); assert.strictEqual(b.observations.menu.raw, 'A# Minnor');
    assert.strictEqual(c.label_state, 'NO_REFERENCE'); assert.strictEqual(c.user_reference.key, null); assert.deepStrictEqual(S.validateManifest(m).errors, []); assert.strictEqual(L2.length, 4); // A: +menu +note; B: +track; C: +track
});
console.log(`RealBenchA10: ${n} nhóm OK`);
