'use strict';
/**
 * core/integration/SongDbServerSync.js — DB-SYNC-01
 * ===========================================================================
 * Đồng bộ HAI CHIỀU giữa data/songs.json (máy này) và Key Server (Cloudflare):
 *   - KÉO (pull) : bài có trên server mà máy chưa có -> thêm vào songs.json;
 *                  bài máy có nhưng chưa có Key -> điền Key từ server.
 *                  DB-REALTIME-01 (phương án A): Server là NGUỒN CHUẨN — Key trên Server khác Key trên máy thì máy đổi theo Server.
 *                  BPM chỉ có ở máy nên KHÔNG BAO GIỜ bị đụng tới.
 *   - ĐẨY (push) : bài máy có Key mà server chưa có -> gửi lên (dùng KeyServerSync.submit:
 *                  tự hỏi server trước, không gửi trùng).
 * Giới hạn của server hiện tại: /list chỉ trả 100–200 bài mới nhất, không có ca sĩ/BPM
 * (nên bài kéo về có artist rỗng, bpm null; BPM chỉ nằm ở máy).
 * Không throw: mọi lỗi mạng trả { ok:false, error }. Module thuần Node, tiêm sẵn fetch/db để test.
 */
const fs = require('fs');
const path = require('path');
const SongDatabase = require('../reference/SongDatabase');
const { parseClock } = require('../reference/RecordingDuration');
const { serverKeyToAppKey, normalizeTitle, makeSongId } = require('./KeyServerSync');

const MAX_PUSH_PER_RUN = 25;      // mỗi lượt chỉ đẩy tối đa 25 bài (mỗi bài ≥ 2–3 request) — lượt sau đẩy tiếp
const LIST_TIMEOUT_MS = 8000;
// DB-SYNC-02 — Server là nguồn chuẩn: bài nào Server đã XOÁ thì máy cũng xoá theo (trước đây chỉ thêm, không xoá, và còn đẩy bài đã xoá ngược lên Server).
// /list của Server chỉ trả 100 bài mới nhất -> "không có trong /list" CHƯA đủ để kết luận đã xoá: phải hỏi Server từng bài (theo ID, rồi theo tên) mới xoá.
const MAX_VERIFY_PER_RUN = 30;
const MAX_VERIFY_PER_LIGHT_RUN = 5;  // DB-REALTIME-01: lượt nhanh chỉ kiểm tối đa 5 bài (tiết kiệm request Cloudflare); lượt đầy đủ (10 phút) kiểm tiếp       // mỗi lượt kiểm tối đa 30 bài (mỗi bài 1-3 request); lượt sau kiểm tiếp
const MAX_REMOVE_FRACTION = 0.5;     // một lượt không xoá quá 50% số bài (khi > 10 bài): chống Server rỗng/nhầm Server làm mất cả kho
const REMOVED_BACKUP_FILE = 'songs.removed-by-sync.json'; // bài bị xoá được chép sang đây (kèm BPM chỉ có ở máy) để khôi phục khi cần
// Bài "từ Server" = đã có songId (Server từng biết) hoặc ghi chú nguồn: server. Bài chỉ có ở máy (chưa có songId) vẫn được đẩy lên như cũ.
const fromServer = (s) => !!(s && (s.songId || /nguồn:\s*server/i.test(String(s.notes || ''))));

