#!/usr/bin/env node
'use strict';
// AI-ALG-10R-FINAL — nhập bảng nguồn vào manifest theo kiểu CHỈ BỔ SUNG. Mặc định dry-run; --write để ghi.
//   node tools/algbench/realbench/import_source.js --source <csv> [--manifest f] [--write]
// Quy tắc: (1) thêm bài thiếu từ nguồn; (2) chỉ điền trường đang trống/placeholder, KHÔNG ghi đè giá trị có sẵn;
// (3) mọi nhãn = UNVERIFIED_REFERENCE (kể cả khi tiêu đề cột nguồn ghi "đã xác minh" — chưa có nguồn đối chứng độc lập);
// (4) không tạo hash/audio/segment/mốc thời gian; (5) nguồn không bị sửa (typo "Minnor" được giữ nguyên trong source_cell_raw).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const S = require('./schema.js'), { loadSource, parseKeyChain, fold, vid } = require('./reconcile.js');
const toObj = (k) => ({ tonic: S.NOTE[k.pc], mode: k.mode });
const slug = (t) => fold(t).replace(/ /g, '-');
const splitOf = (id) => (crypto.createHash('sha256').update(id).digest()[0] % 10 < 3 ? 'test' : 'dev');
const LICENSE = 'Chưa có file audio hợp lệ; không tải/trích xuất audio trái phép. Cần file do người dùng cung cấp.';
function obsFrom(raw, refChain) {   // ô Auto/Menu -> observation (nguyên văn + key/chain đã parse nếu đọc được)
    const c = parseKeyChain(raw), o = { raw: String(raw || '').trim(), key: null, agrees_with_user_reference: null };
    if (c.keys) { if (c.keys.length === 1) o.key = toObj(c.keys[0]); else o.chain = c.keys.map(toObj); if (refChain) o.agrees_with_user_reference = c.keys.length === refChain.length && c.keys.every((k, i) => k.pc === refChain[i].pc && k.mode === refChain[i].mode); }
    return o;
}
function run(manifest, rows) {
    const log = [], byTitle = new Map(manifest.tracks.map((t) => [fold(t.title), t]));
    for (const r of rows) {
        const refC = parseKeyChain(r.key), refChain = refC.keys || null, k = fold(r.title); let t = byTitle.get(k);
        if (!t) {   // bài mới
            const id = slug(r.title); if (manifest.tracks.some((x) => x.track_id === id)) throw new Error('track_id trùng: ' + id);
            t = { track_id: id, title: r.title, audio_reference: { type: r.url ? 'url_reference_only' : 'none', path: null, source_url: r.url || null, license_note: LICENSE }, audio_hash: null, reference_status: 'UNVERIFIED_REFERENCE',
                label_state: refChain ? 'USER_LABEL_UNVERIFIED' : 'NO_REFERENCE', annotator: 'user_observation (Khói, bảng songs_20_source.csv; chưa kiểm chứng độc lập)',
                user_reference: { key: refChain ? toObj(refChain[0]) : null, modulation: refChain && refChain.length > 1 ? { time: null, from_key: toObj(refChain[0]), to_key: toObj(refChain[1]) } : null, modulation_unclear: false },
                observations: { auto_key: r.auto ? obsFrom(r.auto, refChain) : null, menu: r.menu ? obsFrom(r.menu, refChain) : null, tester_note: r.note || '', menu_error_note: r.note || '' },
                segments: [], modulations: [], track_group: refChain && refChain.length > 1 ? 'modulation_user_reported' : 'stable_user_reported', annotation_notes: r.note || '', split: splitOf(id) };
            manifest.tracks.push(t); byTitle.set(k, t); log.push({ track_id: id, action: 'ADD_TRACK', detail: `${r.title} (split=${t.split}, key=${refChain ? S.keyLabel(refChain[0]) : 'không có'})` }); continue;
        }
        t.observations = t.observations || {};
        if (r.url && !(t.audio_reference && t.audio_reference.source_url)) { t.audio_reference = Object.assign({ path: null, license_note: LICENSE }, t.audio_reference, { type: 'url_reference_only', source_url: r.url }); delete t.audio_reference.source_url_note; log.push({ track_id: t.track_id, action: 'FILL_URL', detail: r.url }); }
        for (const [f, who] of [['auto', 'auto_key'], ['menu', 'menu']]) {
            if (!r[f]) continue; const cur = t.observations[who], neu = obsFrom(r[f], refChain);
            if (!cur) { t.observations[who] = neu; log.push({ track_id: t.track_id, action: 'FILL_' + who.toUpperCase(), detail: neu.raw }); }
            else if (!cur.key && !cur.chain && (neu.key || neu.chain)) { neu.raw_earlier_report = cur.raw; Object.assign(cur, neu); log.push({ track_id: t.track_id, action: 'REPLACE_PLACEHOLDER_' + who.toUpperCase(), detail: `"${neu.raw_earlier_report}" -> "${neu.raw}"` }); }
            else if (!neu.key && !neu.chain && neu.raw && cur.raw !== neu.raw && !cur.source_cell_raw) { cur.source_cell_raw = neu.raw; log.push({ track_id: t.track_id, action: 'KEEP_MANIFEST_NOTE_SOURCE_UNREADABLE', detail: `nguồn "${neu.raw}" không đọc được; giữ manifest "${cur.raw}"` }); }
        }
        if (r.note && !t.observations.menu_error_note) { t.observations.menu_error_note = r.note; log.push({ track_id: t.track_id, action: 'FILL_MENU_ERROR_NOTE', detail: r.note }); }
    }
    return log;
}
module.exports = { run };
if (require.main === module) {
    const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
    const mf = path.resolve(arg('manifest', path.join(__dirname, '../manifest/real_music_manifest.json'))), man = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const rows = loadSource(arg('source', ''), false); if (!rows.length) { console.log('BLOCKED_EMPTY_SOURCE'); process.exit(2); }
    const log = run(man, rows); const v = S.validateManifest(man);
    log.forEach((x) => console.log(`${x.action.padEnd(36)} ${x.track_id}: ${x.detail}`)); console.log(`thay đổi=${log.length} | tracks=${man.tracks.length} | lỗi schema=${v.errors.length}`); v.errors.forEach((e) => console.log('  LỖI:', e));
    if (v.errors.length) process.exit(1);
    if (a.includes('--write')) { man.schema_ext = 'AI-ALG-09/10R-FINAL (title,label_state,user_reference,observations{chain,menu_error_note,source_cell_raw},track_group,data_conflicts)'; fs.writeFileSync(mf, JSON.stringify(man, null, 2) + '\n'); console.log('ĐÃ GHI', mf); } else console.log('(dry-run — dùng --write để ghi)');
}
