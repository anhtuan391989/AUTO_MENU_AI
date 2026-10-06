/**
 * A75AutoDetect.verify.js — TASK A75-06 (AUTO DETECT phải reset BPM + KEY + MOD, không chỉ Key)
 * Kiểm tra TĨNH (đọc source) — không có DOM/Electron thật trong môi trường này.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  OK  ', msg); } else { fail++; console.error('  FAIL ', msg); } }
const rSrc = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');

const btnBlock = (rSrc.match(/getElementById\("autoDetectBtn"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?\n\}\);/) || [''])[0];

console.log('\n== A75.1 — Auto Detect handler tồn tại, reset đủ BPM + KEY + MOD ==');
assert(btnBlock.length > 0, 'Tìm thấy handler click #autoDetectBtn');
assert(/resetAiDisplaysToListening\(\)/.test(btnBlock), 'Reset hiển thị (chữ) — không đổi so với trước');
assert(/bindAiEnginesToSystemAudio\(window\.__systemAudioSource\)/.test(btnBlock), 'Gọi lại bindAiEnginesToSystemAudio() -> BPMEngine.stop()+init() VÀ KeyEngine.stop()+init() trên CHÍNH nguồn đang chạy');
assert(/AudioSourceState\.RUNNING/.test(btnBlock), 'Chỉ reset engine khi SYSTEM_AUDIO thực sự đang RUNNING (không gọi bừa khi NO_DEVICE)');
assert(/window\.__keyDetectStopWatcher[\s\S]{0,40}window\.__keyDetectStopWatcher = null/.test(btnBlock), 'Huỷ watcher detectOnce cũ trước khi dò lại (không tạo watcher trùng)');
assert(/ModEngine\.stop\(\)/.test(btnBlock), 'Dừng ModEngine (reset MOD) — ĐÂY LÀ ĐIỂM MỚI của A75-06, trước A75 Auto Detect KHÔNG đụng Mod');
assert(/triggerAiKeyDetect\(\)/.test(btnBlock), 'Dò lại Key (và gián tiếp Mod qua chuỗi detectOnce -> startModulationWatcher có sẵn)');

console.log('\n== A75.2 — KHÔNG tạo AudioContext/MediaStreamSource mới (tái dùng nguồn đang chạy, đúng cấm "SYSTEM_AUDIO capture song song") ==');
assert(!/createSystemAudioSource\(\)/.test(btnBlock), 'Handler Auto Detect KHÔNG tự tạo SYSTEM_AUDIO source mới');
assert(!/getUserMedia/.test(btnBlock), 'Handler Auto Detect KHÔNG tự gọi getUserMedia (không mở lại thiết bị)');

console.log('\n== A75.3 — Không đụng sentinel "LISTENING" hay logic Auto-Tune ==');
assert(/data\.currentKey !== "LISTENING"/.test(rSrc), 'Guard Auto-Tune gốc còn nguyên 100%');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
if (fail > 0) process.exit(1);
