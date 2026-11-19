/**
 * ProjectLock.js — PROJECT-LOCK-01
 * ---------------------------------------------------------------------------
 * KHÓA CỨNG file Project (Pj) của DAW (Studio One .song / Cubase .cpr ...) để không ai sửa/lưu đè
 * được — dù Menu hay DAW đang bật hay tắt. Khóa nằm TRÊN FILE ở ổ đĩa (không phụ thuộc Menu chạy).
 *
 * 2 lớp (Windows):
 *   1) Thuộc tính Chỉ đọc (Read-only).
 *   2) Quyền NTFS "DENY" cho mọi người (Everyone, SID *S-1-1-0): cấm ghi dữ liệu / nối thêm / ghi thuộc
 *      tính / xóa. Cấm cả "ghi thuộc tính" nên không thể chỉ bỏ tick Read-only trong Properties.
 *      Muốn mở khóa phải gỡ quyền (icacls) — người dùng thường không làm được.
 * Mở khóa = gỡ DENY rồi bỏ Chỉ đọc (chỉ bỏ nếu file KHÔNG phải vốn đã Chỉ đọc trước khi khóa).
 *
 * GIỚI HẠN THẬT (không nói quá):
 *   - Người có quyền Administrator vẫn gỡ được khóa thủ công.
 *   - Ai có toàn quyền trên THƯ MỤC chứa file vẫn có thể xóa/đổi tên file (đặc thù NTFS: quyền
 *     "delete-child" của thư mục độc lập với DENY của file).
 *   - Ổ không phải NTFS (FAT32/exFAT) chỉ khóa được mức Chỉ đọc.
 *   - Không chặn người ta VẶN thông số trong DAW đang mở — chỉ chặn LƯU vào file.
 *
 * Module thuần Node (không phụ thuộc Electron), có DI (fs / execFile / platform) để test.
 * Ghi nhớ "file nào đã bị MENU khóa" trong 1 file JSON riêng (recordFile) để biết mở khóa đúng file
 * khi người dùng đổi Pj hoặc tắt công tắc — KHÔNG đụng app-settings.json.
 */
'use strict';

const nodeFs = require('fs');
const nodePath = require('path');
const childProcess = require('child_process');

const EVERYONE_SID = '*S-1-1-0';
const DENY_RIGHTS = '(WD,AD,WEA,WA,D)'; // ghi dữ liệu, nối thêm, ghi thuộc tính mở rộng, ghi thuộc tính, xóa
const ICACLS_TIMEOUT_MS = 15000;

function runExecFile(execFile, cmd, args) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { windowsHide: true, timeout: ICACLS_TIMEOUT_MS }, (err, stdout, stderr) => {
                resolve({ ok: !err, err: err ? String(err.message || err) : null, stdout: String(stdout || ''), stderr: String(stderr || '') });
            });
        } catch (e) {
            resolve({ ok: false, err: String(e && e.message || e), stdout: '', stderr: '' });
        }
    });
}

