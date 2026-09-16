/**
 * DawLauncher.js — TASK C56 (Hidden DAW)
 * ---------------------------------------------------------------------------
 * Phạm vi: C56 (Claude C — Setup nhưng KHÔNG phải AI Setup). Chịu trách nhiệm
 * validate + launch + theo dõi + ẩn/hiện tiến trình DAW THẬT, dựa HOÀN TOÀN
 * vào cấu hình `startupPaths` đã có sẵn từ TASK A55 (xem ui/js/appSettings.js,
 * app/main.js SETTINGS_FILE = app-settings.json). KHÔNG tạo configuration
 * system thứ 2, KHÔNG đụng tới AI Key/BPM/Mod Engine, Manual Key, Command
 * Engine/MIDI dispatcher, hay D1 runtime (đúng phạm vi C56.11 — xem
 * C56-REPORT.md mục "Không được sửa").
 *
 * Module Node THUẦN — KHÔNG require("electron") — để có thể test trực tiếp
 * bằng `node tests/unit/...verify.js` (không cần Electron runtime) và để
 * main.js (nơi DUY NHẤT có Electron context) gọi vào như 1 service thuần.
 *
 * "Hidden" ở đây nghĩa là: launch DAW như 1 process Windows thật (spawn thật,
 * không giả lập/không fake), sau đó dùng PowerShell + Win32 API
 * (ShowWindowAsync/SetForegroundWindow qua User32) để ẩn HẲN cửa sổ chính của
 * DAW khỏi taskbar/desktop — không chỉ "minimize". AUTO MENU AI's tray icon
 * (xem app/main.js) là nơi user gọi show()/hide() để lấy lại quyền thao tác
 * trực tiếp DAW khi cần (C56.9).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// =============================================================================
// VALIDATION — chỉ đọc metadata filesystem, KHÔNG launch/execute gì ở đây.
// =============================================================================

/**
 * Validate DAW Executable Path. Phải PHÂN BIỆT được "không cấu hình" (rỗng —
 * hợp lệ, không phải lỗi — đúng C56.2) với "có cấu hình nhưng sai" (thiếu file
 * hoặc là 1 thư mục — C56.3: "Không được coi directory là executable").
 * @returns {{status:'not_configured'|'valid'|'invalid', reason?:string}}
 */
function validateExecutable(p) {
    if (!p) return { status: 'not_configured' };
    try {
        if (!fs.existsSync(p)) return { status: 'invalid', reason: 'missing' };
        if (!fs.statSync(p).isFile()) return { status: 'invalid', reason: 'not_a_file' };
        return { status: 'valid' };
    } catch (err) {
        return { status: 'invalid', reason: 'stat_error' };
    }
}

/**
 * Validate DAW Project/session path — tri-state theo đúng C56.4: exists /
 * missing / empty(=not_configured, hợp lệ) / invalid path (lỗi filesystem lạ,
 * ví dụ đường dẫn chứa ký tự cấm) — KHÔNG BAO GIỜ throw ra ngoài.
 * @returns {{status:'not_configured'|'valid'|'missing'}}
 */
function validateProject(p) {
    if (!p) return { status: 'not_configured' };
    try {
        if (!fs.existsSync(p)) return { status: 'missing' };
        return { status: 'valid' };
    } catch {
        return { status: 'missing' };
    }
}

function isWindows() {
    return process.platform === 'win32';
}

// =============================================================================
// STATE — 1 DAW instance tại 1 thời điểm (đúng mô hình Startup & Paths hiện
// tại: 1 dawExecutable/1 dawProject cấu hình trong Setup, không phải danh sách).
// =============================================================================

function freshState() {
    return {
        child: null,
        pid: null,
        exePath: null,
        projectPath: null,
        windowHandle: null,
        hidden: false,
        startedAt: null,
        lastError: null,
    };
}

let state = freshState();

function getStatus() {
    return {
        running: !!(state.child && state.pid),
        pid: state.pid,
        exePath: state.exePath,
        projectPath: state.projectPath,
        hidden: state.hidden,
        windowHandle: state.windowHandle,
        startedAt: state.startedAt,
        lastError: state.lastError,
    };
}

// Chỉ dùng cho test (tests/unit/*.verify.js) — reset singleton giữa các case,
// KHÔNG gọi trong app thật.
function _resetForTest() {
    state = freshState();
}

// =============================================================================
// PowerShell helper — giữ ĐÚNG pattern đã có sẵn trong repo (xem
// core/integration/WindowsMediaSession.js: spawn("powershell.exe", [...],
// {windowsHide:true})) thay vì tạo cơ chế mới. Không dùng shell:true, luôn
// truyền script qua -Command với mảng args (tránh injection qua path lạ).
// =============================================================================

