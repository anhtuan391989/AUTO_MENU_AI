// EFFECT-LIT-01 — nút EFFECT sáng khi Bảng Hiệu Ứng mở, tắt khi đóng. Dùng EffectsWindow.js THẬT với BrowserWindow giả.
const fs = require('fs'), path = require('path');
const { createEffectsWindowManager } = require('../../app/EffectsWindow.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const wins = [];
class FakeWin {
  constructor() { this.destroyed = false; this.h = {}; this.webContents = {}; wins.push(this); }
  loadFile() {} once(e, f) { this.h[e] = f; } on(e, f) { this.h[e] = f; } show() {} hide() {} isVisible() { return true; }
  setAlwaysOnTop() {} isDestroyed() { return this.destroyed; }
  close() { this.destroyed = true; if (this.h.closed) this.h.closed(); }
}
const mainWin = { isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }), on() {}, once() {}, removeListener() {}, isMinimized: () => false, webContents: {} };
const states = [];
const m = createEffectsWindowManager({ BrowserWindow: FakeWin, screen: null, getMainWin: () => mainWin, preloadPath: 'p', htmlPath: 'h', onStateChange: (o) => states.push(o) });
m.toggle(); ok(states.join() === 'true', 'mở cửa sổ -> báo true (nút SÁNG)', states);
m.toggle(); ok(states.join() === 'true,false', 'bấm lần nữa (đóng) -> báo false (nút TẮT)', states);
m.toggle(); const w = wins[wins.length - 1]; states.length = 0; w.destroyed = true; w.h.closed();
ok(states.join() === 'false', 'đóng bằng nút ✕ / hệ thống (sự kiện closed) -> báo false', states);
const m2 = createEffectsWindowManager({ BrowserWindow: FakeWin, screen: null, getMainWin: () => mainWin, preloadPath: 'p', htmlPath: 'h', onStateChange: () => { throw new Error('boom'); } });
let threw = false; try { m2.toggle(); m2.toggle(); } catch (e) { threw = true; } ok(!threw, 'callback lỗi không làm hỏng cửa sổ');
const m3 = createEffectsWindowManager({ BrowserWindow: FakeWin, screen: null, getMainWin: () => mainWin, preloadPath: 'p', htmlPath: 'h' });
let t3 = false; try { m3.toggle(); m3.toggle(); } catch (e) { t3 = true; } ok(!t3, 'không truyền onStateChange vẫn chạy bình thường (tương thích ngược)');
ok(/effects-state/.test(rd('app/main.js')) && /onStateChange/.test(rd('app/main.js')), 'main.js: gửi effects-state cho menu chính');
ok(/onEffectsState: \(callback\) => ipcRenderer\.on\("effects-state"/.test(rd('app/preload.js')), 'preload.js: cầu nối onEffectsState');
ok(/onEffectsState\(\(open\) => document\.getElementById\("effectPopupBtn"\)\?\.classList\.toggle\("active"/.test(rd('ui/js/renderer.js')), 'renderer.js: bật/tắt class active của #effectPopupBtn');
ok(/#effectPopupBtn\.preset-sound-btn\.active[^{]*\{[^}]*!important/.test(rd('ui/css/style.css')), 'style.css: có kiểu SÁNG cho #effectPopupBtn.active (thắng các dòng ép tối)');
ok(!/active/.test((rd('ui/index.html').match(/<button id="effectPopupBtn"[^>]*>/) || [''])[0]), 'index.html KHÔNG đổi: nút mặc định không có active (mở app = tắt)');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
