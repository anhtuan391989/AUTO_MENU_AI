/**
 * BUTTON-RESET — Yêu cầu chính thức của Khói: Music / Mic 1 / Mic 2 / FX KHÔNG được lưu trạng thái khi thoát Menu.
 * (Thay thế MenuButtonPersistence.verify.js — test cũ khẳng định yêu cầu NGƯỢC LẠI.)
 * Test LOGIC trên mã THẬT trích từ ui/js/renderer.js + ui/index.html; DOM + file cấu hình GIẢ LẬP. Mỗi "phiên" = 1 vm context mới dùng chung 1 file JSON.
 * KHÔNG thay thế test Electron thật (tools/runtime-probe/persist.js) và KHÔNG xác minh DAW.
 * Chạy: node tests/unit/MenuButtonReset.verify.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ren = fs.readFileSync(path.resolve(__dirname, '../../ui/js/renderer.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../ui/index.html'), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const clickA = ren.indexOf('document.getElementById("musicBtn")?.addEventListener("click"');
const clickB = ren.indexOf('\n// ==========================================================\n// TASK AI-FX-01 — AUTO FX/SEND theo NHẠC');
const saveA = ren.indexOf('// BUTTON-RESET (yêu cầu chính thức của Khói)');
const loadA = ren.indexOf('function loadData() {');
const loadB = ren.indexOf('\n/* ==========================================================', loadA);
if ([clickA, clickB, saveA, loadA, loadB].some((x) => x < 0)) throw new Error('marker không thấy trong renderer.js');
const clickSrc = ren.slice(clickA, clickB), persistSrc = ren.slice(saveA, loadB);
const saveFnSrc = ren.slice(ren.indexOf('function saveData() {'), ren.indexOf('function loadData() {'));

function makeEl(id, cls0) {
    const cls = new Set(cls0 || []); const handlers = {};
    return { id, dataset: {}, title: '', textContent: '', value: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle(c, f) { const want = f === undefined ? !cls.has(c) : !!f; want ? cls.add(c) : cls.delete(c); return want; } }, addEventListener: (ev, fn) => { handlers[ev] = fn; }, _h: handlers };
}
// file = { settings: object|null (nội dung app-settings.json), saveOk }
function session(file) {
    const els = {}; for (const id of ['musicBtn', 'mic1Btn', 'mic2Btn', 'fxBtn', 'currentKey', 'toneSelector', 'modPowerBtn']) els[id] = makeEl(id);
    els.currentKey.textContent = 'LISTENING'; els.toneSelector.value = 'C';
    const presets = ['A', 'B', 'C'].map((t) => { const e = makeEl('p' + t, t === 'A' ? ['active'] : []); e.textContent = t; return e; });
    const win = { electronAPI: { sendTelemetry: (r) => (win.__tele = win.__tele || []).push(r) }, __unloadHandlers: [] };
    win.addEventListener = (ev, fn) => { if (ev === 'beforeunload') win.__unloadHandlers.push(fn); };
    win.window = win;
    const knobData = [{ id: 'musicKnob', value: 50 }, { id: 'masterKnob', value: 50 }];
    const ctx = vm.createContext(Object.assign(win, {
        document: { getElementById: (id) => els[id] || null, querySelector: (q) => q === '.preset-btn.active' ? (presets.find((p) => p.classList.contains('active')) || null) : null, querySelectorAll: (q) => q === '.preset-btn' ? presets : [], body: makeEl('body') },
        console: { log() {}, warn() {}, error() {} },
        appSettings: (file.settings == null) ? { autoMenuData: null } : JSON.parse(JSON.stringify(file.settings)),
        saveSetup: () => { if (!file.saveOk) return false; file.settings = JSON.parse(JSON.stringify(ctx.appSettings)); return true; },
        knobData, updateKnob() {}, originalKey: 'G# Minor',
    }));
    vm.runInContext(persistSrc.replace(/^let /gm, 'var ').replace(/^const /gm, 'var '), ctx);
    vm.runInContext(clickSrc, ctx);
    return {
        els, presets, knobData, win: ctx,
        open: () => ctx.loadData(), // mô phỏng DOMContentLoaded
        state: () => ({ music: !els.musicBtn.classList.contains('disabled'), mic1: els.mic1Btn.classList.contains('active'), mic2: els.mic2Btn.classList.contains('active'), fx: els.fxBtn.classList.contains('active') }),
        click: (id) => els[id]._h.click({ target: els[id] }),
        close: () => { ctx.__unloadHandlers.forEach((f) => f()); }, // mô phỏng thoát Menu (nếu có beforeunload — không còn)
        other: () => ({ key: els.currentKey.textContent, tone: els.toneSelector.value, preset: (presets.find((p) => p.classList.contains('active')) || {}).textContent, knobs: knobData.map((k) => k.value) }),
    };
}
function setStates(s, want) { const cur = s.state(); if (cur.music !== want.music) s.click('musicBtn'); if (cur.mic1 !== want.mic1) s.click('mic1Btn'); if (cur.mic2 !== want.mic2) s.click('mic2Btn'); if (cur.fx !== want.fx) s.click('fxBtn'); }
const DEFAULT = { music: true, mic1: false, mic2: false, fx: false }; // Music "true" = KHÔNG có class disabled
const BTN_KEYS = ['musicDisabled', 'mic1', 'mic2', 'fx', 'fxRequested'];

console.log('=== MenuButtonReset (logic trên mã thật; DOM/file giả) ===');

// 0. mặc định thực tế
ok(['musicBtn', 'mic1Btn', 'mic2Btn', 'fxBtn'].every((id) => new RegExp('<button id="' + id + '" class="control-btn">').test(html)), '0a. (HTML) 4 nút không có class active/disabled mặc định → Music = KHÔNG disabled, Mic 1/Mic 2/FX = tắt');
{ const f = { settings: null, saveOk: true }; const s = session(f); s.open(); ok(eq(s.state(), DEFAULT), '0b. Lần chạy đầu (chưa có cấu hình): ' + JSON.stringify(DEFAULT)); }

// 6a. tất cả 16 tổ hợp ON/OFF: đặt → đóng hẳn → mở lại → LUÔN về mặc định
let allDefault = true; let n = 0;
for (let m = 0; m < 16; m++) {
    const want = { music: !!(m & 1), mic1: !!(m & 2), mic2: !!(m & 4), fx: !!(m & 8) };
    const f = { settings: null, saveOk: true }; const a = session(f); a.open(); setStates(a, want);
    if (!eq(a.state(), want)) { allDefault = false; console.log('     không đặt được', JSON.stringify(want)); }
    a.close(); const b = session(f); b.open(); n++;
    if (!eq(b.state(), DEFAULT)) { allDefault = false; console.log('     KHÔI PHỤC trái yêu cầu với', JSON.stringify(want), '=>', JSON.stringify(b.state())); }
}
ok(allDefault && n === 16, '6a. 16/16 tổ hợp Music/Mic1/Mic2/FX (gồm FX ON): đóng hẳn rồi mở lại → cả 4 nút về mặc định, KHÔNG khôi phục trạng thái cũ');

// 6b. file cấu hình không chứa 4 nút sau mọi thao tác
{ const f = { settings: null, saveOk: true }; const a = session(f); a.open(); setStates(a, { music: false, mic1: true, mic2: true, fx: true }); a.close();
  const d = (f.settings && f.settings.autoMenuData) || {};
  ok(BTN_KEYS.every((k) => !(k in d)), '6b. Sau khi bấm cả 4 nút + đóng: app-settings.autoMenuData KHÔNG chứa musicDisabled/mic1/mic2/fx/fxRequested (keys: ' + Object.keys(d).join(',') + ')'); }

// 6c. cài đặt khác vẫn được giữ
{ const f = { settings: null, saveOk: true }; const a = session(f); a.open();
  a.els.currentKey.textContent = 'D Minor'; a.els.toneSelector.value = 'E'; a.presets[0].classList.remove('active'); a.presets[2].classList.add('active'); a.knobData[0].value = 77; a.knobData[1].value = 33;
  setStates(a, { music: false, mic1: true, mic2: true, fx: true }); // mỗi click gọi saveData()
  a.close(); const b = session(f); b.open();
  ok(eq(b.other(), { key: 'D Minor', tone: 'E', preset: 'C', knobs: [77, 33] }) && eq(b.state(), DEFAULT), '6c. Key/tone/preset/knobs ĐƯỢC giữ qua phiên (' + JSON.stringify(b.other()) + ') trong khi 4 nút về mặc định'); }

// 6d. cấu hình CŨ còn các key của 4 nút (ON hết) → bị bỏ qua; các cài đặt khác vẫn đọc; key cũ biến mất ở lần lưu kế tiếp
{ const f = { settings: { autoMenuData: { musicDisabled: true, mic1: true, mic2: true, fx: true, fxRequested: true, currentKey: 'F Major', tone: 'G', preset: 'B', knobs: [{ id: 'musicKnob', value: 12 }] } }, saveOk: true };
  const s = session(f); s.open();
  ok(eq(s.state(), DEFAULT), '6d-1. File cũ có musicDisabled/mic1/mic2/fx/fxRequested = ON hết → mở lên vẫn mặc định (bỏ qua dữ liệu cũ)');
  ok(s.other().key === 'F Major' && s.other().tone === 'G' && s.other().preset === 'B' && s.knobData[0].value === 12, '6d-2. Cùng file cũ: Key/tone/preset/knob vẫn được đọc đúng');
  ok(f.settings.autoMenuData.mic1 === true, '6d-3. Chưa lưu gì → file chưa bị đụng (không xoá cấu hình ngoài ý muốn)');
  s.win.saveData(); const d = f.settings.autoMenuData;
  ok(BTN_KEYS.every((k) => !(k in d)) && d.currentKey === 'F Major' && d.preset === 'B', '6d-4. Lần saveData() kế tiếp: key cũ của 4 nút biến mất, cài đặt khác giữ nguyên'); }

// 6e. thoát Menu không lưu lại 4 nút (không có beforeunload), Auto FX đổi nút FX không kéo theo lưu
{ const f = { settings: null, saveOk: true }; const a = session(f); a.open(); a.els.mic1Btn.classList.add('active'); a.els.fxBtn.classList.add('active'); /* đổi ngoài đường click: MIDI/Auto */
  ok(a.win.__unloadHandlers.length === 0, '6e-1. Không còn handler beforeunload lưu trạng thái');
  a.close(); ok(f.settings === null, '6e-2. Đóng Menu sau khi nút bị đổi ngoài click: không ghi gì ra file'); }

