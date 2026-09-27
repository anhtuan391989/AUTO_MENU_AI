'use strict';
/**
 * B70SetupDeviceAudit.verify.js — TASK B70
 * Audit-only test (KHÔNG sửa production code) — xác nhận bằng cách đọc lại source thật các
 * phát hiện trong B70-REPORT.md. Đây là bằng chứng "code-level", KHÔNG phải kiểm chứng phần
 * cứng thật (xem B70-REPORT.md mục E để phân biệt rõ 2 loại).
 *
 * Finding 1 — "selectedMicDeviceId" (key mà AudioSource.createMicSource() thực sự đọc để mở
 *   mic cho MIC VU trên Menu) KHÔNG có bất kỳ nơi nào trong Setup ghi vào — Setup chỉ ghi
 *   "selectedSoundcardId"/"selectedSoundcard" (dropdown "Audio Interface"). Nghĩa là: đổi
 *   "Audio Interface" trong Setup KHÔNG làm đổi thiết bị mic thật mà Menu capture cho MIC VU
 *   (Menu MIC VU luôn dùng mic mặc định hệ điều hành).
 * Finding 2 — Không tồn tại UI/setting nào cho "thiết bị đầu ra" (audiooutput/setSinkId) —
 *   trường "Thiết bị đầu ra" trong bảng đề bài B70 hiện chưa được triển khai ở bất kỳ đâu.
 * Finding 3 — Chỉ báo "Audio Interface" trên Menu (updateMainStatus(): #soundcardName,
 *   dot-audio) chỉ đọc "selectedSoundcard" (tên hiển thị, chuỗi) — KHÔNG kiểm tra AudioSource
 *   nào đang thực sự RUNNING. Đây là nguyên nhân trực tiếp của nghịch lý "Menu hiện tên Audio
 *   Interface nhưng BPM báo Chưa chọn Soundcard (Setup)" nêu trong đề bài B70 — 2 chỉ báo đọc
 *   2 setting hoàn toàn khác nhau (selectedSoundcard vs selectedSystemAudioDeviceId), không
 *   liên quan tới nhau.
 *
 * ĐÃ CẬP NHẬT Ở TASK B71 — Finding 1 (MIC) và Finding 3 (dot-audio Menu) đã được B71 SỬA
 * (xem B71-REPORT.md + tests/unit/B71SetupDeviceFix.verify.js cho bộ test đầy đủ của bản sửa).
 * 3 assertion bên dưới đã lỗi thời so với Finding 1/3 (đúng ở B70, sai ở B71 vì bug đã hết) đã
 * được SỬA LẠI để xác nhận đúng trạng thái MỚI — không để một test "biết là sẽ fail" nằm
 * trong bộ hồi quy. Finding 2 (thiết bị đầu ra) vẫn ĐÚNG NGUYÊN — B71 không triển khai output
 * device (đúng phạm vi đề bài B71 Mục E).
 *
 * Chạy: node tests/unit/B70SetupDeviceAudit.verify.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const ROOT = path.join(__dirname, '..', '..');
const setupSrc = fs.readFileSync(path.join(ROOT, 'ui/js/setup.js'), 'utf8');
const setupHtml = fs.readFileSync(path.join(ROOT, 'ui/setup.html'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');
const audioSourceSrc = fs.readFileSync(path.join(ROOT, 'ui/js/audioSource.js'), 'utf8');
const appSettingsSrc = fs.readFileSync(path.join(ROOT, 'ui/js/appSettings.js'), 'utf8');
const setupVuMeterSrc = fs.readFileSync(path.join(ROOT, 'ui/js/setupVuMeter.js'), 'utf8');

console.log('== Finding 1: "selectedMicDeviceId" không được Setup ghi — MIC VU thật trên Menu không theo Setup ==');
assert(/getSetting\("selectedMicDeviceId"/.test(audioSourceSrc),
    'audioSource.js: createMicSource() (qua getMicDeviceId()) đọc key "selectedMicDeviceId"');
assert(/saveSetting\("selectedMicDeviceId"/.test(setupSrc),
    '[SAU B71] setup.js: NAY ĐÃ CÓ chỗ ghi "selectedMicDeviceId" (initMicInputSection() — Finding 1 đã được B71 sửa)');
assert(!/selectedMicDeviceId/.test(rendererSrc),
    'renderer.js: không có chỗ nào đọc/ghi "selectedMicDeviceId" (Menu cũng không tự bù key này)');
assert(/setSetting\("selectedSoundcardId"|saveSetting\("selectedSoundcardId"/.test(setupSrc),
    'setup.js: dropdown "Audio Interface" chỉ ghi "selectedSoundcardId" (khác key ở trên)');
assert(/getSetting\("selectedSoundcardId"\)/.test(setupVuMeterSrc),
    'setupVuMeter.js (VU test NỘI BỘ trong Setup) đọc "selectedSoundcardId" — khác hẳn nguồn mic thật của Menu (Finding 1 xác nhận 2 nơi dùng 2 key khác nhau)');

console.log('\n== Finding 2: Không có UI/setting nào cho "thiết bị đầu ra" (audiooutput) ==');
['ui/js/setup.js', 'ui/setup.html', 'ui/js/renderer.js', 'ui/js/appSettings.js', 'ui/js/audioSource.js'].forEach((rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert(!/audiooutput|setSinkId/i.test(src), `${rel}: không có "audiooutput"/"setSinkId" nào (chưa triển khai chọn thiết bị đầu ra)`);
});

console.log('\n== Finding 3: Chỉ báo "Audio Interface" trên Menu chỉ đọc tên hiển thị, không kiểm tra AudioSource thật ==');
const mainStatusMatch = rendererSrc.match(/function updateMainStatus\(\) \{([\s\S]*?)\n\}/);
assert(!!mainStatusMatch, 'Tìm thấy updateMainStatus() trong renderer.js');
if (mainStatusMatch) {
    const body = mainStatusMatch[1];
    assert(/getSetting\?\.\("selectedSoundcard", ""\)/.test(body),
        'updateMainStatus() đọc "selectedSoundcard" (chuỗi tên hiển thị, không phải trạng thái AudioSource)');
    assert(!/AudioSourceState\.RUNNING|getState\(\)/.test(body),
        'updateMainStatus() KHÔNG kiểm tra AudioSourceState.RUNNING/getState() nào — chỉ đọc tên đã lưu');
}
const checkAllSystemsMatch = rendererSrc.match(/async function checkAllSystems\(\) \{([\s\S]*?)\n\}/);
assert(!!checkAllSystemsMatch, 'Tìm thấy checkAllSystems() (chấm tròn dot-audio) trong renderer.js');
if (checkAllSystemsMatch) {
    const body = checkAllSystemsMatch[1];
    assert(/__micSource\?\.getState\?\.\(\)/.test(body) && !/getSetting\?\.\("selectedSoundcard"\)/.test(body),
        '[SAU B71] checkAllSystems() (dot-audio) NAY ĐÃ đọc __micSource.getState() thật, không còn chỉ đọc chuỗi "selectedSoundcard" (Finding 3 đã được B71 sửa — xem B71-REPORT.md)');
}
assert(/bpmEl2\.textContent = "Chưa chọn SYSTEM_AUDIO \(Setup\)"/.test(rendererSrc),
    '[SAU B71] renderer.js: text đổi thành "Chưa chọn SYSTEM_AUDIO (Setup)" (bỏ chữ "Soundcard" gây nhầm với card Audio Interface — đúng nguyên nhân Finding 3, B71 đã sửa cách đặt tên)');

console.log('\n== Xác nhận lại (không đổi từ A65): SYSTEM_AUDIO không tự fallback sang MIC/selectedSoundcardId ==');
assert(!/getMicDeviceId\(\)/.test(fs.readFileSync(path.join(ROOT, 'ui/js/audioSource.js'), 'utf8').match(/function getSystemAudioDeviceId\(\)[\s\S]*?\n    \}/)?.[0] || ''),
    'audioSource.js: getSystemAudioDeviceId() vẫn không hề gọi getMicDeviceId() ở bất kỳ đâu trong thân hàm (không fallback sang MIC)');
assert(/function getSystemAudioDeviceId\(\)[\s\S]{0,120}selectedSystemAudioDeviceId/.test(audioSourceSrc),
    'audioSource.js: getSystemAudioDeviceId() đọc đúng "selectedSystemAudioDeviceId", không lẫn với selectedSoundcardId');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
