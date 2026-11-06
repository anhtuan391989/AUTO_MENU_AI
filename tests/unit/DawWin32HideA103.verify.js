// A103 — DAW-WIN32-HIDE-FAILURE-DIAGNOSTIC-01.
// PHÂN LOẠI TEST (trung thực):
//   [CẤU TRÚC C#]  kiểm văn bản/cấu trúc mã C# (cân ngoặc, khai báo extern không trùng, định danh đã khai báo). KHÔNG phải biên dịch — sandbox không có compiler C#/PowerShell.
//   [MÔ HÌNH]      đưa chuỗi kết quả giả (theo định dạng C# mới) vào JS WindowHider/DawTray thật để kiểm phân loại. KHÔNG chứng minh Win32 hoạt động.
//   [WINDOWS THẬT] KHÔNG CÓ trong file này.
const fs = require('fs'), path = require('path');
const WH = require('../../core/integration/WindowHider.js');
const { createDawTrayManager } = require('../../app/DawTray.js');
const C = WH._scriptsForTest.CSHARP;
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\Fender\\Studio Pro 8\\Studio Pro.exe';
const call = (fn) => new Promise((r) => fn(r));
const SRC = fs.readFileSync(path.join(__dirname, '../../core/integration/WindowHider.js'), 'utf8');

