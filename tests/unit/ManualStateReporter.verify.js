/**
 * ManualStateReporter.verify.js — TASK B3-C
 * ---------------------------------------------------------------------------
 * ui/js/renderer.js không load an toàn trong Node (DOM top-level, xem ModDualTarget.verify.js
 * cho lý do đầy đủ). Test này gồm 2 phần:
 *
 * A. Trích xuất verbatim function `reportManualStateSnapshot()` (bằng string ops trên chính
 *    file thật) và chạy nó trong sandbox với keySource/isManualOverrideActive/window giả lập
 *    — xác nhận nó đọc ĐÚNG 2 nguồn (keySource.manual.active, isManualOverrideActive()) và
 *    gửi đúng shape {keyActive, modActive, timestamp}.
 * B. Kiểm tra TĨNH (đếm số lần xuất hiện) rằng reportManualStateSnapshot() thực sự được GỌI
 *    tại đúng các điểm chuyển trạng thái thật đã xác định khi audit (không phải suy đoán):
 *    keyActive true (1 chỗ), keyActive false (1 chỗ, trong cancelManualOverride), modActive
 *    true (1 chỗ, trong click ON), modActive false (1 chỗ, trong turnManualOverrideOff), +
 *    1 lần gọi init ngay sau khi định nghĩa hàm.
 *
 * Chạy: node tests/unit/ManualStateReporter.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const rendererPath = path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');

function extractBlock(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') { depth--; if (depth === 0) return str.slice(openIdx, i + 1); }
    }
    throw new Error('Không tìm thấy dấu đóng khớp.');
}

// ---- Phần A: trích xuất verbatim hàm reportManualStateSnapshot() ----
const fnStart = source.indexOf('function reportManualStateSnapshot');
if (fnStart === -1) throw new Error('Không tìm thấy reportManualStateSnapshot() trong renderer.js — đã bị đổi tên/xoá?');
const fnBraceIdx = source.indexOf('{', fnStart);
const fnBody = source.slice(fnStart, fnStart + (extractBlock(source, fnBraceIdx).length + (fnBraceIdx - fnStart)));

console.log('== Phần A: chạy verbatim reportManualStateSnapshot() với keySource/isManualOverrideActive/window giả lập ==');
function runReport({ keyActive, modActive }) {
    const calls = [];
    const sandbox = {
        console,
        keySource: { manual: { active: keyActive } },
        isManualOverrideActive: () => modActive,
        window: { electronAPI: { reportManualState: (snapshot) => calls.push(snapshot) } },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${fnBody}\nreportManualStateSnapshot();`, sandbox);
    return calls;
}

{
    const calls = runReport({ keyActive: true, modActive: false });
    assert(calls.length === 1, `gọi electronAPI.reportManualState() đúng 1 lần (thực tế: ${calls.length})`);
    assert(calls[0].keyActive === true, 'đọc đúng keySource.manual.active -> keyActive=true');
    assert(calls[0].modActive === false, 'đọc đúng isManualOverrideActive() -> modActive=false');
    assert(typeof calls[0].timestamp === 'number', 'có timestamp dạng number');
}
{
    const calls = runReport({ keyActive: false, modActive: true });
    assert(calls[0].keyActive === false && calls[0].modActive === true, 'đảo trạng thái (key=false, mod=true) được đọc đúng, không bị hoán đổi nhầm 2 field');
}
{
    // window.electronAPI không tồn tại (dev/test ngoài Electron) -> KHÔNG throw
    const sandbox = { console, keySource: { manual: { active: false } }, isManualOverrideActive: () => false, window: {} };
    vm.createContext(sandbox);
    let threw = false;
    try { vm.runInContext(`${fnBody}\nreportManualStateSnapshot();`, sandbox); } catch { threw = true; }
    assert(threw === false, 'không throw khi window.electronAPI không tồn tại (an toàn ngoài Electron)');
}

// ---- Phần B: xác nhận TĨNH các call site thật đã được nối đúng chỗ ----
console.log('\n== Phần B: xác nhận reportManualStateSnapshot() được GỌI tại đúng các điểm chuyển trạng thái thật ==');
const callSiteRegex = /reportManualStateSnapshot\(\)/g;
const callCount = (source.match(callSiteRegex) || []).length;
// 1 định nghĩa (không tính là "gọi") + 1 lời gọi trong định nghĩa init ngay sau + 4 điểm chuyển trạng thái thật.
// -> tổng số lần CHUỖI "reportManualStateSnapshot()" xuất hiện trong source (bao gồm cả gọi bên trong
// định nghĩa lẫn defn header "function reportManualStateSnapshot(") phải khớp đúng dự kiến.
const defCount = (source.match(/function reportManualStateSnapshot/g) || []).length;
assert(defCount === 1, `đúng 1 định nghĩa function reportManualStateSnapshot (thực tế: ${defCount})`);

const invocationCount = callCount - defCount; // trừ đi phần khớp trùng với "function reportManualStateSnapshot()" trong khai báo (regex ở trên khớp cả cụm "tên()" bên trong dòng khai báo)
assert(invocationCount === 5, `reportManualStateSnapshot() được GỌI đúng 5 lần trong toàn bộ renderer.js: 1 init + keyActive→true + keyActive→false + modActive→true + modActive→false (thực tế: ${invocationCount}, tổng số khớp regex thô: ${callCount})`);

assert(source.includes('keySource.manual.active = true;\n            reportManualStateSnapshot()'), 'gọi NGAY SAU khi keySource.manual.active = true (đúng điểm Manual Key BẬT thật, sau khi Auto-Tune xác nhận)');
assert(source.includes('if (wasActive) reportManualStateSnapshot();'), 'gọi trong cancelManualOverride() khi Manual Key thực sự vừa TẮT (có guard wasActive, không gọi thừa nếu vốn đã tắt)');
assert(source.includes('modPowerBtn.textContent = "OFF";\n    reportManualStateSnapshot();'), 'gọi trong turnManualOverrideOff() — điểm DUY NHẤT Manual Mod TẮT (dùng chung cho cả click OFF và auto-timeout 5 phút)');

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
