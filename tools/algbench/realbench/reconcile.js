#!/usr/bin/env node
'use strict';
// AI-ALG-10 / 10R-FINAL — đối chiếu bảng 20 bài NGUỒN với manifest. Chỉ đọc; KHÔNG sửa manifest/nguồn, KHÔNG nâng nhãn lên VERIFIED.
//   node tools/algbench/realbench/reconcile.js --source <csv|tsv|json> [--manifest f] [--expect 20] [--out report.json] [--csv-out diff.csv]
// Cột nguồn (không phân biệt hoa/thường/dấu): Tên bài | Key chuẩn [đã xác minh] | [Kết quả] Auto Key | [Kết quả] Menu | Link Youtube | [lỗi] Menu/Ghi chú.
// So sánh key: enharmonic quy về cùng pitch class (Bb minor == A# minor); Major/Minor và relative KHÔNG coi là bằng nhau.
// Ô dạng "D Major - Eb Major" = key đầu + chuyển tone sang key sau. Typo trong nguồn (vd "Minnor") KHÔNG tự sửa: được báo là ô không đọc được.
const fs = require('fs'), path = require('path');
const S = require('./schema.js');
const fold = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ALIAS = {
    title: ['title', 'ten bai', 'bai hat', 'ten', 'song'],
    url: ['url', 'link', 'youtube', 'link youtube', 'nguon'],
    key: ['key', 'key chuan', 'key chuan da xac minh', 'nhan', 'reference', 'user reference', 'key tham chieu'],
    auto: ['auto', 'auto key', 'autokey', 'ket qua auto key'],
    menu: ['menu', 'menu key', 'key menu', 'ket qua menu'],
    note: ['note', 'ghi chu', 'loi', 'loi menu', 'ghi chu loi', 'notes'],
};
const FIELDS = Object.keys(ALIAS);
function splitLine(line, d) { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === d) { o.push(c); c = ''; } else c += ch; } o.push(c); return o.map((x) => x.trim()); }
function loadSource(file, withMeta) {
    const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); let rows, head = null;
    if (/\.json$/i.test(file)) { rows = JSON.parse(txt); head = rows.length ? Object.keys(rows[0]) : []; } else {
        const lines = txt.split(/\r?\n/).filter((l) => l.trim()); if (!lines.length) return withMeta ? { rows: [], head: [], colmap: {} } : [];
        const d = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ','); head = splitLine(lines[0], d);
        rows = lines.slice(1).map((l) => { const c = splitLine(l, d), o = {}; head.forEach((h, i) => { o[h] = c[i] === undefined ? '' : c[i]; }); o.__cells = c.length; return o; });
    }
    const colmap = {}; for (const [f, names] of Object.entries(ALIAS)) colmap[f] = head.find((h) => names.includes(fold(h))) || null;
    const out = rows.map((r, i) => { const o = { _row: i + 2 }; for (const f of FIELDS) { const k = colmap[f]; o[f] = k === null || r[k] === undefined || r[k] === null ? '' : String(r[k]).trim(); } o._cells = r.__cells; return o; });
    return withMeta ? { rows: out, head, colmap } : out;
}
// ---- key cell ----
const MISSING_KEY = /^(-+|n\/a|none|khong co|chua co|\?)?$/i;
function parseKeyChain(str) {   // "D Major - Eb Major" -> [key, key]; không đọc được 1 phần => null
    const t = String(str || '').trim(); if (MISSING_KEY.test(fold(t)) || /^-+$/.test(t)) return { empty: true };
    const parts = t.split(/\s+[-–→>]+\s+/).map((x) => x.trim()).filter(Boolean), keys = parts.map((p) => S.parseKeyString(p));
    return keys.every(Boolean) ? { keys } : { unreadable: t };
}
const sameKey = (a, b) => a && b && a.pc === b.pc && a.mode === b.mode;
const sameChain = (a, b) => a.length === b.length && a.every((k, i) => sameKey(k, b[i]));
function cellOf(raw) { const c = parseKeyChain(raw); if (c.keys) return c; if (c.empty) return { empty: true }; return { text: fold(raw), raw: String(raw).trim(), unreadable: true }; }
function manifestChain(o) {   // observations.<who> -> chain từ key đã parse; fallback raw
    if (!o) return { empty: true }; if (o.chain) { const ks = o.chain.map(S.parseKey); if (ks.every(Boolean)) return { keys: ks }; } if (o.key) { const k = S.parseKey(o.key); if (k) return { keys: [k] }; } return o.raw ? cellOf(o.raw) : { empty: true };
}
const chainLabel = (c) => (c.keys ? c.keys.map(S.keyLabel).join(' → ') : (c.raw || null));
const sameCell = (a, b) => (a.empty && b.empty) || (a.keys && b.keys && sameChain(a.keys, b.keys)) || (a.text !== undefined && b.text !== undefined && a.text === b.text);
const vid = (u) => { const m = String(u || '').match(/[?&]v=([\w-]{6,})/) || String(u || '').match(/youtu\.be\/([\w-]{6,})/); return m ? m[1] : null; };

