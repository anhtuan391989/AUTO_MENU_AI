// TASK DB-MATCH-STRICT-01 — chạy: node tests/unit/KeyServerStrict01.verify.js
// Bài chỉ "khớp mờ" tên trên Server (bản Karaoke/MV khác) KHÔNG được dùng làm Key; Menu tự dò và tự gửi Key riêng của bản này.
'use strict';
const fs = require('fs'), path = require('path');
const { KeyServerSync, normalizeTitle } = require('../../core/integration/KeyServerSync.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

// Server giả: chỉ có 1 bản trên Server (Karaoke, F Major). /find trả đúng như worker.js: khớp mờ trả bản đó.
function makeServer(opts = {}) {
    const calls = [];
    const fetchFn = async (url, init) => {
        const u = new URL(url); calls.push(u.pathname + (init && init.method === 'POST' ? ' POST' : ''));
        const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
        if (u.pathname === '/song-full') return json({ doans: [] }); // không có ID nào
        if (u.pathname === '/find') {
            if (opts.findTitle === null) return json({ found: false });
            return json({ found: true, songId: '0kOKtLUaYok', title: opts.findTitle, key: 'F', mode: 'major' });
        }
        if (u.pathname === '/set-song-info' || u.pathname === '/add-segment') return json({ ok: true });
        return json({ error: 'nf' }, 404);
    };
    return { fetchFn, calls };
}
const quiet = { log() {} };
const KARAOKE = '[KARAOKE VERSION] Ngày Đẹp Trời Để Nói Chia Tay - Lou Hoàng';
const MV = 'LOU HOÀNG - NGÀY ĐẸP TRỜI ĐỂ NÓI CHIA TAY ( Music Video)';

(async () => {
    // 1) strictTitle BẬT: bản MV chỉ khớp mờ với bản Karaoke -> KHÔNG found, có similar để tham khảo
    let s = makeServer({ findTitle: KARAOKE });
    let k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, strictTitle: true, idLookup: true });
    let r = await k.lookup(MV, '');
    ok(r.found === false && r.similar && r.similar.key === 'F Major', 'strict BẬT: bản MV chỉ khớp mờ bản Karaoke -> found=false, giữ similar (F Major) làm tham khảo');
    ok(k.peek(MV, '') === null, 'strict BẬT: peek() không trả Key khớp mờ (Menu không dùng làm DATABASE)');

    // 2) strictTitle BẬT: khớp ĐÚNG tên (khác hoa/thường/dấu câu) -> vẫn found như cũ
    s = makeServer({ findTitle: 'lou hoàng - ngày đẹp trời để nói chia tay (music video)' });
    k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, strictTitle: true, idLookup: true });
    r = await k.lookup('LOU HOÀNG - NGÀY ĐẸP TRỜI ĐỂ NÓI CHIA TAY (Music Video)', '');
    ok(r.found === true && r.key === 'F Major' && r.songId === '0kOKtLUaYok', 'strict BẬT: tên khớp đúng sau chuẩn hoá -> vẫn dùng Key Server');

    // 3) strictTitle TẮT (mặc định): hành vi cũ giữ nguyên — khớp mờ vẫn found
    s = makeServer({ findTitle: KARAOKE });
    k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, idLookup: true });
    r = await k.lookup(MV, '');
    ok(r.found === true && r.key === 'F Major', 'strict TẮT (mặc định): giữ hành vi cũ, khớp mờ vẫn found');

    // 4) Server không gửi title -> không đủ căn cứ để coi là mờ -> vẫn found (tương thích ngược)
    s = makeServer({ findTitle: '' });
    k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, strictTitle: true, idLookup: true });
    r = await k.lookup(MV, '');
    ok(r.found === true, 'strict BẬT nhưng Server không trả title -> giữ found (tương thích ngược)');

    // 5) submit(): bản chỉ khớp mờ KHÔNG bị chặn "server đã có" -> Menu gửi Key riêng lên Server
    s = makeServer({ findTitle: KARAOKE });
    k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, strictTitle: true, idLookup: true });
    r = await k.submit({ title: MV, artist: '', key: 'A# Major', confidence: 0.9 });
    ok(r.ok === true && r.reason === 'submitted', 'strict BẬT: bản MV được gửi Key riêng (A# Major), không bị coi là "server đã có"');
    ok(s.calls.includes('/set-song-info POST') && s.calls.includes('/add-segment POST'), 'đã ghi thông tin bài + đoạn Key cho bản MV');
    r = await k.lookup(MV, '');
    ok(r.found === true && r.key === 'A# Major', 'sau khi gửi: lần hỏi tiếp theo bản MV ra A# Major (không còn F Major của Karaoke)');

    // 6) strict TẮT: submit bị chặn như cũ (chứng minh lỗi gốc)
    s = makeServer({ findTitle: KARAOKE });
    k = new KeyServerSync({ fetchFn: s.fetchFn, logger: quiet, idLookup: true });
    r = await k.submit({ title: MV, artist: '', key: 'A# Major', confidence: 0.9 });
    ok(r.reason === 'server-already-has', 'strict TẮT: bản MV bị chặn "server-already-has" (lỗi gốc người dùng gặp)');

    // 7) main.js đã bật strictTitle; không đụng UI/KeyEngine
    const main = fs.readFileSync(path.join(__dirname, '../../app/main.js'), 'utf8');
    ok(/new KeyServerSync\(\{[\s\S]{0,200}strictTitle: true/.test(main), 'main.js bật strictTitle cho KeyServerSync');

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
