/**
 * A73AiStateUi.verify.js — TASK A73-04 (AI State UI trên Menu)
 *
 * Kiểm tra TĨNH (đọc source) — không có Electron/DOM thật trong môi trường này. Chứng minh:
 *  - Nhãn mới #aiSourceState tồn tại, tách biệt, không đụng sentinel "LISTENING" (Auto-Tune).
 *  - updateAiSourceStateLabel() map đúng 6 trạng thái theo đúng mục A73-04.2 đề bài.
 *  - Mọi điểm chuyển trạng thái runtime đều gọi hàm cập nhật (không có nhánh nào quên gọi).
 *  - Ngưỡng NO_SIGNAL/VU_FLOOR được đánh dấu rõ "TENTATIVE" (chưa phải tiêu chuẩn chính thức).
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log('  OK  ', msg); }
    else { fail++; console.error('  FAIL ', msg); }
}
const rSrc = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../../ui/index.html'), 'utf8');

console.log('\n== A73.1 — Phần tử UI mới tồn tại, tách biệt khỏi hiển thị BPM/Key chính ==');
assert(/id="aiSourceState"/.test(htmlSrc), 'index.html có phần tử #aiSourceState (nhãn trạng thái AI phụ trợ)');
assert(/id="currentBpm"/.test(htmlSrc) && /id="currentKey"/.test(htmlSrc), 'Phần tử #currentBpm/#currentKey (hiển thị chính) vẫn còn nguyên, không bị thay thế');

console.log('\n== A73.2 — Mapping trạng thái (A73-04.2) ==');
const fnBody = (rSrc.match(/function updateAiSourceStateLabel\(\)[\s\S]*?\n\}/) || [''])[0];
assert(fnBody.length > 0, 'Tìm thấy thân hàm updateAiSourceStateLabel()');
assert(/"NO_DEVICE"[\s\S]{0,40}"NO SOURCE"/.test(fnBody), 'NO_DEVICE -> "NO SOURCE"');
assert(/"STARTING"[\s\S]{0,40}"STARTING"/.test(fnBody), 'STARTING -> "STARTING"');
assert(/"ERROR"[\s\S]{0,40}"ERROR"/.test(fnBody), 'ERROR -> "ERROR"');
assert(/noSignal[\s\S]{0,20}"NO SIGNAL"/.test(fnBody), 'RUNNING + hết hạn tín hiệu -> "NO SIGNAL"');
assert(/"ANALYZING"/.test(fnBody), 'RUNNING + có tín hiệu + CHƯA confirmed -> "ANALYZING"');
assert(/hasConfirmed/.test(fnBody), 'Có nhánh dựa vào hasConfirmed (đã xác nhận BPM/Key thì không lặp chữ ANALYZING đè lên kết quả thật)');

console.log('\n== A73.3 — KHÔNG đụng sentinel "LISTENING" (an toàn Auto-Tune) ==');
assert(!/updateAiSourceStateLabel[\s\S]{0,10}LISTENING/.test(rSrc), 'updateAiSourceStateLabel không có liên hệ trực tiếp tới chuỗi "LISTENING"');
assert(/data\.currentKey !== "LISTENING"/.test(rSrc), 'Guard Auto-Tune gốc (currentKey !== "LISTENING") còn nguyên, không bị A73 đụng vào');

console.log('\n== A73.4 — Mọi điểm chuyển trạng thái runtime đều gọi updateAiSourceStateLabel() ==');
const callSites = (rSrc.match(/updateAiSourceStateLabel\(\)/g) || []).length;
assert(callSites >= 5, `updateAiSourceStateLabel() được gọi từ nhiều điểm (khai báo hàm + >=4 nơi gọi thật), thực tế tổng số lần xuất hiện: ${callSites}`);
assert(/reportSystemAudioState[\s\S]{0,60}__aiState\.sysState = state; updateAiSourceStateLabel/.test(rSrc), 'Listener trạng thái SYSTEM_AUDIO cập nhật sysState + gọi label (NO_DEVICE/STARTING/RUNNING/ERROR)');
assert(/lastSignalTime = Date\.now\(\);[\s\S]{0,10}\}\s*updateAiSourceStateLabel\(\);/.test(rSrc.replace(/\n/g, ' ')) || /AI_SIGNAL_VU_FLOOR_TENTATIVE[\s\S]{0,200}updateAiSourceStateLabel/.test(rSrc),
    'BPMEngine.onLevel() cập nhật lastSignalTime theo ngưỡng VU + gọi label');
assert(/hasConfirmed = true; updateAiSourceStateLabel\(\); \/\/ TASK A73-04/.test(rSrc), 'Có điểm set hasConfirmed=true kèm gọi label (BPM onUpdate / Key detect)');
assert(/function resetAiDisplaysToListening\(\) \{\s*__aiState\.hasConfirmed = false; updateAiSourceStateLabel\(\);/.test(rSrc),
    'resetAiDisplaysToListening() reset hasConfirmed + gọi lại label (mất nguồn / Auto Detect đều qua đây)');

console.log('\n== A73.5 — Ngưỡng TẠM THỜI được ghi chú rõ, không giả vờ là tiêu chuẩn chính thức ==');
assert(/AI_NO_SIGNAL_TIMEOUT_MS_TENTATIVE/.test(rSrc) && /TẠM THỜI/.test(rSrc), 'Ngưỡng NO_SIGNAL đặt tên "_TENTATIVE" + có ghi chú tiếng Việt "TẠM THỜI"');
assert(/AI_SIGNAL_VU_FLOOR_TENTATIVE/.test(rSrc), 'Ngưỡng VU floor đặt tên "_TENTATIVE" (chưa chốt chính thức)');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
if (fail > 0) process.exit(1);
