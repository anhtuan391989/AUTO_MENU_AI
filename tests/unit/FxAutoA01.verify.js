/**
 * AI-FX-01 — Kiểm chứng Auto FX/Send theo nhạc (TÍN HIỆU TỔNG HỢP, đồng hồ ảo; KHÔNG phải nhạc thật/MIDI thật/DAW thật).
 * Chạy: node tests/unit/FxAutoA01.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const win = { performance: { now: () => 0 } }; vm.createContext(win); win.window = win;
vm.runInContext(src, win);
const AS = win.AudioSource;

function rig(opts = {}) {
    const clock = { t: 0 }; const calls = []; let fx = !!opts.fxInit; let failNext = opts.failApply || 0; let result = null;
    const ctl = AS.createFxAutoController({
        now: () => clock.t, getFxState: () => fx, params: opts.params,
        applyFx: async (target) => {
            calls.push({ t: clock.t, target });
            if (failNext > 0) { failNext--; return { ok: false, status: 'NO_DEVICE' }; }
            fx = target; return { ok: true };
        },
    });
    ctl.setSourceState(true);
    const r = {
        clock, calls, ctl, get fx() { return fx; }, set fx(v) { fx = v; },
        async run(sec, levelFn) { const end = clock.t + sec * 1000; while (clock.t < end) { clock.t += 16; ctl.feedLevel(levelFn(clock.t / 1000), clock.t); if (Math.round(clock.t / 16) % 31 === 0) ctl.tick(clock.t); await Promise.resolve(); } await Promise.resolve(); },
    };
    return r;
}
const SIL = () => -80, MUS = () => -25, NOISE = (t) => -62 + 4 * Math.sin(t * 7);
(async () => {
    console.log('=== FxAutoA01 (synthetic) ===');
    let r = rig(); await r.run(10, SIL);
    ok(r.calls.length === 0 && r.fx === false, '1. Không nhạc, FX đã OFF → không gửi gì');
    r = rig(); await r.run(5, SIL); await r.run(10, MUS);
    ok(r.calls.length === 1 && r.calls[0].target === true, `2. Nhạc ổn định → ON đúng 1 lần (${r.calls.length})`);
    ok(r.ctl.getInfo().actionState === 'SEND_SENT_UNCONFIRMED', '   trạng thái = SEND_SENT_UNCONFIRMED (không "đã xác nhận")');
    await r.run(30, MUS); ok(r.calls.length === 1, '3. Nhạc vẫn chạy → không gửi thêm');
    await r.run(3, SIL); await r.run(10, MUS); ok(r.calls.length === 1 && r.fx === true, '4. Khoảng lặng 3 s (<6 s) → giữ ON');
    await r.run(10, SIL); ok(r.calls.length === 2 && r.calls[1].target === false, `5. Im lặng >6 s → OFF đúng 1 lần (${r.calls.length})`);
    await r.run(20, SIL); ok(r.calls.length === 2, '   im lặng tiếp → không gửi lặp');
    await r.run(5, MUS); ok(r.calls.length === 3 && r.calls[2].target === true, '6. Nhạc phát lại → ON');
    // 7. dao động quanh ngưỡng: -48 (giữa off -52 và on -45) → trạng thái không đổi
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); const n0 = r.calls.length;
    await r.run(40, (t) => -48.5 + 3 * Math.sin(t * 9)); ok(r.calls.length === n0, `7. Dao động quanh ngưỡng (trong dải hysteresis) → không bật/tắt (${r.calls.length - n0} lệnh thêm)`);
    r = rig(); await r.run(60, (t) => -48.5 + 3 * Math.sin(t * 9)); ok(r.calls.length === 0, '   từ im lặng, dao động trong dải hysteresis → không bật');
    r = rig(); await r.run(60, NOISE); ok(r.calls.length === 0, '8. Nhiễu nền -62±4 dBFS → không chuyển trạng thái giả');
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); const spike = r.calls.length;
    await r.run(15, (t) => (Math.floor(t * 2) % 5 === 0 && (t * 1000 % 100) < 16 ? -30 : -80)); ok(r.calls.length <= spike + 1 && r.calls.length >= spike, `xung lẻ xen im lặng: OFF tối đa 1 lần, không dao động (${r.calls.length - spike} lệnh thêm)`);
    // 9. lỗi MIDI
    r = rig({ failApply: 5 }); await r.run(5, SIL); await r.run(3, MUS);
    ok(r.fx === false && r.ctl.getInfo().actionState === 'FX_ACTION_FAILED', '9. Gửi thất bại → UI giữ OFF, trạng thái FX_ACTION_FAILED (không giả vờ)');
    await r.run(30, MUS); ok(r.calls.length <= 3, `   thử lại có giới hạn (${r.calls.length} lần, tối đa 1 + maxRetries)`);
    // 10. reconnect nguồn
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); const before = r.calls.length;
    r.ctl.setSourceState(false); await r.run(5, MUS); r.ctl.setSourceState(true); await r.run(10, MUS);
    ok(r.calls.length === before, '10. Mất rồi nối lại nguồn khi nhạc vẫn chạy → không gửi trùng');
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); r.ctl.setSourceState(false);
    await r.run(20, SIL); ok(r.calls.length === 1 && r.ctl.getInfo().musicState === 'SOURCE_UNAVAILABLE', '   nguồn không khả dụng → đóng băng, KHÔNG tắt FX');
    // 11. khởi động lại: 2 controller độc lập không chia sẻ; wiring chỉ tạo 1 interval
    ok((ren.match(/setInterval\(\(\) => \{ if \(getSetting\("fxAutoEnabled"/g) || []).length === 1 && /if \(window\.__fxAuto \|\| /.test(ren), '11. Wiring: đúng 1 setInterval và có chốt chống tạo controller thứ hai');
    // 12. thủ công
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); r.fx = false; r.ctl.notifyManual();
    await r.run(20, MUS); ok(r.fx === false && r.calls.length === 1, '12a. User tắt tay khi nhạc chạy → Auto nhường quyền, không ép bật lại');
    await r.run(10, SIL); await r.run(5, MUS); ok(r.calls.length === 2 && r.fx === true, '12b. Đổi trạng thái nhạc kế tiếp → Auto hoạt động lại');
    // khởi động khi nhạc đang phát và UI đã ON (persisted) → không gửi
    r = rig({ fxInit: true }); await r.run(10, MUS); ok(r.calls.length === 0, 'Khởi động khi nhạc đang phát và FX đã ON → không gửi lệnh');
    // đổi bài: im lặng 2 s
    r = rig(); await r.run(5, SIL); await r.run(10, MUS); await r.run(2, SIL); await r.run(10, MUS); ok(r.calls.length === 1, 'Chuyển bài (2 s lặng) → không tắt/bật');
    // fade-out dài: 8 s giảm dần
    r = rig(); await r.run(5, SIL); await r.run(10, MUS);
    await r.run(8, (t) => -25 - ((t % 8) / 8) * 40); await r.run(10, SIL);
    ok(r.calls.length === 2 && r.calls[1].target === false, 'Fade-out → OFF đúng 1 lần sau khi im lặng xác nhận');
    console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
})();
