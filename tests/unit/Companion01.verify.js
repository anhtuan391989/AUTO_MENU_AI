// COMPANION-01 — không mở lại YouTube khi mở lại Menu; "Đóng DAW và Youtube cùng Menu" (DAW hỏi lưu -> No). Logic thuần, Windows giả lập.
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };
const C = require(path.join(root, 'app/companion.js'));
const tl = (running) => async (cmd, args) => ({ code: 0, stdout: running ? '"Studio One.exe","1234","Console","1","300,000 K"\r\n' : 'INFO: No tasks are running which match the specified criteria.\r\n' });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-'));
  // 1) state
  ok(C.readState(dir) === null, 'chưa có state -> null');
  C.writeState(dir, { youtubeOpenedAt: 1, dawExe: 'Studio One.exe' });
  ok(C.readState(dir).youtubeOpenedAt === 1, 'ghi/đọc state');
  C.clearState(dir); ok(C.readState(dir) === null, 'xoá state');
  fs.writeFileSync(path.join(dir, C.STATE_FILE), '{hỏng'); ok(C.readState(dir) === null, 'state hỏng -> null (không lỗi)');

  // 2) không mở lại YouTube
  const st = { youtubeOpenedAt: 5 };
  let r = await C.shouldSkipYoutube({ state: st, dawPath: 'C:\\Program Files\\PreSonus\\Studio One 7\\Studio One.exe', browserPath: '', run: tl(true) });
  ok(r.skip === true, 'mở lại Menu khi DAW vẫn chạy + đã mở YouTube -> BỎ QUA YouTube', JSON.stringify(r));
  r = await C.shouldSkipYoutube({ state: st, dawPath: 'C:\\x\\Studio One.exe', run: tl(false) });
  ok(r.skip === false, 'DAW đã tắt (phiên mới) -> mở YouTube bình thường');
  r = await C.shouldSkipYoutube({ state: null, dawPath: 'C:\\x\\Studio One.exe', run: tl(true) });
  ok(r.skip === false, 'chưa từng mở YouTube -> mở');
  r = await C.shouldSkipYoutube({ state: st, dawPath: '', browserPath: 'C:\\b\\chrome.exe', run: async () => ({ stdout: '"chrome.exe","1"' }) });
  ok(r.skip === true, 'không cấu hình DAW: dựa vào trình duyệt đã chọn');
  r = await C.shouldSkipYoutube({ state: st, dawPath: '', browserPath: '', run: tl(true) });
  ok(r.skip === false, 'không biết tiến trình nào để kiểm -> mở (không bỏ sót)');
  r = await C.shouldSkipYoutube({ state: st, dawPath: 'C:\\x\\Studio One.exe', run: async () => { throw new Error('boom'); } });
  ok(r.skip === false, 'tasklist lỗi -> mở (an toàn)');

  // 3) đóng DAW / YouTube
  const sh = (out) => async () => ({ code: 0, stdout: out });
  ok((await C.closeDaw({ dawPath: 'C:\\x\\Studio One.exe', run: sh('CLOSED_NO_SAVE\r\n') })).ok === true, 'DAW đóng sau khi bấm No -> ok');
  ok((await C.closeDaw({ dawPath: 'C:\\x\\Studio One.exe', run: sh('NOT_RUNNING') })).ok === true, 'DAW không chạy -> ok');
  const still = await C.closeDaw({ dawPath: 'C:\\x\\Studio One.exe', run: sh('STILL_RUNNING_NO_DIALOG_BUTTON') });
  ok(still.ok === false && /STILL_RUNNING/.test(still.detail), 'không bấm được nút No / DAW chưa đóng -> báo lỗi, KHÔNG ép tắt');
  ok((await C.closeYoutube({ run: sh('CLOSED_TAB:1') })).ok && (await C.closeYoutube({ run: sh('NO_YOUTUBE_WINDOW') })).ok && !(await C.closeYoutube({ run: sh('FOREGROUND_MISMATCH') })).ok, 'YouTube: đóng tab / không có / cửa sổ không đúng -> báo đúng');
  const logs = []; const both = await C.closeCompanions({ dawPath: 'C:\\x\\Studio One.exe', run: async (c, a) => ({ code: 0, stdout: /ZgBvAHI/.test('') ? '' : 'CLOSED' }), log: (m) => logs.push(m) });
  ok(both.youtube && both.daw && logs.length === 2, 'closeCompanions đóng cả YouTube và DAW');
  const thrown = await C.closeCompanions({ dawPath: 'x.exe', run: async () => { throw new Error('x'); } });
  ok(thrown.daw.ok === false && thrown.youtube.ok === false, 'lỗi thực thi không ném ra ngoài');

  // 4) script PowerShell an toàn
  const S = C.PS_CLOSE_DAW;
  ok(/CloseMainWindow/.test(S) && !/Stop-Process|taskkill|\.Kill\(/i.test(S), 'đóng DAW bằng CloseMainWindow, không kill tiến trình');
  const noList = S.match(/\$no\s*=\s*@\(([^)]*)\)/)[1], yesList = S.match(/\$yes\s*=\s*@\(([^)]*)\)/)[1];
  ok(/Don't Save/.test(noList) && /'No'/.test(noList) && /Không/.test(noList), 'danh sách nút được bấm gồm No / Don\'t Save / Không');
  ok(!/'(Save|Yes|Lưu|Có|Cancel|Hủy)'/.test(noList), 'KHÔNG bao giờ bấm Save / Yes / Cancel');
  ok(/\$yes -contains \$n/.test(S) && /if \(-not \$hasYes\) \{ continue \}/.test(S) && /Save/.test(yesList), 'chỉ bấm No trong hộp thoại có nút Save/Yes (đúng là hộp thoại hỏi lưu)');
  ok(/GetForegroundWindow/.test(C.PS_CLOSE_YOUTUBE) && /-match 'YouTube'/.test(C.PS_CLOSE_YOUTUBE) && /\^w/.test(C.PS_CLOSE_YOUTUBE), 'YouTube: xác nhận cửa sổ trước mặt đúng là YouTube rồi mới Ctrl+W (chỉ đóng tab)');
  let captured; await C.closeDaw({ dawPath: "C:\\x\\O'Brien One.exe", run: async (c, a) => { captured = Buffer.from(a[a.length - 1], 'base64').toString('utf16le'); return { stdout: 'CLOSED' }; } });
  ok(/\$Exe = 'O''Brien One\.exe'/.test(captured) && !/param\(/.test(captured), 'tên file DAW được escape dấu nháy đơn');

  // 5) nối dây
  const main = rd('app/main.js'), st2 = rd('ui/js/setup.js'), as = rd('ui/js/appSettings.js');
  ok(/autoStartup: true/.test(as), 'tự mở lúc khởi động gửi cờ autoStartup');
  ok(/openYoutube && autoStartup/.test(main) && /shouldSkipYoutube/.test(main) && /writeState\(app\.getPath\("userData"\)/.test(main), 'main: chỉ bỏ qua YouTube khi Menu tự mở; nút "Mở kèm ngay" thủ công vẫn luôn mở; mở xong thì ghi state');
  ok(/closeCompanionWithMenu/.test(main) && /event\.preventDefault\(\)/.test(main) && /clearTimeout\(guard\)/.test(main) && /setTimeout\(\(\) => \{ __companionDone = true; app\.quit\(\); \}, 70000\)/.test(main), 'main: before-quit chờ đóng DAW/YouTube, có chốt chặn 70 giây');
  ok(main.indexOf('__companionClosing = false') < main.indexOf('if (__companionClosing && !__companionDone) return;'), 'thứ tự before-quit: handler đóng DAW đăng ký trước handler tắt MIDI');
  ok(/checkCloseWithMenu/.test(st2) && /closeCompanionWithMenu/.test(st2) && /Đóng DAW và Youtube cùng Menu/.test(st2), 'Setup: có ô "Đóng DAW và Youtube cùng Menu", mặc định tắt');
  ok(!/closeCompanionWithMenu: *true/.test(as), 'mặc định KHÔNG bật (tránh tự đóng DAW ngoài ý muốn)');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
