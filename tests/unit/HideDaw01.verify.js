// HIDE-DAW-01 — Công cụ & Sửa lỗi > Ẩn DAW xuống khay thông báo. PowerShell/Tray/fs đều GIẢ; KHÔNG chạm Windows thật.
const fs = require('fs'), path = require('path');
const WH = require('../../core/integration/WindowHider.js');
const { createDawTrayManager, TRAY_ICON_PNG_BASE64 } = require('../../app/DawTray.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\PreSonus\\Studio Pro 8\\Studio Pro.exe';
const sync = (fn) => new Promise((r) => fn(r));

(async () => {
  // --- validateExePath / chống chèn lệnh
  ok(WH.validateExePath(EXE) && !WH.validateExePath('') && !WH.validateExePath(null) && !WH.validateExePath('C:\\a\\b.txt'), 'validateExePath: chỉ nhận chuỗi .exe');
  ok(!WH.validateExePath("C:\\a'; Remove-Item x; '.exe\n") && !WH.validateExePath('C:\\a"b.exe') && !WH.validateExePath('C:\\a|b.exe'), 'validateExePath: chặn xuống dòng / " / |');
  let scripts = [];
  let r = await sync((cb) => WH.hide("C:\\O'Brien\\daw.exe", cb, (s, c) => { scripts.push(s); c(null, 'H:111,222'); }));
  ok(r.ok && r.state === 'hidden' && r.handles.join() === '111,222', 'hide: đọc đúng danh sách cửa sổ đã ẩn', r);
  ok(/GetFullPath\('C:\\O''Brien\\daw\.exe'\)/.test(scripts[0]) && /-ieq \$target/.test(scripts[0]) && /\[HW\]::Hide/.test(scripts[0]), 'hide: đường dẫn có dấu \' được nhân đôi trong PowerShell; gọi HW.Hide', scripts[0].slice(0, 160));
  ok(/GetWindow\(h, 4\) == IntPtr\.Zero/.test(WH._scriptsForTest.CSHARP) && /ShowWindowAsync\(h, 0\)/.test(WH._scriptsForTest.CSHARP), 'hide: chỉ ẩn cửa sổ KHÔNG có owner, dùng SW_HIDE (0), không phải minimize');
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'NOPROC'))); ok(!r.ok && r.state === 'not_found', 'hide: DAW không chạy -> not_found', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'H:'))); ok(!r.ok && r.reason === 'NO_WINDOW_FOUND', 'hide: chạy nhưng không có cửa sổ -> NO_WINDOW_FOUND', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(new Error('boom'), null))); ok(!r.ok && r.state === 'failed', 'hide: PowerShell lỗi -> failed, không throw', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(new Error('UNSUPPORTED_PLATFORM'), null))); ok(r.reason === 'UNSUPPORTED_PLATFORM', 'hide: không phải Windows -> UNSUPPORTED_PLATFORM', r);
  r = await sync((cb) => WH.hide('notexe', cb, () => { throw new Error('không được chạy'); })); ok(!r.ok && r.reason === 'INVALID_PATH', 'hide: đường dẫn sai -> không chạy PowerShell', r);
  scripts = []; r = await sync((cb) => WH.show(EXE, [111, 222], cb, (s, c) => { scripts.push(s); c(null, 'S:111,222'); }));
  ok(r.ok && r.state === 'visible' && /\[int64\[\]\]\(111,222\)/.test(scripts[0]), 'show: truyền đúng handle đã lưu, hiện lại', r);
  r = await sync((cb) => WH.show(EXE, [], cb, () => { throw new Error('không được chạy'); })); ok(!r.ok && r.reason === 'NO_SAVED_WINDOW', 'show: không có handle lưu -> không chạy PowerShell', r);
  r = await sync((cb) => WH.show(EXE, ['1; calc', 5.5, -1, 77], cb, (s, c) => { scripts.push(s); c(null, 'S:77'); }));
  ok(r.ok && !/calc/.test(scripts[scripts.length - 1]) && /\(77\)/.test(scripts[scripts.length - 1]), 'show: handle không hợp lệ bị loại, không lọt vào script', scripts[scripts.length - 1].slice(-120));
  r = await sync((cb) => WH.show(EXE, [5], cb, (s, c) => c(null, 'S:'))); ok(!r.ok && r.reason === 'WINDOW_GONE', 'show: cửa sổ đã mất -> WINDOW_GONE', r);

  // --- DawTray manager (giả)
  const files = {}; const fakeFs = { existsSync: (f) => f in files, readFileSync: (f) => files[f], writeFileSync: (f, d) => { files[f] = d; }, unlinkSync: (f) => { delete files[f]; } };
  let trays = 0, destroyed = 0, menuLabels = [], clicks = {};
  class FakeTray { constructor() { trays++; this.h = {}; } setToolTip() {} setContextMenu() {} on(e, f) { this.h[e] = f; } destroy() { destroyed++; } }
  const Menu = { buildFromTemplate: (t) => { menuLabels = t.map((x) => x.label); t.forEach((x) => { clicks[x.label] = x.click; }); return {}; } };
  const nativeImage = { createFromBuffer: (b) => ({ size: b.length }) };
  let settings = { selectedDAWPath: EXE }; const calls = { hide: 0, show: 0, showSync: 0 }; let hideRes = { ok: true, state: 'hidden', handles: [9, 8], reason: null }, showRes = { ok: true, state: 'visible', handles: [9, 8], reason: null };
  const hider = { hide: (e, cb) => { calls.hide++; calls.hideExe = e; cb(hideRes); }, show: (e, h, cb) => { calls.show++; calls.showArgs = [e, h]; cb(showRes); }, showSync: () => { calls.showSync++; return { ok: true }; } };
  const mk = () => createDawTrayManager({ Tray: FakeTray, Menu, nativeImage, readSettings: () => settings, stateFile: 'S.json', fs: fakeFs, windowHider: hider, log: () => {} });
  let m = mk();
  ok(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64').slice(0, 4).toString('hex') === '89504e47', 'biểu tượng khay là PNG hợp lệ');
  ok(JSON.stringify(m.status()) === JSON.stringify({ configured: true, exePath: EXE, hidden: false, trayVisible: false }), 'status ban đầu: có cấu hình, đang hiện, chưa có khay', m.status());
  r = await sync((cb) => m.hide(cb)); ok(r.ok && r.state === 'hidden' && trays === 1 && calls.hideExe === EXE, 'hide: ẩn đúng DAW đã cấu hình + tạo khay', r);
  ok(JSON.parse(files['S.json']).handles.join() === '9,8', 'hide: ghi trạng thái ra file để hiện lại được sau khi mở lại Menu');
  ok(menuLabels.join() === 'Hiện DAW,Ẩn DAW,Mở AUTO MENU AI' && typeof clicks['Hiện DAW'] === 'function', 'menu khay có "Hiện DAW", "Ẩn DAW" và (A98) "Mở AUTO MENU AI"', menuLabels);
  r = await sync((cb) => m.hide(cb)); ok(r.ok && calls.hide === 1 && trays === 1, 'hide lần 2: không ẩn lại, không tạo khay thứ hai', r);
  const m2 = mk(); ok(m2.status().hidden === true, 'mở lại Menu: nhớ DAW đang ẩn (đọc từ file)'); m2.restoreTrayIfHidden(); ok(trays === 2, 'mở lại Menu: dựng lại khay khi DAW còn ẩn');
  r = await sync((cb) => m.show(cb)); ok(r.ok && r.state === 'visible' && calls.showArgs[1].join() === '9,8' && destroyed >= 1 && !('S.json' in files), 'show: hiện lại, bỏ khay, xoá file trạng thái', r);
  r = await sync((cb) => m.show(cb)); ok(r.ok && calls.show === 1, 'show khi không ẩn: không làm gì', r);
  settings = {}; m = mk(); r = await sync((cb) => m.hide(cb)); ok(!r.ok && r.state === 'not_configured' && calls.hide === 1, 'chưa chọn DAW -> not_configured, không gọi ẩn', r);
  settings = { startupPaths: { dawExecutable: EXE } }; m = mk(); ok(m.status().configured && m.status().exePath === EXE, 'dự phòng: lấy startupPaths.dawExecutable khi selectedDAWPath trống');
  hideRes = { ok: false, state: 'not_found', handles: [], reason: 'PROCESS_NOT_RUNNING' }; r = await sync((cb) => m.hide(cb)); ok(!r.ok && r.state === 'not_found' && !m.status().hidden && !('S.json' in files), 'DAW chưa mở -> báo, KHÔNG lưu trạng thái ẩn', r);
  hideRes = { ok: true, state: 'hidden', handles: [3], reason: null }; await sync((cb) => m.hide(cb)); showRes = { ok: false, state: 'not_found', handles: [], reason: 'WINDOW_GONE' };
  r = await sync((cb) => m.show(cb)); ok(!r.ok && r.state === 'not_found' && !m.status().hidden && !('S.json' in files), 'DAW đã đóng khi đang ẩn -> xoá trạng thái, khay không treo', r);
  hideRes = { ok: true, state: 'hidden', handles: [4], reason: null }; await sync((cb) => m.hide(cb)); m.restoreOnQuit(); ok(calls.showSync === 1 && !m.status().hidden && !('S.json' in files), 'thoát Menu khi DAW đang ẩn -> tự hiện lại DAW');
  const bad = createDawTrayManager({ Tray: class { constructor() { throw new Error('no tray'); } }, Menu, nativeImage, readSettings: () => settings, stateFile: 'S.json', fs: fakeFs, windowHider: hider, log: () => {} });
  hideRes = { ok: true, state: 'hidden', handles: [5], reason: null }; let threw = false; try { await sync((cb) => bad.hide(cb)); } catch (e) { threw = true; } ok(!threw, 'tạo khay lỗi không làm hỏng việc ẩn DAW');

  // --- nối dây
  const main = rd('app/main.js'), pre = rd('app/preload.js'), html = rd('ui/setup.html'), tools = rd('ui/js/setupTools.js');
  ok(['tools-daw-status', 'tools-daw-hide', 'tools-daw-show'].every((c) => main.includes('ipcMain.handle("' + c + '"')) && /fromSetupWindow\(event\)/.test(main), 'main.js: 3 kênh IPC, chỉ nhận từ cửa sổ Setup');
  ok(['toolsDawStatus', 'toolsDawHide', 'toolsDawShow'].every((n) => pre.includes(n + ': () => ipcRenderer.invoke')), 'preload.js: 3 hàm cầu nối');
  ok(/dawTrayMgr\.restoreOnQuit\(\)/.test(main) && /Tray, Menu, nativeImage/.test(main), 'main.js: khôi phục DAW khi thoát; import Tray/Menu/nativeImage');
  ok(/data-panel="panel-tools"/.test(html) && /id="panel-tools"/.test(html) && /js\/setupTools\.js/.test(html), 'setup.html: có tab + panel + script Công cụ & Sửa lỗi');
  const card = html.slice(html.indexOf('id="panel-tools"'), html.indexOf('id="panel-backup"'));
  ok(/Ẩn DAW xuống khay thông báo/.test(card) && !/Plugin/i.test(card.replace(/<!--[\s\S]*?-->/g, '')), 'panel Công cụ: có thẻ Ẩn DAW riêng; KHÔNG gộp Ẩn Plugin vào');
  ok(/btnToolsHideDaw/.test(tools) && /toolsDawHide/.test(tools) && /toolsDawShow/.test(tools), 'setupTools.js: nút Ẩn/Hiện gọi đúng IPC');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]); ok(new Set(ids).size === ids.length, 'setup.html: không trùng id', ids.filter((x, i) => ids.indexOf(x) !== i));
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
