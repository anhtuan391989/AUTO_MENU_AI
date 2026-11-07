// A108 — Mở Youtube bền vững + gộp thẻ. MÔ PHỎNG (spawn/shell giả) — KHÔNG phải Windows/trình duyệt thật.
const fs = require('fs'), vm = require('vm'), path = require('path'), { EventEmitter } = require('events');
const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
let p = 0, f = 0; const ok = (c, m, x) => { c ? p++ : (f++, console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x))); if (c) console.log('  OK  ', m); };
const a = src.indexOf('const OPEN_BUNDLE_LOG'), b = src.indexOf('ipcMain.handle("open-project-bundle"');
ok(a > 0 && b > a, 'tìm thấy khối helper A108 trong main.js');
function make(world) {
  const calls = [];
  const ctx = { console: { log() {} }, process: { platform: 'win32' }, setTimeout, path, fs: { existsSync: (x) => x === 'C:\\B\\chrome.exe', appendFileSync() {} }, app: { getPath: () => '/tmp' },
    require: (m) => m === './Elevation' ? { isElevated: () => world.elevated } : require(m),
    spawn: (cmd, args, o) => { calls.push({ cmd, args, o }); const e = new EventEmitter(); e.unref = () => {}; setTimeout(() => { if (world.spawnError === cmd) e.emit('error', new Error('ENOENT')); else e.emit('exit', world.exit[cmd] == null ? 0 : world.exit[cmd]); }, 5); return e; },
    shell: { openExternal: async () => { calls.push({ cmd: 'openExternal' }); if (world.shellFail) throw new Error('boom'); } } };
  vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx); return { ctx, calls, run: (br) => vm.runInContext('__menuElevated=null;openYoutubeRobust("https://www.youtube.com",' + JSON.stringify(br) + ')', ctx) };
}
(async () => {
  let m = make({ elevated: false, exit: {} }); let r = await m.run('C:\\B\\chrome.exe');
  ok(r.ok && r.via === 'trình duyệt đã chọn' && m.calls.length === 1 && m.calls[0].cmd === 'C:\\B\\chrome.exe' && m.calls[0].args[0] === 'https://www.youtube.com', 'Menu thường + có trình duyệt: mở thẳng bằng trình duyệt đã chọn');
  m = make({ elevated: true, exit: {} }); r = await m.run('C:\\B\\chrome.exe');
  ok(r.ok && /hạ quyền/.test(r.via) && m.calls[0].cmd === 'runas' && m.calls[0].args[0] === '/trustlevel:0x20000' && m.calls[0].args[1] === '"\\"C:\\B\\chrome.exe\\" https://www.youtube.com"' && m.calls[0].o.verbatim === undefined && m.calls[0].o.windowsVerbatimArguments === true, 'Menu Administrator: thử HẠ QUYỀN trước (runas /trustlevel:0x20000, đúng cú pháp nháy)', m.calls[0]);
  m = make({ elevated: true, exit: { runas: 1 } }); r = await m.run('C:\\B\\chrome.exe');
  ok(r.ok && r.via === 'trình duyệt đã chọn' && r.tried[0].endsWith('✗') && m.calls.length === 2, 'hạ quyền thất bại => rơi về mở thẳng trình duyệt đã chọn');
  m = make({ elevated: true, exit: { runas: 1, 'C:\\B\\chrome.exe': 1 } }); r = await m.run('C:\\B\\chrome.exe');
  ok(r.ok && r.via === 'explorer.exe mở URL', 'Menu Administrator + trình duyệt lỗi => explorer.exe (mở bằng quyền thường)', r);
  m = make({ elevated: false, exit: { 'C:\\B\\chrome.exe': 1 } }); r = await m.run('C:\\B\\chrome.exe');
  ok(r.ok && r.via === 'shell.openExternal', 'Menu thường + trình duyệt lỗi => trình duyệt mặc định (openExternal)');
  m = make({ elevated: false, exit: {} }); r = await m.run('');
  ok(r.ok && r.via === 'shell.openExternal' && m.calls.length === 1, 'chưa chọn trình duyệt => trình duyệt mặc định');
  m = make({ elevated: false, exit: { 'explorer.exe': 1 }, shellFail: true }); r = await m.run('');
  ok(r.ok && r.via === 'explorer.exe mở URL', 'openExternal lỗi => explorer.exe (mã thoát 1 vẫn tính là đã mở)');
  m = make({ elevated: false, exit: {}, shellFail: true, spawnError: 'explorer.exe' }); r = await m.run('');
  ok(!r.ok && r.tried.length === 2, 'mọi cách đều lỗi => ok=false, liệt kê đủ các cách đã thử', r);
  ok(/result\.youtube = \{ via: r\.via/.test(src) && /Không mở được Youtube bằng cách nào/.test(src), 'handler trả result.youtube + báo lỗi rõ khi tất cả thất bại');
  const html = fs.readFileSync(path.join(root, 'ui/setup.html'), 'utf8'); const st = html.indexOf('panel-card-title">🚀 Mở kèm Project / Youtube<'); const body = html.slice(st, html.indexOf('<div class="panel-card">', st + 10));
  const ids = ['currentDawPath', 'browseDawBtn', 'launchDawOnStartup', 'checkOpenPj', 'checkCopyPj', 'checkOpenYt', 'pjPathDisplay', 'btnSelectPj', 'btnSaveCurrentPj', 'btnOpenProjectBundle', 'btnClosePj'];
  ok(ids.every((i) => body.includes('id="' + i + '"')) && (html.match(/id="checkOpenYt"/g) || []).length === 1, 'thẻ gộp có ĐỦ 11 thành phần, không trùng id');
  ok(!/panel-card-title">📁 Đường dẫn &amp; khởi động/.test(html), 'thẻ "Đường dẫn & khởi động" riêng đã gộp');
  const ys = fs.readFileSync(path.join(root, 'ui/js/setup.js'), 'utf8'); ok(/result\?\.youtube\?\.via/.test(ys), 'setup.js: thông báo thành công nói rõ Youtube mở bằng cách nào');
  console.log(p + ' PASS / ' + f + ' FAIL (MÔ PHỎNG)'); process.exit(f ? 1 : 0);
})();
