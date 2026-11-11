// APP-UPDATE-02 — Cập nhật cho BẢN CÀI .exe (app.isPackaged). Dùng electron-updater + GitHub Releases của repo.
// Cùng "hợp đồng" với app/AppUpdater.js (getVersion / check / apply / relaunch) nên nút Cập nhật trong Setup giữ nguyên:
//   check()  -> { ok, available, behind, ahead, diverged, latest }       (behind = 1 khi có bản mới)
//   apply()  -> { ok, updated, needInstall:false, commit:<số version> }  (tải bản mới về, CHƯA cài)
//   relaunch -> quitAndInstall: đóng app, cài bản mới, tự mở lại.
// Máy dev chạy từ mã nguồn (npm start) vẫn dùng AppUpdater.js (git pull) — file này không được nạp ở đó.
// KHÔNG tự tải/cài ngầm: chỉ làm khi người dùng bấm nút (autoDownload=false, autoInstallOnAppQuit=false).
'use strict';

function parseVer(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v || '').trim());
    if (!m) return null;
    return { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
}
// > 0 nếu a mới hơn b; null nếu không đọc được version.
function compareVersions(a, b) {
    const x = parseVer(a), y = parseVer(b);
    if (!x || !y) return null;
    for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] > y.n[i] ? 1 : -1;
    if (x.pre === y.pre) return 0;
    if (!x.pre) return 1;   // bản chính thức > bản tiền phát hành
    if (!y.pre) return -1;
    return x.pre > y.pre ? 1 : -1;
}

function createInstalledUpdater(opts) {
    const updater = opts.autoUpdater;  // autoUpdater của electron-updater (truyền vào để test được)
    const appObj = opts.app;           // app của Electron
    let busy = false;
    let latest = null;                 // version mới nhất tìm thấy ở lần check gần nhất
    let downloaded = false;

    try {
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
        updater.allowPrerelease = false;
        updater.allowDowngrade = false;
    } catch (_) { /* bỏ qua */ }

    const errText = (e) => String((e && e.message) || e || '').split('\n')[0].slice(0, 300);

    async function getVersion() {
        return { ok: true, version: appObj.getVersion(), commit: null, isGit: false, installed: true };
    }

    async function check() {
        if (busy) return { ok: false, reason: 'BUSY', message: 'Đang có thao tác cập nhật khác, đợi xong rồi thử lại.' };
        busy = true;
        try {
            const r = await updater.checkForUpdates();
            const info = r && r.updateInfo;
            if (!info || !info.version) return { ok: true, available: false, behind: 0, ahead: 0, diverged: false, latest: null };
            const cmp = compareVersions(info.version, appObj.getVersion());
            const available = typeof r.isUpdateAvailable === 'boolean' ? r.isUpdateAvailable : (cmp !== null ? cmp > 0 : info.version !== appObj.getVersion());
            latest = available ? info.version : null;
            return { ok: true, available, behind: available ? 1 : 0, ahead: 0, diverged: false, latest: info.version };
        } catch (e) {
            return { ok: false, reason: 'CHECK_FAILED', message: 'Không kiểm tra được bản mới (kiểm tra mạng, hoặc chưa có bản phát hành trên GitHub): ' + errText(e) };
        } finally { busy = false; }
    }

    async function apply() {
        if (busy) return { ok: false, reason: 'BUSY', message: 'Đang có thao tác cập nhật khác, đợi xong rồi thử lại.' };
        if (!latest) {
            const c = await check();
            if (!c.ok) return c;
            if (!c.available) return { ok: true, updated: false, message: 'Đã là bản mới nhất.' };
        }
        busy = true;
        try {
            await updater.downloadUpdate();
            downloaded = true;
            return { ok: true, updated: true, needInstall: false, commit: latest };
        } catch (e) {
            return { ok: false, reason: 'DOWNLOAD_FAILED', message: 'Tải bản mới thất bại (không có gì bị thay đổi): ' + errText(e) };
        } finally { busy = false; }
    }

    // Đóng app -> chạy bộ cài bản mới -> tự mở lại. Chưa tải xong thì chỉ khởi động lại bình thường.
    function relaunch() {
        if (downloaded) {
            updater.quitAndInstall(true, true);
            return { ok: true, installing: true };
        }
        appObj.relaunch();
        appObj.quit();
        return { ok: true };
    }

    return { getVersion, check, apply, relaunch };
}

module.exports = { createInstalledUpdater, compareVersions };
