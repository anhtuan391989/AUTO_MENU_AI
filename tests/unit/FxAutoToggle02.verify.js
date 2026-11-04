// FX-AUTO-TOGGLE-02 — ô tích: BỎ tích => Auto bị chặn; TÍCH lại => Auto quay lại NGAY theo nhạc hiện tại (bỏ qua giữ quyền 60 s). audioSource.js THẬT + đồng hồ ảo.
const fs = require('fs'), path = require('path'), vm = require('vm');
const win = { performance: { now: () => 0 } }; vm.createContext(win); win.window = win;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8'), win);
const AS = win.AudioSource; let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  OK  ' : '  FAIL', m); };
const clock = { t: 100000 }; let fx = false, enabled = true; const calls = [];
const ctl = AS.createFxAutoController({ now: () => clock.t, isEnabled: () => enabled, getFxState: () => fx, applyFx: async (t) => { calls.push(t); fx = t; return { ok: true }; } });
ctl.setSourceState(true);
async function run(sec, db) { const end = clock.t + sec * 1000; while (clock.t < end) { clock.t += 16; ctl.feedLevel(db, clock.t); if (Math.round(clock.t / 16) % 6 === 0) ctl.tick(clock.t); await Promise.resolve(); } await Promise.resolve(); }
(async () => {
  await run(3, -25); ok(fx === true, 'có nhạc, tích => FX BẬT');
  enabled = false; await run(8, -80); ok(fx === true && calls.length === 1, 'BỎ tích + im lặng => Auto KHÔNG tắt FX (bị chặn)');
  enabled = true; ctl.resume(clock.t); await Promise.resolve(); await Promise.resolve();
  ok(fx === false && calls.length === 2, 'TÍCH lại, đang không nhạc, FX đang bật => TẮT NGAY');
  enabled = false; await run(3, -25); ok(fx === false, 'BỎ tích + có nhạc => FX KHÔNG tự bật');
  enabled = true; ctl.resume(clock.t); await Promise.resolve(); await Promise.resolve();
  ok(fx === true, 'TÍCH lại, đang có nhạc, FX đang tắt => BẬT NGAY');
  ctl.notifyManual(false); fx = false; await run(2, -25); ok(fx === false, 'bấm tay TẮT => Auto nhường quyền (60 s)');
  ctl.resume(clock.t); await Promise.resolve(); await Promise.resolve();
  ok(fx === true, 'tích lại trong lúc giữ quyền thủ công => Auto quay lại NGAY (không chờ 60 s)');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
