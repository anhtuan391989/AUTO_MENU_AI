// EXE-PROTECT-01 (Đợt 1) — chạy: node tests/unit/ExeProtect01.verify.js
// Kiểm tra TĨNH cấu hình đóng gói .exe: bật asar, giải nén đúng file cần cho chương trình ngoài,
// loại bỏ đúng file chết (không loại nhầm file đang dùng), đường dẫn "app.asar.unpacked" đúng.
// KHÔNG build .exe, KHÔNG mở Electron.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const RuntimePaths = require(path.join(ROOT, 'core/shared/RuntimePaths.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const b = pkg.build;
const files = b.files;

// 1) asar bật + danh sách giải nén
ok(b.asar === true, 'build.asar = true (code không còn là file rời đọc được)');
const unpack = b.asarUnpack || [];
['ahk/**/*', 'core/key_detector.py', 'core/fast_key_detector.py', 'core/integration/smtc-daemon.ps1']
    .forEach((u) => ok(unpack.includes(u), 'asarUnpack có ' + u));
ok(unpack.length === 4, 'asarUnpack chỉ gồm đúng 4 mục cần cho chương trình ngoài (không giải nén thừa)');

// 2) Mọi file mà chương trình ngoài đọc đều tồn tại thật + nằm trong asarUnpack
['ahk/AHK.ahk', 'ahk/click.ahk', 'core/key_detector.py', 'core/fast_key_detector.py', 'core/integration/smtc-daemon.ps1']
    .forEach((f) => ok(fs.existsSync(path.join(ROOT, f)), 'file tồn tại: ' + f));

// 3) unpackedPath: bản cài -> app.asar.unpacked; chạy từ mã nguồn -> giữ nguyên
const up = RuntimePaths.unpackedPath;
ok(up('C:\\Users\\A\\AppData\\Local\\Programs\\AutoMenuAI\\resources\\app.asar\\ahk\\AHK.ahk') ===
   'C:\\Users\\A\\AppData\\Local\\Programs\\AutoMenuAI\\resources\\app.asar.unpacked\\ahk\\AHK.ahk', 'Windows: app.asar -> app.asar.unpacked');
ok(up('/x/resources/app.asar/core/key_detector.py') === '/x/resources/app.asar.unpacked/core/key_detector.py', 'dạng / cũng đúng');
ok(up('G:\\AUTO_MENU_AI\\ahk\\AHK.ahk') === 'G:\\AUTO_MENU_AI\\ahk\\AHK.ahk', 'chạy từ mã nguồn: giữ nguyên đường dẫn');
ok(up('C:\\r\\app.asar.unpacked\\ahk\\a.ahk') === 'C:\\r\\app.asar.unpacked\\ahk\\a.ahk', 'đã là unpacked thì không đổi lần nữa');
ok(up(undefined) === undefined, 'không phải chuỗi -> trả nguyên');

// 4) Các chỗ truyền đường dẫn cho chương trình ngoài đều đi qua unpackedPath
ok(/RuntimePaths\.unpackedPath\(path\.join\(__dirname, "\.\.", "ahk", "AHK\.ahk"\)\)/.test(rd('app/main.js')), 'main.js: AHK.ahk dùng unpackedPath');
ok(/RuntimePaths\.unpackedPath\(path\.join\(__dirname, "\.\.", "ahk", "click\.ahk"\)\)/.test(rd('app/main.js')), 'main.js: click.ahk dùng unpackedPath');
ok(/unpackedPath\(path\.join\(__dirname, "\.\.", "core", "key_detector\.py"\)\)/.test(rd('app/keyAnalyzer.js')), 'keyAnalyzer: key_detector.py dùng unpackedPath');
ok(/unpackedPath\(path\.join\(__dirname, "\.\.", "core", "fast_key_detector\.py"\)\)/.test(rd('app/keyAnalyzer.js')), 'keyAnalyzer: fast_key_detector.py dùng unpackedPath');
ok(/unpackedPath\(path\.resolve\(__dirname, "smtc-daemon\.ps1"\)\)/.test(rd('core/integration/WindowsMediaSession.js')), 'WindowsMediaSession: smtc-daemon.ps1 dùng unpackedPath');

