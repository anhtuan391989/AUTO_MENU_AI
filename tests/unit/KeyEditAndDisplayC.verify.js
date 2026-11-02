/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng "Sửa Key trên server" + "Hiện Key cạnh tên bài" (Task C)
 * Chạy bằng: node tests/unit/KeyEditAndDisplayC.verify.js
 *
 * ⚠️ ĐỌC KỸ: chạy trên Linux sandbox, KHÔNG gọi Cloudflare thật, KHÔNG mở Electron.
 *  - Server: chạy code THẬT của worker.js với D1 giả trong bộ nhớ (chỉ hỗ trợ đúng các câu SQL worker dùng).
 *  - Menu: trích đoạn code THẬT của renderer.js (phần NOW PLAYING + hàm syncNowPlayingKeyText)
 *    chạy trong sandbox vm với DOM giả. KHÔNG chứng minh giao diện Electron thật hiển thị đúng.
 * ==========================================================
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const { KeyServerSync } = require(path.join(ROOT, 'core', 'integration', 'KeyServerSync.js'));

let failCount = 0;
function check(cond, msg) {
    try { assert.ok(cond, msg); console.log('  ✅ ' + msg); }
    catch (e) { failCount++; console.log('  ❌ ' + msg); }
}

function loadWorker(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^export default/m, 'module.exports =')
        + '\n;module.exports.__page = taoTrangChu;';
    const m = { exports: {} };
    new Function('module', 'exports', src)(m, m.exports);
    return m.exports;
}

