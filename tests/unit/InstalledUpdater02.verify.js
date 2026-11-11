// APP-UPDATE-02 / PACKAGE-01 — bộ cập nhật cho bản cài .exe (electron-updater giả lập, không chạm mạng) + đường dẫn ghi dữ liệu.
const fs = require('fs'), path = require('path'), os = require('os');
const { createInstalledUpdater, compareVersions } = require('../../app/InstalledUpdater.js');
const RuntimePaths = require('../../core/shared/RuntimePaths.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

function fakeUpdater(over) {
  const calls = [];
  const u = Object.assign({
    calls,
    checkForUpdates: async () => { calls.push('check'); return { isUpdateAvailable: true, updateInfo: { version: '1.0.2' } }; },
    downloadUpdate: async () => { calls.push('download'); },
    quitAndInstall: (silent, run) => { calls.push('install:' + silent + ':' + run); },
  }, over || {});
  return u;
}
function fakeApp(version) {
  const log = [];
  return { log, getVersion: () => version, relaunch: () => log.push('relaunch'), quit: () => log.push('quit') };
}

(async () => {
  // ---- so sánh version
  ok(compareVersions('1.0.2', '1.0.1') === 1, 'compareVersions: 1.0.2 > 1.0.1');
  ok(compareVersions('1.0.1', '1.0.1') === 0, 'compareVersions: bằng nhau');
  ok(compareVersions('1.0.0', '1.0.1') === -1, 'compareVersions: cũ hơn');
  ok(compareVersions('2.0.0', '1.9.9') === 1, 'compareVersions: major');
  ok(compareVersions('1.0.1', '1.0.1-beta.1') === 1, 'compareVersions: chính thức > tiền phát hành');
  ok(compareVersions('abc', '1.0.1') === null, 'compareVersions: sai định dạng -> null');

  // ---- cấu hình an toàn: không tự tải/cài ngầm
  const fu = fakeUpdater(); const A = fakeApp('1.0.1');
  const U = createInstalledUpdater({ autoUpdater: fu, app: A });
  ok(fu.autoDownload === false && fu.autoInstallOnAppQuit === false && fu.allowDowngrade === false && fu.allowPrerelease === false, 'autoDownload/autoInstallOnAppQuit/downgrade/prerelease đều tắt', fu);

  // ---- getVersion
  const v = await U.getVersion();
  ok(v.ok && v.version === '1.0.1' && v.installed === true && v.isGit === false, 'getVersion: version + installed', v);

  // ---- check: có bản mới
  let c = await U.check();
  ok(c.ok && c.available === true && c.behind === 1 && c.latest === '1.0.2' && c.diverged === false, 'check: có bản mới 1.0.2', c);

  // ---- apply: tải về, CHƯA cài; relaunch mới cài
  let ap = await U.apply();
  ok(ap.ok && ap.updated === true && ap.needInstall === false && ap.commit === '1.0.2', 'apply: tải xong -> updated, không cần npm install', ap);
  ok(fu.calls.includes('download') && !fu.calls.some((x) => x.startsWith('install')), 'apply: chỉ tải, chưa cài');
  const rl = U.relaunch();
  ok(rl.ok && fu.calls.includes('install:true:true') && A.log.length === 0, 'relaunch: quitAndInstall(silent, forceRun), không gọi app.relaunch', { rl, calls: fu.calls, log: A.log });

  // ---- check: đã mới nhất
  const U2 = createInstalledUpdater({ autoUpdater: fakeUpdater({ checkForUpdates: async () => ({ isUpdateAvailable: false, updateInfo: { version: '1.0.1' } }) }), app: fakeApp('1.0.1') });
  c = await U2.check(); ok(c.ok && c.available === false && c.behind === 0 && c.latest === '1.0.1', 'check: đã là bản mới nhất', c);
  ap = await U2.apply(); ok(ap.ok && ap.updated === false, 'apply: khi đã mới nhất -> updated=false', ap);

  // ---- check: không có cờ isUpdateAvailable -> tự so version
  const U3 = createInstalledUpdater({ autoUpdater: fakeUpdater({ checkForUpdates: async () => ({ updateInfo: { version: '1.0.0' } }) }), app: fakeApp('1.0.1') });
  c = await U3.check(); ok(c.ok && c.available === false, 'check: bản trên GitHub cũ hơn -> không báo có bản mới', c);

  // ---- lỗi mạng / chưa có Release
  const U4 = createInstalledUpdater({ autoUpdater: fakeUpdater({ checkForUpdates: async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED\nstack...'); } }), app: fakeApp('1.0.1') });
  c = await U4.check(); ok(c.ok === false && c.reason === 'CHECK_FAILED' && /ERR_INTERNET_DISCONNECTED/.test(c.message) && !/stack/.test(c.message), 'check: mất mạng -> báo lỗi gọn, không crash', c);
  const U5 = createInstalledUpdater({ autoUpdater: fakeUpdater({ downloadUpdate: async () => { throw new Error('download failed'); } }), app: fakeApp('1.0.1') });
  await U5.check(); ap = await U5.apply();
  ok(ap.ok === false && ap.reason === 'DOWNLOAD_FAILED', 'apply: tải lỗi -> báo lỗi', ap);
  const rl2 = U5.relaunch(); ok(rl2.ok && !rl2.installing, 'relaunch khi chưa tải xong -> chỉ khởi động lại bình thường (không cài)', rl2);

  // ---- chống chạy chồng
  let release; const gate = new Promise((r) => { release = r; });
  const U6 = createInstalledUpdater({ autoUpdater: fakeUpdater({ checkForUpdates: async () => { await gate; return { isUpdateAvailable: true, updateInfo: { version: '1.0.2' } }; } }), app: fakeApp('1.0.1') });
  const p1 = U6.check(); const p2 = await U6.check();
  ok(p2.ok === false && p2.reason === 'BUSY', 'check chồng -> BUSY', p2); release(); await p1;

  // ---- RuntimePaths
  const root = path.join(os.tmpdir(), 'rp-root');
  ok(RuntimePaths.writableDir('logs', { app: null, projectRoot: root }) === path.join(root, 'logs'), 'RuntimePaths: chạy từ mã nguồn -> <gốc project>/logs (như cũ)');
  ok(RuntimePaths.writableDir('data', { app: { isPackaged: false, getPath: () => 'X' }, projectRoot: root }) === path.join(root, 'data'), 'RuntimePaths: isPackaged=false -> như cũ');
  ok(RuntimePaths.writableDir('logs', { app: { isPackaged: true, getPath: (k) => (k === 'userData' ? path.join(os.tmpdir(), 'ud') : '') } }) === path.join(os.tmpdir(), 'ud', 'logs'), 'RuntimePaths: bản cài -> userData/logs');
  ok(RuntimePaths.isPackaged(null) === false && RuntimePaths.isPackaged({ isPackaged: true }) === true, 'RuntimePaths.isPackaged');
  ok(RuntimePaths.writableDir('logs') === path.join(RuntimePaths.PROJECT_ROOT, 'logs'), 'RuntimePaths: node thuần (không Electron) -> thư mục gốc project');

  // ---- nối dây thật (main.js / package.json / UI không đổi cấu trúc)
  const main = rd('app/main.js'), pkg = JSON.parse(rd('package.json')), setupHtml = rd('ui/setup.html');
  ok(/app\.isPackaged[\s\S]{0,200}require\("electron-updater"\)[\s\S]{0,200}createInstalledUpdater/.test(main) && main.includes('createAppUpdater'), 'main.js: bản cài dùng electron-updater, máy dev vẫn dùng git');
  ok(!/app\.relaunch\(/.test(main), 'main.js vẫn KHÔNG gọi app.relaunch trực tiếp (A104)');
  ok(pkg.dependencies['electron-updater'] && pkg.devDependencies['electron-builder'], 'package.json: có electron-updater (runtime) + electron-builder (dev)');
  ok(pkg.scripts.dist && pkg.scripts.release && pkg.build && pkg.build.asar === false, 'package.json: có lệnh dist/release, asar=false (AHK/PowerShell cần file thật)');
  ok(pkg.build.npmRebuild === false, 'package.json: npmRebuild=false (MIDI dùng bản N-API dựng sẵn, máy build không cần Visual Studio)');
  ok(/^dist\/?$/m.test(rd('.gitignore')), '.gitignore có dist/ (sync.bat dùng git add . — tránh đẩy file cài 145MB lên GitHub)');
  // AUDIO-AUTOSTART-01 — Menu phải tự nghe âm thanh khi mở, không chờ người dùng bấm.
  ok(/autoplayPolicy:\s*"no-user-gesture-required"/.test(main), 'main.js: mainWin có autoplayPolicy no-user-gesture-required');
  ok(/did-finish-load[\s\S]{0,400}executeJavaScript\("document\.body && document\.body\.click\(\)",\s*true\)/.test(main), 'main.js: tự click đầu tiên (userGesture=true) sau khi trang tải xong');
  ok(/document\.body\.addEventListener\('click'[\s\S]{0,120}startAudioMonitor\(\)[\s\S]{0,40}\{ once: true \}/.test(rd('ui/js/renderer.js')), 'renderer.js: listener click đầu tiên -> startAudioMonitor() vẫn nguyên (không sửa)');
  const pub = (pkg.build.publish || [])[0] || {};
  ok(pub.provider === 'github' && pub.owner === 'anhtuan391989' && /^AUTO_MENU_AI$/i.test(pub.repo), 'package.json: publish -> GitHub Releases của repo', pub);
  const inc = pkg.build.files.join('|');
  for (const need of ['app/**/*', 'core/**/*', 'ui/**/*', 'ahk/**/*', 'data/songs.json']) ok(inc.includes(need), 'build.files có ' + need);
  // d1Loader.js đọc docs/d1/* lúc chạy (đường dẫn dựng bằng path.join(__dirname,'..','..','docs','d1')) — thiếu là app không mở được.
  for (const f of ['midi-mapping.xml', 'midi-mapping.xsd', 'semanticValidate.js']) {
    ok(inc.includes('docs/d1/' + f) && fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'd1', f)), 'build.files có docs/d1/' + f + ' (d1Loader cần khi chạy)');
  }
  ok(fs.existsSync(path.join(__dirname, '..', '..', 'app', 'license-public-key.txt')), 'app/license-public-key.txt có trong thư mục app (được đóng gói)');
  for (const id of ['appVersionText', 'btnCheckUpdate', 'btnApplyUpdate', 'btnRelaunchApp', 'appUpdateMessage']) ok(setupHtml.includes('id="' + id + '"'), 'UI giữ nguyên id ' + id);

  console.log('\nInstalledUpdater02: ' + pass + ' đạt, ' + fail + ' lỗi'); process.exit(fail ? 1 : 0);
})();
