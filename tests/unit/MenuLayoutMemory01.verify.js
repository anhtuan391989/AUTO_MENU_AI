// MENU-LAYOUT-MEMORY-01 — ghi nhớ chế độ DỌC / NGANG của Menu. Trích đúng đoạn mã trong ui/js/renderer.js chạy trong vm với <body>/getSetting/setSetting GIẢ. KHÔNG phải Electron thật.
// Chạy: node tests/unit/MenuLayoutMemory01.verify.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };

const src = rd('ui/js/renderer.js');
const a = src.indexOf('/* MENU-LAYOUT-MEMORY-01 BEGIN'), b = src.indexOf('/* MENU-LAYOUT-MEMORY-01 END */');
ok(a > 0 && b > a, 'renderer.js có khối MENU-LAYOUT-MEMORY-01 (BEGIN/END)');
const block = src.slice(a, b);

function run(opts) {
    opts = opts || {};
    const classes = new Set(opts.initialClasses || []);
    const body = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c) => { if (classes.has(c)) classes.delete(c); else classes.add(c); } } };
    const store = Object.assign({}, opts.store || {}); const writes = []; let observerCb = null, observed = null; const errs = [];
    const sandbox = {
        document: { body: opts.noBody ? null : body },
        console: { error: (...x) => errs.push(x.join(' ')), log() {} },
        getSetting: opts.noGet ? undefined : (k, d) => (store[k] != null && store[k] !== '' ? store[k] : d),
        setSetting: opts.noSet ? undefined : (k, v) => { if (opts.setThrows) throw new Error('ghi lỗi'); writes.push([k, v]); store[k] = v; return true; },
        MutationObserver: opts.noObserver ? undefined : class { constructor(cb) { observerCb = cb; } observe(el, o) { observed = o; } }
    };
    vm.createContext(sandbox); vm.runInContext(block, sandbox);
    return { classes, store, writes, errs, fire: () => observerCb && observerCb(), observed: () => observed, hasObserver: () => !!observerCb, toggle: () => body.classList.toggle('vertical-mode') };
}

// lần cuối ở chế độ DỌC -> mở app: áp lại, KHÔNG ghi file lúc khởi động
{ const r = run({ store: { menuVerticalMode: true } }); ok(r.classes.has('vertical-mode'), 'lần cuối DỌC -> mở app: tự vào chế độ dọc'); ok(r.writes.length === 0, 'khởi động không ghi file (không ghi thừa)'); }
// lần cuối NGANG / chưa lưu -> giữ nguyên như cũ
{ const r = run({ store: { menuVerticalMode: false } }); ok(!r.classes.has('vertical-mode'), 'lần cuối NGANG -> mở app bình thường (ngang)'); }
{ const r = run({}); ok(!r.classes.has('vertical-mode') && r.writes.length === 0, 'chưa lưu gì -> ngang như cũ, không ghi'); }
{ const r = run({ store: { menuVerticalMode: 'true' } }); ok(!r.classes.has('vertical-mode'), 'giá trị lưu không phải boolean true -> coi là ngang'); }
// bấm nút 📐 -> lưu đúng giá trị mới nhất (lần cuối thắng)
{ const r = run({}); ok(r.hasObserver() && JSON.stringify(r.observed()) === JSON.stringify({ attributes: true, attributeFilter: ['class'] }), 'theo dõi đúng thuộc tính class của body');
  r.toggle(); r.fire(); ok(r.store.menuVerticalMode === true && r.writes.length === 1, 'bấm 📐 sang DỌC -> đã lưu true');
  r.toggle(); r.fire(); ok(r.store.menuVerticalMode === false && r.writes.length === 2, 'bấm 📐 về NGANG -> đã lưu false (lần cuối thắng)');
  r.fire(); ok(r.writes.length === 2, 'class không đổi (sự kiện thừa) -> không ghi thêm'); }
// khởi động ở dọc rồi về ngang -> lưu false
{ const r = run({ store: { menuVerticalMode: true } }); r.toggle(); r.fire(); ok(r.store.menuVerticalMode === false, 'đang dọc (đã nhớ) -> bấm về ngang -> lưu false'); }
// an toàn khi lỗi / thiếu
{ const r = run({ setThrows: true }); r.toggle(); let threw = false; try { r.fire(); } catch (e) { threw = true; } ok(!threw && r.errs.length >= 1, 'ghi file lỗi -> chỉ báo log, không throw'); }
{ let threw = false; try { run({ noGet: true }); run({ noSet: true }); run({ noBody: true }); run({ noObserver: true, store: { menuVerticalMode: true } }); } catch (e) { threw = true; } ok(!threw, 'thiếu getSetting/setSetting/body/MutationObserver -> không throw'); }
{ const r = run({ noObserver: true, store: { menuVerticalMode: true } }); ok(r.classes.has('vertical-mode'), 'thiếu MutationObserver vẫn áp lại chế độ dọc đã lưu'); }
// HTML không bị sửa
{ const html = rd('ui/index.html'); ok(html.includes('onclick="toggleVerticalMode()"') && html.includes("function toggleVerticalMode() { document.body.classList.toggle('vertical-mode'); }") && !html.includes('menuVerticalMode'), 'index.html KHÔNG bị sửa: nút 📐 và toggleVerticalMode() giữ nguyên'); }
// khối nằm sau getSetting/setSetting (appSettings.js nạp trước renderer.js)
{ const html = rd('ui/index.html'); ok(html.indexOf('js/appSettings.js') > 0 && html.indexOf('js/appSettings.js') < html.indexOf('js/renderer.js'), 'appSettings.js được nạp TRƯỚC renderer.js (getSetting/setSetting sẵn sàng)'); }

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
