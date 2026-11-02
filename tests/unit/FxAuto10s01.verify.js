// FX-AUTO-10S — Nút FX: có nhạc -> tự BẬT (≤ ~1 s); im lặng liên tục 10 s -> tự TẮT. Dùng audioSource.js THẬT, đồng hồ ảo, KHÔNG ghim tham số (kiểm ngưỡng mặc định).
const fs = require('fs'), path = require('path'), vm = require('vm');
const win = { performance: { now: () => 0 } }; vm.createContext(win); win.window = win;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8'), win);
const AS = win.AudioSource;
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const clock = { t: 100000 }; let fx = false; const calls = [];
const ctl = AS.createFxAutoController({ now: () => clock.t, getFxState: () => fx, applyFx: async (t) => { calls.push({ t: clock.t, target: t }); fx = t; return { ok: true }; } });
ctl.setSourceState(true);
const SIL = -80, MUS = -25;
async function run(sec, db) { const end = clock.t + sec * 1000; while (clock.t < end) { clock.t += 16; ctl.feedLevel(db, clock.t); if (Math.round(clock.t / 16) % 6 === 0) ctl.tick(clock.t); await Promise.resolve(); } await Promise.resolve(); }
(async () => {
  ok(AS.FX_AUTO_DEFAULTS.confirmSilenceMs === 10000, 'ngưỡng tắt mặc định = 10000 ms');
  ok(AS.FX_AUTO_DEFAULTS.confirmMusicMs <= 1000, 'ngưỡng bật vẫn nhanh (≤ 1 s)', AS.FX_AUTO_DEFAULTS.confirmMusicMs);
  await run(12, SIL); ok(calls.length === 0 && fx === false, 'mở app im lặng: FX không bật');
  const t0 = clock.t; await run(3, MUS); ok(fx === true && calls.length === 1 && calls[0].t - t0 <= 1000, `có nhạc -> FX BẬT sau ${calls[0] && calls[0].t - t0} ms (≤ 1000)`);
  await run(5, SIL); ok(fx === true && calls.length === 1, 'im lặng 5 s -> FX vẫn BẬT');
  await run(3.5, SIL); ok(fx === true && calls.length === 1, 'im lặng 8,5 s -> FX vẫn BẬT');
  await run(3, MUS); ok(fx === true && calls.length === 1, 'nhạc quay lại sau 8 s lặng -> không tắt, không gửi thừa');
  const t1 = clock.t; await run(12, SIL); const off = calls[1];
  ok(fx === false && calls.length === 2 && off.target === false, 'im lặng liên tục -> FX TẮT đúng 1 lần', calls.length);
  ok(off && off.t - t1 >= 9500 && off.t - t1 <= 11200, `TẮT sau ${off && off.t - t1} ms im lặng (đích ≈ 10000)`);
  await run(30, SIL); ok(calls.length === 2, 'im lặng tiếp: không gửi lặp');
  const t2 = clock.t; await run(3, MUS); ok(fx === true && calls.length === 3 && calls[2].t - t2 <= 1000, `nhạc lại -> BẬT sau ${calls[2] && calls[2].t - t2} ms`);
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
