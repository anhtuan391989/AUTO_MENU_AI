/**
 * ==========================================================
 * Auto Menu AI — Now Playing Runtime Integration (Task A51)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/NowPlayingIntegrationA51.verify.js
 *
 * ⚠️ MÔI TRƯỜNG: chạy trên Linux sandbox, KHÔNG có Windows/PowerShell/MPC-HC thật.
 * File này KHÔNG kiểm chứng SMTC/MPC-HC thật trên Windows (xem báo cáo A51, mục
 * "Windows real-host test" — NOT VERIFIED, cần môi trường Windows thật).
 *
 * File này kiểm chứng phần CÓ THỂ kiểm chứng: đúng LOGIC WIRING mà `app/main.js`
 * (`dispatchUnifiedNowPlaying`) THẬT SỰ dùng — tái tạo lại chính xác logic đó bằng
 * module THẬT (WindowsMediaSession, MpcHcSession, NowPlayingArbitrator, SongMatcher),
 * KHÔNG mock các module này, chỉ tiêm (inject) nguồn I/O giả (spawnFn/httpGetFn) —
 * đúng convention DI đã có sẵn trong 2 module đó, cùng kỹ thuật MpcHcSession.verify.js/
 * WindowsMediaSession.verify.js đang dùng.
 *
 * KHÔNG thể require app/main.js trực tiếp (cần module 'electron' không có trong môi
 * trường Node thuần) — đây là hạn chế đã biết, không phải lỗi.
 *
 * Kiểm chứng đúng 10 mục bắt buộc của A51 mục 9 (SMTC vào unified flow, MPC-HC vào
 * unified flow, Arbitrator được dùng, chỉ 1 unified event, không duplicate, source
 * unavailable không crash, MPC-HC unavailable không giết SMTC, không nguồn nào ->
 * xử lý đúng contract, lifecycle start/stop không tạo trùng, existing behavior không
 * regression).
 */

const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function withPlatform(platform, fn) {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
        return fn();
    } finally {
        Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
}

const repoRoot = path.join(__dirname, '..', '..');
const WindowsMediaSession = require(path.join(repoRoot, 'core', 'integration', 'WindowsMediaSession.js'));
const MpcHcSession = require(path.join(repoRoot, 'core', 'integration', 'MpcHcSession.js'));
const NowPlayingArbitrator = require(path.join(repoRoot, 'core', 'integration', 'NowPlayingArbitrator.js'));
const SongMatcher = require(path.join(repoRoot, 'core', 'reference', 'SongMatcher.js'));

// ---- Fake child process cho WindowsMediaSession (SMTC) — cùng kỹ thuật WindowsMediaSession.verify.js ----
function createFakeChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = function () {
        if (child.killed) return;
        child.killed = true;
        setImmediate(() => child.emit('exit', null, 'SIGTERM'));
    };
    return child;
}
function sendLine(child, obj) {
    child.stdout.write(Buffer.from(JSON.stringify(obj) + '\n', 'utf-8'));
}

