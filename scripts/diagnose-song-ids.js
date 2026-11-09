#!/usr/bin/env node
'use strict';
/**
 * scripts/diagnose-song-ids.js — SONG-ID-DIAG-01 (CHỈ ĐỌC, không sửa gì)
 * ---------------------------------------------------------------------------
 * Tìm chỗ "nhầm ID bài hát với tên bài hát" trong data/songs.json và trên Key Server.
 *
 *  Trên máy (data/songs.json):
 *    [A] Cùng tên bài (đã chuẩn hoá) nhưng khác ca sĩ -> đồng bộ hiện ghép theo TÊN, bỏ qua ca sĩ.
 *    [B] Một songId dùng cho nhiều bài khác nhau.
 *    [A2] Cùng tên bài xuất hiện nhiều lần trên máy (kể cả ca sĩ rỗng).
 *    [C] songId dạng app_... KHÔNG khớp tên+ca sĩ — CHỈ tính khi máy CÓ ghi ca sĩ (ca sĩ rỗng thì không tái tạo
 *        được ID nên không kết luận; ID app_ được sinh từ tên + ca sĩ lúc gửi, còn songs.json có thể đã mất ca sĩ).
 *    [D] Số bài thiếu songId / ca sĩ rỗng (bài kéo từ server về).
 *  Trên Server (chỉ GET /list và GET /song-full, không gửi gì lên):
 *    [E] Với mỗi bài có songId: tên bài Server ghi cho ID đó có khớp tên trong máy không?
 *    [G] Server có bản ghi RỖNG cho ID máy dùng (tên "Chua dat ten" hoặc không có đoạn Key đọc được).
 *    [F] Server có nhiều bản ghi (nhiều ID) cho cùng một tên bài, và Key có khác nhau không?
 *
 * Cách chạy:  node scripts/diagnose-song-ids.js            (máy + Server)
 *             node scripts/diagnose-song-ids.js --offline  (chỉ máy, không nối mạng)
 *             node scripts/diagnose-song-ids.js --max=all  (đối chiếu TẤT CẢ bài có songId; hoặc --max=60, mặc định 40)
 * Báo cáo in ra màn hình và ghi vào logs/diagnose-song-ids.txt. Không ghi vào songs.json.
 */
const fs = require('fs');
const path = require('path');
const { normalizeTitle, makeSongId, serverKeyToAppKey, DEFAULT_SERVER_URL } = require('../core/integration/KeyServerSync');

function localChecks(songs) {
    const out = { collisions: [], dupTitles: [], sharedIds: [], badAppIds: [], unrecoverableIds: 0, noId: 0, noArtist: 0, total: songs.length };
    const byTitle = new Map(), byId = new Map();
    songs.forEach((s, i) => {
        if (!s || typeof s !== 'object') return;
        const nt = normalizeTitle(s.title);
        if (nt.length >= 3) { if (!byTitle.has(nt)) byTitle.set(nt, []); byTitle.get(nt).push(i); }
        const id = s.songId ? String(s.songId) : '';
        if (!id) out.noId++; else { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(i); }
        if (!String(s.artist || '').trim()) out.noArtist++;
        if (id.startsWith('app_') && id !== makeSongId(s.title, s.artist)) {
            if (String(s.artist || '').trim()) out.badAppIds.push({ title: s.title, artist: s.artist, songId: id, expected: makeSongId(s.title, s.artist) });
            else out.unrecoverableIds++; // ca sĩ rỗng: không tái tạo được ID -> chỉ đếm, KHÔNG coi là lỗi
        }
    });
    for (const [nt, idx] of byTitle) {
        const artists = new Set(idx.map((i) => normalizeTitle(songs[i].artist)));
        if (idx.length > 1 && artists.size > 1) out.collisions.push({ title: nt, entries: idx.map((i) => ({ artist: songs[i].artist || '', key: songs[i].key || '', songId: songs[i].songId || '' })) });
    }
    for (const [nt, idx] of byTitle) {
        if (idx.length > 1) out.dupTitles.push({ title: nt, entries: idx.map((i) => ({ artist: songs[i].artist || '', key: songs[i].key || '', songId: songs[i].songId || '' })) });
    }
    for (const [id, idx] of byId) {
        const titles = new Set(idx.map((i) => normalizeTitle(songs[i].title) + '|' + normalizeTitle(songs[i].artist)));
        if (idx.length > 1 && titles.size > 1) out.sharedIds.push({ songId: id, entries: idx.map((i) => ({ title: songs[i].title, artist: songs[i].artist || '', key: songs[i].key || '' })) });
    }
    return out;
}

