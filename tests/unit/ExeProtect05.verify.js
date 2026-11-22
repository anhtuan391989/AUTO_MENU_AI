// EXE-PROTECT-05 (Đợt 1b) — chạy: node tests/unit/ExeProtect05.verify.js
// Kiểm tra TĨNH cấu hình Electron Fuses và rằng code không dùng thứ mà fuse đã khoá.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const f = pkg.build.electronFuses || {};
ok(f.runAsNode === false, 'runAsNode = false (không dùng EXE như Node để chạy code tuỳ ý)');
ok(f.enableNodeOptionsEnvironmentVariable === false, 'NODE_OPTIONS bị khoá');
ok(f.enableNodeCliInspectArguments === false, '--inspect bị khoá');
ok(f.enableEmbeddedAsarIntegrityValidation === true, 'kiểm tra toàn vẹn app.asar bật (sửa asar -> app không chạy)');
ok(f.onlyLoadAppFromAsar === true, 'chỉ nạp app từ app.asar (không nạp thư mục app/ để thay thế)');
ok(f.enableCookieEncryption === undefined, 'không đổi cookie encryption (chuyển một chiều, không cần)');
ok(f.grantFileProtocolExtraPrivileges === undefined, 'không đổi file:// (giao diện nạp bằng file://, giữ nguyên)');
ok(pkg.build.asar === true, 'asar vẫn bật (điều kiện của onlyLoadAppFromAsar)');
// Code không phụ thuộc vào thứ đã khoá
const hits = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (p.endsWith('.js')) { const s = fs.readFileSync(p, 'utf8'); if (/ELECTRON_RUN_AS_NODE|--inspect|NODE_OPTIONS/.test(s)) hits.push(path.relative(ROOT, p)); } } };
['app', 'core'].forEach((d) => walk(path.join(ROOT, d)));
ok(hits.length === 0, 'app/core không dùng ELECTRON_RUN_AS_NODE/--inspect/NODE_OPTIONS' + (hits.length ? ': ' + hits.join(', ') : ''));
const ex = [];
const walk2 = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk2(p); else if (p.endsWith('.js') && /process\.execPath/.test(fs.readFileSync(p, 'utf8'))) ex.push(path.relative(ROOT, p).split(path.sep).join('/')); } };
['app', 'core'].forEach((d) => walk2(path.join(ROOT, d)));
ok(ex.length === 1 && ex[0] === 'app/Elevation.js', 'process.execPath chỉ dùng ở app/Elevation.js (chạy lại chính app, không chạy như Node)' + (ex.length ? ': ' + ex.join(', ') : ''));
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
