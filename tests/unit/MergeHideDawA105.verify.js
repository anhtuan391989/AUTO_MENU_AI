// A105 — gộp Ẩn/Hiện DAW vào thẻ Hidden DAW (tab AI). Kiểm tra HTML tĩnh + vm cho setupTools.js. KHÔNG phải Windows thật.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'ui/setup.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'ui/js/setupTools.js'), 'utf8');
let p = 0, f = 0; const ok = (c, m) => { c ? p++ : f++; console.log((c ? '  OK   ' : '  FAIL ') + m); };
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const card = html.slice(html.indexOf('🎛 Hidden DAW'), html.indexOf('📁 Startup'));
ok(!/panel-tools/.test(html) && !/<span>Công cụ/.test(html), 'tab + panel "Công cụ & Sửa lỗi" đã bỏ hẳn');
['toolsDawBadge', 'toolsDawPath', 'toolsDawMessage', 'btnToolsHideDaw', 'btnToolsShowDaw'].forEach((i) => ok(ids.filter((x) => x === i).length === 1 && card.includes('id="' + i + '"'), i + ': đúng 1 lần, nằm trong thẻ Hidden DAW'));
ok(ids.length === new Set(ids).size, 'không trùng id nào trong setup.html');
const f7 = [...card.matchAll(/<(?:input|select)\b[^>]*id="hiddenDaw[^"]*"[^>]*>/g)];
ok(f7.length === 7 && f7.every((m) => /disabled/.test(m[0])), '7 ô cấu hình Hidden DAW giữ nguyên và vẫn khoá');
ok(!/Ẩn Plugin/i.test(card), 'không có Ẩn Plugin');
ok(/js\/setupTools\.js/.test(html), 'setupTools.js vẫn được nạp');
ok(/"panel-ai"/.test(js) && !/panel-tools/.test(js), 'setupTools.js làm mới trạng thái khi mở tab AI');
// vm: mở tab AI gọi toolsDawStatus
const els = {}; const mk = () => ({ textContent: '', style: {}, className: '', disabled: false, addEventListener(t, fn) { (this.h = this.h || {})[t] = fn; } });
['toolsDawBadge', 'toolsDawPath', 'toolsDawMessage', 'btnToolsHideDaw', 'btnToolsShowDaw', 'sidebarNav'].forEach((i) => els[i] = mk());
let calls = 0, domReady;
const ctx = { window: { electronAPI: { toolsDawStatus: async () => { calls++; return { configured: true, exePath: 'X', hidden: false, state: 'visible', build: 'b' }; } } }, document: { getElementById: (i) => els[i] || null, addEventListener: (t, fn) => { if (t === 'DOMContentLoaded') domReady = fn; } }, setTimeout, clearTimeout };
vm.runInNewContext(js, ctx); domReady();
setTimeout(() => {
  const c0 = calls; els.sidebarNav.h.click({ target: { closest: () => ({ dataset: { panel: 'panel-ai' } }) } });
  setTimeout(() => { ok(c0 >= 1 && calls === c0 + 1, 'mở tab AI -> dò lại trạng thái DAW'); const c1 = calls;
    els.sidebarNav.h.click({ target: { closest: () => ({ dataset: { panel: 'panel-midi' } }) } });
    setTimeout(() => { ok(calls === c1, 'mở tab khác -> không dò'); console.log(p + ' PASS / ' + f + ' FAIL (MÔ PHỎNG)'); process.exit(f ? 1 : 0); }, 20); }, 20);
}, 20);