// ---------- D1 giả (đủ cho /find, /list, /key-at, /set-key) ----------
function makeFakeDb(seed) {
    const songs = ((seed && seed.songs) || []).map((s) => ({ ...s }));
    const segs = ((seed && seed.segs) || []).map((s) => ({ ...s }));
    let tick = 100;
    const log = []; // lịch sử câu ghi
    function stmt(sql) {
        const q = sql.replace(/\s+/g, ' ').trim();
        let args = [];
        const api = {
            bind(...a) { args = a; return api; },
            async first() {
                if (q.startsWith('SELECT song_id as songId, total_duration_sec as totalSec FROM song_info WHERE song_id = ?')) {
                    const s = songs.find((x) => x.songId === args[0]);
                    return s ? { songId: s.songId, totalSec: s.dur || null } : null;
                }
                if (q.startsWith('SELECT song_id as songId, title FROM song_info WHERE song_id = ?')) {
                    const s = songs.find((x) => x.songId === args[0]);
                    return s ? { songId: s.songId, title: s.title } : null;
                }
                if (q.startsWith('SELECT COUNT(*) as n, MIN(created_at) as dauTien FROM song_key_segments WHERE song_id = ?')) { // A83
                    const mine = segs.filter((x) => x.songId === args[0]);
                    const ts = mine.map((s) => s.createdAt).filter((x) => Number.isFinite(x));
                    return { n: mine.length, dauTien: ts.length ? Math.min(...ts) : null };
                }
                if (q.startsWith('SELECT COUNT(*) as n FROM song_key_segments WHERE song_id = ?')) {
                    return { n: segs.filter((x) => x.songId === args[0]).length };
                }
                throw new Error('FakeDb.first: SQL chưa hỗ trợ: ' + q.slice(0, 70));
            },
            async run() {
                log.push(q.slice(0, 40));
                if (dbObj._failOn && q.startsWith(dbObj._failOn)) throw new Error('D1 giả: lỗi cố ý ở ' + dbObj._failOn);
                if (q.startsWith('DELETE FROM song_key_segments WHERE song_id = ? AND start_sec = ?')) { // A83
                    let n = 0;
                    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].songId === args[0] && segs[i].startSec === args[1]) { segs.splice(i, 1); n++; }
                    return { success: true, meta: { changes: n } };
                }
                if (q.startsWith('DELETE FROM song_key_segments WHERE song_id = ?')) {
                    let n = 0;
                    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].songId === args[0]) { segs.splice(i, 1); n++; }
                    return { success: true, meta: { changes: n } };
                }
                if (q.startsWith('DELETE FROM song_info WHERE song_id = ?')) {
                    let n = 0;
                    for (let i = songs.length - 1; i >= 0; i--) if (songs[i].songId === args[0]) { songs.splice(i, 1); n++; }
                    return { success: true, meta: { changes: n } };
                }
                if (q.startsWith('INSERT INTO song_key_segments') && q.includes('VALUES (?, 0, ?, ?, ?, 1.0)')) {
                    const [songId, endSec, key, mode] = args;
                    segs.push({ songId, startSec: 0, endSec, key, mode });
                    return { success: true, meta: { changes: 1 } };
                }
                if (q.startsWith('INSERT INTO song_key_segments')) {
                    const [songId, startSec, endSec, key, mode, , createdAt] = args;
                    segs.push({ songId, startSec, endSec, key, mode, createdAt });
                    return { success: true, meta: { changes: 1 } };
                }
                if (q.startsWith('INSERT OR REPLACE INTO song_info')) {
                    const [songId, title, dur] = args;
                    const i = songs.findIndex((s) => s.songId === songId);
                    const row = { songId, title, dur, updated: ++tick };
                    if (i >= 0) songs[i] = row; else songs.push(row);
                    return { success: true, meta: { changes: 1 } };
                }
                if (q.startsWith('UPDATE song_key_segments SET key = ?, mode = ? WHERE song_id = ? AND start_sec = ?')) {
                    const [key, mode, songId, start] = args; let n = 0;
                    segs.forEach((s) => { if (s.songId === songId && s.startSec === start) { s.key = key; s.mode = mode; n++; } });
                    return { success: true, meta: { changes: n } };
                }
                if (q.startsWith('UPDATE song_key_segments SET key = ?, mode = ? WHERE song_id = ?')) {
                    const [key, mode, songId] = args; let n = 0;
                    segs.forEach((s) => { if (s.songId === songId) { s.key = key; s.mode = mode; n++; } });
                    return { success: true, meta: { changes: n } };
                }
                if (q.startsWith('UPDATE song_info SET updated_at')) {
                    const s = songs.find((x) => x.songId === args[0]); if (s) s.updated = ++tick;
                    return { success: true, meta: { changes: s ? 1 : 0 } };
                }
                throw new Error('FakeDb.run: SQL chưa hỗ trợ: ' + q.slice(0, 70));
            },
            async all() {
                if (q.includes('GROUP BY i.song_id')) {
                    const rows = songs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => {
                        const mine = segs.filter((g) => g.songId === s.songId).sort((a, b) => a.startSec - b.startSec);
                        return { songId: s.songId, title: s.title, tongGiay: s.dur || null, soDoan: mine.length, updated_at: s.updated,
                            key1: mine.length ? mine[0].key : null, mode1: mine.length ? mine[0].mode : null };
                    });
                    return { results: rows };
                }
                if (q.includes('FROM song_info ORDER BY updated_at')) {
                    return { results: songs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => ({ songId: s.songId, title: s.title })) };
                }
                if (q.includes('FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC LIMIT 200')) {
                    return { results: segs.filter((s) => s.songId === args[0]).sort((a, b) => a.startSec - b.startSec).map((s) => ({ key: s.key, mode: s.mode, startSec: s.startSec, endSec: s.endSec })) };
                }
                if (q.includes('WHERE song_id = ? AND start_sec <= ? AND end_sec >= ?')) {
                    const [id, g1, g2] = args;
                    const hit = segs.filter((s) => s.songId === id && s.startSec <= g1 && s.endSec >= g2).sort((a, b) => b.startSec - a.startSec).slice(0, 1);
                    return { results: hit.map((s) => ({ key: s.key, mode: s.mode, startSec: s.startSec, endSec: s.endSec })) };
                }
                throw new Error('FakeDb.all: SQL chưa hỗ trợ: ' + q.slice(0, 70));
            }
        };
        return api;
    }
    // batch = 1 giao dịch như D1 thật: có câu lỗi thì KHÔNG câu nào có hiệu lực (khôi phục lại trạng thái trước).
    const dbObj = {
        prepare: stmt, _songs: songs, _segs: segs, _log: log, _failOn: null,
        async batch(list) {
            const s0 = songs.map((x) => ({ ...x })), g0 = segs.map((x) => ({ ...x }));
            const out = [];
            try { for (const s of list) out.push(await s.run()); }
            catch (e) { songs.length = 0; s0.forEach((x) => songs.push(x)); segs.length = 0; g0.forEach((x) => segs.push(x)); throw e; }
            return out;
        }
    };
    return dbObj;
}

const TOKEN = 'mat-khau-thu-nghiem-123456';
function seed() {
    return makeFakeDb({
        songs: [
            { songId: 'one', title: 'Xin Đừng Rời Xa Anh', dur: 293, updated: 3 },
            { songId: 'multi', title: 'Bài Đổi Giọng Nhiều Đoạn', dur: 300, updated: 2 },
            { songId: 'empty', title: 'Viên Đá Nhỏ', dur: 200, updated: 1 }
        ],
        segs: [
            { songId: 'one', startSec: 0, endSec: 293, key: 'D', mode: 'minor' },
            { songId: 'multi', startSec: 0, endSec: 100, key: 'C', mode: 'major' },
            { songId: 'multi', startSec: 100, endSec: 200, key: 'D', mode: 'major' },
            { songId: 'multi', startSec: 200, endSec: 300, key: 'E', mode: 'major' }
        ]
    });
}

async function call(worker, db, method, p, body, headers = {}, envExtra = {}) {
    const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await worker.fetch(new Request('https://x.test' + p, init), { DB: db, ...envExtra });
    let json = null; try { json = await r.json(); } catch (e) {}
    return { status: r.status, json, headers: r.headers };
}
const AUTH = { Authorization: 'Bearer ' + TOKEN };
const ENV = { ADMIN_TOKEN: TOKEN };
const snap = (db) => JSON.stringify(db._segs) + '|' + JSON.stringify(db._songs);