function validateSource(rows, meta, expect) {   // đủ bản ghi, đủ 6 trường, trùng, ô trống
    const V = { rows: rows.length, expected: expect || null, columns_found: {}, columns_missing: [], empty_fields: {}, rows_with_wrong_cell_count: [], duplicate_titles: [] };
    for (const f of FIELDS) { V.columns_found[f] = meta.colmap[f]; if (!meta.colmap[f]) V.columns_missing.push(f); V.empty_fields[f] = rows.filter((r) => !r[f]).map((r) => r.title || `dòng ${r._row}`); }
    rows.forEach((r) => { if (r._cells !== undefined && r._cells !== meta.head.length) V.rows_with_wrong_cell_count.push({ row: r._row, title: r.title, cells: r._cells, expected: meta.head.length }); });
    const seen = new Map(); rows.forEach((r) => { const k = fold(r.title); if (seen.has(k)) V.duplicate_titles.push({ title: r.title, rows: [seen.get(k), r._row] }); else seen.set(k, r._row); });
    V.ok = V.rows === (expect || V.rows) && !V.columns_missing.length && !V.rows_with_wrong_cell_count.length && !V.duplicate_titles.length;
    return V;
}
function reconcile(sourceRows, manifest, opt = {}) {
    const R = { source_count: sourceRows.length, manifest_count: manifest.tracks.length, expected: opt.expect || null, missing_in_manifest: [], extra_in_manifest: [], duplicates_in_source: [], duplicates_in_manifest: [], field_mismatches: [], info_notes: [], unreadable_source_cells: [], incomplete_source_rows: [], matched: 0 };
    const byTitle = new Map(); manifest.tracks.forEach((t) => { const k = fold(t.title); if (byTitle.has(k)) R.duplicates_in_manifest.push(t.track_id); byTitle.set(k, t); });
    const seen = new Map(), used = new Set();
    for (const r of sourceRows) {
        const k = fold(r.title); if (!k) { R.incomplete_source_rows.push({ row: r._row, problem: 'thiếu tên bài' }); continue; }
        if (seen.has(k)) { R.duplicates_in_source.push({ title: r.title, rows: [seen.get(k), r._row] }); continue; } seen.set(k, r._row);
        const t = byTitle.get(k); if (!t) { R.missing_in_manifest.push({ title: r.title, row: r._row, source: { key: r.key, auto: r.auto, menu: r.menu, url: r.url, note: r.note } }); continue; }
        used.add(t.track_id); R.matched++;
        const mm = (field, src, man, kind) => R.field_mismatches.push({ track_id: t.track_id, title: t.title, field, source: src === '' ? null : src, manifest: man === '' ? null : man, kind: kind || 'VALUE_DIFFERS' });
        // Key chuẩn (user_reference): key đầu + (nếu có) key chuyển tone
        const sc = parseKeyChain(r.key), mref = t.user_reference && t.user_reference.key ? S.parseKey(t.user_reference.key) : null, mmod = t.user_reference && t.user_reference.modulation;
        if (sc.unreadable) { R.incomplete_source_rows.push({ row: r._row, title: r.title, problem: `key "${r.key}" không đọc được (cần dạng "D Major")` }); }
        else if (sc.empty) { if (mref) mm('user_reference.key', null, S.keyLabel(mref), 'MANIFEST_HAS_VALUE_SOURCE_EMPTY'); }
        else {
            if (!mref) mm('user_reference.key', sc.keys.map(S.keyLabel).join(' → '), null, 'SOURCE_HAS_VALUE_MANIFEST_EMPTY');
            else if (!sameKey(sc.keys[0], mref)) mm('user_reference.key', S.keyLabel(sc.keys[0]), S.keyLabel(mref));
            if (sc.keys.length > 1) {
                const to = mmod && mmod.to_key ? S.parseKey(mmod.to_key) : null;
                if (!to) mm('user_reference.modulation', sc.keys.slice(1).map(S.keyLabel).join(' → '), null, 'SOURCE_HAS_VALUE_MANIFEST_EMPTY');
                else if (!sameKey(sc.keys[1], to)) mm('user_reference.modulation', S.keyLabel(sc.keys[1]), S.keyLabel(to));
            }
        }
        // Auto / Menu
        for (const [f, who] of [['auto', 'auto_key'], ['menu', 'menu']]) {
            const a = cellOf(r[f]), mo = t.observations && t.observations[who], b = manifestChain(mo);
            if (a.unreadable) R.unreadable_source_cells.push({ track_id: t.track_id, title: t.title, field: f, source: a.raw, manifest: chainLabel(b) });
            if (a.empty && b.empty) continue;
            if (!sameCell(a, b)) mm('observations.' + who, a.empty ? null : (a.raw || chainLabel(a)), b.empty ? null : chainLabel(b), a.unreadable ? 'SOURCE_CELL_UNREADABLE_OR_TYPO' : (b.empty ? 'SOURCE_HAS_VALUE_MANIFEST_EMPTY' : (a.empty ? 'MANIFEST_HAS_VALUE_SOURCE_EMPTY' : (b.keys === undefined ? 'MANIFEST_PLACEHOLDER_ONLY' : 'VALUE_DIFFERS'))));
        }
        // URL: so theo video id; cùng id khác dạng link => chỉ thông tin
        const murl = t.audio_reference && t.audio_reference.source_url || '';
        if (r.url || murl) {
            if (!r.url) mm('audio_reference.source_url', null, murl, 'MANIFEST_HAS_VALUE_SOURCE_EMPTY');
            else if (!murl) mm('audio_reference.source_url', r.url, null, 'SOURCE_HAS_VALUE_MANIFEST_EMPTY');
            else if (vid(r.url) !== vid(murl)) mm('audio_reference.source_url', r.url, murl);
            else if (r.url !== murl) R.info_notes.push({ track_id: t.track_id, field: 'audio_reference.source_url', note: `cùng video id ${vid(murl)}, khác dạng link (nguồn có thêm tham số list/index)` });
        }
        // Ghi chú lỗi Menu
        if (r.note) {
            const cands = [t.observations && t.observations.menu_error_note, t.observations && t.observations.tester_note, t.annotation_notes].filter(Boolean).map(fold);
            if (!cands.some((c) => c === fold(r.note) || c.includes(fold(r.note)))) mm('observations.menu_error_note', r.note, (t.observations && (t.observations.menu_error_note || t.observations.tester_note)) || t.annotation_notes || null, (t.annotation_notes || (t.observations && t.observations.tester_note)) ? 'VALUE_DIFFERS' : 'SOURCE_HAS_VALUE_MANIFEST_EMPTY');
        } else if (t.observations && t.observations.menu_error_note) mm('observations.menu_error_note', null, t.observations.menu_error_note, 'MANIFEST_HAS_VALUE_SOURCE_EMPTY');
    }
    manifest.tracks.forEach((t) => { if (!used.has(t.track_id)) R.extra_in_manifest.push({ track_id: t.track_id, title: t.title }); });
    R.counts_ok = R.source_count === (opt.expect || R.source_count) && !R.missing_in_manifest.length && !R.extra_in_manifest.length && !R.duplicates_in_source.length && !R.duplicates_in_manifest.length && !R.field_mismatches.length && !R.incomplete_source_rows.length && R.manifest_count === R.source_count;
    return R;
}
const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function diffCsv(R) {
    const rows = [['loai', 'track_id', 'ten_bai', 'truong', 'gia_tri_nguon', 'gia_tri_manifest', 'kind']];
    R.missing_in_manifest.forEach((x) => rows.push(['THIEU_TRONG_MANIFEST', '', x.title, '(ca bai)', [x.source.key, x.source.auto, x.source.menu, x.source.url].join(' | '), '', 'MISSING_TRACK']));
    R.extra_in_manifest.forEach((x) => rows.push(['THUA_TRONG_MANIFEST', x.track_id, x.title, '(ca bai)', '', '', 'EXTRA_TRACK']));
    R.duplicates_in_source.forEach((x) => rows.push(['TRUNG_TRONG_NGUON', '', x.title, 'ten_bai', `dong ${x.rows.join(',')}`, '', 'DUPLICATE']));
    R.duplicates_in_manifest.forEach((x) => rows.push(['TRUNG_TRONG_MANIFEST', x, '', 'track_id/ten_bai', '', '', 'DUPLICATE']));
    R.field_mismatches.forEach((x) => rows.push(['LECH_TRUONG', x.track_id, x.title, x.field, x.source, x.manifest, x.kind]));
    R.unreadable_source_cells.forEach((x) => rows.push(['O_NGUON_KHONG_DOC_DUOC', x.track_id, x.title, x.field, x.source, x.manifest, 'UNREADABLE']));
    R.info_notes.forEach((x) => rows.push(['THONG_TIN', x.track_id, '', x.field, '', '', x.note]));
    return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
module.exports = { loadSource, reconcile, validateSource, diffCsv, parseKeyChain, fold, vid };
if (require.main === module) {
    const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
    const mf = path.resolve(arg('manifest', path.join(__dirname, '../manifest/real_music_manifest.json'))), man = JSON.parse(fs.readFileSync(mf, 'utf8')), src = arg('source', null);
    if (!src || !fs.existsSync(src)) { console.log(`BLOCKED_NO_SOURCE_TABLE: chưa có bảng nguồn 20 bài (--source). Manifest hiện có ${man.tracks.length} bài; không thể kết luận bài thiếu/trùng/sai.`); process.exit(2); }
    const L = loadSource(src, true), rows = L.rows; if (!rows.length) { console.log(`BLOCKED_EMPTY_SOURCE: ${src} không có bản ghi nào (chỉ có tiêu đề?). Không đối chiếu.`); process.exit(2); }
    const expect = +arg('expect', 20), V = validateSource(rows, L, expect), rep = reconcile(rows, man, { expect }); rep.source_validation = V;
    const out = arg('out', null); if (out) fs.writeFileSync(out, JSON.stringify(rep, null, 1)); const co = arg('csv-out', null); if (co) fs.writeFileSync(co, diffCsv(rep));
    console.log(`bảng nguồn: ${V.rows} bản ghi (kỳ vọng ${expect}) | cột nhận diện: ${FIELDS.map((f) => `${f}=${V.columns_found[f] ? 'OK' : 'THIẾU'}`).join(' ')} | trùng tên=${V.duplicate_titles.length} | dòng sai số ô=${V.rows_with_wrong_cell_count.length}`);
    FIELDS.forEach((f) => { if (V.empty_fields[f].length) console.log(`  ô trống [${f}] (${V.empty_fields[f].length}): ${V.empty_fields[f].join('; ')}`); });
    console.log(`manifest=${rep.manifest_count} | khớp tên=${rep.matched} | thiếu trong manifest=${rep.missing_in_manifest.length} | thừa=${rep.extra_in_manifest.length} | trùng nguồn=${rep.duplicates_in_source.length} | lệch trường=${rep.field_mismatches.length} | ô nguồn không đọc được=${rep.unreadable_source_cells.length} | dòng nguồn thiếu/sai=${rep.incomplete_source_rows.length} | thông tin=${rep.info_notes.length}`);
    rep.missing_in_manifest.forEach((x) => console.log('  THIẾU:', x.title)); rep.extra_in_manifest.forEach((x) => console.log('  THỪA:', x.title)); rep.duplicates_in_source.forEach((x) => console.log('  TRÙNG:', x.title));
    rep.field_mismatches.forEach((x) => console.log(`  LỆCH ${x.title} [${x.field}] (${x.kind}): nguồn=${x.source} | manifest=${x.manifest}`)); rep.unreadable_source_cells.forEach((x) => console.log(`  Ô KHÔNG ĐỌC ĐƯỢC ${x.title} [${x.field}]: "${x.source}"`)); rep.incomplete_source_rows.forEach((x) => console.log('  DÒNG LỖI:', JSON.stringify(x)));
    process.exitCode = rep.counts_ok && V.ok ? 0 : 1;
}