function runPowerShell(script, callback) {
    if (!isWindows()) {
        callback(new Error('platform_not_supported'), null);
        return;
    }
    let done = false;
    let ps;
    try {
        ps = spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', script],
            { windowsHide: true }
        );
    } catch (err) {
        callback(err, null);
        return;
    }
    let out = '';
    let errOut = '';
    ps.stdout.on('data', (d) => { out += d.toString(); });
    ps.stderr.on('data', (d) => { errOut += d.toString(); });
    ps.on('error', (err) => {
        if (done) return;
        done = true;
        callback(err, null);
    });
    ps.on('close', (code) => {
        if (done) return;
        done = true;
        if (code !== 0 && !out.trim()) {
            callback(new Error(errOut.trim() || ('powershell exit code ' + code)), null);
            return;
        }
        callback(null, out.trim());
    });
}

// Poll Get-Process -Id <pid> cho tới khi MainWindowHandle khác 0, hoặc hết
// timeout — không throw, không crash nếu DAW không tạo cửa sổ (một số DAW
// chạy nền trước khi hiện UI).
function findMainWindowHandle(pid, timeoutMs, callback) {
    if (!isWindows()) {
        callback(new Error('platform_not_supported'), null);
        return;
    }
    const deadline = Date.now() + (timeoutMs || 15000);
    const script =
        '$p = Get-Process -Id ' + pid + ' -ErrorAction SilentlyContinue; ' +
        'if ($p -eq $null) { "GONE" } else { [int64]$p.MainWindowHandle }';

    function tick() {
        runPowerShell(script, (err, out) => {
            if (err) { callback(err, null); return; }
            if (out === 'GONE') { callback(new Error('process_exited'), null); return; }
            const handle = parseInt(out, 10);
            if (handle && handle !== 0) { callback(null, handle); return; }
            if (Date.now() >= deadline) { callback(new Error('timeout_no_window'), null); return; }
            setTimeout(tick, 500);
        });
    }
    tick();
}

// SW_HIDE = 0, SW_SHOW = 5 — dùng ShowWindowAsync (User32) qua P/Invoke trong
// PowerShell. Đây là ẨN THẬT (không còn trong taskbar/Alt-Tab), khác với
// "minimize" (SW_MINIMIZE vẫn còn trong taskbar) — đúng yêu cầu C56.8.
function setWindowVisibility(handle, visible, callback) {
    if (!isWindows()) { callback(new Error('platform_not_supported')); return; }
    const swFlag = visible ? 5 : 0;
    const script =
        'Add-Type -Name Win -Namespace Native -MemberDefinition ' +
        '\'[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);\'; ' +
        '[Native.Win]::ShowWindowAsync([IntPtr]' + handle + ', ' + swFlag + ') | Out-Null; "OK"';
    runPowerShell(script, (err) => callback(err || null));
}

// SetForegroundWindow — đưa DAW ra trước màn hình khi user cần thao tác trực
// tiếp (C56.9 "Show / Foreground DAW"). Luôn show trước rồi mới foreground.
function bringToForeground(handle, callback) {
    if (!isWindows()) { callback(new Error('platform_not_supported')); return; }
    const script =
        'Add-Type -Name Win2 -Namespace Native -MemberDefinition ' +
        '\'[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); ' +
        '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);\'; ' +
        '[Native.Win2]::ShowWindowAsync([IntPtr]' + handle + ', 5) | Out-Null; ' +
        '[Native.Win2]::SetForegroundWindow([IntPtr]' + handle + ') | Out-Null; "OK"';
    runPowerShell(script, (err) => callback(err || null));
}

// =============================================================================
// LAUNCH — process THẬT (spawn thật, detached — sống độc lập AUTO MENU AI,
// KHÔNG bao giờ fake/giả lập). Nếu launch fail, callback(err) — CALLER (main.js)
// chịu trách nhiệm không để lỗi này crash app (đúng C56.10).
// =============================================================================

/**
 * @param {{exePath:string, projectPath?:string, hideAfterLaunch?:boolean, windowWaitMs?:number}} opts
 * @param {(err:Error|null, info?:{pid:number})=>void} callback
 */
