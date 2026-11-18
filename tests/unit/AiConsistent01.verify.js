'use strict';
// AI-CONSISTENT-01: AI chốt cùng 1 Key khác Database >= 2 lần liên tiếp (0.6 / cuối >= 0.75) thì thay Database.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf-8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };
const i0 = src.indexOf('const AI_CONSISTENT_MIN_CONF'), i1 = src.indexOf('let lastPluginKey');
ok(i0 > 0 && i1 > i0, 'tìm thấy khối AI-CONSISTENT-01 trong renderer.js');
const sb = {}; vm.createContext(sb); vm.runInContext(src.slice(i0, i1) + ';this.f=__aiConsistentUpdate;', sb);
const f = sb.f;
ok(f('A Major', 0.61, 'D Major', 1) === false, 'lần 1 (0.61) chưa đủ');
ok(f('A Major', 0.79, 'D Major', 1) === true, 'lần 2 cùng Key, cuối 0.79 => AI thắng (D<->A cách quãng 5 vẫn được)');
ok(f('D Major', 0.9, 'D Major', 2) === false, 'AI trùng Database => không đổi');
ok(f('A Major', 0.9, 'D Major', 2) === false, 'bài mới (gen khác): đếm lại, 1 lần chưa đủ');
ok(f('A Major', 0.7, 'D Major', 2) === false, 'lần 2 nhưng tin cậy cuối 0.70 < 0.75 => chưa');
ok(f('G Major', 0.9, 'D Major', 2) === false && f('A Major', 0.9, 'D Major', 2) === false, 'Key đổi giữa chừng => đếm lại');
ok(f('A Major', 0.5, 'D Major', 3) === false && f('A Major', 0.9, 'D Major', 3) === false, 'lần có tin cậy < 0.6 làm đứt chuỗi');
ok(/__aiConsistentWins/.test(src) && /ai-consistent/.test(src) && /DB_BYPASS_AUTO_ON/.test(src), 'đã nối vào đường tự cạnh tranh + Auto Detect');
console.log(pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
