// SONG-ID-DIAG-01 — chạy: node tests/unit/DiagnoseSongIds01.verify.js
// Kiểm tra công cụ chẩn đoán (CHỈ ĐỌC) bằng dữ liệu và Server giả. Không nối mạng thật.
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const diag = require(path.join(ROOT, 'scripts/diagnose-song-ids.js'));
const { makeSongId } = require(path.join(ROOT, 'core/integration/KeyServerSync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

const GOOD = makeSongId('Ngày Đẹp Trời Để Nói Chia Tay', 'Lou Hoàng');
const songs = [
  { title: 'Ngày Đẹp Trời Để Nói Chia Tay', artist: 'Lou Hoàng', key: 'A# Major', songId: GOOD },
  { title: 'Em Của Ngày Hôm Qua', artist: 'Sơn Tùng', key: 'C Major', songId: 'yt_son' },
  { title: 'Em Của Ngày Hôm Qua', artist: 'Ca Sĩ Khác', key: 'D Major' },
  { title: 'Bài Một', artist: 'X', key: 'E Minor', songId: 'yt123' },
  { title: 'Bài Hai', artist: 'Y', key: 'F Major', songId: 'yt123' },
  { title: 'Bài Lạ', artist: 'Q', key: 'G Major', songId: 'app_0000000000000000' },
  { title: 'Chỉ Có Tên', artist: '', key: 'A Minor', songId: 'yt_cotên' },
  { title: 'Mất Tích', artist: 'Z', key: 'B Major', songId: 'nope' },
  { title: 'Lou Test', artist: '', key: 'A# Major', songId: makeSongId('Lou Test', 'Lou Hoang') },
  { title: 'Vỏ Rỗng', artist: 'Z', key: 'C Major', songId: 'shell' },
];
const fakeServer = (mode) => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url); const u = new URL(url);
    const J = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (mode === 'down') throw new Error('offline');
    if (u.pathname === '/list') return J({ danhSach: [
      { songId: 'yt_a', title: 'Nhạc Chung', key: 'C', mode: 'major' }, { songId: 'app_b', title: 'NHAC CHUNG', key: 'G', mode: 'major' },
      { songId: 'yt123', title: 'Bài Một', key: 'E', mode: 'minor' }] });
    if (u.pathname === '/song-full') {
      const id = u.searchParams.get('id');
      if (id === 'yt123') return J({ thongTin: { title: 'Một Bài Hoàn Toàn Khác' }, doans: [{ startSec: 0, khoa: 'D', mode: 'major' }] });
      if (id === 'nope') return J({ doans: [] });
      if (id === 'shell') return J({ thongTin: { title: 'Chua dat ten' }, doans: [] });
      if (id === songs[8].songId) return J({ thongTin: { title: 'Chua dat ten' }, doans: [] });
      return J({ thongTin: { title: songs.find((s) => s.songId === id).title }, doans: [{ startSec: 0, khoa: 'C', mode: 'major' }] });
    }
    return J({}, 404);
  };
  return { fetchFn, calls };
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-')); const sp = path.join(tmp, 'songs.json');
  fs.writeFileSync(sp, JSON.stringify(songs, null, 4)); const before = fs.readFileSync(sp);
  console.log('[1] Kiểm tra trên máy');
  const L = diag.localChecks(songs);
  ok(L.collisions.length === 1 && /em cua ngay hom qua/.test(L.collisions[0].title), '[A] bắt đúng 1 cặp cùng tên khác ca sĩ');
  ok(L.dupTitles.length === 1 && L.dupTitles[0].entries.length === 2, '[A2] bắt bài xuất hiện 2 lần trên máy');
  ok(L.sharedIds.length === 1 && L.sharedIds[0].songId === 'yt123', '[B] bắt đúng songId yt123 dùng cho 2 bài');
  ok(L.badAppIds.length === 1 && L.badAppIds[0].title === 'Bài Lạ', '[C] bắt đúng ID app_ không khớp (bài CÓ ca sĩ); ID đúng (GOOD) không bị báo');
  ok(!L.badAppIds.some((b) => b.title === 'Lou Test') && L.unrecoverableIds === 1, '[C] bài ca sĩ rỗng mà ID app_ sinh từ ca sĩ thật: KHÔNG báo lỗi, chỉ đếm "không tái tạo được" (tránh báo động giả)');
  ok(L.noId === 1 && L.noArtist === 2, '[D] đếm đúng bài thiếu ID (1) và ca sĩ rỗng (2)');

  console.log('[2] Đối chiếu với Server giả');
  const s = fakeServer('ok');
  const r = await diag.run({ songsPath: sp, fetchFn: s.fetchFn, serverUrl: 'https://server.test', max: 40, out: path.join(tmp, 'logs', 'r.txt') });
  ok(r.srv.ok && r.srv.listCount === 3, 'đọc được /list');
  ok(r.srv.idTitleMismatch.length === 2 && r.srv.idTitleMismatch.every((m) => m.songId === 'yt123' && /Hoàn Toàn Khác/.test(m.serverTitle)), '[E] bắt đúng ID yt123: cả "Bài Một" và "Bài Hai" đều bị Server ghi tên khác (2 bài dùng chung 1 ID)');
  ok(r.srv.idNotFound.length === 1 && r.srv.idNotFound[0].songId === 'nope', 'bắt ID máy giữ mà Server không có');
  ok(r.srv.emptyRecords.length === 2 && r.srv.emptyRecords.every((m) => /chua dat ten/i.test(m.serverTitle)), '[G] bắt 2 bản ghi RỖNG trên Server (tên "Chua dat ten", không có đoạn Key), không lẫn với [E]');
  ok(r.srv.notInList === songs.length - 1, 'đếm đúng số bài trên máy không có trong /list');
  ok(r.srv.dupOnServer.length === 1 && r.srv.dupOnServer[0].records.length === 2, '[F] bắt bài có 2 bản ghi (2 ID) trên Server, Key khác nhau');
  ok(r.report.includes('điểm đáng nghi') && fs.existsSync(path.join(tmp, 'logs', 'r.txt')), 'có báo cáo in ra và ghi file');
  ok(s.calls.every((u) => !/set-key|add-segment|set-song|delete/.test(u)), 'chỉ GET /list và /song-full, không gọi lệnh ghi nào');
  const sAll = fakeServer('ok'); await diag.run({ songsPath: sp, fetchFn: sAll.fetchFn, serverUrl: 'https://server.test', max: Infinity });
  ok(sAll.calls.filter((u) => /song-full/.test(u)).length === songs.filter((x) => x.songId).length, '--max=all hỏi Server TẤT CẢ bài có songId');
  const sMax = fakeServer('ok'); await diag.run({ songsPath: sp, fetchFn: sMax.fetchFn, serverUrl: 'https://server.test', max: 2 });
  ok(sMax.calls.filter((u) => /song-full/.test(u)).length === 2, '--max=2 chỉ hỏi Server 2 bài');

  console.log('[3] Ngoại lệ');
  const off = fakeServer('ok'); const ro = await diag.run({ songsPath: sp, fetchFn: off.fetchFn, offline: true });
  ok(off.calls.length === 0 && /BỎ QUA/.test(ro.report), '--offline: không gọi mạng lần nào');
  const dn = await diag.run({ songsPath: sp, fetchFn: fakeServer('down').fetchFn, serverUrl: 'https://server.test' });
  ok(dn.srv.ok === false && /KHÔNG kết nối/.test(dn.report) && dn.local.collisions.length === 1, 'Server sập: không crash, vẫn có phần kiểm tra trên máy');
  const nf = await diag.run({ songsPath: path.join(tmp, 'khong-co.json'), offline: true });
  ok(/Không đọc được/.test(nf.report), 'thiếu songs.json: báo rõ, không crash');
  ok(Buffer.compare(before, fs.readFileSync(sp)) === 0, 'songs.json KHÔNG bị thay đổi dù chạy bao nhiêu lần (chỉ đọc)');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
