// DB-ID-01 — Menu dò theo ID bài hát (song-full) trước, theo tên (/find) sau; dữ liệu vẫn lưu dạng cũ trong songs.json.
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };
const { KeyServerSync, makeSongId } = require(path.join(root, 'core/integration/KeyServerSync.js'));
const { createSongDbServerSync } = require(path.join(root, 'core/integration/SongDbServerSync.js'));
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'songid-')); SongDatabase.filePath = path.join(tmp, 'songs.json');
const SILENT = { log() {}, warn() {}, error() {} };

// server giả: dữ liệu theo songId
function srv(data, mode) {
  const calls = [];
  const fetchFn = async (url) => {
    const u = new URL(url); calls.push(u.pathname + u.search);
    const j = (o, ok = true, status = 200) => ({ ok, status, json: async () => o });
    if (mode === 'down') throw new Error('offline');
    if (u.pathname === '/song-full') { if (mode === 'old') return j({}, false, 404); const d = data[u.searchParams.get('id')]; return j({ doans: d ? [{ startSec: 0, khoa: d.key, mode: d.mode }] : [], thongTin: d ? { title: d.title } : null }); }
    if (u.pathname === '/find') { const f = Object.entries(data).find(([, v]) => v.title === u.searchParams.get('title')); return j(f ? { found: true, songId: f[0], title: f[1].title, key: f[1].key, mode: f[1].mode } : { found: false }); }
    return j({}, false, 404);
  };
  return { fetchFn, calls };
}
(async () => {
  const own = makeSongId('Ten Bai Test', 'Ca Si');
  // 1) ID do app sinh ra từ tên -> dò theo ID, KHÔNG cần /find
  let s = srv({ [own]: { title: 'Ten Bai Test', key: 'A', mode: 'minor' } });
  let c = new KeyServerSync({ fetchFn: s.fetchFn, idLookup: true, logger: SILENT });
  let r = await c.lookup('Ten Bai Test', 'Ca Si');
  ok(r.found && r.key === 'A Minor' && r.songId === own && s.calls.length === 1 && /^\/song-full/.test(s.calls[0]), 'dò theo ID app sinh: trúng ngay bằng /song-full, không hỏi theo tên', JSON.stringify([r, s.calls]));

  // 2) ID đã lưu ở máy (vd ID YouTube từ server) -> thử trước
  s = srv({ yt123: { title: 'Bai Youtube', key: 'F#', mode: 'major' } });
  c = new KeyServerSync({ fetchFn: s.fetchFn, idLookup: true, idResolver: () => ['yt123'], logger: SILENT });
  r = await c.lookup('Bai Youtube', '');
  ok(r.found && r.key === 'F# Major' && r.songId === 'yt123' && s.calls[0].includes('id=yt123'), 'dò theo ID đã lưu ở máy (yt123) trước');

  // 3) không có ID nào -> quay về hỏi theo tên như cũ
  s = srv({ other: { title: 'Bai Khac Ten', key: 'C', mode: 'major' } });
  c = new KeyServerSync({ fetchFn: s.fetchFn, idLookup: true, logger: SILENT });
  r = await c.lookup('Bai Khac Ten', 'X');
  ok(r.found && r.songId === 'other' && s.calls.some((x) => x.startsWith('/find')), 'không trúng ID -> vẫn dò theo tên (/find) như cũ');

  // 4) server cũ chưa có /song-full (404) -> dùng /find
  s = srv({ other: { title: 'Bai Cu', key: 'D', mode: 'major' } }, 'old');
  c = new KeyServerSync({ fetchFn: s.fetchFn, idLookup: true, logger: SILENT });
  r = await c.lookup('Bai Cu', '');
  ok(r.found && r.key === 'D Major', 'server cũ không có /song-full -> vẫn chạy bằng /find');

  // 5) mất mạng -> báo lỗi, không throw
  s = srv({}, 'down'); c = new KeyServerSync({ fetchFn: s.fetchFn, idLookup: true, logger: SILENT });
  r = await c.lookup('Bai Mat Mang', '');
  ok(r.found === false && !!r.error, 'mất mạng: found:false + lỗi, không throw');

  // 6) mặc định TẮT dò ID (giữ hành vi cũ cho code khác)
  s = srv({ [own]: { title: 'Ten Bai Test', key: 'A', mode: 'minor' } });
  c = new KeyServerSync({ fetchFn: s.fetchFn, logger: SILENT }); await c.lookup('Ten Bai Test', 'Ca Si');
  ok(s.calls.every((x) => x.startsWith('/find')), 'không bật idLookup -> chỉ /find như cũ');

  // 7) đồng bộ lưu songId vào songs.json nhưng giữ nguyên định dạng cũ (title/artist/key/bpm/modulation/notes)
  SongDatabase.save([{ title: 'Bai Chung Id', artist: 'A', key: '', bpm: 90, modulation: null, notes: '' }]);
  const list = { danhSach: [{ songId: 'srvA', title: 'Bai Chung Id', key: 'E', mode: 'major' }, { songId: 'srvB', title: 'Bai Moi Server', key: 'B', mode: 'minor' }] };
  const fetchFn = async (url) => ({ ok: true, status: 200, json: async () => (new URL(url).pathname === '/list' ? list : { found: false }) });
  const sync = createSongDbServerSync({ keyServerSync: new KeyServerSync({ fetchFn, logger: SILENT }), db: SongDatabase, logger: SILENT });
  const rs = await sync.run(); const L = SongDatabase.load(), A = L.find((x) => x.title === 'Bai Chung Id'), B = L.find((x) => x.title === 'Bai Moi Server');
  ok(rs.ok && A.songId === 'srvA' && A.key === 'E Major' && A.bpm === 90 && A.artist === 'A', 'bài sẵn có: nhớ thêm songId, giữ nguyên artist/BPM/Key');
  ok(B && B.songId === 'srvB' && ['title', 'artist', 'key', 'bpm', 'modulation', 'notes'].every((k) => k in B), 'bài kéo từ server: vẫn đủ các trường cũ + songId');

  // 8) SongMatcher: bài kéo từ server (artist rỗng) vẫn khớp khi đang phát có ca sĩ
  const SM = require(path.join(root, 'core/reference/SongMatcher.js')); const DB = require(path.join(root, 'core/reference/SongDatabase.js'));
  const old = DB.filePath; DB.filePath = SongDatabase.filePath;
  const m = SM.findReference('Bai Moi Server', 'Ca Si Bat Ky'); DB.filePath = old;
  ok(m && m.key === 'B Minor', 'SongMatcher: bản ghi artist rỗng (từ server) vẫn khớp theo tên');
  const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
  ok(/idLookup: true/.test(main) && /idResolver:/.test(main), 'main.js bật dò theo ID + đọc songId đã lưu ở máy');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
