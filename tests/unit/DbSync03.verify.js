'use strict';
// DB-SYNC-03: lượt đầy đủ kéo toàn bộ danh sách (/list?all=1); lượt nhanh vẫn /list.
const { createSongDbServerSync } = require('../../core/integration/SongDbServerSync');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };
(async () => {
    const calls = [];
    const ks = { _request: async (p) => { calls.push(p); return { ok: true, status: 200, json: { danhSach: [] } }; } };
    const db = { load: () => [], save() {}, filePath: null };
    const sync = createSongDbServerSync({ keyServerSync: ks, db, isEnabled: () => true, logger: { log() {}, warn() {} } });
    await sync.run({ light: true });
    ok(calls[0] === '/list', 'lượt nhanh gọi /list (100 bài mới nhất)');
    calls.length = 0;
    await sync.run({});
    ok(calls[0] === '/list?all=1', 'lượt đầy đủ gọi /list?all=1 (toàn bộ Server)');
    console.log(pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
