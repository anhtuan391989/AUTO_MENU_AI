'use strict';
/**
 * A104 — MENU-AUTO-ELEVATE-01.
 * Lý do (bằng chứng log Windows 06/11): FSP8 chạy Administrator (IL=0x3000, ELEV=1), Menu chạy thường (IL=0x2000, ELEV=0) => ShowWindowAsync trả 0, cửa sổ không ẩn.
 * Menu chạy Administrator (cùng IL=0x3000) => ShowWindowAsync trả 1, ẩn xong trong 0,1 s.
 *
 * Hành vi: khi Menu mở bằng quyền thường trên Windows -> xin quyền Administrator (hộp UAC) và mở lại chính nó với cờ --automenu-elevated, rồi bản thường thoát.
 *  - Đã là Administrator           -> không làm gì.
 *  - Người dùng bấm "No" ở UAC     -> Menu vẫn chạy như cũ (quyền thường), không vòng lặp, không mất dữ liệu.
 *  - Cờ --automenu-elevated        -> không bao giờ xin lần 2 (chống vòng lặp).
 *  - Tắt tạm: biến môi trường AUTOMENU_NO_ELEVATE=1 hoặc tham số --no-elevate.
 * Không đụng cấu hình, đường dẫn DAW, hay bất kỳ module nào khác.
 */
const { spawnSync: realSpawnSync } = require('child_process');

const FLAG_ELEVATED = '--automenu-elevated';
const FLAG_OFF = '--no-elevate';

const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Administrator? `fltmc` chỉ thành công (exit 0) khi chạy với quyền Administrator; lỗi/không có lệnh => coi là CHƯA elevated. */
function isElevated(spawnSync) {
    try {
        const r = (spawnSync || realSpawnSync)('fltmc', [], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
        return !!r && !r.error && r.status === 0;
    } catch (e) { return false; }
}

function buildRelaunchScript(execPath, args, cwd) {
    const argList = args.concat([FLAG_ELEVATED]).map(psq).join(', ');
    return 'try { Start-Process -FilePath ' + psq(execPath) + ' -ArgumentList @(' + argList + ') -WorkingDirectory ' + psq(cwd) + ' -Verb RunAs -ErrorAction Stop; exit 0 } '
        + 'catch { [Console]::Error.WriteLine($_.Exception.Message); exit 3 }';
}

/**
 * @returns {{action: 'skip'|'already'|'relaunched'|'denied'|'error', reason: string, detail?: string}}
 *   'relaunched' => bản mới (Administrator) đã được mở; caller PHẢI thoát tiến trình hiện tại ngay.
 */
function ensureElevated(opts) {
    const o = opts || {};
    const platform = o.platform || process.platform;
    const argv = Array.isArray(o.argv) ? o.argv : process.argv;
    const env = o.env || process.env;
    const spawnSync = o.spawnSync || realSpawnSync;
    const log = typeof o.log === 'function' ? o.log : () => {};
    try {
        if (platform !== 'win32') return { action: 'skip', reason: 'NOT_WINDOWS' };
        if (env.AUTOMENU_NO_ELEVATE === '1' || argv.includes(FLAG_OFF)) return { action: 'skip', reason: 'DISABLED_BY_USER' };
        if (argv.includes(FLAG_ELEVATED)) return { action: 'skip', reason: 'ALREADY_RELAUNCHED' };
        if (isElevated(spawnSync)) return { action: 'already', reason: 'ELEVATED' };
        const execPath = o.execPath || process.execPath;
        const cwd = o.cwd || process.cwd();
        const args = argv.slice(1).filter((a) => a !== FLAG_ELEVATED);
        log('[Elevation] Menu chạy quyền thường — xin quyền Administrator (UAC) để ẩn/hiện được DAW chạy Administrator');
        const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildRelaunchScript(execPath, args, cwd)], { windowsHide: true, timeout: 180000, encoding: 'utf8' });
        if (r && !r.error && r.status === 0) return { action: 'relaunched', reason: 'UAC_ACCEPTED' };
        const detail = String((r && ((r.stderr || '') || (r.error && r.error.message))) || '').trim().slice(0, 200);
        log('[Elevation] Không nâng quyền được (UAC bị từ chối hoặc lỗi) — Menu vẫn chạy quyền thường: ' + detail);
        return { action: 'denied', reason: 'UAC_DENIED_OR_FAILED', detail };
    } catch (e) {
        return { action: 'error', reason: 'EXCEPTION', detail: String((e && e.message) || e) };
    }
}

module.exports = { ensureElevated, isElevated, buildRelaunchScript, FLAG_ELEVATED, FLAG_OFF };
