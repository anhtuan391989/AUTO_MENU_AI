/**
 * AlwaysOnTopMenuUi01B.verify.js — MENU-UI-01B
 * Kiểm tra LOGIC bằng mock (main handlers + renderer switch + preload + css).
 * KHÔNG thay thế test thủ công trên cửa sổ Electron thật (xem báo cáo).
 * Chạy: node tests/unit/AlwaysOnTopMenuUi01B.verify.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } }
const root = path.join(__dirname, '..', '..');
const rd = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const mainSrc = rd('app', 'main.js'), preloadSrc = rd('app', 'preload.js'),
      rendererSrc = rd('ui', 'js', 'renderer.js'), cssSrc = rd('ui', 'css', 'style.css'),
      htmlSrc = rd('ui', 'index.html');
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function slice(src, startMarker, endMarker) {
    const s = src.indexOf(startMarker); if (s === -1) return null;
    const e = src.indexOf(endMarker, s); if (e === -1) return null;
    return src.slice(s, e + endMarker.length);
}

(async () => {
console.log('== main.js: mặc định ON khi khởi động ==');
{
    const fn = slice(mainSrc, 'function createMainWindow()', '\nfunction createSetupWindow');
    assert(fn && /mainWin\s*=\s*new BrowserWindow/.test(fn), 'tìm thấy createMainWindow');
    assert(/mainWin\.setAlwaysOnTop\(true\)/.test(fn), 'createMainWindow gọi setAlwaysOnTop(true) sau khi tạo cửa sổ');
    assert(fn.indexOf('setAlwaysOnTop(true)') > fn.indexOf('new BrowserWindow'), 'setAlwaysOnTop đặt SAU new BrowserWindow');
    assert(/once\("did-finish-load"/.test(fn) && /!aotUserChanged/.test(fn), 'đặt lại 1 lần khi tải xong, chỉ nếu người dùng chưa tự gạt');
}

console.log('\n== main.js: handler get/set-always-on-top (mock) ==');
{
    const block = slice(mainSrc, 'ipcMain.handle("get-always-on-top"', 'return { ok: false, value: actual, error: String((err && err.message) || err) };\n    }\n});');
    assert(!!block, 'tìm thấy 2 handler');
    const handlers = {};
    function makeWin(opts = {}) {
        let aot = opts.initial ?? true;
        return { isDestroyed: () => !!opts.destroyed,
                 isAlwaysOnTop: () => { if (opts.throwGet) throw new Error('get fail'); return aot; },
                 setAlwaysOnTop: (v) => { if (opts.throwSet) throw new Error('set fail'); if (!opts.ignoreSet) aot = v; } };
    }
    const sb = { ipcMain: { handle: (n, f) => { handlers[n] = f; } }, console: { error() {} }, String, mainWin: null, aotUserChanged: false };
    vm.createContext(sb); vm.runInContext(block, sb);
    const run = (win) => { vm.runInContext('mainWin = null', sb); sb.mainWin = win; return win; };

    run(makeWin({ initial: true }));
    let r = handlers['get-always-on-top']();
    assert(r.ok && r.value === true, 'get: trả về trạng thái thật (true)');
    r = handlers['set-always-on-top']({}, false);
    assert(r.ok && r.value === false, 'set(false): ok, value = trạng thái thật false');
    r = handlers['set-always-on-top']({}, true);
    assert(r.ok && r.value === true, 'set(true): ok, value = true');
    r = handlers['set-always-on-top']({}, 'yes');
    assert(!r.ok && typeof r.value === 'boolean', 'set(giá trị không phải boolean): bị từ chối');
    run(makeWin({ throwSet: true, initial: false }));
    r = handlers['set-always-on-top']({}, true);
    assert(!r.ok && r.value === false && r.error, 'setAlwaysOnTop ném lỗi: ok=false, value=trạng thái thật (false, KHÔNG báo ON giả)');
    run(makeWin({ ignoreSet: true, initial: false }));
    r = handlers['set-always-on-top']({}, true);
    assert(!r.ok && r.value === false, 'hệ thống không áp dụng (isAlwaysOnTop vẫn false): ok=false, value=false');
    run(makeWin({ destroyed: true }));
    r = handlers['set-always-on-top']({}, true);
    assert(!r.ok && r.value === false, 'cửa sổ đã destroy: ok=false, không crash');
    r = handlers['get-always-on-top']();
    assert(!r.ok, 'get khi cửa sổ destroy: ok=false');
    run(makeWin({ throwGet: true }));
    r = handlers['get-always-on-top']();
    assert(!r.ok && r.value === false, 'get ném lỗi: ok=false');
}

console.log('\n== Không lưu cài đặt persistent ==');
{
    const mainAot = (slice(mainSrc, 'ipcMain.handle("get-always-on-top"', 'return { ok: false, value: actual, error: String((err && err.message) || err) };\n    }\n});') || '');
    assert(!/writeSettingsFile|settings|localStorage/i.test(mainAot), 'handler Always on Top không ghi settings');
    const rendAot = slice(rendererSrc, '(function initAlwaysOnTopSwitch()', '})();') || '';
    assert(rendAot.length > 0 && !/localStorage|saveSettings|appSettings|writeSettings/i.test(rendAot), 'renderer Always on Top không lưu localStorage/settings');
}

console.log('\n== preload.js ==');
{
    assert(/getAlwaysOnTop:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("get-always-on-top"\)/.test(preloadSrc), 'expose getAlwaysOnTop -> invoke get-always-on-top');
    assert(/setAlwaysOnTop:\s*\(enabled\)\s*=>\s*ipcRenderer\.invoke\("set-always-on-top",\s*enabled\)/.test(preloadSrc), 'expose setAlwaysOnTop -> invoke set-always-on-top');
    assert(/minimizeWindow:\s*\(\)\s*=>\s*ipcRenderer\.send\("minimize-window"\)/.test(preloadSrc), 'vẫn expose minimizeWindow');
}

console.log('\n== renderer: công tắc (fake DOM) ==');
{
    const block = slice(rendererSrc, '(function initAlwaysOnTopSwitch()', '})();');
    assert(!!block, 'tìm thấy initAlwaysOnTopSwitch');
    function makeEnv(api) {
        const listeners = { click: 0 }; let clickFn = null;
        const attrs = {}; const cls = new Set();
        const sw = { dataset: {}, disabled: false, title: '', id: '', type: '',
            setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null,
            addEventListener: (e, f) => { if (e === 'click') { listeners.click++; clickFn = f; } },
            classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) } };
        const inserted = [];
        const container = { insertBefore: (n, ref) => inserted.push([n, ref]), firstChild: 'FIRST' };
        const setupBtn = { id: 'setupBtn' };
        const sandbox = { console: { error() {} }, Promise, String,
            document: { querySelector: (q) => (q === '.window-buttons' ? container : null),
                        createElement: () => sw, getElementById: (id) => (id === 'setupBtn' ? setupBtn : null) },
            window: { electronAPI: api } };
        vm.createContext(sandbox); vm.runInContext(block, sandbox);
        return { sw, listeners, inserted, setupBtn, click: () => clickFn(), cls };
    }
    let resolveGet; let setCalls = 0;
    const api1 = { getAlwaysOnTop: () => new Promise((r) => { resolveGet = r; }),
                   setAlwaysOnTop: async (v) => { setCalls++; return { ok: true, value: v }; } };
    const e1 = makeEnv(api1);
    assert(e1.inserted.length === 1 && e1.inserted[0][1] === e1.setupBtn, 'công tắc chèn ngay TRƯỚC nút Settings');
    assert(e1.sw.dataset.state === 'pending' && e1.sw.getAttribute('aria-checked') === 'false', 'trước khi main trả lời: PENDING, KHÔNG hiện ON');
    assert(e1.sw.disabled === true, 'pending: công tắc bị khoá');
    await tick(); // renderer gọi getAlwaysOnTop bất đồng bộ
    assert(e1.sw.dataset.state === 'pending', 'main chưa trả lời: vẫn PENDING');
    resolveGet({ ok: true, value: true }); await tick();
    assert(e1.sw.dataset.state === 'on' && e1.sw.getAttribute('aria-checked') === 'true', 'sau khi main xác nhận true: hiện ON');
    assert(e1.sw.disabled === false, 'sau khi có trạng thái: công tắc mở khoá');
    e1.click(); e1.click(); e1.click(); await tick();
    assert(setCalls === 1, `bấm dồn 3 lần chỉ gửi 1 IPC (thực tế: ${setCalls})`);
    assert(e1.sw.dataset.state === 'off', 'sau set(false) thành công: hiện OFF');
    e1.click(); await tick();
    assert(e1.sw.dataset.state === 'on' && setCalls === 2, 'gạt lại: ON, tổng 2 IPC');
    assert(e1.listeners.click === 1, 'chỉ 1 listener click (không trùng)');

    const e2 = makeEnv({ getAlwaysOnTop: async () => ({ ok: true, value: false }),
                         setAlwaysOnTop: async () => ({ ok: false, value: false, error: 'boom' }) });
    await tick();
    assert(e2.sw.dataset.state === 'off', 'khởi động với OFF thật: hiện OFF');
    e2.click(); await tick();
    assert(e2.sw.dataset.state === 'off' && e2.cls.has('aot-error'), 'main báo lỗi khi bật: UI KHÔNG hiện ON, có cờ lỗi');
    assert(/Lỗi: boom/.test(e2.sw.title), 'tooltip nêu lỗi');

    const e3 = makeEnv({ getAlwaysOnTop: async () => { throw new Error('ipc down'); }, setAlwaysOnTop: async () => ({ ok: true, value: true }) });
    await tick();
    assert(e3.sw.dataset.state === 'error' && e3.sw.getAttribute('aria-checked') === 'false', 'getAlwaysOnTop ném lỗi: trạng thái error, không báo ON');

    const e4 = makeEnv({ getAlwaysOnTop: async () => ({ ok: false, value: true, error: 'x' }), setAlwaysOnTop: async () => ({ ok: true, value: true }) });
    await tick();
    assert(e4.sw.dataset.state === 'error', 'get ok=false: error (không tin value)');

    const e5 = makeEnv({ setAlwaysOnTop: async () => ({}) });
    assert(e5.sw.disabled === true && e5.sw.dataset.state === 'error', 'electronAPI thiếu hàm: khoá và báo lỗi, không crash');
    const e6 = makeEnv(undefined);
    assert(e6.sw.dataset.state === 'error', 'không có electronAPI: không crash');
}

console.log('\n== CSS / HTML / bố cục ==');
{
    assert(/#aotSwitch\s*\{[^}]*width:\s*44px[^}]*height:\s*29px/.test(cssSrc), 'công tắc 44x29px (cao bằng các nút khác)');
    assert(/#aotSwitch\[data-state="on"\]/.test(cssSrc), 'có style riêng cho ON');
    assert(/grid-template-columns:\s*220px 1fr 170px/.test(cssSrc), 'lưới header 220px 1fr 170px GIỮ NGUYÊN');
    const total = 44 + 3 * 29 + 3 * 6; // công tắc + 3 nút + 3 khoảng cách
    assert(total <= 170, `tổng chiều rộng nhóm nút ${total}px <= cột phải 170px`);
    assert(!/aotSwitch|always/i.test(htmlSrc), 'index.html KHÔNG bị sửa (công tắc tạo bằng JS)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
})();
