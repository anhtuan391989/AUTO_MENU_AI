// TASK OLD-KEY-01 — chạy: node tests/unit/OldKey01.verify.js
// (1) Key CŨ trên Server (extension, tên tab dài) được nhận khi ĐỘ DÀI khớp. (2) Bản thu khác (khác độ dài) vẫn KHÔNG bị gộp.
// (3) Bản ghi "Chua dat ten" bị bỏ qua. (4) Menu chỉ ĐỌC khi tra cứu — không ghi/xoá gì trên Server (key có sẵn không mất).
'use strict';
const fs = require('fs'), path = require('path');
const { KeyServerSync, makeSongId } = require('../../core/integration/KeyServerSync.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const quiet = { log() {} };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

// Server giả giống worker.js 2.4: /find (khớp mờ theo tên), /song-full (độ dài), ghi nhận mọi request.
function makeServer(rows) {
    const calls = [];
    const fetchFn = async (url, init) => {
        const u = new URL(url); const method = (init && init.method) || 'GET'; calls.push(method + ' ' + u.pathname);
        const json = (o, st = 200) => ({ ok: st < 400, status: st, json: async () => o });
        if (u.pathname === '/song-full') {
            const r = rows.find((x) => x.id === u.searchParams.get('id'));
            return json(r ? { doans: r.key ? [{ khoa: r.key, mode: r.mode, startSec: 0 }] : [], thongTin: { title: r.title, totalSec: r.total } } : { doans: [], thongTin: { title: 'Chua dat ten', totalSec: null } });
        }
        if (u.pathname === '/find') {
            const q = norm(u.searchParams.get('title'));
            const okRows = rows.filter((x) => x.key && x.title);
            const r = okRows.find((x) => norm(x.title) === q) || okRows.find((x) => q.length >= 8 && norm(x.title).includes(q)); // giống worker: khớp đúng thắng khớp chứa
            return json(r ? { found: true, songId: r.id, title: r.title, key: r.key, mode: r.mode } : { found: false });
        }
        if (u.pathname === '/list') {
            const clock = (n) => (n > 0 ? String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0') : 'Chua cap nhat');
            return json({ tongBai: rows.length, danhSach: rows.map((x) => ({ songId: x.id, title: x.title || 'Chua dat ten', tongThoiLuong: clock(x.total), soDoan: x.key ? 1 : 0, key: x.key || null, mode: x.mode || null })) });
        }
        if (u.pathname === '/set-song-info' || u.pathname === '/add-segment') return json({ ok: true });
        return json({ error: 'nf' }, 404);
    };
    return { fetchFn, calls };
}
const mk = (srv, dur) => new KeyServerSync({ fetchFn: srv.fetchFn, logger: quiet, strictTitle: true, idLookup: true, durationResolver: () => dur });
const T = 'Ngày Đẹp Trời Để Nói Chia Tay';
const OLD = { id: 'abc123XYZ_0', title: 'NGÀY ĐẸP TRỜI ĐỂ NÓI CHIA TAY - LOU HOÀNG | Official MV', total: 268, key: 'A#', mode: 'major' };

(async () => {
    // 1) Key cũ, tên khác, độ dài khớp (266 vs 268) -> DÙNG
    let s = makeServer([OLD]); let r = await mk(s, 266).lookup(T, '');
    ok(r.found === true && r.key === 'A# Major' && r.songId === OLD.id, '1) Key cũ (tên tab dài) + độ dài khớp -> Menu NHẬN (A# Major)');

    // 2) Cùng tên nhưng bản khác (Karaoke 290s) -> KHÔNG gộp
    s = makeServer([OLD]); r = await mk(s, 290).lookup(T, '');
    ok(r.found === false && r.similar && r.similar.reason === 'duration', '2) Bản khác độ dài (290s vs 268s) -> KHÔNG dùng Key đó (similar, lý do duration)');

    // 3) Windows chưa báo độ dài -> không đủ căn cứ -> KHÔNG dùng (an toàn)
    s = makeServer([OLD]); r = await mk(s, null).lookup(T, '');
    ok(r.found === false && r.similar && r.similar.reason === 'no-playing-duration', '3) Thiếu độ dài bài đang phát -> không dùng (an toàn)');

    // 4) Server chưa có độ dài của bản ghi cũ -> không dùng
    s = makeServer([Object.assign({}, OLD, { total: null })]); r = await mk(s, 266).lookup(T, '');
    ok(r.found === false && r.similar && r.similar.reason === 'no-server-duration', '4) Bản ghi cũ chưa có độ dài trên Server -> không dùng');

    // 5) Tên khớp ĐÚNG -> vẫn dùng như cũ
    s = makeServer([Object.assign({}, OLD, { title: T })]); r = await mk(s, 266).lookup(T, '');
    ok(r.found === true && r.key === 'A# Major', '5) Tên khớp đúng -> dùng như cũ');

    // 6) "Chua dat ten" bị gạt bỏ: /find trả bản ghi tên "Chua dat ten"
    s = makeServer([{ id: 'zzz', title: 'Chua dat ten', total: 200, key: 'F', mode: 'major' }]);
    r = await mk(s, 200).lookup('Chua dat ten', '');
    ok(r.found === false && !r.similar, '6) Bản ghi "Chua dat ten" (qua /find) -> bỏ qua, coi như Server chưa có');

    // 7) "Chua dat ten" qua tra theo ID (idResolver trỏ tới ID đó) -> bỏ qua
    s = makeServer([{ id: 'qqq', title: 'Chua dat ten', total: 200, key: 'F', mode: 'major' }]);
    const k7 = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, strictTitle: true, idLookup: true, idResolver: () => ['qqq'] });
    r = await k7.lookup('Bai Bat Ky Khac', '');
    ok(r.found === false, '7) Bản ghi "Chua dat ten" (qua ID) -> bỏ qua');

    // 8) Hai bản cùng tên: bản MV 268s (key cũ) và bản Menu tự lưu cho Karaoke 290s -> mỗi bản đúng Key của mình
    const KARA = { id: makeSongId(T, '', 290), title: T, total: 290, key: 'F', mode: 'major' };
    s = makeServer([OLD, KARA]);
    let a = await mk(s, 266).lookup(T, ''), b = await mk(s, 291).lookup(T, '');
    ok(a.found && a.key === 'A# Major' && b.found && b.key === 'F Major', '8) 2 bản cùng tên khác độ dài -> mỗi bản nhận ĐÚNG key riêng (A# / F)');

    // 8b) Bản có sẵn trên Server không khớp độ dài bài đang nghe và /list cũng không có bản nào khớp -> không dùng, AI dò bản mới
    s = makeServer([OLD, KARA]); r = await mk(s, 400).lookup(T, '');
    ok(r.found === false, '8b) Không bản nào khớp độ dài (400s) -> không dùng Key nào, để AI dò');

    // 9) KEY CÓ SẴN KHÔNG MẤT: mọi lượt tra cứu chỉ là GET; không có POST/DELETE nào
    s = makeServer([OLD]); const k9 = mk(s, 266); await k9.lookup(T, ''); await k9.lookup(T, '', { force: true });
    await mk(s, 290).lookup(T, ''); await mk(s, null).lookup(T, '');
    ok(s.calls.every((c) => c.startsWith('GET ')), '9) Tra cứu chỉ ĐỌC (toàn GET) — không ghi/xoá gì trên Server');

    // 10) submit(): Key cũ nhận được (found) -> KHÔNG gửi gì lên Server (không ghi đè Key có sẵn)
    s = makeServer([OLD]); const sr = await mk(s, 266).submit({ title: T, artist: '', key: 'F Major', confidence: 0.9, durationSec: 266 });
    ok(sr.ok && sr.reason === 'server-already-has' && !s.calls.some((c) => c.startsWith('POST')), '10) Server đã có Key cũ -> Menu KHÔNG gửi/ghi đè gì');

    // 11) Mã nguồn KeyServerSync.js không có đường XOÁ hay sửa Key trên Server
    const src = fs.readFileSync(path.join(__dirname, '../../core/integration/KeyServerSync.js'), 'utf8');
    ok(!/DELETE|delete-song|set-key/.test(src.replace(/\/\/.*$/gm, '')), '11) KeyServerSync.js không gọi /delete-song, /set-key hay DELETE');

    console.log('\n' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
