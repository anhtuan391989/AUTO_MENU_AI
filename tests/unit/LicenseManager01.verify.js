// LICENSE-01 — kiểm thử app/LicenseManager.js nối thẳng với MENU-LICENSE-SERVER/worker.js (D1 giả lập bằng SQLite thật).
// Không chạm mạng. Đồng hồ và "mất mạng" được giả lập. Chạy: node tests/unit/LicenseManager01.verify.js
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { createLicenseManager, normalizeKey, machineCodeFromRaw } = require('../../app/LicenseManager.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const root = path.join(__dirname, '..', '..');
const H = 3600 * 1000;

function fakeD1(db) {
  return { prepare(sql) { let params = []; const st = {
    bind(...p) { params = p; return st; },
    async first() { return db.prepare(sql).get(...params) || null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } };
}
const pubOf = (kp) => kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const privOf = (kp) => kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'licmgr-'));
  fs.copyFileSync(path.join(root, 'MENU-LICENSE-SERVER', 'worker.js'), path.join(tmp, 'worker.mjs'));
  const worker = (await import('file://' + path.join(tmp, 'worker.mjs'))).default;
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'MENU-LICENSE-SERVER', 'schema.sql'), 'utf8'));
  const kp = crypto.generateKeyPairSync('ed25519');
  const env = { DB: fakeD1(db), ADMIN_TOKEN: 'admin-token-for-test-0123456789', LICENSE_SIGN_KEY: privOf(kp) };

  let netDown = false, fetchCalls = 0, forceEnv = null;
  const fetchFn = async (url, init) => {
    fetchCalls++;
    if (netDown) throw new Error('mất mạng');
    return worker.fetch(new Request(url, init), forceEnv || env);
  };
  const admin = async (p, body) => (await (await worker.fetch(new Request('https://x.test' + p, { method: 'POST', headers: { Authorization: 'Bearer ' + env.ADMIN_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)).json());
  const newKey = async (plan, machine) => (await admin('/admin/license/create', { plan, machine })).keys[0].key;

  let clock = Date.now();
  const mk = (dir, extra) => createLicenseManager(Object.assign({ userDataDir: dir, appDir: tmp, publicKeyText: pubOf(kp), fetchFn, now: () => clock, machineIdProvider: async () => 'may-A', getServerUrl: () => 'https://lic.test' }, extra || {}));
  const dirA = path.join(tmp, 'userA'); fs.mkdirSync(dirA);

  console.log('== khoá công khai (fail-closed)');
  const noKey = createLicenseManager({ userDataDir: dirA, appDir: tmp, now: () => clock, fetchFn, machineIdProvider: async () => 'may-A' }); // tmp không có license-public-key.txt
  await noKey.init();
  ok(!noKey.isLicensed() && noKey.getStatus().code === 'NO_PUBLIC_KEY', 'thiếu license-public-key.txt -> KHOÁ, báo rõ lý do');
  const badKey = createLicenseManager({ userDataDir: dirA, appDir: tmp, publicKeyText: 'abc', now: () => clock, fetchFn, machineIdProvider: async () => 'may-A' });
  await badKey.init();
  ok(!badKey.isLicensed() && badKey.getStatus().code === 'INVALID_PUBLIC_KEY', 'khoá công khai hỏng -> KHOÁ');
  ok((await noKey.activate('MENU-AAAAA-AAAAA-AAAAA-AAAAA')).reason === 'NO_PUBLIC_KEY', 'thiếu khoá công khai thì không cho kích hoạt');
  fs.writeFileSync(path.join(tmp, 'license-public-key.txt'), pubOf(kp) + '\n');
  const fromFile = createLicenseManager({ userDataDir: dirA, appDir: tmp, now: () => clock, fetchFn, machineIdProvider: async () => 'may-A' });
  await fromFile.init();
  ok(fromFile.getStatus().code === 'UNLICENSED', 'đọc được khoá công khai từ file (có xuống dòng cuối)');
  fs.unlinkSync(path.join(tmp, 'license-public-key.txt'));

  console.log('== mã máy');
  const mcRe = /^[A-HJKMNP-TV-Z2-9]{5}(-[A-HJKMNP-TV-Z2-9]{5}){3}$/;
  ok(mcRe.test(machineCodeFromRaw('x')) && machineCodeFromRaw('x') === machineCodeFromRaw('x') && machineCodeFromRaw('x') !== machineCodeFromRaw('y'), 'mã máy đúng định dạng, ổn định, khác máy thì khác mã');
  const regOut = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    4C4C4544-0042-4A10-8058-B5C04F4D4D32\r\n';
  let regArgs = null;
  const winMgr = createLicenseManager({ userDataDir: dirA, appDir: tmp, platform: 'win32', exec: async (c, a) => { regArgs = [c].concat(a); return { code: 0, stdout: regOut }; } });
  ok((await winMgr.getMachineCode()) === machineCodeFromRaw('win:4c4c4544-0042-4a10-8058-b5c04f4d4d32') && regArgs[0] === 'reg', 'Windows: đọc MachineGuid từ registry');
  const winFail = createLicenseManager({ userDataDir: dirA, appDir: tmp, platform: 'win32', exec: async () => ({ code: 1, stdout: '' }) });
  ok(mcRe.test(await winFail.getMachineCode()), 'registry lỗi -> dùng dự phòng, vẫn ra mã hợp lệ');

  console.log('== chưa kích hoạt / nhập key');
  const m1 = mk(dirA); await m1.init();
  ok(!m1.isLicensed() && m1.getStatus().code === 'UNLICENSED' && mcRe.test(m1.getStatus().machineCode), 'chưa kích hoạt -> KHOÁ, có mã máy để gửi cho bạn');
  fetchCalls = 0;
  ok((await m1.activate('abc')).reason === 'INVALID_KEY' && fetchCalls === 0, 'key sai định dạng bị chặn ngay, không gọi mạng');
  const k3m = await newKey('3m');
  netDown = true;
  ok((await m1.activate(k3m)).reason === 'NETWORK' && !m1.isLicensed(), 'mất mạng lúc kích hoạt -> báo lỗi mạng, vẫn khoá');
  netDown = false;
  const r1 = await m1.activate(k3m.toLowerCase());
  ok(r1.ok && m1.isLicensed(), 'kích hoạt thành công -> mở khoá');
  const st1 = m1.getStatus();
  ok(st1.plan === '3m' && st1.daysLeft >= 88 && st1.keyHint === k3m.slice(-4) && !JSON.stringify(st1).includes(k3m), 'trạng thái: gói 3 tháng, ~90 ngày, chỉ lộ 4 số cuối key');
  ok(fs.existsSync(path.join(dirA, 'license.json')), 'đã lưu license trên máy');

  console.log('== mở lại app / sao chép sang máy khác / sửa file');
  netDown = true;
  const m2 = mk(dirA); await m2.init();
  ok(m2.isLicensed(), 'mở lại app khi mất mạng vẫn dùng được (còn trong hạn 72 giờ)');
  netDown = false;
  const dirB = path.join(tmp, 'userB'); fs.mkdirSync(dirB); fs.copyFileSync(path.join(dirA, 'license.json'), path.join(dirB, 'license.json'));
  const mB = mk(dirB, { machineIdProvider: async () => 'may-B' }); await mB.init();
  ok(!mB.isLicensed() && mB.getStatus().code === 'MACHINE_MISMATCH', 'chép license.json sang máy khác -> KHOÁ');
  const dirC = path.join(tmp, 'userC'); fs.mkdirSync(dirC);
  const j = JSON.parse(fs.readFileSync(path.join(dirA, 'license.json'), 'utf8'));
  const pj = JSON.parse(j.payload); pj.expiresAt += 400 * 24 * H; j.payload = JSON.stringify(pj);
  fs.writeFileSync(path.join(dirC, 'license.json'), JSON.stringify(j));
  const mC = mk(dirC); await mC.init();
  ok(!mC.isLicensed() && mC.getStatus().code === 'TAMPERED', 'sửa ngày hết hạn trong file -> chữ ký sai -> KHOÁ');
  const kp2 = crypto.generateKeyPairSync('ed25519');
  const mFake = mk(path.join(tmp, 'userF'), { fetchFn: async (u, i) => worker.fetch(new Request(u, i), Object.assign({}, env, { LICENSE_SIGN_KEY: privOf(kp2) })) });
  await mFake.init();
  const rf = await mFake.activate(await newKey('1y'));
  ok(rf.reason === 'BAD_SIGNATURE' && !mFake.isLicensed(), 'server giả/ký bằng khoá khác -> từ chối, vẫn khoá');

  console.log('== 72 giờ offline & lùi đồng hồ');
  const t0 = clock;
  netDown = true;
  clock = t0 + 71 * H;
  ok(m1.isLicensed(), 'offline 71 giờ -> vẫn dùng được');
  clock = t0 + 73 * H;
  ok(!m1.isLicensed() && m1.getStatus().code === 'NEED_ONLINE', 'offline 73 giờ -> KHOÁ, cần mạng');
  ok((await m1.refresh()).reason === 'NETWORK' && m1.getStatus().code === 'NEED_ONLINE', 'thử kiểm tra khi vẫn mất mạng -> vẫn khoá');
  netDown = false;
  ok((await m1.refresh()).ok && m1.isLicensed(), 'có mạng + kiểm tra lại -> mở khoá lại');
  const t1 = clock;
  clock = t1 + 10 * H; await m1.refresh();            // app chạy tới +10 giờ, kiểm tra server thành công
  clock = t1 + 20 * H; await mk(dirA).init();          // mở lại ở +20 giờ: quá 6 giờ nên tự kiểm tra lại, mốc thời gian lớn nhất = +20 giờ
  clock = t1 + 12 * H; // lùi đồng hồ 8 giờ so với lần dùng trước
  netDown = true;
  const mRoll = mk(dirA); await mRoll.init();
  ok(!mRoll.isLicensed() && mRoll.getStatus().code === 'NEED_ONLINE', 'lùi đồng hồ -> bắt buộc kiểm tra online, offline thì KHOÁ');
  netDown = false;
  const mRoll2 = mk(dirA); await mRoll2.init();
  ok(mRoll2.isLicensed(), 'có mạng: tự kiểm tra lại lúc mở app -> hợp lệ (đồng hồ đã chỉnh đúng cũng không bị kẹt)');
  clock = t0;

  console.log('== hết hạn');
  const dirE = path.join(tmp, 'userE'); fs.mkdirSync(dirE);
  const mE = mk(dirE); await mE.init();
  await mE.activate(await newKey('3d'));
  clock = t0 + 3 * 24 * H + 1000;
  ok(!mE.isLicensed() && mE.getStatus().code === 'EXPIRED', 'hết hạn 3 ngày -> KHOÁ (đánh giá cục bộ, không cần mạng)');
  clock = t0;

  console.log('== server thu hồi / hết hạn / lỗi tạm thời');
  const dirR = path.join(tmp, 'userR'); fs.mkdirSync(dirR);
  const mR = mk(dirR); await mR.init();
  const kR = await newKey('6m');
  await mR.activate(kR);
  const idR = db.prepare('SELECT id FROM licenses ORDER BY id DESC LIMIT 1').get().id;
  const bad500 = async () => new Response(JSON.stringify({ ok: false, reason: 'SERVER_ERROR', message: 'Lỗi server' }), { status: 500 });
  const mT = mk(dirR, { fetchFn: bad500 }); await mT.init();
  ok((await mT.refresh()).reason === 'SERVER_ERROR' && mT.isLicensed() && fs.existsSync(path.join(dirR, 'license.json')), 'server lỗi tạm thời (500) -> KHÔNG khoá, không xoá license');
  const garbage = async () => new Response('<html>502</html>', { status: 502 });
  const mG = mk(dirR, { fetchFn: garbage }); await mG.init();
  ok((await mG.refresh()).reason === 'NETWORK' && mG.isLicensed(), 'server trả rác (không phải JSON) -> coi như lỗi mạng, không khoá');
  await admin('/admin/license/revoke', { id: idR });
  const rv = await mR.refresh();
  ok(rv.reason === 'REVOKED' && !mR.isLicensed() && mR.getStatus().code === 'REVOKED' && !fs.existsSync(path.join(dirR, 'license.json')), 'server thu hồi -> KHOÁ ngay lần kiểm tra kế tiếp, xoá license, báo lý do');
  await admin('/admin/license/restore', { id: idR });
  ok((await mR.activate(kR)).ok && mR.isLicensed(), 'khôi phục -> nhập lại key dùng được');
  db.prepare('UPDATE licenses SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, idR);
  ok((await mR.refresh()).reason === 'EXPIRED' && !mR.isLicensed(), 'server báo hết hạn -> KHOÁ');

  console.log('== gia hạn bằng key mới');
  const dirN = path.join(tmp, 'userN'); fs.mkdirSync(dirN);
  const mN = mk(dirN); await mN.init();
  await mN.activate(await newKey('3d'));
  ok(mN.getStatus().plan === '3d', 'đang dùng gói 3 ngày');
  const kOther = await newKey('1y', 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ');
  ok((await mN.activate(kOther)).reason === 'MACHINE_MISMATCH' && mN.isLicensed() && mN.getStatus().plan === '3d', 'key gắn máy khác: bị từ chối và license đang dùng KHÔNG bị mất');
  ok((await mN.activate(await newKey('1y'))).ok && mN.getStatus().plan === '1y', 'nhập key mới hợp lệ -> chuyển sang gói 1 năm');

  console.log('== watcher');
  const dirW = path.join(tmp, 'userW'); fs.mkdirSync(dirW);
  const mWt = mk(dirW, { tickMs: 20 }); await mWt.init();
  await mWt.activate(await newKey('6m'));
  const idW = db.prepare('SELECT id FROM licenses ORDER BY id DESC LIMIT 1').get().id;
  let lost = 0, lostStatus = null;
  mWt.startWatcher({ onLost: (s) => { lost++; lostStatus = s; } });
  await new Promise((r) => setTimeout(r, 80));
  ok(lost === 0, 'còn hiệu lực -> watcher không báo mất');
  await admin('/admin/license/revoke', { id: idW });
  clock = t0 + 7 * H; // quá chu kỳ kiểm tra lại 6 giờ -> watcher hỏi server
  await new Promise((r) => setTimeout(r, 150));
  ok(lost === 1 && lostStatus.code === 'REVOKED', 'bị thu hồi lúc đang chạy -> watcher báo mất đúng 1 lần', { lost, code: lostStatus && lostStatus.code });
  mWt.stopWatcher(); clock = t0;

  console.log('== khởi động lại');
  const rl = []; m1.relaunch({ relaunch: () => rl.push('relaunch'), quit: () => rl.push('quit') });
  ok(rl.join() === 'relaunch,quit', 'relaunch(app) = app.relaunch() rồi app.quit()');

  console.log('== tiện ích');
  ok(normalizeKey('menu-aaaaa-bbbbb-ccccc-dddd0') === null && normalizeKey('menu-aaaaa-bbbbb-ccccc-ddddO') === null && normalizeKey('menu 22222 33333 44444 55555') === 'MENU-22222-33333-44444-55555' && normalizeKey(' menu-aaaaa-bbbbb-ccccc-ddddd ') === 'MENU-AAAAA-BBBBB-CCCCC-DDDDD', 'chuẩn hoá key: bỏ khoảng trắng, chấp nhận chữ thường; ký tự ngoài bảng (0, O) bị loại');

  console.log('\nLicenseManager01: ' + pass + ' đạt, ' + fail + ' lỗi');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI TEST:', e); process.exit(2); });