// 5) Loại file: không loại nhầm file đang dùng thật (quét require từ main.js / preload.js / <script> của ui/*.html)
const seen = new Set();
const resolveReq = (from, req) => {
    if (!req.startsWith('.')) return null;
    const base = path.resolve(path.dirname(from), req);
    for (const c of [base, base + '.js', base + '.json', path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return null;
};
const visit = (f) => {
    if (seen.has(f)) return; seen.add(f);
    if (!f.endsWith('.js')) return;
    let s; try { s = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    for (const m of s.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) { const r = resolveReq(f, m[1]); if (r) visit(r); }
    for (const m of s.matchAll(/path\.(?:join|resolve)\(\s*__dirname\s*,([^)]*)\)/g)) {
        const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
        const p = path.resolve(path.dirname(f), ...parts);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) visit(p);
    }
};
const entries = [path.join(ROOT, 'app/main.js'), path.join(ROOT, 'app/preload.js'), path.join(ROOT, 'docs/d1/semanticValidate.js')];
for (const h of fs.readdirSync(path.join(ROOT, 'ui')).filter((x) => x.endsWith('.html'))) {
    for (const m of fs.readFileSync(path.join(ROOT, 'ui', h), 'utf8').matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
        const p = path.resolve(ROOT, 'ui', m[1]); if (fs.existsSync(p)) entries.push(p);
    }
}
entries.forEach(visit);

const excludedDirs = files.filter((x) => /^!(core|app)\/.+\/\*\*$/.test(x) && !/command-engine-ts/.test(x)).map((x) => x.slice(1, -3));
const excludedFiles = files.filter((x) => /^!app\/[^*]+\.js$/.test(x)).map((x) => x.slice(1));
ok(excludedDirs.length === 8, 'loại thêm 8 thư mục code chết (ai/driver, ai/events, ai/kernel, ai/memory, drivers, kernel, models, services)');
const hit = [];
for (const f of seen) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (excludedDirs.some((d) => rel === d || rel.startsWith(d + '/')) || excludedFiles.includes(rel)) hit.push(rel);
}
ok(hit.length === 0, 'KHÔNG loại nhầm file đang được require thật' + (hit.length ? ' — nhầm: ' + hit.join(', ') : ''));
ok(seen.size > 60, 'quét được ' + seen.size + ' file đang dùng (kiểm chứng bộ quét hoạt động)');

// 6) Loại file rác nặng + giữ lại thứ bắt buộc
ok(files.includes('!**/*.rar'), 'loại *.rar (ui/ui.rar ~35MB đang bị đóng nhầm vào bản cài)');
ok(files.includes('!**/*.example.js'), 'loại *.example.js');
['app/**/*', 'core/**/*', 'ui/**/*', 'ahk/**/*', 'data/songs.json', 'docs/d1/midi-mapping.xml', 'docs/d1/midi-mapping.xsd', 'docs/d1/semanticValidate.js']
    .forEach((x) => ok(files.includes(x), 'vẫn đóng gói: ' + x));
ok(fs.existsSync(path.join(ROOT, 'app/license-public-key.txt')), 'app/license-public-key.txt vẫn còn (đọc được qua asar)');

// 7) DevTools chỉ bị chặn khi đóng gói; không đụng giao diện
const main = rd('app/main.js');
ok(/if \(app\.isPackaged\) \{[\s\S]*?devtools-opened[\s\S]*?Menu\.setApplicationMenu\(null\)/.test(main), 'main.js: chặn DevTools + bỏ menu mặc định, chỉ khi app.isPackaged');
ok(!/openDevTools\(/.test(main), 'main.js: không có chỗ nào tự mở DevTools');

// 8) Ghi file vẫn nằm ngoài thư mục cài (asar chỉ đọc)
ok(RuntimePaths.writableDir('data', { app: { isPackaged: true, getPath: () => 'C:\\U\\AppData\\Roaming\\automenu-ai' } }).indexOf('automenu-ai') >= 0, 'bản cài ghi data/logs vào AppData (không ghi vào asar)');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
