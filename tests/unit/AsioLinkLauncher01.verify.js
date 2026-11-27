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
  // ---- ASIO-LINK-02: bấm icon ở khay (PowerShell GIẢ) ----
  function tdeps(psOutputs, o) {
    o = o || {}; const log = []; let i = 0;
    const d = deps(o); d.pollMs = 0; d.pollTries = 3;
    d.execFile = (cmd, args, opt, cb) => {
      log.push([cmd, args]);
      if (cmd === 'powershell.exe') { const out = psOutputs[Math.min(i++, psOutputs.length - 1)]; setImmediate(() => cb(null, out, '')); }
      else setImmediate(() => cb(o.killErr || null, '', ''));
    };
    d.tlog = log; return d;
  }
  let t = tdeps(['OK:invoke:ASIO Link Pro']); r = await L.showPanel(t);
  ok(r.ok && t.tlog.length === 1 && t.tlog[0][0] === 'powershell.exe' && t.tlog[0][1].includes('-EncodedCommand') && t.tlog[0][1].includes('-NonInteractive'), 'Bấm icon khay: gọi PowerShell không qua shell, dùng -EncodedCommand');
  const dec = Buffer.from(t.tlog[0][1][t.tlog[0][1].indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
  ok(dec === L.TRAY_PS && /Get-Process explorer/.test(dec) && /InvokePattern/.test(dec) && /\[AmWin\]::Click\(/.test(dec) && /ASIO\\s\*Link/.test(dec), 'Script giải mã đúng: quét cửa sổ của explorer (thanh tác vụ + hộp ẩn), bấm chuột thật rồi Invoke dự phòng');
  ok(L.parseTrayOutput('OK:click:ASIO Link Pro').how === 'click' && L.parseTrayOutput('NOTFOUND').reason === 'tray-not-found' && L.parseTrayOutput('ERR:boom').reason === 'tray-error' && L.parseTrayOutput('').reason === 'tray-unknown', 'Đọc kết quả PowerShell: OK / không thấy / lỗi / rỗng');
  t = tdeps(['NOTFOUND']); r = await L.showPanel(t); ok(!r.ok && r.reason === 'tray-not-found' && /Không thấy bảng ASIO Link Pro/.test(r.message), 'Không thấy bảng: báo rõ ràng');
  // ASIO-LINK-03: CHỈ bấm icon bảng XANH (tooltip "...2.4.2.0 - Studio Pro.exe"), không bấm icon Tool tím, không chạy chương trình
  ok(/\$want=/.test(L.TRAY_PS) && /\$nm -match \$pat\) -and \(\$nm -match \$want/.test(L.TRAY_PS) && !/Link\\s\*Pro\|/.test(L.TRAY_PS) && !/O\\s\*Deus/.test(L.TRAY_PS), 'Script: tên phải có "ASIO Link" VÀ dạng "<số phiên bản> - <tên>.exe" (loại icon Tool tím); bỏ kiểu khớp rộng cũ');
  const rx = new RegExp(/\d+(\.\d+){2,}\s*-\s*\S.*\.exe/.source), rp = /ASIO\s*Link/;
  const green = 'O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe';
  ok(rp.test(green) && rx.test(green), 'Tên icon xanh trong ảnh (tooltip thật) KHỚP');
  for (const other of ['O Deus ASIO Link Pro Tool', 'ASIO Link Pro', 'O Deus ASIO Link Pro Tool - 1 running window', 'UA Console', 'Bluetooth']) ok(!(rp.test(other) && rx.test(other)), 'Không khớp nhầm: ' + other);
  t = tdeps(['NOTFOUND:UA Console | Bluetooth | O Deus ASIO Link Pro Tool']); r = await L.showPanel(t);
  ok(!r.ok && r.reason === 'tray-not-found' && /Studio One đang chạy/.test(r.message) && /Bluetooth/.test(r.message), 'Không thấy bảng xanh: báo cần Studio One + liệt kê tên các nút thấy được để dò');
  ok(L.parseTrayOutput('NOTFOUND:a | b').detail === 'a | b' && L.parseTrayOutput('NOTFOUND').detail === '', 'Đọc danh sách tên từ NOTFOUND');
  ok(typeof L.ensureAndShow === 'undefined', 'Đã bỏ nhánh "chạy chương trình rồi bấm" (chạy Tool không tạo icon xanh)');
  // ASIO-LINK-04: CÁCH 1 = tìm thẳng CỬA SỔ bảng xanh (kể cả đang ẩn xuống khay) rồi bắt hiện; icon khay chỉ là dự phòng
  const ps = L.TRAY_PS, csLine = ps.split('\n').find((x) => x.startsWith('Add-Type -TypeDefinition \'using System;using System.Text;'));
  const cs = csLine ? csLine.slice(csLine.indexOf("'") + 1, csLine.lastIndexOf("'")) : '';
  ok(cs.length > 200 && !cs.includes("'") && (cs.match(/\{/g) || []).length === (cs.match(/\}/g) || []).length && (cs.match(/\(/g) || []).length === (cs.match(/\)/g) || []).length, 'C# nhúng trong PowerShell: không có dấu nháy đơn, ngoặc {} () cân bằng');
  ok(ps.indexOf('[AmWin]::Probe(') > 0 && ps.indexOf('[AmWin]::Probe(') < ps.indexOf('function Find-Icon'), 'Thứ tự: dò cửa sổ bảng trước, rồi mới tới tìm/bấm icon khay');
  ok(!/ShowWindow\(hh,5\)/.test(cs) && /ShowWindow\(hh,9\)/.test(cs) && /SetForegroundWindow\(hh\)/.test(cs) && /IsIconic/.test(cs) && /EnumWindows/.test(cs), 'C#: KHÔNG ép hiện cửa sổ đang ẩn (gây cửa sổ trắng xóa), chỉ khôi phục nếu thu nhỏ + đưa lên trước');
  ok(/OutputEncoding=\[System\.Text\.Encoding\]::UTF8/.test(ps), 'Ép PowerShell xuất UTF-8 (hết chữ tiếng Việt lộn xộn)');
  t = tdeps(['OK:window:1|hien|khongthunho|0,0,800,600|X|O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe']); r = await L.showPanel(t);
  ok(r.ok && r.how === 'window' && /đang hiện sẵn — đã đưa lên trước/.test(r.message), 'Bảng đang hiện sẵn: chỉ đưa lên trước, KHÔNG bấm icon (bấm sẽ làm nó ẩn)');
  ok(/\$f\[1\] -eq 'hien'/.test(ps) && /\$f\[2\] -eq 'khongthunho'/.test(ps) && /-ge 200/.test(ps) && /-ge 100/.test(ps), 'Chỉ coi là "đang hiện sẵn" khi cửa sổ hiện, không thu nhỏ và đủ lớn (>= 200x100)');
  ok(/SetWindowPos\(hh,\(IntPtr\)\(-1\)/.test(cs) && /SetWindowPos\(hh,\(IntPtr\)\(-2\)/.test(cs) && /keybd_event\(0x12/.test(cs) && /BringWindowToTop/.test(cs) && !/MoveWindow/.test(cs), 'Front: topmost rồi bỏ topmost + mẹo phím Alt; không kéo/ép cửa sổ');
  ok(/long a=Area\(x\); if\(a>ba\)/.test(cs), 'Nhiều cửa sổ trùng tên: chọn cái có diện tích lớn nhất');
  ok(/Key\(0x5B,\$false\); \[AmWin\]::Key\(0x42/.test(ps) && /if\(\$exp -contains \$fp\)\{ \[AmWin\]::Key\(0x0D/.test(ps), 'Mở hộp biểu tượng ẩn bằng Win+B; CHỈ nhấn Enter khi tiêu điểm đang ở explorer (không gõ nhầm vào app khác)');
  ok(/SetCursorPos\(old\.X,old\.Y\)/.test(cs) && /mouse_event\(2/.test(cs) && /mouse_event\(4/.test(cs), 'Click thật: nhấn xuống/lên rồi trả con trỏ về chỗ cũ');
  ok(/\[bảng: /.test(ps) && /tiêu điểm sau Win\+B/.test(ps), 'Khi không thấy: báo tình trạng cửa sổ bảng + kết quả Win+B để dò');
  // Chốt chặn lỗi gạch chéo bị nhân đôi: lấy ĐÚNG biểu thức nằm trong script PowerShell rồi thử với tên thật
  const pl = ps.split('\n').find((x) => x.startsWith('$pat=')), g = (n) => new RegExp(pl.match(new RegExp("\\$" + n + "='([^']*)'"))[1]);
  const reWin = g('reWin'), rPat = g('pat'), rWant = g('want');
  ok(reWin.test('O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe') && rPat.test('O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe') && rWant.test('O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe'), 'Biểu thức TRONG script khớp tiêu đề/tooltip thật của bảng xanh (không bị nhân đôi dấu \\)');
  ok(['O Deus ASIO Link Pro Tool', 'ASIO Link Pro', 'UA Console', 'Bluetooth', 'O Deus ASIO Link Pro Tool - 1 running window'].every((o) => !reWin.test(o) && !(rPat.test(o) && rWant.test(o))), 'Biểu thức TRONG script không khớp nhầm icon Tool tím / UA / Bluetooth');
  t = tdeps(['ERR:Access denied']); r = await L.showPanel(t); ok(!r.ok && r.reason === 'tray-error' && !t.log.some((x) => x[0] === 'spawn'), 'Lỗi PowerShell thật: báo lỗi, không chạy gì thêm');
  t = tdeps(['NOTFOUND', 'OK:invoke:ASIO Link Pro']); r = await L.restart(P, Object.assign(t, { showAfter: true }));
  ok(r.ok && r.panel === true && t.tlog[0][0] === 'taskkill' && /\/IM ASIOLinkPro\.exe/.test(t.tlog[0][1].join(' ')), 'Khởi động lại + mở bảng: đóng -> chạy lại -> bấm icon');
  t = tdeps(['NOTFOUND']); t.platform = 'linux'; r = await L.showPanel(t); ok(!r.ok && r.reason === 'not-windows' && t.tlog.length === 0, 'Không phải Windows: không chạy PowerShell');
  // wiring tĩnh
  const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const main = rd('app/main.js'), pre = rd('app/preload.js'), st = rd('ui/js/setupTools.js');
  ok(/ipcMain\.handle\("asio-link-open"/.test(main) && /ipcMain\.handle\("asio-link-restart"/.test(main) && /fromSetupWindow\(event\)\) return Promise\.resolve\(DENIED\)/.test(main), 'main.js: 2 kênh IPC, chỉ cửa sổ Setup được gọi');
  ok(/st\.asioLinkPath/.test(main) && !/asio-link-(open|restart)", \(event, /.test(main), 'main.js: đường dẫn đọc từ file cài đặt, KHÔNG nhận từ renderer');
  ok(/asioLinkOpen:/.test(pre) && /asioLinkRestart:/.test(pre) && /asioLinkShow:/.test(pre), 'preload.js: bắc cầu 3 kênh');
  ok(/ipcMain\.handle\("asio-link-show"/.test(main) && /AsioLinkLauncher\.showPanel\(\)/.test(main) && /showAfter: true/.test(main), 'main.js: kênh asio-link-show + restart tự mở bảng');
  ok(/id="asioLinkShow"/.test(st) && /run\("asioLinkShow"/.test(st), 'Setup: có nút Mở bảng ASIO Link Pro (icon khay)');
  ok(/getElementById\("panel-audio"\)/.test(st) && /setSetting\("asioLinkPath"/.test(st), 'Setup: thẻ nằm ở mục Audio, lưu setting asioLinkPath');
  const { execSync } = require('child_process'); let h = ''; try { h = execSync('git diff --name-only -- ui/setup.html ui/index.html ui/css', { cwd: ROOT }).toString().trim(); } catch (e) { /* */ }
  ok(h === '', 'KHÔNG sửa HTML/CSS');
  console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
