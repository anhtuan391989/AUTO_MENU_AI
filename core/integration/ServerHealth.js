/**
 * core/integration/ServerHealth.js — DB-STATUS-01
 * Kiểm tra Key Server (Cloudflare Worker + D1) có trả lời không, để ô "Database" trong Setup > Dashboard báo THẬT thay cho "Coming Soon".
 * Module thuần Node, KHÔNG phụ thuộc Electron; fetch được tiêm vào để test. KHÔNG BAO GIỜ throw.
 * Quy ước: server trả lời bất kỳ mã HTTP < 500 = ONLINE (máy chủ sống); mã ≥ 500, lỗi mạng, hết giờ = OFFLINE.
 */
'use strict';

// DB-STATUS-ERR-01 — Node/Electron fetch chỉ báo "fetch failed"; lý do thật (ENOTFOUND = DNS, ECONNRESET/ETIMEDOUT = mạng/tường lửa,
// CERT_HAS_EXPIRED/UNABLE_TO_VERIFY_LEAF_SIGNATURE = sai giờ máy/chứng chỉ...) nằm trong err.cause. Ghép vào để ô Database hiện đúng nguyên nhân.
function describeFetchError(err) {
    if (err && err.name === 'AbortError') return 'TIMEOUT';
    const msg = String((err && err.message) || err);
    const c = err && err.cause;
    const code = c && (c.code || c.errno || c.name);
    return code ? msg + ' (' + code + ')' : msg;
}

async function pingServer({ url, fetchImpl, timeoutMs = 3000, now = Date.now } = {}) {
    const started = now();
    if (!url || typeof fetchImpl !== 'function') return { ok: false, status: null, ms: 0, error: 'NOT_CONFIGURED' };
    let timer = null;
    try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        if (ctl) timer = setTimeout(() => { try { ctl.abort(); } catch (e) { /* bỏ qua */ } }, timeoutMs);
        const res = await fetchImpl(String(url).replace(/\/+$/, '') + '/health', { method: 'GET', signal: ctl ? ctl.signal : undefined });
        const status = Number(res && res.status);
        return { ok: Number.isFinite(status) && status < 500, status: Number.isFinite(status) ? status : null, ms: now() - started, error: null };
    } catch (err) {
        return { ok: false, status: null, ms: now() - started, error: describeFetchError(err) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

module.exports = { pingServer, describeFetchError };
