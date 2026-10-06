/**
 * A75VuIsolation.verify.js — TASK A75-07 (MUSIC ra khỏi MIC VU)
 * Kiểm tra TĨNH (đọc source) — không có DOM/audio thật trong môi trường này.
 * STATIC PASS ở đây KHÔNG đồng nghĩa HARDWARE MIX VERIFICATION đã xong — xem A75-REPORT.md.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  OK  ', msg); } else { fail++; console.error('  FAIL ', msg); } }
const rSrc = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');

console.log('\n== A75.1 — vu-mic-fill chỉ nhận từ __micSource (createMicSource), KHÔNG từ BPMEngine ==');
const micBlock = (rSrc.match(/__micSource\.onLevel\(\(\{ vuPercent \}\) => \{[\s\S]*?\n        \}\);/) || [''])[0];
assert(micBlock.length > 0, 'Tìm thấy block __micSource.onLevel()');
assert(/vu-mic-fill/.test(micBlock), 'Block này cập nhật đúng #vu-mic-fill');
assert(!/vu-music-fill/.test(micBlock), '#vu-mic-fill KHÔNG bị cập nhật chung với #vu-music-fill trong cùng block');

console.log('\n== A75.2 — vu-music-fill chỉ nhận từ BPMEngine.onLevel (SYSTEM_AUDIO), KHÔNG từ __micSource ==');
const musicBlock = (rSrc.match(/BPMEngine\.onLevel\(\([\s\S]*?\n            \}\);/) || [''])[0];
assert(musicBlock.length > 0, 'Tìm thấy block BPMEngine.onLevel()');
assert(/vu-music-fill/.test(musicBlock), 'Block này cập nhật đúng #vu-music-fill');
assert(!/vu-mic-fill/.test(musicBlock), '#vu-music-fill KHÔNG bị cập nhật chung với #vu-mic-fill trong cùng block');

console.log('\n== A75.3 — __micSource và SYSTEM_AUDIO là 2 object AudioSource độc lập ==');
assert(/__micSource = AudioSource\.createMicSource\(\)/.test(rSrc), '__micSource tạo bằng createMicSource()');
assert(/createSystemAudioSource\(\)/.test(rSrc), 'systemAudio tạo bằng createSystemAudioSource() (riêng biệt)');
assert(/Mic VU — nguồn HOÀN TOÀN riêng, KHÔNG bao giờ nối onFrame\/BPMEngine\/KeyEngine/.test(rSrc),
    'Có comment xác nhận chủ đích tách biệt (không phải tình cờ)');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
if (fail > 0) process.exit(1);
