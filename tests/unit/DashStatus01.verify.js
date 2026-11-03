// DASH-STATUS-01 — ô AI / Database trong Setup > Dashboard báo THẬT. ServerHealth.js dùng fetch giả; phần còn lại kiểm nối dây trong mã nguồn.
const fs = require('fs'), path = require('path');
const { pingServer } = require('../../core/integration/ServerHealth.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  let r = await pingServer({ url: 'https://x.test/', fetchImpl: async () => ({ status: 200 }) });
  ok(r.ok === true && r.status === 200, 'HTTP 200 -> ONLINE', r);
  r = await pingServer({ url: 'https://x.test', fetchImpl: async () => ({ status: 404 }) }); ok(r.ok === true && r.status === 404, 'HTTP 404 (server sống) -> ONLINE', r);
  r = await pingServer({ url: 'https://x.test', fetchImpl: async () => ({ status: 503 }) }); ok(r.ok === false && r.status === 503, 'HTTP 503 -> OFFLINE', r);
  r = await pingServer({ url: 'https://x.test', fetchImpl: async () => { throw new Error('ENOTFOUND'); } }); ok(r.ok === false && /ENOTFOUND/.test(r.error), 'lỗi mạng -> OFFLINE, không throw', r);
  r = await pingServer({ url: 'https://x.test', timeoutMs: 30, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); })) }); ok(r.ok === false && r.error === 'TIMEOUT', 'quá giờ -> OFFLINE (TIMEOUT)', r);
  let url; await pingServer({ url: 'https://x.test///', fetchImpl: async (u) => { url = u; return { status: 200 }; } }); ok(url === 'https://x.test/health', 'gọi đúng route /health, bỏ dấu / thừa', url);
  r = await pingServer({}); ok(r.ok === false && r.error === 'NOT_CONFIGURED', 'thiếu cấu hình -> OFFLINE, không throw', r);
  const html = rd('ui/setup.html'), nav = rd('ui/js/setupNav.js'), main = rd('app/main.js'), pre = rd('app/preload.js');
  ok(/id="dashAiPill"/.test(html) && /id="dashDbPill"/.test(html), 'setup.html: 2 ô AI/Database có id');
  const dash = html.slice(html.indexOf('id="panel-dashboard"'), html.indexOf('Quick Actions'));
  ok(!/Coming Soon/.test(dash), 'System Status không còn chữ "Coming Soon"');
  ok(/getSetting\("selectedSystemAudioDeviceId", ""\)/.test(nav) && /"NO SYSTEM AUDIO"/.test(nav), 'AI: READY khi đã chọn System Audio, ngược lại NO SYSTEM AUDIO');
  ok(/getDatabaseStatus/.test(nav) && /"ONLINE"/.test(nav) && /"OFFLINE"/.test(nav), 'Database: ONLINE/OFFLINE từ IPC');
  ok(/ipcMain\.handle\("database-status"/.test(main) && /getDatabaseStatus: \(\) => ipcRenderer\.invoke\("database-status"\)/.test(pre), 'main.js + preload.js nối kênh database-status');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]); ok(new Set(ids).size === ids.length, 'setup.html: không trùng id', ids.filter((x, i) => ids.indexOf(x) !== i));
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
