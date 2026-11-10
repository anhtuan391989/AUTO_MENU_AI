// TASK DB-MATCH-ID-02 — chạy: node tests/unit/DbMatchId02.verify.js
// Menu nhận biết ĐÚNG BẢN THU đang phát: cùng tên nhưng khác độ dài (MV/Karaoke/Live) thì KHÔNG ném Key của bản kia vào.
// Server giả trong bộ nhớ (mô phỏng worker.js: /set-song-info trên bài ĐÃ CÓ Key bị từ chối 401), KHÔNG gọi mạng thật.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
const KSS = require(path.join(root, 'core/integration/KeyServerSync.js'));
const { KeyServerSync, makeSongId } = KSS;
const RD = require(path.join(root, 'core/reference/RecordingDuration.js'));
const { createSongDbServerSync } = require(path.join(root, 'core/integration/SongDbServerSync.js'));
const SongMatcher = require(path.join(root, 'core/reference/SongMatcher.js'));
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matchid02-')); SongDatabase.filePath = path.join(tmp, 'songs.json');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m, x === undefined ? '' : x); } };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const clock = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

function makeServer(initial) {
    const songs = initial.map((s) => ({ ...s })); const calls = [];
    const fetchFn = async (url, init) => {
        const u = new URL(url); calls.push(u.pathname); const j = (b, st = 200) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b) });
        if (u.pathname === '/list') return j({ tongBai: songs.length, danhSach: songs.map((s) => ({ songId: s.songId, title: s.title, tongThoiLuong: s.totalSec ? clock(s.totalSec) : 'Chua cap nhat', key: s.key, mode: s.mode })) });
        if (u.pathname === '/song-full') {
            const s = songs.find((x) => x.songId === u.searchParams.get('id'));
            return j(s ? { songId: s.songId, thongTin: { songId: s.songId, title: s.title, totalSec: s.totalSec || null }, tongDoan: s.key ? 1 : 0, doans: s.key ? [{ startSec: 0, endSec: 100, khoa: s.key, mode: s.mode }] : [] }
                : { songId: u.searchParams.get('id'), thongTin: { title: 'Chua dat ten', totalSec: null }, tongDoan: 0, doans: [] });
        }
        if (u.pathname === '/find') { const q = norm(u.searchParams.get('title')); const f = songs.find((s) => norm(s.title) === q && s.key); return j(f ? { found: true, songId: f.songId, title: f.title, key: f.key, mode: f.mode } : { found: false }); }
        if (u.pathname === '/set-song-info') {
            const b = JSON.parse(init.body); const ex = songs.find((x) => x.songId === b.songId);
            if (ex && ex.key) return j({ error: 'can_mat_khau' }, 401); // bài ĐÃ BIẾT: cần mật khẩu quản trị (A83)
            if (ex) { ex.title = b.title; ex.totalSec = b.totalDurationSec; } else songs.push({ songId: b.songId, title: b.title, totalSec: b.totalDurationSec, key: null, mode: null });
            return j({ ok: true });
        }
        if (u.pathname === '/add-segment') { const b = JSON.parse(init.body); const s = songs.find((x) => x.songId === b.songId); s.key = b.key; s.mode = b.mode; return j({ ok: true }); }
        return j({}, 404);
    };
    return { fetchFn, songs, calls };
}
const quiet = { log() {}, warn() {}, error() {} };
const mkKss = (srv, o = {}) => new KeyServerSync({ fetchFn: srv.fetchFn, logger: quiet, strictTitle: true, idLookup: true, ...o });
const T = 'Ngày Đẹp Trời Để Nói Chia Tay';

