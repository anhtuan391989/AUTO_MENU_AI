// EXE-PROTECT-02 — chạy: node tests/unit/ExeProtect02.verify.js
// Mật khẩu mặc định Admin không còn nằm dạng chữ rõ trong phần được đóng gói vào bản cài .exe,
// nhưng đăng nhập bằng mật khẩu mặc định cũ VẪN hoạt động y như trước (không đổi hành vi).
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const DEFAULT_PASSWORD = 'Kh0i_AI!'; // chỉ tồn tại trong test, không đóng gói
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// 1) Không còn chuỗi mật khẩu mặc định ở mọi file nằm trong phạm vi đóng gói (app/core/ui/ahk)
const hits = [];
const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.(js|html|json|ahk|ps1|py|css)$/.test(n)) { try { if (fs.readFileSync(p, 'utf8').includes('Kh0i_AI')) hits.push(path.relative(ROOT, p)); } catch (e) { /* bỏ qua */ } } } };
['app', 'core', 'ui', 'ahk'].forEach((d) => walk(path.join(ROOT, d)));
ok(hits.length === 0, 'Không file nào trong app/core/ui/ahk chứa mật khẩu mặc định dạng chữ rõ' + (hits.length ? ' — còn: ' + hits.join(', ') : ''));
ok(PKG.build.files.includes('!**/*.md'), 'file .md (báo cáo) không đóng gói vào bản cài');

// 2) Hành vi: mật khẩu mặc định cũ vẫn đăng nhập được
const modPath = require.resolve(path.join(ROOT, 'core/shared/AdminAuth.js'));
const fresh = () => { delete require.cache[modPath]; return require(modPath); };
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'exeprot02-'));
{
    const M = fresh();
    ok(M.DEFAULT_PASSWORD === undefined, 'AdminAuth không export DEFAULT_PASSWORD');
    const dir = mk();
    const a = M.createAdminAuth({ userDataDir: dir, safeStorage: null });
    ok(a.verify(DEFAULT_PASSWORD).ok === true, 'Đăng nhập bằng mật khẩu mặc định cũ vẫn ĐÚNG');
    ok(a.verify('sai-mat-khau').ok === false, 'Mật khẩu sai vẫn bị từ chối');
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'admin-auth.json'), 'utf8'));
    ok(!JSON.stringify(rec).includes(DEFAULT_PASSWORD), 'File admin-auth.json không chứa mật khẩu gốc');
    ok(/^[0-9a-f]{32}$/.test(rec.salt) && /^[0-9a-f]{128}$/.test(rec.hash), 'Bản ghi là salt+hash scrypt hợp lệ');

    // đổi mật khẩu -> dùng salt NGẪU NHIÊN mới, mật khẩu mặc định hết hiệu lực
    const r = a.changePassword(DEFAULT_PASSWORD, 'Moi!Pass#2026');
    ok(r.ok === true, 'Đổi mật khẩu từ mặc định vẫn thành công');
    const rec2 = JSON.parse(fs.readFileSync(path.join(dir, 'admin-auth.json'), 'utf8'));
    ok(rec2.salt !== rec.salt && rec2.hash !== rec.hash, 'Sau khi đổi: salt/hash mới (không còn dùng salt cố định của mật khẩu mặc định)');
    ok(a.verify(DEFAULT_PASSWORD).ok === false && a.verify('Moi!Pass#2026').ok === true, 'Mật khẩu mặc định hết hiệu lực, mật khẩu mới dùng được');
}
{ // hai máy khác nhau cùng bootstrap: bản ghi giống nhau (salt cố định) nhưng vẫn là hash một chiều, và verify chạy đúng
    const M = fresh();
    const d1 = mk(), d2 = mk();
    const a1 = M.createAdminAuth({ userDataDir: d1, safeStorage: null }), a2 = M.createAdminAuth({ userDataDir: d2, safeStorage: null });
    a1.verify(DEFAULT_PASSWORD); a2.verify(DEFAULT_PASSWORD);
    ok(a1.verify(DEFAULT_PASSWORD).ok && a2.verify(DEFAULT_PASSWORD).ok, 'Hai thư mục dữ liệu độc lập đều đăng nhập được bằng mật khẩu mặc định');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
