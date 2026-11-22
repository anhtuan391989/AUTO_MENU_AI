// EXE-PROTECT-04 — chạy: node tests/unit/ExeProtect04.verify.js
// data/songs.json KHÔNG còn đóng gói vào bản cài; lần chạy đầu của bản cài vẫn chạy được với DB rỗng (rồi đồng bộ từ Key Server).
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

const files = pkg.build.files;
ok(!files.some((x) => /(^|\/)songs\.json$/.test(x) || x === 'data/**/*' || x === 'data/**' || x === 'data/*'), 'build.files không chứa data/songs.json (danh sách bài hát không nằm trong bản cài)');
ok(!files.some((x) => /^data\//.test(x)), 'build.files không chứa bất kỳ mục data/ nào');
['app/**/*', 'core/**/*', 'ui/**/*', 'ahk/**/*', 'docs/d1/midi-mapping.xml', 'docs/d1/midi-mapping.xsd', 'docs/d1/semanticValidate.js'].forEach((x) => ok(files.includes(x), 'vẫn đóng gói: ' + x));
ok(fs.existsSync(path.join(ROOT, 'data', 'songs.json')), 'file data/songs.json vẫn còn trong mã nguồn (máy dev không đổi)');

// Không có mã nào đọc thẳng data/songs.json trong thư mục cài (chỉ SongDatabase qua seed tuỳ chọn)
const bad = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) { const s = fs.readFileSync(p, 'utf8'); if (/__dirname[^;\n]*['"]data['"][^;\n]*['"]songs\.json['"]/.test(s)) bad.push(path.relative(ROOT, p)); } } };
['app', 'core'].forEach((d) => walk(path.join(ROOT, d)));
ok(bad.length === 0, 'không file nào đọc thẳng <thư mục cài>/data/songs.json' + (bad.length ? ': ' + bad.join(', ') : ''));

// Lần chạy đầu của bản cài khi KHÔNG có seed: tạo DB rỗng ở AppData, không lỗi
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exe04-'));
try {
    const RP = require(path.join(ROOT, 'core/shared/RuntimePaths.js'));
    const origW = RP.writableDir, origP = RP.isPackaged, origB = RP.bundledDir;
    RP.writableDir = () => path.join(tmp, 'data'); RP.isPackaged = () => true; RP.bundledDir = () => path.join(tmp, 'khong-co-seed');
    const modPath = require.resolve(path.join(ROOT, 'core/reference/SongDatabase.js'));
    delete require.cache[modPath];
    const db = require(modPath); // module xuất ra 1 đối tượng SongDatabase dùng chung
    ok(!!db && typeof db.load === 'function', 'SongDatabase nạp được');
    if (db) {
        const list = db.load();
        ok(Array.isArray(list) && list.length === 0, 'bản cài chưa có seed: DB khởi đầu rỗng, không lỗi');
        const f = path.join(tmp, 'data', 'songs.json');
        ok(fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim() === '[]', 'file DB được tạo ở thư mục ghi được (AppData), nội dung []');
    }
    RP.writableDir = origW; RP.isPackaged = origP; RP.bundledDir = origB; delete require.cache[modPath];
} catch (e) { ok(false, 'chạy thử SongDatabase lỗi: ' + (e && e.message)); }
finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }

// Đồng bộ từ Key Server vẫn là đường nạp dữ liệu
const sync = fs.readFileSync(path.join(ROOT, 'core/integration/SongDbServerSync.js'), 'utf8');
ok(/\/list\?all=1/.test(sync), 'SongDbServerSync vẫn kéo danh sách từ Key Server (/list?all=1)');
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