(async () => {
    // ---- 1. Quy tắc độ dài ----
    ok(RD.durationMismatch(252, 255) === false && RD.durationMismatch(252, 256) === true, 'lệch <= 3 giây = cùng bản; > 3 giây = khác bản');
    ok(RD.durationMismatch(null, 250) === false && RD.durationMismatch(250, 0) === false && RD.durationMismatch(undefined, undefined) === false, 'thiếu độ dài ở một bên -> KHÔNG bác (giữ cách khớp theo tên như cũ)');
    ok(RD.parseClock('04:12') === 252 && RD.parseClock('Chua cap nhat') === null && RD.parseClock('--') === null, 'đọc độ dài "mm:ss" của Server; chuỗi lạ -> null');
    ok(SongMatcher.sameRecording({ durationSec: 200 }, 200) && !SongMatcher.sameRecording({ durationSec: 200 }, 260) && SongMatcher.sameRecording({ key: 'C Major' }, 260), 'SongMatcher.sameRecording: khác độ dài = khác bản; bản ghi chưa có độ dài = giữ như cũ');

    // ---- 2. Tra Server: cùng tên, khác độ dài ----
    let srv = makeServer([{ songId: 'karaoke1', title: T, totalSec: 252, key: 'F', mode: 'major' }]);
    let k = mkKss(srv);
    let r = await k.lookup(T, '', { durationSec: 252 });
    ok(r.found === true && r.key === 'F Major', 'đúng bản thu (cùng độ dài 252s) -> dùng Key Server');
    k = mkKss(srv);
    r = await k.lookup(T, '', { durationSec: 215 });
    ok(r.found === false && r.similar && r.similar.reason === 'duration' && r.similar.serverDurationSec === 252, 'cùng tên nhưng bài đang phát 215s != 252s -> KHÔNG ném Key vào (bản thu khác)');
    ok(k.peek(T, '') === null, 'peek() cũng không trả Key của bản khác');
    k = mkKss(srv);
    r = await k.lookup(T, '');
    ok(r.found === true, 'Menu chưa biết độ dài bài đang phát -> giữ cách cũ (khớp theo tên)');

    // ---- 3. Bộ nhớ đệm tách theo độ dài ----
    k = mkKss(srv);
    const a1 = await k.lookup(T, '', { durationSec: 252 }); const a2 = await k.lookup(T, '', { durationSec: 215 });
    ok(a1.found === true && a2.found === false, 'hai bản cùng tên khác độ dài không dùng chung bộ nhớ đệm');

    // ---- 4. durationResolver (main.js dùng): chỉ tính khi đúng bài đang phát ----
    let hint = { title: T, sec: 215 };
    k = mkKss(srv, { durationResolver: (t) => (hint && norm(hint.title) === norm(t) ? hint.sec : null) });
    r = await k.lookup(T, '');
    ok(r.found === false && r.similar && r.similar.reason === 'duration', 'durationResolver: tự lấy độ dài bài đang phát (215s) -> bác Key bản 252s');
    hint = { title: 'Bài khác hẳn', sec: 215 };
    k = mkKss(srv, { durationResolver: (t) => (hint && norm(hint.title) === norm(t) ? hint.sec : null) });
    r = await k.lookup(T, '');
    ok(r.found === true, 'độ dài của BÀI KHÁC không được áp cho bài này');

    // ---- 5. Gửi Key bản thu thứ hai: không ghi đè bản thứ nhất ----
    srv = makeServer([{ songId: makeSongId(T, ''), title: T, totalSec: 252, key: 'F', mode: 'major' }]); // bản 1 giữ ID mặc định theo tên
    k = mkKss(srv);
    r = await k.submit({ title: T, artist: '', key: 'A# Major', confidence: 0.9, durationSec: 215 });
    ok(r.ok && r.reason === 'submitted', 'bản MV 215s được gửi Key riêng (A# Major)', JSON.stringify(r));
    const own = srv.songs.find((s) => s.songId === makeSongId(T, ''));
    ok(own && own.key === 'F' && own.totalSec === 252, 'bản Karaoke 252s trên Server KHÔNG bị ghi đè (vẫn F Major, 252s)');
    const mine = srv.songs.find((s) => s.songId === makeSongId(T, '', 215));
    ok(mine && mine.key === 'A#' && mine.totalSec === 215, 'bản MV có ID riêng theo độ dài (A# Major, 215s)');
    k = mkKss(srv);
    const rMv = await k.lookup(T, '', { durationSec: 215 }), rKa = await k.lookup(T, '', { durationSec: 252 });
    ok(rMv.found && rMv.key === 'A# Major' && rKa.found && rKa.key === 'F Major', 'sau đó mỗi bản nhận ĐÚNG Key của mình: MV = A# Major, Karaoke = F Major');
    k = mkKss(srv);
    r = await k.submit({ title: T, artist: '', key: 'A# Major', confidence: 0.9, durationSec: 215 });
    ok(r.ok && r.reason === 'server-already-has', 'gửi lại cùng bản thu: không nhân đôi');
    const n0 = srv.songs.length;
    k = mkKss(srv); await k.submit({ title: T, artist: '', key: 'D Major', confidence: 0.9, durationSec: 300 });
    ok(srv.songs.length === n0 + 1, 'bản thu thứ ba (300s) cũng có chỗ riêng, không chặn nhau');

    // ---- 6. Đồng bộ lưu độ dài vào songs.json (để SongMatcher so được ngay, không cần mạng) ----
    srv = makeServer([{ songId: 'a1', title: 'Bai Co Do Dai', totalSec: 252, key: 'C', mode: 'major' }, { songId: 'a2', title: 'Bai Chua Co Do Dai', totalSec: null, key: 'D', mode: 'major' }]);
    SongDatabase.save([]);
    const sync = createSongDbServerSync({ keyServerSync: mkKss(srv), db: SongDatabase, isEnabled: () => true, logger: quiet });
    await sync.run();
    const L = SongDatabase.load(), s1 = L.find((s) => s.songId === 'a1'), s2 = L.find((s) => s.songId === 'a2');
    ok(s1 && s1.durationSec === 252 && s2 && s2.durationSec === undefined, 'kéo từ Server: lưu độ dài 04:12 = 252s; bài chưa có độ dài thì để trống');
    // bài nằm NGOÀI /list: độ dài học qua lượt kiểm từng bài
    SongDatabase.save([{ title: 'Bai Ngoai List', artist: '', key: 'E Major', bpm: 100, modulation: null, notes: 'nguồn: server', songId: 'out1' }]);
    srv = makeServer([{ songId: 'out1', title: 'Bai Ngoai List', totalSec: 199, key: 'E', mode: 'major' }]);
    const origFetch = srv.fetchFn; // /list không trả out1
    const srvOut = { ...srv, fetchFn: async (u, i) => { const p = new URL(u).pathname; if (p === '/list') return { ok: true, status: 200, json: async () => ({ danhSach: [{ songId: 'zz', title: 'Bai Khac', key: 'C', mode: 'major' }] }) }; return origFetch(u, i); } };
    await createSongDbServerSync({ keyServerSync: mkKss(srvOut), db: SongDatabase, isEnabled: () => true, logger: quiet }).run();
    const o1 = SongDatabase.load().find((s) => s.songId === 'out1');
    ok(o1 && o1.durationSec === 199 && o1.bpm === 100, 'bài ngoài /list: học độ dài (199s) qua lượt kiểm, giữ nguyên BPM của máy');

    // ---- 7. main.js đã nối đúng, đường cũ còn nguyên ----
    const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
    ok(/durationResolver:/.test(main) && /nowPlayingDurationHint/.test(main), 'main.js: đưa độ dài bài đang phát cho KeyServerSync');
    ok(/SongMatcher\.findReference\(resolved\.title, resolved\.artist\)/.test(main) && /SongMatcher\.sameRecording\(song, playingDurationSec\)/.test(main), 'main.js: vẫn tra Database cục bộ như cũ, thêm bước kiểm đúng bản thu');
    ok(/keyServerSync\.lookup\(askedTitle, askedArtist\)/.test(main), 'main.js: hỏi Server như cũ (độ dài lấy qua durationResolver)');
    const strip = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(['core/integration/KeyServerSync.js', 'core/integration/SongDbServerSync.js', 'core/reference/SongMatcher.js', 'core/reference/RecordingDuration.js'].every((f) => !/KeyEngine|document\./.test(strip(f))), 'phần sửa KHÔNG chạm KeyEngine / giao diện');

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
