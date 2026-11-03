/**
 * KeyServerYtSearchA91.verify.js — TASK A91: server tim thoi luong theo TEN bai (ID app_xxx) + trang chu co o nhap/tim thoi luong.
 * Chay code THAT cua worker.js voi D1 gia + trang tim kiem YouTube gia. Chay: node tests/unit/KeyServerYtSearchA91.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
const check = (c, m) => { if (c) console.log('  ✅ ' + m); else { fails++; console.log('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8').replace(/^export default/m, 'module.exports =') + '\n;module.exports.__parse = phanTichKetQuaTimYouTube;';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports); const w = mod.exports;
check(fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8'), 'worker.js == server/worker.js');
const vr = (id, title, len) => '{"videoRenderer":{"videoId":"' + id + '","thumbnail":{},"title":{"runs":[{"text":"' + title + '"}],"accessibility":{}},"lengthText":{"accessibility":{"accessibilityData":{"label":"x"}},"simpleText":"' + len + '"},"viewCountText":{}}}';
const page = '<html>' + vr('aaaaaaaaaa1', 'Anh Chưa Đủ Tư Cách \\"Karaoke\\"', '4:25') + vr('bbbbbbbbbb2', 'Live', '1:02:03') + '{"videoRenderer":{"videoId":"cccccccccc3","title":{"runs":[{"text":"Dang live"}]}}}' + vr('aaaaaaaaaa1', 'trung', '4:25') + '</html>';
const ds = w.__parse(page);
check(ds.length === 2 && ds[0].videoId === 'aaaaaaaaaa1' && ds[0].durationSec === 265 && ds[0].title === 'Anh Chưa Đủ Tư Cách "Karaoke"', 'doc dung video 1: 4:25 = 265 s, tieu de bo escape');
check(ds[1].durationSec === 3723, '1:02:03 = 3723 s; bo video khong co thoi luong va video trung');
let fetched = [];
globalThis.fetch = async (u) => { fetched.push(u); if (/results/.test(u)) return new Response(page, { status: 200 }); return new Response('"lengthSeconds":"200"', { status: 200 }); };
const db = { prepare(sql) { const q = sql.replace(/\s+/g, ' '); let a = []; const api = { bind(...x) { a = x; return api; }, async first() { if (a[0] === 'app_1234567890abcdef') return { songId: a[0], title: 'Anh Chưa Đủ Tư Cách - Lý Tuấn Kiệt', totalSec: null }; if (a[0] === 'app_noname00000000') return { songId: a[0], title: null }; return null; } }; return api; } };
const J = async (r) => ({ status: r.status, j: await r.json() });
(async () => {
    let r = await J(await w.fetch(new Request('https://x/youtube-search-duration?id=app_1234567890abcdef'), { DB: db }));
    check(r.status === 200 && r.j.cach === 'ten' && r.j.ungVien.length === 2 && /search_query=Anh/.test(fetched[0]), 'ID app_ -> tim theo TEN da luu, tra ung vien (khong luu)');
    r = await J(await w.fetch(new Request('https://x/youtube-search-duration?id=app_noname00000000'), { DB: db }));
    check(r.status === 404 && r.j.error === 'khong_co_ten_bai', 'bai khong co ten -> 404 bao ro');
    r = await J(await w.fetch(new Request('https://x/youtube-search-duration?id=abcDEF12345'), { DB: db }));
    check(r.status === 200 && r.j.cach === 'id' && r.j.ungVien[0].durationSec === 200, 'ID YouTube that -> lay dung video do');
    globalThis.fetch = async () => new Response('<html>nothing</html>', { status: 200 });
    r = await J(await w.fetch(new Request('https://x/youtube-search-duration?id=app_1234567890abcdef'), { DB: db }));
    check(r.status === 502 && r.j.error === 'khong_tim_duoc_tren_youtube', 'YouTube khong co ket qua -> 502 bao ro (nhap tay)');
    const home = await (await w.fetch(new Request('https://x/'), { DB: {} })).text();
    check(/tg-luu/.test(home) && /Tim tren YouTube/.test(home) && /tgChiTiet/.test(home), 'trang chu co o nhap thoi luong + nut Tim tren YouTube (danh sach + chi tiet)');
    console.log(fails ? '\n❌ ' + fails + ' loi' : '\n✅ TAT CA DAT'); process.exit(fails ? 1 : 0);
})();
