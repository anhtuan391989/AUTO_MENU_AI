// EXE-PROTECT-03 — chạy: node tests/unit/ExeProtect03.verify.js
// Công cụ đặt mật khẩu Admin riêng (Cách B) + tự nâng cấp máy còn mật khẩu mặc định đời cũ. Không mở Electron.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const tool = require(path.join(ROOT, 'tools/set-admin-password.js'));
const TOOL = path.join(ROOT, 'tools/set-admin-password.js');
const SRC = path.join(ROOT, 'core/shared/AdminAuth.js');
const LEGACY_PW = 'Kh0i_AI!'; // mật khẩu mặc định đời cũ — chỉ tồn tại trong test
const NEWPW = 'Phat-Hanh-Rieng-2026x';
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'exeprot03-'));
const load = (file) => { delete require.cache[require.resolve(file)]; return require(file); };
const runTool = (args, input) => spawnSync(process.execPath, [TOOL, ...args], { input, encoding: 'utf8' });

// 1) checkShape
ok(tool.checkShape('abc') !== null, 'từ chối mật khẩu quá ngắn');
ok(tool.checkShape('123456789012') !== null, 'từ chối mật khẩu toàn số');
ok(tool.checkShape('abcdefghijklm') !== null, 'từ chối mật khẩu không có số');
ok(tool.checkShape('aaaaaaaaaaaa') !== null, 'từ chối mật khẩu lặp 1 ký tự');
ok(tool.checkShape(NEWPW) === null, 'chấp nhận mật khẩu đủ dài có chữ + số');

// 2) patchSource: chỉ đổi đúng 2 dòng
const realSrc = fs.readFileSync(SRC, 'utf8');
const rec = tool.buildRecord(NEWPW);
const patched = tool.patchSource(realSrc, rec.salt, rec.hash);
const a = realSrc.split(/\r?\n/), b = patched.split(/\r?\n/);
const diff = a.map((l, i) => l !== b[i] ? i : -1).filter((i) => i >= 0);
ok(a.length === b.length && diff.length === 2, 'patchSource chỉ đổi đúng 2 dòng (đổi ' + diff.length + ')');
ok(/DEFAULT_SALT_HEX = "[0-9a-f]{32}"/.test(b[diff[0]] + b[diff[1]]) && patched.includes(rec.salt) && patched.includes(rec.hash), 'dòng mới chứa salt+hash mới');
ok(patched.includes('LEGACY_DEFAULT_SALT_HEX = "aba66d15677628b3eb5d0af9269ab37a"'), 'hằng số LEGACY (đời cũ) không bị đổi');
let threw = false; try { tool.patchSource('const x = 1;', rec.salt, rec.hash); } catch (e) { threw = true; }
ok(threw, 'file không có đúng dạng hằng số -> dừng, không sửa bừa');
ok(!tool.sameAsCurrent(realSrc, NEWPW) && tool.sameAsCurrent(patched, NEWPW), 'nhận ra mật khẩu trùng mật khẩu đang đặt sẵn');

// 3) Chạy công cụ thật trên BẢN SAO (ống dẫn): thành công
const dir = mk(), tgt = path.join(dir, 'AdminAuth.js');
fs.copyFileSync(SRC, tgt);
let r = runTool(['--target', tgt], NEWPW + '\n' + NEWPW + '\n');
ok(r.status === 0, 'công cụ chạy thành công (mã thoát 0)');
ok(!(r.stdout + r.stderr).includes(NEWPW), 'công cụ KHÔNG in mật khẩu ra màn hình');
ok(!fs.readFileSync(tgt, 'utf8').includes(NEWPW), 'file đã sửa KHÔNG chứa mật khẩu chữ rõ');
{
    const M = load(tgt);
    const a1 = M.createAdminAuth({ userDataDir: path.join(dir, 'u1'), safeStorage: null });
    ok(a1.verify(NEWPW).ok === true, 'máy cài mới: đăng nhập bằng mật khẩu riêng ĐÚNG');
    ok(a1.verify(LEGACY_PW).ok === false, 'máy cài mới: mật khẩu mặc định đời cũ KHÔNG còn vào được');
}

// 4) Các trường hợp bị từ chối: file không đổi
const before = fs.readFileSync(tgt, 'utf8');
r = runTool(['--target', tgt], NEWPW + '\n' + 'khac-nhau-1234567\n');
ok(r.status !== 0 && fs.readFileSync(tgt, 'utf8') === before, 'hai lần nhập khác nhau -> từ chối, file không đổi');
r = runTool(['--target', tgt], 'ngan1\nngan1\n');
ok(r.status !== 0 && fs.readFileSync(tgt, 'utf8') === before, 'mật khẩu yếu -> từ chối, file không đổi');
r = runTool(['--target', tgt], NEWPW + '\n' + NEWPW + '\n');
ok(r.status !== 0 && fs.readFileSync(tgt, 'utf8') === before, 'trùng mật khẩu đang đặt -> từ chối, file không đổi');
r = runTool(['--target', path.join(dir, 'khong-co.js')], NEWPW + '\n' + NEWPW + '\n');
ok(r.status !== 0, 'file đích không tồn tại -> báo lỗi');

