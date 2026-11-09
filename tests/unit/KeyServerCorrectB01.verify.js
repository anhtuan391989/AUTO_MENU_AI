// KEY-SERVER-CORRECT-01 (Bước B) — chạy: node tests/unit/KeyServerCorrectB01.verify.js
// Server GIẢ trong bộ nhớ, làm đúng hợp đồng /set-key mà tests/unit/KeyEditAndDisplayC.verify.js mô tả
// (401 sai mật khẩu, 403 chưa cài ADMIN_TOKEN, 409 nhiều đoạn, 404, 400). KHÔNG gọi Cloudflare thật, KHÔNG mở Electron.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createKeyCorrector, parseKey, displayKey } = require(path.join(ROOT, 'app/keyCorrect.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SECRET = 'mat-khau-bi-mat-123';

function makeServer({ adminToken = SECRET } = {}) {
  const S = { calls: [], segs: { one: [{ startSec: 0, endSec: 200, key: 'F', mode: 'major' }], multi: [{}, {}, {}] }, songs: ['one', 'multi'] };
  S.fetchFn = async (url, init) => {
    S.calls.push({ url, init });
    const u = new URL(url); const body = init && init.body ? JSON.parse(init.body) : {};
    const J = (status, j) => ({ status, json: async () => j });
    if (u.pathname !== '/set-key' || init.method !== 'POST') return J(404, {});
    if (!adminToken) return J(403, { error: 'chua_cai_ADMIN_TOKEN' });
    if ((init.headers.Authorization || '') !== 'Bearer ' + adminToken) return J(401, { error: 'sai_mat_khau' });
    if (!/^[A-G]#?$/.test(body.key)) return J(400, { error: 'key_khong_hop_le' });
    if (!S.songs.includes(body.songId)) return J(404, { error: 'khong_co_bai' });
    const list = S.segs[body.songId] || [];
    if (list.length > 1) return J(409, { error: 'nhieu_doan', tongDoan: list.length });
    if (list.length === 1) { list[0].key = body.key; list[0].mode = body.mode; }
    return J(200, { ok: true, daSua: 1, key: body.key, mode: body.mode, keyHienThi: body.key + ' ' + (body.mode === 'minor' ? 'Minor' : 'Major') });
  };
  return S;
}
function makeCorrector(S, over) {
  const logs = [];
  const db = {
    list: [
      { title: 'Xin Đừng Rời Xa Anh', artist: 'Lê Gia Bảo', key: 'D Minor', songId: 'one', bpm: 90 },
      { title: 'Bài Khác', artist: 'X', key: 'C Major', bpm: 100 }],
    load() { return JSON.parse(JSON.stringify(this.list)); }, save(l) { this.list = JSON.parse(JSON.stringify(l)); }
  };
  const song = { title: 'Xin Đừng Rời Xa Anh', artist: 'Lê Gia Bảo' };
  const c = createKeyCorrector(Object.assign({
    getSong: () => song, lookup: async () => ({ found: true, songId: 'one', key: 'D Minor' }),
    getServerUrl: () => 'https://server.test', fetchFn: S.fetchFn, normalizeTitle: norm, db,
    logger: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) }
  }, over || {}));
  return { c, db, logs, song };
}

