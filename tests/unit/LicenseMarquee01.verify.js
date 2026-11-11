// LICENSE-MARQUEE-01 — chạy đúng khối mã trong ui/js/renderer.js bằng vm với DOM/electronAPI GIẢ. KHÔNG phải Electron thật.
// Chạy: node tests/unit/LicenseMarquee01.verify.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const a = src.indexOf('/* LICENSE-MARQUEE-01 BEGIN'), b = src.indexOf('/* LICENSE-MARQUEE-01 END */');
ok(a > 0 && b > a, 'renderer.js có khối LICENSE-MARQUEE-01');
const block = src.slice(a, b);
ok(!/innerHTML/.test(block), 'không dùng innerHTML');
const HARD = '✨ Hỗ trợ kỹ thuật: Khói Studio | Thời hạn Key dịch vụ: Vĩnh viễn (Pro Active) | Liên hệ Zalo: 0349.644.194 ✨';
function run(status, lang) {
    const el = { textContent: HARD, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const ctx = { console, setInterval() {}, document: { querySelector: (s) => (s === '.marquee-text' ? el : null) },
        window: { electronAPI: { licenseStatus: () => Promise.resolve(status) }, I18N: { lang }, addEventListener() {} } };
    ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(block, ctx);
    return new Promise((r) => setTimeout(() => r(el), 20));
}
(async () => {
    const exp = new Date(2027, 10, 11).getTime();
    let el = await run({ licensed: true, plan: '1y', planLabel: '1 năm', expiresAt: exp, daysLeft: 365 }, 'vi');
    ok(el.textContent.includes('1 năm, còn 365 ngày (hết hạn 11/11/2027)'), 'gói 1 năm: hiện đúng thời hạn thật (vi)', el.textContent);
    ok(!el.textContent.includes('Vĩnh viễn'), 'gói 1 năm: không còn chữ "Vĩnh viễn"');
    ok(el.textContent.includes('0349.644.194'), 'giữ nguyên số Zalo');
    el = await run({ licensed: true, plan: '1y', planLabel: '1 năm', expiresAt: exp, daysLeft: 365 }, 'en');
    ok(el.textContent.includes('1 year, 365 days left (expires 11/11/2027)'), 'gói 1 năm (en)', el.textContent);
    el = await run({ licensed: true, plan: 'life', planLabel: 'Vĩnh viễn' }, 'vi');
    ok(el.textContent.includes('Thời hạn Key dịch vụ: Vĩnh viễn |'), 'gói Vĩnh viễn: hiện Vĩnh viễn');
    el = await run({ licensed: true, plan: 'life' }, 'en');
    ok(el.textContent.includes('validity: Lifetime |'), 'gói Vĩnh viễn (en)');
    el = await run({ licensed: false, code: 'EXPIRED' }, 'vi');
    ok(el.textContent === HARD, 'không có license hợp lệ: không đụng chữ cũ');
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