// ---------- trích code thật từ renderer.js ----------
function extractFn(src, name) {
    const st = src.indexOf(`function ${name}(`);
    if (st < 0) throw new Error('không thấy hàm ' + name);
    let i = src.indexOf('{', st), d = 0;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) { i++; break; } } }
    return src.slice(st, i);
}
function extractNowPlayingIife(src) {
    const st = src.indexOf('(function setupNowPlaying() {');
    if (st < 0) throw new Error('không thấy setupNowPlaying');
    return src.slice(st, src.indexOf('\n})();', st) + 6);
}

(async () => {
    const worker = loadWorker(path.join(ROOT, 'worker.js'));

    console.log('\n[1] Hai bản worker.js giống hệt nhau');
    check(fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8'), 'worker.js == server/worker.js');

    console.log('\n[2] /set-key — quyền sửa (mật khẩu quản trị)');
    {
        let db = seed(); const before = snap(db);
        let r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, AUTH, {});
        check(r.status === 403 && r.json.error === 'chua_cai_ADMIN_TOKEN', 'Chưa cài ADMIN_TOKEN trên server -> TỪ CHỐI (403), không ai sửa được');
        check(snap(db) === before, 'Bị từ chối -> dữ liệu không đổi');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, {}, ENV);
        check(r.status === 401 && r.json.error === 'sai_mat_khau', 'Không gửi mật khẩu -> 401');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { Authorization: 'Bearer sai' }, ENV);
        check(r.status === 401, 'Sai mật khẩu -> 401');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { Authorization: 'Bearer ' + TOKEN + 'x' }, ENV);
        check(r.status === 401, 'Mật khẩu đúng + thừa 1 ký tự -> 401');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { Authorization: 'Bearer ' + TOKEN.slice(0, -1) }, ENV);
        check(r.status === 401, 'Mật khẩu đúng nhưng thiếu 1 ký tự -> 401');
        const sameLenWrong = TOKEN.slice(0, -1) + (TOKEN.slice(-1) === 'x' ? 'y' : 'x');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { Authorization: 'Bearer ' + sameLenWrong }, ENV);
        check(sameLenWrong.length === TOKEN.length && r.status === 401, 'Mật khẩu SAI nhưng CÙNG độ dài (đổi 1 ký tự cuối) -> 401');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { Authorization: 'Bearer ' + TOKEN.toUpperCase() }, ENV);
        check(r.status === 401, 'Mật khẩu đúng nhưng khác chữ hoa/thường -> 401');
        check(snap(db) === before, 'Sai mật khẩu -> dữ liệu không đổi');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, { 'X-Admin-Token': TOKEN }, ENV);
        check(r.status === 200 && r.json.ok === true, 'Mật khẩu đúng qua header X-Admin-Token -> thành công');
        db = seed();
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'major' }, AUTH, ENV);
        check(r.status === 200 && r.json.ok === true, 'Mật khẩu đúng qua Authorization: Bearer -> thành công');

        r = await call(worker, db, 'GET', '/set-key', undefined, AUTH, ENV);
        check(r.status === 404, 'GET /set-key (không phải POST) -> 404, không sửa được bằng đường dẫn thường');

        const pre = await worker.fetch(new Request('https://x.test/set-key', { method: 'OPTIONS' }), { DB: db });
        check(/Authorization/.test(pre.headers.get('Access-Control-Allow-Headers') || ''), 'CORS cho phép header Authorization (trang quản lý gửi được mật khẩu)');
    }

    console.log('\n[3] /set-key — sửa đúng Key');
    {
        let db = seed();
        let r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'Bb', mode: 'Minor' }, AUTH, ENV);
        check(r.json.ok === true && r.json.daSua === 1 && r.json.key === 'A#' && r.json.mode === 'minor' && r.json.keyHienThi === 'A# Minor', 'Bài 1 đoạn: sửa Bb Minor -> lưu A# minor (giáng đổi sang thăng)');
        check(db._segs.filter((s) => s.songId === 'one').length === 1 && db._segs.find((s) => s.songId === 'one').key === 'A#', 'D1: vẫn đúng 1 đoạn, Key đã đổi (không nhân đôi)');
        check(db._segs.find((s) => s.songId === 'one').startSec === 0 && db._segs.find((s) => s.songId === 'one').endSec === 293, 'Mốc thời gian đoạn giữ nguyên');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'multi', key: 'F', mode: 'major' }, AUTH, ENV);
        check(r.status === 409 && r.json.error === 'nhieu_doan' && r.json.tongDoan === 3, 'Bài 3 đoạn, không chỉ định đoạn -> 409, hỏi lại (không đoán bừa)');
        check(db._segs.filter((s) => s.songId === 'multi').map((s) => s.key).join() === 'C,D,E', '409 -> không đoạn nào bị sửa');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'multi', key: 'F', mode: 'minor', startSec: 100 }, AUTH, ENV);
        check(r.json.ok === true && r.json.daSua === 1, 'Chỉ định startSec=100 -> sửa đúng 1 đoạn');
        check(db._segs.filter((s) => s.songId === 'multi').map((s) => s.key + ':' + s.mode).join() === 'C:major,F:minor,E:major', 'Chỉ đoạn giữa đổi sang F minor, hai đoạn còn lại giữ nguyên');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'multi', key: 'G', mode: 'major', startSec: 999 }, AUTH, ENV);
        check(r.status === 404 && r.json.error === 'khong_co_doan', 'startSec không tồn tại -> 404');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'multi', key: 'G', mode: 'major', all: true }, AUTH, ENV);
        check(r.json.ok === true && r.json.daSua === 3 && db._segs.filter((s) => s.songId === 'multi').every((s) => s.key === 'G' && s.mode === 'major'), 'all:true -> cả 3 đoạn đổi sang G major');
        check(db._segs.filter((s) => s.songId === 'multi').map((s) => s.startSec + '-' + s.endSec).join() === '0-100,100-200,200-300', 'all:true -> mốc thời gian giữ nguyên');

        r = await call(worker, db, 'POST', '/set-key', { songId: 'empty', key: 'E', mode: 'minor' }, AUTH, ENV);
        const emptySeg = db._segs.filter((s) => s.songId === 'empty');
        check(r.json.ok === true && emptySeg.length === 1 && emptySeg[0].key === 'E' && emptySeg[0].mode === 'minor' && emptySeg[0].startSec === 0 && emptySeg[0].endSec === 200, 'Bài chưa có đoạn nào ("Viên Đá Nhỏ") -> tạo 1 đoạn cho cả bài theo độ dài bài (200s)');

        const before = snap(db);
        r = await call(worker, db, 'POST', '/set-key', { songId: 'khong-co', key: 'C', mode: 'major' }, AUTH, ENV);
        check(r.status === 404 && r.json.error === 'khong_co_bai', 'Bài không tồn tại -> 404, không tự tạo bài rác');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'H', mode: 'major' }, AUTH, ENV);
        check(r.status === 400 && r.json.error === 'key_khong_hop_le', 'Key "H" -> 400');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'C', mode: 'dorian' }, AUTH, ENV);
        check(r.status === 400 && r.json.error === 'mode_khong_hop_le', 'Mode "dorian" -> 400');
        r = await call(worker, db, 'POST', '/set-key', { key: 'C', mode: 'major' }, AUTH, ENV);
        check(r.status === 400, 'Thiếu songId -> 400');
        r = await call(worker, db, 'POST', '/set-key', { songId: 'one', key: '<script>', mode: 'major' }, AUTH, ENV);
        check(r.status === 400, 'Key chứa mã lạ -> 400');
        check(snap(db) === before, 'Các yêu cầu sai -> dữ liệu không đổi');

        let bad = await worker.fetch(new Request('https://x.test/set-key', { method: 'POST', headers: { ...AUTH }, body: '{rác' }), { DB: db, ...ENV });
        check(bad.status === 500 || bad.status === 400, 'Body không phải JSON -> báo lỗi, không crash (' + bad.status + ')');
    }

    console.log('\n[4] Vòng khép kín: sửa trên server -> Menu tra được Key mới');
    {
        const db = seed();
        const bridge = async (url, init = {}) => worker.fetch(new Request(url, init), { DB: db, ...ENV });
        let t = 1_000_000; const now = () => t;
        const c = new KeyServerSync({ fetchFn: bridge, now, logger: { log() {}, error() {}, warn() {} } });
        let r = await c.lookup('Xin Đừng Rời Xa Anh', 'Lê Gia Bảo');
        check(r.found && r.key === 'D Minor', 'Trước khi sửa: Menu tra ra D Minor');

        await call(worker, db, 'POST', '/set-key', { songId: 'one', key: 'F#', mode: 'major' }, AUTH, ENV);
        r = await c.lookup('Xin Đừng Rời Xa Anh', 'Lê Gia Bảo');
        check(r.found && r.key === 'D Minor', 'Ngay sau khi sửa: Menu vẫn dùng bản nhớ tạm (đúng thiết kế, tránh hỏi liên tục)');
        t += 2 * 60 * 1000 + 1000;
        r = await c.lookup('Xin Đừng Rời Xa Anh', 'Lê Gia Bảo');
        check(r.found && r.key === 'F# Major', 'Sau 2 phút: Menu hỏi lại và nhận Key đã sửa -> "F# Major"');

        const k = await call(worker, db, 'GET', '/key-at?id=one&sec=10');
        check(k.json.found && k.json.key === 'F#' && k.json.mode === 'major', '/key-at (extension/Auto-Tune dùng) cũng thấy Key mới');

        // Menu không ghi đè Key đã sửa: bài đã có trên server -> không gửi
        const f = await c.submit({ title: 'Xin Đừng Rời Xa Anh', artist: 'Lê Gia Bảo', key: 'C Major', confidence: 0.95 });
        check(f.ok === true && f.reason === 'server-already-has' && db._segs.find((s) => s.songId === 'one').key === 'F#', 'Menu tự dò Key khác -> KHÔNG ghi đè Key mà bạn đã sửa trên server');
    }

    console.log('\n[5] /list — hiện Key cạnh tên bài');
    {
        const db = seed();
        const r = await call(worker, db, 'GET', '/list');
        const byId = Object.fromEntries(r.json.danhSach.map((x) => [x.songId, x]));
        check(r.json.tongBai === 3, '/list vẫn trả đủ 3 bài');
        check(byId.one.keyHienThi === 'D Minor' && byId.one.key === 'D' && byId.one.mode === 'minor', 'Bài 1 đoạn: keyHienThi = "D Minor"');
        check(byId.multi.keyHienThi === 'C Major' && byId.multi.soDoan === 3, 'Bài nhiều đoạn: hiện Key của đoạn ĐẦU TIÊN (C Major), soDoan=3');
        check(byId.empty.keyHienThi === null && byId.empty.key === null, 'Bài chưa có đoạn: keyHienThi = null');
        check(['songId', 'title', 'tongThoiLuong', 'soDoan'].every((k) => k in byId.one), 'Các trường cũ (songId, title, tongThoiLuong, soDoan) còn nguyên -> extension yt-key không bị ảnh hưởng');
    }

    console.log('\n[6] Trang quản lý của server');
    {
        const html = worker.__page();
        const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
        let parsed = true; try { new vm.Script(script); } catch (e) { parsed = false; }
        check(parsed, 'Script trong trang quản lý đúng cú pháp');
        check(/id="btnSuaKey"/.test(html) && /id="suaKey"/.test(html) && /id="suaMode"/.test(html) && /id="adminToken"/.test(html) && /type="password" id="adminToken"/.test(html), 'Có khung "Sửa Key": chọn Key, chọn Trưởng/Phụ, ô mật khẩu (ẩn ký tự), nút Lưu');
        check(/\/set-key/.test(script) && /'Authorization': 'Bearer '/.test(script), 'Nút Lưu gọi /set-key kèm mật khẩu');
        check(/keyHienThi/.test(script) && /tag-minor/.test(script), 'Danh sách bài hiện Key cạnh tên bài');
        // Chống chèn mã: không còn nối thẳng dữ liệu từ server vào innerHTML
        const raw = [/\+ bai\.title \+/, /\+ bai\.songId \+/, /\+ d\.khoa \+/, /\+ d\.tu \+/, /\+ d\.den \+/, /\+ d\.cheDo \+/, /\+ ct\.fromDisplay \+/, /\+ ct\.toDisplay \+/, /\+ data\.key \+/, /\+ bai\.keyHienThi \+/];
        check(raw.every((re) => !re.test(script)), 'Không còn nối thẳng dữ liệu server (tên bài, Key...) vào innerHTML');
        const escSrc = extractFn(script, 'esc');
        const sb = {}; vm.createContext(sb); vm.runInContext(escSrc + ';this.esc=esc;', sb);
        check(sb.esc('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;', 'esc() chặn thẻ HTML trong tên bài');
        check(sb.esc('a"b\'c&') === 'a&quot;b&#39;c&amp;' && sb.esc(null) === '' && sb.esc(5) === '5', 'esc() xử lý nháy, &, null, số');
        check(!/`/.test(script) && !/\$\{/.test(script), 'Script trong trang không chứa dấu ` hay ${ (không vỡ chuỗi mẫu của worker)');
    }

    console.log('\n[7] Menu: hiện Key cạnh tên bài (chạy code THẬT của renderer.js)');
    {
        const rend = fs.readFileSync(path.join(ROOT, 'ui', 'js', 'renderer.js'), 'utf8');
        const iife = extractNowPlayingIife(rend);

        function makeEnv() {
            let writes = 0;
            const copyA = { scrollWidth: 10, _t: '' };
            Object.defineProperty(copyA, 'textContent', { get() { return this._t; }, set(v) { this._t = v; writes++; } });
            const els = {
                nowPlayingViewport: { clientWidth: 1000 },
                nowPlayingTrack: { classList: { add() {}, remove() {} }, style: {} },
                nowPlayingCopyA: copyA,
                nowPlayingCopyB: { style: {}, textContent: '' }
            };
            const win = { addEventListener() {} };
            const sb = { document: { getElementById: (id) => els[id] || null }, window: win, requestAnimationFrame: (f) => f(), ResizeObserver: undefined };
            vm.createContext(sb);
            vm.runInContext(iife, sb);
            return { api: win.AutoMenuAI, text: () => copyA.textContent, writes: () => writes };
        }

        const S = (title, artist) => ({ title, artist });
        let e = makeEnv();
        check(e.text() === 'Unavailable', 'Mặc định: "Unavailable" (không kèm Key)');

        e.api.updateNowPlaying(S('Xin Đừng Rời Xa Anh', 'Lê Gia Bảo'));
        check(e.text() === 'Xin Đừng Rời Xa Anh - Lê Gia Bảo', 'Bài mới, chưa có Key: chỉ hiện tên bài (chưa bịa Key)');
        e.api.setNowPlayingKey('D Minor');
        check(e.text() === 'Xin Đừng Rời Xa Anh - Lê Gia Bảo  •  Key: D Minor', 'Có Key -> hiện "… •  Key: D Minor" cạnh tên bài');
        const w = e.writes();
        e.api.setNowPlayingKey('D Minor');
        check(e.writes() === w, 'Key không đổi -> không vẽ lại (chữ chạy không bị giật)');
        e.api.setNowPlayingKey('F# Major');
        check(/Key: F# Major$/.test(e.text()) && !/D Minor/.test(e.text()), 'Key đổi -> cập nhật ngay, không còn Key cũ');

        e.api.updateNowPlaying(S('Xin Đừng Rời Xa Anh', 'Lê Gia Bảo'));
        check(/Key: F# Major$/.test(e.text()), 'Cùng bài gửi lại (vd. cập nhật thứ 2 kèm Key từ server) -> GIỮ Key đang hiện');

        e.api.updateNowPlaying(S('Cơ Hội Cuối', 'Ca sĩ B'));
        check(e.text() === 'Cơ Hội Cuối - Ca sĩ B', 'Đổi sang bài khác -> Key bài trước bị xoá ngay (không hiện nhầm Key)');
        e.api.setNowPlayingKey('A Minor');
        check(e.text() === 'Cơ Hội Cuối - Ca sĩ B  •  Key: A Minor', 'Key bài mới hiện đúng');

        e.api.updateNowPlaying(S('Bài Không Ca Sĩ', ''));
        e.api.setNowPlayingKey('C Major');
        check(e.text() === 'Bài Không Ca Sĩ  •  Key: C Major', 'Bài không có ca sĩ vẫn hiện Key');

        e.api.setNowPlayingKey('');
        check(e.text() === 'Bài Không Ca Sĩ', 'Key rỗng (AI đang dò lại) -> ẩn Key');
        e.api.setNowPlayingKey(null);
        check(e.text() === 'Bài Không Ca Sĩ', 'Key null -> không lỗi, không hiện');

        e.api.updateNowPlaying(null);
        e.api.setNowPlayingKey('C Major');
        check(e.text() === 'No media', '"No media" không bao giờ kèm Key');
        e.api.setNowPlayingUnavailable();
        e.api.setNowPlayingKey('C Major');
        check(e.text() === 'Unavailable', '"Unavailable" không bao giờ kèm Key');
        e.api.updateNowPlaying({ title: '', artist: 'Chỉ có ca sĩ' });
        e.api.setNowPlayingKey('C Major');
        check(e.text() === 'No media', 'Không có tên bài -> "No media", không kèm Key');

        // syncNowPlayingKeyText: chọn đúng Key đang áp dụng
        const getSrcName = extractFn(rend, 'getActiveSourceName');
        const getKeyVal = extractFn(rend, 'getActiveKeyValue');
        const syncFn = extractFn(rend, 'syncNowPlayingKeyText');
        const calls = [];
        const ctx = { window: { AutoMenuAI: { setNowPlayingKey: (k) => calls.push(k) } } };
        vm.createContext(ctx);
        vm.runInContext('let keyEverDetected = false; const keySource = { manual: { active: false, committedKey: null }, songDb: { active: false, value: null }, ai: { value: "C Major" } };'
            + getSrcName + getKeyVal + syncFn, ctx);
        const run = (js) => { calls.length = 0; vm.runInContext(js + ';syncNowPlayingKeyText();', ctx); return calls[calls.length - 1]; };

        check(run('') === '', 'AI chưa chốt Key (LISTENING) -> KHÔNG hiện Key hạt giống "C Major"');
        check(run('keyEverDetected = true; keySource.ai.value = "G# Minor"') === 'G# Minor', 'AI đã chốt Key -> hiện Key AI');
        check(run('keySource.songDb.active = true; keySource.songDb.value = "D Minor"') === 'D Minor', 'Database/Server có bài -> hiện Key đó (ưu tiên hơn AI)');
        check(run('keySource.manual.active = true; keySource.manual.committedKey = "A Major"') === 'A Major', 'Manual đang chọn -> hiện Key Manual (ưu tiên cao nhất)');
        check(run('keySource.manual.active = false; keySource.songDb.active = false; keyEverDetected = false') === '', 'Quay về AI chưa chốt -> ẩn Key');
        check(run('keySource.manual.active = true; keySource.manual.committedKey = null') === '', 'Manual chưa có Key -> không hiện "null"');
        let threw = false; try { vm.runInContext('keySource.ai = null; keySource.manual.active = false; keyEverDetected = true; syncNowPlayingKeyText();', ctx); } catch (er) { threw = true; }
        check(!threw, 'State hỏng -> không ném lỗi (không phá luồng Key)');

        // Nối dây (kiểm tra mã nguồn)
        const rfn = extractFn(rend, 'refreshKeySourceDisplay');
        check(/^function refreshKeySourceDisplay\(\) \{\s*\n\s*if \(typeof syncNowPlayingKeyText === "function"\) syncNowPlayingKeyText\(\);/.test(rfn), 'refreshKeySourceDisplay() gọi syncNowPlayingKeyText() ngay đầu hàm');
        check(/dispatchNowPlayingPayload\(payload\);[^\n]*\n\s*if \(typeof syncNowPlayingKeyText === "function"\) syncNowPlayingKeyText\(\);/.test(rend), 'Sau khi nhận bài mới (IPC), Key đang áp dụng được đẩy vào dòng tên bài');
        check(!/syncNowPlayingKeyText[\s\S]{0,400}keySource\.\w+(\.\w+)* = /.test(syncFn), 'syncNowPlayingKeyText chỉ ĐỌC keySource, không ghi');
    }

    console.log('\n[7b] /delete-song — xoá bài hát (cần mật khẩu + xác nhận)');
    {
        let db = seed(); const before = snap(db);
        const body = { songId: 'one', xacNhan: true };

        let r = await call(worker, db, 'POST', '/delete-song', body, AUTH, {});
        check(r.status === 403 && r.json.error === 'chua_cai_ADMIN_TOKEN', 'Chưa cài ADMIN_TOKEN -> TỪ CHỐI (403), không ai xoá được');
        r = await call(worker, db, 'POST', '/delete-song', body, {}, ENV);
        check(r.status === 401, 'Không gửi mật khẩu -> 401');
        r = await call(worker, db, 'POST', '/delete-song', body, { Authorization: 'Bearer sai' }, ENV);
        check(r.status === 401, 'Sai mật khẩu -> 401');
        const sameLen = TOKEN.slice(0, -1) + (TOKEN.slice(-1) === 'x' ? 'y' : 'x');
        r = await call(worker, db, 'POST', '/delete-song', body, { Authorization: 'Bearer ' + sameLen }, ENV);
        check(r.status === 401, 'Mật khẩu sai nhưng CÙNG độ dài -> 401');
        check(snap(db) === before, 'Bị từ chối -> KHÔNG xoá gì');

        r = await call(worker, db, 'POST', '/delete-song', { songId: 'one' }, AUTH, ENV);
        check(r.status === 400 && r.json.error === 'can_xac_nhan', 'Thiếu xacNhan -> 400, chưa xoá (chống lỡ tay)');
        r = await call(worker, db, 'POST', '/delete-song', { songId: 'one', xacNhan: 'true' }, AUTH, ENV);
        check(r.status === 400, 'xacNhan là chữ "true" (không phải true thật) -> 400');
        r = await call(worker, db, 'POST', '/delete-song', { xacNhan: true }, AUTH, ENV);
        check(r.status === 400, 'Thiếu songId -> 400');
        r = await call(worker, db, 'GET', '/delete-song', undefined, AUTH, ENV);
        check(r.status === 404, 'GET /delete-song (không phải POST) -> 404, không xoá được bằng đường dẫn thường');
        check(snap(db) === before, 'Các yêu cầu sai -> dữ liệu không đổi');

        r = await call(worker, db, 'POST', '/delete-song', { songId: 'multi', xacNhan: true }, AUTH, ENV);
        check(r.status === 200 && r.json.ok === true && r.json.daXoaDoan === 3 && r.json.daXoaBai === 1 && r.json.title === 'Bài Đổi Giọng Nhiều Đoạn', 'Xoá bài 3 đoạn -> báo đã xoá 3 đoạn + 1 bài, kèm tên bài');
        check(!db._songs.some((s) => s.songId === 'multi') && !db._segs.some((s) => s.songId === 'multi'), 'D1: bài và mọi đoạn Key của bài đã mất');
        check(db._songs.length === 2 && db._segs.length === 1 && db._segs[0].songId === 'one', 'Các bài KHÁC nguyên vẹn');

        let f = await call(worker, db, 'GET', '/find?title=' + encodeURIComponent('Bài Đổi Giọng Nhiều Đoạn'));
        check(f.json.found === false, '/find không còn thấy bài đã xoá');
        f = await call(worker, db, 'GET', '/key-at?id=multi&sec=50');
        check(f.json.found === false, '/key-at không còn thấy bài đã xoá');
        f = await call(worker, db, 'GET', '/list');
        check(f.json.tongBai === 2 && !f.json.danhSach.some((x) => x.songId === 'multi'), '/list không còn bài đã xoá');

        r = await call(worker, db, 'POST', '/delete-song', { songId: 'multi', xacNhan: true }, AUTH, ENV);
        check(r.status === 404 && r.json.error === 'khong_co_bai', 'Xoá lần 2 (bài đã mất) -> 404, không lỗi');

        r = await call(worker, db, 'POST', '/delete-song', { songId: 'empty', xacNhan: true }, AUTH, ENV);
        check(r.json.ok === true && r.json.daXoaDoan === 0 && r.json.daXoaBai === 1, 'Bài có thông tin nhưng chưa có đoạn Key ("Viên Đá Nhỏ") xoá được');

        db._segs.push({ songId: 'mo-coi', startSec: 0, endSec: 100, key: 'C', mode: 'major' });
        r = await call(worker, db, 'POST', '/delete-song', { songId: 'mo-coi', xacNhan: true }, AUTH, ENV);
        check(r.json.ok === true && r.json.daXoaDoan === 1 && r.json.daXoaBai === 0 && !db._segs.some((s) => s.songId === 'mo-coi'), 'Đoạn Key "mồ côi" (không có thông tin bài) cũng xoá được');

        const before2 = snap(db);
        r = await call(worker, db, 'POST', '/delete-song', { songId: "one' OR '1'='1", xacNhan: true }, AUTH, ENV);
        check(r.status === 404 && snap(db) === before2, 'ID chứa ký tự SQL lạ -> 404, không xoá nhầm bài nào (truy vấn có tham số)');

        // Giao dịch: lỗi giữa chừng -> không mất gì
        const db2 = seed(); const b2 = snap(db2);
        db2._failOn = 'DELETE FROM song_info';
        r = await call(worker, db2, 'POST', '/delete-song', { songId: 'one', xacNhan: true }, AUTH, ENV);
        check(r.status === 500, 'Lỗi giữa chừng khi xoá -> báo 500');
        check(snap(db2) === b2, 'Lỗi giữa chừng -> KHÔNG mất đoạn Key nào (xoá theo giao dịch: hoặc hết hoặc không)');

        // Vòng khép kín với Menu
        const db3 = seed();
        const bridge = async (url, init = {}) => worker.fetch(new Request(url, init), { DB: db3, ...ENV });
        let t = 5_000_000; const now = () => t;
        const c = new KeyServerSync({ fetchFn: bridge, now, logger: { log() {}, error() {}, warn() {} } });
        let m = await c.lookup('Xin Đừng Rời Xa Anh', 'A');
        check(m.found && m.key === 'D Minor', 'Trước khi xoá: Menu tra ra D Minor');
        await call(worker, db3, 'POST', '/delete-song', { songId: 'one', xacNhan: true }, AUTH, ENV);
        t += 2 * 60 * 1000 + 1000;
        m = await c.lookup('Xin Đừng Rời Xa Anh', 'A');
        check(m.found === false && !m.error, 'Sau khi xoá (hết 2 phút nhớ tạm): Menu hỏi lại -> server không còn bài, Menu tự dò Key như thường');
        const s = await c.submit({ title: 'Xin Đừng Rời Xa Anh', artist: 'A', key: 'F Major', confidence: 0.9 });
        check(s.ok === true && s.reason === 'submitted' && db3._segs.some((x) => x.key === 'F' && x.mode === 'major'), 'Bài đã xoá: khi AI dò xong Menu sẽ gửi lại Key MỚI (đúng thiết kế — xoá Key sai để Menu dò lại cho đúng)');
    }

    console.log('\n[7c] Trang quản lý: nút xoá bài');
    {
        const html = worker.__page();
        const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
        let parsed = true; try { new vm.Script(script); } catch (e) { parsed = false; }
        check(parsed, 'Script trang quản lý (có nút xoá) đúng cú pháp');
        check(/id="btnXoaBai"/.test(html) && /Xoa bai nay/.test(html), 'Có nút "Xoa bai nay"');
        check(/\/delete-song/.test(script) && /xacNhan: true/.test(script) && /'Authorization': 'Bearer '/.test(script), 'Nút xoá gọi /delete-song, gửi xacNhan:true và mật khẩu');
        check(/confirm\('XOA bai/.test(script), 'Có hộp hỏi xác nhận trước khi xoá (không xoá ngay khi bấm)');
        const iConfirm = script.indexOf("confirm('XOA bai"), iFetch = script.indexOf("'/delete-song'");
        check(iConfirm > 0 && iFetch > iConfirm, 'Hộp xác nhận nằm TRƯỚC lệnh gọi xoá');
        check(/Chua nhap mat khau quan tri/.test(script.slice(script.indexOf('async function xoaBai'))), 'Chưa nhập mật khẩu -> báo, không gọi server');
    }

    console.log('\n[8] Phạm vi: không đụng HTML/CSS');
    {
        const { execFileSync } = require('child_process');
        let changed = '';
        try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString(); } catch (e) { changed = ''; }
        const touched = changed.split('\n').filter((l) => /\.(html|css)$/i.test(l.trim()));
        check(touched.length === 0, 'Không có file .html/.css nào bị sửa' + (touched.length ? ': ' + touched.join(',') : ''));
    }

    console.log('\n' + (failCount === 0 ? '✅ TẤT CẢ ĐỀU PASS' : '❌ CÓ ' + failCount + ' LỖI'));
    process.exit(failCount === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(2); });