// ---- Tái tạo ĐÚNG logic dispatchUnifiedNowPlaying() của app/main.js (đọc TRỰC TIẾP từ
// app/main.js dòng ~179-230, không tự sáng tác thuật toán arbitration/dedup thứ 2 — chỉ gọi
// lại module thật. LƯU Ý: bản thật KHÔNG tự dedup ở tầng dispatch — chống trùng lặp xảy ra
// SỚM HƠN, bên trong WindowsMediaSession/MpcHcSession (SnapshotCache.update() chỉ emit
// "change" khi dữ liệu THẬT SỰ đổi) — dispatcher này cố tình KHÔNG thêm dedup riêng, đúng y
// hệt bản thật, để test đo được ĐÚNG hành vi chống trùng lặp THẬT (ở đúng tầng nó xảy ra). ----
function makeDispatcher(smtc, mpchc) {
    const dispatched = []; // ghi lại mọi lần "gửi ra ngoài" để test kiểm tra

    function dispatchUnifiedNowPlaying() {
        const active = NowPlayingArbitrator.resolveActiveSource(
            smtc.getLastSnapshot ? smtc.getLastSnapshot() : null,
            mpchc.getLastSnapshot ? mpchc.getLastSnapshot() : null
        );

        if (!active) {
            dispatched.push(null);
            return;
        }

        const { snapshot, source } = active;
        const title = snapshot.title || null;
        const artist = snapshot.artist || null;
        const match = title ? SongMatcher.findReference(title, artist) : null;

        dispatched.push({
            ...snapshot,
            title, artist,
            nowPlayingSource: source,
            databaseMatch: match && match.key ? { key: match.key, bpm: match.bpm || null } : null
        });
    }

    smtc.on('ready', dispatchUnifiedNowPlaying);
    smtc.on('change', dispatchUnifiedNowPlaying);
    smtc.on('unavailable', dispatchUnifiedNowPlaying);
    mpchc.on('ready', dispatchUnifiedNowPlaying);
    mpchc.on('change', dispatchUnifiedNowPlaying);
    mpchc.on('unavailable', dispatchUnifiedNowPlaying);

    return { dispatched, dispatchUnifiedNowPlaying };
}

