// KEY-SEND-OFF-02 — chạy: node tests/unit/KeySendOffServer02.verify.js
// Ô chuột phải AUTO DETECT "Tắt gửi sang Auto Tune" TÍCH -> Menu KHÔNG gửi Key lên Server (vẫn đọc Key từ Server). Server GIẢ, KHÔNG gọi Cloudflare thật.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { KeyServerSync } = require(path.join(ROOT, 'core', 'integration', 'KeyServerSync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
function mk(over) {
  const sent = [], looked = []; let t = 1e9;
  const res = (j) => ({ ok: true, status: 200, json: async () => j });
  const fetchFn = async (url, init) => {
    const u = String(url), body = init && init.body ? JSON.parse(init.body) : null;
    if (u.includes('/add-segment')) { sent.push(body); return res({ ok: true }); }
    if (u.includes('/set-song-info')) return res({ ok: true });
    if (u.includes('/song-full')) return res({ doans: [], thongTin: {} });
    if (u.includes('/find')) { looked.push(u); return res({ found: false }); }
    return res({});
  };
  const s = new KeyServerSync(Object.assign({ fetchFn, now: () => t, logger: { log() {}, error() {} } }, over || {}));
  return { s, sent, looked };
}
const sub = (s) => s.submit({ title: 'Noi Nay Co Anh', artist: 'Son Tung', key: 'C Major', confidence: 0.9, durationSec: 278 });
(async () => {
  let m = mk({ canSubmit: () => true }); let r = await sub(m.s);
  ok(r.ok === true && m.sent.length === 1, 'BỎ TÍCH (canSubmit=true): Key vẫn gửi lên Server như cũ');
  m = mk({}); r = await sub(m.s);
  ok(r.ok === true && m.sent.length === 1, 'không truyền canSubmit: mặc định vẫn gửi (không đổi hành vi cũ)');
  m = mk({ canSubmit: () => false }); r = await sub(m.s);
  ok(r.ok === false && r.reason === 'send-off' && m.sent.length === 0, 'TÍCH (canSubmit=false): KHÔNG gửi Key lên Server (reason=send-off)');
  const lk = await m.s.lookup('Noi Nay Co Anh', 'Son Tung');
  ok(m.looked.length >= 1 && lk !== undefined, 'TÍCH: vẫn HỎI/đọc Key từ Server bình thường');
  let flag = false; m = mk({ canSubmit: () => !flag });
  flag = true; r = await sub(m.s); const a = m.sent.length; flag = false; r = await sub(m.s);
  ok(a === 0 && m.sent.length === 1 && r.ok === true, 'bật/tắt giữa chừng: tích thì chặn, bỏ tích là gửi lại được');
  m = mk({ canSubmit: () => { throw new Error('x'); } }); r = await sub(m.s);
  ok(r.ok === true && m.sent.length === 1, 'lỗi khi đọc cờ -> an toàn, gửi như cũ (không làm hỏng luồng chính)');
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  ok(/canSubmit: \(\(\) => \{[\s\S]{0,400}keySendToTuneOff === true/.test(main), 'main.js nối cờ keySendToTuneOff vào KeyServerSync');
  const sd = fs.readFileSync(path.join(ROOT, 'core/integration/SongDbServerSync.js'), 'utf8');
  ok(/r\.reason !== 'send-off'\) failed\+\+/.test(sd), 'đồng bộ Database: tắt gửi không bị tính là lỗi đẩy');
  console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
