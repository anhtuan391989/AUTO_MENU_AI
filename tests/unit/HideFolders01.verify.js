// HIDE-FOLDERS-01 — kiểm tra tĩnh: module ẩn thư mục + cách nối vào app.whenReady() trong main.js,
// và cấu hình đóng gói asar trong package.json. KHÔNG phải Electron/Windows thật.
// Chạy: node tests/unit/HideFolders01.verify.js
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

const hf = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'HideFolders.js'), 'utf8');
ok(/process\.platform !== ['"]win32['"]/.test(hf), 'HideFolders.js chỉ chạy trên Windows');
ok(/attrib/.test(hf), 'dùng lệnh attrib của Windows');
ok(/try\s*\{/.test(hf) && /catch/.test(hf), 'có try/catch (best-effort, không throw ra ngoài)');
ok(typeof require('../../app/HideFolders.js').hideAppFolders === 'function', 'export hideAppFolders');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');
ok(/require\(["']\.\/HideFolders["']\)/.test(main), 'main.js require HideFolders');
ok(/hideAppFolders\(\{/.test(main), 'main.js gọi hideAppFolders() trong whenReady');
ok(/installDir:\s*path\.dirname\(app\.getPath\("exe"\)\)/.test(main), 'truyền thư mục cài đặt (.exe) để ẩn khi đã đóng gói');
ok(/isPackaged:\s*app\.isPackaged/.test(main), 'chỉ ẩn thư mục cài đặt khi app.isPackaged (không ẩn thư mục mã nguồn lúc dev)');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
ok(pkg.build && pkg.build.asar === true, 'package.json build.asar = true (đóng gói mã nguồn, không để .js nằm trần)');
const unpack = (pkg.build && pkg.build.asarUnpack) || [];
ok(unpack.some((p) => /ahk/.test(p)), 'asarUnpack có ahk/** (AutoHotkey cần đường dẫn file thật ngoài asar)');
ok(unpack.some((p) => /easymidi/.test(p)) && unpack.some((p) => /julusian\/midi/.test(p)), 'asarUnpack có easymidi + @julusian/midi (native binding)');
ok(unpack.some((p) => /\bmic\b/.test(p)), 'asarUnpack có mic (spawn file nhị phân ngoài)');

console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
