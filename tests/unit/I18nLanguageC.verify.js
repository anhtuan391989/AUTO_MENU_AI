// I18N-01 — Ngôn ngữ giao diện Việt/Anh (ui/js/i18n.js): nạp vào 3 HTML, ô Language trong Cài đặt đã mở khoá,
// bảng dịch dịch 2 chiều ổn định (không vòng lặp), tên preset không bị dịch (renderer.js đọc làm logic).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };

const src = rd('ui/js/i18n.js');
const I = require(path.join(root, 'ui/js/i18n.js'));
const PAIRS = eval(src.match(/var PAIRS = (\[[\s\S]*?\n    \]);/)[1]);

// ---- 1) nạp vào HTML đúng chỗ, đúng 1 lần
const idx = rd('ui/index.html'), set = rd('ui/setup.html'), fx = rd('ui/effects.html');
const tag = /<script src="js\/i18n\.js"><\/script>/g;
ok((idx.match(tag) || []).length === 1 && (set.match(tag) || []).length === 1 && (fx.match(tag) || []).length === 1, 'i18n.js được nạp đúng 1 lần ở index/setup/effects');
ok(idx.indexOf('js/renderer.js') < idx.indexOf('js/i18n.js'), 'index.html: i18n.js nạp SAU renderer.js (renderer đọc chữ gốc trước)');
const scripts = [...set.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
ok(scripts[scripts.length - 1] === 'js/i18n.js', 'setup.html: i18n.js là script cuối cùng');
const sel = set.match(/<select[^>]*id="languageSelect"[^>]*>[\s\S]*?<\/select>/);
ok(!!sel && !/disabled/.test(sel[0]), 'ô Language (languageSelect) tồn tại và KHÔNG còn bị khoá');
ok(!!sel && /<option value="vi"[^>]*>Tiếng Việt<\/option>/.test(sel[0]) && /<option value="en"[^>]*>English<\/option>/.test(sel[0]), 'ô Language có đúng 2 lựa chọn: Tiếng Việt / English');
ok(!!sel && /data-i18n-skip/.test(sel[0]), 'tên ngôn ngữ trong ô Language không bị dịch (data-i18n-skip)');
const ids = [...set.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
ok(ids.filter((x) => x === 'languageSelect').length === 1, 'languageSelect không bị trùng id');

// ---- 2) bảng dịch
ok(PAIRS.length >= 600, 'bảng dịch có >= 600 cặp', PAIRS.length);
ok(PAIRS.every((p) => typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1] && p[0] !== p[1]), 'mọi cặp có đủ vi/en và khác nhau');
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
ok(PAIRS.every((p) => ph(p[0]) === ph(p[1])), 'mọi cặp có cùng tập placeholder {n} ở 2 ngôn ngữ');

// ---- 3) dịch 2 chiều + ổn định
const un = (s) => s.replace(/\\(n|t|"|'|\\)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
const texts = []; PAIRS.forEach((p) => { texts.push(p[0], p[1]); });
for (const lang of ['vi', 'en']) {
  I.setLang(lang);
  let unstable = 0, worst = 0;
  for (const t of texts) {
    let cur = t, i = 0;
    for (; i < 6; i++) { const r = I.translate(cur); if (r === null || r === cur) break; cur = r; }
    if (i >= 3) unstable++;
    if (i > worst) worst = i;
  }
  ok(unstable === 0, `[${lang}] dịch ổn định: không chuỗi nào cần >= 3 lượt (chống vòng lặp MutationObserver)`, unstable);
}
I.setLang('en');
const toEn = PAIRS.filter((p) => !/\{\d+\}/.test(p[0]) && I.translate(un(p[0])) !== null).length;
const plain = PAIRS.filter((p) => !/\{\d+\}/.test(p[0])).length;
ok(toEn / plain > 0.97, 'Việt -> Anh: >97% cặp dịch được', toEn + '/' + plain);
I.setLang('vi');
const toVi = PAIRS.filter((p) => !/\{\d+\}/.test(p[1]) && I.translate(un(p[1])) !== null).length;
ok(toVi / plain > 0.97, 'Anh -> Việt: >97% cặp dịch được', toVi + '/' + plain);

// ---- 4) cụ thể
I.setLang('en');
ok(I.translate('Cài đặt (Khóa toàn bộ)') === 'Settings (Lock all)', 'Cài đặt (Khóa toàn bộ) -> Settings (Lock all)', I.translate('Cài đặt (Khóa toàn bộ)'));
ok(I.translate('  Cài đặt (Khóa toàn bộ)  ') === '  Settings (Lock all)  ', 'giữ khoảng trắng đầu/cuối khi dịch', JSON.stringify(I.translate('  Cài đặt (Khóa toàn bộ)  ')));
ok(/OFF/.test(I.translate('Đã lưu: Start Hidden TẮT.') || ''), 'câu có mảnh ghép (Start Hidden TẮT) dịch được');
I.setLang('vi');
ok(I.translate('Settings (Lock all)') === 'Cài đặt (Khóa toàn bộ)', 'Settings (Lock all) -> Cài đặt (Khóa toàn bộ)', I.translate('Settings (Lock all)'));
for (const lang of ['vi', 'en']) {
  I.setLang(lang);
  ok(['NORM', 'LOFI', 'RAP', 'REMIX'].every((n) => I.translate(n) === null), `[${lang}] tên preset NORM/LOFI/RAP/REMIX KHÔNG bị dịch (TUNE đã được dịch riêng từ VI-LABELS-01)`);
}
// mẫu có giá trị chạy thật
const tpl = PAIRS.find((p) => /\{0\}/.test(p[0]) && !/\{1\}/.test(p[0]) && p[0].replace(/\{0\}/g, '').replace(/[^A-Za-zÀ-ỹ]/g, '').length >= 6);
I.setLang('en');
const r = tpl && I.translate(tpl[0].replace('{0}', '42'));
ok(!!r && r.includes('42') && !r.includes('{0}'), 'chuỗi có {0} thay đúng giá trị chạy thật', r);

// ---- 5) lưu ngôn ngữ chung qua setSetting; mặc định vi
ok(/setSetting\("language"|G\.setSetting\("language"/.test(src), 'ngôn ngữ lưu ở appSettings.language qua setSetting');
ok(/return v === "en" \? "en" : "vi"/.test(src), 'mặc định Tiếng Việt khi chưa có cài đặt / giá trị lạ');
ok(/notifySetupChanged/.test(src) && /onSetupChanged/.test(src), 'báo cho Menu khi đổi ngôn ngữ và tự áp dụng khi nhận tín hiệu');
ok(/\["alert", "confirm", "prompt"\]/.test(src), 'hộp thoại alert/confirm/prompt cũng được dịch');

console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
