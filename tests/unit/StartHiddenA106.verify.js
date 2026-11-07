// A106 — Start Hidden (tự ẩn DAW sau khi mở xong VST + project). TEST MÔ PHỎNG (đồng hồ/tasklist/PowerShell giả) — KHÔNG phải Windows thật.
const fs = require('fs'), path = require('path');
const W = require('../../core/integration/DawReadyWatcher.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\Fender\\Studio Pro 8\\Studio Pro.exe';

function rig(over = {}) {
    let t = 1000; const timers = []; const logs = [];
    const world = { pids: [], identified: [], title: '', responding: true, cpuPerSec: 0, cpuMs: 0, lastT: 0, hidden: false, hideCalls: 0, hideResult: { ok: true }, settings: { hiddenDaw: { startHidden: true }, startupPaths: { dawProject: 'D:\\Show\\Live Set.song' } }, exe: EXE, ...over };
    const deps = {
        log: (m) => logs.push(m), now: () => t,
        setTimer: (fn, ms) => { const o = { at: t + ms, fn }; timers.push(o); return o; }, clearTimer: (o) => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1); },
        readSettings: () => world.settings, getExe: () => world.exe,
        taskPids: (e, cb) => cb(world.pids.slice()), identify: (e, cb) => cb(world.identified.length ? world.identified.slice() : world.pids.slice()),
        sample: (pid, cb) => { if (!world.pids.includes(pid)) { cb('GONE'); return; } const dt = t - (world.lastT || t); world.cpuMs += world.cpuPerSec * dt / 1000 * 10; world.lastT = t; cb({ title: world.title, responding: world.responding, cpuMs: world.cpuMs, t }); },
        isHidden: () => world.hidden, hide: (cb) => { world.hideCalls++; if (world.hideResult.ok) world.hidden = true; cb(world.hideResult); },
    };
    const w = W.createDawReadyWatcher(deps);
    // cpuPerSec: % của 1 lõi (100 => 1000 ms CPU / s). cpuMs += %*dt/1000*10 (ms CPU) => % = cpuMs/dt*100.
    const run = (ms) => { const end = t + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const n = timers[0]; if (!n || n.at > end) break; timers.shift(); t = Math.max(t, n.at); n.fn(); } t = end; };
    return { w, world, run, logs, now: () => t };
}

console.log('== 1. projectName / evaluateSample ==');
ok(W.projectName('D:\\Show\\Live Set.song') === 'Live Set' && W.projectName('/a/b/Bài hát.flp') === 'Bài hát' && W.projectName('') === '' && W.projectName('D:\\Show\\') === 'Show', 'projectName bỏ thư mục + đuôi file');
const base = { responding: true, title: 'Studio Pro - Live Set', cpuMs: 0, t: 0 };
ok(W.evaluateSample({ sample: { ...base, t: 1000, cpuMs: 10 }, prev: base, project: 'Live Set' }).ready === true, 'đủ 4 điều kiện => ready');
ok(W.evaluateSample({ sample: { ...base, title: 'Studio Pro' , t: 1000 }, prev: base, project: 'Live Set' }).reason === 'TITLE_MISSING_PROJECT', 'tiêu đề chưa có tên project => chưa sẵn sàng');
ok(W.evaluateSample({ sample: { ...base, title: 'STUDIO PRO - LIVE SET*', t: 1000 }, prev: base, project: 'live set' }).ready === true, 'không phân biệt hoa/thường, chấp nhận dấu * (chưa lưu)');
ok(W.evaluateSample({ sample: { ...base, t: 1000, cpuMs: 900 }, prev: base, project: 'Live Set' }).reason === 'CPU_BUSY', 'CPU 90% => đang bận');
ok(W.evaluateSample({ sample: { ...base, responding: false, t: 1000 }, prev: base, project: '' }).reason === 'NOT_RESPONDING', 'Not Responding => chưa sẵn sàng');
ok(W.evaluateSample({ sample: base, prev: null, project: '' }).reason === 'MEASURING_CPU', 'lần đo đầu chưa có CPU => chưa kết luận');
ok(W.evaluateSample({ sample: { ...base, title: '  ', t: 1000 }, prev: base, project: '' }).reason === 'NO_WINDOW_TITLE', 'tiêu đề rỗng (splash) => chưa sẵn sàng');
ok(W.evaluateSample({ sample: { ...base, title: 'Studio Pro', t: 1000 }, prev: base, project: '' }).ready === true, 'chưa chọn project: chỉ cần có tiêu đề');