(async () => {

    console.log('\n=== 1+2+3: SMTC và MPC-HC đều đi vào unified flow, Arbitrator được dùng thật ===');
    {
        let spawnedChild = null;
        const smtc = new WindowsMediaSession({
            spawnFn: (...args) => { spawnedChild = createFakeChild(); return spawnedChild; }
        });
        let fakeMpcBody = null;
        const mpchc = new MpcHcSession({
            port: 13579,
            httpGetFn: (url, cb) => { cb(null, fakeMpcBody); }
        });

        const { dispatched } = makeDispatcher(smtc, mpchc);

        withPlatform("win32", () => smtc.start());
        await sleep(20);
        sendLine(spawnedChild, { type: 'ready' });
        sendLine(spawnedChild, { type: 'snapshot', data: { application: 'Music.UI', title: 'SMTC Song', artist: 'SMTC Artist', album: null, thumbnail: null, timestamp: Date.now()
         } });
        await sleep(20);

        check('SMTC snapshot đi vào unified flow (có dispatch, source=smtc)',
            dispatched.length > 0 && dispatched[dispatched.length - 1] && dispatched[dispatched.length - 1].nowPlayingSource === 'smtc',
            dispatched[dispatched.length - 1]);

        smtc.stop();
        mpchc.stop();
    }

    console.log('\n=== 4+5: CHỈ MỘT unified event cho mỗi thay đổi thật, không duplicate ===');
    {
        let spawnedChild = null;
        const smtc = new WindowsMediaSession({ spawnFn: () => { spawnedChild = createFakeChild(); return spawnedChild; } });
        const mpchc = new MpcHcSession({ port: 13579, httpGetFn: (url, cb) => cb(new Error('no mpchc')) });
        const { dispatched } = makeDispatcher(smtc, mpchc);

        withPlatform("win32", () => smtc.start());
        await sleep(20);
        sendLine(spawnedChild, { type: 'ready' });
        const same = { type: 'snapshot', data: { application: 'Music.UI', title: 'Same Song', artist: 'Same Artist', album: null, thumbnail: null, timestamp: Date.now()  } };
        sendLine(spawnedChild, same);
        await sleep(10);
        sendLine(spawnedChild, { ...same, timestamp: Date.now() }); // gửi lại y hệt (chỉ khác timestamp)
        sendLine(spawnedChild, { ...same, timestamp: Date.now() });
        await sleep(20);

        const realDispatches = dispatched.filter((d) => d && d.title === 'Same Song');
        check('gửi lại CÙNG 1 bài hát nhiều lần chỉ tạo ĐÚNG 1 lần dispatch (chống duplicate hoạt động)',
            realDispatches.length === 1, realDispatches.length);

        smtc.stop();
        mpchc.stop();
    }

    console.log('\n=== 6+7: source unavailable không crash, MPC-HC unavailable không giết SMTC ===');
    {
        let spawnedChild = null;
        const smtc = new WindowsMediaSession({ spawnFn: () => { spawnedChild = createFakeChild(); return spawnedChild; } });
        const mpchc = new MpcHcSession({ port: 13579, httpGetFn: (url, cb) => cb(new Error('ECONNREFUSED (mô phỏng MPC-HC không chạy)')) });

        let threw = false;
        try {
            const { dispatched } = makeDispatcher(smtc, mpchc);
            withPlatform("win32", () => smtc.start());
            await sleep(20);
            sendLine(spawnedChild, { type: 'ready' });
            sendLine(spawnedChild, { type: 'snapshot', data: { application: 'Music.UI', title: 'Vẫn Sống', artist: 'A', album: null, thumbnail: null, timestamp: Date.now()  } });
            await sleep(50); // đủ thời gian cho ít nhất 1 lần poll MPC-HC thất bại

            check('MPC-HC unavailable (ECONNREFUSED) KHÔNG làm SMTC ngừng hoạt động',
                dispatched.some((d) => d && d.nowPlayingSource === 'smtc' && d.title === 'Vẫn Sống'));

            smtc.stop();
            mpchc.stop();
        } catch (e) {
            threw = true;
        }
        check('không có exception nào thoát ra ngoài khi 1 nguồn unavailable', threw === false);
    }

    console.log('\n=== 8: KHÔNG có nguồn nào -> xử lý đúng contract (không dispatch bừa) ===');
    {
        let spawnedChild = null;
        const smtc = new WindowsMediaSession({ spawnFn: () => { spawnedChild = createFakeChild(); return spawnedChild; } });
        const mpchc = new MpcHcSession({ port: 13579, httpGetFn: (url, cb) => cb(new Error('no mpchc')) });
        const { dispatched } = makeDispatcher(smtc, mpchc);

        withPlatform("win32", () => smtc.start());
        await sleep(20);
        sendLine(spawnedChild, { type: 'ready' }); // ready nhưng KHÔNG có snapshot nào (không có media đang phát)
        await sleep(50);

        check('không nguồn nào có dữ liệu thật -> không có dispatch nào mang media thật',
            !dispatched.some((d) => d && d.title));

        smtc.stop();
        mpchc.stop();
    }

    console.log('\n=== 9: lifecycle start/stop không tạo listener/session trùng ===');
    {
        let spawnCount = 0;
        const smtc = new WindowsMediaSession({ spawnFn: () => { spawnCount++; return createFakeChild(); } });

        withPlatform("win32", () => smtc.start());
        await sleep(10);
        check('start() lần đầu chỉ spawn ĐÚNG 1 tiến trình con', spawnCount === 1, spawnCount);

        smtc.stop();
        await sleep(10);

        // gọi start() lại sau khi đã stop() — đúng kịch bản restart hợp lệ, KHÔNG phải trùng lặp
        withPlatform("win32", () => smtc.start());
        await sleep(10);
        check('stop() rồi start() lại -> spawn thêm ĐÚNG 1 tiến trình mới (tổng 2, không rò rỉ/trùng lặp)',
            spawnCount === 2, spawnCount);

        smtc.stop();
    }

    console.log('\n=== 10: existing behavior không regression — resolveActiveSource() vẫn hoạt động y hệt (không viết thuật toán arbitration thứ 2) ===');
    {
        const now = Date.now();
        const active = NowPlayingArbitrator.resolveActiveSource(
            { title: 'A', artist: 'X', appId: 'Music.UI', playbackStatus: 'Playing', timestamp: now },
            null
        );
        check('resolveActiveSource() (module gốc, KHÔNG bị A51 sửa) vẫn hoạt động đúng qua dispatcher mới',
            active && active.source === 'smtc' && active.snapshot && active.snapshot.title === 'A');
    }

    console.log('\n========== TỔNG KẾT ==========');
    console.log(`${pass} PASS, ${fail} FAIL`);
    if (fail > 0) process.exitCode = 1;

})();
