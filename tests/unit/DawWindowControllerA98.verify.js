// A98 — DAW-WINDOW-CONTROLLER-01: bổ sung kiểm chứng sau thao tác, trạng thái 3 mức, khóa chống chồng lệnh, mục "Mở AUTO MENU AI" trên khay.
// PowerShell/Tray/fs đều GIẢ. KHÔNG chạm Windows thật => KHÔNG chứng minh được việc ẩn/hiện thật của Fender Studio Pro 8 (xem báo cáo: NOT TESTED).
const fs = require('fs'), path = require('path');
const WH = require('../../core/integration/WindowHider.js');
const { createDawTrayManager } = require('../../app/DawTray.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\PreSonus\\Studio Pro 8\\Studio Pro.exe';
const sync = (fn) => new Promise((r) => fn(r));
(async () => {
  console.log('== WindowHider: kiểm chứng sau thao tác ==');
  const C = WH._scriptsForTest.CSHARP;
  ok(/Thread\.Sleep\(100\)/.test(C) && /Settled\(found, false\)/.test(C) && /IsWindowVisible\(h\) == wantVisible\) \? okS : badS/.test(C), 'ẨN: chờ rồi kiểm tra cửa sổ còn hiện không (không tin ShowWindowAsync)');
  ok(/IsHungAppWindow/.test(C), 'phát hiện cửa sổ Not Responding');
  ok(/IsIconic\(h\) \? 9 : 5/.test(C) && /MonitorFromWindow\(h, 0\) == IntPtr\.Zero\) SetWindowPos/.test(C), 'HIỆN: restore nếu đang minimize; đưa về trong màn hình nếu nằm ngoài mọi màn hình');
  ok(/ShowWindowAsync\(h, 0\)/.test(C) && !/ShowWindowAsync\(h, [1-9]\)\s*;\s*if \(first/.test(C.split('public static string Show')[0]), 'ẨN vẫn dùng SW_HIDE bất đồng bộ (không treo khi DAW không phản hồi)');
  let r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'H:11,22;F:')));
  ok(r.ok && r.handles.join() === '11,22', 'ẩn thành công đủ', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'H:11;F:22')));
  ok(r.ok && r.handles.join() === '11' && r.failed.join() === '22', 'ẩn được 1 phần: chỉ lưu cửa sổ đã ẩn thật, ghi nhận cái chưa ẩn', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'H:;F:33')));
  ok(!r.ok && r.reason === 'HIDE_NOT_APPLIED', 'gửi lệnh ẩn nhưng cửa sổ vẫn hiện -> KHÔNG báo thành công', r);
  r = await sync((cb) => WH.hide(EXE, cb, (s, c) => c(null, 'H:;F:33;HUNG')));
  ok(!r.ok && r.reason === 'DAW_NOT_RESPONDING', 'cửa sổ không phản hồi -> báo rõ, không báo thành công', r);
  r = await sync((cb) => WH.show(EXE, [5], cb, (s, c) => c(null, 'S:5;F:')));
  ok(r.ok && r.state === 'visible', 'hiện thành công', r);
  r = await sync((cb) => WH.show(EXE, [5], cb, (s, c) => c(null, 'S:;F:5')));
  ok(!r.ok && r.reason === 'SHOW_NOT_APPLIED', 'gửi lệnh hiện nhưng cửa sổ vẫn ẩn -> không báo thành công', r);
  r = await sync((cb) => WH.show(EXE, [5], cb, (s, c) => c(null, 'S:;F:5;HUNG')));
  ok(!r.ok && r.reason === 'DAW_NOT_RESPONDING', 'hiện khi DAW không phản hồi -> báo rõ', r);
  r = await sync((cb) => WH.show(EXE, [5], cb, (s, c) => c(null, 'S:;F:')));
  ok(!r.ok && r.reason === 'WINDOW_GONE', 'cửa sổ không còn -> WINDOW_GONE', r);
  console.log('== probe: DAW chạy hay chưa ==');
  r = await sync((cb) => WH.probe(EXE, cb, (s, c) => c(null, 'NOPROC'))); ok(r.ok && r.running === false && r.state === 'not_running', 'chưa chạy (đầu ra cũ "NOPROC" vẫn đọc được)', r);
  r = await sync((cb) => WH.probe(EXE, cb, (s, c) => c(null, 'RUN:2'))); ok(r.ok && r.running === true && r.state === 'running', 'đang chạy', r);
  r = await sync((cb) => WH.probe(EXE, cb, (s, c) => c(new Error('TIMEOUT'), null))); ok(!r.ok && r.reason === 'TIMEOUT', 'PowerShell timeout -> báo lỗi, không đoán', r);
  r = await sync((cb) => WH.probe('x', cb, () => { throw new Error('không được chạy'); })); ok(!r.ok && r.reason === 'INVALID_PATH', 'đường dẫn sai -> không chạy PowerShell', r);
  console.log('== DawTray: trạng thái 3 mức, khóa, khay ==');
  const files = {}; const fakeFs = { existsSync: (f) => f in files, readFileSync: (f) => files[f], writeFileSync: (f, d) => { files[f] = d; }, unlinkSync: (f) => { delete files[f]; } };
  let trays = 0, destroyed = 0, clicks = {}, opened = 0;
  class FakeTray { constructor() { trays++; } setToolTip() {} setContextMenu() {} on() {} destroy() { destroyed++; } }
  const Menu = { buildFromTemplate: (t) => { t.forEach((x) => { clicks[x.label] = x.click; }); return {}; } };
  const nativeImage = { createFromBuffer: (b) => ({ size: b.length }) };
  let running = true, probeFail = false; let pending = null; let hideAsync = false;
  const hider = {
    probe: (e, cb) => cb(probeFail ? { ok: false, state: 'unknown', running: null, reason: 'TIMEOUT' } : { ok: true, state: running ? 'running' : 'not_running', running, reason: null }), // A99: probe trả state
    hide: (e, cb) => { const f = () => cb({ ok: true, state: 'hidden', handles: [1], reason: null }); if (hideAsync) pending = f; else f(); },
    show: (e, h, cb) => cb({ ok: true, state: 'visible', handles: h, reason: null }), showSync: () => ({ ok: true })
  };
  const mk = () => createDawTrayManager({ Tray: FakeTray, Menu, nativeImage, readSettings: () => ({ selectedDAWPath: EXE }), stateFile: 'S.json', fs: fakeFs, windowHider: hider, log: () => {}, openMenu: () => { opened++; } });
  let m = mk();
  r = await sync((cb) => m.statusAsync(cb)); ok(r.state === 'visible' && r.running === true && r.hidden === false, 'DAW chạy, đang hiện', r);
  await sync((cb) => m.hide(cb));
  r = await sync((cb) => m.statusAsync(cb)); ok(r.state === 'hidden' && r.running === true && r.trayVisible, 'DAW chạy, đang ẩn (có khay)', r);
  running = false; r = await sync((cb) => m.statusAsync(cb)); ok(r.state === 'hidden' && r.hidden === true, 'A100: lần dò đầu báo không chạy => CHƯA gỡ trạng thái ẩn (cần 2 lần liên tiếp)', r);
  r = await sync((cb) => m.statusAsync(cb));
  ok(r.state === 'not_running' && r.hidden === false && !('S.json' in files) && destroyed >= 1, 'đang ẩn mà DAW đã thoát -> tự xoá trạng thái ẩn + gỡ khay, báo chưa chạy', r);
  r = await sync((cb) => m.statusAsync(cb)); ok(r.state === 'not_running', 'DAW chưa chạy', r);
  running = true; await sync((cb) => m.hide(cb)); probeFail = true;
  r = await sync((cb) => m.statusAsync(cb)); ok(r.state === 'unknown' && r.running === null && r.hidden === true && r.trayVisible === true, 'dò tiến trình lỗi: state = unknown, vẫn nhớ đang ẩn + giữ khay, running = null (không đoán)', r);
  probeFail = false; await sync((cb) => m.show(cb));
  clicks['Mở AUTO MENU AI'](); ok(opened === 1, 'khay có mục "Mở AUTO MENU AI" gọi hàm mở Menu');
  hideAsync = true; let r1 = null, r2 = null;
  m.hide((x) => { r1 = x; }); m.hide((x) => { r2 = x; });
  ok(r2 && r2.state === 'busy' && r1 === null, 'bấm ẩn lần 2 khi lần 1 chưa xong -> busy, không chồng 2 PowerShell', r2);
  pending(); ok(r1 && r1.ok, 'lần 1 xong bình thường', r1);
  hideAsync = false; await sync((cb) => m.show(cb));
  const t0 = trays; let allOk = true;
  for (let i = 0; i < 20; i++) { const a = await sync((cb) => m.hide(cb)); const b = await sync((cb) => m.show(cb)); if (!a.ok || !b.ok) allOk = false; }
  ok(allOk && trays - t0 === 20 && !('S.json' in files) && !m.status().hidden, 'ẩn/hiện 20 vòng (mô phỏng): đều OK, mỗi lần 1 khay, cuối cùng sạch trạng thái');
  console.log('== nối dây ==');
  const main = rd('app/main.js'), tools = rd('ui/js/setupTools.js');
  ok(/getDawTray\(\)\.statusAsync\(resolve\)/.test(main) && /openMenu: \(\) =>/.test(main), 'main.js: tools-daw-status dùng statusAsync; truyền openMenu');
  ok(/DAW CHƯA CHẠY/.test(tools) && /state === "not_running"/.test(tools), 'setupTools.js: hiện 3 trạng thái thật');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