console.log('== 2. Tắt / chưa có DAW ==');
{ const r = rig({ settings: { hiddenDaw: { startHidden: false } } }); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.w.start(); r.run(60000);
  ok(r.world.hideCalls === 0 && r.w.phase().phase === 'off', 'Start Hidden TẮT => không bao giờ ẩn'); }
{ const r = rig(); r.w.start(); r.run(20000); ok(r.world.hideCalls === 0 && r.w.phase().phase === 'waiting_daw', 'DAW chưa mở => chờ, không ẩn'); }
{ const r = rig({ exe: '' }); r.world.pids = [11]; r.w.start(); r.run(20000); ok(r.world.hideCalls === 0 && r.w.phase().phase === 'off', 'chưa chọn file DAW => không làm gì'); }

console.log('== 3. Kịch bản thật: mở DAW -> splash -> nạp VST (CPU cao) -> mở project -> yên -> ẩn ==');
{ const r = rig(); r.w.start(); r.run(3000);
  r.world.pids = [11]; r.world.title = ''; r.world.cpuPerSec = 100; r.run(15000);
  ok(r.world.hideCalls === 0 && r.w.phase().phase === 'waiting_ready', 'splash (tiêu đề rỗng, CPU cao) => KHÔNG ẩn');
  r.world.title = 'Studio Pro'; r.run(15000); ok(r.world.hideCalls === 0, 'cửa sổ chính chưa có tên project => KHÔNG ẩn');
  r.world.title = 'Studio Pro - Live Set'; r.run(15000); ok(r.world.hideCalls === 0, 'có project nhưng CPU vẫn cao (đang nạp VST) => KHÔNG ẩn');
  r.world.cpuPerSec = 3; r.run(5000); ok(r.world.hideCalls === 0, 'CPU vừa hạ, chưa đủ 8 s ổn định => chưa ẩn');
  r.run(8000); ok(r.world.hideCalls === 1 && r.w.phase().phase === 'done', 'ổn định đủ 8 s => ẨN đúng 1 lần', r.w.phase());
  r.run(60000); ok(r.world.hideCalls === 1, 'sau đó không ẩn lại'); }

console.log('== 4. Bị ngắt giữa chừng thì đếm lại từ đầu ==');
{ const r = rig(); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2; r.w.start(); r.run(9000);
  r.world.cpuPerSec = 80; r.run(4000); r.world.cpuPerSec = 2; r.run(5000);
  ok(r.world.hideCalls === 0, 'CPU vọt lên giữa chừng => bộ đếm ổn định reset, chưa ẩn');
  r.run(12000); ok(r.world.hideCalls === 1, 'yên lại đủ lâu => ẩn'); }
{ const r = rig(); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2; r.world.responding = false; r.w.start(); r.run(60000);
  ok(r.world.hideCalls === 0, 'DAW Not Responding => không ẩn'); }

console.log('== 5. Quá hạn => bỏ cuộc, KHÔNG ẩn ==');
{ const r = rig(); r.world.pids = [11]; r.world.title = 'Studio Pro'; r.world.cpuPerSec = 2; r.w.start(); r.run(320000);
  ok(r.world.hideCalls === 0 && r.w.phase().phase === 'gave_up' && /TITLE_MISSING_PROJECT/.test(r.w.phase().detail) && r.logs.some((l) => /BỎ CUỘC/.test(l)), 'quá 5 phút chưa thấy project => bỏ cuộc, DAW vẫn hiện, ghi lý do', r.w.phase()); }