function createProjectLock(opts) {
    const o = opts || {};
    const fs = o.fs || nodeFs;
    const platform = o.platform || process.platform;
    const execFile = o.execFile || childProcess.execFile;
    const recordFile = o.recordFile || null;
    const log = typeof o.log === 'function' ? o.log : () => {};
    const isWin = platform === 'win32';

    const norm = (p) => {
        const r = nodePath.resolve(String(p || ''));
        return isWin ? r.toLowerCase() : r;
    };

    // ---------- ghi nhớ file đã khóa ----------
    function readRecord() {
        if (!recordFile) return null;
        try {
            const j = JSON.parse(fs.readFileSync(recordFile, 'utf-8'));
            if (j && typeof j.lockedPath === 'string' && j.lockedPath) return { lockedPath: j.lockedPath, wasReadOnly: j.wasReadOnly === true };
        } catch (e) { /* chưa có / hỏng => coi như chưa khóa file nào */ }
        return null;
    }
    function writeRecord(rec) {
        if (!recordFile) return true;
        try { fs.writeFileSync(recordFile, JSON.stringify(rec), 'utf-8'); return true; }
        catch (e) { log('ghi record khóa Pj lỗi: ' + e.message); return false; }
    }
    function clearRecord() {
        if (!recordFile) return;
        try { if (fs.existsSync(recordFile)) fs.unlinkSync(recordFile); } catch (e) { /* best-effort */ }
    }

    // ---------- kiểm tra thật ----------
    function fileState(p) {
        let st;
        try { st = fs.statSync(p); } catch (e) { return { exists: false }; }
        if (!st.isFile()) return { exists: true, isFile: false };
        return { exists: true, isFile: true, readOnlyAttr: (st.mode & 0o200) === 0 };
    }
    // Bằng chứng thật: thử mở file để GHI. Mở được = chưa khóa.
    function canWrite(p) {
        let fd = null;
        try { fd = fs.openSync(p, 'r+'); return true; }
        catch (e) { return false; }
        finally { if (fd !== null) { try { fs.closeSync(fd); } catch (e2) { /* bỏ qua */ } } }
    }
    async function hasDenyAcl(p) {
        if (!isWin) return false;
        const r = await runExecFile(execFile, 'icacls', [p]);
        return r.ok && /\(DENY\)/i.test(r.stdout);
    }

    // ---------- khóa / mở khóa 1 file ----------
    async function lockFile(p, wasReadOnly) {
        const warnings = [];
        try { fs.chmodSync(p, 0o444); } // 1) Chỉ đọc TRƯỚC (vì sau khi DENY "ghi thuộc tính" thì không chmod được nữa)
        catch (e) { warnings.push('Không đặt được Chỉ đọc: ' + e.message); }

        let denyOk = false;
        if (isWin) {
            const r = await runExecFile(execFile, 'icacls', [p, '/deny', EVERYONE_SID + ':' + DENY_RIGHTS]);
            denyOk = r.ok;
            if (!r.ok) warnings.push('Không đặt được quyền DENY (NTFS): ' + (r.err || r.stderr));
        } else {
            warnings.push('Không phải Windows: chỉ khóa mức Chỉ đọc.');
        }

        // Kết luận bằng BẰNG CHỨNG: thử ghi lại file.
        const writable = canWrite(p);
        if (writable) {
            return { ok: false, level: 'none', reason: 'still_writable', warnings };
        }
        return { ok: true, level: denyOk ? 'hard' : 'readonly', warnings, wasReadOnly: !!wasReadOnly };
    }

    async function unlockFile(p, wasReadOnly) {
        const st = fileState(p);
        if (!st.exists) return { ok: true, level: 'none', note: 'file_missing' }; // file đã mất/đổi tên: không còn gì để mở
        const warnings = [];
        if (isWin) {
            const r = await runExecFile(execFile, 'icacls', [p, '/remove:d', EVERYONE_SID]);
            if (!r.ok) warnings.push('Gỡ quyền DENY lỗi: ' + (r.err || r.stderr));
        }
        if (!wasReadOnly) {
            try { fs.chmodSync(p, 0o666); } catch (e) { warnings.push('Bỏ Chỉ đọc lỗi: ' + e.message); }
        }
        const writable = wasReadOnly ? true : canWrite(p); // vốn Chỉ đọc từ trước thì không đòi ghi được
        if (!writable) return { ok: false, level: 'locked', reason: 'still_locked', warnings };
        return { ok: true, level: 'none', warnings };
    }

    // ---------- hàng đợi: không chạy 2 lệnh khóa/mở chồng nhau ----------
    let chain = Promise.resolve();
    function enqueue(fn) {
        const run = chain.then(fn, fn);
        chain = run.then(() => {}, () => {});
        return run;
    }

    /**
     * apply({ enabled, projectPath }) — đưa trạng thái file thật về đúng mong muốn.
     * Trả { ok, enabled, level, path, reason?, warnings[], unlockedOld? }. Không bao giờ throw.
     */
    function apply(req) {
        return enqueue(async () => {
            const enabled = !!(req && req.enabled);
            const projectPath = req && typeof req.projectPath === 'string' ? req.projectPath.trim() : '';
            const out = { ok: true, enabled, level: 'none', path: projectPath || null, warnings: [] };
            try {
                // 1) Mở khóa file cũ nếu: tắt công tắc, hoặc đã đổi sang Pj khác.
                const rec = readRecord();
                let keep = rec;
                if (rec && (!enabled || !projectPath || norm(rec.lockedPath) !== norm(projectPath))) {
                    const u = await unlockFile(rec.lockedPath, rec.wasReadOnly);
                    if (u.ok) { clearRecord(); keep = null; out.unlockedOld = rec.lockedPath; }
                    else {
                        out.warnings.push('Chưa mở khóa được file cũ: ' + rec.lockedPath);
                        if (!enabled) { out.ok = false; out.reason = 'unlock_failed'; out.level = 'locked'; return out; }
                    }
                }
                if (!enabled) { out.level = 'none'; return out; }

                // 2) Khóa file hiện tại.
                if (!projectPath) { out.ok = false; out.reason = 'no_project'; return out; }
                const st = fileState(projectPath);
                if (!st.exists) { out.ok = false; out.reason = 'missing'; return out; }
                if (!st.isFile) { out.ok = false; out.reason = 'not_a_file'; return out; }

                // Đã khóa sẵn (cùng file, còn khóa thật) -> không làm lại.
                if (keep && norm(keep.lockedPath) === norm(projectPath) && !canWrite(projectPath)) {
                    out.level = (await hasDenyAcl(projectPath)) ? 'hard' : 'readonly';
                    return out;
                }

                const wasReadOnly = keep && norm(keep.lockedPath) === norm(projectPath) ? keep.wasReadOnly : st.readOnlyAttr;
                writeRecord({ lockedPath: projectPath, wasReadOnly: !!wasReadOnly }); // ghi TRƯỚC khi khóa: lỡ tắt đột ngột vẫn biết file nào
                const l = await lockFile(projectPath, wasReadOnly);
                out.warnings.push(...l.warnings);
                out.level = l.level;
                if (!l.ok) { out.ok = false; out.reason = l.reason; }
                return out;
            } catch (e) {
                log('ProjectLock.apply lỗi: ' + e.message);
                return { ok: false, enabled, level: 'none', path: projectPath || null, reason: 'exception', warnings: [String(e && e.message || e)] };
            }
        });
    }

    /** status(projectPath) — trạng thái THẬT của file (thử ghi + đọc quyền). Không đổi gì. */
    function status(projectPath) {
        return enqueue(async () => {
            const p = typeof projectPath === 'string' ? projectPath.trim() : '';
            const rec = readRecord();
            if (!p) return { exists: false, locked: false, level: 'none', path: null, lockedByMenu: !!rec };
            const st = fileState(p);
            if (!st.exists) return { exists: false, locked: false, level: 'none', path: p, lockedByMenu: !!rec };
            if (!st.isFile) return { exists: true, isFile: false, locked: false, level: 'none', path: p, lockedByMenu: !!rec };
            const writable = canWrite(p);
            const deny = writable ? false : await hasDenyAcl(p);
            return {
                exists: true, isFile: true, path: p,
                locked: !writable,
                level: writable ? 'none' : (deny ? 'hard' : 'readonly'),
                lockedByMenu: !!(rec && norm(rec.lockedPath) === norm(p))
            };
        });
    }

    return { apply, status, _readRecord: readRecord };
}

module.exports = { createProjectLock, EVERYONE_SID, DENY_RIGHTS };
