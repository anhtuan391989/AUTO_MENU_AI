/**
 * core/integration/WindowHider.js — HIDE-DAW-01
 * ---------------------------------------------------------------------------
 * ẨN / HIỆN cửa sổ chính của một chương trình ĐANG CHẠY (vd DAW Studio Pro) theo đường dẫn .exe đã cấu hình, bằng Win32 (user32) qua PowerShell.
 * "Ẩn" = SW_HIDE (cửa sổ biến mất khỏi Taskbar/Alt-Tab; tiến trình vẫn chạy bình thường, vẫn nhận MIDI và xử lý audio) — KHÁC với minimize.
 * Module Node THUẦN (không require electron). Trình chạy PowerShell được tiêm vào để test; KHÔNG BAO GIỜ throw — mọi lỗi trả về trong kết quả.
 * Chỉ Windows. Trên hệ khác trả { ok:false, reason:"UNSUPPORTED_PLATFORM" }.
 * Quy tắc chọn cửa sổ khi ẨN: cửa sổ top-level của đúng tiến trình, đang hiện, KHÔNG có owner, có tiêu đề, không phải tool-window.
 * (Cửa sổ plugin thường là cửa sổ có owner nên tự ẩn theo cửa sổ chính; việc ẩn riêng plugin là tính năng khác, KHÔNG nằm ở đây.)
 */
'use strict';

const { spawn, spawnSync } = require('child_process');

function defaultRunner(script, cb) {
    if (process.platform !== 'win32') { cb(new Error('UNSUPPORTED_PLATFORM'), null); return; }
    let done = false, out = '', errOut = '', ps;
    try { ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }); }
    catch (e) { cb(e, null); return; }
    const timer = setTimeout(() => { if (done) return; done = true; try { ps.kill(); } catch (e) { /* bỏ qua */ } cb(new Error('TIMEOUT'), null); }, 15000);
    ps.stdout.on('data', (d) => { out += d.toString(); });
    ps.stderr.on('data', (d) => { errOut += d.toString(); });
    ps.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); cb(e, null); });
    ps.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); if (code !== 0 && !out.trim()) cb(new Error(errOut.trim() || ('powershell exit ' + code)), null); else cb(null, out.trim()); });
}

