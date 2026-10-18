/**
 * MENU-FX-AUTO-OFF — Lưu/khôi phục 4 nút Music / Mic 1 / Mic 2 / FX (test LOGIC trên mã THẬT trích từ ui/js/renderer.js; DOM + file cấu hình GIẢ LẬP).
 * Mỗi "phiên" = 1 vm context mới (mô phỏng đóng Menu rồi mở lại) dùng chung 1 "file cấu hình" JSON.
 * KHÔNG thay thế test runtime Electron thật (xem báo cáo: kiểm thử Electron/Xvfb riêng) và KHÔNG xác minh DAW.
 * Chạy: node tests/unit/MenuButtonPersistence.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

const cut = (from, to) => { const a = ren.indexOf(from); if (a < 0) throw new Error('marker không thấy: ' + from); const b = ren.indexOf(to, a + from.length); if (b < 0) throw new Error('marker không thấy: ' + to); return ren.slice(a, b); };
const declSrc = cut('let __menuStateRestored = false;', '\n\n/* ====') ;
const clickSrc = cut('document.getElementById("musicBtn")?.addEventListener("click"', '\n// ==========================================================\n// TASK AI-FX-01 — AUTO FX/SEND theo NHẠC');
const saveLoadSrc = cut('// MENU-FX-AUTO-OFF (lưu trạng thái 4 nút)', '\n/* ==========================================================\n   15.'.slice(0, 1) + '\n/* ====') ;
// saveLoadSrc có thể chứa nhiều hơn loadData: cắt chính xác tới hết loadData
const lSrcStart = ren.indexOf('// MENU-FX-AUTO-OFF (lưu trạng thái 4 nút)');
const loadStart = ren.indexOf('function loadData() {');
const loadEnd = ren.indexOf('\n/* ==========================================================', loadStart);
const persistSrc = ren.slice(lSrcStart, loadEnd);

function makeEl(id) {
    const cls = new Set(); const handlers = {};
    return { id, dataset: {}, title: '', textContent: '', value: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle(c, f) { const want = f === undefined ? !cls.has(c) : !!f; want ? cls.add(c) : cls.delete(c); return want; } }, addEventListener: (ev, fn) => { handlers[ev] = fn; }, _h: handlers };
}
// file = { settings: object|null (nội dung "app-settings.json"), saveOk: bool }
function session(file) {
    const els = {}; for (const id of ['musicBtn', 'mic1Btn', 'mic2Btn', 'fxBtn', 'currentKey', 'toneSelector', 'modPowerBtn']) els[id] = makeEl(id);
    els.currentKey.textContent = 'LISTENING';
    const win = { electronAPI: { sendTelemetry: (r) => (win.__tele = win.__tele || []).push(r) }, __unloadHandlers: [] };
    win.addEventListener = (ev, fn) => { if (ev === 'beforeunload') win.__unloadHandlers.push(fn); };
    win.window = win;
    const ctx = vm.createContext(Object.assign(win, {
        document: { getElementById: (id) => els[id] || null, querySelector: () => null, querySelectorAll: () => [], body: makeEl('body') },
        console: { log() {}, warn() {}, error() {} },
        appSettings: (file.settings === undefined || file.settings === null) ? { autoMenuData: null } : JSON.parse(JSON.stringify(file.settings)), // như production: luôn là object (DEFAULT_APP_SETTINGS)
        saveSetup: () => { if (!file.saveOk) return false; file.settings = JSON.parse(JSON.stringify(ctx.appSettings)); return true; },
        knobData: [], updateKnob() {}, originalKey: 'G# Minor', saveDataCalls: 0,
    }));
    vm.runInContext(declSrc.replace(/^const /m, 'var ').replace(/^let /gm, 'var '), ctx);
    vm.runInContext(persistSrc.replace(/^let /gm, 'var ').replace(/^const /gm, 'var '), ctx);
    vm.runInContext(clickSrc, ctx);
    return {
        els, win: ctx, file,
        restore: () => ctx.loadData(), // mô phỏng DOMContentLoaded
        state: () => ({ music: !els.musicBtn.classList.contains('disabled'), mic1: els.mic1Btn.classList.contains('active'), mic2: els.mic2Btn.classList.contains('active'), fx: els.fxBtn.classList.contains('active') }),
        click: (id) => els[id]._h.click({ target: els[id] }),
        close: () => { ctx.__unloadHandlers.forEach((f) => f()); }, // mô phỏng beforeunload
    };
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// đặt trạng thái mong muốn bằng cách BẤM nút như người dùng
function setStates(s, want) { const cur = s.state(); if (cur.music !== want.music) s.click('musicBtn'); if (cur.mic1 !== want.mic1) s.click('mic1Btn'); if (cur.mic2 !== want.mic2) s.click('mic2Btn'); if (cur.fx !== want.fx) s.click('fxBtn'); }

console.log('=== MenuButtonPersistence (logic trên mã thật; DOM/file giả) ===');
const file = { settings: undefined, saveOk: true };
let s = session(file); s.restore();
ok(eq(s.state(), { music: true, mic1: false, mic2: false, fx: false }), '0. Lần chạy đầu (chưa có cấu hình): mặc định an toàn Music ON, Mic OFF, FX OFF, không crash');

// 9. Music ON, Mic1 ON, Mic2 OFF, FX OFF
setStates(s, { music: true, mic1: true, mic2: false, fx: false }); s.close();
let s2 = session(file); s2.restore();
ok(eq(s2.state(), { music: true, mic1: true, mic2: false, fx: false }), '9. Music ON, Mic1 ON, Mic2 OFF, FX OFF → đóng → mở lại → khôi phục đúng cả 4');

// 10. tổ hợp khác gồm FX ON (+ lặp nhiều tổ hợp)
const combos = [{ music: false, mic1: false, mic2: true, fx: true }, { music: false, mic1: true, mic2: true, fx: true }, { music: true, mic1: false, mic2: false, fx: true }, { music: true, mic1: true, mic2: true, fx: false }, { music: false, mic1: false, mic2: false, fx: false }];
let all = true; let cur = s2;
for (const c of combos) { setStates(cur, c); cur.close(); const nxt = session(file); nxt.restore(); if (!eq(nxt.state(), c)) { all = false; console.log('     lệch với', JSON.stringify(c), '=>', JSON.stringify(nxt.state())); } cur = nxt; }
ok(all, '10. 5 tổ hợp khác (gồm FX ON; Music OFF; tất cả OFF) → mỗi lần đóng/mở đều khôi phục đúng');

// 11. thoát bình thường (không có click cuối): chốt beforeunload
{ const f = { settings: undefined, saveOk: true }; const a = session(f); a.restore(); a.els.mic1Btn.classList.add('active'); /* đổi trạng thái KHÔNG qua click (vd MIDI/lệnh khác) */ a.close();
  const b = session(f); b.restore(); ok(b.state().mic1 === true, '11. Thoát bình thường: trạng thái đổi ngoài đường click vẫn được chốt khi đóng cửa sổ (beforeunload)'); }