async function getJson(fetchFn, url, timeoutMs) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 8000) : null;
    try {
        const res = await fetchFn(url, { method: 'GET', signal: ctl ? ctl.signal : undefined });
        let json = null; try { json = await res.json(); } catch (e) { /* không phải JSON */ }
        return { ok: res.ok !== false && res.status < 400, status: res.status, json };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    finally { if (timer) clearTimeout(timer); }
}

async function serverChecks(songs, { fetchFn, serverUrl, max }) {
    const out = { ok: true, error: null, checked: 0, idTitleMismatch: [], emptyRecords: [], idNotFound: [], dupOnServer: [], listCount: 0, notInList: 0 };
    const base = String(serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const list = await getJson(fetchFn, base + '/list', 8000);
    if (!list.ok || !list.json || !Array.isArray(list.json.danhSach)) { out.ok = false; out.error = list.error || ('http-' + list.status); return out; }
    out.listCount = list.json.danhSach.length;
    const g = new Map();
    for (const it of list.json.danhSach) {
        const nt = normalizeTitle(it && it.title); if (nt.length < 3) continue;
        if (!g.has(nt)) g.set(nt, []); g.get(nt).push(it);
    }
    for (const [nt, arr] of g) {
        const ids = new Set(arr.map((x) => x.songId));
        if (arr.length > 1 && ids.size > 1) out.dupOnServer.push({ title: nt, records: arr.map((x) => ({ songId: x.songId, key: x.key ? serverKeyToAppKey(x.key, x.mode) || (x.key + ' ' + x.mode) : '' })) });
    }
    const listTitles = new Set(list.json.danhSach.map((x) => normalizeTitle(x && x.title)));
    out.notInList = songs.filter((s) => s && normalizeTitle(s.title).length >= 3 && !listTitles.has(normalizeTitle(s.title))).length;
    const withId = songs.filter((s) => s && s.songId && normalizeTitle(s.title).length >= 3).slice(0, max === Infinity ? undefined : max);
    for (const s of withId) {
        const r = await getJson(fetchFn, base + '/song-full?id=' + encodeURIComponent(s.songId), 8000);
        out.checked++;
        if (!r.ok || !r.json) { out.idNotFound.push({ title: s.title, songId: s.songId, why: r.error || ('http-' + r.status) }); continue; }
        const doans = Array.isArray(r.json.doans) ? r.json.doans : [];
        const info = r.json.thongTin || {};
        if (!doans.length && !info.title) { out.idNotFound.push({ title: s.title, songId: s.songId, why: 'server không có ID này' }); continue; }
        const serverTitle = String(info.title || '');
        const serverKey = doans[0] ? (serverKeyToAppKey(doans[0].khoa, doans[0].mode) || '') : '';
        if (!serverKey || normalizeTitle(serverTitle) === 'chua dat ten') {
            out.emptyRecords.push({ songId: s.songId, localTitle: s.title, localKey: s.key || '', serverTitle, hasSegments: doans.length });
        } else if (serverTitle && normalizeTitle(serverTitle) !== normalizeTitle(s.title)) {
            out.idTitleMismatch.push({ songId: s.songId, localTitle: s.title, localKey: s.key || '', serverTitle, serverKey });
        }
    }
    return out;
}

function formatReport(local, srv) {
    const L = [];
    const add = (s = '') => L.push(s);
    add('=== BÁO CÁO ID BÀI HÁT ↔ TÊN BÀI HÁT (chỉ đọc, không sửa gì) ===');
    add(`Trên máy: ${local.total} bài | thiếu songId: ${local.noId} | ca sĩ rỗng: ${local.noArtist}`);
    add('');
    add(`[A2] Cùng tên bài xuất hiện nhiều lần trên máy: ${local.dupTitles.length} nhóm`);
    local.dupTitles.slice(0, 15).forEach((c) => add(`   - "${c.title}": ` + c.entries.map((e) => `${e.artist || '(trống)'}→${e.key || '?'}[${e.songId || 'không ID'}]`).join(' | ')));
    add(`[A] Cùng tên bài nhưng khác ca sĩ: ${local.collisions.length} nhóm` + (local.noArtist === local.total && local.total > 0 ? ' (KHÔNG kiểm tra được: mọi bài đều ca sĩ rỗng)' : ''));
    local.collisions.slice(0, 15).forEach((c) => add(`   - "${c.title}": ` + c.entries.map((e) => `${e.artist || '(trống)'}→${e.key || '?'}[${e.songId || 'không ID'}]`).join(' | ')));
    add(`[B] Một songId dùng cho nhiều bài khác nhau: ${local.sharedIds.length}`);
    local.sharedIds.slice(0, 15).forEach((c) => add(`   - ${c.songId}: ` + c.entries.map((e) => `"${e.title}" (${e.artist || 'trống'}) ${e.key}`).join(' | ')));
    add(`[C] ID app_... không khớp tên+ca sĩ (chỉ tính bài CÓ ghi ca sĩ): ${local.badAppIds.length}`);
    add(`    ID app_ không tái tạo được vì ca sĩ rỗng (không kết luận là lỗi): ${local.unrecoverableIds}`);
    local.badAppIds.slice(0, 15).forEach((c) => add(`   - "${c.title}" (${c.artist || 'trống'}) đang giữ ${c.songId}, đúng ra phải là ${c.expected}`));
    add('');
    if (!srv) add('Server: BỎ QUA (chạy --offline).');
    else if (!srv.ok) add(`Server: KHÔNG kết nối được (${srv.error}). Chỉ có phần kiểm tra trên máy.`);
    else {
        add(`Server: /list trả ${srv.listCount} bài (chỉ là các bài mới nhất); đã đối chiếu ${srv.checked} bài có songId; ${srv.notInList} bài trên máy không có trong /list.`);
        add(`[E] Server ghi TÊN KHÁC cho ID mà máy đang dùng: ${srv.idTitleMismatch.length}`);
        srv.idTitleMismatch.slice(0, 20).forEach((m) => add(`   - ID ${m.songId}: máy "${m.localTitle}" (${m.localKey || '?'}) ≠ Server "${m.serverTitle}" (${m.serverKey || '?'})`));
        add(`[G] Server có bản ghi RỖNG (tên "Chua dat ten" hoặc không có đoạn Key đọc được) cho ID máy đang dùng: ${srv.emptyRecords.length}`);
        srv.emptyRecords.slice(0, 20).forEach((m) => add(`   - ID ${m.songId}: máy "${m.localTitle}" (${m.localKey || '?'}) | Server: tên "${m.serverTitle || '(trống)'}", ${m.hasSegments} đoạn Key`));
        add(`    ID máy giữ mà Server không có/không đọc được: ${srv.idNotFound.length}`);
        srv.idNotFound.slice(0, 10).forEach((m) => add(`   - "${m.title}" ID ${m.songId}: ${m.why}`));
        add(`[F] Server có NHIỀU bản ghi (nhiều ID) cho cùng một tên bài: ${srv.dupOnServer.length}`);
        srv.dupOnServer.slice(0, 15).forEach((d) => add(`   - "${d.title}": ` + d.records.map((r) => `${r.songId}→${r.key || '?'}`).join(' | ')));
    }
    add('');
    const bad = local.collisions.length + local.dupTitles.length + local.sharedIds.length + local.badAppIds.length + (srv && srv.ok ? srv.idTitleMismatch.length + srv.emptyRecords.length + srv.dupOnServer.length : 0);
    add(bad ? `=> Có ${bad} điểm đáng nghi. Gửi file báo cáo này cho Claude B để xem từng chỗ.` : '=> Không thấy điểm nào đáng nghi trong phạm vi đã kiểm tra.');
    return L.join('\n');
}

async function run({ songsPath, fetchFn, serverUrl, offline, max, out }) {
    let songs = [];
    try { songs = JSON.parse(fs.readFileSync(songsPath, 'utf-8')); if (!Array.isArray(songs)) songs = []; } catch (e) { return { report: 'Không đọc được ' + songsPath + ': ' + e.message, local: null, srv: null }; }
    const local = localChecks(songs);
    const srv = offline ? null : await serverChecks(songs, { fetchFn: fetchFn || fetch, serverUrl, max: max === Infinity ? Infinity : (max || 40) });
    const report = formatReport(local, srv);
    if (out) { try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, report + '\n', 'utf-8'); } catch (e) { /* không ghi được file báo cáo: vẫn in màn hình */ } }
    return { report, local, srv };
}

module.exports = { localChecks, serverChecks, formatReport, run };

if (require.main === module) {
    const args = process.argv.slice(2);
    const maxArg = (args.find((a) => a.startsWith('--max=')) || '').split('=')[1];
    const max = maxArg === 'all' ? Infinity : (Number(maxArg) || 40);
    const root = path.resolve(__dirname, '..');
    run({ songsPath: path.join(root, 'data', 'songs.json'), offline: args.includes('--offline'), max, out: path.join(root, 'logs', 'diagnose-song-ids.txt') })
        .then((r) => { console.log(r.report); console.log('\n(Đã ghi báo cáo vào logs\\diagnose-song-ids.txt)'); })
        .catch((e) => { console.error('Lỗi:', e && e.message); process.exit(1); });
}