// 7. cấu hình thiếu/sai/cũ: không crash, 4 nút mặc định
const bad = [null, 'garbage', 42, [1, 2], {}, { mic1: 'yes', fx: null }, { knobs: 'bad', preset: 123, mic1: true }];
let noCrash = true, allDef = true;
for (const b of bad) { try { const x = session({ settings: { autoMenuData: b }, saveOk: true }); x.open(); if (!eq(x.state(), DEFAULT)) allDef = false; } catch (e) { noCrash = false; console.log('     ném lỗi với', JSON.stringify(b), e.message); } }
ok(noCrash && allDef, '7. 7 kiểu cấu hình thiếu/hỏng/cũ (gồm knobs sai kiểu): không crash, 4 nút mặc định');

// 8. trạng thái mặc định ≠ DAW đã xác nhận
{ const s = session({ settings: null, saveOk: true }); s.open();
  ok(!s.els.fxBtn.dataset.fxSync && !s.els.fxBtn.dataset.fxControl, '8a. Sau khi mở: nút FX không được gắn nhãn đồng bộ/xác nhận (data-fx-sync trống) — mặc định lúc mở ≠ DAW đã xác nhận');
  ok(!/confirmed|đã xác nhận/i.test(persistSrc.replace(/KHÔNG[^\n]*xác nhận[^\n]*/g, '').replace(/\/\/[^\n]*/g, '')), '8b. (tĩnh) Mã lưu/đọc không có chuỗi "confirmed/đã xác nhận" nào trình bày trạng thái nút như DAW đã xác nhận'); }

