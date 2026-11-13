// DB-STATUS-ERR-01 — chạy: node tests/unit/ServerHealthCause01.verify.js
const path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { pingServer, describeFetchError } = require(path.join(ROOT, 'core/integration/ServerHealth.js'));
const { KeyServerSync } = require(path.join(ROOT, 'core/integration/KeyServerSync.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const mk = (msg, cause) => { const e = new TypeError(msg); if (cause) e.cause = cause; return e; };
(async () => {
  ok(describeFetchError(mk('fetch failed', { code: 'ENOTFOUND' })) === 'fetch failed (ENOTFOUND)', 'fetch failed + cause.code ENOTFOUND -> "fetch failed (ENOTFOUND)" (lỗi DNS)');
  ok(describeFetchError(mk('fetch failed', { code: 'CERT_HAS_EXPIRED' })) === 'fetch failed (CERT_HAS_EXPIRED)', 'lỗi chứng chỉ (sai giờ máy) hiện rõ');
  ok(describeFetchError(mk('boom')) === 'boom' && describeFetchError('x') === 'x', 'không có cause -> giữ nguyên thông báo cũ');
  ok(describeFetchError(Object.assign(new Error('a'), { name: 'AbortError' })) === 'TIMEOUT', 'AbortError -> TIMEOUT như cũ');
  let r = await pingServer({ url: 'https://x.test/', fetchImpl: () => Promise.reject(mk('fetch failed', { code: 'ECONNRESET' })) });
  ok(r.ok === false && r.error === 'fetch failed (ECONNRESET)', 'pingServer: ô Database nhận đúng nguyên nhân (ECONNRESET)');
  r = await pingServer({ url: 'https://x.test/', fetchImpl: async () => ({ status: 404 }) });
  ok(r.ok === true && r.status === 404, 'pingServer: server trả 404 vẫn là ONLINE (không đổi quy ước cũ)');
  const k = new KeyServerSync({ serverUrl: 'https://x.test', fetchFn: () => Promise.reject(mk('fetch failed', { code: 'ENOTFOUND' })), cacheFile: null });
  const q = await k._request('/health', {}, 1000);
  ok(q.ok === false && q.error === 'fetch failed (ENOTFOUND)', 'KeyServerSync._request: lỗi mạng cũng hiện nguyên nhân thật');
  const k2 = new KeyServerSync({ serverUrl: 'https://x.test', fetchFn: () => Promise.reject(new Error('boom')), cacheFile: null });
  ok((await k2._request('/h', {}, 1000)).error === 'boom', 'KeyServerSync._request: không có cause -> như cũ');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
