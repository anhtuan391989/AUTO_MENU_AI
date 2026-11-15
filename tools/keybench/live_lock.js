// tools/keybench/live_lock.js — Đo THỜI ĐIỂM chốt Key và Key chốt của KeyEngine THẬT (nghe trực tiếp) trên nhạc thật.
// Chạy mã ui/js/engines/keyEngine.js bằng vm + đồng hồ ảo (qua tools/algbench/realbench/engine_runner.js), phát từ giây 0.
// KHÔNG sửa file nào trong dự án. Cần ffmpeg trong PATH. Chạy:
//   node tools\keybench\live_lock.js --songs "G:\keybench_songs" [--from 10] [--to 29] [--limit 120]
// Mỗi bài mất khoảng 5–15 giây thật. Nhạc đặt tên bắt đầu bằng số thứ tự (1.mp3, 10.mp3 ...) khớp truth.csv.
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SONGS = arg('songs'), FROM = +arg('from', 1), TO = +arg('to', 999), LIMIT = +arg('limit', 120);
const ROOT = path.join(__dirname, '..', '..');
if (!SONGS || !fs.existsSync(SONGS)) { console.log('Không thấy thư mục nhạc. Dùng: node tools\\keybench\\live_lock.js --songs "G:\\keybench_songs"'); process.exit(2); }
const { decode, runEngines } = require(path.join(ROOT, 'tools/algbench/realbench/engine_runner.js'));
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], FLAT = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' };
function parseKey(t) {
  const m = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(String(t || '').trim().replace('♯', '#').replace('♭', 'b'));
  if (!m) return null;
  const root = m[2] === 'b' ? FLAT[m[1].toUpperCase() + 'B'] : m[1].toUpperCase() + m[2];
  if (NOTE.indexOf(root) < 0) return null;
  const rest = m[3].trim().toLowerCase();
  return { pc: NOTE.indexOf(root), minor: (rest.startsWith('m') && !rest.startsWith('maj')) || rest.startsWith('min') };
}
function judge(truth, found) {
  const t = parseKey(truth), f = parseKey(found); if (!f || !t) return '---';
  if (t.pc === f.pc && t.minor === f.minor) return 'DUNG';
  if (t.minor && !f.minor && f.pc === (t.pc + 3) % 12) return 'TUONG DUONG';
  if (!t.minor && f.minor && f.pc === (t.pc + 9) % 12) return 'TUONG DUONG';
  return 'SAI';
}
const truth = {};
fs.readFileSync(path.join(__dirname, 'truth.csv'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).forEach((l) => {
  const c = l.split(','); if (c.length >= 3 && /^\d+$/.test(c[0].trim())) truth[+c[0]] = { title: c[1].trim(), key: c[2].trim() };
});
const files = fs.readdirSync(SONGS).filter((f) => /^\s*\d+/.test(f) && /\.(mp3|wav|flac|m4a|ogg)$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const label = (e) => e ? NOTE[e.pc] + (e.mode === 'minor' ? 'm' : '') : null;
const rows = [];
for (const f of files) {
  const n = parseInt(f); if (!truth[n] || n < FROM || n > TO) continue;
  let r;
  try { const { pcm, sr } = decode(path.join(SONGS, f)); r = runEngines(ROOT, pcm.subarray(0, Math.min(pcm.length, Math.floor(LIMIT * sr))), sr); }
  catch (e) { console.log(n, 'LỖI:', String(e.message).slice(0, 120)); continue; }
  const tl = r.key_timeline, first = tl[0], last = tl[tl.length - 1];
  const row = { n, title: truth[n].title, truth: truth[n].key, t1: first ? first.t : null, k1: label(first), kN: label(last), tN: last ? last.t : null, changes: tl.length };
  row.v1 = row.k1 ? judge(row.truth, row.k1) : 'KHONG CHOT'; row.vN = row.kN ? judge(row.truth, row.kN) : 'KHONG CHOT';
  rows.push(row);
  console.log(String(n).padStart(2) + '. ' + row.title.slice(0, 24).padEnd(24), 'that=' + row.truth.padEnd(4),
    row.k1 ? 'chốt đầu ' + row.t1.toFixed(1).padStart(5) + 's ' + row.k1.padEnd(4) + row.v1.padEnd(12) + '| cuối ' + row.kN.padEnd(4) + '@' + row.tN.toFixed(0).padStart(3) + 's ' + row.vN : 'KHÔNG CHỐT trong ' + LIMIT + 's');
}
if (!rows.length) { console.log('Không ghép được bài nào (tên file phải bắt đầu bằng số thứ tự khớp truth.csv).'); process.exit(2); }
const locked = rows.filter((r) => r.k1), ts = locked.map((r) => r.t1).sort((a, b) => a - b);
const med = ts.length ? ts[Math.floor(ts.length / 2)] : null, cnt = (k, v) => rows.filter((r) => r[k] === v).length;
console.log('\n=== TỔNG KẾT (%d bài, nghe tối đa %d giây) ===', rows.length, LIMIT);
console.log('Có chốt: %d | KHÔNG chốt: %d | trung vị thời gian chốt đầu: %s', locked.length, rows.length - locked.length, med === null ? '-' : med.toFixed(1) + 's');
console.log('Key CHỐT ĐẦU : đúng %d, tương đương %d, sai %d', cnt('v1', 'DUNG'), cnt('v1', 'TUONG DUONG'), cnt('v1', 'SAI'));
console.log('Key CUỐI     : đúng %d, tương đương %d, sai %d, không chốt %d', cnt('vN', 'DUNG'), cnt('vN', 'TUONG DUONG'), cnt('vN', 'SAI'), cnt('vN', 'KHONG CHOT'));
