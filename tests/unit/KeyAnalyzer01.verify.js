// KEY-ANALYZE-01 — chạy: node tests/unit/KeyAnalyzer01.verify.js
// Python GIẢ (spawn giả), KHÔNG chạy Python/librosa thật, KHÔNG mở Electron.
const fs = require('fs'), path = require('path'), { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const { createKeyAnalyzer, toKeyLabel, parseResultJson } = require(path.join(ROOT, 'app/keyAnalyzer.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

// spawn giả: script(cmd,args) -> { code, stdout, stderr, error, hang }
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
const J = (o) => JSON.stringify(Object.assign({ key: 'A#', scale: 'major', confidence: 0.82, is_reliable: true, duration_sec: 241.5 }, o));
const fsFake = (existing, written) => ({ existsSync: (p) => existing.has(p) || written.has(p), writeFileSync: (p, b) => written.set(p, b), unlinkSync: (p) => written.delete(p) });

(async () => {
  ok(toKeyLabel('A#', 'major') === 'A# Major' && toKeyLabel('F', 'minor') === 'F Minor', 'toKeyLabel: root + major/minor -> "A# Major"/"F Minor"');
  ok(toKeyLabel('H', 'major') === null && toKeyLabel('A', 'dorian') === null && toKeyLabel(null, 'major') === null, 'toKeyLabel: sai nốt/sai chế độ -> null');
  ok(parseResultJson('cảnh báo librosa\n' + J() + '\n').key === 'A#' && parseResultJson('không có json') === null, 'parseResultJson: bỏ dòng cảnh báo, không có JSON -> null');

  // 1) Phân tích file thành công
  let calls = [];
  let a = createKeyAnalyzer({ spawn: fakeSpawn((cmd, args) => args.includes('--version') ? { code: 0, stdout: 'Python 3.11' } : { code: 0, stdout: J() }, calls), fs: fsFake(new Set(['C:/m/a.mp3']), new Map()) });
  let r = await a.analyzeFile('C:/m/a.mp3');
  ok(r.ok && r.key === 'A# Major' && r.reliable === true && Math.abs(r.confidence - 0.82) < 1e-9 && r.durationSec === 241.5, 'analyzeFile: trả Key "A# Major", tin cậy, thời lượng');
  const run = calls.find((c) => c.args.some((x) => /key_detector\.py$/.test(x)));
  ok(run && run.args.includes('--json') && run.args.includes('C:/m/a.mp3'), 'analyzeFile: gọi key_detector.py <file> --json');

  // 2) Độ tin cậy thấp
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J({ is_reliable: false, confidence: 0.3 }) }, []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x');
  ok(r.ok && r.reliable === false, 'độ tin cậy thấp: ok=true nhưng reliable=false (nơi gọi không dùng)');

  // 3) Không có Python
  a = createKeyAnalyzer({ spawn: fakeSpawn(() => ({ error: 'ENOENT' }), []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'no-python', 'không có Python -> no-python (không throw)');
  r = await a.status(); ok(!r.ok && r.reason === 'no-python', 'status: no-python');

  // 4) Thiếu librosa
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 1, stderr: "ModuleNotFoundError: No module named 'librosa'" }, []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'no-librosa', 'thiếu librosa -> no-librosa');

  // 5) Lỗi khác / output hỏng / key sai
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 1, stderr: '[LỖI] file hỏng' }, []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'analyze-failed', 'Python báo lỗi -> analyze-failed');
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: 'rác' }, []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'bad-output', 'output không phải JSON -> bad-output');
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J({ key: 'Z' }) }, []), fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'bad-key', 'Key sai định dạng -> bad-key');

  // 6) Đầu vào xấu
  a = createKeyAnalyzer({ spawn: fakeSpawn(() => ({ code: 0 }), []), fs: fsFake(new Set(), new Map()) });
  ok((await a.analyzeFile('')).reason === 'no-file' && (await a.analyzeFile(null)).reason === 'no-file', 'đường dẫn rỗng/null -> no-file');
  ok((await a.analyzeFile('Z:/khong-co.mp3')).reason === 'file-missing', 'file không tồn tại -> file-missing');

  // 7) Timeout giết tiến trình
  let killed = false;
  const hangSpawn = (cmd, args) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { killed = true; };
    if (args.includes('--version')) setImmediate(() => c.emit('close', 0)); return c; };
  a = createKeyAnalyzer({ spawn: hangSpawn, timeoutMs: 40, fs: fsFake(new Set(['x']), new Map()) });
  r = await a.analyzeFile('x'); ok(!r.ok && r.reason === 'timeout' && killed, 'quá giờ -> timeout và giết tiến trình Python');

  // 8) Gộp yêu cầu trùng: 2 lần gọi cùng file chỉ chạy Python 1 lần
  calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J() }, calls), fs: fsFake(new Set(['same.mp3']), new Map()) });
  const [r1, r2] = await Promise.all([a.analyzeFile('same.mp3'), a.analyzeFile('same.mp3')]);
  ok(r1.ok && r2.ok && calls.filter((c) => c.args.some((x) => /key_detector\.py$/.test(x))).length === 1, 'cùng file gọi 2 lần song song -> chỉ phân tích 1 lần');

  // 9) Bản ghi âm: quá ngắn bị từ chối; đủ dài thì ghi file tạm, phân tích rồi XOÁ file tạm
  const written = new Map();
  calls = [];
  a = createKeyAnalyzer({ spawn: fakeSpawn((c, args) => args.includes('--version') ? { code: 0 } : { code: 0, stdout: J({ key: 'F', scale: 'minor' }) }, calls), fs: fsFake(new Set(), written), tmpDir: 'T' });
  ok((await a.analyzeRecording(Buffer.alloc(1000))).reason === 'too-short', 'bản ghi < 10 giây -> too-short');
  r = await a.analyzeRecording(Buffer.alloc(44 + 44100 * 2 * 12));
  ok(r.ok && r.key === 'F Minor', 'bản ghi đủ dài -> phân tích ra "F Minor"');
  ok(written.size === 0, 'file tạm đã bị xoá sau khi phân tích');

  // 10) Kiểm tra dây nối trong main.js / preload.js
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8'), pre = fs.readFileSync(path.join(ROOT, 'app/preload.js'), 'utf8');
  ok(/function analyzeUnknownSongFile\(/.test(main) && /analyzeUnknownSongFile\(snapshot, source, askedTitle, askedArtist, payload\)/.test(main), 'main.js: Server chưa có Key -> gọi phân tích cả file');
  ok(/source !== "mpc-hc" \|\| !snapshot \|\| !snapshot\.filePath\) return;/.test(main), 'main.js: chỉ phân tích khi có đường dẫn file thật (MPC-HC)');
  ok(/source: "analyzer"/.test(main) && /!res\.reliable\) \{ console\.log/.test(main), 'main.js: chỉ dùng kết quả đáng tin, đi qua đường Song Database sẵn có');
  ok(/keyServerSync\.submit\(\{ title, artist, key: res\.key/.test(main), 'main.js: kết quả đáng tin được lưu lên Key Server');
  ok(/ipcMain\.handle\("key-analyze-recording"/.test(main) && /event\.sender !== mainWin\.webContents/.test(main.slice(main.indexOf('"key-analyze-recording"'), main.indexOf('"key-analyze-recording"') + 400)), 'main.js: IPC bản ghi chỉ nhận từ cửa sổ Menu');
  ok(/analyzeKeyRecording: \(data\) => ipcRenderer\.invoke\("key-analyze-recording", data\)/.test(pre) && /keyAnalyzerStatus/.test(pre), 'preload.js: cầu nối analyzeKeyRecording + keyAnalyzerStatus');
  const kes = path.join(ROOT, 'ui/js/engines/keyEngine.js');
  ok(!/keyAnalyzer|analyzeKey/.test(fs.readFileSync(kes, 'utf8')), 'keyEngine.js không bị đụng');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