// 9. tĩnh
ok(!/restoreButtonStates|__fxUserChoice|__menuStateRestored|restored-unconfirmed|beforeunload/.test(ren.replace(/\/\/[^\n]*/g, '')), '9a. (tĩnh) Không còn restoreButtonStates / __fxUserChoice / __menuStateRestored / beforeunload trong renderer.js (ngoài comment)');
ok(!/musicBtn|mic1Btn|mic2Btn|fxBtn/.test(saveFnSrc) && !/musicBtn|mic1Btn|mic2Btn|fxBtn/.test(ren.slice(loadA, loadB)), '9b. (tĩnh) saveData() và loadData() không tham chiếu 4 nút');
{ const i = ren.indexOf('onRequest: (target)'); const line = ren.slice(i, ren.indexOf('\n', i)); ok(!/saveData\(/.test(line.replace(/\/\/.*$/, '')), '9c. (tĩnh) Auto FX onRequest (đổi nút FX) không gọi saveData()'); }
{ const i = ren.indexOf('document.getElementById("musicBtn")?.addEventListener'); const blk = ren.slice(i, ren.indexOf('const MONITOR_BTN_TO_ACTION', i)); ok(/saveData\(\)/.test(blk), '9d. (tĩnh, đối chứng) Bấm nút vẫn gọi saveData() cho các cài đặt khác — nhưng saveData() không ghi 4 nút (đã kiểm ở 6b)'); }
console.log(fail ? `❌ ${fail} FAIL` : '✅ TẤT CẢ PASS'); process.exit(fail ? 1 : 0);
