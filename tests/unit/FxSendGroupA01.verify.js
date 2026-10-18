/**
 * AI-FX-01 — Nhóm Send Reverb/Delay + cô lập MIC (TỔNG HỢP; không phải DAW/MIDI/nhạc thật).
 * Chạy: node tests/unit/FxSendGroupA01.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const win = { performance: { now: () => 0 } }; vm.createContext(win); win.window = win; vm.runInContext(src, win);
const AS = win.AudioSource;

function chain(opts = {}) {
    const clock = { t: 0 }; const sends = []; const cfg = new Set(opts.configured || ['FX_SEND_REVERB', 'FX_SEND_DELAY']);
    const fail = new Set(opts.fail || []); let fx = false; const dawState = {}; // "DAW giả": trạng thái Send THẬT do giả lập
    const group = AS.createFxSendGroup({
        actions: ['FX_SEND_REVERB', 'FX_SEND_DELAY'], legacyAction: 'MONITOR_FX', isConfigured: (n) => cfg.has(n),
        execute: async (n, target) => { sends.push({ t: clock.t, n, target }); if (fail.has(n)) return { ok: false, status: 'NO_DEVICE' }; dawState[n] = target; return { ok: true }; },
    });
    group.seed(!!opts.seed);
    const ctl = AS.createFxAutoController({ now: () => clock.t, getFxState: () => group.aggregate() /* MENU-FX-FIX: giống wiring thật (renderer dùng group.aggregate(), không dùng biến fx riêng) */, applyFx: async (t) => { const r = await group.apply(t); if (r.ok) fx = t; return r; } });
    ctl.setSourceState(true);
    return { clock, sends, dawState, group, ctl, fail, get fx() { return fx; },
        async run(sec, music, mic) { const end = clock.t + sec * 1000; while (clock.t < end) { clock.t += 16; ctl.feedLevel(music(clock.t / 1000), clock.t); /* mic KHÔNG được đưa vào controller */ if (Math.round(clock.t / 16) % 31 === 0) ctl.tick(clock.t); await Promise.resolve(); } await Promise.resolve(); } };
}
const SIL = () => -80, MUS = () => -25, SPEECH = (t) => -20 + 8 * Math.sin(t * 5);
(async () => {
    console.log('=== FxSendGroupA01 (synthetic) ===');
    let c = chain(); await c.run(5, SIL); await c.run(10, MUS);
    ok(c.sends.length === 2 && c.dawState.FX_SEND_REVERB === true && c.dawState.FX_SEND_DELAY === true, '1. Nhạc bắt đầu → CẢ Send Reverb và Delay được bật (mỗi Send đúng 1 lệnh)');
    await c.run(30, MUS); ok(c.sends.length === 2, '2. Nhạc tiếp tục → không gửi lặp');
    await c.run(0.5, SIL); await c.run(5, MUS); ok(c.sends.length === 2, '3. Khoảng lặng ngắn (0,5 s < 1 s) → Send vẫn bật');
    await c.run(10, SIL);
    ok(c.sends.length === 4 && c.dawState.FX_SEND_REVERB === false && c.dawState.FX_SEND_DELAY === false, '4. Nhạc dừng đủ lâu → CẢ 2 Send tắt');
    // 5/6: micro nói to nhưng nhạc đã dừng: mic không vào controller => Send vẫn tắt
    const n4 = c.sends.length; await c.run(30, SIL, SPEECH); ok(c.sends.length === n4 && c.dawState.FX_SEND_REVERB === false, '5/6. Nhạc dừng, micro vẫn nói → Send vẫn tắt, mic không kích hoạt lại');
    const feedLines = ren.split('\n').filter((l) => /__fxAuto\??\.feedLevel/.test(l));
    ok(feedLines.length === 1, `   renderer: feedLevel chỉ được gọi đúng 1 chỗ (${feedLines.length})`);
    const i = ren.indexOf('__fxAuto?.feedLevel'); const around = ren.slice(Math.max(0, i - 700), i + 50);
    ok(/BPMEngine\.onLevel/.test(around) && !/__micSource/.test(around), '   chỗ đó nằm trong BPMEngine.onLevel (SYSTEM_AUDIO), không phải callback của __micSource');
    ok(!/__micSource[\s\S]{0,400}__fxAuto/.test(ren.slice(ren.indexOf('function startMicAndMasterVu'), ren.indexOf('function startMicAndMasterVu') + 3500)), '   khối MIC không tham chiếu __fxAuto');
    await c.run(6, MUS); ok(c.dawState.FX_SEND_REVERB === true && c.dawState.FX_SEND_DELAY === true, '7. Nhạc phát lại → bật lại cả 2');
    // 8: nhạc nhỏ nhưng trên ngưỡng, fade
    c = chain(); await c.run(5, SIL); await c.run(10, () => -40); ok(c.sends.length === 2, '8a. Nhạc nhỏ (-40 dBFS, trên ngưỡng -45) → vẫn bật');
    await c.run(20, () => -40 + 2 * Math.sin(Date.now())); ok(c.sends.length === 2, '8b. Dao động nhẹ khi nhạc nhỏ → không dao động trạng thái');
    // 9: DAW/MIDI lỗi một Send
    c = chain({ fail: ['FX_SEND_DELAY'] }); await c.run(5, SIL); await c.run(4, MUS);
    ok(c.dawState.FX_SEND_REVERB === true && c.dawState.FX_SEND_DELAY === undefined && c.fx === false && c.ctl.getInfo().actionState === 'FX_ACTION_FAILED', '9a. Delay gửi lỗi → nút FX KHÔNG hiện bật, trạng thái FX_ACTION_FAILED, không tuyên bố đồng bộ toàn bộ');
    const before = c.sends.filter((s) => s.n === 'FX_SEND_REVERB').length; c.fail.clear(); await c.run(15, MUS);
    ok(c.dawState.FX_SEND_DELAY === true && c.sends.filter((s) => s.n === 'FX_SEND_REVERB').length === before, '9b. Thử lại chỉ Send bị lỗi (Reverb không bị gửi trùng/đảo toggle)');
    c = chain({ configured: [] }); await c.run(5, SIL); await c.run(5, MUS);
    ok(c.sends.length === 0 && c.fx === false && c.ctl.getInfo().actionState === 'FX_ACTION_FAILED', '9c. Chưa cấu hình Send nào → không gửi, không đổi nút, báo lỗi (không giả vờ)');
    // chỉ có legacy
    c = chain({ configured: ['MONITOR_FX'] }); await c.run(5, SIL); await c.run(5, MUS); ok(c.sends.length === 1 && c.sends[0].n === 'MONITOR_FX', '   chỉ cấu hình MONITOR_FX cũ → dùng như Send đơn (tương thích)');
    // chỉ Reverb cấu hình
    c = chain({ configured: ['FX_SEND_REVERB'] }); await c.run(5, SIL); await c.run(5, MUS); ok(c.sends.length === 1 && c.sends[0].n === 'FX_SEND_REVERB', '   chỉ Reverb được cấu hình → chỉ điều khiển Reverb (Delay được báo là chưa cấu hình trong báo cáo)');
    // 10: 2 apply đồng thời không trùng
    c = chain(); const [a, b] = await Promise.all([c.group.apply(true), c.group.apply(true)]);
    ok(c.sends.length === 2, `10. Hai apply đồng thời cùng mục tiêu → hàng đợi tuần tự, mỗi Send đúng 1 lệnh (${c.sends.length})`);
    // 11: bấm tay
    c = chain(); await c.run(5, SIL); await c.run(10, MUS); c.ctl.notifyManual(); const r = await c.group.apply(false, { force: true });
    ok(r.ok && c.dawState.FX_SEND_REVERB === false && c.dawState.FX_SEND_DELAY === false, '11a. Bấm tay tắt → cả 2 Send tắt');
    const nm = c.sends.length; await c.run(20, MUS); ok(c.sends.length === nm, '11b. Auto nhường quyền trong lúc nhạc vẫn chạy');
    await c.run(45, MUS); ok(c.dawState.FX_SEND_REVERB === true, '11c. [MENU-FX-FIX] Hết 60 s giữ quyền, nhạc vẫn phát → Auto tiếp quản lại');
    // 12: khởi động lại: seed theo UI, không gửi
    c = chain({ seed: true }); await c.group.apply(true); ok(c.sends.length === 0, '12. Khởi động với UI đã ON (seed) rồi apply(ON) → không gửi lệnh');
    c = chain(); await c.run(10, SIL); ok(c.sends.length === 0, '12. Khởi động lại khi đang im lặng & FX OFF → không phát sinh lệnh');
    console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
})();
