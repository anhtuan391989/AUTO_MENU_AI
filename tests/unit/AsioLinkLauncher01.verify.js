// ASIO-LINK-01 — chạy: node tests/unit/AsioLinkLauncher01.verify.js
// Hàm THẬT của core/integration/AsioLinkLauncher.js với fs/spawn/taskkill GIẢ. KHÔNG mở/đóng chương trình thật.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const L = require(path.join(ROOT, 'core/integration/AsioLinkLauncher.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const P = 'C:\\Program Files\\ASIO Link Pro\\ASIOLinkPro.exe';
function deps(o) {
  o = Object.assign({ exists: true, killErr: null, spawnErr: false }, o);
  const log = [];
  return { log, platform: 'win32', spawnWaitMs: 5, sleep: () => Promise.resolve(),
    path: path.win32,
    fs: { existsSync: () => o.exists, statSync: () => ({ isFile: () => true }) },
    execFile: (cmd, args, opt, cb) => { log.push(['kill', cmd, args.join(' ')]); setImmediate(() => cb(o.killErr, '', '')); },
    spawn: (file) => { log.push(['spawn', file]); const h = {}; return { on: (ev, fn) => { if (ev === 'error' && o.spawnErr) setImmediate(() => fn(new Error('EACCES'))); }, unref() {} }; } };
}
(async () => {
  let d = deps(); let r = await L.open(P, d);
  ok(r.ok && d.log.length === 1 && d.log[0][0] === 'spawn' && d.log[0][1] === P, 'Mở: chạy đúng file đã chọn, KHÔNG đóng gì');
  d = deps(); r = await L.restart(P, d);
  ok(r.ok && r.killed === true && d.log[0][0] === 'kill' && d.log[0][2] === '/IM ASIOLinkPro.exe /F /T' && d.log[1][0] === 'spawn', 'Khởi động lại: đóng đúng tên tiến trình (taskkill /IM, không shell) rồi chạy lại');
  d = deps({ killErr: Object.assign(new Error('not found'), { code: 128 }) }); r = await L.restart(P, d);
  ok(r.ok && r.killed === false && d.log.some((x) => x[0] === 'spawn') && /Chưa chạy sẵn/.test(r.message), 'Chưa chạy sẵn (taskkill 128): không phải lỗi, vẫn mở mới');
  d = deps({ killErr: Object.assign(new Error('Access is denied'), { code: 1 }) }); r = await L.restart(P, d);
  ok(!r.ok && r.reason === 'kill-failed' && !d.log.some((x) => x[0] === 'spawn'), 'Đóng thất bại thật: báo lỗi, KHÔNG chạy thêm bản thứ 2');
  d = deps({ spawnErr: true }); r = await L.open(P, d);
  ok(!r.ok && r.reason === 'spawn-failed', 'Không chạy được file: báo lỗi rõ ràng');
  for (const name of ['explorer.exe', 'Studio One.exe', 'Studio Pro.exe', 'electron.exe', 'cmd.exe']) {
    d = deps(); r = await L.restart('C:\\x\\' + name, d);
    ok(!r.ok && r.reason === 'protected' && d.log.length === 0, 'Từ chối đóng tiến trình quan trọng: ' + name);
  }
  d = deps({ exists: false }); r = await L.restart(P, d); ok(!r.ok && r.reason === 'missing' && d.log.length === 0, 'File không còn tồn tại: báo lỗi, không làm gì');
  d = deps(); r = await L.open('', d); ok(!r.ok && r.reason === 'no-path', 'Chưa chọn đường dẫn: báo "chưa chọn"');
  d = deps(); r = await L.open('C:\\x\\a.txt', d); ok(!r.ok && r.reason === 'not-exe', 'File không phải .exe: từ chối');
  d = deps(); r = await L.open('relative\\a.exe', d); ok(!r.ok && r.reason === 'not-absolute', 'Đường dẫn không đầy đủ: từ chối');
  d = deps(); d.platform = 'linux'; r = await L.open(P, d); ok(!r.ok && r.reason === 'not-windows' && d.log.length === 0, 'Không phải Windows: không làm gì, không crash');
  // wiring tĩnh
  const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const main = rd('app/main.js'), pre = rd('app/preload.js'), st = rd('ui/js/setupTools.js');
  ok(/ipcMain\.handle\("asio-link-open"/.test(main) && /ipcMain\.handle\("asio-link-restart"/.test(main) && /fromSetupWindow\(event\)\) return Promise\.resolve\(DENIED\)/.test(main), 'main.js: 2 kênh IPC, chỉ cửa sổ Setup được gọi');
  ok(/st\.asioLinkPath/.test(main) && !/asio-link-(open|restart)", \(event, /.test(main), 'main.js: đường dẫn đọc từ file cài đặt, KHÔNG nhận từ renderer');
  ok(/asioLinkOpen:/.test(pre) && /asioLinkRestart:/.test(pre), 'preload.js: bắc cầu 2 kênh');
  ok(/getElementById\("panel-audio"\)/.test(st) && /setSetting\("asioLinkPath"/.test(st), 'Setup: thẻ nằm ở mục Audio, lưu setting asioLinkPath');
  const { execSync } = require('child_process'); let h = ''; try { h = execSync('git diff --name-only -- ui/setup.html ui/index.html ui/css', { cwd: ROOT }).toString().trim(); } catch (e) { /* */ }
  ok(h === '', 'KHÔNG sửa HTML/CSS');
  console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