console.log('== 6. Mỗi lượt DAW chỉ ẩn 1 lần ==');
{ const r = rig(); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2; r.w.start(); r.run(30000);
  ok(r.world.hideCalls === 1, 'đã ẩn lần 1'); r.world.hidden = false; r.run(60000);
  ok(r.world.hideCalls === 1, 'người dùng tự Hiện lại => KHÔNG bị ẩn lại (cùng PID)');
  r.world.pids = []; r.run(12000); ok(r.w.phase().phase === 'waiting_daw', 'DAW tắt => về trạng thái chờ');
  r.world.pids = [22]; r.world.title = 'Studio Pro'; r.run(10000); r.world.title = 'Studio Pro - Live Set'; r.run(30000);
  ok(r.world.hideCalls === 2, 'mở lại DAW (PID mới) => lượt mới, ẩn lần nữa'); }

console.log('== 7. Lỗi / ngoại lệ ==');
{ const r = rig({ hideResult: { ok: false, message: 'Windows từ chối' } }); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2; r.w.start(); r.run(120000);
  ok(r.world.hideCalls === 3 && r.w.phase().phase === 'gave_up', 'ẩn lỗi => thử tối đa 3 lần rồi bỏ cuộc (không lặp vô hạn)', { c: r.world.hideCalls, p: r.w.phase() }); }
{ const r = rig({ hidden: true }); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2; r.w.start(); r.run(30000);
  ok(r.world.hideCalls === 0 && r.w.phase().phase === 'done', 'DAW đã ẩn sẵn => không gọi ẩn thêm'); }
{ const r = rig(); const bad = W.createDawReadyWatcher({ ...{ readSettings: () => { throw new Error('boom'); }, log: () => { throw new Error('log'); } } }); let threw = false; try { bad.start(); bad.tick(); bad.stop(); } catch (e) { threw = true; } ok(!threw, 'cấu hình/log ném lỗi => KHÔNG throw ra ngoài'); }
{ // DAW cùng tên nhưng đường dẫn khác: tasklist thấy, identify không xác nhận => không theo dõi, không ẩn
  const r = rig(); r.world.pids = [11]; r.world.title = 'Studio Pro - Live Set'; r.world.cpuPerSec = 2;
  const d = r; d.w.stop(); const r2 = (() => { let t = 0; const timers = []; const w = W.createDawReadyWatcher({ log() {}, now: () => t, setTimer: (f, ms) => { const o = { at: t + ms, f }; timers.push(o); return o; }, clearTimer() {}, readSettings: () => r.world.settings, getExe: () => EXE, taskPids: (e, cb) => cb([11]), identify: (e, cb) => cb([]), sample: () => { throw new Error('không được đo'); }, isHidden: () => false, hide: () => { throw new Error('không được ẩn'); } }); w.start(); for (let i = 0; i < 20; i++) { timers.sort((a, b) => a.at - b.at); const n = timers.shift(); if (!n) break; t = n.at; n.f(); } return w; })();
  ok(r2.phase().phase === 'waiting_daw', 'tiến trình cùng tên nhưng KHÁC đường dẫn => không theo dõi, không ẩn'); }

console.log('== 8. Mã nguồn ==');
const src = fs.readFileSync(path.join(__dirname, '../../core/integration/DawReadyWatcher.js'), 'utf8');
ok(!/kill|taskkill|Stop-Process|Close\(\)/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'không có lệnh tắt/kill DAW');
ok(!/require\(["']electron["']\)/.test(src), 'module Node thuần (không require electron)');
const mainJs = fs.readFileSync(path.join(__dirname, '../../app/main.js'), 'utf8');
ok(/getDawReadyWatcher\(\)\.start\(\)/.test(mainJs) && /startHidden: sh/.test(mainJs), 'main.js: khởi động watcher + trả startHidden trong tools-daw-status');
ok(W.realDeps({ windowHider: {}, log() {}, readSettings() {}, getExe() {}, hide() {}, isHidden() {} }).taskPids.length === 2, 'realDeps dựng được');
if (process.platform !== 'win32') { let got = 'x'; W.realDeps({ windowHider: {}, log() {} }).taskPids(EXE, (p) => { got = p; }); ok(got === null, 'không phải Windows => taskPids trả null, không throw'); }
console.log(pass + ' PASS / ' + fail + ' FAIL (MÔ PHỎNG — chưa phải Windows thật / chưa thử với FSP8)'); process.exit(fail ? 1 : 0);
