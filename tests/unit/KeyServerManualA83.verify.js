/**
 * KeyServerManualA83.verify.js — TASK A83: server nhận tone nhập tay.
 *  - Bài MỚI: lưu ngay, không cần mật khẩu.
 *  - Bài ĐÃ BIẾT: thêm/sửa bằng tay cần mật khẩu admin (ADMIN_TOKEN).
 *  - Key nhập tự do ("Am", "Eb", "F#m"...) được chuẩn hoá; Key lạ bị từ chối rõ ràng.
 * Chạy code THẬT của worker.js với D1 giả trong bộ nhớ (không gọi Cloudflare thật).
 * Chạy: node tests/unit/KeyServerManualA83.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
const check = (c, m) => { if (c) console.log('  ✅ ' + m); else { fails++; console.log('  ❌ ' + m); } };

function loadWorker(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^export default/m, 'module.exports =') + '\n;module.exports.__tim = timBaiKhopNhat; module.exports.__ct = chuanHoaTen;';
    const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); return m.exports;
}
function makeDb(seed) {
    const songs = [], segs = (seed || []).map((s) => ({ ...s }));
    const db = { _segs: segs, _songs: songs, prepare(sql) {
        const q = sql.replace(/\s+/g, ' ').trim(); let a = [];
        const api = { bind(...x) { a = x; return api; },
            async first() {
                if (q.startsWith('SELECT song_id as songId, title FROM song_info WHERE song_id = ?')) { const s = songs.find((x) => x.songId === a[0]); return s || null; }
                if (q.startsWith('SELECT COUNT(*) as n, MIN(created_at) as dauTien FROM song_key_segments WHERE song_id = ?')) {
                    const mine = segs.filter((s) => s.songId === a[0]); const ts = mine.map((s) => s.createdAt).filter(Number.isFinite);
                    return { n: mine.length, dauTien: ts.length ? Math.min(...ts) : null };
                }
                throw new Error('first: ' + q.slice(0, 60));
            },
            async run() {
                if (q.startsWith('DELETE FROM song_key_segments WHERE song_id = ? AND start_sec = ?')) { for (let i = segs.length - 1; i >= 0; i--) if (segs[i].songId === a[0] && segs[i].startSec === a[1]) segs.splice(i, 1); return {}; }
                if (q.startsWith('INSERT INTO song_key_segments')) { segs.push({ songId: a[0], startSec: a[1], endSec: a[2], key: a[3], mode: a[4], createdAt: a[6] }); return {}; }
                if (q.startsWith('INSERT OR REPLACE INTO song_info')) { songs.push({ songId: a[0], title: a[1] }); return {}; }
                throw new Error('run: ' + q.slice(0, 60));
            } };
        return api; } };
    return db;
}
const post = (w, env, p, body, token) => w.fetch(new Request('https://x' + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) }), env);
const J = async (r) => ({ status: r.status, j: await r.json() });

(async () => {
    const w = loadWorker(path.join(ROOT, 'worker.js'));
    check(fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8'), 'worker.js == server/worker.js');

    console.log('\n== 1. Bài MỚI: lưu ngay, không mật khẩu ==');
    {
        const db = makeDb(), env = { DB: db, ADMIN_TOKEN: 'secret123' };
        let r = await J(await post(w, env, '/add-segment', { songId: 'vid1', startSec: 0, endSec: 100, key: 'Am', mode: 'major' }));
        check(r.status === 200 && r.j.ok === true && r.j.baiDaBiet === false, 'bài mới -> 200 không cần mật khẩu');
        check(db._segs[0].key === 'A' && db._segs[0].mode === 'minor', 'Key "Am" -> A + minor (chuẩn hoá, bất chấp mode major)');
        r = await J(await post(w, env, '/add-segment', { songId: 'vid1', startSec: 101, endSec: 200, key: 'Eb', mode: 'major' }));
        check(r.status === 200 && db._segs[1].key === 'D#' && db._segs[1].mode === 'major', 'đoạn 2 của bài MỚI vẫn thêm được (cửa sổ bài mới); "Eb" -> D#');
        r = await J(await post(w, env, '/add-segment', { songId: 'vid1', startSec: 101, endSec: 200, key: 'F#m' }));
        check(r.status === 200 && db._segs.filter((s) => s.startSec === 101).length === 1 && db._segs.find((s) => s.startSec === 101).key === 'F#', 'cùng startSec -> thay, không nhân đôi');
        r = await J(await post(w, env, '/add-segment', { songId: 'vid2', startSec: 0, endSec: 50, key: 'H', mode: 'major' }));
        check(r.status === 400 && r.j.error === 'key_khong_hop_le', 'Key lạ -> 400 key_khong_hop_le (không lưu sai)');
        r = await J(await post(w, env, '/set-song-info', { songId: 'vid1', title: 'Bài thử' }));
        check(r.status === 200, 'set-song-info bài mới -> được');
    }

    console.log('\n== 1b. Thêm đoạn mà CHƯA bấm "Lưu Thông Tin Bài": server tự tạo thông tin để Menu tra được ==');
    {
        const db = makeDb(), env = { DB: db, ADMIN_TOKEN: 'secret123' };
        let r = await J(await post(w, env, '/add-segment', { songId: 'noinfo', startSec: 0, endSec: 90, key: 'G', mode: 'major', title: 'Thương Em', totalDurationSec: 250 }));
        check(r.status === 200 && r.j.taoThongTinBai === true && db._songs.length === 1 && db._songs[0].title === 'Thương Em', 'chưa có thông tin bài -> server tự tạo (có tên để /find tra được)');
        r = await J(await post(w, env, '/add-segment', { songId: 'noinfo', startSec: 91, endSec: 150, key: 'C', mode: 'major', title: 'Thương Em' }));
        check(r.status === 200 && r.j.taoThongTinBai === false && db._songs.length === 1, 'đã có thông tin -> không tạo trùng');
        r = await J(await post(w, env, '/add-segment', { songId: 'notitle', startSec: 0, endSec: 90, key: 'G' }));
        check(r.status === 200 && db._songs.length === 1, 'không gửi tên (Menu tự dò) -> không đụng bảng thông tin bài như cũ');
    }

    console.log('\n== 2. Bài ĐÃ BIẾT (cũ): cần mật khẩu admin ==');
    {
        const old = Date.now() - 31 * 60 * 1000;
        const db = makeDb([{ songId: 'known', startSec: 0, endSec: 200, key: 'C', mode: 'major', createdAt: old }]);
        const env = { DB: db, ADMIN_TOKEN: 'secret123' };
        let r = await J(await post(w, env, '/add-segment', { songId: 'known', startSec: 0, endSec: 200, key: 'D', mode: 'minor' }));
        check(r.status === 401 && r.j.error === 'can_mat_khau_admin', 'không mật khẩu -> 401 can_mat_khau_admin');
        check(db._segs.length === 1 && db._segs[0].key === 'C', 'dữ liệu cũ KHÔNG bị đổi khi bị từ chối');
        r = await J(await post(w, env, '/add-segment', { songId: 'known', startSec: 0, endSec: 200, key: 'D', mode: 'minor' }, 'sai'));
        check(r.status === 401 && r.j.error === 'sai_mat_khau', 'sai mật khẩu -> 401 sai_mat_khau');
        r = await J(await post(w, env, '/add-segment', { songId: 'known', startSec: 0, endSec: 200, key: 'D', mode: 'minor' }, 'secret123'));
        check(r.status === 200 && r.j.ok && db._segs.length === 1 && db._segs[0].key === 'D' && db._segs[0].mode === 'minor', 'đúng mật khẩu -> cập nhật luôn (thay đoạn cùng startSec)');
        r = await J(await post(w, env, '/set-song-info', { songId: 'known', title: 'Đổi tên' }));
        check(r.status === 401 && r.j.error === 'can_mat_khau_admin', 'set-song-info bài đã biết không mật khẩu -> 401');
        r = await J(await post(w, env, '/set-song-info', { songId: 'known', title: 'Đổi tên' }, 'secret123'));
        check(r.status === 200, 'set-song-info bài đã biết + đúng mật khẩu -> được');
        r = await J(await post(w, { DB: db }, '/add-segment', { songId: 'known', startSec: 5, endSec: 9, key: 'E' }));
        check(r.status === 403 && r.j.error === 'chua_cai_ADMIN_TOKEN', 'chưa cài ADMIN_TOKEN -> 403 (không để ai cũng sửa)');
    }
    console.log('\n== 3. Extension yt-key: gửi mật khẩu khi bài đã biết (kiểm tĩnh) ==');
    {
        const pj = fs.readFileSync(path.join(ROOT, 'yt-key', 'popup.js'), 'utf8');
        const ph = fs.readFileSync(path.join(ROOT, 'yt-key', 'popup.html'), 'utf8');
        const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-key', 'manifest.json'), 'utf8'));
        check(/headers\["Authorization"\] = "Bearer " \+ mk/.test(pj), 'popup.js gửi Authorization: Bearer <mật khẩu>');
        check(/title: document\.getElementById\("tenBai"\)/.test(pj), 'add-segment gửi kèm tên + thời lượng');
        check(/guiServer\("\/add-segment"/.test(pj) && /guiServer\("\/set-song-info"/.test(pj), 'cả set-song-info và add-segment đi qua guiServer');
        check(/can_mat_khau_admin/.test(pj) && /hienOMatKhau\(\)/.test(pj) && /id = "khoiMatKhau"/.test(pj) && /id="matKhauAdmin"/.test(pj), 'ô nhập mật khẩu tạo bằng JS, tự hiện khi server báo bài đã biết');
        check(!/khoiMatKhau|matKhauAdmin/.test(ph), 'popup.html KHÔNG bị sửa (không đổi HTML)');
        check(mf.permissions.includes('storage'), 'manifest có quyền storage (nhớ mật khẩu tới khi đóng trình duyệt)');
    }
    console.log('\n== 4. Menu tra bài theo TÊN: tên YouTube có chữ chen thêm vẫn khớp (ca thật: "Karaoke") ==');
    {
        const songs = [
            { songId: 'tB1abwou1Aw', title: 'Thương Ly Biệt Karaoke Tone Nữ Nhạc Trẻ Rumba 2025 Mới Nhất' },
            { songId: 'app_9a3d', title: 'Em Thua Cô Ta (R&B Synth-Pop Version) - QuanFM x MiAn x KAi | Nhạc Hot Tiktok' },
            { songId: 'other', title: 'Thương Em Karaoke Tone Nam' }
        ];
        const menu = w.__ct('Thương Ly Biệt Tone Nữ Nhạc Trẻ Rumba 2025 Mới Nhất');
        const hit = w.__tim(songs, menu, w.__ct('SONG NHIEN'));
        check(hit && hit.songId === 'tB1abwou1Aw', 'Menu "Thương Ly Biệt Tone Nữ…" khớp bài "Thương Ly Biệt Karaoke Tone Nữ…" (trước đây trượt)');
        check(!w.__tim(songs, w.__ct('Thương Em Quá Nhiều Rồi'), ''), 'bài khác tên (chỉ trùng 1–2 từ) KHÔNG bị khớp nhầm');
        const exact = w.__tim([{ songId: 'a', title: 'Thương Ly Biệt Karaoke Tone Nữ Nhạc Trẻ Rumba 2025 Mới Nhất' }, { songId: 'b', title: 'Thương Ly Biệt Tone Nữ Nhạc Trẻ Rumba 2025 Mới Nhất' }], menu, '');
        check(exact && exact.songId === 'b', 'khớp đúng hẳn vẫn thắng khớp mờ');
    }
    console.log(fails ? `\n❌ ${fails} LỖI` : '\n✅ TẤT CẢ ĐẠT');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
