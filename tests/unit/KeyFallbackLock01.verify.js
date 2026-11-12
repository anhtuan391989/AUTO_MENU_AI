// KEY-FALLBACK-LOCK-01 — chạy: node tests/unit/KeyFallbackLock01.verify.js
// Kiểm tra đường dự phòng "nghe đủ lâu mà chưa khoá thì khoá theo Key dài hạn dẫn đầu". Test điều kiện thật cắt từ keyEngine.js. KHÔNG mở Electron.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui/js/engines/keyEngine.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

ok(/const FALLBACK_LOCK_ENABLED = true;/.test(src) && /const FALLBACK_LOCK_LONG_S = 180;/.test(src), 'có công tắc FALLBACK_LOCK_ENABLED (bật) và FALLBACK_LOCK_LONG_S = 180 giây theo yêu cầu');
const iU = src.indexOf('updateLongState();\n\n            // KEY-FALLBACK-LOCK-01'), iL = src.indexOf('TASK AI-ALG-05 — cập nhật Key dài hạn'), iLong = src.indexOf('if (LONG_EVIDENCE_ENABLED && hasMusicalContent && longState.key && __longStreakForLock >= LONG_LOCK_TICKS');
ok(iL > 0 && iU > iL && iLong > iU, 'đường dự phòng nằm SAU updateLongState() và TRƯỚC đường long-term cũ (không thay đổi đường cũ)');

const m = src.match(/if \((FALLBACK_LOCK_ENABLED[\s\S]*?)\) \{\s*\n\s*const fr = longState\.result;/);
ok(!!m, 'tìm thấy điều kiện của đường dự phòng');
const cond = m[1];
const gate = new Function('FALLBACK_LOCK_ENABLED', 'lastLockedKey', 'hasMusicalContent', 'longState', 'longSeconds', 'FALLBACK_LOCK_LONG_S', '__fbStreak', 'LONG_LOCK_TICKS', 'MIN_CONFIDENCE', 'return !!(' + cond + ');');
const base = { en: true, last: null, music: true, ls: { key: '4-Major', result: { confidence: 0.6 } }, secs: 181, need: 180, fb: 12, ticks: 10, minc: 0.55 };
const run = (o) => { const b = Object.assign({}, base, o); return gate(b.en, b.last, b.music, b.ls, b.secs, b.need, b.fb, b.ticks, b.minc); };
ok(run({}) === true, 'đủ điều kiện (181s, chưa khoá, dẫn đầu 12 tick, tin cậy 0.6) -> KHOÁ');
ok(run({ secs: 179.9 }) === false && run({ secs: 180 }) === true, 'chưa đủ 180 giây nhạc -> chưa khoá; đúng 180 -> khoá');
ok(run({ last: '4-Major' }) === false && run({ last: '9-Minor' }) === false, 'đã có Key khoá trong vòng này -> KHÔNG chạy (không đụng bài đã chốt bình thường)');
ok(run({ fb: 9 }) === false && run({ fb: 10 }) === true, 'Key dài hạn dẫn đầu (theo nhóm relative) < 10 tick -> không khoá; đủ 10 -> khoá');
ok(run({ ls: { key: '4-Major', result: { confidence: 0.54 } } }) === false, 'tin cậy dưới MIN_CONFIDENCE (0.55) -> không khoá');
ok(run({ ls: { key: null, result: null } }) === false, 'chưa có Key dài hạn -> không khoá');
ok(run({ music: false }) === false && run({ en: false }) === false, 'không có nhạc / công tắc tắt -> không khoá');

const blk = src.slice(src.indexOf('// KEY-FALLBACK-LOCK-01 — đường dự phòng (xem'), src.indexOf('// KEY-FALLBACK-LOCK-01 — đường dự phòng (xem') + 1400);
ok(/reason: "fallback-timeout"/.test(blk) && /onWinner\(fr, longState\.streak, stopBoth\);\s*\n\s*return;/.test(blk), 'khi khoá: ghi telemetry LOCK reason "fallback-timeout", báo kết quả qua onWinner rồi dừng vòng như đường cũ');
ok(/const __fbStreak = RELATIVE_GROUP_ENABLED \? longState\.groupStreak : longState\.streak;/.test(src), 'dùng chuỗi dẫn đầu theo NHÓM relative (khớp KEY-GROUP-LOCK-01), tự về chuỗi cũ nếu tính năng đó tắt');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
