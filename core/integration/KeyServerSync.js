/**
 * core/integration/KeyServerSync.js — Task C (nối Menu với Key Server)
 * ===========================================================================
 * Cầu nối giữa app Menu và Key Server (Cloudflare Worker + D1):
 *
 *   1) lookup(title, artist)  — HỎI SERVER TRƯỚC khi tự dò Key. Server trả Key
 *      của bài (nếu có) theo tên bài đã chuẩn hoá (route /find của worker.js).
 *   2) submit({...})          — SAU KHI tự dò Key xong, gửi kết quả lên server
 *      (route /set-song-info + /add-segment) để lần sau máy nào cũng dùng được.
 *
 * Nguyên tắc (không phá vỡ luồng cũ):
 *   - KHÔNG BAO GIỜ throw. Mọi lỗi mạng/JSON/timeout đều trả kết quả "không có",
 *     app tiếp tục dò Key như cũ.
 *   - Có timeout cứng, cache (trúng / trượt / lỗi), chống gọi trùng đồng thời.
 *   - submit chỉ gửi khi server CHƯA có bài (tránh nhân đôi đoạn Key, vì
 *     /add-segment luôn INSERT mới) và chỉ gửi mỗi bài 1 lần thành công.
 *   - Module thuần Node, KHÔNG phụ thuộc Electron — fetch được tiêm vào để test.
 *
 * Định dạng Key:
 *   - App (KeyEngine)  : "C Major" / "G# Minor" (dùng dấu thăng).
 *   - Server           : key "C" / "G#" + mode "major" / "minor".
 *   Hàm đổi qua lại nằm ở đây; tên giáng (Bb, Eb...) được đổi sang thăng (A#, D#...).
 */
'use strict';

const crypto = require('crypto');

const DEFAULT_SERVER_URL = 'https://menu-key-server.matuotluuly.workers.dev';

const LOOKUP_TIMEOUT_MS = 2000;
const SUBMIT_TIMEOUT_MS = 5000;
const HIT_TTL_MS = 10 * 60 * 1000;   // bài đã có trên server: nhớ 10 phút
const MISS_TTL_MS = 60 * 1000;       // bài chưa có: hỏi lại sau 60 giây
const ERROR_TTL_MS = 15 * 1000;      // server lỗi/chậm: thử lại sau 15 giây
const SUBMIT_RETRY_COOLDOWN_MS = 30 * 1000;
const ENABLED_CACHE_MS = 5 * 1000;
const CACHE_MAX_ENTRIES = 500;
const LOG_ONCE_WINDOW_MS = 60 * 1000; // cùng 1 lý do cho cùng 1 bài: chỉ ghi log 1 lần/60 giây (vòng dò khóa Key lặp lại liên tục)

// Chỉ gửi Key lên server khi độ tin cậy từ KeyEngine (0..1) đạt ngưỡng này.
// 0.55 = đúng KeyEngine.MIN_CONFIDENCE (ngưỡng bộ dò tự coi là "có Key") — không khắt khe hơn chính bộ dò.
const MIN_SUBMIT_CONFIDENCE = 0.55;
// Menu (SMTC) không biết độ dài bài -> coi Key này áp dụng cho TOÀN BÀI.
const WHOLE_SONG_END_SEC = 36000;

const VALID_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };

