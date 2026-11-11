// LICENSE-01 — kiểm thử server License (MENU-LICENSE-SERVER/worker.js) với D1 giả lập bằng SQLite thật (node:sqlite).
// Không chạm mạng/Cloudflare. Chạy: node tests/unit/LicenseServer01.verify.js
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const root = path.join(__dirname, '..', '..');

function fakeD1(db) {
  return { prepare(sql) {
    let params = [];
    const st = {
      bind(...p) { params = p; return st; },
      async first() { return db.prepare(sql).get(...params) || null; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async run() { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return st;
  } };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
  const mjs = path.join(tmp, 'worker.mjs');
  fs.copyFileSync(path.join(root, 'MENU-LICENSE-SERVER', 'worker.js'), mjs);
  const W = await import('file://' + mjs);
  const worker = W.default;

  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'MENU-LICENSE-SERVER', 'schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(root, 'MENU-LICENSE-SERVER', 'schema.sql'), 'utf8')); // chạy lại không hỏng
  const kp = crypto.generateKeyPairSync('ed25519');
  const env = {
    DB: fakeD1(db), ADMIN_TOKEN: 'admin-token-for-test-0123456789',
    LICENSE_SIGN_KEY: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  };
  const verify = (r) => crypto.verify(null, Buffer.from(r.payload), kp.publicKey, Buffer.from(r.sig, 'base64'));

  const call = async (p, body, admin) => {
    const headers = { 'Content-Type': 'application/json' };
    if (admin !== undefined) headers.Authorization = 'Bearer ' + admin;
    const res = await worker.fetch(new Request('https://x.test' + p, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    return { status: res.status, body: await res.json() };
  };
  const adm = (p, b) => call(p, b === undefined ? undefined : b, env.ADMIN_TOKEN);
  const M1 = 'AAAAA-BBBBB-CCCCC-DDDDD', M2 = 'EEEEE-FFFFF-GGGGG-HHHHH';

  console.log('== cơ bản & quyền quản trị');
  ok((await call('/health')).body.ok === true, '/health ok');
  ok((await call('/admin/license/list')).status === 401, 'không có token -> 401');
  ok((await call('/admin/license/list', undefined, 'sai')).status === 401, 'sai token -> 401');
  ok((await call('/license/khac', {})).status === 404, 'đường dẫn lạ -> 404');
  const noAdmin = await worker.fetch(new Request('https://x.test/admin/license/list'), { DB: env.DB });
  ok(noAdmin.status === 500, 'server chưa đặt ADMIN_TOKEN -> từ chối (không mở toang)');

  console.log('== tạo key');
  ok((await adm('/admin/license/create', { plan: 'xx' })).body.ok === false, 'gói sai bị từ chối');
  ok((await adm('/admin/license/create', { plan: '3d', machine: '!!' })).body.ok === false, 'mã máy sai bị từ chối');
  const c1 = await adm('/admin/license/create', { plan: '3d', note: 'khach A' });
  const key1 = c1.body.keys && c1.body.keys[0].key;
  ok(/^MENU(-[A-HJKMNP-TV-Z2-9]{5}){4}$/.test(key1), 'key đúng định dạng MENU-XXXXX-XXXXX-XXXXX-XXXXX', key1);
  const list = (await adm('/admin/license/list')).body.licenses;
  ok(list.length === 1 && list[0].hint === key1.slice(-4) && !JSON.stringify(list).includes(key1), 'danh sách chỉ có 4 số cuối, không lộ key đầy đủ');
  ok(!db.prepare('SELECT key_hash FROM licenses').get().key_hash.includes(key1.slice(5, 10)), 'DB chỉ lưu băm');
  const many = await adm('/admin/license/create', { plan: '1y', count: 999 });
  ok(many.body.keys.length === 50, 'số lượng tối đa 50/lần');
  ok(new Set(many.body.keys.map((k) => k.key)).size === 50, '50 key không trùng nhau');

  console.log('== kích hoạt');
  ok((await call('/license/activate', { key: 'MENU-AAAAA-AAAAA-AAAAA-AAAAA', machine: M1 })).body.reason === 'INVALID_KEY', 'key không tồn tại/sai ký tự -> INVALID_KEY');
  ok((await call('/license/activate', { key: key1, machine: 'x' })).body.reason === 'BAD_REQUEST', 'mã máy sai -> BAD_REQUEST');
  ok((await call('/license/activate', 'rac')).body.reason === 'INVALID_KEY', 'body rác không làm sập server');
  const t0 = Date.now();
  const a1 = (await call('/license/activate', { key: key1.toLowerCase().replace(/-/g, ' '), machine: M1.toLowerCase() })).body;
  ok(a1.ok === true, 'kích hoạt OK (chấp nhận gõ thường/khoảng trắng)', a1);
  const p1 = JSON.parse(a1.payload);
  ok(verify(a1), 'chữ ký Ed25519 hợp lệ');
  ok(p1.machine === M1.replace(/-/g, '') && p1.plan === '3d', 'payload gắn đúng mã máy + gói');
  ok(p1.expiresAt - p1.activatedAt === 3 * 86400000 && p1.activatedAt >= t0, 'hạn = 3 ngày tính từ lúc kích hoạt');
  ok(!verify({ payload: a1.payload.replace('3d', '1y'), sig: a1.sig }), 'sửa payload thì chữ ký sai');
  const a1b = (await call('/license/activate', { key: key1, machine: M1 })).body;
  ok(a1b.ok && JSON.parse(a1b.payload).expiresAt === p1.expiresAt, 'kích hoạt lại cùng máy: giữ nguyên hạn (cài lại app không lợi gì)');
  ok((await call('/license/activate', { key: key1, machine: M2 })).body.reason === 'MACHINE_MISMATCH', 'máy khác dùng key đã gắn -> MACHINE_MISMATCH');

  console.log('== kiểm tra định kỳ');
  ok((await call('/license/check', { key: key1, machine: M1 })).body.ok === true, 'check đúng máy OK');
  ok((await call('/license/check', { key: key1, machine: M2 })).body.reason === 'MACHINE_MISMATCH', 'check sai máy bị chặn');
  const k2 = (await adm('/admin/license/create', { plan: '3m' })).body.keys[0].key;
  ok((await call('/license/check', { key: k2, machine: M1 })).body.reason === 'NOT_ACTIVATED', 'check key chưa kích hoạt -> NOT_ACTIVATED');

  console.log('== thu hồi / khôi phục / đổi máy / hết hạn');
  const id1 = list[0].id;
  await adm('/admin/license/revoke', { id: id1 });
  ok((await call('/license/check', { key: key1, machine: M1 })).body.reason === 'REVOKED', 'thu hồi -> check báo REVOKED');
  ok((await call('/license/activate', { key: key1, machine: M1 })).body.reason === 'REVOKED', 'thu hồi -> không kích hoạt lại được');
  await adm('/admin/license/restore', { id: id1 });
  ok((await call('/license/check', { key: key1, machine: M1 })).body.ok === true, 'khôi phục -> dùng lại được, giữ trạng thái active');
  await adm('/admin/license/unbind', { id: id1 });
  const a2 = (await call('/license/activate', { key: key1, machine: M2 })).body;
  ok(a2.ok && JSON.parse(a2.payload).expiresAt === p1.expiresAt, 'đổi máy: máy mới kích hoạt được, GIỮ NGUYÊN hạn cũ');
  ok((await call('/license/check', { key: key1, machine: M1 })).body.reason === 'MACHINE_MISMATCH', 'máy cũ bị chặn sau khi đổi máy');
  db.prepare('UPDATE licenses SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, id1);
  ok((await call('/license/check', { key: key1, machine: M2 })).body.reason === 'EXPIRED', 'quá hạn -> EXPIRED');
  ok((await call('/license/activate', { key: key1, machine: M2 })).body.reason === 'EXPIRED', 'quá hạn -> không kích hoạt lại để lấy thêm hạn');

  console.log('== key gắn sẵn mã máy & tranh chấp');
  const kb = (await adm('/admin/license/create', { plan: '6m', machine: M1 })).body.keys[0].key;
  ok((await call('/license/activate', { key: kb, machine: M2 })).body.reason === 'MACHINE_MISMATCH', 'key gắn sẵn máy A: máy B không kích hoạt được');
  ok((await call('/license/activate', { key: kb, machine: M1 })).body.ok === true, 'key gắn sẵn máy A: máy A kích hoạt được');
  const kr = (await adm('/admin/license/create', { plan: '1y' })).body.keys[0].key;
  const rs = await Promise.all([call('/license/activate', { key: kr, machine: M1 }), call('/license/activate', { key: kr, machine: M2 })]);
  ok(rs.filter((r) => r.body.ok).length === 1 && rs.filter((r) => r.body.reason === 'MACHINE_MISMATCH').length === 1, '2 máy kích hoạt cùng lúc 1 key: đúng 1 máy thắng');

  console.log('== tính hạn theo tháng');
  const d = (iso) => Date.parse(iso);
  ok(W.addPlan(d('2026-01-31T00:00:00Z'), '3m') === d('2026-04-30T00:00:00Z'), '31/01 + 3 tháng = 30/04');
  ok(W.addPlan(d('2026-08-31T00:00:00Z'), '6m') === d('2027-02-28T00:00:00Z'), '31/08 + 6 tháng = 28/02');
  ok(W.addPlan(d('2028-02-29T00:00:00Z'), '1y') === d('2029-02-28T00:00:00Z'), '29/02 + 1 năm = 28/02');
  ok(W.addPlan(d('2026-11-10T00:00:00Z'), '3d') === d('2026-11-13T00:00:00Z'), '3 ngày');
  ok(W.addPlan(0, 'abc') === null, 'gói lạ -> null');

  console.log('\nLicenseServer01: ' + pass + ' đạt, ' + fail + ' lỗi');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI TEST:', e); process.exit(2); });