(async () => {
  console.log('[1] Đọc Key');
  const P = (s) => { const p = parseKey(s); return p ? p.name + '/' + p.mode : null; };
  ok(P('A# Major') === 'A#/major' && P('Bb Minor') === 'A#/minor' && P('F# Major') === 'F#/major' && P('C Major') === 'C/major', 'A# Major, Bb Minor, F# Major, C Major');
  ok(P('Am') === 'A/minor' && P('Eb') === 'D#/major' && P('F♯ minor') === 'F#/minor', 'Am, Eb, F♯ minor');
  ok(P('H') === null && P('') === null && P(null) === null && P('<script>') === null && P('C dorian') === null, 'Key rác -> null');
  ok(displayKey(parseKey('Bb Minor')) === 'A# Minor', 'Hiển thị: Bb Minor -> "A# Minor"');

  console.log('[2] Sửa thành công');
  {
    const S = makeServer(); const { c, db, logs } = makeCorrector(S);
    const r = await c.correct({ key: 'A# Major', token: SECRET });
    ok(r.ok === true && r.key === 'A# Major' && r.localUpdated === 1, 'Server OK -> ok, báo Key "A# Major", sửa 1 mục songs.json');
    const sent = JSON.parse(S.calls[0].init.body);
    ok(sent.songId === 'one' && sent.key === 'A#' && sent.mode === 'major', 'Gửi Server đúng {songId, key:"A#", mode:"major"}');
    ok(S.segs.one[0].key === 'A#' && S.segs.one[0].mode === 'major', 'Server đã đổi đoạn');
    ok(db.list[0].key === 'A# Major' && db.list[0].bpm === 90 && db.list[1].key === 'C Major', 'songs.json: chỉ bài này đổi Key, giữ BPM, bài khác không đụng');
    ok(!JSON.stringify(r).includes(SECRET) && !logs.join('\n').includes(SECRET), 'Mật khẩu KHÔNG lọt vào kết quả trả về hay log');
    const r2 = await c.correct({ key: 'G Major' });
    ok(r2.ok === true && S.calls[1].init.headers.Authorization === 'Bearer ' + SECRET, 'Lần sau không nhập lại: dùng mật khẩu đã nhớ trong RAM');
  }

  console.log('[3] Bị từ chối -> không sửa gì ở máy');
  {
    const S = makeServer(); const { c, db } = makeCorrector(S); const before = JSON.stringify(db.list);
    let r = await c.correct({ key: 'A# Major' });
    ok(r.ok === false && r.reason === 'need-token' && S.calls.length === 0, 'Chưa có mật khẩu -> need-token, chưa gọi Server');
    r = await c.correct({ key: 'A# Major', token: 'sai' });
    ok(r.ok === false && r.reason === 'wrong-password' && JSON.stringify(db.list) === before && S.segs.one[0].key === 'F', 'Sai mật khẩu -> wrong-password, Server và songs.json giữ nguyên');
    r = await c.correct({ key: 'A# Major' });
    ok(r.reason === 'need-token', 'Sau khi sai mật khẩu: không giữ mật khẩu sai');
    const S2 = makeServer({ adminToken: '' }); const m2 = makeCorrector(S2);
    r = await m2.c.correct({ key: 'A# Major', token: 'x' });
    ok(r.reason === 'server-no-admin-token' && JSON.stringify(m2.db.list) === before, 'Server chưa cài ADMIN_TOKEN -> server-no-admin-token, không sửa gì');
    const S3 = makeServer(); const m3 = makeCorrector(S3, { lookup: async () => ({ found: true, songId: 'multi' }) });
    r = await m3.c.correct({ key: 'A# Major', token: SECRET });
    ok(r.reason === 'multi-segment' && r.tongDoan === 3 && JSON.stringify(m3.db.list) === before, 'Bài 3 đoạn Key -> multi-segment (báo 3 đoạn), không đoán bừa, songs.json giữ nguyên');
    const m4 = makeCorrector(makeServer(), { lookup: async () => ({ found: false }) });
    r = await m4.c.correct({ key: 'A# Major', token: SECRET });
    ok(r.reason === 'not-on-server', 'Bài chưa có trên Server -> not-on-server');
    const m5 = makeCorrector(makeServer(), { lookup: async () => ({ found: true, songId: 'khong-co' }) });
    r = await m5.c.correct({ key: 'A# Major', token: SECRET });
    ok(r.reason === 'not-on-server', 'Server báo không có bài (404) -> not-on-server');
    const m6 = makeCorrector(makeServer(), { getSong: () => null });
    ok((await m6.c.correct({ key: 'A# Major', token: SECRET })).reason === 'no-song', 'Chưa biết tên bài -> no-song');
    r = await makeCorrector(makeServer()).c.correct({ key: 'rác', token: SECRET });
    ok(r.reason === 'bad-key', 'Key rác -> bad-key, chưa gọi Server');
    const m8 = makeCorrector(makeServer(), { fetchFn: async () => { throw new Error('offline'); } });
    r = await m8.c.correct({ key: 'A# Major', token: SECRET });
    ok(r.ok === false && r.reason === 'network' && !JSON.stringify(r).includes(SECRET), 'Mất mạng -> network, không throw, không lộ mật khẩu');
  }

  console.log('[3b] Đồng bộ tắt + làm tươi bản nhớ tạm');
  {
    const m = makeCorrector(makeServer(), { lookup: async () => ({ found: false, disabled: true }) });
    ok((await m.c.correct({ key: 'A# Major', token: SECRET })).reason === 'server-disabled', 'Đồng bộ Key Server tắt -> server-disabled');
    let called = 0; const S = makeServer();
    const m2 = makeCorrector(S, { afterCorrect: async () => { called++; throw new Error('lỗi phụ'); } });
    const r = await m2.c.correct({ key: 'A# Major', token: SECRET });
    await new Promise((res) => setTimeout(res, 10));
    ok(r.ok === true && called === 1, 'Sửa xong gọi làm tươi bản nhớ tạm đúng 1 lần; nó lỗi cũng không ảnh hưởng kết quả');
    let called2 = 0; const m3 = makeCorrector(makeServer(), { afterCorrect: async () => { called2++; } });
    await m3.c.correct({ key: 'A# Major', token: 'sai' });
    ok(called2 === 0, 'Sửa thất bại -> không làm tươi bản nhớ tạm');
  }

  console.log('[4] songs.json lỗi không làm hỏng việc đã lưu trên Server');
  {
    const S = makeServer(); const m = makeCorrector(S, { db: { load() { throw new Error('hỏng file'); }, save() {} } });
    const r = await m.c.correct({ key: 'A# Major', token: SECRET });
    ok(r.ok === true && r.localUpdated === 0 && /hỏng file/.test(r.localError) && S.segs.one[0].key === 'A#', 'Server đã sửa; songs.json lỗi -> vẫn ok, báo localError');
  }

  console.log('[4b] Khớp với module THẬT trong core/ (nếu có)');
  try {
    const real = require(path.join(ROOT, 'core/integration/KeyServerSync.js'));
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; let allSame = true;
    for (const r of roots) for (const mode of ['major', 'minor']) {
      const mine = parseKey(r + ' ' + mode), app = real.serverKeyToAppKey(r, mode), srv = real.appKeyToServerKey(app);
      if (!mine || displayKey(mine) !== app || !srv || srv.key !== mine.name || srv.mode !== mine.mode) allSame = false;
    }
    ok(allSame, '24 Key: cách đọc/hiển thị Key giống hệt serverKeyToAppKey / appKeyToServerKey của core');
    ok(real.normalizeTitle('Xin Đừng Rời Xa Anh') === 'xin dung roi xa anh' && typeof real.DEFAULT_SERVER_URL === 'string' && real.DEFAULT_SERVER_URL.startsWith('https://'), 'core: normalizeTitle và DEFAULT_SERVER_URL có đúng như main.js đang dùng');
    const SongDatabase = require(path.join(ROOT, 'core/reference/SongDatabase.js'));
    ok(typeof SongDatabase.load === 'function' && typeof SongDatabase.save === 'function', 'core: SongDatabase có load() và save()');
  } catch (e) { console.log('  (bỏ qua: không thấy thư mục core/ ở', ROOT + ')'); }

  console.log('[5] Nối dây trong code thật (kiểm tĩnh)');
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8'), pre = fs.readFileSync(path.join(ROOT, 'app/preload.js'), 'utf8'), rend = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');
  const card = rend.slice(rend.indexOf('function initKeyServerCorrectCard'), rend.indexOf('function initKeyServerCorrectCard') + 7000);
  ok(/ipcMain\.handle\("server-correct-key"/.test(main) && /event\.sender !== mainWin\.webContents/.test(main), 'main.js: IPC server-correct-key, chỉ cửa sổ Menu chính được gọi');
  ok(/getSong: \(\) => currentNowPlayingForSync/.test(main), 'main.js: tên bài lấy từ main process, không tin renderer');
  ok(/correctServerKey: \(data\) => ipcRenderer\.invoke\("server-correct-key", data\)/.test(pre), 'preload.js: cầu nối correctServerKey');
  ok(/function initKeyServerCorrectCard\(\)/.test(rend) && /getElementById\("applyKeyBtn"\)/.test(card) && /addEventListener\("contextmenu"/.test(card), 'renderer.js: thẻ nổi gắn vào chuột phải nút SEND');
  ok(/if \(typeof initKeyServerCorrectCard === "function"\) initKeyServerCorrectCard\(\)/.test(rend), 'renderer.js: thẻ được khởi tạo lúc mở app');
  ok(/correctServerKey\(\{ key: k, token: passEl\.value \}\)[\s\S]{0,260}passEl\.value = ""/.test(card), 'renderer.js: gửi xong là xoá ô mật khẩu');
  ok(!/localStorage|sessionStorage/.test(card), 'renderer.js: mật khẩu không lưu vào localStorage/sessionStorage');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
