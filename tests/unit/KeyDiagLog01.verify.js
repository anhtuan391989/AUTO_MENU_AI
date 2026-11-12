// KEY-DIAG-LOG-01 — chạy: node tests/unit/KeyDiagLog01.verify.js
// Kiểm tra bộ đọc Key trong tên bài, bộ phân loại kiểu sai và công cụ báo cáo. KHÔNG mở Electron.
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');
const { classify, buildRows, report, readRecords } = require(path.join(ROOT, 'tools/key_log_report.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

// 1) __keyTitleHint cắt từ renderer.js
const a = src.indexOf('function __keyTitleHint('), b = src.indexOf('function __keyDiagLog(');
ok(a > 0 && b > a, 'tìm thấy __keyTitleHint trong renderer.js');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b) + '\nthis.h=__keyTitleHint;', ctx);
const H = ctx.h;
ok(H('[NAM] Yêu Nhiều Ghen Nhiều - Thanh Hưng | Tone Nam | Chuẩn • Key: G Major|Karaoke') === 'G Major', 'tên bài "Key: G Major" -> G Major');
ok(H('Bài X Key: F#m beat') === 'F# Minor' && H('X key Bb') === 'Bb Major' && H('X Key - Am') === 'A Minor', 'các cách viết: F#m, Bb, "Key - Am"');
ok(H('Karaoke Keyboard Beat Chuẩn') === null && H('Tone Nam Chuẩn') === null && H(null) === null, 'không có Key trong tên (Keyboard/Tone Nam/null) -> null');

// 2) Phân loại kiểu sai — đúng 3 bài thật của người dùng
ok(classify('E Major', 'A Major').type === 'lan-can-5' && classify('E Major', 'A Major').shift === 5, 'E Major thật, AI A Major -> lân cận vòng 5, lệch +5');
ok(classify('E Major', 'C# Minor').type === 'tuong-ung', 'E Major thật, C# Minor -> cùng bộ nốt (Trưởng↔Thứ)');
ok(classify('E Major', 'F# Minor').type === 'lan-can-5+tuong-ung', 'E Major thật, F# Minor -> lân cận + tương ứng');
ok(classify('D Major', 'G Major').type === 'lan-can-5' && classify('G Major', 'D Major').type === 'lan-can-5', 'G Major ↔ D Major -> lân cận vòng 5 (cả hai chiều)');
ok(classify('F Major', 'D Minor').type === 'tuong-ung' && classify('A Minor', 'A Minor').type === 'dung', 'F Major↔D Minor tương ứng; A Minor=A Minor đúng');
ok(classify('D Major', 'F Major').type === 'khac' && classify('xyz', 'A Major').type === 'khong-doc-duoc', 'kiểu khác / không đọc được');

// 3) Đọc log mẫu -> báo cáo
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keylog-'));
const L = (o) => JSON.stringify(o);
fs.writeFileSync(path.join(dir, 't.jsonl'), [
  L({ event: 'FX_AUTO', x: 1 }),
  L({ event: 'KEY_LOG', song: 'Làng Xưa|Tuấn Hưng', key: 'A Major', key2: 'F# Minor', confidence: 0.7, margin: 0.05, lockMs: 9000, titleHint: null }),
  L({ event: 'KEY_LOG_MANUAL', song: 'Làng Xưa|Tuấn Hưng', key: 'E Major', aiKey: 'A Major', titleHint: null }),
  L({ event: 'KEY_LOG', song: 'Yêu Nhiều Ghen Nhiều | Key: G Major|', key: 'D Major', key2: 'G Major', confidence: 0.8, margin: 0.02, lockMs: 12000, titleHint: 'G Major' }),
  L({ event: 'KEY_LOG', song: 'Bài không đáp án|X', key: 'C Major', confidence: 0.9, lockMs: 8000 }),
  'dòng hỏng {{{ KEY_LOG',
].join('\n'));
const rows = buildRows(readRecords(dir));
ok(rows.length === 3, 'đọc 3 bài, bỏ qua dòng không liên quan và dòng hỏng');
ok(rows[0].truth === 'E Major' && rows[0].truthFrom === 'tay' && rows[0].type === 'lan-can-5', 'bài 1: đáp án lấy từ Key tay, AI lệch lân cận vòng 5');
ok(rows[1].truth === 'G Major' && rows[1].truthFrom === 'tên bài' && rows[1].type === 'lan-can-5', 'bài 2: đáp án lấy từ tên bài');
ok(rows[2].type === 'chua-co-dap-an', 'bài 3: chưa có đáp án -> không tính vào thống kê');
const txt = report(rows);
ok(/2 bài có đáp án/.test(txt) && /Lân cận vòng 5: 2 \(100%\)/.test(txt) && /trung vị/.test(txt), 'báo cáo: đếm đúng 2 bài có đáp án, kiểu sai, thời gian chốt');

// 4) Dây nối trong renderer.js
ok(/__keyDiagLog\("KEY_LOG", \{ key: result\.key, key2: __t2/.test(src), 'renderer.js: ghi KEY_LOG khi AI chốt Key');
ok(/__keyDiagLog\("KEY_LOG_MANUAL", \{ key: selectedKey, aiKey: keySource\.ai\.value/.test(src), 'renderer.js: ghi KEY_LOG_MANUAL khi gửi Key tay thành công');
ok(/getSetting\("aiDiagLogEnabled", true\)/.test(src.slice(src.indexOf('function __keyDiagLog('), src.indexOf('function __keyDiagLog(') + 400)), 'renderer.js: tôn trọng setting tắt nhật ký AI');
const kes = fs.readFileSync(path.join(ROOT, 'ui/js/engines/keyEngine.js'), 'utf8');
ok(!/KEY_LOG|__keyDiagLog/.test(kes), 'keyEngine.js không bị đụng (chỉ ghi nhật ký, không đổi cách dò)');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
