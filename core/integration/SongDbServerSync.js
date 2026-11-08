'use strict';
/**
 * core/integration/SongDbServerSync.js — DB-SYNC-01
 * ===========================================================================
 * Đồng bộ HAI CHIỀU giữa data/songs.json (máy này) và Key Server (Cloudflare):
 *   - KÉO (pull) : bài có trên server mà máy chưa có -> thêm vào songs.json;
 *                  bài máy có nhưng chưa có Key -> điền Key từ server.
 *                  KHÔNG BAO GIỜ ghi đè Key/BPM đã có trên máy.
 *   - ĐẨY (push) : bài máy có Key mà server chưa có -> gửi lên (dùng KeyServerSync.submit:
 *                  tự hỏi server trước, không gửi trùng).
 * Giới hạn của server hiện tại: /list chỉ trả 100–200 bài mới nhất, không có ca sĩ/BPM
 * (nên bài kéo về có artist rỗng, bpm null; BPM chỉ nằm ở máy).
 * Không throw: mọi lỗi mạng trả { ok:false, error }. Module thuần Node, tiêm sẵn fetch/db để test.
 */
const SongDatabase = require('../reference/SongDatabase');
const { serverKeyToAppKey, normalizeTitle, makeSongId } = require('./KeyServerSync');

const MAX_PUSH_PER_RUN = 25;      // mỗi lượt chỉ đẩy tối đa 25 bài (mỗi bài ≥ 2–3 request) — lượt sau đẩy tiếp
const LIST_TIMEOUT_MS = 8000;

function createSongDbServerSync({ keyServerSync, db = SongDatabase, fetchFn = null, isEnabled = () => true, now = Date.now, logger = console } = {}) {
    let running = false;
    let last = null; // { at, ok, pulled, filled, pushed, pending, error }

    async function fetchList() {
        const r = await keyServerSync._request('/list', { method: 'GET' }, LIST_TIMEOUT_MS);
        if (!r.ok || !r.json || !Array.isArray(r.json.danhSach)) return { ok: false, error: r.error || ('http-' + r.status) };
        return { ok: true, list: r.json.danhSach };
    }

    async function run() {
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
            let pulled = 0, filled = 0, changed = false;
            const serverTitles = new Set();
            for (const it of got.list) {
                const title = String((it && it.title) || '').trim();
                const nk = normalizeTitle(title);
                if (nk.length < 3 || title === 'Chua dat ten') continue;
                serverTitles.add(nk);
                const key = it.key ? serverKeyToAppKey(it.key, it.mode) : null;
                if (!key) continue;
                if (!byTitle.has(nk)) {
                    songs.push({ title, artist: '', key, bpm: null, modulation: null, notes: 'nguồn: server', songId: it.songId || undefined });
                    byTitle.set(nk, songs.length - 1); pulled++; changed = true;
                } else {
                    const s = songs[byTitle.get(nk)];
                    if (!String(s.key || '').trim()) { s.key = key; filled++; changed = true; }
                    if (!s.songId && it.songId) { s.songId = it.songId; changed = true; } // nhớ ID server để lần sau dò theo ID
                }
            }
            if (changed) db.save(songs);

            // ---- ĐẨY ----
            let pushed = 0, pending = 0, failed = 0, idsChanged = false;
            for (const s of songs) {
                const nk = normalizeTitle(s.title);
                if (nk.length < 3 || !String(s.key || '').trim() || serverTitles.has(nk)) continue;
                if (pushed + failed >= MAX_PUSH_PER_RUN) { pending++; continue; }
                const r = await keyServerSync.submit({ title: s.title, artist: s.artist, key: s.key, confidence: 1 });
                if (r.ok && (r.reason === 'submitted' || r.reason === 'server-already-has')) {
                    if (!s.songId) { s.songId = makeSongId(s.title, s.artist); idsChanged = true; }
                    if (r.reason === 'submitted') pushed++;
                }
                else if (!r.ok && r.reason !== 'cooldown') failed++;
            }
            if (idsChanged) db.save(songs);
            last = { at: now(), ok: true, pulled, filled, pushed, pending, failed, serverCount: got.list.length };
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

module.exports = { createSongDbServerSync, MAX_PUSH_PER_RUN };
