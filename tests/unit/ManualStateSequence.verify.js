/**
 * ManualStateSequence.verify.js — TASK B3-D (Mục G)
 * ---------------------------------------------------------------------------
 * Yêu cầu B3-D Mục G: "Sau mỗi bước phải kiểm tra snapshot THỰC TẾ trong ManualState. Không
 * chỉ kiểm tra source code." Test này chạy chuỗi:
 *
 *   INIT -> Key ON -> Key OFF -> Mod ON -> Mod OFF
 *        -> Key ON + Mod ON -> Key OFF + Mod ON -> Key ON + Mod OFF
 *
 * bằng cách: (1) trích xuất verbatim reportManualStateSnapshot() từ renderer.js thật (không
 * gõ lại tay), (2) nối `window.electronAPI.reportManualState` thẳng vào module
 * core/shared/ManualState.js THẬT (require thật, không mock), (3) sau mỗi bước, đọc
 * ManualState.getManualState() thật để xác nhận — đúng yêu cầu "kiểm tra thực tế", không chỉ
 * đọc code.
 *
 * Trọng tâm: xác nhận Mục B của đề bài — "Key OFF không được làm mất trạng thái Mod" — vì
 * reportManualStateSnapshot() luôn đọc lại CẢ HAI nguồn (keySource.manual.active VÀ
 * isManualOverrideActive()) mỗi lần gọi, nên về mặt thiết kế không thể có domain nào "ghi đè"
 * domain kia — test này xác nhận bằng runtime thật, không chỉ suy luận từ đọc code.
 *
 * Chạy: node tests/unit/ManualStateSequence.verify.js
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
const manualStatePath = path.join(__dirname, '..', '..', 'core', 'shared', 'ManualState.js');
const source = fs.readFileSync(rendererPath, 'utf8');

function extractBlock(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') { depth--; if (depth === 0) return str.slice(openIdx, i + 1); }
    }
    throw new Error('Không tìm thấy dấu đóng khớp.');
}
const fnStart = source.indexOf('function reportManualStateSnapshot');
if (fnStart === -1) throw new Error('Không tìm thấy reportManualStateSnapshot() trong renderer.js.');
const fnBraceIdx = source.indexOf('{', fnStart);
const fnBody = source.slice(fnStart, fnStart + (extractBlock(source, fnBraceIdx).length + (fnBraceIdx - fnStart)));

delete require.cache[require.resolve(manualStatePath)];
const ManualState = require(manualStatePath);

// State "renderer" giả lập — sandbox mutate trực tiếp, giống hệt cách renderer.js thật mutate
// keySource.manual.active và modPowerBtn.classList trước khi gọi reportManualStateSnapshot().
const rendererState = { keyActive: false, modActive: false };
const sandbox = {
    console,
    get keySource() { return { manual: { active: rendererState.keyActive } }; },
    isManualOverrideActive: () => rendererState.modActive,
    window: {
        electronAPI: {
            // Nối THẲNG vào ManualState.js THẬT — không mock, đúng IPC path thu gọn (bỏ qua
            // preload/main vì logic ở đó chỉ là relay thuần, đã audit riêng ở phần D).
            reportManualState: (snapshot) => ManualState.setManualState(snapshot),
        },
    },
};
vm.createContext(sandbox);
vm.runInContext(fnBody, sandbox); // định nghĩa hàm trong sandbox

function step(label, mutate) {
    mutate();
    vm.runInContext('reportManualStateSnapshot();', sandbox);
    const s = ManualState.getManualState();
    console.log(`  -> [${label}] ManualState thật = ${JSON.stringify(s)}`);
    return s;
}

console.log('== B3-D Mục G: chuỗi state đầy đủ, kiểm tra ManualState THẬT sau mỗi bước ==');

assert(ManualState.getManualState() === null, 'TRƯỚC INIT: null (đúng Mục F)');

{
    const s = step('INIT', () => {}); // gọi reportManualStateSnapshot() lần đầu với state mặc định false/false
    assert(s.keyActive === false && s.modActive === false, 'INIT: keyActive=false, modActive=false');
}
{
    const s = step('Key ON', () => { rendererState.keyActive = true; });
    assert(s.keyActive === true && s.modActive === false, 'Key ON: keyActive=true, modActive vẫn false (không bị ảnh hưởng)');
}
{
    const s = step('Key OFF', () => { rendererState.keyActive = false; });
    assert(s.keyActive === false && s.modActive === false, 'Key OFF: keyActive=false, modActive vẫn false');
}
{
    const s = step('Mod ON', () => { rendererState.modActive = true; });
    assert(s.keyActive === false && s.modActive === true, 'Mod ON: modActive=true, keyActive vẫn false (không bị ảnh hưởng)');
}
{
    const s = step('Mod OFF', () => { rendererState.modActive = false; });
    assert(s.keyActive === false && s.modActive === false, 'Mod OFF: modActive=false, keyActive vẫn false');
}
{
    const s = step('Key ON + Mod ON', () => { rendererState.keyActive = true; rendererState.modActive = true; });
    assert(s.keyActive === true && s.modActive === true, 'Key ON + Mod ON: cả 2 đều true');
}
{
    // ĐÂY LÀ CASE TRỌNG TÂM CỦA MỤC B: Key OFF trong khi Mod đang ON -> Mod KHÔNG được mất.
    const s = step('Key OFF (Mod vẫn ON)', () => { rendererState.keyActive = false; });
    assert(s.keyActive === false && s.modActive === true, `*** CASE TRỌNG TÂM MỤC B *** Key OFF KHÔNG làm mất Mod: modActive vẫn true (thực tế: ${JSON.stringify(s)})`);
}
{
    const s = step('Key ON + Mod OFF', () => { rendererState.keyActive = true; rendererState.modActive = false; });
    assert(s.keyActive === true && s.modActive === false, 'Key ON + Mod OFF: đúng tổ hợp ngược lại, không bị hoán đổi field');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
