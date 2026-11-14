// KEY-ANALYZE-02 — chạy: node tests/unit/KeyAnalyzer02.fast.verify.js
// Python GIẢ (spawn giả), KHÔNG chạy Python thật, KHÔNG mở Electron.
const fs = require('fs'), path = require('path'), { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const { createKeyAnalyzer } = require(path.join(ROOT, 'app/keyAnalyzer.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

function fakeSpawn(script, calls) {
  return (cmd, args) => {
    calls.push({ cmd, args });
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { c.killed = true; };
    const r = script(cmd, args) || { code: 0 };
    setImmediate(() => {
      if (r.hang) return;
      if (r.error) return c.emit('error', new Error(r.error));
      if (r.stdout) c.stdout.emit('data', Buffer.from(r.stdout));
      if (r.stderr) c.stderr.emit('data', Buffer.from(r.stderr));
      c.emit('close', r.code);
    });
    return c;
  };
}
const J = (o) => JSON.stringify(Object.assign({ key: 'C', scale: 'major', confidence: 0.54, is_reliable: true, duration_sec: 200 }, o));
const fsFake = (existing, written) => ({ existsSync: (p) => existing.has(p) || written.has(p), writeFileSync: (p, b) => written.set(p, b), unlinkSync: (p) => written.delete(p) });
const isFast = (c) => c.args.some((x) => /fast_key_detector\.py$/.test(x));
const isClassic = (c) => c.args.some((x) => /(^|[\\/])key_detector\.py$/.test(x));

(async () => {
  // 1) Mặc định: file nhạc trên máy dùng bộ dò NHANH
  let calls = [];
  let a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J() }, calls), fs: fsFake(new Set(['C:/m/a.mp3']), new Map()) });
  let r = await a.analyzeFile('C:/m/a.mp3');
  ok(r.ok && r.key === 'C Major' && r.engine === 'fast', 'analyzeFile mặc định -> engine "fast", key "C Major"');
  const run1 = calls.find(isFast);
  ok(run1 && run1.args.includes('--json') && run1.args.includes('C:/m/a.mp3') && !calls.some(isClassic), 'gọi fast_key_detector.py <file> --json, KHÔNG gọi key_detector.py');

  // 2) Chọn rõ engine classic
  calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J({ key: 'D', scale: 'minor' }) }, calls), fs: fsFake(new Set(['x.mp3']), new Map()) });
  r = await a.analyzeFile('x.mp3', { engine: 'classic' });
  ok(r.ok && r.engine === 'classic' && r.key === 'D Minor' && calls.some(isClassic) && !calls.some(isFast), 'engine "classic" -> chỉ gọi key_detector.py');

  // 3) Bộ nhanh lỗi (thiếu thư viện / hỏng) -> tự rơi về classic
  calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => {
    if (args.includes('--version')) return { code: 0 };
    if (args.some((x) => /fast_key_detector\.py$/.test(x))) return { code: 1, stderr: "ModuleNotFoundError: No module named 'scipy'" };
    return { code: 0, stdout: J({ key: 'F', scale: 'minor' }) };
  }, calls), fs: fsFake(new Set(['y.mp3']), new Map()), logger: { log() {}, error() {} } });
  r = await a.analyzeFile('y.mp3');
  ok(r.ok && r.key === 'F Minor' && r.engine === 'classic' && calls.some(isFast) && calls.some(isClassic), 'fast lỗi -> tự dùng classic, vẫn ra kết quả');

  // 4) Cả hai đều lỗi -> báo lỗi (không throw)
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 1, stderr: '[LỖI] file hỏng' }, []), fs: fsFake(new Set(['z.mp3']), new Map()), logger: { log() {}, error() {} } });
  r = await a.analyzeFile('z.mp3');
  ok(!r.ok && r.reason === 'analyze-failed', 'cả hai bộ dò lỗi -> { ok:false, reason:"analyze-failed" }');

  // 5) Timeout của bộ nhanh: KHÔNG chạy tiếp classic (tránh chờ gấp đôi)
  let killed = false; calls = [];
  const hangSpawn = (cmd, args) => { calls.push({ cmd, args }); const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { killed = true; };
    if (args.includes('--version')) setImmediate(() => c.emit('close', 0)); return c; };
  a = createKeyAnalyzer({ spawn: hangSpawn, timeoutMs: 40, fs: fsFake(new Set(['h.mp3']), new Map()) });
  r = await a.analyzeFile('h.mp3');
  ok(!r.ok && r.reason === 'timeout' && killed && !calls.some(isClassic), 'bộ nhanh quá giờ -> timeout, giết tiến trình, không chạy classic');

  // 6) Bản ghi âm (YouTube) vẫn dùng classic
  const written = new Map(); calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J({ key: 'G', scale: 'major' }) }, calls), fs: fsFake(new Set(), written), tmpDir: 'T' });
  r = await a.analyzeRecording(Buffer.alloc(44 + 44100 * 2 * 12));
  ok(r.ok && r.engine === 'classic' && calls.some(isClassic) && !calls.some(isFast) && written.size === 0, 'analyzeRecording -> classic (không đổi hành vi YouTube), file tạm đã xoá');

  // 7) Cùng file nhưng khác engine không bị gộp nhầm; cùng engine vẫn gộp
  calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J() }, calls), fs: fsFake(new Set(['s.mp3']), new Map()) });
  await Promise.all([a.analyzeFile('s.mp3'), a.analyzeFile('s.mp3')]);
  ok(calls.filter(isFast).length === 1, 'cùng file + cùng engine gọi 2 lần song song -> chỉ phân tích 1 lần');

  // 8) Bộ nhanh KHÔNG được tự lưu lên Key Server dùng chung: trần confidence < ngưỡng gửi server
  const py = fs.readFileSync(path.join(ROOT, 'core/fast_key_detector.py'), 'utf8');
  const sync = fs.readFileSync(path.join(ROOT, 'core/integration/KeyServerSync.js'), 'utf8');
  const maxConf = parseFloat((py.match(/^MAX_CONFIDENCE\s*=\s*([0-9.]+)/m) || [])[1]);
  const minSubmit = parseFloat((sync.match(/const MIN_SUBMIT_CONFIDENCE\s*=\s*([0-9.]+)/) || [])[1]);
  ok(Number.isFinite(maxConf) && Number.isFinite(minSubmit) && maxConf < minSubmit, `confidence tối đa bộ nhanh (${maxConf}) < ngưỡng gửi Key Server (${minSubmit})`);

  // 9) Không đụng giao diện / keyEngine / main.js
  const kes = path.join(ROOT, 'ui/js/engines/keyEngine.js');
  ok(!/fast_key_detector|keyAnalyzer/.test(fs.readFileSync(kes, 'utf8')), 'keyEngine.js không bị đụng');

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
