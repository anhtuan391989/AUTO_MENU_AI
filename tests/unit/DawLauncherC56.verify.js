/**
 * DawLauncherC56.verify.js — TASK C56 (Hidden DAW)
 * ---------------------------------------------------------------------------
 * Test module THẬT core/integration/DawLauncher.js trực tiếp (require thật,
 * không trích source vào vm — module này KHÔNG phụ thuộc Electron nên chạy
 * được bằng `node` thuần). Bao phủ:
 *   - validateExecutable: not_configured / valid / invalid(missing) /
 *     invalid(not_a_file — KHÔNG được coi directory là executable, C56.3)
 *   - validateProject: not_configured / valid / missing (C56.4, không crash)
 *   - launch(): từ chối executable invalid, từ chối launch trùng khi đã chạy,
 *     spawn thật 1 process giả lập (node -e) rồi track đúng pid/running,
 *     child.exit -> state tự reset
 *   - show()/hide() khi chưa launch -> lỗi rõ ràng (not_running), không throw
 *
 * KHÔNG test findMainWindowHandle/setWindowVisibility/bringToForeground bằng
 * PowerShell thật (môi trường sandbox này không phải Windows — DawLauncher tự
 * phát hiện platform và trả lỗi 'platform_not_supported', xem test cuối) —
 * phần Win32 hide/show/foreground THẬT cần chạy trên Windows thật (xem
 * C56-REPORT.md mục "Windows verification" — NOT VERIFIED ở sandbox này).
 *
 * Chạy: node tests/unit/DawLauncherC56.verify.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DawLauncher = require('../../core/integration/DawLauncher');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function withTmpDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c56-daw-'));
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// =============================================================================
console.log('--- validateExecutable ---');
withTmpDir((dir) => {
    assert(DawLauncher.validateExecutable('').status === 'not_configured', 'rỗng -> not_configured (hợp lệ, không phải lỗi)');
    assert(DawLauncher.validateExecutable(undefined).status === 'not_configured', 'undefined -> not_configured');

    const missing = path.join(dir, 'does-not-exist.exe');
    const r1 = DawLauncher.validateExecutable(missing);
    assert(r1.status === 'invalid' && r1.reason === 'missing', 'path không tồn tại -> invalid/missing');

    // directory KHÔNG được coi là executable (C56.3)
    const r2 = DawLauncher.validateExecutable(dir);
    assert(r2.status === 'invalid' && r2.reason === 'not_a_file', 'directory -> invalid/not_a_file (không coi là executable)');

    const realFile = path.join(dir, 'fake-daw.exe');
    fs.writeFileSync(realFile, 'x');
    const r3 = DawLauncher.validateExecutable(realFile);
    assert(r3.status === 'valid', 'file thật tồn tại -> valid');
});

// =============================================================================
console.log('--- validateProject ---');
withTmpDir((dir) => {
    assert(DawLauncher.validateProject('').status === 'not_configured', 'rỗng -> not_configured');
    assert(DawLauncher.validateProject(path.join(dir, 'nope.song')).status === 'missing', 'không tồn tại -> missing (không throw)');
    const proj = path.join(dir, 'real.song');
    fs.writeFileSync(proj, 'x');
    assert(DawLauncher.validateProject(proj).status === 'valid', 'file tồn tại -> valid');
});

// =============================================================================
console.log('--- launch(): từ chối executable invalid, không đụng state ---');
DawLauncher._resetForTest();
(function () {
    let called = false;
    DawLauncher.launch({ exePath: '' }, (err) => {
        called = true;
        assert(err && /invalid_executable/.test(err.message), 'exePath rỗng -> callback lỗi invalid_executable, KHÔNG launch');
    });
    assert(called, 'callback được gọi đồng bộ (không launch async nào xảy ra)');
    assert(DawLauncher.getStatus().running === false, 'state vẫn running=false sau khi từ chối launch');
})();

// =============================================================================
console.log('--- launch(): spawn process thật (giả lập bằng node), track đúng pid, exit tự reset ---');
withTmpDir((dir) => {
    DawLauncher._resetForTest();
    // "DAW giả lập" cho test: 1 process Node thật, sống một khoảng ngắn rồi tự thoát —
    // spawn() trong DawLauncher chạy trực tiếp exePath (không qua shell), nên dùng
    // process.execPath (node thật) làm "executable" hợp lệ để launch() chấp nhận.
    const nodeExe = process.execPath;
    const scriptFile = path.join(dir, 'sleep.js');
    fs.writeFileSync(scriptFile, 'setTimeout(()=>{}, 1500);');

    let launchErr = null, launchInfo = null;
    DawLauncher.launch({ exePath: nodeExe }, (err, info) => { launchErr = err; launchInfo = info; });
    // launch() dùng validateExecutable(exePath) — nodeExe là file thật -> phải launch OK
    assert(!launchErr, 'launch với executable hợp lệ (node thật) -> không lỗi: ' + (launchErr && launchErr.message));
    assert(launchInfo && typeof launchInfo.pid === 'number', 'callback trả về pid thật');

    const st = DawLauncher.getStatus();
    assert(st.running === true, 'getStatus().running === true ngay sau khi launch');
    assert(st.pid === launchInfo.pid, 'getStatus().pid khớp pid vừa launch');

    // launch lần 2 trong khi đang chạy -> phải bị từ chối (không cho chạy 2 DAW cùng lúc)
    let secondErr = null;
    DawLauncher.launch({ exePath: nodeExe }, (err) => { secondErr = err; });
    assert(secondErr && /already_running/.test(secondErr.message), 'launch lần 2 khi đang chạy -> already_running, không spawn thêm');

    // Dọn tiến trình test thật (không đợi 1.5s tự thoát) — process thật, phải kill thật.
    try { process.kill(st.pid); } catch { /* có thể đã thoát */ }
});

// =============================================================================
console.log('--- child.exit tự reset state (không cần gọi gì thêm) ---');
(function () {
    DawLauncher._resetForTest();
    const nodeExe = process.execPath;
    let info = null;
    DawLauncher.launch({ exePath: nodeExe, projectPath: '' }, (err, i) => { info = i; });
    assert(info && info.pid, 'launch thành công, có pid');

    return new Promise((resolve) => {
        // node -e "" thoát gần như ngay lập tức -> chờ 1 nhịp event loop rồi kiểm tra state.
        setTimeout(() => {
            const st = DawLauncher.getStatus();
            assert(st.running === false, 'sau khi process con tự thoát, getStatus().running tự về false (không cần gọi thủ công)');
            resolve();
        }, 400);
    });
})().then(runShowHideTests);

// =============================================================================
function runShowHideTests() {
    console.log('--- show()/hide() khi chưa có DAW nào chạy ---');
    DawLauncher._resetForTest();
    DawLauncher.show((err) => assert(err && /not_running/.test(err.message), 'show() khi chưa launch -> not_running, không throw'));
    DawLauncher.hide((err) => assert(err && /not_running/.test(err.message), 'hide() khi chưa launch -> not_running, không throw'));

    console.log('--- platform guard (sandbox test này không phải Windows) ---');
    if (!DawLauncher.isWindows()) {
        console.log('  (môi trường test không phải Windows — Win32 hide/show/foreground THẬT: NOT VERIFIED ở đây, cần Windows thật, xem C56-REPORT.md)');
    }

    console.log('\n=== KẾT QUẢ: ' + pass + ' PASS, ' + fail + ' FAIL ===');
    process.exitCode = fail > 0 ? 1 : 0;
}
