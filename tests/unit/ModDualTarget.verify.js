/**
 * ModDualTarget.verify.js — TASK B3-A / MOD-DUAL-TARGET
 * ---------------------------------------------------------------------------
 * ui/js/renderer.js phụ thuộc nặng vào DOM ở top-level (33+ chỗ truy cập document/window
 * ngay khi file load) — không load an toàn cả file trong Node. Thay vào đó, test này TRÍCH
 * XUẤT NGUYÊN VĂN (bằng string ops trên chính file thật, không gõ lại tay) đúng đoạn
 * `case "SHIFT_KEY":` bên trong `onPluginCommand` handler + hàm `bridgeSemitoneDelta()`, rồi
 * chạy đoạn đó trong 1 sandbox có `sendToneStep`/`sendToneStepToSoundShifter` là SPY.
 *
 * Đây vẫn là LOGIC TEST thật (chạy đúng source code thật đã sửa), không phải test lại logic
 * viết tay riêng — nếu ai sửa nhầm case SHIFT_KEY sau này mà quên gọi cả 2 target, test này
 * sẽ FAIL vì trích xuất lại đúng source hiện tại mỗi lần chạy.
 *
 * Chạy: node tests/unit/ModDualTarget.verify.js
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

// Trích xuất verbatim case "SHIFT_KEY": { ... } — dùng cùng marker text với source thật để
// nếu ai đổi cấu trúc mà không cập nhật test, script FAIL rõ ràng ở đây thay vì im lặng test
// một đoạn code không còn tồn tại.
const caseStart = source.indexOf('case "SHIFT_KEY": {');
if (caseStart === -1) throw new Error('Không tìm thấy case "SHIFT_KEY" trong renderer.js — source đã đổi cấu trúc, cần cập nhật test.');
// Tìm dấu đóng "}" khớp của block này bằng đếm ngoặc (đơn giản, đủ dùng vì block không có
// chuỗi/comment chứa { hoặc } lệch cặp).
function extractBlock(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
            depth--;
            if (depth === 0) return str.slice(openIdx, i + 1);
        }
    }
    throw new Error('Không tìm thấy dấu đóng khớp cho case SHIFT_KEY.');
}
const braceIdx = source.indexOf('{', caseStart + 'case "SHIFT_KEY": '.length);
const caseBlockRaw = extractBlock(source, braceIdx); // "{ ... }"

// Trích xuất verbatim `const notes = [...]` và `const flatToSharp = {...}` — bridgeSemitoneDelta() phụ thuộc 2 biến top-level này.
function extractConstStatement(str, constName) {
    const idx = str.indexOf(`const ${constName} =`);
    if (idx === -1) throw new Error(`Không tìm thấy "const ${constName} =" trong renderer.js.`);
    const semiIdx = str.indexOf(';', idx);
    if (semiIdx === -1) throw new Error(`Không tìm thấy dấu ";" kết thúc "const ${constName}".`);
    return str.slice(idx, semiIdx + 1);
}
const notesDecl = extractConstStatement(source, 'notes');
const flatToSharpDecl = extractConstStatement(source, 'flatToSharp');

// Trích xuất verbatim function bridgeSemitoneDelta(...) { ... }
const fnStart = source.indexOf('function bridgeSemitoneDelta');
if (fnStart === -1) throw new Error('Không tìm thấy bridgeSemitoneDelta() trong renderer.js.');
const fnBraceIdx = source.indexOf('{', fnStart);
const fnBody = source.slice(fnStart, fnStart + (extractBlock(source, fnBraceIdx).length + (fnBraceIdx - fnStart)));

async function runCase({ originalKey, targetKeyName, sendToneStepSpy, sendToneStepSoundShifterSpy }) {
    const sandbox = {
        console,
        originalKey,
        sendToneStep: sendToneStepSpy,
        sendToneStepToSoundShifter: sendToneStepSoundShifterSpy,
        message: { command: 'SHIFT_KEY', value: targetKeyName },
        __result: null,
    };
    vm.createContext(sandbox);
    // Bọc case block thành 1 async IIFE có thể await + throw ra ngoài nếu lỗi thật (không nuốt lỗi).
    const code = `
        ${notesDecl}
        ${flatToSharpDecl}
        ${fnBody}
        (async () => {
            switch (message.command) {
                case "SHIFT_KEY": ${caseBlockRaw}
            }
        })().then(() => { __done = true; }).catch((e) => { __error = e; });
    `;
    sandbox.__done = false;
    sandbox.__error = null;
    if (process.env.DEBUG_MODDUALTEST) {
        console.error('----GENERATED CODE----\n' + code + '\n----END----');
    }
    vm.runInContext(code, sandbox);
    // Chờ microtask (Promise.all bên trong) chạy xong.
    for (let i = 0; i < 50 && !sandbox.__done && !sandbox.__error; i++) {
        await new Promise((r) => setImmediate(r));
    }
    if (sandbox.__error) throw sandbox.__error;
    return sandbox;
}

(async () => {
    console.log('== Case 1: SHIFT_KEY value tương đương +1 bán cung -> cả 2 target nhận delta giống nhau ==');
    {
        const calls = { autotune: [], soundshifter: [] };
        const sendToneStepSpy = async (delta) => { calls.autotune.push(delta); return { ok: true }; };
        const sendToneStepSoundShifterSpy = async (delta) => { calls.soundshifter.push(delta); return { ok: true }; };
        // originalKey = "C Major", target 1 bán cung lên = "C# Major" (dùng đúng cùng cách
        // tách note mà bridgeSemitoneDelta() thật dùng — không tự bịa quy tắc khác).
        await runCase({ originalKey: 'C Major', targetKeyName: 'C# Major', sendToneStepSpy, sendToneStepSoundShifterSpy });
        assert(calls.autotune.length === 1, `sendToneStep gọi đúng 1 lần (thực tế: ${calls.autotune.length})`);
        assert(calls.soundshifter.length === 1, `sendToneStepToSoundShifter gọi đúng 1 lần (thực tế: ${calls.soundshifter.length})`);
        assert(calls.autotune[0] === calls.soundshifter[0], `2 target nhận CÙNG delta (Auto-Tune=${calls.autotune[0]}, SoundShifter=${calls.soundshifter[0]})`);
    }

    console.log('\n== Case 2: SHIFT_KEY xuống 2 bán cung -> delta âm, vẫn đồng bộ 2 target ==');
    {
        const calls = { autotune: [], soundshifter: [] };
        const sendToneStepSpy = async (delta) => { calls.autotune.push(delta); return { ok: true }; };
        const sendToneStepSoundShifterSpy = async (delta) => { calls.soundshifter.push(delta); return { ok: true }; };
        await runCase({ originalKey: 'D Major', targetKeyName: 'C Major', sendToneStepSpy, sendToneStepSoundShifterSpy });
        assert(calls.autotune[0] === calls.soundshifter[0], `delta âm vẫn đồng bộ (Auto-Tune=${calls.autotune[0]}, SoundShifter=${calls.soundshifter[0]})`);
        assert(calls.autotune[0] < 0, `delta thực sự âm khi hạ Key (thực tế: ${calls.autotune[0]})`);
    }

    console.log('\n== Case 3: Auto-Tune lỗi, SoundShifter thành công -> KHÔNG bị bỏ sót lệnh gọi nào, cả 2 vẫn được gọi ==');
    {
        const calls = { autotune: [], soundshifter: [] };
        const sendToneStepSpy = async (delta) => { calls.autotune.push(delta); return { ok: false, detail: 'giả lập lỗi Auto-Tune' }; };
        const sendToneStepSoundShifterSpy = async (delta) => { calls.soundshifter.push(delta); return { ok: true }; };
        await runCase({ originalKey: 'C Major', targetKeyName: 'C# Major', sendToneStepSpy, sendToneStepSoundShifterSpy });
        assert(calls.autotune.length === 1 && calls.soundshifter.length === 1, 'cả 2 target ĐỀU được gọi dù 1 bên lỗi — không có nhánh "gọi xong cái 1 mới quyết định có gọi cái 2 hay không"');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
    console.error('LỖI KHÔNG MONG MUỐN khi chạy test:', err);
    process.exit(1);
});
