/**
 * MENU-FX-FIX — 10 trường hợp bắt buộc cho Auto FX + nút FX của Menu.
 * Dùng wiring THẬT createFxAutoWiring() trích từ ui/js/renderer.js + audioSource.js THẬT; DOM/ActionRegistry/DAW GIẢ LẬP; ĐỒNG HỒ ẢO
 * (không chờ thật 60 s); chu kỳ tick 100 ms lấy đúng từ setInterval mà wiring đăng ký.
 * ĐÂY LÀ TEST LOGIC/UI TRÊN TÍN HIỆU TỔNG HỢP — KHÔNG PHẢI xác minh Reverb/Delay Send thật trong DAW, không phải nhạc/MIDI thật.
 * Chạy: node tests/unit/MenuFxFix.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const asSrc = fs.readFileSync(path.resolve(__dirname, '../../ui/js/audioSource.js'), 'utf8');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
const a = ren.indexOf('function createFxAutoWiring() {'), b = ren.indexOf('createFxAutoWiring();\n', a);
const fnSrc = ren.slice(a, b);
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

const FRAME = 16, TICK = 100;
function build(opts = {}) {
    const clock = { t: 0 }; const executed = []; const telemetry = []; const timers = []; const deferred = [];
    const cls = new Set(opts.saved ? ['active'] : []);
    const btn = { dataset: {}, title: '', classList: { toggle(c, f) { (f === undefined ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c), add: (c) => cls.add(c) } };
    const cfg = new Set(opts.configured === undefined ? ['FX_ON', 'FX_OFF'] : opts.configured);
    let mode = opts.mode || 'ok'; const intervals = [];
    const win = { performance: { now: () => 0 }, electronAPI: { sendTelemetry: (r) => telemetry.push(r) } }; win.window = win;
    win.Date = { now: () => clock.t };
    vm.createContext(win); win.setTimeout = (fn, ms) => { timers.push({ at: clock.t + ms, fn }); return timers.length; }; win.clearTimeout = (h) => { if (timers[h - 1]) timers[h - 1].fn = null; };
    vm.runInContext(asSrc, win);
    Object.assign(win, {
        document: { getElementById: (id) => (id === 'fxBtn' ? btn : null) }, getSetting: (k, f) => (k === 'fxAutoMidiMode' ? 'toggle' : f), saveData: () => {}, console: { log() {}, warn() {}, error() {} },
        setInterval: (fn) => { intervals.push(fn); return intervals.length; }, AudioSource: win.AudioSource,
        ActionRegistry: {
            ACTIONS: { MONITOR_FX: 'MONITOR_FX', FX_SEND_REVERB: 'FX_SEND_REVERB', FX_SEND_DELAY: 'FX_SEND_DELAY', FX_ON: 'FX_ON', FX_OFF: 'FX_OFF' },
            // FSP8-LIVE-MONITOR-FX-AUTO-FIX-01 — mô phỏng ĐÚNG hợp đồng actionRegistry.js thật: explicit khi đã lưu ít nhất một trong FX_ON/FX_OFF;
            // explicit chỉ gửi mapping của chiều đích (thiếu => NOT_CONFIGURED, không toggle); legacy => lệnh MONITOR_FX cũ.
            getDawStateMode: () => (cfg.has('FX_ON') || cfg.has('FX_OFF') ? 'explicit' : 'legacy'),
            setDawControlState: async (control, target, ctx) => {
                const explicit = cfg.has('FX_ON') || cfg.has('FX_OFF');
                const action = explicit ? (target ? 'FX_ON' : 'FX_OFF') : 'MONITOR_FX';
                const res = explicit && !cfg.has(action) ? { ok: false, status: 'NOT_CONFIGURED', reason: 'NOT_CONFIGURED' } : await win.ActionRegistry.executeAction(action, ctx);
                const text = res && res.ok ? 'đã GỬI lệnh FX (Mute 4 bus) ' + (target ? 'ON' : 'OFF') + ' — DAW chưa xác nhận' : 'CHƯA cấu hình lệnh FX (Mute 4 bus) hoặc lỗi — DAW KHÔNG nhận lệnh';
                win.__dawStateLast = win.__dawStateLast || {}; win.__dawStateLast[control] = { target: target ? 'ON' : 'OFF', ok: !!(res && res.ok), action, text };
                return Object.assign({}, res, { control, target: target ? 'ON' : 'OFF', mode: explicit ? 'explicit' : 'legacy', action, text, delivery: res && res.ok ? 'UNCONFIRMED' : 'NOT_SENT', dawConfirmed: false });
            },
            getMidiOutMapping: (n) => (cfg.has(n) ? { kind: 'cc', number: 20, value: 127, channel: 1 } : null), getMouseCoordinate: () => '',
            executeAction: (n) => {
                executed.push({ n, t: clock.t });
                if (!cfg.has(n)) return Promise.resolve({ ok: false, reason: 'NOT_CONFIGURED' }); // đúng hình dạng actionRegistry thật khi chưa cấu hình
                if (mode === 'fail') return Promise.resolve({ ok: false, status: 'NO_DEVICE', via: 'midi' });
                if (mode === 'defer') return new Promise((res) => deferred.push(res));
                if (mode === 'hang') return new Promise(() => {});
                return Promise.resolve({ ok: true, status: 'SUCCESS', via: 'midi' });
            },
        },
    });
    vm.runInContext(fnSrc + '\ncreateFxAutoWiring();', win);
    const ctl = win.__fxAuto; if (opts.source !== false) ctl.setSourceState(true);
    const R = {
        win, btn, cls, executed, telemetry, ctl, deferred, clock,
        setMode: (m) => { mode = m; },
        get on() { return cls.has('active'); }, get info() { return ctl.getInfo(); },
        // Mô phỏng ĐÚNG click handler: đổi class rồi gọi __fxManualToggle(trạng thái mới)
        click() { btn.classList.toggle('active'); return win.__fxManualToggle(cls.has('active')); },
        async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); },
        // mic: được truyền vào để cho thấy NÓ KHÔNG đi vào bộ điều khiển (production không có đường nào nối mic -> __fxAuto)
        async run(sec, music, mic) {
            const end = clock.t + sec * 1000; let nextTick = Math.ceil(clock.t / TICK) * TICK;
            while (clock.t < end) {
                clock.t += FRAME; ctl.feedLevel(music(clock.t / 1000), clock.t); void mic;
                for (const tm of timers) if (tm.fn && tm.at <= clock.t) { const f = tm.fn; tm.fn = null; f(); }
                while (nextTick <= clock.t) { intervals.forEach((fn) => fn()); nextTick += TICK; }
                await Promise.resolve();
            }
            await R.flush();
        },
    };
    return R;
}
async function settle(r, res) { for (let i = 0; i < 6; i++) { const d = r.deferred.splice(0); if (!d.length) { await r.flush(); continue; } d.forEach((f) => f(res)); await r.flush(); } }
const SIL = () => -80, MUS = () => -25, MIC_LOUD = (t) => -18 + 6 * Math.sin(t * 5);
// đo độ trễ: chạy từng bước 16 ms tới khi điều kiện đúng, trả về số ms kể từ mốc
async function until(r, music, cond, maxMs) { const t0 = r.clock.t; while (r.clock.t - t0 < maxMs) { await r.run(0.016, music); if (cond()) return r.clock.t - t0; } return Infinity; }

(async () => {
    console.log('=== MenuFxFix (wiring thật + đồng hồ ảo; TÍN HIỆU TỔNG HỢP, KHÔNG phải DAW thật) ===');

    // ---- 1. nhạc xuất hiện → FX bật ≤ 1 s
    let r = build(); await r.run(5, SIL); ok(!r.on, '1a. Im lặng ban đầu: nút TẮT');
    let ms = await until(r, MUS, () => r.on, 3000);
    ok(ms <= 1000, `1b. Nhạc xuất hiện → nút/yêu cầu FX BẬT sau ${ms} ms (≤ 1000)`);
    await r.run(0.3, MUS); ok(r.executed.length === 1 && r.executed[0].n === 'FX_ON' && r.executed.every((e) => e.t - 5000 <= 1000 + 400), `1c. Lệnh FX_ON (mute 4 bus) gửi ngay khi bật, đúng 1 lệnh, KHÔNG Send (${r.executed.length} lệnh)`);
    // nhạc xuất hiện TRỞ LẠI sau khi tắt
    await r.run(3, SIL); ok(!r.on, '1d. (tiền đề) đã tắt sau im lặng');
    ms = await until(r, MUS, () => r.on, 3000); ok(ms <= 1000, `1e. Nhạc xuất hiện trở lại → BẬT sau ${ms} ms (≤ 1000)`);

    // ---- 2. nhạc im lặng liên tục 1 s → FX tắt
    r = build(); await r.run(5, SIL); await r.run(5, MUS); ok(r.on, '2a. (tiền đề) đang BẬT');
    ms = await until(r, SIL, () => !r.on, 3000);
    ok(ms >= 1000 - FRAME && ms <= 1000 + TICK + 2 * FRAME, `2b. Im lặng liên tục → TẮT sau ${ms} ms (đích ≈ 1000 ms + ≤1 chu kỳ tick)`);
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.run(0.8, SIL); await r.run(5, MUS); ok(r.on, '2c. Lặng chỉ 0,8 s (<1 s) → KHÔNG tắt');

    // ---- 3. mic hoạt động, không có nhạc → Auto FX không bật
    r = build(); await r.run(30, SIL, MIC_LOUD);
    ok(!r.on && r.executed.length === 0, '3a. Mic to liên tục, nhạc im → FX không bật, không gửi lệnh');
    const micBlock = ren.slice(ren.indexOf('__micSource = AudioSource.createMicSource()'), ren.indexOf('__micSource.start()'));
    ok(micBlock.length > 100 && !/__fxAuto|feedLevel|createFxAuto/.test(micBlock), '3b. (tĩnh) khối khởi tạo MIC trong renderer.js KHÔNG tham chiếu bộ Auto FX');
    const feedSites = [...ren.matchAll(/__fxAuto\??\.feedLevel/g)].length;
    const lvlBlock = ren.slice(ren.indexOf('BPMEngine.onLevel(({'), ren.indexOf('BPMEngine.onLevel(({') + 1400);
    ok(feedSites === 1 && /__fxAuto\?\.feedLevel\(dbfsFloat !== undefined \? dbfsFloat : dbfs\)/.test(lvlBlock), '3c. (tĩnh) feedLevel chỉ được gọi ĐÚNG 1 chỗ: BPMEngine.onLevel (analyser của SYSTEM_AUDIO)');
    ok(/BPMEngine\.init\(audioContext, source\)/.test(ren) && /systemAudio\.getRawSourceNodeForAdapter\(\)/.test(ren), '3d. (tĩnh) BPMEngine được nối với nguồn SYSTEM_AUDIO, không phải MIC');

    // ---- 4. mic tiếp tục sau khi nhạc dừng → vẫn tắt
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.run(3, SIL, MIC_LOUD); ok(!r.on, '4a. Nhạc dừng → TẮT');
    const n4 = r.executed.length; await r.run(60, SIL, MIC_LOUD); ok(!r.on && r.executed.length === n4, '4b. Mic vẫn nói 60 s sau khi nhạc dừng → vẫn TẮT, không gửi lại');

    // ---- 5. bấm tay → Auto không ghi đè trong 60 s
    r = build(); await r.run(5, SIL); await r.click(); await r.flush(); ok(r.on && r.info.manualOverride, '5a. Bấm tay BẬT khi nhạc im: nút BẬT, manualOverride');
    const n5 = r.executed.length; await r.run(59, SIL); ok(r.on && r.executed.length === n5, '5b. 59 s im lặng sau bấm tay: Auto KHÔNG tắt, không gửi lệnh');
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.click(); await r.flush(); ok(!r.on, '5c. Bấm tay TẮT khi nhạc đang phát: nút TẮT');
    const n5c = r.executed.length; await r.run(59, MUS); ok(!r.on && r.executed.length === n5c, '5d. 59 s nhạc vẫn phát: Auto KHÔNG bật lại');
    // bấm lần nữa thì tính lại 60 s
    await r.run(0.5, MUS); await r.click(); await r.flush(); await r.click(); await r.flush();
    const n5e = r.executed.length; await r.run(55, MUS); ok(!r.on && r.executed.length === n5e, '5e. Bấm tiếp → mốc 60 s tính lại từ lần bấm cuối');

    // ---- 6. hết 60 s, nhạc vẫn phát → tiếp quản theo trạng thái HIỆN TẠI
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.click(); await r.flush(); // tắt tay khi nhạc phát
    await r.run(59, MUS); ok(!r.on, '6a. Trong 59 s: vẫn tắt tay');
    ms = await until(r, MUS, () => r.on, 3000); ok(ms <= 1500, `6b. Hết 60 s, nhạc vẫn phát → Auto BẬT lại (+${ms} ms sau mốc 59 s; mốc 60 s ≤ ${1000} ms nữa)`);
    ok(r.executed.length >= 2 && r.executed[r.executed.length - 1].t >= 10000 + 60000 - 1, '6c. Lệnh tiếp quản KHÔNG được gửi trước mốc 60 s kể từ lúc bấm');
    // trạng thái hiện tại, không phải trạng thái cũ: nhạc dừng giữa chừng rồi phát lại trước mốc 60 s
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.click(); await r.flush(); // tắt tay (nhạc phát)
    await r.run(10, SIL); await r.run(20, SIL); ok(!r.on, '6d. (tiền đề) giữa chừng nhạc dừng 30 s');
    await r.run(15, MUS); await r.run(20, MUS); // phát lại, tới sau mốc 60 s
    ok(r.on, '6e. Nhạc phát lại trước mốc 60 s và còn phát khi hết 60 s → BẬT theo trạng thái HIỆN TẠI (không dùng trạng thái im lặng cũ)');

    // ---- 7. hết 60 s, nhạc đã im lặng → TẮT theo trạng thái hiện tại
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.click(); await r.flush(); await r.click(); await r.flush(); // ON bằng tay (2 lần bấm: tắt rồi bật)
    ok(r.on, '7a. (tiền đề) BẬT tay');
    await r.run(20, MUS); await r.run(30, SIL); ok(r.on, '7b. Trước mốc 60 s (nhạc đã im 30 s): vẫn BẬT (Auto chưa được ghi đè)');
    ms = await until(r, SIL, () => !r.on, 15000); ok(ms <= 11000, `7c. Hết 60 s, nhạc đã im → TẮT (+${ms} ms)`);
    r = build(); await r.run(5, SIL); await r.run(5, MUS); await r.click(); await r.flush(); await r.click(); await r.flush();
    await r.run(20, MUS); await r.run(10, SIL); await r.run(10, MUS); await r.run(25, SIL); // im ở thời điểm hết hạn
    ok(!r.on, '7d. Nhạc dừng/phát/dừng trong lúc giữ quyền; im lặng khi hết 60 s → TẮT (theo trạng thái hiện tại)');
    r = build(); await r.run(5, SIL); await r.click(); await r.flush(); await r.run(70, SIL, MIC_LOUD); ok(!r.on, '7e. Mic to suốt 70 s, nhạc im → hết 60 s vẫn TẮT (mic không đổi kết quả)');

    // ---- 8. Send chưa cấu hình → UI hiện đúng trạng thái yêu cầu, không tuyên bố Send đã hoạt động
    r = build({ configured: [] }); await r.run(5, SIL); await r.run(3, MUS);
    ok(r.on && r.executed.length === 0, '8a. Auto: chưa cấu hình Send → nút BẬT theo YÊU CẦU, không lệnh nào gửi tới DAW');
    ok(r.btn.dataset.fxSync === 'not-configured' && /CHƯA cấu hình/.test(r.btn.title) && !/đã GỬI/.test(r.btn.title), '8b. Hiển thị rõ: CHƯA cấu hình Send, không nói "đã gửi"');
    r = build({ configured: [] }); await r.run(2, SIL); await r.click(); await r.flush();
    ok(r.on && r.btn.dataset.fxSync === 'not-configured' && r.btn.dataset.fxControl === 'manual' && /THỦ CÔNG/.test(r.btn.title) && /CHƯA cấu hình/.test(r.btn.title), '8c. Bấm tay (Send chưa cấu hình): nút theo yêu cầu + hiển thị "thủ công" + "CHƯA cấu hình Send"');
    r = build({ configured: ['FX_ON', 'FX_OFF'] }); await r.run(5, SIL); await r.run(3, MUS);
    ok(r.btn.dataset.fxSync === 'sent-unconfirmed' && /chưa xác nhận/.test(r.btn.title) && !/(^|[^a-zA-Z])đã xác nhận/.test(r.btn.title), '8d. Dù gửi OK: chỉ ghi "đã GỬI — DAW chưa xác nhận"; không bao giờ ghi "đã đồng bộ/xác nhận"');

    // ---- 9. runtime chậm / lỗi → không hiện đồng bộ giả
    r = build({ mode: 'defer' }); await r.run(5, SIL); await r.run(1.5, MUS);
    ok(r.on && r.btn.dataset.fxSync === 'pending' && /CHƯA có phản hồi/.test(r.btn.title), '9a. Phản hồi chậm: nút theo yêu cầu nhưng trạng thái = "đang gửi, CHƯA có phản hồi" (không phải đã gửi)');
    await settle(r, { ok: true }); await r.run(0.5, MUS);
    ok(r.btn.dataset.fxSync === 'sent-unconfirmed', '9b. Khi runtime trả lời OK mới đổi sang "đã gửi (chưa xác nhận)"');
    r = build({ mode: 'fail' }); await r.run(5, SIL); await r.run(3, MUS);
    ok(r.on && r.btn.dataset.fxSync === 'failed' && /LỖI/.test(r.btn.title), '9c. Runtime lỗi: nút theo yêu cầu, trạng thái = LỖI (không báo đã đồng bộ)');
    r = build({ mode: 'hang' }); await r.run(5, SIL); await r.run(1.5, MUS); ok(r.btn.dataset.fxSync === 'pending', '9d. Runtime treo: vẫn "pending", không báo gửi xong');
    await r.run(6, MUS); ok(r.btn.dataset.fxSync === 'timeout' && /KHÔNG phản hồi/.test(r.btn.title), '9e. Quá 5 s không phản hồi → TIMEOUT hiển thị rõ (không kẹt "pending" mãi)');
    r.setMode('ok'); await r.run(10, SIL); ok(!r.on, '9f. Sau timeout, nhạc dừng → nút được ĐỒNG BỘ về TẮT theo yêu cầu hiện tại (không kẹt ở BẬT; lệnh BẬT đã timeout không tính là "đã gửi")');
    const nT = r.executed.length; await r.run(3, MUS); ok(r.on && r.executed.length > nT && r.btn.dataset.fxSync === 'sent-unconfirmed', '9f2. Hàng đợi Send KHÔNG kẹt sau timeout: nhạc phát lại → gửi BẬT bình thường');
    // bấm tay + phản hồi chậm
    r = build({ mode: 'defer' }); await r.run(2, SIL); r.click(); await r.flush(); // KHÔNG await click: lời hứa chỉ xong khi runtime trả lời
    ok(r.on && r.btn.dataset.fxSync === 'pending', '9g. Bấm tay + phản hồi chậm: nút theo yêu cầu, trạng thái "pending"');
    await settle(r, { ok: false, status: 'NO_DEVICE' });
    ok(r.on && r.btn.dataset.fxSync === 'failed', '9h. Bấm tay + lỗi: nút giữ yêu cầu, trạng thái = LỖI');
    // lệnh Auto chậm, nhạc đổi trạng thái trong lúc chờ: lệnh sau không được MẤT
    r = build({ mode: 'defer' }); await r.run(5, SIL); await r.run(1.2, MUS); // BẬT đang chờ phản hồi
    await r.run(0.1, MUS); await settle(r, { ok: true });
    await r.run(2, SIL); await settle(r, { ok: true }); await r.run(0.5, SIL); await settle(r, { ok: true });
    ok(!r.on && r.executed.filter((e) => e.n === 'FX_ON').length === 1 && r.executed.filter((e) => e.n === 'FX_OFF').length === 1, '9i. Nhạc đổi trạng thái khi lệnh trước còn chờ → lệnh TẮT vẫn được gửi (trước đây bị mất)');
    let rr = build({ mode: 'defer' }); await rr.run(5, SIL); await rr.run(1.0, MUS); // lệnh BẬT còn treo
    await rr.run(1.3, SIL); // im lặng đủ lâu trong lúc BẬT chưa trả lời
    await settle(rr, { ok: true }); await rr.run(0.3, SIL); await settle(rr, { ok: true }); await rr.run(0.3, SIL);
    ok(!rr.on, '9j. Lệnh BẬT còn treo, nhạc dừng → sau khi nó xong, yêu cầu TẮT (hiện tại) được áp dụng, nút không kẹt ở BẬT');

    // ---- 10. khởi động lại → không có state cũ làm FX sai
    // (toàn bộ state Auto nằm trong bộ nhớ JS: instance mới = sạch; chỉ nút FX "đã lưu" (data.fx) được khôi phục)
    r = build(); await r.run(5, SIL); await r.click(); await r.flush(); ok(r.info.manualOverride, '10a. (tiền đề) phiên cũ đang trong 60 s giữ quyền thủ công');
    let r2 = build({ saved: true }); ok(!r2.info.manualOverride && r2.info.musicState === 'UNKNOWN' && r2.info.lastResult === null, '10b. Khởi động lại: KHÔNG kế thừa manual override / trạng thái nhạc / kết quả gửi của phiên cũ');
    await r2.run(0.7, SIL); ok(r2.on, '10c. Nút lưu BẬT + chưa đủ 1 s im lặng: chưa tự đổi (chưa có bằng chứng)');
    await r2.run(1, SIL); ok(!r2.on && r2.executed.length === 1 && r2.executed[0].n === 'FX_OFF', '10d. Nút lưu BẬT + nhạc im → TẮT sau ≈1 s và gửi lệnh TẮT (sửa state cũ sai)');
    r2 = build({ saved: false }); await r2.run(1, SIL); ms = await until(r2, MUS, () => r2.on, 3000); ok(ms <= 1000 && r2.executed.length === 1 && r2.executed[0].n === 'FX_ON', `10e. Nút lưu TẮT + nhạc phát → BẬT sau ${ms} ms và gửi lệnh BẬT`);
    r2 = build({ saved: true }); await r2.run(1, MUS); await r2.run(10, MUS);
    ok(r2.on && r2.executed.length === 0, '10f. Nút lưu BẬT + nhạc đang phát → giữ BẬT, không gửi lệnh thừa (GIẢ ĐỊNH: DAW còn đúng trạng thái đã lưu — KHÔNG kiểm chứng được, không có feedback DAW)');
    r2 = build({ saved: true, source: false }); await r2.run(10, SIL);
    ok(r2.on && r2.executed.length === 0 && r2.info.musicState === 'SOURCE_UNAVAILABLE', '10g. Nguồn SYSTEM_AUDIO chưa chạy: giữ nguyên nút đã lưu, không tự bật/tắt (đóng băng)');
    ok(/__fxManualToggle\(e\.target\.classList\.contains\("active"\)\)/.test(ren) && (ren.match(/setInterval\(\(\) => \{ if \(getSetting\("fxAutoEnabled", true\) !== false\) ctl\.tick\(\); \}, 100\)/g) || []).length === 1, '10h. (tĩnh) click handler gọi __fxManualToggle; đúng 1 interval tick 100 ms');

    console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
})();
