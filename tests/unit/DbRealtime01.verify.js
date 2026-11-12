// DB-REALTIME-01 — Server là nguồn chuẩn: Key sửa trên Server -> máy đổi theo; lượt nhanh (light) không đẩy lên; BPM không bị đụng.
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };
const { KeyServerSync } = require(path.join(root, 'core/integration/KeyServerSync.js'));
const { createSongDbServerSync } = require(path.join(root, 'core/integration/SongDbServerSync.js'));
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt01-')); SongDatabase.filePath = path.join(tmp, 'songs.json');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function makeServer(initial) {
  const songs = initial.map((s) => Object.assign({}, s)); const calls = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url); calls.push(u.pathname + (init && init.method === 'POST' ? ':POST' : '')); const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.pathname === '/list') return j({ tongBai: songs.length, danhSach: songs.map((s) => ({ songId: s.songId, title: s.title, key: s.key, mode: s.mode, tongThoiLuong: s.dur })) });
    if (u.pathname === '/find') { const q = norm(u.searchParams.get('title')); const f = songs.find((s) => norm(s.title) === q); return j(f ? { found: true, songId: f.songId, title: f.title, key: f.key, mode: f.mode } : { found: false }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, songs, calls };
}
const mk = (srv) => createSongDbServerSync({ keyServerSync: new KeyServerSync({ fetchFn: srv.fetchFn, logger: { log() {}, warn() {}, error() {} } }), db: SongDatabase, logger: { log() {}, warn() {}, error() {} } });
const by = (t) => SongDatabase.load().find((s) => s.title === t);

(async () => {
  SongDatabase.save([
    { title: 'Bai Mot', artist: '', key: 'C Major', bpm: 90, modulation: null, notes: 'nguồn: server', songId: 'id1' },
    { title: 'Bai Hai', artist: '', key: 'D Major', bpm: 100, modulation: null, notes: '', songId: 'idLocal' },
    { title: 'Bai Ba', artist: '', key: 'E Major', bpm: 80, modulation: null, notes: '', durationSec: 200 },
    { title: 'Bai Bon', artist: '', key: 'F Major', bpm: 70, modulation: null, notes: 'nguồn: server', songId: 'id4' }
  ]);
  const srv = makeServer([
    { songId: 'id1', title: 'Bai Mot', key: 'G', mode: 'minor' },          // Server đổi Key -> máy đổi theo
    { songId: 'idServer', title: 'Bai Hai', key: 'A', mode: 'minor' },     // khác songId = bản thu khác -> KHÔNG đụng
    { songId: 'id3', title: 'Bai Ba', key: 'B', mode: 'major', dur: '4:10' }, // khác độ dài 250s != 200s -> bản thu khác -> KHÔNG đụng
    { songId: 'id4', title: 'Bai Bon', key: 'F', mode: 'major' }           // giống nhau -> không đổi
  ]);

  const r1 = await mk(srv).run({ light: true });
  ok(r1.ok && r1.light === true && r1.updated === 1 && r1.updatedTitles.length === 1 && r1.updatedTitles[0] === norm('Bai Mot'), 'lượt nhanh: cập nhật đúng 1 bài và báo tên bài đổi', JSON.stringify(r1));
  ok(by('Bai Mot').key === 'G Minor' && by('Bai Mot').bpm === 90, 'Key đổi theo Server (G Minor), BPM máy giữ nguyên (90)');
  ok(by('Bai Hai').key === 'D Major', 'khác songId (bản thu khác) -> Key máy giữ nguyên');
  ok(by('Bai Ba').key === 'E Major', 'khác độ dài (bản thu khác) -> Key máy giữ nguyên');
  ok(by('Bai Bon').key === 'F Major', 'Key giống Server -> không đổi');

  const r2 = await mk(srv).run({ light: true });
  ok(r2.ok && r2.updated === 0 && r2.updatedTitles.length === 0, 'lượt nhanh thứ 2: ổn định, không đổi gì', JSON.stringify(r2));

  // lượt nhanh KHÔNG đẩy bài chỉ có ở máy lên Server
  SongDatabase.save(SongDatabase.load().concat([{ title: 'Bai Chi Co O May', artist: '', key: 'A Major', bpm: 60, modulation: null, notes: '' }]));
  srv.calls.length = 0;
  const r3 = await mk(srv).run({ light: true });
  ok(r3.ok && r3.pushed === 0 && !srv.calls.some((c) => /:POST/.test(c)), 'lượt nhanh không gửi (POST) gì lên Server', JSON.stringify(srv.calls));

  // lượt nhanh chỉ kiểm tối đa 5 bài ngoài /list
  SongDatabase.save(Array.from({ length: 8 }, (_, i) => ({ title: 'Bai Ngoai List ' + i, artist: '', key: 'C Major', bpm: null, modulation: null, notes: 'nguồn: server', songId: 'out' + i })));
  const srvEmpty = makeServer([{ songId: 'x', title: 'Bai Khac Hoan Toan', key: 'C', mode: 'major' }]);
  srvEmpty.calls.length = 0;
  const r4 = await mk(srvEmpty).run({ light: true });
  const verifyCalls = srvEmpty.calls.filter((c) => c === '/song-full' || c === '/find').length;
  ok(r4.ok && r4.verifyLeft >= 3, 'lượt nhanh: còn ≥ 3 bài chờ kiểm ở lượt sau', JSON.stringify(r4));
  ok(verifyCalls <= 5 * 3, 'lượt nhanh: số request kiểm tra bị chặn (≤ 15)', verifyCalls);

  console.log('\n' + pass + ' OK, ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
