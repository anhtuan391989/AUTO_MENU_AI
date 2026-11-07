// A101 — DAW-HIDE-ENTRYPOINT-TRACE-01. TEST MÔ PHỎNG (fs/Tray/PowerShell/IPC giả) — KHÔNG thay thế chạy thật trên Windows.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createDawTrayManager } = require('../../app/DawTray.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\Fender\\Studio Pro 8\\Studio Pro.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mk(hider, o = {}) {
    const files = {};
    const fakeFs = { existsSync: (f) => f in files, readFileSync: (f) => files[f], writeFileSync: (f, d) => { files[f] = d; }, appendFileSync: (f, d) => { files[f] = (files[f] || '') + d; }, statSync: (f) => ({ size: (files[f] || '').length }), unlinkSync: (f) => { delete files[f]; } };
    class T { setToolTip() {} setContextMenu() {} on() {} displayBalloon() {} destroy() {} }
    const m = createDawTrayManager({ Tray: T, Menu: { buildFromTemplate: () => ({}) }, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) }, readSettings: () => ({ selectedDAWPath: EXE }), stateFile: 'D:\\data\\hidden-daw-state.json', fs: fakeFs, windowHider: hider, log: () => {}, ...o });
    return { m, files, log: () => files['D:\\data\\daw-hide-diagnostic.log'] || '' };
}

