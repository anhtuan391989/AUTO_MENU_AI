// TASK DB-SYNC-02 — chạy: node tests/unit/DbSync02.verify.js
// Xoá/thêm trên Server -> data Menu (songs.json) đổi theo. Server giả trong bộ nhớ, KHÔNG gọi mạng thật.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
const { KeyServerSync } = require(path.join(root, 'core/integration/KeyServerSync.js'));
const { createSongDbServerSync, MAX_VERIFY_PER_RUN } = require(path.join(root, 'core/integration/SongDbServerSync.js'));
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'songsync02-')); SongDatabase.filePath = path.join(tmp, 'songs.json');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m, x === undefined ? '' : x); } };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Server giả giống worker.js: /list chỉ trả listLimit bài ĐẦU; /song-full bài không tồn tại -> 200 + thongTin "Chua dat ten" + doans rỗng.
function makeServer(initial, o = {}) {
    const songs = initial.map((s, i) => ({ songId: s.songId || ('srv' + i), title: s.title, key: s.key || 'C', mode: s.mode || 'major' }));
    const calls = [];
    const fetchFn = async (url, init) => {
        const u = new URL(url); calls.push(u.pathname + (init && init.method === 'POST' ? ' POST' : ''));
        const j = (b, st = 200) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b) });
        if (o.down) throw new Error('offline');
        if (u.pathname === '/list') return j({ tongBai: songs.length, danhSach: songs.slice(0, o.listLimit || 100).map((s) => ({ songId: s.songId, title: s.title, key: s.key, mode: s.mode })) });
        if (u.pathname === '/song-full') {
            if (o.oldServer) return j({}, 404);
            if (o.songFullError) return j({ error: 'boom' }, 500);
            const s = songs.find((x) => x.songId === u.searchParams.get('id'));
            return j(s ? { songId: s.songId, thongTin: { songId: s.songId, title: s.title, totalSec: null }, tongDoan: 1, doans: [{ startSec: 0, endSec: 100, khoa: s.key, mode: s.mode }] }
                : { songId: u.searchParams.get('id'), thongTin: { songId: u.searchParams.get('id'), title: 'Chua dat ten', totalSec: null }, tongDoan: 0, doans: [] });
        }
        if (u.pathname === '/find') { const q = norm(u.searchParams.get('title')); const f = songs.find((s) => norm(s.title) === q); return j(f ? { found: true, songId: f.songId, title: f.title, key: f.key, mode: f.mode } : { found: false }); }
        if (u.pathname === '/set-song-info') { const b = JSON.parse(init.body); songs.push({ songId: b.songId, title: b.title, key: null, mode: null }); return j({ ok: true }); }
        if (u.pathname === '/add-segment') { const b = JSON.parse(init.body); const s = songs.find((x) => x.songId === b.songId); s.key = b.key; s.mode = b.mode; return j({ ok: true }); }
        return j({}, 404);
    };
    return { fetchFn, songs, calls };
}
const mk = (srv) => createSongDbServerSync({ keyServerSync: new KeyServerSync({ fetchFn: srv.fetchFn, logger: { log() {} } }), db: SongDatabase, isEnabled: () => true, logger: { log() {}, warn() {}, error() {} } });
const local = (title, key, id, bpm) => ({ title, artist: '', key, bpm: bpm || null, modulation: null, notes: id ? 'nguồn: server' : '', ...(id ? { songId: id } : {}) });
const titles = () => SongDatabase.load().map((s) => s.title);

