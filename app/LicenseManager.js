// LICENSE-01 — Kích hoạt bản quyền: 1 key = 1 mã máy, có thời hạn (3 ngày / 3 tháng / 6 tháng / 1 năm tính từ lúc kích hoạt),
// kiểm tra với server License (MENU-LICENSE-SERVER). Chưa kích hoạt / hết hạn / bị thu hồi => main.js KHÔNG mở bất kỳ tính năng nào.
//
// An toàn: mọi phản hồi "được dùng" của server đều được ký Ed25519; app chỉ giữ KHOÁ CÔNG KHAI (app/license-public-key.txt),
// nên sửa file license đã lưu hay giả lập server đều không tạo được license hợp lệ. Thiếu khoá công khai => KHOÁ app (fail-closed).
// Mất mạng: dùng tiếp tối đa 72 giờ kể từ lần kiểm tra server thành công cuối. Lùi đồng hồ Windows bị phát hiện => bắt buộc kiểm tra lại online.
// Giới hạn đã biết: app chạy từ mã nguồn nên người có kỹ thuật vẫn có thể sửa code bỏ đoạn kiểm tra (xem báo cáo).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_SERVER_URL = 'https://menu-license-server.matuotluuly.workers.dev';
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // cùng bảng ký tự với server
const GRACE_MS = 72 * 3600 * 1000;      // mất mạng vẫn dùng tối đa 72 giờ kể từ lần kiểm tra thành công cuối
const RECHECK_MS = 6 * 3600 * 1000;     // kiểm tra lại với server mỗi 6 giờ
const TICK_MS = 5 * 60 * 1000;          // đánh giá cục bộ mỗi 5 phút khi app đang chạy
const CLOCK_SKEW_MS = 10 * 60 * 1000;   // dung sai đồng hồ trước khi coi là bị lùi giờ
const FETCH_TIMEOUT_MS = 8000;
const PLAN_LABEL = { '3d': '3 ngày', '3m': '3 tháng', '6m': '6 tháng', '1y': '1 năm' };
// Lý do server trả về nghĩa là license thật sự không còn dùng được (khác lỗi tạm thời như SERVER_ERROR/mất mạng).
const DEFINITIVE = new Set(['INVALID_KEY', 'REVOKED', 'EXPIRED', 'MACHINE_MISMATCH', 'NOT_ACTIVATED']);

function normalizeKey(raw) {
    const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = /^MENU([A-Z0-9]{20})$/.exec(s);
    if (!m) return null;
    for (const ch of m[1]) if (ALPHABET.indexOf(ch) < 0) return null;
    return 'MENU-' + m[1].match(/.{5}/g).join('-');
}

function machineCodeFromRaw(raw) {
    const d = crypto.createHash('sha256').update('MENU-LICENSE-v1|' + String(raw)).digest();
    let s = '';
    for (let i = 0; i < 20; i++) s += ALPHABET[d[i] % 30];
    return s.match(/.{5}/g).join('-');
}

function fmtDate(ts) {
    const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

// exec thật — execFile, không qua shell, tham số là hằng số.
function realExec(cmd, args) {
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout || '') }));
    });
}