// PHẢI giống hệt chuanHoaTen() trong worker.js (có test đối chiếu).
function normalizeTitle(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// ID ổn định cho bài do Menu tự gửi (khác mã video YouTube của extension).
function makeSongId(title, artist) {
    const base = normalizeTitle(title) + '|' + normalizeTitle(artist);
    return 'app_' + crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
}

function parseRoot(raw) {
    const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(String(raw || '').trim());
    if (!m) return null;
    let root = m[1].toUpperCase() + m[2].replace('♯', '#').replace('♭', 'b');
    if (FLAT_TO_SHARP[root]) root = FLAT_TO_SHARP[root];
    return VALID_ROOTS.includes(root) ? root : null;
}

function parseMode(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (/^maj/.test(s)) return 'major';
    if (/^min/.test(s)) return 'minor';
    return null;
}

// Server {key:"G#", mode:"minor"} -> "G# Minor"; không hợp lệ -> null.
function serverKeyToAppKey(key, mode) {
    const root = parseRoot(key);
    const m = parseMode(mode);
    if (!root || !m) return null;
    return root + ' ' + (m === 'major' ? 'Major' : 'Minor');
}

// App "G# Minor" -> {key:"G#", mode:"minor"}; không hợp lệ -> null.
function appKeyToServerKey(appKey) {
    const parts = String(appKey || '').trim().split(/\s+/);
    if (parts.length !== 2) return null;
    const root = parseRoot(parts[0]);
    const mode = parseMode(parts[1]);
    if (!root || !mode) return null;
    return { key: root, mode };
}

class KeyServerSync {
    /**
     * @param {object} [opts]
     * @param {string}   [opts.serverUrl]
     * @param {Function} [opts.fetchFn]     mặc định global fetch
     * @param {Function} [opts.now]         mặc định Date.now
     * @param {Function} [opts.isEnabled]   () => boolean (mặc định luôn bật)
     * @param {object}   [opts.logger]      mặc định console
     */
    constructor(opts = {}) {
        this.serverUrl = String(opts.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
        this.fetchFn = opts.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        this.now = opts.now || Date.now;
        this.isEnabledFn = opts.isEnabled || (() => true);
        this.logger = opts.logger || console;
        this.lookupTimeoutMs = opts.lookupTimeoutMs || LOOKUP_TIMEOUT_MS;
        this.submitTimeoutMs = opts.submitTimeoutMs || SUBMIT_TIMEOUT_MS;

        this._cache = new Map();           // cacheKey -> { at, ttl, value }
        this._lookupInflight = new Map();  // cacheKey -> Promise
        this._submitted = new Set();       // songId đã gửi/đã có trên server
        this._submitInflight = new Map();  // songId -> Promise
        this._submitFailedAt = new Map();  // songId -> thời điểm lỗi gần nhất
        this._enabledAt = -Infinity;
        this._enabledValue = true;
        this._logAt = new Map();           // khóa log -> thời điểm ghi gần nhất (chống spam)
    }

    // Ghi log lý do (không bao giờ throw). Cùng 1 khóa chỉ ghi 1 lần / LOG_ONCE_WINDOW_MS,
    // vì vòng dò khóa Key trong renderer gọi lặp lại liên tục cho cùng 1 bài.
    _log(logKey, text) {
        try {
            const t = this.now();
            const last = this._logAt.get(logKey);
            if (last !== undefined && t - last < LOG_ONCE_WINDOW_MS) return;
            if (this._logAt.size >= CACHE_MAX_ENTRIES) this._logAt.delete(this._logAt.keys().next().value);
            this._logAt.set(logKey, t);
            this.logger.log('[KeyServer] ' + text);
        } catch (e) { /* log không bao giờ được làm hỏng luồng chính */ }
    }

    _enabled() {
        const t = this.now();
        if (t - this._enabledAt > ENABLED_CACHE_MS) {
            try { this._enabledValue = !!this.isEnabledFn(); } catch (e) { this._enabledValue = true; }
            this._enabledAt = t;
        }
        return this._enabledValue;
    }

    _cacheKey(title, artist) {
        return normalizeTitle(title) + '|' + normalizeTitle(artist);
    }

    _cacheGet(ck) {
        const e = this._cache.get(ck);
        if (!e) return null;
        if (this.now() - e.at > e.ttl) { this._cache.delete(ck); return null; }
        return e.value;
    }

    _cacheSet(ck, value, ttl) {
        if (this._cache.size >= CACHE_MAX_ENTRIES) {
            const oldest = this._cache.keys().next().value;
            this._cache.delete(oldest);
        }
        this._cache.set(ck, { at: this.now(), ttl, value });
    }

    // Chỉ đọc cache: trả kết quả "trúng" còn hạn, ngược lại null. Đồng bộ, không gọi mạng.
    peek(title, artist) {
        if (!this._enabled()) return null;
        const v = this._cacheGet(this._cacheKey(title, artist));
        return v && v.found ? v : null;
    }

    // Gọi mạng có timeout. Không bao giờ throw: lỗi -> { ok:false, error }.
    async _request(pathAndQuery, init, timeoutMs) {
        if (!this.fetchFn) return { ok: false, error: 'no-fetch' };
        let timer = null;
        try {
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
            if (ctrl) timer = setTimeout(() => ctrl.abort(), timeoutMs);
            const res = await this.fetchFn(this.serverUrl + pathAndQuery, Object.assign({}, init || {}, ctrl ? { signal: ctrl.signal } : {}));
            let json = null;
            try { json = await res.json(); } catch (e) { json = null; }
            return { ok: !!res.ok, status: res.status, json };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : String((e && e.message) || e) };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * Hỏi server Key của bài. Luôn resolve (không throw):
     *   { found:true, key:"C Major", songId, title, source:"server" }
     *   { found:false }                       — server không có bài này
     *   { found:false, error:"..." }          — lỗi mạng/timeout/không đọc được
     *   { found:false, disabled:true }        — người dùng tắt đồng bộ
     */
    async lookup(title, artist, { force = false } = {}) {
        if (!this._enabled()) return { found: false, disabled: true };
        if (normalizeTitle(title).length < 3) return { found: false };

        const ck = this._cacheKey(title, artist);
        if (!force) {
            const cached = this._cacheGet(ck);
            if (cached) return cached;
        }
        if (this._lookupInflight.has(ck)) return this._lookupInflight.get(ck);

        const p = (async () => {
            const q = '/find?title=' + encodeURIComponent(String(title)) + '&artist=' + encodeURIComponent(String(artist || ''));
            const r = await this._request(q, { method: 'GET' }, this.lookupTimeoutMs);

            if (!r.ok && !(r.json && r.json.found === false)) {
                const val = { found: false, error: r.error || ('http-' + r.status) };
                this._cacheSet(ck, val, ERROR_TTL_MS);
                this._log('lookup-err|' + ck, 'Không tra được server (' + val.error + ') -> Menu tự dò Key như cũ'
                    + (r.status === 404 ? ' [404: server chưa có code mới /find?]' : ''));
                return val;
            }
            const j = r.json;
            if (j && j.found === true) {
                const appKey = serverKeyToAppKey(j.key, j.mode);
                if (appKey) {
                    const val = { found: true, key: appKey, songId: j.songId || null, title: j.title || null, source: 'server' };
                    this._cacheSet(ck, val, HIT_TTL_MS);
                    this._log('lookup-hit|' + ck, 'Server CÓ bài "' + String(title) + '" -> ' + appKey);
                    return val;
                }
                const bad = { found: false, error: 'bad-key-from-server' };
                this._cacheSet(ck, bad, ERROR_TTL_MS);
                this._log('lookup-badkey|' + ck, 'Server trả Key không hợp lệ (' + String(j.key) + ' / ' + String(j.mode) + ') -> bỏ qua');
                return bad;
            }
            const miss = { found: false };
            this._cacheSet(ck, miss, MISS_TTL_MS);
            this._log('lookup-miss|' + ck, 'Server CHƯA có bài "' + String(title) + '" -> Menu tự dò, dò xong sẽ gửi lên');
            return miss;
        })().finally(() => { this._lookupInflight.delete(ck); });

        this._lookupInflight.set(ck, p);
        return p;
    }

    /**
     * Gửi Key vừa dò lên server (chỉ khi server chưa có bài). Luôn resolve:
     *   { ok:true,  reason:"submitted" | "server-already-has" | "already-submitted" }
     *   { ok:false, reason:"disabled" | "no-title" | "low-confidence" | "bad-key" |
     *                      "cooldown" | "lookup-failed" | "info-failed" | "segment-failed" }
     */
    async submit({ title, artist, key, confidence, durationSec } = {}) {
        const label = String(title || '');
        const reject = (reason, text) => { this._log('reject|' + reason + '|' + this._cacheKey(title, artist), 'Không gửi Key: ' + text); return { ok: false, reason }; };

        if (!this._enabled()) return reject('disabled', 'đồng bộ đang TẮT (keyServerAutoSync=false)');
        if (normalizeTitle(title).length < 3) return reject('no-title', 'chưa biết tên bài đang phát (hoặc tên quá ngắn)');
        if (!(Number(confidence) >= MIN_SUBMIT_CONFIDENCE)) {
            return reject('low-confidence', 'độ tin cậy ' + (Number.isFinite(Number(confidence)) && confidence !== undefined && confidence !== null ? Math.round(Number(confidence) * 100) + '%' : 'không rõ')
                + ' < ngưỡng ' + Math.round(MIN_SUBMIT_CONFIDENCE * 100) + '% (bài "' + label + '")');
        }
        const sk = appKeyToServerKey(key);
        if (!sk) return reject('bad-key', 'Key "' + String(key) + '" không hợp lệ');

        const songId = makeSongId(title, artist);
        if (this._submitted.has(songId)) return { ok: true, reason: 'already-submitted' };
        if (this._submitInflight.has(songId)) return this._submitInflight.get(songId);

        const failedAt = this._submitFailedAt.get(songId);
        if (failedAt !== undefined && this.now() - failedAt < SUBMIT_RETRY_COOLDOWN_MS) {
            return { ok: false, reason: 'cooldown' };
        }

        const p = (async () => {
            const fail = (reason, text) => {
                this._submitFailedAt.set(songId, this.now());
                this._log('fail|' + reason + '|' + songId, 'Gửi Key lỗi (' + reason + '): ' + text + ' -> thử lại sau ' + (SUBMIT_RETRY_COOLDOWN_MS / 1000) + ' giây');
                return { ok: false, reason };
            };

            // Server đã có bài (máy khác hoặc extension đã gửi) -> không gửi trùng.
            const existing = await this.lookup(title, artist, { force: true });
            if (existing.found) {
                this._submitted.add(songId);
                this._log('already|' + songId, 'Không gửi Key: server ĐÃ có bài "' + label + '" (' + existing.key + ')');
                return { ok: true, reason: 'server-already-has' };
            }
            if (existing.error) return fail('lookup-failed', 'không xác minh được server (' + existing.error + '), không gửi để tránh trùng');

            const dur = Number(durationSec) > 0 ? Math.round(Number(durationSec)) : null;
            const info = await this._request('/set-song-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId,
                    title: String(title),
                    totalDurationSec: dur,
                    note: artist ? ('artist: ' + String(artist) + ' | nguon: AUTO_MENU_AI') : 'nguon: AUTO_MENU_AI'
                })
            }, this.submitTimeoutMs);
            if (!info.ok || !info.json || info.json.ok !== true) return fail('info-failed', 'server từ chối lưu thông tin bài (' + (info.error || ('http-' + info.status)) + ')');

            const seg = await this._request('/add-segment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId,
                    startSec: 0,
                    endSec: dur || WHOLE_SONG_END_SEC,
                    key: sk.key,
                    mode: sk.mode,
                    weight: 1.0
                })
            }, this.submitTimeoutMs);
            if (!seg.ok || !seg.json || seg.json.ok !== true) return fail('segment-failed', 'server từ chối lưu đoạn Key (' + (seg.error || ('http-' + seg.status)) + ')');

            this._submitted.add(songId);
            this._submitFailedAt.delete(songId);
            // Lần hỏi tiếp theo thấy ngay bài đã có.
            this._cacheSet(this._cacheKey(title, artist), { found: true, key: serverKeyToAppKey(sk.key, sk.mode), songId, title: String(title), source: 'server' }, HIT_TTL_MS);
            this._log('sent|' + songId, 'ĐÃ GỬI Key lên server: "' + label + '" -> ' + serverKeyToAppKey(sk.key, sk.mode) + ' (id ' + songId + ')');
            return { ok: true, reason: 'submitted' };
        })().finally(() => { this._submitInflight.delete(songId); });

        this._submitInflight.set(songId, p);
        return p;
    }
}

module.exports = {
    KeyServerSync,
    normalizeTitle,
    makeSongId,
    serverKeyToAppKey,
    appKeyToServerKey,
    MIN_SUBMIT_CONFIDENCE,
    WHOLE_SONG_END_SEC,
    DEFAULT_SERVER_URL
};
