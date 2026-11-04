// TASK A97 — popup chuột phải MUSIC / MIC 1 / MIC 2 / FX tự ẩn sau 5 giây (đếm lại khi đang thao tác trong thẻ).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ren = fs.readFileSync(path.join(__dirname, '..', '..', 'ui/js/renderer.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l, x !== undefined ? JSON.stringify(x) : ''); } };
// đồng hồ giả
let now = 0, seq = 0; const timers = new Map();
const setTimeoutF = (f, ms) => { const id = ++seq; timers.set(id, { at: now + ms, f }); return id; };
const clearTimeoutF = (id) => timers.delete(id);
const advance = (ms) => { const end = now + ms; for (;;) { const n = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!n) break; now = n[1].at; timers.delete(n[0]); n[1].f(); } now = end; };
const mkCard = () => ({ style: { display: 'flex' }, h: {}, hovered: false, matches(sel) { return sel === ':hover' && this.hovered; }, addEventListener(n, f) { (this.h[n] = this.h[n] || []).push(f); }, fire(n) { (this.h[n] || []).forEach((f) => f({})); } });
const docH = {};
const src = ren.slice(ren.indexOf('const POPUP_AUTO_HIDE_MS'), ren.indexOf('const MIC_VOLUME_POPUPS'));
const sb = { setTimeout: setTimeoutF, clearTimeout: clearTimeoutF, document: { addEventListener: (n, f) => { (docH[n] = docH[n] || []).push(f); } }, console };
vm.createContext(sb); vm.runInContext(src + '\nthis.make = createPopupAutoHide; this.MS = POPUP_AUTO_HIDE_MS;', sb);
console.log('== helper tự ẩn ==');
ok(sb.MS === 5000, 'thời gian = 5000 ms');
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm();
  advance(4900); ok(c.style.display === 'flex', 'chưa tới 5 s: vẫn hiện'); advance(200); ok(c.style.display === 'none', 'quá 5 s: tự ẩn'); }
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm();
  advance(4000); c.fire('mousemove'); advance(4000); ok(c.style.display === 'flex', 'có thao tác trong thẻ: đếm lại từ đầu'); advance(1100); ok(c.style.display === 'none', 'ngừng thao tác 5 s: ẩn'); }
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm();
  advance(1000); c.fire('mousedown'); advance(20000); ok(c.style.display === 'flex', 'đang GIỮ chuột (kéo knob): không ẩn');
  docH.mouseup.forEach((f) => f({})); advance(4900); ok(c.style.display === 'flex', 'thả chuột: đếm lại 5 s'); advance(200); ok(c.style.display === 'none', '5 s sau khi thả: ẩn'); }
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm(); a.disarm(); advance(10000); ok(c.style.display === 'flex', 'đóng tay (disarm) rồi không bị ẩn/đếm nhầm'); }
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm(); advance(3000); a.arm(); advance(3000); ok(c.style.display === 'flex', 'mở lại: đếm lại từ lần mở sau'); }
// POPUP-AUTOHIDE-02: chuột còn nằm trong thẻ thì không ẩn; rời thẻ rồi 5 s mới ẩn
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm();
  c.hovered = true; c.fire('mouseenter'); advance(30000); ok(c.style.display === 'flex', 'chuột đứng yên trong thẻ: KHÔNG ẩn');
  c.hovered = false; c.fire('mouseleave'); advance(4900); ok(c.style.display === 'flex', 'chuột rời thẻ: chưa tới 5 s vẫn hiện'); advance(200); ok(c.style.display === 'none', 'chuột rời thẻ 5 s: ẩn'); }
{ const c = mkCard(); const a = sb.make(c, () => { c.style.display = 'none'; }); a.arm();
  c.hovered = true; advance(12000); ok(c.style.display === 'flex', 'hover mà không có sự kiện nào (timer tự kiểm tra :hover): không ẩn'); }
console.log('== 4 popup đều dùng helper ==');
const n = (re) => (ren.match(re) || []).length;
ok(n(/const auto = createPopupAutoHide\(card, /g) === 3, 'MIC(1+2 chung vòng lặp) / FX / MUSIC đều tạo bộ tự ẩn', n(/const auto = createPopupAutoHide\(card, /g));
ok(/auto\.arm\(\);\s*\n\s*\}\);\s*\n\s*cards\.push\(card\)/.test(ren), 'MIC 1/2: arm khi mở');
ok(/auto\.arm\(\);\s*\n\s*\}\);\s*\n\s*document\.addEventListener\("mousedown", \(e\) => \{\s*\n\s*const t = e\.target;\s*\n\s*if \(card\.contains\(t\)\) return;\s*\n\s*if \(t && t\.closest && t\.closest\("#fxBtn"\)\)/.test(ren), 'FX: arm khi mở');
ok(/card\.style\.display = "flex";\s*\n\s*auto\.arm\(\);/.test(ren.slice(ren.indexOf('function initAudioChillPopup'))), 'MUSIC: arm khi mở');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
