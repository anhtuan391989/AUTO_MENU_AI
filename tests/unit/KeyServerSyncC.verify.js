/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng KeyServerSync + route /find của worker.js (Task C)
 * Chạy bằng: node tests/unit/KeyServerSyncC.verify.js
 *
 * ⚠️ ĐỌC KỸ: bộ test chạy trên Linux sandbox, KHÔNG gọi Cloudflare thật.
 * Client (KeyServerSync) được nối THẲNG vào code thật của worker.js, còn
 * D1 là bản giả trong bộ nhớ (chỉ hỗ trợ đúng các câu SQL mà worker dùng).
 * => Chứng minh LOGIC đúng (tra theo tên, gửi 1 lần, không nhân đôi, lỗi
 * mạng không throw). KHÔNG chứng minh: Cloudflare thật đã dán code mới,
 * D1 thật có dữ liệu, mạng Windows thật — phải thử trên máy thật.
 * ==========================================================
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KSS = require(path.join(ROOT, 'core', 'integration', 'KeyServerSync.js'));
const { KeyServerSync } = KSS;

let failCount = 0;
function check(cond, msg) {
    try { assert.ok(cond, msg); console.log('  ✅ ' + msg); }
    catch (e) { failCount++; console.log('  ❌ ' + msg); }
}

// ---------- Nạp worker.js thật (ESM `export default` -> CommonJS) ----------
function loadWorker(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^export default/m, 'module.exports =')
        + '\n;module.exports.__chuanHoaTen = chuanHoaTen;';
    const m = { exports: {} };
    new Function('module', 'exports', src)(m, m.exports);
    return m.exports;
}

// ---------- D1 giả trong bộ nhớ ----------
function makeFakeDb(seed) {
    const songs = (seed && seed.songs) ? seed.songs.map((s) => ({ ...s })) : [];
    const segs = (seed && seed.segs) ? seed.segs.map((s) => ({ ...s })) : [];
    let tick = 0;
    function stmt(sql) {
        const q = sql.replace(/\s+/g, ' ').trim();
        let args = [];
        const api = {
            bind(...a) { args = a; return api; },
            async run() {
                if (q.startsWith('INSERT OR REPLACE INTO song_info')) {
                    const [songId, title, dur, note] = args;
                    const i = songs.findIndex((s) => s.songId === songId);
                    const row = { songId, title, dur, note, updated: ++tick };
                    if (i >= 0) songs[i] = row; else songs.push(row);
                    return { success: true };
                }
                if (q.startsWith('INSERT INTO song_key_segments')) {
                    const [songId, startSec, endSec, key, mode, weight] = args;
                    segs.push({ songId, startSec, endSec, key, mode, weight });
                    return { success: true };
                }
                throw new Error('FakeDb.run: SQL chưa hỗ trợ: ' + q.slice(0, 60));
            },
            async all() {
                if (q.includes('FROM song_info ORDER BY updated_at')) {
                    return { results: songs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => ({ songId: s.songId, title: s.title })) };
                }
                if (q.includes('FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC LIMIT 200')) {
                    return { results: segs.filter((s) => s.songId === args[0]).sort((a, b) => a.startSec - b.startSec).map((s) => ({ key: s.key, mode: s.mode, startSec: s.startSec, endSec: s.endSec })) };
                }
                throw new Error('FakeDb.all: SQL chưa hỗ trợ: ' + q.slice(0, 60));
            }
        };
        return api;
    }
    return { prepare: stmt, _songs: songs, _segs: segs };
}

// fetchFn nối thẳng client vào worker thật; ghi lại mọi lời gọi.
function makeBridge(worker, db, opts = {}) {
    const calls = [];
    const env = { DB: db };
    const fn = async (url, init = {}) => {
        const u = new URL(url);
        calls.push({ method: init.method || 'GET', path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : null });
        if (opts.failWith) return opts.failWith(u, init);
        return worker.fetch(new Request(url, init), env);
    };
    fn.calls = calls;
    return fn;
}

function clock(start = 1_000_000) {
    let t = start;
    const now = () => t;
    now.advance = (ms) => { t += ms; };
    return now;
}

const SILENT = { log() {}, error() {}, warn() {} };
const YT_TITLE = 'Karaoke 2 Trong 1 | QUÊN MỘT LỜI THỀ - Tone Nam';