function createSongDbServerSync({ keyServerSync, db = SongDatabase, fetchFn = null, isEnabled = () => true, now = Date.now, logger = console } = {}) {
    let running = false;
    let last = null; // { at, ok, pulled, filled, pushed, pending, error }

    async function fetchList() {
        const r = await keyServerSync._request('/list', { method: 'GET' }, LIST_TIMEOUT_MS);
        if (!r.ok || !r.json || !Array.isArray(r.json.danhSach)) return { ok: false, error: r.error || ('http-' + r.status) };
        return { ok: true, list: r.json.danhSach };
    }

    // 'exists' | 'deleted' | 'unknown' — chỉ 'deleted' khi Server TRẢ LỜI RÕ là không còn bài (lỗi mạng/5xx/route cũ = 'unknown' -> giữ bài).
    async function verifyOnServer(s) {
        try {
            const ids = [];
            if (s.songId) ids.push(String(s.songId));
            const own = makeSongId(s.title, s.artist);
            if (ids.indexOf(own) < 0) ids.push(own);
            for (const id of ids) {
                const r = await keyServerSync._request('/song-full?id=' + encodeURIComponent(id), { method: 'GET' }, LIST_TIMEOUT_MS);
                if (!r || !r.ok || !r.json) return { state: 'unknown' };
                const segs = Array.isArray(r.json.doans) ? r.json.doans : [];
                const info = r.json.thongTin || {};
                if (segs.length || (info.title && info.title !== 'Chua dat ten')) return { state: 'exists', songId: id, totalSec: Number(info.totalSec) > 0 ? Number(info.totalSec) : null };
            }
            // Không ID nào còn bài -> thử theo tên (bài có thể được tạo lại với ID khác)
            const f = await keyServerSync._request('/find?title=' + encodeURIComponent(String(s.title)) + '&artist=' + encodeURIComponent(String(s.artist || '')), { method: 'GET' }, LIST_TIMEOUT_MS);
            if (!f || (!f.ok && !(f.json && f.json.found === false))) return { state: 'unknown' };
            if (f.json && f.json.found === true && normalizeTitle(f.json.title) === normalizeTitle(s.title)) return { state: 'exists', songId: f.json.songId || null };
            return { state: 'deleted' };
        } catch (e) { return { state: 'unknown' }; }
    }

    function backupRemoved(entries) {
        try {
            if (!db.filePath || !entries.length) return;
            const f = path.join(path.dirname(db.filePath), REMOVED_BACKUP_FILE);
            let arr = [];
            try { arr = JSON.parse(fs.readFileSync(f, 'utf-8')); if (!Array.isArray(arr)) arr = []; } catch (e) { arr = []; }
            const at = new Date(now()).toISOString();
            entries.forEach((e) => arr.push({ removedAt: at, song: e }));
            if (arr.length > 500) arr = arr.slice(-500);
            fs.writeFileSync(f, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
        } catch (e) { logger.warn && logger.warn('[SongDbServerSync] không ghi được bản sao bài đã xoá:', e && e.message); }
    }

    async function run(opts) {
        // DB-REALTIME-01: { light:true } = lượt NHANH (chạy mỗi ~20 giây): chỉ kéo + cập nhật Key + kiểm xoá vài bài, KHÔNG đẩy lên (đẩy tốn nhiều request).
        const light = !!(opts && opts.light);
        if (!isEnabled()) return (last = { at: now(), ok: false, error: 'Đồng bộ đang TẮT (keyServerAutoSync=false).' });
        if (running) return { ok: false, error: 'Đang đồng bộ, vui lòng chờ.' };
        running = true;
        try {
            const got = await fetchList();
            if (!got.ok) return (last = { at: now(), ok: false, error: 'Không kết nối được server (' + got.error + ').' });

            // ---- KÉO ----
            let songs = db.load();
            const byTitle = new Map();
            songs.forEach((s, i) => { const k = normalizeTitle(s.title); if (k && !byTitle.has(k)) byTitle.set(k, i); });
            let pulled = 0, filled = 0, updated = 0, changed = false;
            const updatedTitles = [];
            const serverTitles = new Set();
            for (const it of got.list) {
                const title = String((it && it.title) || '').trim();
                const nk = normalizeTitle(title);
                if (nk.length < 3 || title === 'Chua dat ten') continue;
                serverTitles.add(nk);
                const key = it.key ? serverKeyToAppKey(it.key, it.mode) : null;
                if (!key) continue;
                const dsec = parseClock(it.tongThoiLuong); // DB-MATCH-ID-02: độ dài bản thu (giây) để Menu phân biệt MV/Karaoke/Live cùng tên
                if (!byTitle.has(nk)) {
                    songs.push(Object.assign({ title, artist: '', key, bpm: null, modulation: null, notes: 'nguồn: server', songId: it.songId || undefined }, dsec > 0 ? { durationSec: dsec } : {}));
                    byTitle.set(nk, songs.length - 1); pulled++; changed = true;
                } else {
                    const s = songs[byTitle.get(nk)];
                    const sameRecord = !s.songId || !it.songId || s.songId === it.songId; // khác songId = bản thu khác (MV/Karaoke...) -> không đụng
                    // DB-REALTIME-01: không cùng songId mà độ dài lệch > 3 giây = rất có thể là BẢN THU KHÁC cùng tên -> không đổi Key/độ dài (giống luật DB-MATCH-ID-02)
                    const durClash = dsec > 0 && s.durationSec > 0 && Math.abs(s.durationSec - dsec) > 3 && !(s.songId && it.songId && s.songId === it.songId);
                    if (dsec > 0 && s.durationSec !== dsec && sameRecord && !durClash) { s.durationSec = dsec; changed = true; } // chỉ khi cùng bản ghi
                    if (!String(s.key || '').trim()) { s.key = key; filled++; changed = true; }
                    else if (sameRecord && !durClash && String(s.key).trim() !== key) { // DB-REALTIME-01: Server là nguồn chuẩn -> đổi Key theo Server (BPM giữ nguyên)
                        logger.log && logger.log('[SongDbServerSync] Key "' + s.title + '": ' + s.key + ' -> ' + key + ' (theo Server)');
                        s.key = key; updated++; updatedTitles.push(nk); changed = true;
                    }
                    if (!s.songId && it.songId && !durClash) { s.songId = it.songId; changed = true; } // nhớ ID server để lần sau dò theo ID (không nhận ID của bản thu khác độ dài)
                }
            }
            if (changed) db.save(songs);

            // ---- XOÁ THEO SERVER (DB-SYNC-02) ----
            const serverIds = new Set(got.list.map((it) => it && it.songId).filter(Boolean).map(String));
            const toCheck = songs.filter((s) => fromServer(s) && normalizeTitle(s.title).length >= 3
                && !(s.songId ? serverIds.has(String(s.songId)) : serverTitles.has(normalizeTitle(s.title))));
            const gone = new Set();
            let verifyLeft = 0, idsLearned = false, durLearned = false;
            for (let i = 0; i < toCheck.length; i++) {
                if (i >= (light ? MAX_VERIFY_PER_LIGHT_RUN : MAX_VERIFY_PER_RUN)) { verifyLeft = toCheck.length - i; break; }
                const v = await verifyOnServer(toCheck[i]);
                if (v.state === 'deleted') gone.add(toCheck[i]);
                else if (v.state === 'unknown') { verifyLeft = toCheck.length - i; break; } // Server không trả lời rõ: dừng, giữ nguyên các bài còn lại
                else {
                    if (!toCheck[i].songId && v.songId) { toCheck[i].songId = v.songId; idsLearned = true; }
                    if (v.totalSec > 0 && toCheck[i].durationSec !== v.totalSec) { toCheck[i].durationSec = v.totalSec; durLearned = true; } // DB-MATCH-ID-02
                }
            }
            let removed = 0, removeBlocked = 0;
            if (gone.size > 10 && gone.size > songs.length * MAX_REMOVE_FRACTION) {
                removeBlocked = gone.size; gone.clear(); // bất thường (vd Server rỗng) -> KHÔNG xoá gì, chờ người kiểm tra
                logger.warn && logger.warn('[SongDbServerSync] Server báo mất quá nhiều bài cùng lúc -> không xoá trên máy (chống mất dữ liệu).');
            }
            if (gone.size) {
                backupRemoved(songs.filter((s) => gone.has(s)));
                songs = songs.filter((s) => !gone.has(s));
                removed = gone.size; changed = true;
            }
            if (removed || idsLearned || durLearned) db.save(songs);

            // ---- ĐẨY ----
            let pushed = 0, pending = 0, failed = 0, idsChanged = false;
            for (const s of (light ? [] : songs)) {
                const nk = normalizeTitle(s.title);
                if (nk.length < 3 || !String(s.key || '').trim() || serverTitles.has(nk)) continue;
                if (fromServer(s)) continue; // DB-SYNC-02: bài vốn từ Server mà Server không có = Server đã xoá -> KHÔNG đẩy ngược lên (trước đây làm bài đã xoá sống lại)
                if (pushed + failed >= MAX_PUSH_PER_RUN) { pending++; continue; }
                const r = await keyServerSync.submit({ title: s.title, artist: s.artist, key: s.key, confidence: 1 });
                if (r.ok && (r.reason === 'submitted' || r.reason === 'server-already-has')) {
                    if (!s.songId) { s.songId = makeSongId(s.title, s.artist); idsChanged = true; }
                    if (r.reason === 'submitted') pushed++;
                }
                else if (!r.ok && r.reason !== 'cooldown') failed++;
            }
            if (idsChanged) db.save(songs);
            last = { at: now(), ok: true, light, pulled, filled, updated, updatedTitles, pushed, pending, failed, removed, removeBlocked, verifyLeft, serverCount: got.list.length };
            return last;
        } catch (err) {
            logger.error && logger.error('[SongDbServerSync] lỗi:', err);
            return (last = { at: now(), ok: false, error: String((err && err.message) || err) });
        } finally {
            running = false;
        }
    }

    return { run, getLast: () => last, isRunning: () => running };
}

module.exports = { createSongDbServerSync, MAX_PUSH_PER_RUN, MAX_VERIFY_PER_RUN };
