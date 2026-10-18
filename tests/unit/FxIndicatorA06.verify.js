/**
 * AI-FIX-06 — Nút FX tự sáng/tắt theo nhạc: kiểm chứng wiring THẬT trong renderer.js (createFxAutoWiring) với DOM/ActionRegistry giả,
 * audioSource.js thật. TÍN HIỆU TỔNG HỢP; không phải MIDI/DAW/nhạc thật.
 * Chạy: node tests/unit/FxIndicatorA06.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const asSrc = fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
const a = ren.indexOf('function createFxAutoWiring() {'), b = ren.indexOf('createFxAutoWiring();\n', a);
const fnSrc = ren.slice(a, b);
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

function build(opts = {}) {
    const clock = { t: 0 }; const executed = []; const telemetry = []; const cls = new Set(); const btn = { dataset: {}, title: '', classList: { toggle(c, f) { (f === undefined ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c), add: (c) => cls.add(c) } };
    const cfg = new Set(opts.configured || []); let failExec = !!opts.failExec; const intervals = [];
    const win = { performance: { now: () => 0 }, electronAPI: { sendTelemetry: (r) => telemetry.push(r) } }; win.window = win;
    win.Date = { now: () => clock.t };
    vm.createContext(win); vm.runInContext(asSrc, win);
    Object.assign(win, {
        document: { getElementById: (id) => (id === 'fxBtn' ? btn : null) }, getSetting: (k, f) => (k === 'fxAutoMidiMode' ? 'toggle' : f), saveData: () => {}, console: { log() {}, warn() {}, error() {} },
        setInterval: (fn, ms) => { intervals.push(fn); return intervals.length; }, AudioSource: win.AudioSource,
        ActionRegistry: {
            ACTIONS: { MONITOR_FX: 'MONITOR_FX', FX_SEND_REVERB: 'FX_SEND_REVERB', FX_SEND_DELAY: 'FX_SEND_DELAY' },
            getMidiOutMapping: (n) => (cfg.has(n) ? { kind: 'cc', number: 20, value: 127, channel: 1 } : null), getMouseCoordinate: () => '',
            executeAction: async (n, ctx) => { executed.push({ n, t: clock.t }); return failExec ? { ok: false, status: 'NO_DEVICE', via: 'midi' } : { ok: true, status: 'SUCCESS', via: 'midi' }; },
        },
    });
    vm.runInContext(fnSrc + '\ncreateFxAutoWiring();', win);
    const ctl = win.__fxAuto; ctl.setSourceState(true);
    return { win, btn, cls, executed, telemetry, ctl, setFail: (v) => { failExec = v; },
        async run(sec, lvl) { const end = clock.t + sec * 1000; while (clock.t < end) { clock.t += 16; ctl.feedLevel(lvl(clock.t / 1000), clock.t); if (Math.round(clock.t / 16) % 31 === 0) ctl.tick(clock.t); await Promise.resolve(); } for (let i = 0; i < 5; i++) await Promise.resolve(); } };
}
const SIL = () => -80, MUS = () => -25;
(async () => {
    console.log('=== FxIndicatorA06 (wiring thật trong renderer.js; synthetic) ===');
    let r = build({ configured: ['FX_SEND_REVERB', 'FX_SEND_DELAY'] }); await r.run(5, SIL); await r.run(5, MUS);
    ok(r.cls.has('active'), '1. Nhạc phát → nút FX tự SÁNG');
    ok(r.executed.length === 2 && r.btn.dataset.fxSync === 'sent-unconfirmed' && /chưa xác nhận/.test(r.btn.title), '   đã gửi Reverb + Delay đúng 1 lệnh mỗi Send; trạng thái = đã gửi, CHƯA xác nhận');
    await r.run(20, MUS); ok(r.executed.length === 2, '2. Nhạc tiếp tục → không gửi lặp');
    await r.run(0.5, SIL); await r.run(3, MUS); ok(r.cls.has('active') && r.executed.length === 2, '3. Lặng ngắn (0,5 s) → nút vẫn sáng, không gửi');
    await r.run(10, SIL); ok(!r.cls.has('active') && r.executed.length === 4, '4. Nhạc dừng đủ lâu → nút TẮT + 2 lệnh tắt');
    await r.run(30, SIL); ok(r.executed.length === 4 && !r.cls.has('active'), '5. Micro/nhiễu sau khi dừng (không vào bộ phát hiện) → vẫn tắt, không gửi');
    await r.run(5, MUS); ok(r.cls.has('active') && r.executed.length === 6, '6. Nhạc phát lại → sáng lại + bật Send');
    // chưa cấu hình Send: nút VẪN sáng theo yêu cầu nhưng trạng thái nói rõ không có lệnh nào tới DAW
    r = build({ configured: [] }); await r.run(5, SIL); await r.run(5, MUS);
    ok(r.cls.has('active') && r.executed.length === 0, '7a. Chưa cấu hình Send: nút sáng theo YÊU CẦU, KHÔNG có lệnh nào gửi đi');
    ok(r.btn.dataset.fxSync === 'not-configured' && /CHƯA cấu hình/.test(r.btn.title), '7b. Trạng thái hiển thị đúng sự thật: chưa cấu hình, DAW không nhận lệnh (không báo thành công giả)');
    // MIDI lỗi
    r = build({ configured: ['FX_SEND_REVERB', 'FX_SEND_DELAY'], failExec: true }); await r.run(5, SIL); await r.run(5, MUS);
    ok(r.cls.has('active') && r.btn.dataset.fxSync === 'failed' && /LỖI/.test(r.btn.title), '8. MIDI lỗi: nút theo yêu cầu nhưng trạng thái = LỖI/chưa đồng bộ (không báo đã áp dụng)');
    const n = r.executed.length; await r.run(60, MUS); ok(r.executed.length <= n + 4, `   thử lại có giới hạn, không lặp vô hạn (${r.executed.length - n} lệnh thêm)`);
    r.setFail(false);
    // nguồn mất: đóng băng
    r = build({ configured: ['FX_SEND_REVERB'] }); await r.run(5, SIL); await r.run(5, MUS); r.ctl.setSourceState(false); await r.run(20, SIL);
    ok(r.cls.has('active') && /không khả dụng/.test(r.btn.title), '9. Nguồn nhạc mất → giữ nguyên trạng thái, báo không khả dụng');
    // telemetry
    r = build({ configured: ['FX_SEND_REVERB'] }); await r.run(5, SIL); await r.run(5, MUS); await r.run(10, SIL);
    ok(r.telemetry.filter((x) => x.event === 'FX_AUTO').length >= 2 && r.telemetry.length < 30, `10. Chuyển trạng thái được ghi log FX_AUTO (${r.telemetry.length} bản ghi, không spam mỗi chu kỳ)`);
    ok(typeof r.win.__fxAutoDebug === 'function' && r.win.__fxAutoDebug().framesSeen > 0, '    __fxAutoDebug() trả về chẩn đoán (số khung nhận, mức dBFS, Send)');
    console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
})();
