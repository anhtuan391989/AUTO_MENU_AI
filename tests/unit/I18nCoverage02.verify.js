// I18N-02 — chữ MỚI (Inserts, FX→Sends, Auto-Key, sửa Key Server, khoá Cài đặt, Macro, MASTER Input...) được dịch khi chọn English và trả lại tiếng Việt khi chọn Tiếng Việt.
const path = require('path');
const I = require(path.join(__dirname, '..', '..', 'ui/js/i18n.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };
const CASES = [
  ['INSERTS Mic 1 — nút Activate All của cụm Inserts Mic 1 (127 = bật, 0 = tắt)', 'INSERTS Mic 1 — Activate All button of the Mic 1 Inserts (127 = on, 0 = off)'],
  ['FX → SENDS 1 Verb ngắn (nút nguồn Send; gửi kèm FX ON/OFF)', 'FX → SENDS 1 Short Verb (Send power button; sent together with FX ON/OFF)'],
  ['Auto Inserts theo nhạc', 'Auto Inserts follow music'],
  ['Lưu Key vào Server', 'Save Key to Server'],
  ['Lưu D Major làm Key ĐÚNG của bài đang phát?', 'Save D Major as the CORRECT Key of the playing song?'],
  ['Sai mật khẩu Server.', 'Wrong Server password.'],
  ['🔒 CÀI ĐẶT ĐÃ KHOÁ', '🔒 SETTINGS LOCKED'],
  ['Chọn MASTER Input', 'Select MASTER Input'],
  ['💾 Lưu Macro', '💾 Save Macro'],
  ['Chưa có Macro nào.', 'No Macro yet.'],
  ['Đã lưu Macro (3 bước).', 'Macro saved (3 steps).'],
  ['12/12 đã nối', '12/12 connected'],
  ['Sai nhiều lần. Thử lại sau 30 giây.', 'Too many wrong attempts. Try again in 30 s.'],
  ['Đã tự áp bộ MIDI Fender Studio Pro 8 cho Studio One: 56 mapping. Chưa gửi gì tới DAW.', 'Applied the Fender Studio Pro 8 MIDI set for Studio One: 56 mappings. Nothing was sent to the DAW.'],
];
I.setLang('en');
for (const [vi, en] of CASES) { const r = I.translate(vi); ok(r === en, '[en] ' + vi.slice(0, 50), r); }
I.setLang('vi');
for (const [vi, en] of CASES) { const r = I.translate(en); ok(r === vi, '[vi] ' + en.slice(0, 50), r); }
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