// 12. cấu hình thiếu / sai / cũ
const bad = [null, 'garbage', 42, [1, 2], {}, { mic1: 'yes', mic2: 1, fx: null, musicDisabled: 'true' }, { mic1: true }, { mic1: true, mic2: true, musicDisabled: true, fx: true, knobs: 'bad', preset: 123 }];
let noCrash = true; const results = [];
for (const b of bad) { try { const f = { settings: { autoMenuData: b }, saveOk: true }; const x = session(f); x.restore(); results.push(x.state()); } catch (e) { noCrash = false; console.log('     ném lỗi với', JSON.stringify(b), e.message); } }
ok(noCrash, '12a. 8 kiểu cấu hình thiếu/hỏng/phiên bản cũ: không crash');
ok(eq(results[0], { music: true, mic1: false, mic2: false, fx: false }) && eq(results[4], results[0]) && eq(results[5], results[0]), '12b. null/{}/sai kiểu → mặc định an toàn (không đoán "true" từ chuỗi/số)');
ok(results[6].mic1 === true && results[6].mic2 === false && results[6].music === true, '12c. Cấu hình cũ chỉ có mic1:true → giữ mic1 ON, phần thiếu dùng mặc định (không mất giá trị hợp lệ)');
ok(eq(results[7], { music: false, mic1: true, mic2: true, fx: true }), '12d. knobs/preset hỏng nhưng 4 nút hợp lệ → 4 nút vẫn được khôi phục');
{ const x = session({ settings: { autoMenuData: { mic1: true, fx: true } }, saveOk: true }); x.restore();
  ok(/CHƯA/.test(x.els.fxBtn.title) && x.els.fxBtn.dataset.fxSync === 'restored-unconfirmed', '12e. FX khôi phục ON KHÔNG bị trình bày như DAW đã xác nhận: tooltip "CHƯA được xác nhận", data-fx-sync=restored-unconfirmed'); }

