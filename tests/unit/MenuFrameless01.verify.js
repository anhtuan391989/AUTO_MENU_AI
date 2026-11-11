// MENU-FRAMELESS-01 — kiểm tra tĩnh: Menu không khung Windows + header kéo được. KHÔNG phải Electron thật.
// Chạy: node tests/unit/MenuFrameless01.verify.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const fn = src.slice(src.indexOf('function createMainWindow()'), src.indexOf('function createSetupWindow()'));
ok(/frame:\s*false/.test(fn), 'cửa sổ Menu có frame: false');
ok(/-webkit-app-region:\s*drag/.test(fn) && /\.header/.test(fn), 'chèn CSS kéo cho .header');
ok(/\.window-buttons \*\s*\{\s*-webkit-app-region:\s*no-drag/.test(fn), 'nút trong .window-buttons là no-drag');
ok(/insertCSS/.test(fn), 'dùng insertCSS (không sửa HTML/CSS giao diện)');
const setup = src.slice(src.indexOf('function createSetupWindow()'), src.indexOf('const AIBootstrap'));
ok(!/frame:\s*false/.test(setup), 'cửa sổ Setup KHÔNG bị đổi');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