function makeUi(api, timers) {
    const els = {}; const el = (id) => (els[id] = els[id] || { id, textContent: '', className: '', disabled: false, style: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
    ['toolsDawBadge', 'toolsDawPath', 'toolsDawMessage', 'hiddenDawEnable', 'hiddenDawStartHidden', 'sidebarNav'].forEach(el);
    // A106: 2 nút Ẩn/Hiện đã gộp thành 1 ô tick (hiddenDawEnable). Hai "nút" dưới đây chỉ là lớp giả lập cho test: bấm Ẩn = tick, bấm Hiện = bỏ tick; .disabled = ô tick bị khoá.
    ['btnToolsHideDaw', 'btnToolsShowDaw'].forEach((id) => { const want = id === 'btnToolsHideDaw'; els[id] = { id, listeners: { click() { els.hiddenDawEnable.checked = want; els.hiddenDawEnable.listeners.change(); } }, get disabled() { return els.hiddenDawEnable.disabled; } }; });
    const doc = { getElementById: (id) => el(id), addEventListener: (t, f) => { if (t === 'DOMContentLoaded') doc._ready = f; } };
    const ctx = { document: doc, window: { electronAPI: api }, console, setTimeout: timers ? timers.set : setTimeout, clearTimeout: timers ? timers.clear : clearTimeout };
    vm.createContext(ctx); vm.runInContext(rd('ui/js/setupTools.js'), ctx);
    return { els, ready: async () => { doc._ready(); await sleep(20); }, click: async (id) => { els[id].listeners.click(); await sleep(20); }, doc };
}

(async () => {
    console.log('== 1. Dấu vết có ngay khi khởi tạo + khi lệnh tới (trả lời "Logger có được gọi không?") ==');
    {
        const traceSet = []; const hider = { setTrace: (f) => traceSet.push(f), hide: (e, cb) => { traceSet[0] && traceSet[0]('PS spawn thử'); cb({ ok: false, state: 'failed', handles: [], reason: 'HIDE_NOT_APPLIED' }); }, show: () => {}, probe: () => {} };
        const { m, log } = mk(hider);
        ok(/KHỞI TẠO build=A101-DAW-TRACE/.test(log()) && /stateFile=D:\\data\\hidden-daw-state\.json/.test(log()) && /diagFile=D:\\data\\daw-hide-diagnostic\.log/.test(log()), 'ngay khi DawTray được tạo (chưa cần click) đã ghi log kèm đường dẫn thực tế', log());
        ok(traceSet.length === 1, 'WindowHider.setTrace được gắn => lần chạy PowerShell ghi vết (spawn/xong/stderr)');
        m.note('tools-daw-hide', true); ok(/IPC tools-daw-hide tới main: từ cửa sổ Setup=true/.test(log()), 'main.note ghi vết lệnh IPC tới main');
        await new Promise((r) => m.hide(r)); ok(/HIDE nhận lệnh từ Setup/.test(log()) && /\[PS\] PS spawn thử/.test(log()) && /HIDE kết quả/.test(log()), 'hide(): ghi entry + vết PowerShell + kết quả');
        const st = m.status(); ok(st.build === 'A101-DAW-TRACE' && /daw-hide-diagnostic\.log$/.test(st.diagFile) && /hidden-daw-state\.json$/.test(st.stateFile), 'status() trả build + đường dẫn log/state để Setup hiển thị', st);
    }

    console.log('== 2. Watchdog: WindowHider không bao giờ trả lời -> không treo vô hạn ==');
    {
        const { m, log } = mk({ hide: () => {}, show: () => {}, probe: () => {} }, { watchdogMs: 40 });
        const r = await new Promise((res) => m.hide(res));
        ok(!r.ok && /không có phản hồi/.test(r.message) && /QUÁ HẠN/.test(log()), 'hide treo -> trả thông báo lỗi rõ + log QUÁ HẠN', r);
        const r2 = await new Promise((res) => m.hide(res)); ok(/phản hồi|xử lý/.test(r2.message), 'lần bấm sau không bị kẹt busy', r2);
    }

    console.log('== 3. Giao diện không bao giờ im lặng ==');
    {
        let ui = makeUi(null); await ui.ready(); await ui.click('btnToolsHideDaw');
        ok(/electronAPI trống/.test(ui.els.toolsDawMessage.textContent), 'không có electronAPI -> báo rõ', ui.els.toolsDawMessage.textContent);
        ui = makeUi({ toolsDawStatus: async () => ({ configured: true, exePath: EXE, hidden: false, state: 'visible', build: 'A101-DAW-TRACE', diagFile: 'D:\\data\\daw-hide-diagnostic.log' }) }); await ui.ready(); await ui.click('btnToolsHideDaw');
        ok(/bản CŨ: thiếu kênh toolsDawHide/.test(ui.els.toolsDawMessage.textContent), 'preload cũ thiếu toolsDawHide -> báo "bản CŨ"', ui.els.toolsDawMessage.textContent);
        ok(/bản A101-DAW-TRACE.*log: D:\\data\\daw-hide-diagnostic\.log/.test(ui.els.toolsDawPath.textContent), 'dòng đường dẫn hiện bản + nơi ghi log', ui.els.toolsDawPath.textContent);
        // IPC treo: bắt timer 30 s
        const timers = []; const T = { set: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clear: () => {} };
        ui = makeUi({ toolsDawStatus: async () => ({ configured: true, exePath: EXE, hidden: false, state: 'visible', build: 'x', diagFile: 'y' }), toolsDawHide: () => new Promise(() => {}), toolsDawShow: async () => ({ ok: true }) }, T);
        await ui.ready(); ui.els.btnToolsHideDaw.listeners.click(); await sleep(10);
        ok(/Đang ẩn DAW/.test(ui.els.toolsDawMessage.textContent), 'có phản hồi "Đang ẩn DAW…" ngay khi bấm');
        const t30 = timers.find((x) => x.ms === 30000); ok(!!t30, 'có watchdog 30 s phía giao diện'); t30.f(); await sleep(20);
        ok(/không trả lời sau 30 giây/.test(ui.els.toolsDawMessage.textContent) && ui.els.btnToolsHideDaw.disabled === false, 'IPC treo -> báo lỗi + mở khoá nút', ui.els.toolsDawMessage.textContent);
        // nút Ẩn không bị xám theo trạng thái
        for (const st of [{ configured: false }, { configured: true, hidden: true, state: 'hidden' }, { configured: true, state: 'not_running' }, { configured: true, state: 'path_mismatch' }, { configured: true, state: 'unknown' }]) {
            const u = makeUi({ toolsDawStatus: async () => ({ ...st, build: 'x' }) }); await u.ready();
            ok(u.els.btnToolsHideDaw.disabled === false && u.els.btnToolsShowDaw.disabled === false, 'nút Ẩn/Hiện không xám ở trạng thái ' + JSON.stringify(st));
        }
        // main cũ (không có build) -> cảnh báo
        ui = makeUi({ toolsDawStatus: async () => ({ configured: true, exePath: EXE, hidden: false, state: 'visible' }) }); await ui.ready();
        ok(/bản CŨ — chưa có A101/.test(ui.els.toolsDawMessage.textContent), 'main chưa có dấu bản -> cảnh báo thoát hẳn mọi tiến trình rồi mở lại');
        // click ghi nhận ngay cả khi đang bận
        let rel; ui = makeUi({ toolsDawStatus: async () => ({ configured: true, build: 'x' }), toolsDawHide: () => new Promise((r) => { rel = r; }), toolsDawShow: async () => ({ ok: true }) }); await ui.ready();
        ui.els.btnToolsHideDaw.listeners.click(); await sleep(10); ui.els.btnToolsHideDaw.listeners.click(); await sleep(10);
        ok(/Đang xử lý thao tác trước/.test(ui.els.toolsDawMessage.textContent), 'bấm khi đang bận -> báo rõ, không im lặng'); rel({ ok: true, message: 'x' });
    }

    console.log('== 4. Luồng nguồn: IPC đã đăng ký + preload + script được nạp ==');
    {
        const main = rd('app/main.js'), pre = rd('app/preload.js'), html = rd('ui/setup.html');
        for (const ch of ['tools-daw-status', 'tools-daw-hide', 'tools-daw-show']) ok(main.includes('ipcMain.handle("' + ch + '"') && pre.includes('"' + ch + '"'), 'IPC ' + ch + ' có ở main + preload');
        ok(/getDawTray\(\)\.note\("tools-daw-hide"/.test(main) && /getDawTray\(\)\.note\("tools-daw-show"/.test(main), 'main ghi vết khi nhận hide/show');
        ok(/id="hiddenDawEnable"/.test(html) && /<script src="js\/setupTools\.js"><\/script>/.test(html), 'setup.html có ô tick Enable Hidden DAW + nạp setupTools.js');
        ok(!/requestSingleInstanceLock/.test(main), 'GHI NHẬN: main.js KHÔNG có khoá một-phiên => có thể chạy 2 Menu song song, Menu cũ trả lời click bằng code cũ (xem báo cáo)');
    }
    console.log('\n' + pass + ' PASS / ' + fail + ' FAIL (MÔ PHỎNG — chưa phải Windows thật)');
    process.exit(fail ? 1 : 0);
})();
