/**
 * midi_diag.js — MIDI-RECOVERY-01 (CHỈ ĐỌC + mở thử cổng, KHÔNG gửi bất kỳ Note/CC nào, KHÔNG sửa file nào)
 *
 * Mục đích: tách nguyên nhân "Internal RtMidi error" khi mở MIDI Input "AUTO MENU AI" bằng cách chạy
 * CÙNG thư viện (easymidi/RtMidi) mà app dùng, ở 2 điều kiện: (A) app Auto Menu AI ĐÃ TẮT, (B) app ĐANG MỞ.
 *
 * Cách chạy (PowerShell, trong thư mục G:\AUTO_MENU_AI):
 *     node tools\algbench\reports\MIDI-RECOVERY-01\midi_diag.js            (tên cổng mặc định "AUTO MENU AI")
 *     node tools\algbench\reports\MIDI-RECOVERY-01\midi_diag.js "Tên khác"
 * Lưu kết quả:  ... > midi_diag_A_app_tat.txt    (rồi chạy lại khi app mở: > midi_diag_B_app_mo.txt)
 */
'use strict';
const port = process.argv[2] || 'AUTO MENU AI';
const out = [];
const say = (s) => { out.push(s); console.log(s); };

say(`midi_diag — ${new Date().toISOString()} — platform=${process.platform} node=${process.version} — cổng thử: "${port}"`);

let easymidi;
try {
    easymidi = require('easymidi');
    say(`[1] require("easymidi"): OK`);
} catch (e) {
    say(`[1] require("easymidi"): LỖI -> ${e.message}`);
    say('Chạy script này trong thư mục dự án (có node_modules).');
    process.exit(1);
}

let outs = [], ins = [];
try { outs = easymidi.getOutputs(); say(`[2] easymidi.getOutputs() = ${JSON.stringify(outs)}`); } catch (e) { say(`[2] getOutputs LỖI -> ${e.message}`); }
try { ins = easymidi.getInputs(); say(`[3] easymidi.getInputs()  = ${JSON.stringify(ins)}`); } catch (e) { say(`[3] getInputs LỖI -> ${e.message}`); }
say(`[4] "${port}" có trong Outputs: ${outs.includes(port)} | có trong Inputs: ${ins.includes(port)}`);

// Thử mở Output rồi đóng ngay (không gửi gì).
let outOpened = null;
try {
    outOpened = new easymidi.Output(port, false);
    say('[5] mở Output: THÀNH CÔNG');
} catch (e) {
    say(`[5] mở Output: LỖI -> "${e.message}"`);
}

// Thử mở Input (khi Output đang giữ mở — giống app) rồi đóng ngay.
let inOpened = null;
try {
    inOpened = new easymidi.Input(port);
    say('[6] mở Input (khi Output vẫn đang mở): THÀNH CÔNG');
} catch (e) {
    say(`[6] mở Input (khi Output vẫn đang mở): LỖI -> "${e.message}"`);
}
try { inOpened && inOpened.close(); } catch { /* bỏ qua */ }
try { outOpened && outOpened.close(); } catch { /* bỏ qua */ }

// Thử lại Input một mình sau khi đã đóng Output — loại trừ "Output và Input tranh nhau".
let inAlone = null;
try {
    inAlone = new easymidi.Input(port);
    say('[7] mở Input một mình (sau khi đóng hết): THÀNH CÔNG');
} catch (e) {
    say(`[7] mở Input một mình (sau khi đóng hết): LỖI -> "${e.message}"`);
}
try { inAlone && inAlone.close(); } catch { /* bỏ qua */ }

say('--- HẾT. Gửi nguyên nội dung các dòng [1]..[7] (cả khi app tắt và khi app mở) ---');
process.exit(0);
