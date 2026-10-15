'use strict';
// AI-ALG-05 — Phân tích file audio THẬT offline bằng KeyEngine thật (vm + đồng hồ ảo). Cần ffmpeg.
// Dùng: node tools/algbench/analyze_audio.js <audio> [truthKey vd "A Minor"] [maxSeconds=90]
// In timeline khoá + kết quả cuối so với đáp án (nếu có). Đáp án phải do người dùng cung cấp; script KHÔNG tự đoán đúng/sai.
const { spawnSync } = require('child_process'); const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const { mkAnalyser, sandbox, loadEngine } = require('./lib.js');
const [file, truth, maxS] = [process.argv[2], process.argv[3], +(process.argv[4] || 90)];
if (!file) { console.error('Thiếu file audio'); process.exit(2); }
const sr = 22050;
const p = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-t', String(maxS), '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
if (p.status !== 0) { console.error('ffmpeg lỗi:', String(p.stderr).slice(0, 300)); process.exit(3); }
const pcm = new Float32Array(p.stdout.buffer, p.stdout.byteOffset, Math.floor(p.stdout.length / 4));
const secs = Math.floor(pcm.length / sr); const clock = { t: 1000 };
const S = sandbox(clock, () => mkAnalyser(pcm, sr, 8192, clock, 1000), sr); loadEngine(REPO, S.sb, 'keyEngine.js', 'KeyEngine');
const K = S.sb.KeyEngine; K.init(S.ctx, { connect() {} }); const locks = [];
K.watchContinuous((r) => locks.push({ t: +((clock.t - 1000) / 1000).toFixed(1), key: r.key }));
const snaps = [];
for (let s = 1; s <= secs; s++) { S.step(1000); if (s % 10 === 0) snaps.push({ t: s, est: K.estimateKeyFromChroma().key }); }
K.stop();
console.log(`Audio: ${file} (${secs}s) — KHÔNG phải kết quả mặc định đúng; so với đáp án người dùng cung cấp`);
console.log('Timeline khoá:', locks.map((l) => `${l.t}s:${l.key}`).join(' | ') || '(chưa khoá)');
console.log('Ước lượng tức thời mỗi 10 s:', snaps.map((x) => `${x.t}s:${x.est}`).join(' | '));
const fin = locks.length ? locks[locks.length - 1].key : null;
console.log('Khoá cuối:', fin, '| số lần đổi:', Math.max(0, locks.length - 1), '| thời điểm khoá đầu:', locks[0] ? locks[0].t + 's' : 'n/a');
if (truth) console.log('Đáp án:', truth, '→', fin === null ? 'CHƯA KHOÁ (ước lượng cuối: ' + snaps[snaps.length - 1].est + ')' : (fin === truth ? 'KHỚP' : 'KHÔNG KHỚP'));
