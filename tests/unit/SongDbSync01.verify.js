// DB-SYNC-01 — đồng bộ 2 chiều songs.json <-> Key Server (server giả trong bộ nhớ, không gọi mạng thật).
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };
const { KeyServerSync } = require(path.join(root, 'core/integration/KeyServerSync.js'));
const { createSongDbServerSync, MAX_PUSH_PER_RUN } = require(path.join(root, 'core/integration/SongDbServerSync.js'));
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'songsync-')); SongDatabase.filePath = path.join(tmp, 'songs.json');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// server giả: /list, /find, /set-song-info, /add-segment
function makeServer(initial, down) {
  const songs = initial.map((s, i) => ({ songId: 'srv' + i, title: s.title, key: s.key, mode: s.mode })); const calls = [];
  const fetchFn = async (url, init) => {
    if (down) throw new Error('offline');
    const u = new URL(url); calls.push(u.pathname); const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.pathname === '/list') return j({ tongBai: songs.length, danhSach: songs.map((s) => ({ songId: s.songId, title: s.title, key: s.key, mode: s.mode })) });
    if (u.pathname === '/find') { const q = norm(u.searchParams.get('title')); const f = songs.find((s) => norm(s.title) === q); return j(f ? { found: true, songId: f.songId, title: f.title, key: f.key, mode: f.mode } : { found: false }); }
    if (u.pathname === '/set-song-info') { const b = JSON.parse(init.body); songs.push({ songId: b.songId, title: b.title, key: null, mode: null }); return j({ ok: true }); }
    if (u.pathname === '/add-segment') { const b = JSON.parse(init.body); const s = songs.find((x) => x.songId === b.songId); s.key = b.key; s.mode = b.mode; return j({ ok: true }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, songs, calls };
}
const mk = (srv, enabled = true) => createSongDbServerSync({ keyServerSync: new KeyServerSync({ fetchFn: srv.fetchFn, logger: { log() {}, warn() {}, error() {} } }), db: SongDatabase, isEnabled: () => enabled, logger: { error() {} } });

(async () => {
  SongDatabase.save([
    { title: 'Bài Máy Có', artist: 'A', key: 'D Major', bpm: 100, modulation: null, notes: '' },     // chỉ có ở máy -> đẩy
    { title: 'Bài Chung', artist: 'B', key: '', bpm: 90, modulation: null, notes: '' },            // máy thiếu Key -> điền từ server
    { title: 'Bài Cả Hai', artist: 'C', key: 'C Major', bpm: 80, modulation: null, notes: '' }     // 2 bên khác Key -> giữ Key máy
  ]);
  const srv = makeServer([{ title: 'Bài Server Có', key: 'G', mode: 'minor' }, { title: 'Bài Chung', key: 'F#', mode: 'major' }, { title: 'Bài Cả Hai', key: 'A', mode: 'minor' }]);
  const r = await mk(srv).run();
  ok(r.ok && r.pulled === 1 && r.filled === 1 && r.pushed === 1, 'lượt 1: kéo 1, điền Key 1, đẩy 1', JSON.stringify(r));
  const L = SongDatabase.load(), by = (t) => L.find((s) => s.title === t);
  ok(by('Bài Server Có') && by('Bài Server Có').key === 'G Minor' && by('Bài Server Có').bpm === null, 'bài server được thêm vào máy với Key đúng (G Minor), BPM trống');
  ok(by('Bài Chung').key === 'F# Major' && by('Bài Chung').bpm === 90, 'bài thiếu Key được điền từ server, giữ BPM của máy');
  ok(by('Bài Cả Hai').key === 'A Minor' && by('Bài Cả Hai').bpm === 80 && r.updated === 1, 'DB-REALTIME-01: Server là nguồn chuẩn -> Key đổi theo Server (A Minor), BPM của máy giữ nguyên', JSON.stringify(r));
  ok(srv.songs.some((s) => s.title === 'Bài Máy Có' && s.key === 'D' && s.mode === 'major'), 'bài chỉ có ở máy đã được gửi lên server (D major)');
  ok(srv.songs.length === 4, 'server không bị nhân đôi/thêm rác (4 bài)', srv.songs.length);

  const before = JSON.stringify(SongDatabase.load()), n = srv.songs.length;
  const r2 = await mk(srv).run();
  ok(r2.ok && r2.pulled === 0 && r2.filled === 0 && r2.pushed === 0 && JSON.stringify(SongDatabase.load()) === before && srv.songs.length === n, 'lượt 2: ổn định, không đổi gì (không vòng lặp đồng bộ)', JSON.stringify(r2));

  const off = await mk(makeServer([], true)).run();
  ok(off.ok === false && /Không kết nối/.test(off.error) && JSON.stringify(SongDatabase.load()) === before, 'server mất kết nối: báo lỗi, dữ liệu máy KHÔNG bị đổi');
  const dis = await mk(srv, false).run();
  ok(dis.ok === false && /TẮT/.test(dis.error), 'tắt keyServerAutoSync: không đồng bộ');

  // giới hạn số bài đẩy mỗi lượt
  SongDatabase.save(Array.from({ length: MAX_PUSH_PER_RUN + 5 }, (_, i) => ({ title: 'Song number ' + (1000 + i), artist: 'Z', key: 'C Major', bpm: null, modulation: null, notes: '' })));
  const srv2 = makeServer([]); const r3 = await mk(srv2).run();
  ok(r3.pushed === MAX_PUSH_PER_RUN && r3.pending === 5, 'đẩy tối đa ' + MAX_PUSH_PER_RUN + ' bài/lượt, còn 5 bài chờ lượt sau', JSON.stringify(r3));
  const r4 = await mk(srv2).run();
  ok(r4.pushed === 5 && r4.pending === 0, 'lượt sau đẩy nốt 5 bài còn lại', JSON.stringify(r4));

  // chạy chồng
  const slow = makeServer([{ title: 'Chong Lan Bai', key: 'C', mode: 'major' }]); const sy = mk(slow);
  const [a, b] = await Promise.all([sy.run(), sy.run()]);
  ok([a, b].filter((x) => x.error && /Đang đồng bộ/.test(x.error)).length === 1, 'hai lượt chạy chồng: lượt thứ 2 bị từ chối, không gửi trùng');

  const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
  ok(/type === "sync"/.test(main) && /setTimeout\(full, 15000\)/.test(main) && /10 \* 60 \* 1000/.test(main) && /20 \* 1000/.test(main), 'main.js: nút Đồng bộ + tự chạy sau 15 giây, mỗi 10 phút (đầy đủ) và mỗi 20 giây (nhanh)');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
