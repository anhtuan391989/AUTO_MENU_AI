// DB-SETUP-01 — Setup > Database: logic thống kê/nhập/xuất/dựng lại/xoá đệm (core/reference/SongDbAdmin.js) + nối IPC.
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };

const Admin = require(path.join(root, 'core/reference/SongDbAdmin.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'songdb-'));
const file = path.join(tmp, 'songs.json');
const SongDatabase = new (require(path.join(root, 'core/reference/SongDatabase.js')).constructor)();
SongDatabase.filePath = file;
let cleared = 0; const state = { size: 3, clear() { cleared++; this.size = 0; } };

// rỗng
let s = Admin.stats(SongDatabase, state);
ok(s.ok && s.count === 0 && s.artists === 0 && s.bpmAvg === null && s.cache === 3, 'DB rỗng: 0 bài, không bịa số, đọc được cache', JSON.stringify(s));

// nhập
let r = Admin.importSongs([
  { title: 'A', artist: 'X', key: 'C Major', bpm: 100 },
  { title: ' a ', artist: 'x' },            // trùng (không phân biệt hoa/thường)
  { title: 'B', artist: 'Y', key: 'C Major', bpm: 120 },
  { artist: 'no title' }, 5, null           // sai
], SongDatabase);
ok(r.ok && r.added === 2 && r.duplicates === 1 && r.invalid === 3 && r.total === 2, 'nhập: thêm 2, trùng 1, sai 3', JSON.stringify(r));
r = Admin.importSongs([{ title: 'A', artist: 'X' }], SongDatabase);
ok(r.added === 0 && r.duplicates === 1, 'nhập lại: không ghi đè / không nhân đôi');
ok(Admin.importSongs({}, SongDatabase).ok === false, 'nhập file không phải mảng -> báo lỗi');

// thống kê
s = Admin.stats(SongDatabase, state);
ok(s.count === 2 && s.artists === 2 && s.withKey === 2 && s.withBpm === 2 && s.bpmAvg === 110 && s.bpmMin === 100 && s.bpmMax === 120 && s.topKeys[0].key === 'C Major' && s.topKeys[0].count === 2 && s.fileBytes > 0, 'thống kê đúng số liệu thật', JSON.stringify(s));

// xuất
const out = path.join(tmp, 'export.json');
r = Admin.exportSongs(out, SongDatabase);
ok(r.ok && r.count === 2 && JSON.parse(fs.readFileSync(out, 'utf8')).length === 2, 'xuất ra file đúng 2 bài');

// dựng lại: file có rác + trùng
fs.writeFileSync(file, JSON.stringify([{ title: 'A', artist: 'X' }, { title: 'a', artist: 'x' }, { nope: 1 }, { title: 'C', bpm: 'abc' }]));
r = Admin.rebuild(SongDatabase, state);
ok(r.ok && r.before === 4 && r.after === 2 && r.invalid === 1 && r.duplicates === 1 && r.changed, 'dựng lại: bỏ 1 sai + 1 trùng', JSON.stringify(r));
ok(fs.existsSync(file + '.bak') && JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).length === 4, 'dựng lại: có file .bak chứa bản cũ');
ok(cleared >= 1, 'dựng lại: xoá luôn bộ nhớ đệm');
r = Admin.rebuild(SongDatabase, state);
ok(r.ok && !r.changed, 'dựng lại lần 2: dữ liệu sạch, không ghi gì');

// file hỏng: không đụng vào
fs.writeFileSync(file, '{hỏng');
r = Admin.rebuild(SongDatabase, state);
ok(r.ok === false && fs.readFileSync(file, 'utf8') === '{hỏng', 'file JSON hỏng: báo lỗi, KHÔNG sửa/ghi đè file');
ok(Admin.stats(SongDatabase, state).ok === false, 'file JSON hỏng: thống kê báo lỗi (không hiện số giả)');

// xoá đệm
state.size = 5;
r = Admin.clearCache(state);
ok(r.ok && r.cleared === 5 && state.size === 0, 'xoá đệm: báo đúng số mục đã xoá');

// nối IPC
const main = rd('app/main.js'), pre = rd('app/preload.js'), setup = rd('ui/js/setup.js');
ok(/ipcMain\.handle\("song-db-op"/.test(main) && /event\.sender !== setupWin\.webContents/.test(main.split('song-db-op')[1].slice(0, 400)), 'main.js: kênh song-db-op chỉ nhận từ cửa sổ Setup');
ok(/songDbOp: \(op\) => ipcRenderer\.invoke\("song-db-op", op\)/.test(pre), 'preload.js: cầu nối songDbOp');
ok(/setupDatabasePanel/.test(setup) && /songDbOp/.test(setup), 'setup.js: thẻ Database gọi songDbOp');
ok(!/<script src="js\/setupDatabase/.test(rd('ui/setup.html')), 'không phải sửa HTML (logic nằm trong setup.js)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
