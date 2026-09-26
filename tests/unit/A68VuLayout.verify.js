'use strict';
/**
 * A68VuLayout.verify.js — TASK A68 (đã cập nhật ở A69 — xem A69-REPORT.md)
 * Verify (không đụng audioSource.js/BPMEngine):
 *  1. CSS: .vu-group là flex row (1 hàng ngang) thay vì stack dọc.
 *  2. renderer.js: hàm setSystemAudioVuNoData() gắn/gỡ đúng class
 *     "vu-bar--nodata" cho Music VU (KHÔNG đụng Mic VU / Master VU).
 * LƯU Ý: các assertion về "vu-beat-fill"/"vu-bar--beat" đã bị GỠ khỏi file này ở TASK A69
 * (Beat VU đã bị xoá khỏi HTML theo đúng yêu cầu A69) — xem tests/unit/A69VuConsolidation.verify.js
 * cho bộ test đầy đủ của A69 (còn đúng 3 VU, thứ tự, MUSIC không lấy tín hiệu MIC, v.v.)
 * Chạy: node tests/unit/A68VuLayout.verify.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const ROOT = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'ui/css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');

console.log('== Test 1: CSS — vu-group là 1 hàng ngang (flex row) ==');
const vuGroupRuleMatch = css.match(/\.vu-group\{([^}]*)\}/);
assert(!!vuGroupRuleMatch, '.vu-group rule tồn tại trong style.css');
if (vuGroupRuleMatch) {
    const body = vuGroupRuleMatch[1];
    assert(/display:\s*flex/.test(body), '.vu-group có display:flex');
    assert(/flex-direction:\s*row/.test(body), '.vu-group có flex-direction:row (1 hàng ngang, không stack dọc)');
}
const vuRowRuleMatch = css.match(/\.vu-row\{([^}]*)\}/);
assert(!!vuRowRuleMatch && /flex:\s*1/.test(vuRowRuleMatch[1]), '.vu-row có flex:1 (chia đều các cột trong 1 hàng)');

console.log('\n== Test 2: HTML — id/class MIC/MUSIC/MASTER vẫn còn (không đổi cấu trúc của 3 VU còn lại) ==');
['id="vuGroup"', 'id="vu-mic-fill"', 'id="vu-music-fill"', 'id="vu-master-fill"',
 'class="vu-bar vu-bar--mic"', 'class="vu-bar vu-bar--music"', 'class="vu-bar vu-bar--master"']
    .forEach((needle) => assert(html.includes(needle), `index.html vẫn còn "${needle}"`));

console.log('\n== Test 3: renderer.js — setSystemAudioVuNoData() chỉ đụng Music, không đụng Mic/Master ==');

// Fake DOM tối thiểu — chỉ đủ cho hàm setSystemAudioVuNoData(), không load toàn bộ renderer.js
// (renderer.js phụ thuộc nhiều global khác như AudioSource/BPMEngine không cần cho test này).
function makeFakeEl() {
    const _classes = new Set();
    return {
        style: { width: '' },
        classList: {
            add(c) { _classes.add(c); },
            remove(c) { _classes.delete(c); },
            contains(c) { return _classes.has(c); }
        }
    };
}
const fakeEls = {
    'vu-music-fill': makeFakeEl(),
    'vu-mic-fill': makeFakeEl(),
    'vu-master-fill': makeFakeEl()
};
const fakeDocument = { getElementById: (id) => fakeEls[id] || null };

const fnMatch = rendererSrc.match(/function setSystemAudioVuNoData\([\s\S]*?\n\}/);
assert(!!fnMatch, 'Tìm thấy hàm setSystemAudioVuNoData() trong renderer.js');
if (fnMatch) {
    const sandbox = { document: fakeDocument };
    vm.createContext(sandbox);
    vm.runInContext(fnMatch[0] + '\nthis.setSystemAudioVuNoData = setSystemAudioVuNoData;', sandbox);

    sandbox.setSystemAudioVuNoData(true);
    assert(fakeEls['vu-music-fill'].classList.contains('vu-bar--nodata'), 'Music VU có class vu-bar--nodata khi isNoData=true');
    assert(fakeEls['vu-music-fill'].style.width === '0%', 'Music VU width về 0% khi isNoData=true');
    assert(!fakeEls['vu-mic-fill'].classList.contains('vu-bar--nodata'), 'Mic VU KHÔNG bị đụng bởi setSystemAudioVuNoData()');
    assert(!fakeEls['vu-master-fill'].classList.contains('vu-bar--nodata'), 'Master VU KHÔNG bị đụng bởi setSystemAudioVuNoData() (đã có logic B58 riêng)');

    sandbox.setSystemAudioVuNoData(false);
    assert(!fakeEls['vu-music-fill'].classList.contains('vu-bar--nodata'), 'Music VU bỏ class vu-bar--nodata khi isNoData=false (RUNNING trở lại)');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
