'use strict';
/**
 * B70SetupDeviceAudit.verify.js — TASK B70 (audit gốc) — ĐÃ CẬP NHẬT qua B71/A71/B72
 *
 * File này ban đầu (B70) là 1 bài audit-only ghi lại 3 "Finding" (bug) trong code TẠI THỜI
 * ĐIỂM ĐÓ. Cả 3 đã được sửa qua các task sau (B71/A71 cho SYSTEM_AUDIO, B72 cho MIC + Audio
 * Output + hợp nhất dot-audio). Giữ file này lại làm HỒI QUY xác nhận 3 bug đó KHÔNG quay lại,
 * thay vì xoá — nhưng nội dung assertion nay kiểm tra "đã sửa" chứ không còn kiểm tra "bug vẫn
 * còn" (một bài test biết-trước-sẽ-fail không có giá trị trong bộ hồi quy).
 * Test hành vi ĐẦY ĐỦ hơn (chạy code thật qua sandbox) nằm ở tests/unit/B72AudioConfig.verify.js.
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const setupSrc = read('ui/js/setup.js');
const setupHtml = read('ui/setup.html');
const rendererSrc = read('ui/js/renderer.js');
const audioSourceSrc = read('ui/js/audioSource.js');
const setupVuMeterSrc = read('ui/js/setupVuMeter.js');

// Trích thân hàm theo cặp ngoặc {} thật (an toàn với khối lồng nhau, không như regex non-greedy).
function extractFnBody(src, re) {
    const m = re.exec(src); if (!m) return null;
    let i = src.indexOf('{', m.index), d = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') d++;
        else if (src[j] === '}' && --d === 0) return src.slice(i + 1, j);
    }
    return null;
}

console.log('== Finding 1 (ĐÃ SỬA — B71): "selectedMicDeviceId" nay CÓ UI ghi trong Setup ==');
assert(/getSetting\("selectedMicDeviceId"/.test(audioSourceSrc),
    'audioSource.js: createMicSource() (qua getMicDeviceId()) đọc key "selectedMicDeviceId" (không đổi từ B58)');
assert(/saveSetting\("selectedMicDeviceId"/.test(setupSrc),
    'setup.js: CÓ chỗ ghi "selectedMicDeviceId" (card "MIC Input" — B71/B72)');
assert(setupHtml.includes('id="micSelect"'),
    'setup.html: có dropdown MIC Input (id="micSelect") độc lập với "Audio Interface" cũ');
assert(/setSetting\("selectedSoundcardId"|saveSetting\("selectedSoundcardId"/.test(setupSrc),
    'setup.js: dropdown "Audio Interface" cũ vẫn CÒN NGUYÊN, vẫn ghi "selectedSoundcardId" (không xoá, không đổi ý nghĩa)');
assert(/getSetting\("selectedSoundcardId"\)/.test(setupVuMeterSrc),
    'setupVuMeter.js (VU test nội bộ Setup) vẫn đọc "selectedSoundcardId" riêng — 2 key vẫn tách biệt, không gộp lại');
assert(!/saveSetting\("selectedMicDeviceId",\s*getSetting\("selectedSoundcardId"/.test(setupSrc),
    'Không có chỗ nào tự động gán selectedMicDeviceId = selectedSoundcardId (không auto-migrate, đúng nguyên tắc B72)');

console.log('\n== Finding 2 (ĐÃ SỬA — B72): Audio Output nay CÓ selector (setSinkId) ==');
assert(/setSinkId/.test(rendererSrc), 'renderer.js: có gọi setSinkId() thật (SoundEffectEngine.setOutputDevice)');
assert(setupHtml.includes('id="outputSelect"'), 'setup.html: có dropdown Audio Output (id="outputSelect")');
assert(/saveSetting\("selectedAudioOutputDeviceId"/.test(setupSrc), 'setup.js: có ghi "selectedAudioOutputDeviceId"');
assert(!/audiooutput|setSinkId/i.test(read('ui/js/audioSource.js')),
    'audioSource.js: KHÔNG đụng gì tới Output (đúng ranh giới kiến trúc — Output là Internal Audio Backend, không phải AudioSource input)');

console.log('\n== Finding 3 (ĐÃ SỬA — B71+B72): dot-audio đọc AudioSourceState thật, 1 nguồn ghi duy nhất ==');
const dotFnBody = extractFnBody(rendererSrc, /function updateAudioInterfaceDot\(\) \{/);
assert(!!dotFnBody, 'Tìm thấy updateAudioInterfaceDot() trong renderer.js');
if (dotFnBody) {
    assert(/__micSource\?\.getState\?\.\(\)/.test(dotFnBody) && !/getSetting\?\.\("selectedSoundcard"\)/.test(dotFnBody),
        'updateAudioInterfaceDot() đọc __micSource.getState() thật, không đọc chuỗi "selectedSoundcard"');
}
const checkAllSystemsBody = extractFnBody(rendererSrc, /async function checkAllSystems\(\) \{/);
const updateMainStatusBody = extractFnBody(rendererSrc, /function updateMainStatus\(\) \{/);
assert(!!checkAllSystemsBody && /updateAudioInterfaceDot\(\)/.test(checkAllSystemsBody),
    'checkAllSystems() gọi updateAudioInterfaceDot() (không tự quyết định dot-audio riêng)');
assert(!!updateMainStatusBody && /updateAudioInterfaceDot\(\)/.test(updateMainStatusBody) &&
    !/^(?!\s*\/\/).*setStatus\(["']dot-audio["'],\s*soundcard/m.test(updateMainStatusBody),
    'updateMainStatus() CŨNG gọi updateAudioInterfaceDot() — không còn dòng CODE cũ ghi đè (bug 2-nơi-ghi-đè đã sửa ở B72; chỉ còn nhắc trong comment giải thích)');
assert(/bpmEl2\.textContent = "Chưa chọn SYSTEM_AUDIO \(Setup\)"/.test(rendererSrc),
    'renderer.js: text đổi thành "Chưa chọn SYSTEM_AUDIO (Setup)" (bỏ chữ "Soundcard" gây nhầm với card Audio Interface)');

console.log('\n== Xác nhận lại (không đổi từ A65): SYSTEM_AUDIO không tự fallback sang MIC/selectedSoundcardId ==');
const getSysBody = extractFnBody(audioSourceSrc, /function getSystemAudioDeviceId\(\) \{/);
assert(!!getSysBody && !/getMicDeviceId\(\)/.test(getSysBody), 'getSystemAudioDeviceId() không hề gọi getMicDeviceId() (không fallback sang MIC)');
assert(!!getSysBody && /selectedSystemAudioDeviceId/.test(getSysBody), 'getSystemAudioDeviceId() đọc đúng "selectedSystemAudioDeviceId", không lẫn với selectedSoundcardId');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