(async () => {
console.log('== A. [CẤU TRÚC C#] ==');
const bal = (s, o, c) => (s.split(o).length - 1) - (s.split(c).length - 1);
ok(bal(C, '{', '}') === 0 && bal(C, '(', ')') === 0 && bal(C, '[', ']') === 0, 'ngoặc {} () [] cân bằng', { b: bal(C, '{', '}'), p: bal(C, '(', ')'), s: bal(C, '[', ']') });
const externs = [...C.matchAll(/static extern \w+(?:<[^>]+>)? (\w+)\(/g)].map((m) => m[1]);
ok(externs.length === new Set(externs).size, 'không khai báo extern trùng tên', externs.filter((x, i) => externs.indexOf(x) !== i));
for (const n of ['IsWindow', 'IsWindowVisible', 'IsHungAppWindow', 'ShowWindowAsync', 'OpenProcess', 'CloseHandle', 'OpenProcessToken', 'GetTokenInformation', 'GetSidSubAuthorityCount', 'GetSidSubAuthority', 'GetWindowThreadProcessId', 'EnumWindows']) ok(externs.includes(n), 'có khai báo extern ' + n);
const calls = [...C.matchAll(/\b(IsWindow|IsWindowVisible|IsHungAppWindow|ShowWindowAsync|OpenProcess|CloseHandle|OpenProcessToken|GetTokenInformation|GetSidSubAuthorityCount|GetSidSubAuthority)\(/g)].map((m) => m[1]);
ok(calls.every((n) => externs.includes(n)), 'mọi hàm Win32 được gọi đều đã khai báo');
ok(/public static string Hide\(uint\[\] pids, uint menuPid\)/.test(C) && SRC.includes("[HW]::Hide([uint32[]]$pids, [uint32]'"), 'chữ ký C# Hide(pids, menuPid) khớp lời gọi PowerShell trong mã JS');
console.log('== B. [CẤU TRÚC C#] cơ chế ẩn KHÔNG đổi, chẩn đoán đủ 10 mục ==');
const hideBody = C.slice(C.indexOf('public static string Hide('), C.indexOf('static string Bring('));
ok((hideBody.match(/ShowWindowAsync\(h, 0\)/g) || []).length === 1, 'vẫn chỉ gọi ShowWindowAsync(h, 0) một lần cho mỗi HWND (không đổi API ẩn)');
ok(/for \(int i = 0; i < 20; i\+\+\) \{ System\.Threading\.Thread\.Sleep\(100\);.*Settled\(found, false\)\) break; \}/.test(hideBody), 'vẫn polling tối đa 20×100 ms, dừng khi Settled');
ok(!/SetWindowPos|CloseWindow|PostMessage|SendMessage|WM_CLOSE|ShowWindow\(/.test(hideBody), 'không thêm API ẩn/đóng khác');
ok(/\(IsWindow\(h\) \? 1 : 0\) \+ "\/" \+ \(IsWindowVisible\(h\) \? 1 : 0\) \+ "\/" \+ \(IsHungAppWindow\(h\) \? 1 : 0\)/.test(hideBody), '(1-4) HWND, PID, IsWindow, IsWindowVisible, IsHungAppWindow TRƯỚC thao tác');
ok(/r = ShowWindowAsync\(h, 0\) \? "1" : "0"/.test(hideBody), '(5) ghi lại giá trị trả về thực tế của ShowWindowAsync');
ok(/post\.Add\(\(IsWindow\(h\) \? 1 : 0\)/.test(hideBody), '(6) IsWindow/IsWindowVisible NGAY SAU khi gọi');
ok(/T\.Append\(sw\.ElapsedMilliseconds/.test(hideBody) && /St\(h\)/.test(hideBody), '(7) trạng thái sau từng lần polling kèm thời gian (ms)');
ok(/IsWindow\(found\[i\]\) \? 1 : 0\) \+ "\/" \+ \(IsWindowVisible\(found\[i\]\) \? 1 : 0\)/.test(hideBody), '(8) trạng thái cuối cùng');
ok(/static string St\(IntPtr h\) \{ return !IsWindow\(h\) \? "X"/.test(C), '(9) tách "X" (HWND không còn hợp lệ) khỏi V/H');
ok(/catch \(Exception e\)/.test(hideBody) && /";E:"/.test(hideBody), '(10) ngoại lệ C# được ghi vào E:');
ok(!/GetLastWin32Error|GetLastError/.test(hideBody), 'KHÔNG dùng GetLastError để kết luận cho ShowWindowAsync');
ok(/GetLastWin32Error/.test(C.slice(C.indexOf('public static string Priv('), C.indexOf('public static string Hide('))), 'GetLastWin32Error chỉ dùng cho truy vấn quyền (OpenProcess/Token), nơi API có đặt mã lỗi');
const priv = C.slice(C.indexOf('public static string Priv('), C.indexOf('public static string Hide('));
ok(/GetTokenInformation\(tok, 20, b, 4/.test(priv) && /GetTokenInformation\(tok, 25,/.test(priv) && /OpenProcessToken\(hp, 0x8/.test(priv) && /OpenProcess\(0x1000/.test(priv), 'Priv: TokenElevation(20) + TokenIntegrityLevel(25), quyền tối thiểu PROCESS_QUERY_LIMITED_INFORMATION/TOKEN_QUERY');
ok(!/UIPI/i.test(C) && !/UIPI/.test(SRC.slice(SRC.indexOf('function classifyHide'), SRC.indexOf('function hide('))), 'mã phân loại không tự suy diễn UIPI');

console.log('== C. [MÔ HÌNH] phân loại theo bằng chứng ==');
const K = WH.classifyHideWindow;
//             hwnd/pid/w0/v0/hung0/ret/w1/v1/wf/vf
ok(K('13894692/19308/1/1/0/1/1/1/1/1').code === 'HIDE_REQUEST_STARTED_BUT_VISIBLE', '5) API trả khác 0 nhưng cửa sổ vẫn hiện (đúng ca log thật 13894692) -> HIDE_REQUEST_STARTED_BUT_VISIBLE');
ok(K('1/2/1/1/0/1/1/0/1/0').code === 'HIDE_CONFIRMED', '1) HWND hợp lệ, đang hiện, ẩn xong -> HIDE_CONFIRMED');
ok(K('1/2/0/0/0/0/0/0/0/0').code === 'HWND_INVALID' && /TRƯỚC/.test(K('1/2/0/0/0/0/0/0/0/0').detail), '2) HWND mất hiệu lực trước khi gọi -> HWND_INVALID');
ok(K('1/2/1/1/0/1/1/1/0/0').code === 'HWND_INVALID' && /SAU/.test(K('1/2/1/1/0/1/1/1/0/0').detail), '2b) HWND biến mất SAU khi gọi -> HWND_INVALID (phân biệt với còn hợp lệ nhưng không ẩn)');
ok(K('1/2/1/0/0/1/1/0/1/0').code === 'WINDOW_ALREADY_HIDDEN', '3) cửa sổ đã ẩn từ trước -> WINDOW_ALREADY_HIDDEN');
ok(K('1/2/1/1/1/1/1/1/1/1').code === 'WINDOW_HUNG', '4) cửa sổ treo và vẫn hiện -> WINDOW_HUNG');
ok(K('1/2/1/1/0/0/1/1/1/1').code === 'SHOW_REQUEST_NOT_STARTED', '6) ShowWindowAsync trả 0 -> SHOW_REQUEST_NOT_STARTED');
ok(K('1/2/1/1/0/E/1/1/1/1').code === 'DIAGNOSTIC_QUERY_FAILED' && K('1/2/1').code === 'DIAGNOSTIC_QUERY_FAILED' && K('1/2/1/x/0/1/1/1/1/1').code === 'DIAGNOSTIC_QUERY_FAILED', '8) dữ liệu thiếu/không đọc được -> DIAGNOSTIC_QUERY_FAILED');
ok(WH.classifyHide({ x: '', p: '', t: '' }).code === 'UNKNOWN' && WH.classifyHide({ x: '', p: '', t: '' }).missing.length === 1, 'không có dữ liệu X: -> UNKNOWN + ghi rõ dữ liệu thiếu');
ok(WH.classifyHide({ x: '1/2/1/1/0/1/1/1/1/1', p: '', t: '', e: 'CALL:EntryPointNotFoundException' }).code === 'DIAGNOSTIC_QUERY_FAILED', 'ngoại lệ C# -> DIAGNOSTIC_QUERY_FAILED');
ok(WH.HIDE_CODES.includes('HWND_INVALID') && WH.HIDE_CODES.length === 8, 'đủ các mã yêu cầu + UNKNOWN');

console.log('== D. [MÔ HÌNH] quyền Menu ↔ FSP8 ==');
const mkOut = (priv) => 'H:;F:13894692;A:13894692;D:13894692/19308/V/Studio Pro - 22102026*;X:13894692/19308/1/1/0/1/1/1/1/1;T:2:V@104:V@206:V@2010:V@;P:' + priv;
const runnerWith = (priv) => (s, cb) => { if (/\[HW\]::Hide/.test(s)) cb(null, mkOut(priv)); else cb(null, 'INFO|ST=OK|R=19308|U=|O=|SRC=CIM|T=19308:OK via API|ERR='); };
let r = await call((cb) => WH.hide(EXE, cb, runnerWith('25896/IL=0x2000/ELEV=0~19308/IL=0x2000/ELEV=0')));
ok(!r.ok && r.reason === 'HIDE_NOT_APPLIED' && r.classification === 'HIDE_REQUEST_STARTED_BUT_VISIBLE' && r.privCompare === 'SAME' && /CLASS=HIDE_REQUEST_STARTED_BUT_VISIBLE/.test(r.diag) && /T=2:V@104:V/.test(r.diag), '7a) cùng Integrity/Elevation -> SAME; diag có CLASS + dòng thời gian', r);
r = await call((cb) => WH.hide(EXE, cb, runnerWith('25896/IL=0x2000/ELEV=0~19308/IL=0x3000/ELEV=1')));
ok(r.privCompare === 'DIFFERENT' && r.priv[0].il === '0x2000' && r.priv[1].il === '0x3000' && r.priv[1].elev === '1' && r.reason === 'HIDE_NOT_APPLIED', '7b) khác Integrity/Elevation -> DIFFERENT (chỉ GHI NHẬN; reason vẫn HIDE_NOT_APPLIED, không kết luận nguyên nhân)', r.priv);
r = await call((cb) => WH.hide(EXE, cb, runnerWith('25896/IL=0x2000/ELEV=0~19308/OpenProcessTokenERR5')));
ok(r.privCompare === 'UNKNOWN' && r.priv[1].ok === false && /OpenProcessTokenERR5/.test(r.diag), '8) không đọc được quyền FSP8 -> UNKNOWN + ghi nguyên lỗi truy vấn', r.priv);
r = await call((cb) => WH.hide(EXE, cb, (s, cb2) => { if (/\[HW\]::Hide/.test(s)) cb2(null, 'H:13894692;F:;A:13894692;D:x;X:13894692/19308/1/1/0/1/1/0/1/0;T:3:H@;P:25896/IL=0x2000/ELEV=0~19308/IL=0x2000/ELEV=0'); else cb2(null, 'INFO|ST=OK|R=19308|U=|O=|SRC=CIM|T=19308:OK via API|ERR='); }));
ok(r.ok && r.state === 'hidden' && r.classification === 'HIDE_CONFIRMED' && r.handles[0] === 13894692, 'thành công -> HIDE_CONFIRMED, vẫn lưu handles như cũ', r);

console.log('== E. [MÔ HÌNH] DawTray hiện mã chẩn đoán + ghi log ==');
{
    const files = {}; const fakeFs = { existsSync: (f) => f in files, readFileSync: (f) => files[f], writeFileSync: (f, d) => { files[f] = d; }, appendFileSync: (f, d) => { files[f] = (files[f] || '') + d; }, statSync: (f) => ({ size: (files[f] || '').length }) };
    const m = createDawTrayManager({ Tray: class { setToolTip() {} setContextMenu() {} on() {} destroy() {} }, Menu: { buildFromTemplate: () => ({}) }, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) }, readSettings: () => ({ selectedDAWPath: EXE }), stateFile: 'D:\\d\\hidden-daw-state.json', fs: fakeFs, windowHider: { ...WH, hide: (e, cb) => WH.hide(e, cb, runnerWith('25896/IL=0x2000/ELEV=0~19308/IL=0x3000/ELEV=1')) }, log: () => {} });
    const h = await call((cb) => m.hide(cb));
    ok(!h.ok && /HIDE_REQUEST_STARTED_BUT_VISIBLE/.test(h.message) && /DIFFERENT/.test(h.message), 'thông báo cho người dùng nêu mã chẩn đoán', h.message);
    const lg = files['D:\\d\\daw-hide-diagnostic.log'] || '';
    ok(/CLASS=HIDE_REQUEST_STARTED_BUT_VISIBLE/.test(lg) && /PRIV_COMPARE=DIFFERENT/.test(lg) && /X=13894692\/19308\/1\/1\/0\/1\/1\/1\/1\/1/.test(lg), 'log có CLASS, X (từng HWND), T (polling), P (quyền)');
    ok(!files['D:\\d\\hidden-daw-state.json'], 'ẩn thất bại -> không lưu trạng thái ẩn (hành vi cũ giữ nguyên)');
}
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL  ([CẤU TRÚC C#] + [MÔ HÌNH] — chưa phải Windows thật, chưa biên dịch C#)');
process.exit(fail ? 1 : 0);
})();