// Đường dẫn .exe phải là chuỗi Windows hợp lệ, không ký tự điều khiển / ký tự cấm — vì sẽ nằm trong chuỗi PowerShell (đã nhân đôi dấu ' nhưng vẫn chặn từ đầu).
function validateExePath(p) {
    if (typeof p !== 'string' || !p.trim()) return false;
    if (/[\u0000-\u001f"<>|*?]/.test(p)) return false;
    return /\.exe$/i.test(p.trim());
}
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const CSHARP = [
    'using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;',
    'public static class HW {',
    '  delegate bool EnumProc(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);',
    '  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);',
    '  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);',
    '  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);',
    '  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);',
    '  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int n);',
    '  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
    '  public static string Hide(uint[] pids) {',
    '    var found = new List<IntPtr>(); var set = new HashSet<uint>(pids);',
    '    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);',
    '      if (set.Contains(pid) && IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero && GetWindowTextLength(h) > 0 && (GetWindowLong(h, -20) & 0x80) == 0) found.Add(h); return true; }, IntPtr.Zero);',
    '    var sb = new StringBuilder(); foreach (var h in found) { ShowWindowAsync(h, 0); if (sb.Length > 0) sb.Append(","); sb.Append(h.ToInt64()); } return sb.ToString(); }',
    '  public static string Show(long[] handles, uint[] pids) {',
    '    var set = new HashSet<uint>(pids); var ok = new StringBuilder(); IntPtr first = IntPtr.Zero;',
    '    foreach (var v in handles) { var h = new IntPtr(v); if (!IsWindow(h)) continue; uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) continue;',
    '      ShowWindowAsync(h, 5); if (first == IntPtr.Zero) first = h; if (ok.Length > 0) ok.Append(","); ok.Append(v); }',
    '    if (first != IntPtr.Zero) SetForegroundWindow(first); return ok.ToString(); }',
    '}'
].join('\n');

function pidScript(exePath) {
    return '$pids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq ' + psq(exePath.trim()) + ') } | ForEach-Object { [uint32]$_.Id }); ';
}
function loadType() { return 'Add-Type -TypeDefinition @\'\n' + CSHARP + '\n\'@; '; }

function parseHandles(out) {
    return String(out || '').split(/[\s,]+/).filter((x) => /^\d+$/.test(x)).map((x) => Number(x)).filter((n) => Number.isSafeInteger(n) && n > 0);
}

/** Ẩn cửa sổ chính của chương trình exePath. callback(result): { ok, state, handles, reason } — state: "hidden" | "not_found" | "failed". */
function hide(exePath, cb, runner) {
    if (!validateExePath(exePath)) { cb({ ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' }); return; }
    const run = runner || defaultRunner;
    const script = pidScript(exePath) + 'if ($pids.Count -eq 0) { "NOPROC" } else { ' + loadType() + '"H:" + [HW]::Hide([uint32[]]$pids) }';
    run(script, (err, out) => {
        if (err) { cb({ ok: false, state: 'failed', handles: [], reason: err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err) }); return; }
        if (String(out).trim() === 'NOPROC') { cb({ ok: false, state: 'not_found', handles: [], reason: 'PROCESS_NOT_RUNNING' }); return; }
        const handles = parseHandles(String(out).replace(/^[\s\S]*?H:/, ''));
        if (!/H:/.test(String(out)) || !handles.length) { cb({ ok: false, state: 'failed', handles: [], reason: 'NO_WINDOW_FOUND' }); return; }
        cb({ ok: true, state: 'hidden', handles, reason: null });
    });
}

/** Hiện lại các cửa sổ đã ẩn (handles) của chương trình exePath. callback(result): { ok, state, handles, reason } — state: "visible" | "not_found" | "failed". */
function show(exePath, handles, cb, runner) {
    if (!validateExePath(exePath)) { cb({ ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' }); return; }
    const hs = (Array.isArray(handles) ? handles : []).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (!hs.length) { cb({ ok: false, state: 'not_found', handles: [], reason: 'NO_SAVED_WINDOW' }); return; }
    const run = runner || defaultRunner;
    const script = pidScript(exePath) + 'if ($pids.Count -eq 0) { "NOPROC" } else { ' + loadType() + '"S:" + [HW]::Show([int64[]](' + hs.join(',') + '), [uint32[]]$pids) }';
    run(script, (err, out) => {
        if (err) { cb({ ok: false, state: 'failed', handles: [], reason: err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err) }); return; }
        if (String(out).trim() === 'NOPROC') { cb({ ok: false, state: 'not_found', handles: [], reason: 'PROCESS_NOT_RUNNING' }); return; }
        const shown = parseHandles(String(out).replace(/^[\s\S]*?S:/, ''));
        if (!shown.length) { cb({ ok: false, state: 'not_found', handles: [], reason: 'WINDOW_GONE' }); return; }
        cb({ ok: true, state: 'visible', handles: shown, reason: null });
    });
}

/** Bản ĐỒNG BỘ của show() — chỉ dùng lúc thoát app để không bỏ lại DAW đang ẩn. Trả { ok, state, handles, reason }. */
function showSync(exePath, handles) {
    if (process.platform !== 'win32') return { ok: false, state: 'failed', handles: [], reason: 'UNSUPPORTED_PLATFORM' };
    if (!validateExePath(exePath)) return { ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' };
    const hs = (Array.isArray(handles) ? handles : []).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (!hs.length) return { ok: false, state: 'not_found', handles: [], reason: 'NO_SAVED_WINDOW' };
    try {
        const script = pidScript(exePath) + 'if ($pids.Count -eq 0) { "NOPROC" } else { ' + loadType() + '"S:" + [HW]::Show([int64[]](' + hs.join(',') + '), [uint32[]]$pids) }';
        const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 6000, encoding: 'utf8' });
        const shown = parseHandles(String(r.stdout || '').replace(/^[\s\S]*?S:/, ''));
        return shown.length ? { ok: true, state: 'visible', handles: shown, reason: null } : { ok: false, state: 'not_found', handles: [], reason: 'WINDOW_GONE' };
    } catch (e) { return { ok: false, state: 'failed', handles: [], reason: String((e && e.message) || e) }; }
}

module.exports = { hide, show, showSync, validateExePath, parseHandles, _scriptsForTest: { pidScript, CSHARP } };
