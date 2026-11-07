// APP-UPDATE-01 — Phiên bản / Kiểm tra cập nhật / Cập nhật ngay (Setup > System & Backup).
// App chạy từ mã nguồn (electron .) trong thư mục là 1 git repo => "cập nhật" = git fetch + git pull --ff-only
// từ origin/main. KHÔNG ghi đè file bằng tay, KHÔNG reset/force: nếu có xung đột git tự từ chối và báo lỗi
// (không mất dữ liệu). Mọi tham số truyền vào git là hằng số — không có chuỗi người dùng nào chạm tới lệnh.
const fs = require('fs');
const path = require('path');

const REMOTE = 'origin';
const BRANCH = 'main';

function createAppUpdater(opts) {
    const rootDir = opts.rootDir;
    const run = opts.exec;                       // (cmd, args, {cwd, timeoutMs}) => Promise<{code, stdout, stderr}>
    const existsSync = opts.existsSync || fs.existsSync;
    const readText = opts.readText || ((p) => fs.readFileSync(p, 'utf8'));
    let busy = false;

    const git = (args, timeoutMs) => run('git', args, { cwd: rootDir, timeoutMs: timeoutMs || 30000 });
    const out = (r) => String((r && r.stdout) || '').trim();
    const errText = (r) => String((r && (r.stderr || r.error)) || '').trim().split('\n').slice(-3).join(' ').slice(0, 300);

    function readVersion() {
        try { return JSON.parse(readText(path.join(rootDir, 'package.json'))).version || '?'; } catch (_) { return '?'; }
    }
    function isGitRepo() { try { return !!existsSync(path.join(rootDir, '.git')); } catch (_) { return false; } }

    async function getVersion() {
        const info = { ok: true, version: readVersion(), commit: null, isGit: isGitRepo() };
        if (info.isGit) {
            try { const r = await git(['rev-parse', '--short', 'HEAD'], 8000); if (r.code === 0) info.commit = out(r) || null; } catch (_) { /* git không có */ }
        }
        return info;
    }

    async function check() {
        if (!isGitRepo()) return { ok: false, reason: 'NOT_GIT', message: 'Thư mục app không phải git repo — không thể kiểm tra cập nhật.' };
        if (busy) return { ok: false, reason: 'BUSY', message: 'Đang có thao tác cập nhật khác, đợi xong rồi thử lại.' };
        busy = true;
        try {
            const f = await git(['fetch', REMOTE, BRANCH], 40000);
            if (f.code !== 0) return { ok: false, reason: 'FETCH_FAILED', message: 'Không kết nối được GitHub (kiểm tra mạng/git): ' + errText(f) };
            const behindR = await git(['rev-list', '--count', 'HEAD..' + REMOTE + '/' + BRANCH], 10000);
            const aheadR = await git(['rev-list', '--count', REMOTE + '/' + BRANCH + '..HEAD'], 10000);
            if (behindR.code !== 0) return { ok: false, reason: 'COMPARE_FAILED', message: 'Không so sánh được phiên bản: ' + errText(behindR) };
            const behind = parseInt(out(behindR), 10) || 0;
            const ahead = parseInt(out(aheadR), 10) || 0;
            let latest = null;
            const l = await git(['rev-parse', '--short', REMOTE + '/' + BRANCH], 8000);
            if (l.code === 0) latest = out(l);
            return { ok: true, behind, ahead, available: behind > 0, diverged: behind > 0 && ahead > 0, latest };
        } catch (e) {
            return { ok: false, reason: 'ERROR', message: String((e && e.message) || e) };
        } finally { busy = false; }
    }

    async function apply() {
        if (!isGitRepo()) return { ok: false, reason: 'NOT_GIT', message: 'Thư mục app không phải git repo — không thể cập nhật.' };
        if (busy) return { ok: false, reason: 'BUSY', message: 'Đang có thao tác cập nhật khác, đợi xong rồi thử lại.' };
        busy = true;
        try {
            const before = await git(['rev-parse', 'HEAD'], 8000);
            if (before.code !== 0) return { ok: false, reason: 'GIT_MISSING', message: 'Không chạy được git (chưa cài git?): ' + errText(before) };
            const oldHead = out(before);
            const p = await git(['pull', '--ff-only', REMOTE, BRANCH], 90000);
            if (p.code !== 0) return { ok: false, reason: 'PULL_FAILED', message: 'Git từ chối cập nhật (không có gì bị ghi đè): ' + errText(p) };
            const after = await git(['rev-parse', 'HEAD'], 8000);
            const newHead = out(after);
            if (!newHead || newHead === oldHead) return { ok: true, updated: false, message: 'Đã là bản mới nhất.' };
            // Chỉ yêu cầu 'npm install' khi danh sách thư viện (dependencies) thật sự đổi — đổi số version thì không cần.
            let needInstall = false;
            const d = await git(['diff', '--name-only', oldHead, newHead, '--', 'package.json'], 10000);
            if (d.code === 0 && out(d)) {
                const o = await git(['show', oldHead + ':package.json'], 10000);
                const n = await git(['show', newHead + ':package.json'], 10000);
                const deps = (t) => { try { const j = JSON.parse(t); return JSON.stringify([j.dependencies || {}, j.devDependencies || {}, j.optionalDependencies || {}]); } catch (_) { return 'ERR:' + t; } };
                needInstall = (o.code !== 0 || n.code !== 0) ? true : deps(out(o)) !== deps(out(n));
            }
            const sh = await git(['rev-parse', '--short', 'HEAD'], 8000);
            return { ok: true, updated: true, needInstall, commit: out(sh) };
        } catch (e) {
            return { ok: false, reason: 'ERROR', message: String((e && e.message) || e) };
        } finally { busy = false; }
    }

    // Khởi động lại app sau khi cập nhật (không liên quan cơ chế nâng quyền Administrator ở Elevation.js:
    // bản mới khởi động sẽ tự chạy ensureElevated như mọi lần mở app bình thường).
    function relaunch(appObj) {
        appObj.relaunch();
        appObj.quit();
        return { ok: true };
    }

    return { getVersion, check, apply, relaunch };
}

// exec thật (Electron main) — execFile, không qua shell.
function realExec(cmd, args, o) {
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
        execFile(cmd, args, { cwd: o.cwd, timeout: o.timeoutMs || 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && (err.code === 'ENOENT')) return resolve({ code: 127, stdout: '', stderr: '', error: 'git không có trong PATH' });
            resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err && err.killed ? 'quá thời gian' : '' });
        });
    });
}

module.exports = { createAppUpdater, realExec };