// 5) --print: không sửa file
const dir2 = mk(), tgt2 = path.join(dir2, 'AdminAuth.js'); fs.copyFileSync(SRC, tgt2);
r = runTool(['--target', tgt2, '--print'], NEWPW + '\n' + NEWPW + '\n');
ok(r.status === 0 && /DEFAULT_SALT_HEX = "/.test(r.stdout) && fs.readFileSync(tgt2, 'utf8') === realSrc, '--print chỉ in 2 dòng, không sửa file');
ok(!r.stdout.includes(NEWPW), '--print không in mật khẩu');

// 6) Nâng cấp máy còn mật khẩu mặc định đời cũ
{
    const Mold = load(SRC);           // mã nguồn hiện tại: DEFAULT == LEGACY (chưa chạy công cụ)
    const Mnew = load(tgt);           // mã đã chạy công cụ: DEFAULT mới
    const mkLegacyDir = (safe) => { const d = mk(); Mold.createAdminAuth({ userDataDir: d, safeStorage: safe || null }).verify(LEGACY_PW); return d; };
    const readRec = (d) => JSON.parse(fs.readFileSync(path.join(d, 'admin-auth.json'), 'utf8'));

    const d1 = mkLegacyDir();
    const before1 = fs.readFileSync(path.join(d1, 'admin-auth.json'), 'utf8');
    const same = Mold.createAdminAuth({ userDataDir: d1, safeStorage: null });
    ok(same.verify(LEGACY_PW).ok === true && fs.readFileSync(path.join(d1, 'admin-auth.json'), 'utf8') === before1, 'chưa chạy công cụ: mật khẩu đời cũ vẫn dùng, file không bị đụng');

    const up = Mnew.createAdminAuth({ userDataDir: d1, safeStorage: null });
    ok(up.verify(LEGACY_PW).ok === false, 'máy còn mật khẩu mặc định đời cũ: sau khi cập nhật bản mới thì mật khẩu cũ KHÔNG còn vào được');
    ok(up.verify(NEWPW).ok === true, '...và mật khẩu riêng mới vào được');
    ok(readRec(d1).salt !== 'aba66d15677628b3eb5d0af9269ab37a', '...bản ghi trên đĩa đã được nâng cấp');

    // máy đã TỰ ĐỔI mật khẩu: không bị đụng
    const d2 = mkLegacyDir();
    Mold.createAdminAuth({ userDataDir: d2, safeStorage: null }).changePassword(LEGACY_PW, 'Tu-Doi-Mat-Khau#77');
    const before2 = fs.readFileSync(path.join(d2, 'admin-auth.json'), 'utf8');
    const own = Mnew.createAdminAuth({ userDataDir: d2, safeStorage: null });
    ok(own.verify('Tu-Doi-Mat-Khau#77').ok === true && fs.readFileSync(path.join(d2, 'admin-auth.json'), 'utf8') === before2, 'máy đã tự đổi mật khẩu: giữ nguyên, không bị đụng');

    // có lớp mã hoá safeStorage (DPAPI giả): vẫn nâng cấp được
    const fake = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s, 'utf8'), decryptString: (b) => Buffer.from(b).toString('utf8') };
    const d3 = mkLegacyDir(fake);
    const up3 = Mnew.createAdminAuth({ userDataDir: d3, safeStorage: fake });
    ok(up3.verify(LEGACY_PW).ok === false && up3.verify(NEWPW).ok === true, 'file có mã hoá safeStorage: vẫn nâng cấp đúng');

    // file hỏng: không tự ghi đè, verify báo lỗi có kiểm soát như cũ
    const d4 = mk(); fs.writeFileSync(path.join(d4, 'admin-auth.json'), '{hong', 'utf8');
    const bad = Mnew.createAdminAuth({ userDataDir: d4, safeStorage: null });
    let res; try { res = bad.verify(NEWPW); } catch (e) { res = { ok: false, threw: true }; }
    ok(res.ok === false && fs.readFileSync(path.join(d4, 'admin-auth.json'), 'utf8') === '{hong', 'file hỏng: không bị ghi đè');
}

// 7) Máy dev/mã nguồn hiện tại không đổi hành vi; công cụ không nằm trong bản cài
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    ok(!pkg.build.files.some((f) => /^tools(\/|$)/.test(f)), 'thư mục tools/ KHÔNG nằm trong danh sách đóng gói (công cụ không lọt vào bản cài)');
    const bat = fs.readFileSync(path.join(ROOT, 'tools/set-admin-password.bat'), 'utf8');
    ok(/node tools\\set-admin-password\.js/.test(bat) && bat.includes('\r\n') && !/[^\x00-\x7F]/.test(bat), '.bat: gọi đúng công cụ, xuống dòng CRLF, thuần ASCII (không lỗi font)');
    ok(!/Kh0i_AI/.test(realSrc), 'AdminAuth.js vẫn không chứa mật khẩu chữ rõ');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
