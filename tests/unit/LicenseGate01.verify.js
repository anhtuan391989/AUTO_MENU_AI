// LICENSE-01 — kiểm thử CỔNG license trong app/main.js: trích đúng đoạn code thật rồi chạy trong vm sandbox (giống cách các verify khác
// trong repo), vì main.js cần Electron nên không require thẳng được. Chạy: node tests/unit/LicenseGate01.verify.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const root = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
const pre = fs.readFileSync(path.join(root, 'app/preload.js'), 'utf8');

function slice(from, toExclusive) {
  const a = main.indexOf(from), b = main.indexOf(toExclusive, a);
  if (a < 0 || b < 0) throw new Error('không tìm thấy mốc trích: ' + from + ' / ' + toExclusive);
  return main.slice(a, b);
}

(async () => {
  console.log('== nối dây tĩnh');
  const gateAt = main.indexOf('if (!licenseManager.isLicensed()) { openLicenseGate(); return; }');
  const permAt = main.indexOf('session.defaultSession.setPermissionRequestHandler');
  const createAt = main.indexOf('createMainWindow();\n    createSetupWindow();');
  ok(gateAt > 0 && gateAt < permAt && gateAt < createAt, 'cổng license nằm TRƯỚC mọi khởi động (quyền, cửa sổ Menu/Setup, MIDI, Now Playing...)');
  for (const ch of ['license-status', 'license-activate', 'license-refresh', 'license-copy-machine']) ok(main.includes('ipcMain.handle("' + ch + '"') && pre.includes('ipcRenderer.invoke("' + ch + '"'), 'IPC ' + ch + ' có ở main + preload');
  const wr = main.split('\n').filter((l) => l.startsWith('app.whenReady()'));
  const unguarded = wr.filter((l) => !l.includes('licenseReady') && !l.startsWith('app.whenReady().then(async () => {') && !l.includes('restoreTrayIfHidden'));
  ok(unguarded.length === 0, 'mọi khối app.whenReady đều được chặn bởi license (trừ restoreTrayIfHidden: chỉ KHÔI PHỤC DAW đang ẩn từ phiên trước)', unguarded);
  ok(main.indexOf('setTimeout(() => { autoLaunchPrograms(); }, 2000);') > gateAt, 'tự mở loopMIDI/Studio One nằm sau cổng');
  ok(!/app\.relaunch\(/.test(main), 'main.js không gọi app.relaunch trực tiếp (MenuElevationA104) — đi qua licenseManager.relaunch');
  const html = fs.readFileSync(path.join(root, 'ui/license.html'), 'utf8');
  for (const id of ['gateMessage', 'gateMachine', 'gateKey', 'btnGateActivate', 'btnGateCopy', 'btnGateRecheck', 'gateResult']) ok(html.includes('id="' + id + '"') && fs.readFileSync(path.join(root, 'ui/js/licenseGate.js'), 'utf8').includes(id), 'màn hình kích hoạt có ' + id);
  const sh = fs.readFileSync(path.join(root, 'ui/setup.html'), 'utf8');
  ok(sh.includes('id="licenseBox"') && sh.includes('id="licenseSummary"') && sh.includes('js/setupLicense.js'), 'Setup: ô License + nạp setupLicense.js');
  ok(fs.existsSync(path.join(root, 'app/license-public-key.txt')) === false, 'KHÔNG có sẵn khoá công khai trong repo (người dùng tự tạo bằng tao-khoa.html) -> bản chưa cấu hình sẽ khoá, không mở toang');

  console.log('== chạy thật đoạn cổng trong sandbox');
  const block1 = slice('const { createLicenseManager } = require("./LicenseManager");', '    // Mặc định Electron sẽ TỪ CHỐI các quyền nhạy cảm');
  const block2 = slice('// LICENSE-01 — relay IPC cho màn hình kích hoạt', 'ipcMain.handle("admin-auth-verify"');

  function makeEnv(licensed) {
    const log = { windows: [], rest: 0, watcher: null, exits: [], relaunch: 0, quit: 0, dialogs: [], handlers: {}, clip: [], loaded: [] };
    let isLic = licensed;
    const mgr = {
      init: async () => {}, isLicensed: () => isLic, startWatcher: (w) => { log.watcher = w; },
      getStatus: () => ({ ok: true, licensed: isLic, machineCode: 'AAAAA-BBBBB-CCCCC-DDDDD', message: 'm' }),
      activate: async (k) => (k === 'GOOD' ? (isLic = true, { ok: true, status: { licensed: true } }) : { ok: false, reason: 'INVALID_KEY', message: 'sai' }),
      refresh: async () => ({ ok: true }),
      relaunch: (a) => { a.relaunch(); a.quit(); return { ok: true }; } // giống LicenseManager.relaunch thật
    };
    let readyCb = null;
    const sandbox = {
      console, setTimeout, clearTimeout, __dirname: '/app', Promise,
      require: (p) => { if (p === './LicenseManager') return { createLicenseManager: () => mgr }; if (p === 'electron') return { clipboard: { writeText: (t) => log.clip.push(t) } }; throw new Error('require ngoài dự kiến: ' + p); },
      app: { getPath: () => '/ud', whenReady: () => ({ then: (cb) => { readyCb = cb; return { then: () => ({}) }; } }), relaunch: () => { log.relaunch++; }, quit: () => { log.quit++; }, exit: (c) => { log.exits.push(c); } },
      BrowserWindow: function (o) { this.opts = o; this.on = (ev, cb) => { this.closedCb = ev === 'closed' ? cb : this.closedCb; }; this.loadFile = (f) => { log.loaded.push(f); }; log.windows.push(this); },
      dialog: { showMessageBoxSync: (o) => { log.dialogs.push(o); return 0; } },
      path, ipcMain: { handle: (ch, fn) => { log.handlers[ch] = fn; } },
      readSettingsFile: () => ({ licenseServerUrl: 'https://x.test' }),
      __restOfStartup: () => { log.rest++; }
    };
    vm.createContext(sandbox);
    // `let __companionDone` giống main.js (khai báo ở cuối file) để kiểm tra onLicenseLost không tự đóng DAW/YouTube
    vm.runInContext('let __companionDone = false;\n' + block1 + '    __restOfStartup();\n});\n' + block2 + '\nthis.__t = { isDone: () => __companionDone, onLost: onLicenseLost, readyCb: () => 0 };', sandbox);
    return { sandbox, log, mgr, setLic: (v) => { isLic = v; }, run: () => readyCb(), api: sandbox.__t };
  }

  // 1) chưa kích hoạt
  let e = makeEnv(false);
  await e.run();
  ok(e.log.windows.length === 1 && e.log.loaded[0].endsWith('license.html') && e.log.windows[0].opts.resizable === false, 'CHƯA kích hoạt: chỉ mở đúng 1 cửa sổ = màn hình kích hoạt (license.html)');
  ok(e.log.rest === 0 && e.log.watcher === null, 'CHƯA kích hoạt: toàn bộ phần khởi động phía sau (Menu, Setup, MIDI, Now Playing, tự mở DAW...) KHÔNG chạy');
  e.log.windows[0].closedCb();
  ok(e.log.exits.length === 1 && e.log.quit === 0, 'đóng màn hình kích hoạt = thoát hẳn (app.exit, không qua before-quit)');

  // 2) đã kích hoạt
  e = makeEnv(true);
  await e.run();
  ok(e.log.windows.length === 0 && e.log.rest === 1 && typeof e.log.watcher.onLost === 'function', 'ĐÃ kích hoạt: không mở màn hình kích hoạt, khởi động bình thường và bật watcher');

  // 3) IPC
  e = makeEnv(false);
  await e.run();
  const H = e.log.handlers;
  ok((await H['license-status']()).machineCode === 'AAAAA-BBBBB-CCCCC-DDDDD', 'IPC license-status trả mã máy');
  const bad = await H['license-activate']({}, 'BAD');
  ok(bad.ok === false && e.log.relaunch === 0, 'key sai: báo lỗi, KHÔNG khởi động lại');
  const good = await H['license-activate']({}, 'GOOD');
  ok(good.ok === true && e.log.relaunch === 0, 'key đúng: trả OK, chưa khởi động lại ngay (chừa thời gian hiện "thành công")');
  await new Promise((r) => setTimeout(r, 1700));
  ok(e.log.relaunch === 1 && e.log.quit === 1, 'sau ~1,5 giây: tự mở lại app đầy đủ (relaunch + quit)');
  ok(e.api.isDone() === true, 'khởi động lại sau kích hoạt KHÔNG tự đóng DAW/YouTube của người dùng');
  e.log.windows[0].closedCb();
  ok(e.log.exits.length === 0 && e.log.quit === 1, 'cửa sổ kích hoạt đóng trong lúc đang khởi động lại: không thoát đôi');
  await H['license-activate']({}, 'GOOD');
  await new Promise((r) => setTimeout(r, 1700));
  ok(e.log.relaunch === 1, 'bấm kích hoạt nhiều lần: chỉ khởi động lại 1 lần');
  ok((await H['license-copy-machine']()).ok && e.log.clip[0] === 'AAAAA-BBBBB-CCCCC-DDDDD', 'IPC license-copy-machine chép mã máy vào clipboard');

  // 4) kích hoạt trong Setup (đang có license) không khởi động lại
  e = makeEnv(true);
  await e.run();
  await e.log.handlers['license-activate']({}, 'GOOD');
  await new Promise((r) => setTimeout(r, 1700));
  ok(e.log.relaunch === 0, 'gia hạn trong Setup (đã có license): KHÔNG khởi động lại app');

  // 5) mất hiệu lực lúc đang chạy
  e = makeEnv(true);
  await e.run();
  e.log.watcher.onLost({ message: 'License đã hết hạn' });
  ok(e.log.dialogs.length === 1 && e.log.dialogs[0].detail === 'License đã hết hạn' && e.log.relaunch === 1 && e.log.quit === 1, 'mất hiệu lực lúc đang chạy: báo, khởi động lại về màn hình kích hoạt, thoát qua before-quit (khôi phục DAW ẩn/đóng MIDI)');
  ok(e.api.isDone() === true, 'hết license KHÔNG tự đóng DAW/YouTube của người dùng (tránh mất project chưa lưu)');

  console.log('\nLicenseGate01: ' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error('LỖI TEST:', err); process.exit(2); });