(async () => {
    // 1) Xoá trên Server -> máy xoá theo; KHÔNG đẩy ngược lên làm bài sống lại; bản sao lưu giữ BPM
    SongDatabase.save([local('Bai Giu Lai', 'C Major', 'a1'), local('Bai Bi Xoa', 'D Major', 'a2', 128), local('Bai Chi Co O May', 'E Major', null)]);
    let srv = makeServer([{ songId: 'a1', title: 'Bai Giu Lai' }]);
    let r = await mk(srv).run();
    ok(r.ok && r.removed === 1, 'bài Server đã xoá -> máy xoá theo (removed=1)', JSON.stringify(r));
    ok(titles().includes('Bai Giu Lai') && !titles().includes('Bai Bi Xoa'), 'songs.json: còn "Bai Giu Lai", mất "Bai Bi Xoa"');
    ok(!srv.songs.some((s) => s.title === 'Bai Bi Xoa'), 'Server KHÔNG bị đẩy bài đã xoá ngược lên (không sống lại)');
    ok(srv.songs.some((s) => s.title === 'Bai Chi Co O May'), 'bài chỉ có ở máy (chưa từng lên Server) vẫn được đẩy lên như cũ');
    const bak = JSON.parse(fs.readFileSync(path.join(tmp, 'songs.removed-by-sync.json'), 'utf8'));
    ok(bak.length === 1 && bak[0].song.title === 'Bai Bi Xoa' && bak[0].song.bpm === 128, 'bài bị xoá được sao lưu (kèm BPM chỉ có ở máy) vào songs.removed-by-sync.json');

    // 2) Ổn định: chạy lại không đổi gì
    const before = JSON.stringify(SongDatabase.load());
    r = await mk(srv).run();
    ok(r.ok && r.removed === 0 && r.pulled === 0 && JSON.stringify(SongDatabase.load()) === before, 'lượt 2: ổn định, không đổi gì');

    // 3) Thêm trên Server -> máy thêm theo
    srv.songs.unshift({ songId: 'n1', title: 'Bai Moi Tren Server', key: 'G', mode: 'minor' });
    r = await mk(srv).run();
    ok(r.pulled === 1 && SongDatabase.load().some((s) => s.title === 'Bai Moi Tren Server' && s.key === 'G Minor'), 'thêm trên Server -> máy thêm theo (G Minor)');

    // 4) /list bị cắt (chỉ 100 bài mới nhất): bài còn trên Server nhưng nằm ngoài /list KHÔNG bị xoá nhầm
    SongDatabase.save([local('Bai Cu Con Ton Tai', 'A Major', 'old1'), local('Bai Cu Da Xoa', 'B Major', 'old2')]);
    srv = makeServer([{ songId: 'x1', title: 'Bai Khac' }, { songId: 'old1', title: 'Bai Cu Con Ton Tai' }], { listLimit: 1 });
    r = await mk(srv).run();
    ok(titles().includes('Bai Cu Con Ton Tai') && !titles().includes('Bai Cu Da Xoa'), '/list bị cắt: bài cũ còn trên Server được giữ, bài cũ đã xoá thì bị xoá');

    // 5) Bài bị xoá rồi tạo lại trên Server với ID MỚI, cùng tên -> giữ (không xoá nhầm)
    SongDatabase.save([local('Bai Tao Lai', 'C Major', 'oldid')]);
    r = await mk(makeServer([{ songId: 'newid', title: 'Bai Tao Lai' }])).run();
    ok(titles().includes('Bai Tao Lai'), 'bài tạo lại trên Server với ID mới, cùng tên -> giữ');

    // 6) AN TOÀN: Server lỗi / chậm / route cũ -> KHÔNG xoá gì
    for (const [name, opt] of [['song-full lỗi 500', { songFullError: true }], ['Server cũ chưa có /song-full', { oldServer: true }]]) {
        SongDatabase.save([local('Bai A', 'C Major', 'p1'), local('Bai B', 'D Major', 'p2')]);
        const bad = makeServer([{ songId: 'zzz', title: 'Bai Khac Han' }], opt);
        r = await mk(bad).run();
        ok(r.ok && r.removed === 0 && titles().length >= 2 && titles().includes('Bai A') && titles().includes('Bai B'), name + ': không xoá gì (không chắc thì giữ)');
    }
    const offline = await mk(makeServer([], { down: true })).run();
    ok(offline.ok === false && titles().includes('Bai A'), 'mất mạng: báo lỗi, dữ liệu máy không đổi');

    // 7) AN TOÀN: Server rỗng/nhầm Server (mất > 50% cùng lúc) -> chặn xoá hàng loạt
    SongDatabase.save(Array.from({ length: 20 }, (_, i) => local('Bai So ' + (100 + i), 'C Major', 'm' + i)));
    r = await mk(makeServer([])).run();
    ok(r.ok && r.removed === 0 && r.removeBlocked === 20 && SongDatabase.load().length === 20, 'Server rỗng: chặn xoá hàng loạt (20/20 bài), không mất dữ liệu', JSON.stringify(r));

    // 8) Giới hạn số bài kiểm mỗi lượt; lượt sau kiểm tiếp
    SongDatabase.save(Array.from({ length: 100 }, (_, i) => local('Bai Gioi Han ' + (1000 + i), 'C Major', 'g' + i)));
    const srv8 = makeServer(Array.from({ length: 100 }, (_, i) => ({ songId: 'g' + i, title: 'Bai Gioi Han ' + (1000 + i) })), { listLimit: 40 }); // /list chỉ thấy 40
    r = await mk(srv8).run();
    ok(r.removed === 0 && r.verifyLeft === 60 - MAX_VERIFY_PER_RUN && SongDatabase.load().length === 100, 'có 60 bài ngoài /list: mỗi lượt chỉ kiểm ' + MAX_VERIFY_PER_RUN + ' bài, bài còn tồn tại đều được giữ', JSON.stringify(r));

    // 9) Không đụng KeyEngine/UI
    const src = fs.readFileSync(path.join(root, 'core/integration/SongDbServerSync.js'), 'utf8');
    ok(!/KeyEngine|renderer|document\./.test(src.replace(/\/\/.*$/gm, '')), 'đồng bộ không chạm KeyEngine/UI');

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