// 13. khởi tạo không ghi đè trạng thái đã lưu
{ const f = { settings: { autoMenuData: { musicDisabled: true, mic1: true, mic2: true, fx: true, currentKey: 'LISTENING', knobs: [] } }, saveOk: true };
  const x = session(f); // CHƯA restore: mô phỏng saveData() bị gọi quá sớm với DOM còn mặc định
  x.win.saveData();
  ok(f.settings.autoMenuData.mic1 === true && f.settings.autoMenuData.mic2 === true && f.settings.autoMenuData.musicDisabled === true && f.settings.autoMenuData.fx === true, '13a. saveData() gọi TRƯỚC khi khôi phục xong KHÔNG ghi mặc định của DOM đè lên giá trị đã lưu');
  x.restore(); ok(eq(x.state(), { music: false, mic1: true, mic2: true, fx: true }), '13b. Sau đó khôi phục vẫn đúng'); }
// Auto FX đổi nút FX (onRequest) không được ghi đè LỰA CHỌN của người dùng
{ const f = { settings: undefined, saveOk: true }; const x = session(f); x.restore(); // người dùng chưa chọn FX
  x.els.fxBtn.classList.add('active'); x.win.saveData(); // Auto bật FX theo nhạc rồi saveData()
  ok(f.settings.autoMenuData.fx === false && f.settings.autoMenuData.fxRequested === true, '13c. Auto FX bật nút (yêu cầu) → lưu fxRequested=true nhưng LỰA CHỌN người dùng fx vẫn false');
  const y = session(f); y.restore(); ok(y.state().fx === false, '13d. Mở lại: FX theo lựa chọn người dùng (OFF), không phải theo yêu cầu Auto lần trước (ON)');
  y.click('fxBtn'); const z = session(f); z.restore(); ok(z.state().fx === true && f.settings.autoMenuData.fx === true, '13e. Người dùng BẤM FX ON → lựa chọn được lưu và khôi phục'); }
// khởi tạo nguồn âm/DAW (Auto FX tick) trước khi load không đổi cấu hình đã lưu
{ const f = { settings: { autoMenuData: { mic1: true, mic2: false, musicDisabled: false, fx: true } }, saveOk: true }; const x = session(f);
  x.els.fxBtn.classList.toggle('active', false); x.win.saveData(); /* Auto yêu cầu OFF trước khi load xong */
  ok(f.settings.autoMenuData.fx === true && f.settings.autoMenuData.mic1 === true, '13f. Auto FX yêu cầu OFF trước khi khôi phục xong: lựa chọn đã lưu (FX ON, Mic1 ON) không bị đổi'); }

// 14. ghi file thất bại
{ const f = { settings: undefined, saveOk: false }; const x = session(f); x.restore(); let threw = false; try { x.click('mic1Btn'); } catch (e) { threw = true; }
  ok(!threw && x.win.__menuSaveFailed === true && (x.win.__tele || []).some((t) => t.event === 'MENU_STATE_SAVE_FAILED'), '14a. Ghi file lỗi: không crash, đặt cờ __menuSaveFailed + telemetry MENU_STATE_SAVE_FAILED (không im lặng)');
  f.saveOk = true; x.close(); const y = session(f); y.restore(); ok(y.state().mic1 === true && x.win.__menuSaveFailed === false, '14b. Khi ghi được trở lại (lần lưu/đóng Menu kế tiếp) → ghi toàn bộ, cờ lỗi được xoá'); }

// 15. tĩnh: khôi phục chạy đầu DOMContentLoaded và loadData; không còn khối chỉ-add
ok(/document\.addEventListener\("DOMContentLoaded", \(\) => \{\n    restoreButtonStates\(\);/.test(ren), '15a. (tĩnh) restoreButtonStates() là câu lệnh ĐẦU của DOMContentLoaded (lỗi ở checkAllSystems/applyAudioOutputSetting không làm mất trạng thái)');
ok(!/if \(data\.mic1\) \{\n\s+document\.getElementById\("mic1Btn"\)\?\.classList\.add\("active"\);/.test(ren), '15b. (tĩnh) không còn khối khôi phục kiểu chỉ-add (toggle(force) thay thế)');
console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