(async () => {
    const worker = loadWorker(path.join(ROOT, 'worker.js'));

    console.log('\n[1] Hai bản worker.js phải giống hệt nhau (root + server/)');
    check(fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8'), 'worker.js == server/worker.js');

    console.log('\n[2] Chuẩn hoá tên: client và worker PHẢI cho kết quả giống nhau');
    const samples = ['Quên Một Lời Thề', 'ĐÊM NAY Đừng Ngủ!!', '  Hello,   World (Official MV) ', 'Café — Müller', 'A', '', null, 'Tình ca 2 | 3'];
    check(samples.every((s) => KSS.normalizeTitle(s) === worker.__chuanHoaTen(s)), 'normalizeTitle(client) == chuanHoaTen(worker) trên ' + samples.length + ' mẫu');
    check(KSS.normalizeTitle('Quên Một Lời Thề') === 'quen mot loi the', 'Bỏ dấu + chữ thường đúng');

    console.log('\n[3] Đổi Key app <-> server');
    check(KSS.serverKeyToAppKey('C', 'major') === 'C Major', 'C major -> "C Major"');
    check(KSS.serverKeyToAppKey('G#', 'minor') === 'G# Minor', 'G# minor -> "G# Minor"');
    check(KSS.serverKeyToAppKey('Bb', 'Minor') === 'A# Minor', 'Bb Minor -> "A# Minor" (giáng đổi sang thăng)');
    check(KSS.serverKeyToAppKey('d', 'MAJ') === 'D Major', 'chữ thường / viết tắt vẫn đọc được');
    check(KSS.serverKeyToAppKey('H', 'major') === null && KSS.serverKeyToAppKey('C', 'dorian') === null, 'Key/mode lạ -> null');
    const k1 = KSS.appKeyToServerKey('F# Minor');
    check(k1 && k1.key === 'F#' && k1.mode === 'minor', '"F# Minor" -> {F#, minor}');
    check(KSS.appKeyToServerKey('C') === null && KSS.appKeyToServerKey('X Major') === null && KSS.appKeyToServerKey('') === null, 'Key app không hợp lệ -> null');
    check(KSS.makeSongId('Quên Một Lời Thề', 'A') === KSS.makeSongId('quen mot loi the', 'a'), 'songId ổn định, không phụ thuộc dấu/hoa thường');
    check(KSS.makeSongId('Bài 1', 'X') !== KSS.makeSongId('Bài 2', 'X'), 'songId khác nhau cho bài khác nhau');

    console.log('\n[4] Route /find của worker.js thật (D1 giả)');
    {
        const db = makeFakeDb({
            songs: [
                { songId: 'vid1', title: YT_TITLE, updated: 2 },
                { songId: 'vid2', title: 'Hello World Karaoke', updated: 1 },
                { songId: 'vid3', title: 'Bai chua co doan nao', updated: 3 }
            ],
            segs: [
                { songId: 'vid1', startSec: 60, endSec: 120, key: 'E', mode: 'major' },
                { songId: 'vid1', startSec: 0, endSec: 59, key: 'D', mode: 'minor' },
                { songId: 'vid2', startSec: 0, endSec: 200, key: 'C', mode: 'major' }
            ]
        });
        const call = async (qs) => { const r = await worker.fetch(new Request('https://x.test/find' + qs), { DB: db }); return { status: r.status, json: await r.json() }; };

        let r = await call('?title=' + encodeURIComponent('Quên Một Lời Thề') );
        check(r.status === 200 && r.json.found === true && r.json.songId === 'vid1', 'Tên Menu nằm TRONG tên YouTube -> tìm đúng bài');
        check(r.json.key === 'D' && r.json.mode === 'minor' && r.json.startSec === 0, 'Trả Key của đoạn ĐẦU TIÊN (start nhỏ nhất)');
        check(r.json.tongDoan === 2, 'Báo đúng tổng số đoạn');

        r = await call('?title=' + encodeURIComponent(YT_TITLE.toUpperCase()));
        check(r.json.found === true && r.json.songId === 'vid1', 'Không phân biệt hoa/thường, khớp đúng hẳn');

        r = await call('?title=' + encodeURIComponent('hello world karaoke 2024 official'));
        check(r.json.found === true && r.json.songId === 'vid2', 'Tên Menu DÀI hơn tên server (chứa tên server) -> vẫn khớp');

        r = await call('?title=' + encodeURIComponent('Một bài hát không tồn tại'));
        check(r.status === 200 && r.json.found === false, 'Bài không có -> found:false (200)');

        r = await call('?title=' + encodeURIComponent('Bai chua co doan nao'));
        check(r.json.found === false, 'Bài có info nhưng CHƯA có đoạn Key -> found:false');

        r = await call('?title=ab');
        check(r.status === 400 && r.json.found === false, 'Tên quá ngắn -> 400, found:false');

        r = await call('');
        check(r.status === 400, 'Thiếu title -> 400');

        r = await call('?title=' + encodeURIComponent('Hello'));
        check(r.json.found === false, 'Tên ngắn (<8 ký tự) KHÔNG khớp kiểu "chứa" (tránh nhầm bài)');

        // Route cũ vẫn chạy
        const old = await worker.fetch(new Request('https://x.test/nonexistent'), { DB: db });
        check(old.status === 404, 'Route lạ vẫn trả 404 như cũ');
        const opt = await worker.fetch(new Request('https://x.test/find', { method: 'OPTIONS' }), { DB: db });
        check(opt.status === 200, 'OPTIONS (CORS) vẫn chạy');
    }

    console.log('\n[5] Client: lookup');
    {
        const db = makeFakeDb({ songs: [{ songId: 'vid1', title: YT_TITLE, updated: 1 }], segs: [{ songId: 'vid1', startSec: 0, endSec: 258, key: 'D', mode: 'minor' }] });
        const f = makeBridge(worker, db);
        const now = clock();
        const c = new KeyServerSync({ fetchFn: f, now, logger: SILENT });

        let r = await c.lookup('Quên Một Lời Thề', 'Ca sĩ A');
        check(r.found === true && r.key === 'D Minor' && r.songId === 'vid1' && r.source === 'server', 'Trúng: key đã đổi sang định dạng app ("D Minor")');
        check(f.calls.length === 1 && f.calls[0].path === '/find', 'Gọi đúng 1 lần /find');
        check(c.peek('Quên Một Lời Thề', 'Ca sĩ A') && c.peek('Quên Một Lời Thề', 'Ca sĩ A').key === 'D Minor', 'peek() thấy kết quả trong cache (không gọi mạng)');
        await c.lookup('Quên Một Lời Thề', 'Ca sĩ A');
        check(f.calls.length === 1, 'Hỏi lại cùng bài -> dùng cache, KHÔNG gọi mạng');

        now.advance(11 * 60 * 1000);
        check(c.peek('Quên Một Lời Thề', 'Ca sĩ A') === null, 'Hết hạn cache (10 phút) -> peek() trả null');
        await c.lookup('Quên Một Lời Thề', 'Ca sĩ A');
        check(f.calls.length === 2, 'Hết hạn -> hỏi lại server');

        const m1 = await c.lookup('Bài Không Có Trên Server', 'X');
        check(m1.found === false && !m1.error, 'Server không có bài -> found:false, không lỗi');
        const n = f.calls.length;
        await c.lookup('Bài Không Có Trên Server', 'X');
        check(f.calls.length === n, 'Trượt cũng được nhớ (không dội server mỗi sự kiện)');
        now.advance(61 * 1000);
        await c.lookup('Bài Không Có Trên Server', 'X');
        check(f.calls.length === n + 1, 'Sau 60 giây hỏi lại bài trượt (phòng có người vừa gửi)');

        // Hỏi đồng thời cùng bài -> chỉ 1 lời gọi
        const f2 = makeBridge(worker, db);
        const c2 = new KeyServerSync({ fetchFn: f2, now: clock(), logger: SILENT });
        const [a, b] = await Promise.all([c2.lookup('Quên Một Lời Thề', 'A'), c2.lookup('Quên Một Lời Thề', 'A')]);
        check(f2.calls.length === 1 && a.found && b.found, 'Hai lần hỏi ĐỒNG THỜI -> chỉ 1 lời gọi mạng');

        check((await c.lookup('ab', '')).found === false && f.calls.length === n + 1, 'Tên quá ngắn -> không gọi mạng');
    }

    console.log('\n[6] Client: lỗi mạng KHÔNG ĐƯỢC throw, app tiếp tục dò Key như cũ');
    {
        const dbEmpty = makeFakeDb();
        // 6a. fetch ném lỗi
        let c = new KeyServerSync({ fetchFn: async () => { throw new Error('ECONNREFUSED'); }, now: clock(), logger: SILENT });
        let r = await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(r.found === false && !!r.error, 'fetch ném lỗi -> {found:false, error}, không throw');

        // 6b. timeout thật (fetch treo, chỉ dừng khi bị abort)
        c = new KeyServerSync({
            lookupTimeoutMs: 40, now: clock(), logger: SILENT,
            fetchFn: (url, init) => new Promise((_, rej) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); })
        });
        const t0 = Date.now();
        r = await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(r.found === false && r.error === 'timeout' && (Date.now() - t0) < 1500, 'Server treo -> timeout nhanh, found:false');

        // 6c. Server CŨ chưa có /find (404 not_found)
        const oldWorkerFetch = makeBridge(worker, dbEmpty, { failWith: async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }) });
        c = new KeyServerSync({ fetchFn: oldWorkerFetch, now: clock(), logger: SILENT });
        r = await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(r.found === false && r.error === 'http-404', 'Server cũ (chưa dán code mới) -> báo lỗi nhẹ, không throw');

        // 6d. Trả về không phải JSON
        c = new KeyServerSync({ fetchFn: async () => new Response('<html>oops</html>', { status: 200 }), now: clock(), logger: SILENT });
        r = await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(r.found === false, 'Trả HTML thay vì JSON -> found:false');

        // 6e. Server trả Key lạ
        c = new KeyServerSync({ fetchFn: async () => new Response(JSON.stringify({ found: true, key: 'ZZ', mode: 'major', songId: 'x' }), { status: 200 }), now: clock(), logger: SILENT });
        r = await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(r.found === false && r.error === 'bad-key-from-server', 'Server trả Key không hợp lệ -> bỏ, không dùng');

        // 6f. Lỗi được nhớ ngắn hạn (15s) rồi thử lại
        let calls = 0; const now = clock();
        c = new KeyServerSync({ fetchFn: async () => { calls++; throw new Error('x'); }, now, logger: SILENT });
        await c.lookup('Bài Bất Kỳ Nào Đó', 'A'); await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(calls === 1, 'Lỗi mạng: không thử dồn dập (nhớ lỗi 15 giây)');
        now.advance(16 * 1000); await c.lookup('Bài Bất Kỳ Nào Đó', 'A');
        check(calls === 2, 'Sau 15 giây thử lại');
    }

    console.log('\n[7] Cờ tắt đồng bộ (keyServerAutoSync=false)');
    {
        const f = makeBridge(worker, makeFakeDb());
        const c = new KeyServerSync({ fetchFn: f, now: clock(), isEnabled: () => false, logger: SILENT });
        const r = await c.lookup('Quên Một Lời Thề', 'A');
        const s = await c.submit({ title: 'Quên Một Lời Thề', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(r.disabled === true && r.found === false, 'lookup khi tắt -> disabled, không gọi mạng');
        check(s.ok === false && s.reason === 'disabled', 'submit khi tắt -> disabled');
        check(f.calls.length === 0 && c.peek('Quên Một Lời Thề', 'A') === null, 'Tắt -> TUYỆT ĐỐI không có lời gọi mạng nào');
    }

    console.log('\n[8] Client: submit (gửi Key sau khi dò xong)');
    {
        const db = makeFakeDb();
        const f = makeBridge(worker, db);
        const now = clock();
        const c = new KeyServerSync({ fetchFn: f, now, logger: SILENT });
        const song = { title: 'Đêm Nay Đừng Ngủ', artist: 'Ca sĩ B', key: 'G# Minor', confidence: 0.85 };

        let s = await c.submit({ ...song });
        check(s.ok === true && s.reason === 'submitted', 'Bài mới -> gửi thành công');
        const seq = f.calls.map((x) => x.method + ' ' + x.path).join(' | ');
        check(seq === 'GET /find | POST /set-song-info | POST /add-segment', 'Thứ tự: hỏi server -> lưu thông tin -> lưu đoạn Key (' + seq + ')');
        const seg = f.calls[2].body, info = f.calls[1].body;
        check(seg.key === 'G#' && seg.mode === 'minor' && seg.startSec === 0 && seg.endSec === KSS.WHOLE_SONG_END_SEC, 'Đoạn Key đúng: G# minor, 0 -> cả bài');
        check(info.songId === seg.songId && info.songId === KSS.makeSongId(song.title, song.artist) && info.title === song.title, 'songId/title đúng');
        check(/Ca sĩ B/.test(info.note) && info.totalDurationSec === null, 'Ca sĩ nằm trong note; chưa biết độ dài -> null');
        check(db._segs.length === 1 && db._songs.length === 1, 'D1 giả có đúng 1 bài + 1 đoạn');

        s = await c.submit({ ...song });
        check(s.ok === true && s.reason === 'already-submitted' && f.calls.length === 3, 'Gửi lại cùng bài -> không gọi mạng thêm');

        // Sau khi gửi, tra theo tên phải thấy bài (vòng khép kín: gửi -> tra)
        const f2 = makeBridge(worker, db);
        const c2 = new KeyServerSync({ fetchFn: f2, now: clock(), logger: SILENT });
        const r = await c2.lookup('Đêm Nay Đừng Ngủ', 'Ca sĩ B');
        check(r.found === true && r.key === 'G# Minor', 'Máy KHÁC hỏi tên bài -> nhận đúng Key vừa được gửi');

        // Máy khác dò cùng bài: server đã có -> không gửi trùng
        const s2 = await c2.submit({ ...song, key: 'C Major' });
        check(s2.ok === true && s2.reason === 'server-already-has' && db._segs.length === 1 && f2.calls.every((x) => x.method === 'GET'), 'Server đã có bài -> KHÔNG gửi trùng (không POST)');

        // Có độ dài thì dùng độ dài thật
        const db3 = makeFakeDb(); const f3 = makeBridge(worker, db3);
        const c3 = new KeyServerSync({ fetchFn: f3, now: clock(), logger: SILENT });
        await c3.submit({ title: 'Bài Có Độ Dài Biết Trước', artist: '', key: 'A Major', confidence: 0.9, durationSec: 215.4 });
        check(f3.calls[2].body.endSec === 215 && f3.calls[1].body.totalDurationSec === 215, 'Biết độ dài (MPC-HC) -> dùng độ dài thật');
    }

    console.log('\n[9] Client: submit — từ chối / lỗi / gửi đồng thời');
    {
        const f = makeBridge(worker, makeFakeDb());
        const c = new KeyServerSync({ fetchFn: f, now: clock(), logger: SILENT });
        check(KSS.MIN_SUBMIT_CONFIDENCE === 0.55, 'Ngưỡng gửi = 55%, khớp KeyEngine.MIN_CONFIDENCE (0.55)');
        check((await c.submit({ title: 'Bài Đủ Dài Nhé', key: 'C Major', confidence: 0.3 })).reason === 'low-confidence', 'Độ tin cậy thấp (<55%) -> không gửi');
        check((await c.submit({ title: 'Bài Đủ Dài Nhé', key: 'C Major', confidence: 0.54 })).reason === 'low-confidence', '54% -> không gửi');
        check((await c.submit({ title: 'Bài Đủ Dài Nhé', key: 'C Major' })).reason === 'low-confidence', 'Thiếu độ tin cậy -> không gửi');
        check((await c.submit({ title: 'Bài Đủ Dài Nhé', key: 'rác', confidence: 0.9 })).reason === 'bad-key', 'Key rác -> không gửi');
        check((await c.submit({ title: '', key: 'C Major', confidence: 0.9 })).reason === 'no-title', 'Không có tên bài -> không gửi');
        check(f.calls.length === 0, 'Các trường hợp bị từ chối KHÔNG gọi mạng');

        // Lookup trước khi gửi bị lỗi (vd server cũ chưa có /find) -> KHÔNG gửi (tránh nhân đôi dữ liệu)
        const dbOld = makeFakeDb();
        const fOld = makeBridge(worker, dbOld, { failWith: async (u) => (u.pathname === '/find' ? new Response('{"error":"not_found"}', { status: 404 }) : new Response('{"ok":true}', { status: 200 })) });
        const now = clock();
        const cOld = new KeyServerSync({ fetchFn: fOld, now, logger: SILENT });
        const so = await cOld.submit({ title: 'Bài Cho Server Cũ', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(so.ok === false && so.reason === 'lookup-failed' && fOld.calls.every((x) => x.method === 'GET'), 'Không xác minh được server -> KHÔNG gửi (an toàn)');
        const so2 = await cOld.submit({ title: 'Bài Cho Server Cũ', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(so2.reason === 'cooldown' && fOld.calls.length === 1, 'Lỗi vừa xảy ra -> nghỉ 30 giây, không dội server');

        // POST thông tin lỗi 500
        const dbE = makeFakeDb();
        const fE = makeBridge(worker, dbE, { failWith: async (u, init) => (u.pathname === '/set-song-info' ? new Response('{"error":"boom"}', { status: 500 }) : worker.fetch(new Request(u.toString(), init), { DB: dbE })) });
        const cE = new KeyServerSync({ fetchFn: fE, now: clock(), logger: SILENT });
        const se = await cE.submit({ title: 'Bài Lỗi Khi Lưu Info', artist: '', key: 'C Major', confidence: 0.9 });
        check(se.ok === false && se.reason === 'info-failed' && !fE.calls.some((x) => x.path === '/add-segment'), 'Lưu thông tin lỗi -> dừng, không gửi đoạn Key');

        // Phục hồi sau cooldown: lần sau gửi thành công
        let failNext = true;
        const dbR = makeFakeDb();
        const fR = makeBridge(worker, dbR, { failWith: async (u, init) => { if (u.pathname === '/add-segment' && failNext) { failNext = false; return new Response('{"error":"x"}', { status: 500 }); } return worker.fetch(new Request(u.toString(), init), { DB: dbR }); } });
        const nowR = clock();
        const cR = new KeyServerSync({ fetchFn: fR, now: nowR, logger: SILENT });
        const sr1 = await cR.submit({ title: 'Bài Phục Hồi Sau Lỗi', artist: 'Z', key: 'D Major', confidence: 0.9 });
        check(sr1.ok === false && sr1.reason === 'segment-failed', 'Lưu đoạn Key lỗi -> báo segment-failed');
        nowR.advance(31 * 1000);
        const sr2 = await cR.submit({ title: 'Bài Phục Hồi Sau Lỗi', artist: 'Z', key: 'D Major', confidence: 0.9 });
        check(sr2.ok === true && dbR._segs.length === 1, 'Sau 30 giây thử lại -> thành công, đúng 1 đoạn (không trùng)');

        // Gửi ĐỒNG THỜI cùng bài (renderer lock nhiều lần liên tiếp)
        const dbC = makeFakeDb(); const fC = makeBridge(worker, dbC);
        const cC = new KeyServerSync({ fetchFn: fC, now: clock(), logger: SILENT });
        const p = { title: 'Bài Gửi Đồng Thời', artist: 'Q', key: 'E Minor', confidence: 0.9 };
        const rs = await Promise.all([cC.submit(p), cC.submit(p), cC.submit(p)]);
        check(rs.every((x) => x.ok) && dbC._segs.length === 1 && dbC._songs.length === 1, '3 lần gửi đồng thời -> D1 chỉ có 1 bài + 1 đoạn');
    }

    console.log('\n[10] Nối dây trong app (kiểm tra mã nguồn)');
    {
        const main = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
        const pre = fs.readFileSync(path.join(ROOT, 'app', 'preload.js'), 'utf8');
        const rend = fs.readFileSync(path.join(ROOT, 'ui', 'js', 'renderer.js'), 'utf8');

        check(/require\("\.\.\/core\/integration\/KeyServerSync"\)/.test(main), 'main.js require KeyServerSync');
        check(/ipcMain\.handle\("server-submit-key"/.test(main), 'main.js có IPC server-submit-key');
        check(/keyServerAutoSync === false/.test(main), 'main.js đọc cờ keyServerAutoSync (mặc định BẬT)');
        check(/SongMatcher\.findReference\(resolved\.title, resolved\.artist\)/.test(main) && /Database Miss \(source=\$\{source\}\)/.test(main), 'Đường tra Database cục bộ cũ còn nguyên');
        check(/keyServerSync\.lookup\(askedTitle, askedArtist\)/.test(main) && /keyServerSync\.peek\(/.test(main), 'dispatchUnifiedNowPlaying hỏi server khi Database cục bộ trượt');
        // Tên bài gửi lên server phải do main tự biết
        const h = main.slice(main.indexOf('ipcMain.handle("server-submit-key"'), main.indexOf('ipcMain.handle("server-submit-key"') + 1500);
        check(/title: cur\.title/.test(h) && !/title: d\./.test(h), 'IPC gửi Key dùng tên bài của main, không tin tên do renderer khai');
        check(/submitDetectedKey: \(data\) => ipcRenderer\.invoke\("server-submit-key", data\)/.test(pre), 'preload.js bắc cầu submitDetectedKey');
        check(/try \{\s*if \(keySource\.songDb && !keySource\.songDb\.active\) \{[\s\S]{0,200}submitDetectedKey[\s\S]{0,200}\} catch \(e\) \{\}/.test(rend), 'renderer chỉ gửi khi Key do AI tự dò (Database/Server chưa có bài), nằm trong try/catch');
        check(/reportAiResult\("key", \{ key: result\.key, confidence: result\.confidence \}\);/.test(rend), 'Dòng reportAiResult cũ còn nguyên');
    }

    console.log('\n[11] Ngưỡng 55% và log báo rõ lý do (mỗi lý do 1 lần / 60 giây)');
    {
        const lines = [];
        const LOGGER = { log: (s) => lines.push(String(s)), error() {}, warn() {} };
        const mk = (extra = {}) => { const now = clock(); const db = makeFakeDb(); const f = makeBridge(worker, db, extra.bridge); return { now, db, f, c: new KeyServerSync({ fetchFn: f, now, logger: LOGGER }) }; };

        // 55% được gửi, đúng ngưỡng
        let t = mk();
        const ok55 = await t.c.submit({ title: 'Bài Đúng Ngưỡng 55', artist: 'A', key: 'C Major', confidence: 0.55 });
        check(ok55.ok === true && ok55.reason === 'submitted' && t.db._segs.length === 1, 'Độ tin cậy đúng 55% -> ĐƯỢC gửi');
        check(lines.some((l) => /ĐÃ GỬI Key lên server/.test(l) && /C Major/.test(l) && /app_/.test(l)), 'Log "ĐÃ GỬI Key lên server" có tên bài, Key và id');
        check(lines.every((l) => l.startsWith('[KeyServer] ')), 'Mọi dòng log đều có tiền tố [KeyServer]');

        // Độ tin cậy thấp: log nêu % và ngưỡng, và chỉ 1 lần / 60 giây
        lines.length = 0; t = mk();
        for (let i = 0; i < 5; i++) await t.c.submit({ title: 'Bài Độ Tin Cậy Thấp', artist: 'A', key: 'C Major', confidence: 0.4 });
        check(lines.length === 1 && /40%/.test(lines[0]) && /55%/.test(lines[0]) && /Bài Độ Tin Cậy Thấp/.test(lines[0]), 'Độ tin cậy thấp: log nêu 40% < ngưỡng 55% và tên bài');
        check(lines.length === 1, '5 lần gọi liên tiếp -> chỉ 1 dòng log (không spam)');
        t.now.advance(61 * 1000);
        await t.c.submit({ title: 'Bài Độ Tin Cậy Thấp', artist: 'A', key: 'C Major', confidence: 0.4 });
        check(lines.length === 2, 'Qua 60 giây -> ghi log lại 1 lần');

        // Các lý do khác
        lines.length = 0; t = mk();
        await t.c.submit({ title: '', key: 'C Major', confidence: 0.9 });
        check(lines.some((l) => /chưa biết tên bài/.test(l)), 'Không có tên bài -> log nêu rõ');
        lines.length = 0;
        await t.c.submit({ title: 'Bài Key Rác Nhé', key: 'rác', confidence: 0.9 });
        check(lines.some((l) => /không hợp lệ/.test(l)), 'Key rác -> log nêu rõ');
        lines.length = 0; t = new KeyServerSync({ fetchFn: t.f, now: clock(), isEnabled: () => false, logger: LOGGER });
        await t.submit({ title: 'Bài Đồng Bộ Đang Tắt', key: 'C Major', confidence: 0.9 });
        check(lines.some((l) => /đang TẮT/.test(l) && /keyServerAutoSync/.test(l)), 'Đồng bộ tắt -> log nêu rõ cách bật lại');

        // Server cũ chưa có /find (404): log gợi ý đúng nguyên nhân
        lines.length = 0;
        const old = mk({ bridge: { failWith: async () => new Response('{"error":"not_found"}', { status: 404 }) } });
        await old.c.lookup('Bài Cho Server Cũ Nè', 'A');
        check(lines.length === 1 && /404/.test(lines[0]) && /chưa có code mới/.test(lines[0]), 'Server cũ (404) -> log gợi ý "server chưa có code mới /find?"');
        lines.length = 0;
        await old.c.submit({ title: 'Bài Cho Server Cũ Nè', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(lines.some((l) => /lookup-failed/.test(l) && /không gửi để tránh trùng/.test(l)), 'Không xác minh được server -> log nêu rõ vì sao không gửi');

        // Tra server: trúng / trượt đều có log
        lines.length = 0;
        const dbS = makeFakeDb({ songs: [{ songId: 'v1', title: 'Xin Đừng Rời Xa Anh', updated: 1 }], segs: [{ songId: 'v1', startSec: 0, endSec: 293, key: 'D', mode: 'minor' }] });
        const cS = new KeyServerSync({ fetchFn: makeBridge(worker, dbS), now: clock(), logger: LOGGER });
        await cS.lookup('Xin Đừng Rời Xa Anh', 'A'); await cS.lookup('Một Bài Chưa Có Trên Server', 'A');
        check(lines.some((l) => /Server CÓ bài/.test(l) && /D Minor/.test(l)), 'Tra trúng -> log "Server CÓ bài ... D Minor"');
        check(lines.some((l) => /Server CHƯA có bài/.test(l)), 'Tra trượt -> log "Server CHƯA có bài"');

        // Server đã có bài khi định gửi
        lines.length = 0;
        await cS.submit({ title: 'Xin Đừng Rời Xa Anh', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(lines.some((l) => /server ĐÃ có bài/.test(l)), 'Server đã có bài -> log nêu rõ vì sao không gửi');

        // Lỗi lưu từ server: log nêu mã lỗi
        lines.length = 0;
        const dbF = makeFakeDb();
        const tf = new KeyServerSync({ now: clock(), logger: LOGGER, fetchFn: makeBridge(worker, dbF, { failWith: async (u, init) => (u.pathname === '/add-segment' ? new Response('{"error":"x"}', { status: 500 }) : worker.fetch(new Request(u.toString(), init), { DB: dbF })) }) });
        await tf.submit({ title: 'Bài Lỗi Khi Lưu Đoạn', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(lines.some((l) => /segment-failed/.test(l) && /http-500/.test(l)), 'Lỗi lưu đoạn Key -> log nêu segment-failed và mã http-500');

        // Logger hỏng không được làm hỏng luồng chính
        const tb = new KeyServerSync({ now: clock(), fetchFn: makeBridge(worker, makeFakeDb()), logger: { log() { throw new Error('logger hỏng'); } } });
        const rb = await tb.submit({ title: 'Bài Logger Bị Hỏng', artist: 'A', key: 'C Major', confidence: 0.9 });
        check(rb.ok === true, 'Logger ném lỗi -> việc gửi Key vẫn thành công');

        // main.js có log báo "AI đã khóa Key" và "chưa biết tên bài"
        const mainSrc = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
        check(/AI đã khóa Key \$\{d\.key\}/.test(mainSrc) && /CHƯA BIẾT TÊN BÀI/.test(mainSrc), 'main.js ghi log khi nhận Key đã khóa từ AI (kể cả khi chưa biết tên bài)');
    }

    console.log('\n' + (failCount === 0 ? '✅ TẤT CẢ ĐỀU PASS' : '❌ CÓ ' + failCount + ' LỖI'));
    process.exit(failCount === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(2); });
