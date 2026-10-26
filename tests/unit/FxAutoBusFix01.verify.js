/**
 * FxAutoBusFix01.verify.js — FSP8-LIVE-MONITOR-FX-AUTO-FIX-01
 * ---------------------------------------------------------------------------
 * LOẠI TEST: tích hợp TRONG-TIẾN-TRÌNH. Dùng mã THẬT: ui/js/actionRegistry.js, ui/js/audioSource.js, wiring createFxAutoWiring() và
 * khối nút MUSIC/MIC1/MIC2/FX trích từ ui/js/renderer.js. Chỉ GIẢ: DOM, hàm gửi MIDI (sendMidiCC ghi lại tham số), đồng hồ ảo, tín hiệu nhạc tổng hợp.
 * KHÔNG phải Fender Studio Pro 8 => KHÔNG chứng minh macro chạy trong DAW (xem REPORT.md: BLOCKED_USER_TEST).
 * Chạy: node tests/unit/FxAutoBusFix01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const asSrc = read('ui/js/audioSource.js'), arSrc = read('ui/js/actionRegistry.js'), ren = read('ui/js/renderer.js');
const a = ren.indexOf('function createFxAutoWiring() {'), b = ren.indexOf('createFxAutoWiring();\n', a);
const fnSrc = ren.slice(a, b);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m, x !== undefined ? JSON.stringify(x) : ''); } };

const CC = { MUSIC_ON: 102, MUSIC_OFF: 103, MIC1_ON: 104, MIC1_OFF: 105, MIC2_ON: 106, MIC2_OFF: 107, FX_ON: 108, FX_OFF: 109 };
const mk = (n) => ({ kind: 'cc', channel: 16, number: n, value: 127, source: 'USER_DEFINED' });
const full = () => Object.fromEntries(Object.entries(CC).map(([k, n]) => [k, mk(n)]));
const FRAME = 16, TICK = 100;

function build({ mappings = full(), sendMode = 'ok', saved = false } = {}) {
    const clock = { t: 0 }; const sent = []; const timers = []; const deferred = []; const intervals = []; let mode = sendMode;
    const store = { selectedDAW: 'studio-one', dawMidiOutMappings: { 'studio-one': mappings } };
    const cls = new Set(saved ? ['active'] : []);
    const btn = { dataset: {}, title: '', classList: { toggle(c, f) { (f === undefined ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c), add: (c) => cls.add(c) } };
    const win = { performance: { now: () => 0 }, electronAPI: { sendTelemetry() {} } }; win.window = win;
    win.Date = { now: () => clock.t };
    vm.createContext(win);
    win.setTimeout = (fn, ms) => { timers.push({ at: clock.t + ms, fn }); return timers.length; };
    win.clearTimeout = (h) => { if (timers[h - 1]) timers[h - 1].fn = null; };
    vm.runInContext(asSrc, win);
    Object.assign(win, {
        document: { getElementById: (id) => (id === 'fxBtn' ? btn : null) },
        getSetting: (k, f) => (store[k] === undefined || store[k] === '' ? f : store[k]), setSetting: (k, v) => { store[k] = v; }, saveData() {},
        console: { log() {}, warn() {}, error() {} }, setInterval: (fn) => { intervals.push(fn); return intervals.length; }, AudioSource: win.AudioSource,
        sendMidiCC: (n, v, ch) => {
            sent.push({ n, v, ch, t: clock.t, bytes: [0xb0 | (ch & 15), n & 127, v & 127] });
            if (mode === 'fail') return Promise.resolve(false);
            if (mode === 'hang') return new Promise(() => {});
            if (mode === 'defer') return new Promise((res) => deferred.push(res));
            return Promise.resolve(true);
        },
        sendMidiNotePulse: () => Promise.resolve(true),
    });
    vm.runInContext(arSrc, win);
    vm.runInContext(fnSrc + '\ncreateFxAutoWiring();', win);
    const ctl = win.__fxAuto; ctl.setSourceState(true);
    const R = {
        win, btn, cls, sent, ctl, store, clock, setMode: (m) => { mode = m; },
        get on() { return cls.has('active'); }, get info() { return ctl.getInfo(); },
        click() { btn.classList.toggle('active'); return win.__fxManualToggle(cls.has('active')); },
        async flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); },
        async run(sec, music) {
            const end = clock.t + sec * 1000; let nextTick = Math.ceil(clock.t / TICK) * TICK;
            while (clock.t < end) {
                clock.t += FRAME; ctl.feedLevel(music(clock.t / 1000), clock.t);
                for (const tm of timers) if (tm.fn && tm.at <= clock.t) { const f = tm.fn; tm.fn = null; f(); }
                while (nextTick <= clock.t) { intervals.forEach((fn) => fn()); nextTick += TICK; }
                await Promise.resolve();
            }
            await R.flush();
        },
    };
    return R;
}
const SIL = () => -80, MUS = () => -25;
const nums = (r) => r.sent.map((s) => s.n);

(async () => {
    console.log('== 1. FX Auto: có nhạc -> đúng 1 lệnh FX_ON; hết nhạc -> đúng 1 lệnh FX_OFF (mã THẬT, byte đo được) ==');
    {
        const r = build(); await r.run(5, SIL);
        ok(r.sent.length === 0 && !r.on, 'khởi động im lặng: nút TẮT, 0 lệnh (nút lưu = TẮT, không gửi OFF vô cớ)');
        await r.run(3, MUS);
        ok(r.on && r.sent.length === 1 && r.sent[0].n === 108 && r.sent[0].v === 127 && r.sent[0].ch === 15 && r.sent[0].bytes.join() === '191,108,127', 'nhạc phát -> nút SÁNG + đúng 1 CC108 ch16 v127 [0xBF,108,127]', r.sent);
        ok(r.btn.dataset.fxSync === 'sent-unconfirmed' && /FX/.test(r.btn.title) && /chưa xác nhận/.test(r.btn.title) && !/Send Reverb/.test(r.btn.title), 'tooltip: đã GỬI lệnh FX, "chưa xác nhận", KHÔNG nói Send Reverb/Delay', r.btn.title);
        await r.run(20, MUS); ok(r.sent.length === 1, 'nhạc tiếp tục: không gửi lặp');
        await r.run(0.5, SIL); await r.run(3, MUS); ok(r.on && r.sent.length === 1, 'lặng ngắn 0,5 s: không tắt, không gửi');
        await r.run(5, SIL);
        ok(!r.on && r.sent.length === 2 && r.sent[1].n === 109 && r.sent[1].bytes.join() === '191,109,127', 'im lặng > 1 s -> nút TẮT + đúng 1 CC109 ch16 [0xBF,109,127]', r.sent);
        await r.run(10, MUS); ok(r.on && r.sent.length === 3 && r.sent[2].n === 108, 'nhạc lại -> FX_ON lần nữa');
        ok(r.sent.every((s) => ![20, 21, 22].includes(s.n)), 'không có CC nào của FX_SEND_REVERB/DELAY/MONITOR_FX');
    }

    console.log('\n== 2. Thời gian xác nhận giữ nguyên (nhạc ≈500 ms, im lặng ≈1000 ms) ==');
    {
        const r = build(); await r.run(5, SIL); const t0 = r.clock.t; await r.run(1.5, MUS);
        const dOn = r.sent.length ? r.sent[0].t - t0 : null;
        ok(dOn !== null && dOn >= 450 && dOn <= 800, `FX_ON gửi sau ${dOn} ms kể từ khi nhạc xuất hiện`);
        await r.run(5, MUS); const t1 = r.clock.t; await r.run(2, SIL);
        const dOff = r.sent.length > 1 ? r.sent[1].t - t1 : null;
        ok(dOff !== null && dOff >= 950 && dOff <= 1300, `FX_OFF gửi sau ${dOff} ms kể từ khi im lặng`);
    }

    console.log('\n== 3. Bấm tay: Auto nhường quyền 60 s, hết 60 s tiếp quản theo trạng thái nhạc HIỆN TẠI; nút thủ công cũng đúng 1 lệnh ==');
    {
        const r = build(); await r.run(5, SIL); await r.click(); await r.flush();
        ok(r.on && r.sent.length === 1 && r.sent[0].n === 108, 'bấm tay BẬT -> đúng 1 CC108');
        const t = r.clock.t; await r.run(59, SIL);
        ok(r.on && r.sent.length === 1, '59 s im lặng sau bấm tay: Auto KHÔNG tắt, không gửi');
        await r.run(3, SIL);
        ok(!r.on && r.sent.length === 2 && r.sent[1].n === 109 && r.sent[1].t - t >= 60000 - 1, 'hết 60 s + im lặng -> Auto tiếp quản: CC109, không sớm hơn mốc 60 s', r.sent);
        const r2 = build(); await r2.run(5, SIL); await r2.click(); await r2.flush(); await r2.run(70, MUS);
        ok(r2.on && r2.sent.length === 1, 'bấm tay BẬT rồi nhạc phát đúng suốt: sau 60 s KHÔNG gửi trùng FX_ON (trạng thái đã gửi khớp)', r2.sent);
        const r3 = build(); await r3.run(5, SIL); await r3.run(3, MUS); await r3.click(); await r3.flush();
        ok(!r3.on && r3.sent.length === 2 && r3.sent[1].n === 109, 'Auto BẬT rồi bấm tay TẮT -> CC109');
        await r3.run(59, MUS); ok(!r3.on && r3.sent.length === 2, '59 s nhạc vẫn phát: Auto KHÔNG bật lại');
        await r3.run(3, MUS); ok(r3.on && r3.sent.length === 3 && r3.sent[2].n === 108, 'hết 60 s -> Auto tiếp quản theo nhạc hiện tại: CC108');
    }

    console.log('\n== 4. Thiếu mapping / lỗi gửi / hết thời gian: KHÔNG báo thành công giả ==');
    {
        let r = build({ mappings: {} }); await r.run(5, SIL); await r.run(3, MUS);
        ok(r.on && r.sent.length === 0 && r.btn.dataset.fxSync === 'not-configured' && /CHƯA cấu hình FX ON\/OFF/.test(r.btn.title) && !/đã GỬI/.test(r.btn.title), 'chưa cấu hình FX ON/OFF: nút theo YÊU CẦU, 0 lệnh, NOT_CONFIGURED rõ ràng', { t: r.btn.title, s: r.sent });
        r = build({ mappings: { FX_SEND_REVERB: { kind: 'cc', channel: 2, number: 20, value: 127 }, FX_SEND_DELAY: { kind: 'cc', channel: 2, number: 21, value: 127 }, MONITOR_FX: { kind: 'cc', channel: 2, number: 22, value: 100 } } });
        await r.run(5, SIL); await r.run(3, MUS); await r.run(10, SIL); await r.run(3, MUS);
        ok(r.sent.length === 0 && r.btn.dataset.fxSync === 'not-configured', 'chỉ có Send/MONITOR_FX cũ (chưa có FX ON/OFF): Auto KHÔNG âm thầm gửi Send/toggle (0 lệnh, NOT_CONFIGURED)', r.sent);
        r = build({ mappings: { FX_ON: mk(108) } }); await r.run(5, SIL); await r.run(3, MUS); await r.run(5, SIL);
        ok(r.sent.length === 1 && r.sent[0].n === 108 && r.btn.dataset.fxSync === 'not-configured', 'chỉ lưu FX_ON: bật gửi CC108; tắt = NOT_CONFIGURED, KHÔNG rơi sang toggle/Send', r.sent);
        r = build({ sendMode: 'fail' }); await r.run(5, SIL); await r.run(3, MUS);
        ok(r.on && r.btn.dataset.fxSync === 'failed' && /KHÔNG nhận lệnh/.test(r.btn.title) && !/đã GỬI/.test(r.btn.title), 'gửi lỗi: nút theo yêu cầu, trạng thái = LỖI, không nói đã gửi', r.btn.title);
        const nf = r.sent.length; await r.run(60, MUS); ok(r.sent.length <= nf + 2, `thử lại có giới hạn (${r.sent.length - nf} lệnh thêm)`);
        r = build({ sendMode: 'hang' }); await r.run(5, SIL); await r.run(2, MUS);
        ok(r.info.pending && r.btn.dataset.fxSync === 'pending', 'runtime treo: trạng thái "đang gửi, chưa phản hồi", không phải đã gửi');
        await r.run(6, MUS);
        ok(r.btn.dataset.fxSync === 'timeout' && /KHÔNG phản hồi/.test(r.btn.title), 'quá 5 s: TIMEOUT hiển thị rõ', { s: r.btn.dataset.fxSync, t: r.btn.title });
        r = build(); await r.run(5, SIL); r.setMode('fail'); await r.click(); await r.flush();
        ok(r.btn.dataset.dawSync === 'failed' && !/đã GỬI/.test(r.btn.title), 'bấm tay + gửi lỗi: dawSync=failed, không báo đã gửi');
    }

    console.log('\n== 5. Gửi lỗi/NOT_CONFIGURED lúc bấm tay không làm Auto tin trạng thái sai ==');
    {
        const r = build(); await r.run(5, SIL); r.setMode('fail'); await r.click(); await r.flush(); r.setMode('ok');
        await r.run(62, MUS);
        ok(r.sent.filter((s) => s.n === 108).length >= 2, 'bấm tay BẬT bị lỗi (không đánh dấu đã gửi) -> sau 60 s Auto gửi lại FX_ON khi có nhạc', r.sent);
    }

    console.log('\n== 6. MUSIC / MIC 1 / MIC 2 đặt trạng thái đích danh, độc lập (mã THẬT) ==');
    {
        const clicks = (r, id) => {
            const handlers = {}; return handlers;
        };
        // dùng ActionRegistry thật trực tiếp (đường mà handler nút gọi): mỗi lần = đúng 1 CC của nút đó
        const r = build();
        const AR = r.win.ActionRegistry;
        const seq = [['MUSIC', true], ['MIC1', true], ['MIC2', true], ['MIC1', false], ['MUSIC', false], ['MIC2', false], ['MIC1', true], ['MIC1', true]];
        const expect = [102, 104, 106, 105, 103, 107, 104, 104];
        for (let i = 0; i < seq.length; i++) {
            const before = r.sent.length; const res = await AR.setDawControlState(seq[i][0], seq[i][1], { reason: 'menu-button' });
            ok(res.ok && r.sent.length === before + 1 && r.sent[before].n === expect[i] && r.sent[before].bytes[0] === 0xbf, `${seq[i][0]} ${seq[i][1] ? 'ON' : 'OFF'} -> đúng 1 lệnh CC${expect[i]}`, r.sent.slice(before));
        }
        const mic1Presses = r.sent.filter((s) => [104, 105].includes(s.n));
        ok(r.sent.filter((s) => s.n === 103).length === 1, 'CC103 (MUSIC_OFF) chỉ xuất hiện đúng 1 lần — khi chính nút MUSIC OFF được bấm; bấm MIC 1 KHÔNG sinh lệnh nào tắt MUSIC/Beat');
        ok(mic1Presses.length === 4 && r.sent.filter((s) => [102, 103].includes(s.n)).length === 2, 'MIC 1 chỉ phát CC104/105; MUSIC chỉ CC102/103');
        const r2 = build({ mappings: { MIC1_ON: mk(104) } });
        const x = await r2.win.ActionRegistry.setDawControlState('MIC1', false);
        ok(!x.ok && x.reason === 'NOT_CONFIGURED' && r2.sent.length === 0, 'chỉ lưu MIC1_ON: bấm OFF = NOT_CONFIGURED, không toggle cũ');
    }

    console.log('\n== 7. Macro LIVE_* (tệp trong repo): mỗi macro chỉ chạm ĐÚNG track của nó, dùng Monitor chứ không dùng Mute ==');
    {
        const dir = path.join(ROOT, 'tools/algbench/reports/LIVE-MIDI-FSP8-02/macros');
        const parse = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '');
        const cmds = (f) => [...parse(f).matchAll(/<CommandElement category="([^"]*)" name="([^"]*)">\s*<CommandArgument name="([^"]*)" value="([^"]*)"\/>/g)].map((m) => `${m[1]}|${m[2]}:${m[3]}=${m[4]}`);
        const want = { MUSIC: 'Beat', MIC1: 'Mic', MIC2: 'Không Dây' };
        for (const [k, tr] of Object.entries(want)) for (const [sfx, st] of [['ON', '1'], ['OFF', '0']]) {
            const c = cmds(`LIVE_${k}_${sfx}.studioonemacro`);
            ok(c.length === 2 && c[0] === `Track|Find Track:Name=${tr}` && c[1] === `Track|Monitor:State=${st}`, `LIVE_${k}_${sfx}: Find Track "${tr}" -> Monitor State=${st} (không Mute, không track khác)`, c);
        }
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
