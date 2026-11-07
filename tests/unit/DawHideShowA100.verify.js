// A100 — DAW-HIDE-SHOW-STATE-RECOVERY-FIX-01.
// ĐÂY LÀ TEST MÔ PHỎNG: PowerShell/Win32/Tray/fs đều GIẢ (mô hình cửa sổ trong bộ nhớ). KHÔNG chứng minh được FSP8 thật trên Windows — xem báo cáo (mục "NOT TESTED").
const fs = require('fs'), path = require('path'), vm = require('vm');
const WH = require('../../core/integration/WindowHider.js');
const { createDawTrayManager } = require('../../app/DawTray.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\Fender\\Studio Pro 8\\Studio Pro.exe';

// ---- Mô hình Windows: tiến trình + cửa sổ ----
function makeWorld(o = {}) {
    const w = { procs: [{ id: 4242, path: EXE }], wins: [], scripts: [], lateHide: false, ...o };
    w.add = (h, extra) => { const x = { h, pid: 4242, vis: true, title: 'Studio Pro', owner: false, tool: false, W: 1600, H: 900, ...extra }; w.wins.push(x); return x; };
    const idState = () => {
        const same = w.procs.filter((p) => true);
        if (w.queryError) return 'ERR';
        if (!same.length) return 'NOPROC';
        const match = same.filter((p) => p.path && p.path.toLowerCase() === EXE.toLowerCase());
        if (match.length) return 'OK';
        if (same.some((p) => !p.path)) return 'UNREADABLE';
        return 'MISMATCH';
    };
    const pidsOf = () => w.procs.filter((p) => p.path && p.path.toLowerCase() === EXE.toLowerCase()).map((p) => p.id);
    const report = (list, wantVisible) => {
        const okL = list.filter((x) => x.vis === wantVisible).map((x) => x.h), bad = list.filter((x) => x.vis !== wantVisible).map((x) => x.h);
        return okL.join(',') + ';F:' + bad.join(',') + ';A:' + list.map((x) => x.h).join(',') + ';D:' + list.map((x) => x.h + '/' + x.pid + '/' + (x.vis ? 'V' : 'H') + '/' + x.title).join('~');
    };
    w.runner = (script, cb) => {
        w.scripts.push(script);
        const st = idState(); const pids = pidsOf();
        const info = 'INFO|ST=' + st + '|R=' + pids.join(',') + '|U=' + w.procs.filter((p) => !p.path).map((p) => p.id).join(',') + '|O=|SRC=CIM|ERR=' + (st === 'ERR' ? 'access denied' : '');
        if (/\$info\s*$/.test(script) && !/HW\]::/.test(script)) { cb(null, info); return; } // probe
        if (st !== 'OK') { cb(null, info); return; }
        const mine = w.wins.filter((x) => pids.includes(x.pid));
        if (/\[HW\]::Hide/.test(script)) {
            const found = mine.filter((x) => x.vis && !x.owner && x.title && !x.tool);
            found.forEach((x) => { if (!w.lateHide) x.vis = false; else x.pendingHide = true; });
            cb(null, 'H:' + report(found, false)); return;
        }
        let m = /\[HW\]::Show\(\[int64\[\]\]\(([\d,]+)\)/.exec(script);
        if (m) {
            const hs = m[1].split(',').map(Number); const good = mine.filter((x) => hs.includes(x.h));
            good.forEach((x) => { x.vis = true; });
            cb(null, 'S:' + report(good, true)); return;
        }
        if (/\[HW\]::ShowHidden/.test(script)) {
            const c = mine.filter((x) => !x.vis && !x.owner && x.title && !x.tool && x.W >= 200 && x.H >= 150).sort((a, b) => b.W * b.H - a.W * a.H).slice(0, 1);
            c.forEach((x) => { x.vis = true; });
            cb(null, 'S:' + report(c, true)); return;
        }
        cb(null, info);
    };
    return w;
}
function makeEnv(world, o = {}) {
    const files = o.files || {};
    const fakeFs = { existsSync: (f) => f in files, readFileSync: (f) => files[f], writeFileSync: (f, d) => { files[f] = d; }, appendFileSync: (f, d) => { files[f] = (files[f] || '') + d; }, statSync: (f) => ({ size: (files[f] || '').length }), unlinkSync: (f) => { delete files[f]; } };
    const tray = { created: 0, destroyed: 0 }; class FakeTray { constructor() { tray.created++; } setToolTip() {} setContextMenu() {} on() {} displayBalloon() {} destroy() { tray.destroyed++; } }
    const hider = { ...WH, hide: (e, cb) => WH.hide(e, cb, world.runner), show: (e, h, cb) => WH.show(e, h, cb, world.runner), showAny: (e, cb) => WH.showAny(e, cb, world.runner), probe: (e, cb) => WH.probe(e, cb, world.runner), showSync: o.showSync || (() => ({ ok: true })) };
    const m = createDawTrayManager({ Tray: FakeTray, Menu: { buildFromTemplate: () => ({}) }, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) }, readSettings: () => ({ selectedDAWPath: EXE }), stateFile: 'D:\\data\\hidden-daw-state.json', fs: fakeFs, windowHider: hider, log: () => {} });
    return { m, files, tray, hider };
}
const call = (fn) => new Promise((r) => fn(r));

