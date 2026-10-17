#!/usr/bin/env node
'use strict';
// AI-ALG-10 — đối chiếu bảng 20 bài NGUỒN (Khói cung cấp) với manifest. Chỉ đọc; KHÔNG sửa manifest, KHÔNG nâng trạng thái nhãn.
//   node tools/algbench/realbench/reconcile.js --source <file.csv|tsv|json> [--manifest f] [--expect 20] [--out report.json]
// Cột nguồn (không phân biệt hoa/thường, có/không dấu): title|tên bài|bài hát, url|link|youtube, key|key chuẩn|nhãn|reference, auto|auto key, menu, note|ghi chú|lỗi.
// So sánh key: enharmonic quy về cùng pitch class (Bb minor == A# minor); Major/Minor và relative KHÔNG coi là bằng nhau.
const fs = require('fs'), path = require('path');
const S = require('./schema.js');
const fold = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ALIAS = { title: ['title', 'ten bai', 'bai hat', 'ten', 'song'], url: ['url', 'link', 'youtube', 'link youtube', 'nguon'], key: ['key', 'key chuan', 'nhan', 'reference', 'user reference', 'key tham chieu'], auto: ['auto', 'auto key', 'autokey'], menu: ['menu', 'menu key', 'key menu'], note: ['note', 'ghi chu', 'loi', 'ghi chu loi', 'notes'] };
function splitLine(line, d) { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === d) { o.push(c); c = ''; } else c += ch; } o.push(c); return o.map((x) => x.trim()); }
function loadSource(file) {
    const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); let rows;
    if (/\.json$/i.test(file)) rows = JSON.parse(txt); else {
        const lines = txt.split(/\r?\n/).filter((l) => l.trim()), d = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ','), head = splitLine(lines[0], d);
        rows = lines.slice(1).map((l) => { const c = splitLine(l, d), o = {}; head.forEach((h, i) => { o[h] = c[i] === undefined ? '' : c[i]; }); return o; });
    }
    return rows.map((r, i) => { const o = { _row: i + 1 }; for (const [f, names] of Object.entries(ALIAS)) { const k = Object.keys(r).find((h) => names.includes(fold(h))); o[f] = k === undefined || r[k] === null ? '' : String(r[k]).trim(); } return o; });
}
// ô Auto/Menu: key đọc được -> so theo pitch class+mode; "khớp nhãn" -> agrees; còn lại so chữ đã chuẩn hóa. Trống = chưa có dữ liệu.
function cell(v) { const t = String(v || '').trim(); if (!t) return { empty: true }; const k = S.parseKeyString(t); return k ? { key: k } : { text: fold(t), agrees: /khop/.test(fold(t)) }; }
const sameCell = (a, b) => (a.empty && b.empty) || (a.key && b.key && a.key.pc === b.key.pc && a.key.mode === b.key.mode) || (a.text !== undefined && b.text !== undefined && a.text === b.text);
function manifestCell(o) { if (!o) return { empty: true }; if (o.key) { const k = S.parseKey(o.key); if (k) return { key: k }; } return o.raw ? cell(o.raw) : { empty: true }; }
function reconcile(sourceRows, manifest, opt = {}) {
    const R = { source_count: sourceRows.length, manifest_count: manifest.tracks.length, expected: opt.expect || null, missing_in_manifest: [], extra_in_manifest: [], duplicates_in_source: [], duplicates_in_manifest: [], field_mismatches: [], incomplete_source_rows: [], matched: 0 };
    const byTitle = new Map(); manifest.tracks.forEach((t) => { const k = fold(t.title); if (byTitle.has(k)) R.duplicates_in_manifest.push(t.track_id); byTitle.set(k, t); });
    const seen = new Map(), used = new Set();
    for (const r of sourceRows) {
        const k = fold(r.title); if (!k) { R.incomplete_source_rows.push({ row: r._row, problem: 'thiếu tên bài' }); continue; }
        if (seen.has(k)) { R.duplicates_in_source.push({ title: r.title, rows: [seen.get(k), r._row] }); continue; } seen.set(k, r._row);
        const t = byTitle.get(k); if (!t) { R.missing_in_manifest.push({ title: r.title, row: r._row }); continue; }
        used.add(t.track_id); R.matched++;
        const mm = (field, src, man) => R.field_mismatches.push({ track_id: t.track_id, title: t.title, field, source: src, manifest: man });
        const ref = r.key ? S.parseKeyString(r.key) : null, mref = t.user_reference && t.user_reference.key ? S.parseKey(t.user_reference.key) : null;
        if (r.key && !ref && !/khong|chua|none|n\/a|-/i.test(fold(r.key))) R.incomplete_source_rows.push({ row: r._row, title: r.title, problem: `key "${r.key}" không đọc được (cần dạng "D Major")` });
        else if ((ref || mref) && !(ref && mref && ref.pc === mref.pc && ref.mode === mref.mode)) mm('user_reference.key', r.key || null, mref ? S.keyLabel(mref) : null);
        for (const [f, who] of [['auto', 'auto_key'], ['menu', 'menu']]) { const a = cell(r[f]), b = manifestCell(t.observations && t.observations[who]); if (!sameCell(a, b)) mm('observations.' + who, r[f] || null, b.key ? S.keyLabel(b.key) : (t.observations && t.observations[who] ? t.observations[who].raw : null)); }
        const murl = t.audio_reference && t.audio_reference.source_url || ''; if ((r.url || '') !== murl) mm('audio_reference.source_url', r.url || null, murl || null);
        if (r.note && fold(r.note) !== fold(t.annotation_notes || '') && !fold(t.annotation_notes || '').includes(fold(r.note))) mm('annotation_notes', r.note, t.annotation_notes || null);
    }
    manifest.tracks.forEach((t) => { if (!used.has(t.track_id)) R.extra_in_manifest.push({ track_id: t.track_id, title: t.title }); });
    R.counts_ok = R.source_count === (opt.expect || R.source_count) && !R.missing_in_manifest.length && !R.extra_in_manifest.length && !R.duplicates_in_source.length && !R.duplicates_in_manifest.length && !R.field_mismatches.length && !R.incomplete_source_rows.length && R.manifest_count === R.source_count;
    return R;
}
module.exports = { loadSource, reconcile, fold };
if (require.main === module) {
    const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
    const mf = path.resolve(arg('manifest', path.join(__dirname, '../manifest/real_music_manifest.json'))), man = JSON.parse(fs.readFileSync(mf, 'utf8')), src = arg('source', null);
    if (!src || !fs.existsSync(src)) { console.log(`BLOCKED_NO_SOURCE_TABLE: chưa có bảng nguồn 20 bài (--source). Manifest hiện có ${man.tracks.length} bài; không thể kết luận bài thiếu/trùng/sai.`); process.exit(2); }
    const rep = reconcile(loadSource(src), man, { expect: +arg('expect', 20) }); const out = arg('out', null); if (out) fs.writeFileSync(out, JSON.stringify(rep, null, 1));
    console.log(`nguồn=${rep.source_count} (kỳ vọng ${rep.expected}) | manifest=${rep.manifest_count} | khớp tên=${rep.matched} | thiếu trong manifest=${rep.missing_in_manifest.length} | thừa trong manifest=${rep.extra_in_manifest.length} | trùng nguồn=${rep.duplicates_in_source.length} | lệch trường=${rep.field_mismatches.length} | dòng nguồn thiếu/sai=${rep.incomplete_source_rows.length}`);
    rep.missing_in_manifest.forEach((x) => console.log('  THIẾU:', x.title)); rep.extra_in_manifest.forEach((x) => console.log('  THỪA:', x.title)); rep.duplicates_in_source.forEach((x) => console.log('  TRÙNG:', x.title));
    rep.field_mismatches.forEach((x) => console.log(`  LỆCH ${x.title} [${x.field}]: nguồn=${x.source} manifest=${x.manifest}`)); rep.incomplete_source_rows.forEach((x) => console.log('  DÒNG LỖI:', JSON.stringify(x)));
    process.exitCode = rep.counts_ok ? 0 : 1;
}
