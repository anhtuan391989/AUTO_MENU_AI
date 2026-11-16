// tools/keybench/db_verify.js — Đo xem AI nghe liên tục có THAY ĐƯỢC Key sai trong cơ sở dữ liệu (data/songs.json) mà không làm hỏng Key đúng.
// Chạy mã keyEngine.js THẬT trên nhạc thật (đồng hồ ảo). KHÔNG sửa file nào trong dự án. Cần ffmpeg trong PATH.
//   node tools\keybench\db_verify.js --songs "G:\keybench_songs" [--from 1] [--to 29]
// Luật THỬ (chọn trước, không chỉnh theo kết quả 20 bài mới): tại giây 20, 30, 45 lấy trung bình "tỉ lệ năng lượng nhạc nằm NGOÀI thang âm" của
//   Key trong cơ sở dữ liệu (D) và của Key AI đang nghe thấy (A). Thay Key khi: trungbình(D) >= 0.30 VÀ trungbình(A) <= 0.20 VÀ D - A >= 0.15 VÀ Key khác nhau.
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SONGS = arg('songs'), FROM = +arg('from', 1), TO = +arg('to', 999), LIMIT = 46;
const ROOT = path.join(__dirname, '..', '..');
if (!SONGS || !fs.existsSync(SONGS)) { console.log('Không thấy thư mục nhạc. Dùng: node tools\\keybench\\db_verify.js --songs "G:\\keybench_songs"'); process.exit(2); }
const { decode } = require(path.join(ROOT, 'tools/algbench/realbench/engine_runner.js'));
const { mkAnalyser, sandbox, loadEngine } = require(path.join(ROOT, 'tools/algbench/lib.js'));
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], FLAT = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' };
const TIMES = [20, 30, 45], TH = { dbMin: 0.30, aiMax: 0.20, gapMin: 0.15 };
function parseKey(t) {
  const m = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(String(t || '').trim()); if (!m) return null;
  const root = m[2] === 'b' ? FLAT[m[1].toUpperCase() + 'B'] : m[1].toUpperCase() + m[2]; if (NOTE.indexOf(root) < 0) return null;
  const r = m[3].trim().toLowerCase(); return { pc: NOTE.indexOf(root), minor: (r.startsWith('m') && !r.startsWith('maj')) || r.startsWith('min') };
}
const judge = (tr, f) => { const t = parseKey(tr), x = f && typeof f === 'object' ? f : parseKey(f); if (!t || !x) return '---';
  if (t.pc === x.pc && t.minor === x.minor) return 'DUNG';
  if ((t.minor && !x.minor && x.pc === (t.pc + 3) % 12) || (!t.minor && x.minor && x.pc === (t.pc + 9) % 12)) return 'TUONG DUONG'; return 'SAI'; };
const norm = (s) => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const truth = {}; fs.readFileSync(path.join(__dirname, 'truth.csv'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).forEach((l) => { const c = l.split(','); if (c.length >= 3 && /^\d+$/.test(c[0].trim())) truth[+c[0]] = { title: c[1].trim(), key: c[2].trim() }; });
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/songs.json'), 'utf8')).map((x) => ({ n: norm(x.title), key: String(x.key).replace('Major', '').replace('Minor', 'm').replace(/\s/g, '') }));
const files = fs.readdirSync(SONGS).filter((f) => /^\s*\d+/.test(f) && /\.(mp3|wav|flac|m4a|ogg)$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const rows = [];
for (const f of files) {
  const n = parseInt(f); if (!truth[n] || n < FROM || n > TO) continue;
  const entries = db.filter((x) => x.n.includes(norm(truth[n].title))).map((x) => x.key); const uniq = [...new Set(entries)];
  if (uniq.length !== 1) { console.log(String(n).padStart(2) + '. ' + truth[n].title.slice(0, 24).padEnd(24), uniq.length ? 'CSDL có nhiều Key khác nhau (' + uniq.join('/') + ') -> bỏ qua' : 'không có trong CSDL -> bỏ qua'); continue; }
  const dbKey = parseKey(uniq[0]), tru = parseKey(truth[n].key);
  const { pcm, sr } = decode(path.join(SONGS, f)); const cut = pcm.subarray(0, Math.floor(LIMIT * sr)); const clock = { t: 1000 };
  const S = sandbox(clock, () => mkAnalyser(cut, sr, 8192, clock, 1000), sr); loadEngine(ROOT, S.sb, 'keyEngine.js', 'KeyEngine'); const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} }); K.watchContinuous(() => {});
  const rd = [], ai = []; let last = 0, aiKey = null;
  for (const t of TIMES) {
    S.step((t - last) * 1000); last = t; const e = K.estimateKeyLong(); if (e && e.rootIndex >= 0) aiKey = { pc: e.rootIndex, minor: e.mode === 'Minor' };
    const D = K.outOfScaleRatio(dbKey.pc, dbKey.minor ? 'Minor' : 'Major', 'mid'), A = aiKey ? K.outOfScaleRatio(aiKey.pc, aiKey.minor ? 'Minor' : 'Major', 'mid') : null;
    if (D != null) rd.push(D); if (A != null) ai.push(A);
  }
  K.stop(); const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null, mD = mean(rd), mA = mean(ai);
  const differ = aiKey && !(aiKey.pc === dbKey.pc && aiKey.minor === dbKey.minor);
  const swap = !!(differ && mD != null && mA != null && mD >= TH.dbMin && mA <= TH.aiMax && mD - mA >= TH.gapMin);
  const dbV = judge(truth[n].key, dbKey), aiV = aiKey ? judge(truth[n].key, aiKey) : '---', dbOk = dbV !== 'SAI';
  const out = swap ? (dbOk ? 'BÁO NHẦM (CSDL đúng mà bị thay)' : (aiV !== 'SAI' ? 'SỬA ĐƯỢC (CSDL sai -> AI đúng)' : 'THAY SAI->SAI')) : (dbOk ? 'GIỮ ĐÚNG' : 'BỎ SÓT (CSDL sai, không sửa)');
  rows.push({ n, out });
  console.log(String(n).padStart(2) + '. ' + truth[n].title.slice(0, 24).padEnd(24), 'thật=' + truth[n].key.padEnd(4), 'CSDL=' + uniq[0].padEnd(4) + dbV.padEnd(12), 'AI=' + (aiKey ? NOTE[aiKey.pc] + (aiKey.minor ? 'm' : '') : '-').padEnd(4) + aiV.padEnd(12),
    'ngoài-thang CSDL=' + (mD == null ? '-' : mD.toFixed(2)) + ' AI=' + (mA == null ? '-' : mA.toFixed(2)), '->', out);
}
const sum = (L, name) => { const c = {}; L.forEach((r) => { c[r.out] = (c[r.out] || 0) + 1; }); console.log(name.padEnd(34) + L.length + ' bài: ' + (Object.entries(c).map(([k, v]) => k + ' ' + v).join(' | ') || '-')); };
console.log('\n=== TỔNG KẾT (luật: CSDL>=' + TH.dbMin + ', AI<=' + TH.aiMax + ', chênh>=' + TH.gapMin + ') ===');
sum(rows.filter((r) => r.n <= 9), 'Bài 1–9 (đã dùng để chọn ngưỡng):'); sum(rows.filter((r) => r.n >= 10), 'Bài 10+ (KIỂM CHỨNG MỚI):');
