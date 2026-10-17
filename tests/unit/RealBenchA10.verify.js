'use strict';
// AI-ALG-10 — test đối chiếu bảng nguồn ↔ manifest, enharmonic, Major/Minor tách biệt (dữ liệu TEST_FIXTURE).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const R = path.resolve(__dirname, '../../tools/algbench/realbench'), S = require(R + '/schema.js'), { reconcile, loadSource, fold } = require(R + '/reconcile.js');
const MAN = JSON.parse(fs.readFileSync(R + '/../manifest/real_music_manifest.json', 'utf8'));
let n = 0; const T = (name, fn) => { fn(); n++; console.log('ok', name); };

// Dựng "bảng nguồn" 14 dòng từ chính manifest (tự nhất quán) để kiểm tra đường đi không-lệch.
const rowOf = (t) => ({ title: t.title, url: t.audio_reference.source_url || '', key: t.user_reference.key ? S.keyLabel(S.parseKey(t.user_reference.key)) : '',
    auto: t.observations && t.observations.auto_key ? t.observations.auto_key.raw : '', menu: t.observations && t.observations.menu ? t.observations.menu.raw : '', note: t.annotation_notes || '' });
const base14 = () => MAN.tracks.map(rowOf);

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
T('reconcile: bảng 14 dòng tự nhất quán => 0 lệch; kỳ vọng 20 => counts_ok=false, manifest 14', () => {
    const r = reconcile(base14(), MAN, { expect: 20 }); assert.strictEqual(r.matched, 14); assert.strictEqual(r.field_mismatches.length, 0); assert.strictEqual(r.missing_in_manifest.length, 0);
    assert.strictEqual(r.source_count, 14); assert.strictEqual(r.counts_ok, false); // 14 ≠ 20 kỳ vọng
    assert.strictEqual(reconcile(base14(), MAN, {}).counts_ok, true);
});
T('reconcile: bài thiếu, thừa, trùng, dòng thiếu tên', () => {
    const src = base14().filter((r) => r.title !== 'Mê Em'); src.push({ title: 'Bài Mới A', url: '', key: 'C Major', auto: '', menu: '', note: '' }, { title: 'bai moi a', url: '', key: '', auto: '', menu: '', note: '' }, { title: '', key: 'C Major' });
    const r = reconcile(src, MAN, { expect: 20 });
    assert.deepStrictEqual(r.missing_in_manifest.map((x) => x.title), ['Bài Mới A']); assert.deepStrictEqual(r.extra_in_manifest.map((x) => x.track_id), ['me-em']);
    assert.strictEqual(r.duplicates_in_source.length, 1); assert.ok(r.incomplete_source_rows.some((x) => /thiếu tên/.test(x.problem))); assert.strictEqual(r.counts_ok, false);
});
T('reconcile: lệch trường được báo; enharmonic KHÔNG lệch; relative/mode lệch có báo', () => {
    const src = base14().map((r) => Object.assign({}, r)), g = (t) => src.find((r) => r.title === t);
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
    const src = base14().map((r) => Object.assign({}, r)); src.find((r) => r.title === 'Mê Em').key = 'C'; src.find((r) => r.title === 'Viên Đá nhỏ').key = '';
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
console.log(`RealBenchA10: ${n} nhóm OK`);
