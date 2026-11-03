/**
 * KeyServerDurationA88.verify.js — TASK A88: server lấy thời lượng bài theo ID + sửa thời lượng bài đã có.
 * Chạy code THẬT của worker.js với D1 giả + fetch YouTube giả. Chạy: node tests/unit/KeyServerDurationA88.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
const check = (c, m) => { if (c) console.log('  ✅ ' + m); else { fails++; console.log('  ❌ ' + m); } };
function loadWorker(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^export default/m, 'module.exports =');
    const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); return m.exports;
}
function makeDb(seed) {
    const songs = (seed || []).map((s) => ({ ...s }));
    return { _songs: songs, prepare(sql) {
        const q = sql.replace(/\s+/g, ' ').trim(); let a = [];
        const api = { bind(...x) { a = x; return api; },
            async first() {
                if (q.startsWith('SELECT song_id as songId, title, total_duration_sec as totalSec FROM song_info WHERE song_id = ?')) return songs.find((s) => s.songId === a[0]) || null;
                throw new Error('first: ' + q.slice(0, 70));
            },
            async all() {
                if (q.includes('WHERE total_duration_sec IS NULL OR total_duration_sec = 0')) return { results: songs.filter((s) => !s.totalSec).map((s) => ({ songId: s.songId, title: s.title })) };
                throw new Error('all: ' + q.slice(0, 70));
            },
            async run() {
                if (q.startsWith('UPDATE song_info SET total_duration_sec = ?')) { songs.find((s) => s.songId === a[1]).totalSec = a[0]; return {}; }
                if (q.startsWith('INSERT INTO song_info (song_id, total_duration_sec')) { songs.push({ songId: a[0], title: null, totalSec: a[1] }); return {}; }
                throw new Error('run: ' + q.slice(0, 70));
            } };
        return api; } };
}
let ytCalls = [];
const ytTable = { abcDEF12345: 215, zzzzzzzzzz1: 3601 };
globalThis.fetch = async (u) => {
    const id = /v=([^&]+)/.exec(u)[1]; ytCalls.push(id);
    if (ytTable[id]) return new Response('<html>..."lengthSeconds":"' + ytTable[id] + '"...</html>', { status: 200 });
    if (id === 'blockedBlk1') return new Response('no', { status: 429 });
    return new Response('<html>no data</html>', { status: 200 });
};
const call = (w, env, p, method, body, token) => w.fetch(new Request('https://x' + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined }), env);
const J = async (r) => ({ status: r.status, j: await r.json() });

(async () => {
    const w = loadWorker(path.join(ROOT, 'worker.js'));
    check(fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8'), 'worker.js == server/worker.js');

    console.log('\n== 1. GET /song-duration ==');
    {
        const db = makeDb([{ songId: 'have0000001', title: 'Có sẵn', totalSec: 180 }]), env = { DB: db, ADMIN_TOKEN: 'sec' };
        let r = await J(await call(w, env, '/song-duration?id=have0000001', 'GET'));
        check(r.status === 200 && r.j.durationSec === 180 && r.j.format === '03:00' && r.j.source === 'server' && ytCalls.length === 0, 'bài đã có thời lượng -> trả từ server, KHÔNG gọi YouTube');
        r = await J(await call(w, env, '/song-duration?id=abcDEF12345', 'GET'));
        check(r.status === 200 && r.j.durationSec === 215 && r.j.source === 'youtube' && r.j.daLuu === true, 'bài chưa có -> lấy từ YouTube theo ID');
        check(db._songs.find((s) => s.songId === 'abcDEF12345').totalSec === 215, 'và đã LƯU vào server');
        r = await J(await call(w, env, '/song-duration?id=abcDEF12345', 'GET'));
        check(r.j.source === 'server' && ytCalls.length === 1, 'lần sau lấy từ server, không gọi lại YouTube');
        r = await J(await call(w, env, '/song-duration?id=app_1234567890abcdef', 'GET'));
        check(r.status === 404 && r.j.error === 'chua_co_thoi_luong', 'ID app_xxx (không phải YouTube) -> 404 báo rõ');
        r = await J(await call(w, env, '/song-duration?id=blockedBlk1', 'GET'));
        check(r.status === 502 && r.j.error === 'khong_lay_duoc_tu_youtube', 'YouTube chặn/lỗi -> 502 báo rõ, không lưu bậy');
        check(!db._songs.find((s) => s.songId === 'blockedBlk1'), 'không tạo dòng khi lấy lỗi');
        r = await J(await call(w, env, '/song-duration', 'GET'));
        check(r.status === 400, 'thiếu id -> 400');
        r = await J(await call(w, env, '/song-duration?id=abcDEF12345&refresh=1', 'GET'));
        check(r.status === 401, 'refresh=1 trên bài đã có thời lượng -> cần mật khẩu');
        ytTable.abcDEF12345 = 220;
        r = await J(await new Promise((res) => call(w, env, '/song-duration?id=abcDEF12345&refresh=1', 'GET', null, 'sec').then(res)));
        check(r.status === 200 && r.j.durationSec === 220 && db._songs.find((s) => s.songId === 'abcDEF12345').totalSec === 220, 'refresh=1 + mật khẩu đúng -> ghi đè 220');
    }

    console.log('\n== 2. POST /set-duration ==');
    {
        const db = makeDb([{ songId: 'blank000001', title: 'Trống', totalSec: null }, { songId: 'known000001', title: 'Đã có', totalSec: 200 }]), env = { DB: db, ADMIN_TOKEN: 'sec' };
        let r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'blank000001', totalDurationSec: 245 }));
        check(r.status === 200 && db._songs[0].totalSec === 245 && db._songs[0].title === 'Trống', 'bài thời lượng trống -> điền được không cần mật khẩu, giữ nguyên tên');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 230 }));
        check(r.status === 401 && db._songs[1].totalSec === 200, 'bài đã có thời lượng, không mật khẩu -> 401, không đổi');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 230 }, 'sai'));
        check(r.status === 401 && db._songs[1].totalSec === 200, 'sai mật khẩu -> 401');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 230 }, 'sec'));
        check(r.status === 200 && r.j.truoc === 200 && db._songs[1].totalSec === 230, 'đúng mật khẩu -> sửa 200 -> 230');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 0 }, 'sec'));
        check(r.status === 400 && r.j.error === 'thoi_luong_khong_hop_le', 'thời lượng 0 -> 400');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 'abc' }, 'sec'));
        check(r.status === 400, 'chữ -> 400');
        r = await J(await call(w, env, '/set-duration', 'POST', { songId: 'new00000001', totalDurationSec: 100 }));
        check(r.status === 200 && db._songs.some((s) => s.songId === 'new00000001' && s.totalSec === 100), 'bài chưa có dòng -> tạo mới');
        r = await J(await call(w, { DB: db }, '/set-duration', 'POST', { songId: 'known000001', totalDurationSec: 111 }));
        check(r.status === 403 && r.j.error === 'chua_cai_ADMIN_TOKEN', 'server chưa cài ADMIN_TOKEN -> từ chối sửa bài đã có');
    }

    console.log('\n== 3. POST /refresh-durations (hàng loạt) ==');
    {
        ytCalls = [];
        const db = makeDb([
            { songId: 'abcDEF12345', title: 'A', totalSec: null },
            { songId: 'zzzzzzzzzz1', title: 'B', totalSec: 0 },
            { songId: 'blockedBlk1', title: 'C', totalSec: null },
            { songId: 'app_1234567890abcdef', title: 'D', totalSec: null },
            { songId: 'okok0000001', title: 'E', totalSec: 99 },
        ]), env = { DB: db, ADMIN_TOKEN: 'sec' };
        ytTable.abcDEF12345 = 215;
        let r = await J(await call(w, env, '/refresh-durations', 'POST', {}));
        check(r.status === 401, 'không mật khẩu -> 401');
        r = await J(await call(w, env, '/refresh-durations', 'POST', { limit: 10 }, 'sec'));
        check(r.status === 200 && r.j.daDienDuoc === 2 && r.j.thatBai === 1 && r.j.boQuaKhongPhaiYouTube === 1 && r.j.conLai === 0, 'điền 2 bài, 1 lỗi, bỏ qua 1 ID app_, còn lại 0');
        check(db._songs[0].totalSec === 215 && db._songs[1].totalSec === 3601, 'thời lượng đã ghi đúng');
        check(db._songs[4].totalSec === 99 && !ytCalls.includes('okok0000001'), 'bài đã có thời lượng KHÔNG bị gọi lại/ghi đè');
        ytCalls = [];
        r = await J(await call(w, env, '/refresh-durations', 'POST', { limit: 1 }, 'sec'));
        check(r.status === 200 && ytCalls.length === 1, 'limit=1 -> chỉ xử lý 1 bài mỗi lần');
    }

    console.log(fails ? '\n❌ ' + fails + ' lỗi' : '\n✅ TẤT CẢ ĐẠT');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
