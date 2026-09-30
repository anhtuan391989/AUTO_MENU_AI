'use strict';
/* TASK B72 (gộp) — CẬP NHẬT TÊN: origin/main hiện dùng triển khai A71 cho SYSTEM_AUDIO (systemAudioSelect/
 * initSystemAudioSection) và B72 thêm MIC Input theo CÙNG mẫu (micSelect/initMicSection) thay cho tên B71 cũ
 * (micInputSelect/initMicInputSection/systemAudioInputSelect/...). Hợp đồng kiểm tra KHÔNG đổi; hành vi thật
 * được kiểm ở tests/unit/B72AudioConfig.verify.js. Đã đối chiếu: 20 FAIL của file này trên origin/main
 * (4dc17cd) là do đổi tên, không phải do mất hợp đồng. */
/**
 * B71SetupDeviceFix.verify.js — TASK B71
 * "SETUP AUDIO DEVICE CONFIGURATION FIX" — verify bằng cách đọc lại source thật
 * (ui/setup.html, ui/js/setup.js, ui/js/audioSource.js, ui/js/appSettings.js, ui/js/renderer.js)
 * + 1 sandbox nhỏ mô phỏng logic dot-audio mới. Không cần Electron/thiết bị thật.
 *
 * Coverage theo đúng checklist 10 mục của đề bài B71:
 *  1. Setup có 2 mục MIC Input / SYSTEM_AUDIO Input độc lập.
 *  2/3. MIC lưu selectedMicDeviceId, SYSTEM_AUDIO lưu selectedSystemAudioDeviceId — 2 key khác nhau.
 *  4. MIC mặc định hoạt động đúng khi chưa chọn (requireExplicitDevice:false không đổi).
 *  5. Chọn None đưa nguồn tương ứng về NO_DEVICE (SYSTEM_AUDIO) / mic mặc định (MIC).
 *  6. Đổi MIC không đụng SYSTEM_AUDIO và ngược lại (2 hàm/2 button/2 key tách biệt).
 *  7. Thiết bị mất kết nối không tự fallback sang nguồn khác (không đổi từ B58/A65/C62).
 *  8. Menu phân biệt trạng thái: dot-audio nay đọc AudioSourceState thật của MIC.
 *  9. BPM/Key chỉ nhận SYSTEM_AUDIO — bindAiEnginesToSystemAudio() không đụng __micSource.
 *  10. Test hồi quy audio/persistence/reconnect (chạy ở cuối, tách riêng — xem B71-REPORT.md).
 *
 * Chạy: node tests/unit/B71SetupDeviceFix.verify.js
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
const setupHtml = fs.readFileSync(path.join(ROOT, 'ui/setup.html'), 'utf8');
const setupSrc = fs.readFileSync(path.join(ROOT, 'ui/js/setup.js'), 'utf8');
const audioSourceSrc = fs.readFileSync(path.join(ROOT, 'ui/js/audioSource.js'), 'utf8');
const appSettingsSrc = fs.readFileSync(path.join(ROOT, 'ui/js/appSettings.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');

// Trích thân hàm theo cặp ngoặc {} thật (regex non-greedy cắt sai khi hàm có khối lồng nhau / không liền kề).
function extractFnBody(src, re) {
    const m = re.exec(src); if (!m) return null;
    let i = src.indexOf('{', m.index), d = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') d++;
        else if (src[j] === '}' && --d === 0) return [src.slice(m.index, j + 1), src.slice(i + 1, j)];
    }
    return null;
}
console.log('== Test 1 (Checklist #1): Setup có 2 mục MIC Input / SYSTEM_AUDIO Input độc lập ==');
assert(setupHtml.includes('id="micSelect"'), 'setup.html: có <select id="micSelect">');
assert(setupHtml.includes('id="systemAudioSelect"'), 'setup.html: có <select id="systemAudioSelect">');
assert(setupHtml.includes('id="btnSelectMic"'), 'setup.html: có nút "Chọn MIC Input"');
assert(setupHtml.includes('id="btnSelectSystemAudio"'), 'setup.html: có nút "Chọn SYSTEM_AUDIO Input"');
assert(setupHtml.includes('id="soundcardSelect"') && setupHtml.includes('id="btnSelectSoundcard"'),
    'setup.html: card "Audio Interface" cũ (selectedSoundcardId) VẪN CÒN NGUYÊN, không bị xoá');
assert(/function initMicSection\(\)/.test(setupSrc), 'setup.js: có initMicSection()');
assert(/function initSystemAudioSection\(\)/.test(setupSrc), 'setup.js: có initSystemAudioSection()');
assert(/initMicSection\(\);/.test(setupSrc) && /initSystemAudioSection\(\);/.test(setupSrc),
    'setup.js: cả 2 hàm init đều được GỌI trong luồng khởi tạo (không chỉ định nghĩa suông)');

console.log('\n== Test 2/3 (Checklist #2,#3,#6): MIC và SYSTEM_AUDIO ghi 2 key khác nhau, không lẫn nhau ==');
const micSectionMatch = extractFnBody(setupSrc, /function initMicSection\(\) \{/);
assert(!!micSectionMatch, 'Tìm thấy toàn bộ thân initMicSection()');
if (micSectionMatch) {
    const body = micSectionMatch[1];
    assert(/saveSetting\("selectedMicDeviceId"/.test(body), 'initMicSection() ghi "selectedMicDeviceId"');
    assert(!/selectedSystemAudioDeviceId/.test(body), 'initMicSection() KHÔNG đụng "selectedSystemAudioDeviceId"');
    assert(!/selectedSoundcardId/.test(body), 'initMicSection() KHÔNG dùng "selectedSoundcardId" làm fallback (đúng Mục A đề bài)');
}
const sysSectionMatch = extractFnBody(setupSrc, /function initSystemAudioSection\(\) \{/);
assert(!!sysSectionMatch, 'Tìm thấy toàn bộ thân initSystemAudioSection()');
if (sysSectionMatch) {
    const body = sysSectionMatch[1];
    assert(/saveSetting\("selectedSystemAudioDeviceId"/.test(body), 'initSystemAudioSection() ghi "selectedSystemAudioDeviceId"');
    assert(!/selectedMicDeviceId/.test(body), 'initSystemAudioSection() KHÔNG đụng "selectedMicDeviceId"');
    assert(!/selectedSoundcardId/.test(body), 'initSystemAudioSection() KHÔNG dùng "selectedSoundcardId" làm fallback (đúng Mục A đề bài)');
}
assert(/getSetting\("selectedMicDeviceId"/.test(audioSourceSrc), 'audioSource.js: createMicSource() (getMicDeviceId) đọc đúng "selectedMicDeviceId"');
assert(/getSetting\("selectedSystemAudioDeviceId"/.test(audioSourceSrc), 'audioSource.js: createSystemAudioSource() (getSystemAudioDeviceId) đọc đúng "selectedSystemAudioDeviceId"');
assert(/selectedMicDeviceId: ""/.test(appSettingsSrc) && /selectedSystemAudioDeviceId: ""/.test(appSettingsSrc),
    'appSettings.js: cả 2 key đều có default "" (persistence roundtrip không bị undefined)');

console.log('\n== Test 4/5 (Checklist #4,#5): None -> đúng hành vi (MIC mặc định hệ thống / SYSTEM_AUDIO NO_DEVICE) ==');
const createMicMatch = audioSourceSrc.match(/function createMicSource\(\) \{([\s\S]*?)\n    \}/);
assert(!!createMicMatch && /requireExplicitDevice:\s*false/.test(createMicMatch[0]),
    'createMicSource(): vẫn requireExplicitDevice:false (None/rỗng -> dùng mic mặc định hệ thống, KHÔNG đổi từ B58)');
const createSysMatch = audioSourceSrc.match(/function createSystemAudioSource\(\) \{([\s\S]*?)\n    \}/);
assert(!!createSysMatch && /requireExplicitDevice:\s*true/.test(createSysMatch[0]),
    'createSystemAudioSource(): vẫn requireExplicitDevice:true (None/rỗng -> NO_DEVICE, KHÔNG đổi từ B58/A65)');
assert(/— None \/ Dùng mic mặc định hệ thống —/.test(setupHtml),
    'setup.html: option "None" của MIC Input diễn giải đúng ý nghĩa (mic mặc định hệ thống)');
assert(/— None \/ Chưa chọn thiết bị —/.test(setupHtml),
    'setup.html: option "None" của SYSTEM_AUDIO Input diễn giải đúng ý nghĩa (NO_DEVICE)');

console.log('\n== Test 7 (Checklist #7): Không fallback sang nguồn khác khi mất thiết bị (không đổi hành vi cũ) ==');
assert(!/state\s*=\s*AudioSourceState\.NO_DEVICE.*fallback/i.test(audioSourceSrc),
    'audioSource.js: không có đoạn code nào tự fallback sang nguồn khác khi NO_DEVICE/ERROR');
assert(createSysMatch && /autoReconnect:\s*true/.test(createSysMatch[0]),
    'createSystemAudioSource(): vẫn autoReconnect:true — tự thử lại CHÍNH thiết bị đã chọn (C62), không phải fallback sang thiết bị khác');

console.log('\n== Test 8 (Checklist #8): dot-audio trên Menu đọc AudioSourceState thật của MIC ==');
// TASK B72 (gộp) — logic dot-audio nằm ở updateAudioInterfaceDot() (checkAllSystems()/updateMainStatus() đều gọi hàm này).
const checkAllSystemsFn = extractFnBody(rendererSrc, /async function checkAllSystems\(\) \{/);
assert(!!checkAllSystemsFn && /updateAudioInterfaceDot\(\)/.test(checkAllSystemsFn[1]), 'checkAllSystems() gọi updateAudioInterfaceDot()');
const dotFn = extractFnBody(rendererSrc, /function updateAudioInterfaceDot\(\) \{/);
assert(!!dotFn && /__micSource\?\.getState\?\.\(\)/.test(dotFn[1]), 'updateAudioInterfaceDot() đọc __micSource.getState() (AudioSourceState thật)');
assert(!!dotFn && /AudioSourceState\.RUNNING/.test(dotFn[1]) && /AudioSourceState\.STARTING/.test(dotFn[1]),
    'updateAudioInterfaceDot() phân biệt RUNNING (online) và STARTING (pending), không chỉ 1 mức online/offline');
assert(/__micSource\.onStateChange\(\(state\) => \{[\s\S]{0,300}checkAllSystems\(\)/.test(rendererSrc),
    'startMicAndMasterVu(): __micSource.onStateChange() gọi lại checkAllSystems() -> dot-audio cập nhật NGAY khi mic đổi trạng thái thật');

console.log('\n== Test 8b: bpmValue phân biệt "chưa cấu hình" (NO_DEVICE) và "lỗi" (ERROR) ==');
assert(/bpmEl2\.textContent = "Chưa chọn SYSTEM_AUDIO \(Setup\)"/.test(rendererSrc),
    'renderer.js: NO_DEVICE -> text "Chưa chọn SYSTEM_AUDIO (Setup)" (đổi từ "Soundcard" gây nhầm, xem B70-REPORT.md)');
assert(/bpmEl2\.textContent = "Lỗi thiết bị SYSTEM_AUDIO"/.test(rendererSrc),
    'renderer.js: ERROR -> text RIÊNG "Lỗi thiết bị SYSTEM_AUDIO" (trước B71 im lặng, không phân biệt được với NO_DEVICE)');

console.log('\n== Test 9 (Checklist #9): BPM/Key CHỈ nhận SYSTEM_AUDIO, không nhận MIC (không đổi, xác nhận lại) ==');
const bindFnMatch = rendererSrc.match(/function bindAiEnginesToSystemAudio\([\s\S]*?\n\}/);
assert(!!bindFnMatch, 'Tìm thấy bindAiEnginesToSystemAudio() trong renderer.js');
if (bindFnMatch) {
    assert(!/__micSource/.test(bindFnMatch[0]), 'bindAiEnginesToSystemAudio() không hề tham chiếu __micSource ở bất kỳ đâu trong thân hàm');
}
assert(!/getMicDeviceId/.test(fs.readFileSync(path.join(ROOT, 'ui/js/engines/bpmEngine.js'), 'utf8')),
    'bpmEngine.js: không hề biết tới getMicDeviceId/MIC (thuật toán BPM không đổi, đúng Mục E đề bài)');

console.log('\n== Test — MIC reconnect khi Setup đổi thiết bị (giống cơ chế C62 đã có cho SYSTEM_AUDIO) ==');
assert(/getMicDeviceId,(\s|\S)*?\/\/ TASK B71/.test(audioSourceSrc) || /getMicDeviceId,/.test(audioSourceSrc),
    'audioSource.js: export AudioSource.getMicDeviceId (để renderer.js đọc "1 nguồn sự thật")');
assert(/__lastKnownMicDeviceId/.test(rendererSrc), 'renderer.js: có biến theo dõi __lastKnownMicDeviceId (giống __lastKnownSystemAudioDeviceId của C62)');
const onSetupChangedMatch = rendererSrc.match(/window\.electronAPI\?\.onSetupChanged\?\.\(\(\) => \{([\s\S]*?)\n\}\);/);
assert(!!onSetupChangedMatch, 'Tìm thấy handler onSetupChanged() trong renderer.js');
if (onSetupChangedMatch) {
    const body = onSetupChangedMatch[0];
    assert(/AudioSource\.getMicDeviceId\(\)/.test(body), 'onSetupChanged(): có đọc AudioSource.getMicDeviceId()');
    assert(/__micSource\.stop\(\);[\s\S]{0,80}__micSource\.start\(\)/.test(body),
        'onSetupChanged(): gọi __micSource.stop() rồi start() lại khi deviceId đổi (đúng cơ chế reconnect hiện có, không tạo cơ chế mới)');
}

console.log('\n== Test — Setup gọi notifySetupChanged() sau khi lưu (để Menu áp dụng ngay, không cần reload) ==');
if (micSectionMatch) assert(/notifySetupChanged\(\)/.test(micSectionMatch[1]), 'initMicSection(): gọi notifySetupChanged() sau khi lưu');
if (sysSectionMatch) assert(/notifySetupChanged\(\)/.test(sysSectionMatch[1]), 'initSystemAudioSection(): gọi notifySetupChanged() sau khi lưu');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
