// LICENSE-MARQUEE-02 — chạy khối LICENSE-MARQUEE-01 (đã sửa) bằng vm với DOM/electronAPI GIẢ, kiểm tra
// việc đổi chữ marquee có ép khởi động lại hoạt ảnh CSS hay không (tránh chữ bị "biến mất" cho tới khi
// bấm MỞ RỘNG rồi thu lại mới hiện lại). KHÔNG phải trình duyệt/Electron thật.
// Chạy: node tests/unit/LicenseMarquee02.verify.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const a = src.indexOf('/* LICENSE-MARQUEE-01 BEGIN'), b = src.indexOf('/* LICENSE-MARQUEE-01 END */');
const block = src.slice(a, b);
ok(/style\.animation = "none"/.test(block) && /style\.animation = ""/.test(block), 'có khởi động lại hoạt ảnh CSS sau khi đổi chữ');
ok(/void el\.offsetWidth/.test(block), 'ép reflow trước khi bật lại hoạt ảnh (offsetWidth)');

function run(status, lang) {
    const styleCalls = [];
    const el = {
        textContent: '✨ Hỗ trợ kỹ thuật: Khói Studio | Thời hạn Key dịch vụ: Vĩnh viễn (Pro Active) | Liên hệ Zalo: 0349.644.194 ✨',
        attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
        _animation: '',
        get offsetWidth() { return 100; },
        style: { set animation(v) { styleCalls.push(v); el._animation = v; }, get animation() { return el._animation; } }
    };
    const ctx = { console, setInterval() {}, document: { querySelector: (s) => (s === '.marquee-text' ? el : null) },
        window: { electronAPI: { licenseStatus: () => Promise.resolve(status) }, I18N: { lang }, addEventListener() {} } };
    ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(block, ctx);
    return new Promise((r) => setTimeout(() => r({ el, styleCalls }), 20));
}
(async () => {
    const exp = new Date(2027, 10, 11).getTime();
    const { el, styleCalls } = await run({ licensed: true, plan: '1y', planLabel: '1 năm', expiresAt: exp, daysLeft: 365 }, 'vi');
    ok(el.textContent.includes('1 năm, còn 365 ngày'), 'vẫn đổi đúng chữ như LICENSE-MARQUEE-01', el.textContent);
    ok(styleCalls.length >= 2 && styleCalls[0] === 'none' && styleCalls[styleCalls.length - 1] === '', 'thứ tự: tắt hoạt ảnh ("none") rồi bật lại ("")', styleCalls);

    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
