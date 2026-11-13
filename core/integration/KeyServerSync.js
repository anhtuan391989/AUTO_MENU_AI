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
const { durationMismatch, parseClock } = require('../reference/RecordingDuration');

const DEFAULT_SERVER_URL = 'https://menu-key-server.matuotluuly.workers.dev';

const LOOKUP_TIMEOUT_MS = 2000;
const SUBMIT_TIMEOUT_MS = 5000;
const HIT_TTL_MS = 20 * 1000;        // bài đã có trên server: nhớ 20 giây (DB-REALTIME-01: ngắn để Key vừa SỬA trên server tới Menu gần như ngay)
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

// OLD-KEY-01: bản ghi "Chua dat ten" (không có tên) trên Server KHÔNG dùng làm Key. Chỉ BỎ QUA khi tra cứu — không xoá, không sửa gì trên Server.
const UNNAMED_TITLE_NORM = 'chua dat ten';
function isUnnamedTitle(t) { return normalizeTitle(t) === UNNAMED_TITLE_NORM; }
function isUnusableServerTitle(t) { const n = normalizeTitle(t); return n === '' || n === UNNAMED_TITLE_NORM; }

// ID ổn định cho bài do Menu tự gửi (khác mã video YouTube của extension).
// DB-MATCH-ID-02: truyền thêm durationSec -> ID RIÊNG cho bản thu có độ dài đó (dùng khi cùng tên đã có bản khác độ dài trên Server).
function makeSongId(title, artist, durationSec) {
    const d = Number(durationSec);
    const base = normalizeTitle(title) + '|' + normalizeTitle(artist) + (d > 0 ? '|d' + Math.round(d) : '');
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
        // DB-ID-01: (title, artist) => [songId đã biết ở máy]. Không bắt buộc; lỗi trong hàm này bị bỏ qua.
        this.idResolver = typeof opts.idResolver === 'function' ? opts.idResolver : null;
        this.idLookup = opts.idLookup === true; // true = dò theo ID bài hát trước, theo tên sau (main.js bật); mặc định tắt để giữ nguyên hành vi cũ
        // DB-MATCH-STRICT-01: true = kết quả /find chỉ "khớp mờ" (tên Server KHÁC tên đang phát sau khi chuẩn hoá) KHÔNG được coi là bài này.
        // Trả { found:false, similar:{key,songId,title} } -> Menu để AI dò (và tự gửi Key riêng của bản này lên Server). main.js bật; mặc định tắt = hành vi cũ.
        this.strictTitle = opts.strictTitle === true;
        // DB-MATCH-ID-02: (title, artist) => độ dài (giây) của bài ĐANG PHÁT nếu biết, ngược lại null. Có độ dài -> Server báo bài cùng tên mà
        // KHÁC độ dài (> 3 giây) thì coi là bản thu khác, không dùng Key đó. Không truyền = hành vi cũ.
        this.durationResolver = typeof opts.durationResolver === 'function' ? opts.durationResolver : null;

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

    // Độ dài bài đang phát: ưu tiên giá trị truyền vào, sau đó hỏi durationResolver. Không biết -> null.
    _playingDuration(title, artist, explicit) {
        const e = Number(explicit);
        if (e > 0) return e;
        if (!this.durationResolver) return null;
        try { const d = Number(this.durationResolver(title, artist)); return d > 0 ? d : null; } catch (err) { return null; }
    }

    // Cùng tên nhưng khác độ dài = hai bản thu khác nhau -> bộ nhớ đệm phải tách riêng theo độ dài.
    _cacheKey(title, artist, durationSec) {
        const base = normalizeTitle(title) + '|' + normalizeTitle(artist);
        return Number(durationSec) > 0 ? base + '|d' + Math.round(Number(durationSec)) : base;
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
        const v = this._cacheGet(this._cacheKey(title, artist, this._playingDuration(title, artist)));
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
            const __c = e && e.cause, __code = __c && (__c.code || __c.errno || __c.name); // DB-STATUS-ERR-01: lý do thật của "fetch failed"
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : String((e && e.message) || e) + (__code ? ' (' + __code + ')' : '') };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    // Các ID thử theo thứ tự: ID đã lưu ở máy (vd ID server/YouTube kéo về) rồi tới ID app tự sinh từ tên bài.
    _candidateIds(title, artist, durationSec) {
        const ids = [];
        if (Number(durationSec) > 0) ids.push(makeSongId(title, artist, durationSec)); // DB-MATCH-ID-02: ID riêng của bản thu có đúng độ dài này (nếu từng gửi)
        if (this.idResolver) {
            try { (this.idResolver(title, artist) || []).forEach((x) => { if (x && ids.indexOf(String(x)) < 0) ids.push(String(x)); }); } catch (e) { /* bỏ qua */ }
        }
        const own = makeSongId(title, artist);
        if (ids.indexOf(own) < 0) ids.push(own);
        return ids.slice(0, Number(durationSec) > 0 ? 4 : 3);
    }

    // DB-MATCH-ID-02: thông tin bài trên Server theo ID: { ok, exists, totalSec }. Lỗi/không rõ -> ok:false (người gọi coi như KHÔNG đủ căn cứ để bác).
    async _songInfo(id) {
        const r = await this._request('/song-full?id=' + encodeURIComponent(String(id)), { method: 'GET' }, this.lookupTimeoutMs);
        if (!r.ok || !r.json) return { ok: false, exists: false, totalSec: null };
        const segs = Array.isArray(r.json.doans) ? r.json.doans : [];
        const info = r.json.thongTin || {};
        const t = Number(info.totalSec);
        return { ok: true, exists: segs.length > 0 || !!(info.title && info.title !== 'Chua dat ten'), totalSec: t > 0 ? t : null };
    }

    // { found:true,... } | { found:false,error } (lỗi mạng: dừng ngay, không thử tiếp) | null (không ID nào có bài)
    async _lookupById(title, artist, durationSec) {
        for (const id of this._candidateIds(title, artist, durationSec)) {
            const r = await this._request('/song-full?id=' + encodeURIComponent(id), { method: 'GET' }, this.lookupTimeoutMs);
            if (!r.ok) {
                if (r.error === 'timeout') return { found: false, error: 'timeout' }; // server chậm: không chờ thêm, báo lỗi như cũ
                return null; // lỗi khác (route cũ 404, 5xx...) -> hỏi theo tên như cũ
            }
            const d = r.json && Array.isArray(r.json.doans) ? r.json.doans : [];
            if (!d.length) continue;
            const appKey = serverKeyToAppKey(d[0].khoa, d[0].mode);
            if (!appKey) continue;
            const info = r.json.thongTin || {};
            if (isUnusableServerTitle(info.title)) continue; // OLD-KEY-01: bản ghi không tên -> bỏ qua
            // DB-MATCH-ID-02: bản ghi này có độ dài khác hẳn bài đang phát -> bản thu khác, thử ID kế tiếp
            if (durationMismatch(info.totalSec, durationSec)) continue;
            return { found: true, key: appKey, songId: id, title: info.title || String(title), source: 'server' };
        }
        return null;
    }

    // OLD-KEY-01: tên Server KHÁC tên đang phát (vd Key cũ do extension lưu theo tên tab dài). Có phải CÙNG bản thu không? -> xác minh bằng ĐỘ DÀI.
    // { same:true } chỉ khi cả hai độ dài đều biết và lệch <= ngưỡng. Thiếu một bên -> { same:false, reason } (không đủ căn cứ -> không dùng, giữ an toàn).
    async _sameRecordingByDuration(songId, playingDurSec, getInfo) {
        if (!(Number(playingDurSec) > 0)) return { same: false, reason: 'no-playing-duration' };
        const si = await getInfo(songId);
        if (!si.ok || !(Number(si.totalSec) > 0)) return { same: false, reason: 'no-server-duration' };
        if (durationMismatch(si.totalSec, playingDurSec)) return { same: false, reason: 'duration', serverDurationSec: si.totalSec };
        return { same: true, serverDurationSec: si.totalSec };
    }

    // OLD-KEY-01: /find chỉ trả 1 bài. Cùng tên có nhiều bản (MV 268s, Karaoke 290s...) mà /find chọn nhầm bản thì thử /list: tìm bản có tên
    // liên quan VÀ độ dài khớp (<= ngưỡng) VÀ có Key. Chỉ ĐỌC. Không đủ căn cứ / lỗi mạng -> null (Menu tự dò như cũ).
    async _findInList(title, durSec) {
        if (!(Number(durSec) > 0)) return null;
        const r = await this._request('/list', { method: 'GET' }, this.lookupTimeoutMs);
        const arr = r.ok && r.json && Array.isArray(r.json.danhSach) ? r.json.danhSach : null;
        if (!arr) return null;
        const q = normalizeTitle(title);
        const qw = new Set(q.split(' ').filter(Boolean));
        const related = (nt) => {
            if (!nt) return false;
            if (nt === q) return true;
            if (q.length >= 8 && nt.includes(q)) return true;
            if (nt.length >= 8 && q.includes(nt)) return true;
            const tw = new Set(nt.split(' ').filter(Boolean));
            let common = 0; for (const w of qw) if (tw.has(w)) common++;
            const smaller = Math.min(qw.size, tw.size);
            return common >= 3 && smaller > 0 && common / smaller >= 0.8;
        };
        let best = null;
        for (const it of arr) {
            if (!it || isUnusableServerTitle(it.title) || !it.songId) continue;
            const appKey = serverKeyToAppKey(it.key, it.mode);
            if (!appKey) continue;
            const sec = parseClock(it.tongThoiLuong);
            if (sec === null || durationMismatch(sec, durSec)) continue;
            const nt = normalizeTitle(it.title);
            if (!related(nt)) continue;
            const score = (nt === q ? 0 : 10) + Math.abs(sec - durSec);
            if (!best || score < best.score) best = { score, songId: String(it.songId), title: String(it.title), key: appKey, sec };
        }
        return best;
    }

    /**
     * Hỏi server Key của bài. Luôn resolve (không throw):
     *   { found:true, key:"C Major", songId, title, source:"server" }
     *   { found:false }                       — server không có bài này
     *   { found:false, error:"..." }          — lỗi mạng/timeout/không đọc được
     *   { found:false, disabled:true }        — người dùng tắt đồng bộ
     */
    async lookup(title, artist, { force = false, durationSec } = {}) {
        if (!this._enabled()) return { found: false, disabled: true };
        if (normalizeTitle(title).length < 3) return { found: false };

        const dur = this._playingDuration(title, artist, durationSec); // DB-MATCH-ID-02
        const ck = this._cacheKey(title, artist, dur);
        if (!force) {
            const cached = this._cacheGet(ck);
            if (cached) return cached;
        }
        if (this._lookupInflight.has(ck)) return this._lookupInflight.get(ck);

        const p = (async () => {
            // DB-ID-01: DÒ THEO ID BÀI HÁT trước (chính xác, không đoán tên). Hỏng/không có -> hỏi theo tên như cũ.
            const byId = this.idLookup ? await this._lookupById(title, artist, dur) : null;
            if (byId && byId.found) { this._cacheSet(ck, byId, HIT_TTL_MS); this._log('lookup-id|' + ck, 'Server CÓ bài theo ID ' + byId.songId + ' -> ' + byId.key); return byId; }
            if (byId && byId.error) { this._cacheSet(ck, byId, ERROR_TTL_MS); return byId; }
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
            if (j && j.found === true && isUnnamedTitle(j.title)) {
                // OLD-KEY-01: bản ghi "Chua dat ten" -> coi như Server chưa có bài này
                const miss0 = { found: false };
                this._cacheSet(ck, miss0, MISS_TTL_MS);
                this._log('lookup-unnamed|' + ck, 'Server chỉ có bản ghi KHÔNG TÊN cho \"' + String(title) + '\" -> bỏ qua, Menu tự dò Key');
                return miss0;
            }
            let siMemo = null; // chỉ hỏi /song-full 1 lần cho mỗi lượt tra
            const getInfo = async (id) => (siMemo || (siMemo = await this._songInfo(id)));
            // OLD-KEY-01: /find chọn nhầm bản khác -> thử tìm đúng bản theo tên liên quan + độ dài trong /list
            const rescue = async () => {
                const alt = await this._findInList(title, dur);
                if (!alt) return null;
                const val = { found: true, key: alt.key, songId: alt.songId, title: alt.title, source: 'server' };
                this._cacheSet(ck, val, HIT_TTL_MS);
                this._log('lookup-list|' + ck, 'Tìm đúng bản theo độ dài trong danh sách Server: \"' + alt.title + '\" (' + Math.round(alt.sec) + 's) -> ' + alt.key);
                return val;
            };
            if (this.strictTitle && j && j.found === true && typeof j.title === 'string' && j.title.trim()
                && normalizeTitle(j.title) !== normalizeTitle(title)) {
                // Tên Server khác tên đang phát. OLD-KEY-01: nếu ĐỘ DÀI khớp (<= ngưỡng) thì vẫn là CÙNG bản thu (Key cũ của extension) -> dùng.
                const v = j.songId ? await this._sameRecordingByDuration(j.songId, dur, getInfo) : { same: false, reason: 'no-id' };
                if (v.same) {
                    this._log('lookup-oldkey|' + ck, 'Key CŨ trên Server \"' + j.title + '\" khác tên nhưng cùng độ dài (' + Math.round(v.serverDurationSec) + 's) -> dùng làm Key bài \"' + String(title) + '\"');
                } else {
                    // Khác độ dài, hoặc thiếu độ dài một bên -> không chắc cùng bản thu: KHÔNG dùng làm Key bài này.
                    const alt1 = await rescue(); if (alt1) return alt1;
                    const simKey = serverKeyToAppKey(j.key, j.mode);
                    const sim = { found: false, similar: { key: simKey, songId: j.songId || null, title: j.title, reason: v.reason || 'title' } };
                    if (v.serverDurationSec) sim.similar.serverDurationSec = v.serverDurationSec;
                    this._cacheSet(ck, sim, MISS_TTL_MS);
                    this._log('lookup-similar|' + ck, 'Server chỉ có bài GẦN GIỐNG \"' + j.title + '\" (' + (simKey || '?') + ') != \"' + String(title) + '\" (' + (v.reason || 'tên khác') + ') -> không dùng, Menu tự dò Key bản này');
                    return sim;
                }
            }
            if (dur && j && j.found === true && j.songId) {
                // DB-MATCH-ID-02: tên khớp ĐÚNG nhưng độ dài bản trên Server khác bài đang phát -> bản thu khác (MV/Karaoke/Live), không dùng Key đó.
                const si = await getInfo(j.songId);
                if (si.ok && durationMismatch(si.totalSec, dur)) {
                    const alt2 = await rescue(); if (alt2) return alt2;
                    const sk = serverKeyToAppKey(j.key, j.mode);
                    const sim = { found: false, similar: { key: sk, songId: j.songId, title: j.title || null, reason: 'duration', serverDurationSec: si.totalSec } };
                    this._cacheSet(ck, sim, MISS_TTL_MS);
                    this._log('lookup-duration|' + ck, 'Server có \"' + String(j.title || title) + '\" nhưng dài ' + Math.round(si.totalSec) + 's != bài đang phát ' + Math.round(dur) + 's -> bản thu khác, Menu tự dò Key');
                    return sim;
                }
            }
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
     * Lấy các ĐOẠN Key của 1 bài (route /song-full có sẵn trên server — không cần sửa server).
     * Luôn resolve, không throw:  { ok:true, segments:[{startSec,key,mode}] } | { ok:false, error }
     */
    async fetchSegments(songId) {
        if (!this._enabled()) return { ok: false, error: 'disabled' };
        if (!songId) return { ok: false, error: 'no-song-id' };
        const r = await this._request('/song-full?id=' + encodeURIComponent(String(songId)), { method: 'GET' }, this.lookupTimeoutMs);
        if (!r.ok || !r.json || !Array.isArray(r.json.doans)) {
            return { ok: false, error: r.error || ('http-' + r.status) };
        }
        const segments = r.json.doans.map((d) => ({ startSec: Number(d.startSec), key: d.khoa, mode: d.mode }));
        return { ok: true, segments };
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

        const dur = Number(durationSec) > 0 ? Number(durationSec) : null;
        const songId = makeSongId(title, artist);
        const subKey = songId + (dur ? '|d' + Math.round(dur) : ''); // DB-MATCH-ID-02: cùng tên khác độ dài = hai bản thu riêng, không chặn nhau
        if (this._submitted.has(subKey)) return { ok: true, reason: 'already-submitted' };
        if (this._submitInflight.has(subKey)) return this._submitInflight.get(subKey);

        const failedAt = this._submitFailedAt.get(subKey);
        if (failedAt !== undefined && this.now() - failedAt < SUBMIT_RETRY_COOLDOWN_MS) {
            return { ok: false, reason: 'cooldown' };
        }

        const p = (async () => {
            const fail = (reason, text) => {
                this._submitFailedAt.set(subKey, this.now());
                this._log('fail|' + reason + '|' + songId, 'Gửi Key lỗi (' + reason + '): ' + text + ' -> thử lại sau ' + (SUBMIT_RETRY_COOLDOWN_MS / 1000) + ' giây');
                return { ok: false, reason };
            };

            // Server đã có bài (máy khác hoặc extension đã gửi) -> không gửi trùng.
            const existing = await this.lookup(title, artist, { force: true, durationSec: dur });
            if (existing.found) {
                this._submitted.add(subKey);
                this._log('already|' + songId, 'Không gửi Key: server ĐÃ có bài "' + label + '" (' + existing.key + ')');
                return { ok: true, reason: 'server-already-has' };
            }
            if (existing.error) return fail('lookup-failed', 'không xác minh được server (' + existing.error + '), không gửi để tránh trùng');

            // DB-MATCH-ID-02: ID mặc định (theo tên) đã có bản thu KHÁC độ dài trên Server -> dùng ID riêng cho bản này, tránh ghi đè bản kia.
            let sid = songId;
            if (dur) {
                const own = await this._songInfo(songId);
                if (own.ok && own.exists && durationMismatch(own.totalSec, dur)) sid = makeSongId(title, artist, dur);
            }
            const durRounded = dur ? Math.round(dur) : null;
            const info = await this._request('/set-song-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId: sid,
                    title: String(title),
                    totalDurationSec: durRounded,
                    note: artist ? ('artist: ' + String(artist) + ' | nguon: AUTO_MENU_AI') : 'nguon: AUTO_MENU_AI'
                })
            }, this.submitTimeoutMs);
            if (!info.ok || !info.json || info.json.ok !== true) return fail('info-failed', 'server từ chối lưu thông tin bài (' + (info.error || ('http-' + info.status)) + ')');

            const seg = await this._request('/add-segment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId: sid,
                    startSec: 0,
                    endSec: durRounded || WHOLE_SONG_END_SEC,
                    key: sk.key,
                    mode: sk.mode,
                    weight: 1.0
                })
            }, this.submitTimeoutMs);
            if (!seg.ok || !seg.json || seg.json.ok !== true) return fail('segment-failed', 'server từ chối lưu đoạn Key (' + (seg.error || ('http-' + seg.status)) + ')');

            this._submitted.add(subKey);
            this._submitFailedAt.delete(subKey);
            // Lần hỏi tiếp theo thấy ngay bài đã có.
            this._cacheSet(this._cacheKey(title, artist, dur), { found: true, key: serverKeyToAppKey(sk.key, sk.mode), songId: sid, title: String(title), source: 'server' }, HIT_TTL_MS);
            this._log('sent|' + sid, 'ĐÃ GỬI Key lên server: "' + label + '" -> ' + serverKeyToAppKey(sk.key, sk.mode) + ' (id ' + sid + (sid !== songId ? ', bản thu riêng theo độ dài' : '') + ')');
            return { ok: true, reason: 'submitted' };
        })().finally(() => { this._submitInflight.delete(subKey); });

        this._submitInflight.set(subKey, p);
        return p;
    }
}

module.exports = {
    KeyServerSync,
    normalizeTitle,
    isUnnamedTitle,
    makeSongId,
    serverKeyToAppKey,
    appKeyToServerKey,
    MIN_SUBMIT_CONFIDENCE,
    WHOLE_SONG_END_SEC,
    DEFAULT_SERVER_URL
};