function launch(opts, callback) {
    const exePath = opts && opts.exePath;
    const projectPath = opts && opts.projectPath;

    const exeCheck = validateExecutable(exePath);
    if (exeCheck.status !== 'valid') {
        callback(new Error('invalid_executable:' + (exeCheck.reason || exeCheck.status)));
        return;
    }
    if (state.child && state.pid) {
        callback(new Error('already_running:' + state.pid));
        return;
    }

    const projCheck = validateProject(projectPath);
    // DAW project chỉ truyền làm argv khi path THẬT SỰ tồn tại — nếu missing/
    // not_configured, launch DAW KHÔNG kèm project (an toàn hơn truyền path
    // rác vào argv) — đúng "không được crash Setup" (C56.4) áp dụng luôn cho launch.
    const args = projCheck.status === 'valid' ? [projectPath] : [];

    let child;
    try {
        child = spawn(exePath, args, {
            cwd: path.dirname(exePath),
            detached: true,
            stdio: 'ignore',
        });
    } catch (err) {
        state.lastError = err.message;
        callback(err);
        return;
    }

    // detached + unref(): AUTO MENU AI có thể thoát mà không giết theo DAW —
    // nhưng unref() KHÔNG tắt các event listener bên dưới, Node vẫn theo dõi
    // 'exit'/'error' bình thường trong khi AUTO MENU AI còn sống.
    child.unref();

    state.child = child;
    state.pid = child.pid;
    state.exePath = exePath;
    state.projectPath = projCheck.status === 'valid' ? projectPath : null;
    state.startedAt = Date.now();
    state.lastError = null;
    state.hidden = false;
    state.windowHandle = null;

    child.on('exit', (code, signal) => {
        console.log('[DawLauncher] DAW process đã thoát (pid=' + child.pid + ', code=' + code + ', signal=' + signal + ')');
        if (state.child === child) {
            state.child = null;
            state.pid = null;
            state.windowHandle = null;
            state.hidden = false;
        }
    });
    child.on('error', (err) => {
        console.error('[DawLauncher] DAW process lỗi runtime:', err.message);
        state.lastError = err.message;
    });

    callback(null, { pid: child.pid });

    if (opts.hideAfterLaunch) {
        if (!isWindows()) {
            console.log('[DawLauncher] hideAfterLaunch chỉ hỗ trợ Windows — bỏ qua, DAW vẫn chạy bình thường (hiển thị).');
            return;
        }
        findMainWindowHandle(child.pid, opts.windowWaitMs || 15000, (err, handle) => {
            if (err) {
                console.log('[DawLauncher] Không lấy được window handle để ẩn (' + err.message + ') — DAW vẫn là process THẬT, chỉ là không tự ẩn được; user vẫn thấy DAW hiển thị bình thường.');
                return;
            }
            // DAW có thể đã bị đóng ngay trong lúc đang chờ window handle.
            if (!state.child || state.pid !== child.pid) return;
            state.windowHandle = handle;
            setWindowVisibility(handle, false, (err2) => {
                if (err2) {
                    console.log('[DawLauncher] Ẩn cửa sổ DAW thất bại (' + err2.message + ') — DAW vẫn chạy, chỉ là vẫn hiển thị.');
                    return;
                }
                state.hidden = true;
                console.log('[DawLauncher] DAW đã ẩn (pid=' + child.pid + ') — dùng show() hoặc tray "Show DAW" để lấy lại.');
            });
        });
    }
}

/**
 * Đưa DAW ra trước (Show/Foreground) — C56.9. Nếu chưa có windowHandle (chưa
 * từng ẩn, hoặc chưa launch), cố tìm lại 1 lần trước khi báo lỗi.
 */
function show(callback) {
    if (!state.child || !state.pid) { callback(new Error('not_running')); return; }
    if (state.windowHandle) {
        bringToForeground(state.windowHandle, (err) => {
            if (!err) state.hidden = false;
            callback(err || null);
        });
        return;
    }
    findMainWindowHandle(state.pid, 5000, (err, handle) => {
        if (err) { callback(err); return; }
        state.windowHandle = handle;
        bringToForeground(handle, (err2) => {
            if (!err2) state.hidden = false;
            callback(err2 || null);
        });
    });
}

/** Ẩn lại DAW theo yêu cầu (ví dụ user bấm "Hide DAW" trên tray). */
function hide(callback) {
    if (!state.child || !state.pid) { callback(new Error('not_running')); return; }
    if (!state.windowHandle) { callback(new Error('no_window_handle')); return; }
    setWindowVisibility(state.windowHandle, false, (err) => {
        if (!err) state.hidden = true;
        callback(err || null);
    });
}

module.exports = {
    validateExecutable,
    validateProject,
    launch,
    show,
    hide,
    getStatus,
    isWindows,
    _resetForTest,
};
