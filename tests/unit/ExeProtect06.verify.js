// EXE-PROTECT-06 (Đợt 2) — chạy: node tests/unit/ExeProtect06.verify.js
// Kiểm tra công cụ build làm rối code (tools/build-protected.js): không sửa mã nguồn thật, cấu hình an toàn, không lọt vào bản cài.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const T = require(path.join(ROOT, 'tools/build-protected.js'));

ok(!!(pkg.devDependencies || {})['javascript-obfuscator'], 'package.json: javascript-obfuscator nằm trong devDependencies (không vào bản cài)');
ok(!(pkg.dependencies || {})['javascript-obfuscator'], 'javascript-obfuscator không nằm trong dependencies');
ok(!pkg.build.files.some((x) => /^tools/.test(x)), 'thư mục tools/ không nằm trong danh sách đóng gói');
const bat = fs.readFileSync(path.join(ROOT, 'tools/build-protected.bat'));
ok(bat.every((b) => b < 128) && bat.toString().includes('\r\n'), 'build-protected.bat thuần ASCII + CRLF');
const o = T.OBF_OPTIONS;
ok(o.renameProperties === false && o.transformObjectKeys === false, 'không đổi tên thuộc tính/khoá đối tượng (IPC, JSON, tên kênh an toàn); biến cấp file (module CommonJS) được đổi tên');
ok(o.controlFlowFlattening === false && o.deadCodeInjection === false && o.selfDefending === false && o.debugProtection === false, 'tắt các tuỳ chọn làm chậm/dễ lỗi');
ok(o.target === 'node', 'target node');
ok(T.SKIP_FILE.test('app/preload.js') && !T.SKIP_FILE.test('app/main.js'), 'preload.js không bị làm rối, main.js thì có');
ok(['app', 'core'].every((d) => T.COPY_DIRS.includes(d)) && T.COPY_DIRS.includes('ui') && T.COPY_DIRS.includes('ahk'), 'bản chép đủ app/core/ui/ahk');
const src = fs.readFileSync(path.join(ROOT, 'tools/build-protected.js'), 'utf8');
ok(!/writeFileSync\(\s*path\.join\(ROOT/.test(src) && /fs\.writeFileSync\(file, out/.test(src), 'chỉ ghi vào file trong bản chép (biến file của stage), không ghi vào ROOT');

const Obf = T.loadObfuscator(ROOT);
if (!Obf) {
    console.log('  SKIP chưa cài javascript-obfuscator (npm install) — bỏ qua phần chạy thật');
} else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exe06-'));
    try {
        const f = path.join(tmp, 'm.js');
        const code = "'use strict';\nconst secret = 'LICENSE-CHECK-KEY';\nfunction isLicensed(x) { return x === secret ? 'yes' : 'no'; }\nmodule.exports = { isLicensed, name: 'demo' };\n";
        fs.writeFileSync(f, code);
        T.obfuscateFile(Obf, f);
        const out = fs.readFileSync(f, 'utf8');
        ok(out !== code && !out.includes('LICENSE-CHECK-KEY') && !out.includes('const secret'), 'file mẫu: chuỗi chữ rõ và tên biến nội bộ không còn trong kết quả');
        const m = { exports: {} }; vm.runInNewContext(out, { module: m, exports: m.exports, require }, { filename: f });
        ok(m.exports.isLicensed('LICENSE-CHECK-KEY') === 'yes' && m.exports.isLicensed('x') === 'no' && m.exports.name === 'demo', 'file mẫu: chạy ra đúng kết quả như trước, tên export giữ nguyên');

        const before = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');
        const h1 = before('app/main.js'), h2 = before('core/shared/AdminAuth.js');
        const stage = path.join(tmp, 'stage');
        T.makeStage(stage, {});
        const n = T.obfuscateStage(stage, Obf, null);
        ok(n > 50, 'làm rối ' + n + ' file trong bản chép');
        ok(before('app/main.js') === h1 && before('core/shared/AdminAuth.js') === h2, 'mã nguồn thật KHÔNG bị thay đổi');
        const pre = fs.readFileSync(path.join(stage, 'app/preload.js'), 'utf8');
        ok(pre === fs.readFileSync(path.join(ROOT, 'app/preload.js'), 'utf8'), 'preload.js trong bản chép giữ nguyên');
        ok(/_0x[0-9a-f]+/.test(fs.readFileSync(path.join(stage, 'app/main.js'), 'utf8')), 'main.js trong bản chép đã bị làm rối');
        ok(fs.existsSync(path.join(stage, 'ui')) && fs.existsSync(path.join(stage, 'package.json')), 'bản chép có ui/ và package.json');
    } catch (e) { ok(false, 'lỗi khi chạy thật: ' + (e && e.message)); }
    finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