// ---- Giao diện setupTools chạy trong vm với DOM giả ----
function makeUi(m) {
    const els = {}; const el = (id) => (els[id] = els[id] || { id, textContent: '', className: '', disabled: false, style: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
    ['toolsDawBadge', 'toolsDawPath', 'toolsDawMessage', 'hiddenDawEnable', 'hiddenDawStartHidden', 'sidebarNav'].forEach(el);
    // A106: 2 nút Ẩn/Hiện đã gộp thành 1 ô tick (hiddenDawEnable). Hai "nút" dưới đây chỉ là lớp giả lập cho test: bấm Ẩn = tick, bấm Hiện = bỏ tick; .disabled = ô tick bị khoá.
    ['btnToolsHideDaw', 'btnToolsShowDaw'].forEach((id) => { const want = id === 'btnToolsHideDaw'; els[id] = { id, listeners: { click() { els.hiddenDawEnable.checked = want; els.hiddenDawEnable.listeners.change(); } }, get disabled() { return els.hiddenDawEnable.disabled; } }; });
    const doc = { getElementById: (id) => el(id), addEventListener: (t, f) => { if (t === 'DOMContentLoaded') doc._ready = f; } };
    const api = { toolsDawStatus: () => call((cb) => m.statusAsync(cb)), toolsDawHide: () => call((cb) => m.hide(cb)), toolsDawShow: () => call((cb) => m.show(cb)) };
    const ctx = { document: doc, window: { electronAPI: api }, console, setTimeout, clearTimeout };
    vm.createContext(ctx); vm.runInContext(rd('ui/js/setupTools.js'), ctx);
    return { els, ready: () => doc._ready(), click: async (id) => { els[id].listeners.click(); await new Promise((r) => setTimeout(r, 30)); } };
}

(async () => {
    console.log('== 1. Mã nguồn: xác minh chờ đủ lâu, có khôi phục, không đóng/kill DAW ==');
    const C = WH._scriptsForTest.CSHARP, src = rd('core/integration/WindowHider.js');
    ok(/for \(int i = 0; i < 20; i\+\+\) \{ System\.Threading\.Thread\.Sleep\(100\);[^\n]*if \(Settled\(found, false\)\) break; \}/.test(C) && !/Sleep\(250\)/.test(C), 'ẨN: chờ tối đa ~2 s (không còn chỉ 0,25 s) — A103 thêm ghi nhận trong vòng lặp nhưng cơ chế giữ nguyên');
    ok(/public static string ShowHidden/.test(C) && /GetWindowRect/.test(C), 'có ShowHidden (khôi phục theo cửa sổ đang ẩn)');
    ok(!/Stop-Process|CloseMainWindow|\.Kill\(|WM_CLOSE|TerminateProcess/.test(src.replace(/ps\.kill\(\)/g, '')), 'chỉ SW_HIDE/SW_SHOW — không đóng/kill DAW (tiến trình + audio/MIDI chạy tiếp) [kiểm tra mã]');
    ok(/ShowWindowAsync\(h, 0\)/.test(C), 'ẩn bằng SW_HIDE (không minimize/close)');
    ok(/en\.disabled = busy;/.test(rd('ui/js/setupTools.js')), 'setupTools (A106): ô tick Ẩn/Hiện chỉ khoá khi đang bận');

    console.log('== 2. 5 chu kỳ Hide → Show → Hide → Show (mô phỏng), kiểm nút Hiện sau mỗi lần Ẩn ==');
    {
        const w = makeWorld(); w.add(1001); const env = makeEnv(w); const ui = makeUi(env.m); ui.ready(); await new Promise((r) => setTimeout(r, 30));
        for (let i = 1; i <= 5; i++) {
            await ui.click('btnToolsHideDaw');
            ok(w.wins[0].vis === false && ui.els.btnToolsShowDaw.disabled === false && ui.els.toolsDawBadge.textContent === 'ĐANG ẨN' && ui.els.btnToolsHideDaw.disabled === false, // A101: nút Ẩn không bị khoá (không còn nút xám im lặng)
             'chu kỳ ' + i + ': sau Ẩn -> cửa sổ ẩn, badge ĐANG ẨN, nút Hiện SÁNG', { vis: w.wins[0].vis, show: ui.els.btnToolsShowDaw.disabled, badge: ui.els.toolsDawBadge.textContent });
            ok(env.tray.created >= i && env.files['D:\\data\\hidden-daw-state.json'], 'chu kỳ ' + i + ': có khay + đã lưu handles');
            await ui.click('btnToolsShowDaw');
            ok(w.wins[0].vis === true && ui.els.toolsDawBadge.textContent === 'ĐANG HIỆN' && !env.files['D:\\data\\hidden-daw-state.json'] && ui.els.btnToolsHideDaw.disabled === false, 'chu kỳ ' + i + ': Hiện -> đúng cửa sổ trở lại, xoá trạng thái, nút Ẩn sáng lại');
        }
        ok(/HIDE kết quả/.test(env.files['D:\\data\\daw-hide-diagnostic.log'] || '') && /SHOW kết quả/.test(env.files['D:\\data\\daw-hide-diagnostic.log'] || ''), 'có nhật ký chẩn đoán daw-hide-diagnostic.log (hwnd/pid/V|H)');
    }

    console.log('== 3. Nhiều cửa sổ FSP8: chỉ cửa sổ top-level có tiêu đề, không owner, không tool-window ==');
    {
        const w = makeWorld(); w.add(1001); w.add(1002, { title: 'Mixer' }); w.add(1003, { owner: true, title: 'Plugin' }); w.add(1004, { tool: true, title: 'Tip' }); w.add(1005, { title: '' });
        const env = makeEnv(w); let r = await call((cb) => env.m.hide(cb));
        ok(r.ok && !w.wins[0].vis && !w.wins[1].vis && w.wins[2].vis && w.wins[3].vis && w.wins[4].vis, 'ẩn 2 cửa sổ chính (1001, 1002); bỏ owner/tool/không tiêu đề', w.wins.map((x) => x.vis));
        r = await call((cb) => env.m.show(cb)); ok(r.ok && w.wins[0].vis && w.wins[1].vis, 'Hiện lại đúng 2 cửa sổ đã ẩn');
    }

    console.log('== 4. GIẢ THUYẾT GỐC: cửa sổ ẩn MUỘN (sau thời gian chờ) -> bản cũ mất handles, nút Hiện mờ ==');
    {
        const w = makeWorld({ lateHide: true }); w.add(1001); const env = makeEnv(w); const ui = makeUi(env.m); ui.ready(); await new Promise((r) => setTimeout(r, 30));
        await ui.click('btnToolsHideDaw'); // C# báo cửa sổ vẫn hiện => HIDE_NOT_APPLIED; sau đó cửa sổ mới thật sự ẩn
        w.wins.forEach((x) => { if (x.pendingHide) x.vis = false; });
        ok(w.wins[0].vis === false && !env.files['D:\\data\\hidden-daw-state.json'], 'tái hiện: cửa sổ ĐÃ biến mất nhưng Menu không có handles (đúng triệu chứng "không tìm thấy DAW")');
        await ui.click('btnToolsShowDaw'); // refresh sau Ẩn không làm nút Hiện mờ nữa
        ok(w.wins[0].vis === true, 'nút Hiện VẪN bấm được và khôi phục cửa sổ qua ShowHidden dù không có handles', { vis: w.wins[0].vis, msg: ui.els.toolsDawMessage.textContent });
    }

    console.log('== 5. Handle cũ không còn dùng được (cửa sổ được tạo lại) -> khôi phục theo cửa sổ ẩn ==');
    {
        const w = makeWorld(); w.add(1001); const env = makeEnv(w); await call((cb) => env.m.hide(cb));
        w.wins[0].h = 2002; // FSP8 tạo lại cửa sổ chính với HWND mới, vẫn đang ẩn
        const r = await call((cb) => env.m.show(cb));
        ok(r.ok && w.wins[0].vis && !env.files['D:\\data\\hidden-daw-state.json'], 'Show: handle cũ mất -> showAny hiện đúng cửa sổ, xoá trạng thái', r);
    }

    console.log('== 6. DAW chạy quyền Administrator (không đọc được đường dẫn) ==');
    {
        const w = makeWorld({ procs: [{ id: 4242, path: null }] }); w.add(1001); const env = makeEnv(w); const ui = makeUi(env.m); ui.ready(); await new Promise((r) => setTimeout(r, 30));
        ok(ui.els.toolsDawBadge.textContent === 'CHƯA XÁC MINH' && ui.els.btnToolsShowDaw.disabled === false, 'trạng thái "CHƯA XÁC MINH" — nút Hiện KHÔNG bị khoá', ui.els.toolsDawBadge.textContent);
        const r = await call((cb) => env.m.hide(cb)); ok(!r.ok && r.state === 'failed' && w.wins[0].vis, 'Ẩn: báo rõ không đọc được đường dẫn, không đụng cửa sổ nào', r);
    }

    console.log('== 7. Lần dò sai 1 lần không làm mất đường khôi phục ==');
    {
        const w = makeWorld(); w.add(1001); const env = makeEnv(w); await call((cb) => env.m.hide(cb));
        w.procs = []; let st = await call((cb) => env.m.statusAsync(cb));
        ok(st.hidden === true && st.state === 'hidden' && env.files['D:\\data\\hidden-daw-state.json'], 'dò không chạy lần 1: vẫn giữ trạng thái ẩn + khay', st);
        w.procs = [{ id: 4242, path: EXE }]; st = await call((cb) => env.m.statusAsync(cb)); ok(st.state === 'hidden', 'dò lại thấy DAW: vẫn ẩn, bộ đếm được xoá');
        w.procs = []; await call((cb) => env.m.statusAsync(cb)); st = await call((cb) => env.m.statusAsync(cb));
        ok(st.state === 'not_running' && st.hidden === false, '2 lần liên tiếp xác minh DAW đã thoát -> mới gỡ trạng thái', st);
    }

    console.log('== 8. Menu khởi động lại khi DAW đang ẩn / thoát Menu khi DAW đang ẩn ==');
    {
        const w = makeWorld(); w.add(1001); const e1 = makeEnv(w); await call((cb) => e1.m.hide(cb));
        const e2 = makeEnv(w, { files: e1.files }); e2.m.restoreTrayIfHidden();
        ok(e2.m.status().hidden === true && e2.tray.created === 1, 'khởi động lại Menu: đọc lại handles + dựng lại khay');
        const r = await call((cb) => e2.m.show(cb)); ok(r.ok && w.wins[0].vis, 'Hiện sau khi khởi động lại Menu');
        const w2 = makeWorld(); w2.add(1001); let synced = null; const e3 = makeEnv(w2, { showSync: (e, h) => { synced = h; return { ok: true }; } });
        await call((cb) => e3.m.hide(cb)); e3.m.restoreOnQuit();
        ok(synced && synced.join() === '1001' && !e3.m.status().hidden && !e3.files['D:\\data\\hidden-daw-state.json'], 'thoát Menu khi đang ẩn -> gọi hiện đồng bộ + xoá trạng thái + gỡ khay', synced);
    }

    console.log('== 9. Bảo vệ: không đổi đường dẫn DAW; lệnh chỉ chạm cửa sổ của đúng tiến trình ==');
    {
        const w = makeWorld(); w.add(1001); w.wins.push({ h: 9999, pid: 777, vis: true, title: 'Notepad', owner: false, tool: false, W: 800, H: 600 });
        const env = makeEnv(w); await call((cb) => env.m.hide(cb)); ok(w.wins[1].vis === true, 'cửa sổ của tiến trình khác không bị ẩn');
        ok(env.m.status().exePath === EXE, 'đường dẫn DAW đã cấu hình giữ nguyên');
    }
    console.log('\n' + pass + ' PASS / ' + fail + ' FAIL (MÔ PHỎNG — chưa phải Windows thật)');
    process.exit(fail ? 1 : 0);
})();