function createLicenseManager(opts) {
    opts = opts || {};
    const userDataDir = opts.userDataDir;
    const appDir = opts.appDir || __dirname;
    const now = opts.now || Date.now;
    const fetchFn = opts.fetchFn || ((u, o) => fetch(u, o));
    const run = opts.exec || realExec;
    const platform = opts.platform || process.platform;
    const tickMs = opts.tickMs || TICK_MS;
    const cacheFile = path.join(userDataDir, 'license.json');

    let machine = null;      // "XXXXX-XXXXX-XXXXX-XXXXX"
    let pubKey = null;
    let pubKeyProblem = null; // { code, message }
    let cache = null;         // { v, key, payload, sig, lastOkLocal, maxLocal }
    let denied = null;        // { code, message } — lý do gần nhất server từ chối (để hiện ở màn hình kích hoạt)
    let timer = null;
    let refreshing = null;

    // ---------- mã máy ----------
    async function readRawMachineId() {
        if (typeof opts.machineIdProvider === 'function') return await opts.machineIdProvider();
        if (platform === 'win32') {
            try {
                const r = await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
                const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{16,})/.exec(r.stdout || '');
                if (m) return 'win:' + m[1].toLowerCase();
            } catch (_) { /* dùng dự phòng bên dưới */ }
        }
        // Dự phòng (không phải Windows hoặc không đọc được registry): tên máy + CPU + địa chỉ MAC.
        const macs = [];
        try {
            const nics = os.networkInterfaces();
            for (const k of Object.keys(nics)) for (const n of nics[k] || []) if (n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00') macs.push(n.mac);
        } catch (_) { /* bỏ qua */ }
        let cpu = '';
        try { cpu = (os.cpus()[0] || {}).model || ''; } catch (_) { /* bỏ qua */ }
        return 'fb:' + os.hostname() + '|' + cpu + '|' + Array.from(new Set(macs)).sort().join(',');
    }
    async function getMachineCode() {
        if (!machine) machine = machineCodeFromRaw(await readRawMachineId());
        return machine;
    }

    // ---------- khoá công khai ----------
    function loadPublicKey() {
        pubKey = null; pubKeyProblem = null;
        let text = opts.publicKeyText;
        if (typeof text !== 'string') {
            try { text = fs.readFileSync(path.join(appDir, 'license-public-key.txt'), 'utf8'); }
            catch (_) {
                pubKeyProblem = { code: 'NO_PUBLIC_KEY', message: 'Chưa cấu hình khoá License (thiếu app/license-public-key.txt). Xem MENU-LICENSE-SERVER/HUONG-DAN-LICENSE.md, bước 4.' };
                return;
            }
        }
        try {
            const k = crypto.createPublicKey({ key: Buffer.from(String(text).replace(/\s+/g, ''), 'base64'), format: 'der', type: 'spki' });
            if (k.asymmetricKeyType !== 'ed25519') throw new Error('không phải ed25519');
            pubKey = k;
        } catch (_) {
            pubKeyProblem = { code: 'INVALID_PUBLIC_KEY', message: 'File app/license-public-key.txt không hợp lệ. Tạo lại bằng MENU-LICENSE-SERVER/tao-khoa.html.' };
        }
    }

    // ---------- lưu trữ ----------
    function loadCache() {
        cache = null;
        try {
            const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            if (j && j.v === 1 && typeof j.key === 'string' && typeof j.payload === 'string' && typeof j.sig === 'string') {
                cache = { v: 1, key: j.key, payload: j.payload, sig: j.sig, lastOkLocal: Number(j.lastOkLocal) || 0, maxLocal: Number(j.maxLocal) || 0 };
            }
        } catch (_) { /* chưa có hoặc hỏng => coi như chưa kích hoạt */ }
    }
    function saveCache() {
        if (!cache) return;
        const tmp = cacheFile + '.tmp-' + process.pid + '-' + Math.floor(Math.random() * 1e9);
        try {
            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
            fs.renameSync(tmp, cacheFile);
        } catch (_) { try { fs.unlinkSync(tmp); } catch (e2) { /* bỏ qua */ } }
    }
    function clearCache() {
        cache = null;
        try { fs.unlinkSync(cacheFile); } catch (_) { /* không có thì thôi */ }
    }

    // ---------- xác minh chữ ký ----------
    function verifySigned(payloadStr, sigB64) {
        if (!pubKey) return null;
        try {
            if (!crypto.verify(null, Buffer.from(payloadStr, 'utf8'), pubKey, Buffer.from(sigB64, 'base64'))) return null;
            const p = JSON.parse(payloadStr);
            if (!p || p.v !== 1 || p.status !== 'active' || typeof p.expiresAt !== 'number' || typeof p.machine !== 'string') return null;
            return p;
        } catch (_) { return null; }
    }

    // ---------- đánh giá trạng thái (đồng bộ, không gọi mạng) ----------
    function evaluate(t) {
        const out = (licensed, code, message, extra) => Object.assign({ licensed, code, message }, extra || {});
        if (pubKeyProblem) return out(false, pubKeyProblem.code, pubKeyProblem.message);
        if (!cache) return denied ? out(false, denied.code, denied.message) : out(false, 'UNLICENSED', 'Chưa kích hoạt. Cần nhập key để sử dụng MENU.');
        const p = verifySigned(cache.payload, cache.sig);
        if (!p) return out(false, 'TAMPERED', 'Dữ liệu license không hợp lệ. Hãy nhập lại key.');
        if (!machine || p.machine !== machine.replace(/-/g, '')) return out(false, 'MACHINE_MISMATCH', 'License này thuộc máy khác. 1 key chỉ dùng cho 1 máy.');
        const info = { plan: p.plan, planLabel: PLAN_LABEL[p.plan] || String(p.plan), activatedAt: p.activatedAt || null, expiresAt: p.expiresAt, keyHint: cache.key.slice(-4), lastCheckAt: cache.lastOkLocal || null };
        if (t >= p.expiresAt) return out(false, 'EXPIRED', 'License đã hết hạn ngày ' + fmtDate(p.expiresAt) + '. Hãy nhập key mới.', info);
        if (t < (cache.maxLocal || 0) - CLOCK_SKEW_MS) return out(false, 'NEED_ONLINE', 'Đồng hồ máy bị lùi so với lần dùng trước. Cần kết nối mạng để xác minh lại license.', info);
        if (t - (cache.lastOkLocal || 0) > GRACE_MS) return out(false, 'NEED_ONLINE', 'Đã quá 72 giờ chưa xác minh được license với server. Hãy kết nối mạng rồi bấm kiểm tra lại.', info);
        const graceLeftMs = Math.max(0, GRACE_MS - (t - cache.lastOkLocal));
        return out(true, 'LICENSED', 'Đã kích hoạt — gói ' + info.planLabel + ', còn ' + Math.max(1, Math.ceil((p.expiresAt - t) / 86400000)) + ' ngày (hết hạn ' + fmtDate(p.expiresAt) + ').',
            Object.assign(info, { daysLeft: Math.max(1, Math.ceil((p.expiresAt - t) / 86400000)), graceLeftHours: Math.floor(graceLeftMs / 3600000) }));
    }
    function getStatus() {
        const st = evaluate(now());
        return Object.assign({ ok: true, machineCode: machine }, st);
    }
    function isLicensed() { return evaluate(now()).licensed; }

    // ---------- gọi server ----------
    function serverUrl() {
        let u = '';
        try { u = (typeof opts.getServerUrl === 'function' && opts.getServerUrl()) || ''; } catch (_) { /* dùng mặc định */ }
        return String(u || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    }
    async function post(p, body) {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const to = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
        try {
            const res = await fetchFn(serverUrl() + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
            let j;
            try { j = await res.json(); } catch (_) { throw new Error('BAD_RESPONSE'); }
            if (!j || typeof j !== 'object') throw new Error('BAD_RESPONSE');
            return j;
        } finally { if (to) clearTimeout(to); }
    }

    async function activate(keyRaw) {
        await getMachineCode();
        if (pubKeyProblem) return { ok: false, reason: pubKeyProblem.code, message: pubKeyProblem.message };
        const key = normalizeKey(keyRaw);
        if (!key) return { ok: false, reason: 'INVALID_KEY', message: 'Key không đúng định dạng (MENU-XXXXX-XXXXX-XXXXX-XXXXX).' };
        let res;
        try { res = await post('/license/activate', { key, machine }); }
        catch (_) { return { ok: false, reason: 'NETWORK', message: 'Không kết nối được server License. Kiểm tra mạng rồi thử lại.' }; }
        if (!res.ok) return { ok: false, reason: String(res.reason || 'ERROR'), message: String(res.message || 'Server từ chối kích hoạt.') };
        const p = verifySigned(res.payload, res.sig);
        if (!p || p.machine !== machine.replace(/-/g, '')) return { ok: false, reason: 'BAD_SIGNATURE', message: 'Phản hồi server không hợp lệ (khoá công khai trong app không khớp khoá của server).' };
        const t = now();
        cache = { v: 1, key, payload: res.payload, sig: res.sig, lastOkLocal: t, maxLocal: t };
        denied = null;
        saveCache();
        return { ok: true, status: getStatus() };
    }

    // Kiểm tra lại với server. Mất mạng/lỗi tạm thời => giữ nguyên (còn trong hạn 72 giờ). Server nói rõ không còn hiệu lực => xoá license.
    function refresh() {
        if (refreshing) return refreshing;
        refreshing = (async () => {
            await getMachineCode();
            if (!cache || !cache.key || pubKeyProblem) return { ok: false, reason: 'NO_LICENSE' };
            let res;
            try { res = await post('/license/check', { key: cache.key, machine }); }
            catch (_) { return { ok: false, reason: 'NETWORK', message: 'Không kết nối được server License.' }; }
            if (res.ok) {
                const p = verifySigned(res.payload, res.sig);
                if (!p || p.machine !== machine.replace(/-/g, '')) return { ok: false, reason: 'BAD_SIGNATURE', message: 'Phản hồi server không hợp lệ.' };
                const t = now();
                cache.payload = res.payload; cache.sig = res.sig; cache.lastOkLocal = t; cache.maxLocal = t; // server xác nhận => lấy mốc thời gian mới (đồng hồ đã chỉnh lại cũng hợp lệ)
                denied = null;
                saveCache();
                return { ok: true };
            }
            const reason = String(res.reason || 'ERROR');
            if (DEFINITIVE.has(reason)) {
                denied = { code: reason, message: String(res.message || 'License không còn hiệu lực.') };
                clearCache();
                return { ok: false, reason, message: denied.message };
            }
            return { ok: false, reason, message: String(res.message || 'Server lỗi tạm thời.') };
        })().finally(() => { refreshing = null; });
        return refreshing;
    }

    function bumpMaxLocal(t) {
        if (cache && t > (cache.maxLocal || 0)) { cache.maxLocal = t; saveCache(); }
    }

    async function init() {
        await getMachineCode();
        loadPublicKey();
        loadCache();
        const st = evaluate(now());
        if (cache && !pubKeyProblem && (st.code === 'NEED_ONLINE' || (st.licensed && now() - cache.lastOkLocal > RECHECK_MS))) await refresh();
        bumpMaxLocal(now());
        return getStatus();
    }

    // Khi app đang chạy: định kỳ đánh giá cục bộ, kiểm tra lại server mỗi 6 giờ; mất hiệu lực => gọi onLost(status).
    function startWatcher(w) {
        stopWatcher();
        let busy = false;
        timer = setInterval(async () => {
            if (busy) return;
            busy = true;
            try {
                const t = now();
                let st = evaluate(t);
                if (cache && (st.code === 'NEED_ONLINE' || (st.licensed && t - cache.lastOkLocal > RECHECK_MS))) await refresh();
                bumpMaxLocal(now());
                st = evaluate(now());
                if (!st.licensed && w && typeof w.onLost === 'function') { stopWatcher(); w.onLost(Object.assign({ machineCode: machine }, st)); }
            } catch (_) { /* không để watcher làm sập app */ } finally { busy = false; }
        }, tickMs);
        if (timer && timer.unref) timer.unref();
    }
    function stopWatcher() { if (timer) { clearInterval(timer); timer = null; } }

    // Khởi động lại app (cùng cách AppUpdater.relaunch — main.js KHÔNG được tự gọi app.relaunch, xem MenuElevationA104.verify.js).
    // Không liên quan cơ chế nâng quyền Administrator ở Elevation.js: bản mới khởi động sẽ tự chạy ensureElevated như mọi lần mở app.
    function relaunch(appObj) {
        appObj.relaunch();
        appObj.quit();
        return { ok: true };
    }

    return { init, getMachineCode, getStatus, isLicensed, activate, refresh, startWatcher, stopWatcher, relaunch };
}

module.exports = { createLicenseManager, normalizeKey, machineCodeFromRaw, DEFAULT_SERVER_URL, GRACE_MS, RECHECK_MS };
