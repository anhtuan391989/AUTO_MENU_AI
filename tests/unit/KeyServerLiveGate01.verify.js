/**
 * LIVE-SUBMIT-GATE-01 — Kiểm chứng cổng "Key nghe trực tiếp phải chín mới được gửi lên Server".
 * Chạy: node tests/unit/KeyServerLiveGate01.verify.js
 * Server GIẢ trong bộ nhớ + đồng hồ GIẢ. KHÔNG gọi Cloudflare thật, KHÔNG mở Electron.
 * Chứng minh LOGIC. Không chứng minh: hành vi trên Menu thật (cần thử trên máy thật).
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { KeyServerSync } = require(path.join(ROOT, 'core', 'integration', 'KeyServerSync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

// Server giả: chưa có bài nào; ghi lại các lần /add-segment.
function makeServer() {
  const sent = [];
  const fetchFn = async (url, init) => {
    const u = String(url); const body = init && init.body ? JSON.parse(init.body) : null;
    const res = (json) => ({ ok: true, status: 200, json: async () => json });
    if (u.includes('/add-segment')) { sent.push(body); return res({ ok: true }); }
    if (u.includes('/set-song-info')) return res({ ok: true });
    if (u.includes('/song-full')) return res({ doans: [], thongTin: {} });
    if (u.includes('/find')) return res({ found: false });
    return res({});
  };
  return { sent, fetchFn };
}
function makeSync(clock, over) {
  const srv = makeServer();
  const s = new KeyServerSync(Object.assign({ fetchFn: srv.fetchFn, now: () => clock.t, logger: { log() {}, error() {} } }, over || {}));
  return { s, srv };
}
const S = 1000;
// Key trong app có dạng "C Major"; test viết gọn 'C' thì tự thêm ' Major'. Server nhận dạng { key:'C', mode:'major' }.
const call = (s, o) => {
  const x = Object.assign({ title: 'Noi Nay Co Anh', artist: 'Son Tung', key: 'C', confidence: 0.8, durationSec: 278, live: true }, o);
  if (x.key && !/\s/.test(x.key)) x.key += ' Major';
  return s.submit(x);
};

(async () => {
  // 1) Không có cờ live (phân tích file / bản ghi âm / đường cũ): gửi NGAY như trước
  let clock = { t: 0 }, { s, srv } = makeSync(clock);
  let r = await call(s, { live: undefined });
  ok(r.ok && r.reason === 'submitted' && srv.sent.length === 1, 'không có cờ live -> gửi ngay như cũ (hành vi cũ không đổi)');

  // 2) Live, Key chốt sớm -> KHÔNG gửi
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  r = await call(s, { key: 'G#' });
  ok(!r.ok && r.reason === 'too-early' && srv.sent.length === 0, 'Key chốt sớm (giây 0) -> bị chặn "too-early", server chưa nhận gì');
  clock.t = 60 * S; r = await call(s, { key: 'G#' });
  ok(!r.ok && r.reason === 'too-early' && srv.sent.length === 0, 'mới nghe 60 giây -> vẫn chặn');

  // 3) Kịch bản bài 2: G# sai lúc đầu, sửa thành C lúc 18 giây -> server chỉ nhận C, không bao giờ nhận G#
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  for (const [t, k] of [[4, 'G#'], [10, 'G#'], [18, 'C'], [30, 'C'], [50, 'C'], [70, 'C'], [90, 'C']]) { clock.t = t * S; r = await call(s, { key: k }); }
  ok(!r.ok && r.reason === 'too-early', 'lần báo đầu ở giây 4: đến giây 90 mới nghe 86 giây -> chưa đủ');
  clock.t = 95 * S; r = await call(s, { key: 'C' });
  ok(r.ok && r.reason === 'submitted' && srv.sent.length === 1 && srv.sent[0].key === 'C', 'giây 95 (đã nghe 91 giây, giữ C 77 giây) -> gửi C');
  ok(!srv.sent.some((x) => x.key === 'G#'), 'Key sai G# KHÔNG BAO GIỜ tới server');
  clock.t = 100 * S; r = await call(s, { key: 'C' });
  ok(r.ok && r.reason === 'already-submitted' && srv.sent.length === 1, 'sau khi gửi: các lần sau là already-submitted, không gửi trùng');

  // 4) Key đổi muộn (bài 12: G# đến giây 68, sau đó Bm): phải chờ giữ Key mới đủ 30 giây
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  for (const [t, k] of [[0, 'G#'], [30, 'G#'], [60, 'G#'], [68, 'A#']]) { clock.t = t * S; r = await call(s, { key: k }); }
  clock.t = 92 * S; r = await call(s, { key: 'A#' });
  ok(!r.ok && r.reason === 'key-unstable' && srv.sent.length === 0, 'Key vừa đổi lúc 68s, giây 92 mới giữ 24 giây -> chặn "key-unstable" (không gửi G# cũ)');
  clock.t = 100 * S; r = await call(s, { key: 'A#' });
  ok(r.ok && r.reason === 'submitted' && srv.sent.length === 1 && srv.sent[0].key === 'A#', 'giữ đủ 32 giây -> gửi Key mới (A#), không phải G#');

  // 5) Độ tin cậy thấp vẫn bị chặn như cũ (kể cả đã đủ thời gian)
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  clock.t = 0; await call(s, { confidence: 0.8 }); clock.t = 200 * S;
  r = await call(s, { confidence: 0.30 });
  ok(!r.ok && r.reason === 'low-confidence' && srv.sent.length === 0, 'tin cậy 0.30 (< 0.55) vẫn bị chặn như cũ');

  // 6) Im lặng quá lâu rồi phát lại: không thừa hưởng mốc cũ (tránh gửi Key chốt sớm của lần phát sau)
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  clock.t = 0; await call(s, { key: 'G#' });
  clock.t = 2000 * S; r = await call(s, { key: 'G#' });
  ok(!r.ok && r.reason === 'too-early' && srv.sent.length === 0, 'cách 2000 giây mới có báo cáo lại -> đếm lại từ đầu, không gửi ngay');

  // 7) Hai bài khác nhau đếm riêng
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  clock.t = 0; await call(s, { title: 'Bai Mot Ab', key: 'C' }); clock.t = 80 * S; await call(s, { title: 'Bai Hai Cd', key: 'D' });
  clock.t = 100 * S; const a = await call(s, { title: 'Bai Mot Ab', key: 'C' }); const b = await call(s, { title: 'Bai Hai Cd', key: 'D' });
  ok(a.ok && a.reason === 'submitted' && !b.ok && b.reason === 'too-early', 'mỗi bài có đồng hồ riêng (bài 1 đủ 100 giây, bài 2 mới 20 giây)');

  // 8) Bộ nhớ của cổng bị chặn trên (không phình mãi)
  clock = { t: 0 }; ({ s, srv } = makeSync(clock));
  for (let i = 0; i < 260; i++) await call(s, { title: 'Bai so ' + i + ' xyz' });
  ok(s._liveGate.size <= 200, 'sau 260 bài khác nhau, cổng chỉ nhớ <= 200 bài');

  // 9) Tắt cổng bằng cấu hình (0/0): Key live gửi ngay như trước
  clock = { t: 0 }; ({ s, srv } = makeSync(clock, { liveMinListenMs: 0, liveKeyHoldMs: 0 }));
  r = await call(s, { key: 'G#' });
  ok(r.ok && r.reason === 'submitted', 'liveMinListenMs = 0 và liveKeyHoldMs = 0 -> tắt cổng, gửi ngay (để hoàn tác)');

  // 10) Nối dây trong main.js: chỉ đường "server-submit-key" (AI nghe trực tiếp) có live:true; hai đường gửi khác thì không
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  const h = main.slice(main.indexOf('ipcMain.handle("server-submit-key"'), main.indexOf('KEY-SERVER-CORRECT-01 (Bước B)'));
  ok(/keyServerSync\.submit\(\{[\s\S]*live:\s*true/.test(h), 'main.js: "server-submit-key" gọi submit với live:true');
  const others = main.split('\n').filter((l) => /keyServerSync\.submit\(\{ title, artist/.test(l));
  ok(others.length === 2 && others.every((l) => !/live/.test(l)), 'main.js: 2 đường gửi khác (phân tích file, bản ghi âm) KHÔNG có live (không bị chậm)');
  ok(!/live/.test(fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8').split('\n').slice(2410, 2418).join('\n')), 'renderer.js không bị đụng');

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
