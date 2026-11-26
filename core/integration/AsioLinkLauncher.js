/* ASIO-LINK-01 — Mở / Khởi động lại phần mềm ASIO Link Pro (O Deus) từ Setup > Audio khi chọn sai driver hoặc mất tiếng.
 * Module Node thuần (KHÔNG phụ thuộc Electron) -> test được bằng hàm giả. Chỉ chạy trên Windows.
 *   validate(p)      : file .exe tồn tại thật (đường dẫn tuyệt đối).
 *   open(p, deps)    : chạy ASIO Link Pro (tách rời, app Menu đóng không làm nó tắt).
 *   restart(p, deps) : đóng tiến trình CÙNG TÊN file với p (taskkill /IM, KHÔNG qua shell) rồi chạy lại.
 * An toàn: từ chối đóng các tiến trình quan trọng (Explorer, DAW Studio One/Pro, Menu...) dù người dùng lỡ chọn nhầm file.
 * Không bao giờ throw: luôn trả { ok, message, ... }.
 */
'use strict';
const nodeFs = require('fs');
const nodePath = require('path');
const childProcess = require('child_process');

const PROTECTED = new Set([
  'explorer.exe', 'svchost.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'wininit.exe', 'winlogon.exe', 'csrss.exe', 'services.exe', 'lsass.exe',
  'studio one.exe', 'studio pro.exe', 'electron.exe', 'automenuai.exe', 'auto menu ai.exe', 'reaper.exe', 'ableton live.exe', 'fl64.exe', 'cubase.exe'
]);
const KILL_TIMEOUT_MS = 8000;
const AFTER_KILL_WAIT_MS = 1200; // chờ Windows nhả driver trước khi chạy lại

function validate(p, deps) {
  const fsm = (deps && deps.fs) || nodeFs;
  const pathm = (deps && deps.path) || nodePath;
  try {
    if (typeof p !== 'string' || !p.trim()) return { ok: false, reason: 'no-path', message: 'Chưa chọn file ASIO Link Pro (.exe).' };
    const s = p.trim();
    if (!/\.exe$/i.test(s)) return { ok: false, reason: 'not-exe', message: 'File đã chọn không phải .exe.' };
    if (!pathm.isAbsolute(s)) return { ok: false, reason: 'not-absolute', message: 'Đường dẫn phải đầy đủ (có ổ đĩa).' };
    if (!fsm.existsSync(s) || !fsm.statSync(s).isFile()) return { ok: false, reason: 'missing', message: 'Không tìm thấy file: ' + s };
    return { ok: true, path: s, name: pathm.basename(s) };
  } catch (e) { return { ok: false, reason: 'error', message: 'Không kiểm tra được file: ' + ((e && e.message) || e) }; }
}

function isWin(deps) { return ((deps && deps.platform) || process.platform) === 'win32'; }

function spawnDetached(file, deps) {
  const sp = (deps && deps.spawn) || childProcess.spawn;
  const pathm = (deps && deps.path) || nodePath;
  return new Promise((resolve) => {
    try {
      const child = sp(file, [], { detached: true, stdio: 'ignore', cwd: pathm.dirname(file), windowsHide: false });
      let done = false;
      const fin = (r) => { if (!done) { done = true; resolve(r); } };
      if (child && typeof child.on === 'function') child.on('error', (e) => fin({ ok: false, message: 'Không chạy được: ' + ((e && e.message) || e) }));
      if (child && typeof child.unref === 'function') child.unref();
      setTimeout(() => fin({ ok: true }), (deps && deps.spawnWaitMs) != null ? deps.spawnWaitMs : 400); // không có lỗi 'error' sau ~0,4s = đã chạy
    } catch (e) { resolve({ ok: false, message: 'Không chạy được: ' + ((e && e.message) || e) }); }
  });
}

async function open(p, deps) {
  try {
    if (!isWin(deps)) return { ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' };
    const v = validate(p, deps);
    if (!v.ok) return v;
    const r = await spawnDetached(v.path, deps);
    return r.ok ? { ok: true, message: 'Đã mở ' + v.name + '.' } : { ok: false, reason: 'spawn-failed', message: r.message };
  } catch (e) { return { ok: false, reason: 'error', message: String((e && e.message) || e) }; }
}

function killByName(name, deps) {
  const ex = (deps && deps.execFile) || childProcess.execFile;
  return new Promise((resolve) => {
    try {
      ex('taskkill', ['/IM', name, '/F', '/T'], { windowsHide: true, timeout: KILL_TIMEOUT_MS }, (err, stdout, stderr) => {
        if (!err) { resolve({ killed: true }); return; }
        const code = err && err.code;
        const txt = String(stdout || '') + String(stderr || '') + String((err && err.message) || '');
        // mã 128 / "not found" = KHÔNG có tiến trình nào tên đó đang chạy -> không phải lỗi
        if (code === 128 || /not found|no running instance|không tìm thấy/i.test(txt)) { resolve({ killed: false }); return; }
        resolve({ killed: false, error: (err && err.message) || String(err) });
      });
    } catch (e) { resolve({ killed: false, error: (e && e.message) || String(e) }); }
  });
}

async function restart(p, deps) {
  try {
    if (!isWin(deps)) return { ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' };
    const v = validate(p, deps);
    if (!v.ok) return v;
    if (PROTECTED.has(v.name.toLowerCase())) return { ok: false, reason: 'protected', message: 'Từ chối: "' + v.name + '" không phải ASIO Link Pro (không được đóng chương trình này). Hãy chọn đúng file ASIO Link Pro.' };
    const k = await killByName(v.name, deps);
    if (k.error) return { ok: false, reason: 'kill-failed', message: 'Không đóng được ' + v.name + ': ' + k.error };
    const sleep = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
    await sleep(AFTER_KILL_WAIT_MS);
    const r = await spawnDetached(v.path, deps);
    if (!r.ok) return { ok: false, reason: 'spawn-failed', message: r.message, killed: k.killed };
    return { ok: true, killed: k.killed, message: (k.killed ? 'Đã đóng và mở lại ' : 'Chưa chạy sẵn — đã mở ') + v.name + '.' };
  } catch (e) { return { ok: false, reason: 'error', message: String((e && e.message) || e) }; }
}

module.exports = { validate, open, restart, killByName, PROTECTED };
