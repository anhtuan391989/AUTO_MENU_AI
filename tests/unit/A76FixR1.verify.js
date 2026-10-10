/** A76FixR1.verify.js — A76-FIX-R1: readiness SYSTEM_AUDIO + dọn VU/AI khi STOP. Static + chạy thật appSettings. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../ui/js', f), 'utf8');
const app = rd('appSettings.js'), setup = rd('setup.js'), rend = rd('renderer.js');

function extractFn(src, name) {
    const st = src.indexOf(`function ${name}(`); let i = src.indexOf('{', st), d = 0;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    return src.slice(st, i + 1);
}
function sandbox(store) {
    const s = { getSetting: (k, f) => (store[k] != null && store[k] !== '' ? store[k] : f), getCoordinate: () => '1,1', __soundcardAvailabilityHint: null, __browserPathAvailabilityHint: null };
    vm.createContext(s);
    vm.runInContext(['let __systemAudioAvailabilityHint = null;', extractFn(app, 'setSystemAudioAvailabilityHint'), extractFn(app, 'getSetupReadinessChecklist')].join('\n'), s);
    return s;
}
const sysReady = (s) => s.getSetupReadinessChecklist().find((x) => x.key === 'selectedSystemAudioDeviceId').ready;

console.log('\n== R1-05 readiness SYSTEM_AUDIO ==');
ok(sysReady(sandbox({})) === false, 'chưa chọn => NOT READY');
let s = sandbox({ selectedSystemAudioDeviceId: 'dev1' });
ok(sysReady(s) === true, 'đã lưu, chưa biết hint => READY (hành vi cũ)');
s.setSystemAudioAvailabilityHint(true); ok(sysReady(s) === true, 'đã lưu + còn thiết bị => READY');
s.setSystemAudioAvailabilityHint(false); ok(sysReady(s) === false, 'đã lưu nhưng thiết bị biến mất => NOT READY');
s.setSystemAudioAvailabilityHint(null); ok(sysReady(s) === true, 'hint reset (None/chưa biết) không tự khoá');
ok(!sandbox({ selectedAudioOutputDeviceId: 'o', selectedMicDeviceId: 'm' }).getSetupReadinessChecklist().some((x) => /Output|Mic/.test(x.key)), 'Output/MIC không thành mục bắt buộc');

console.log('\n== R1-05 setup.js báo hint + cập nhật tiến độ ==');
const sysInit = extractFn(setup, 'initSystemAudioSection');
ok(/setSystemAudioAvailabilityHint/.test(sysInit) && /updateSetupProgress/.test(sysInit), 'initSystemAudioSection gọi hint + updateSetupProgress');
ok(!/selectedSoundcardId|selectedMicDeviceId|selectedAudioOutputDeviceId/.test(sysInit), 'SYSTEM_AUDIO không chạm key của route khác');

console.log('\n== R1-04 dọn VU/AI khi nguồn dừng ==');
ok(/state !== AudioSourceState\.RUNNING\)\s*\{\s*const micMeter[\s\S]{0,120}width = "0%"/.test(rend), 'MIC VU về 0 khi MIC không RUNNING');
ok(/state === AudioSourceState\.NO_DEVICE\)\s*\{\s*setSystemAudioVuNoData\(true\);[\s\S]{0,400}ModEngine\.stop\(\);[\s\S]{0,60}resetAiDisplaysToListening/.test(rend), 'SYSTEM_AUDIO NO_DEVICE => dừng BPM/Key/Mod + reset hiển thị');
ok(/data\.currentKey !== "LISTENING"/.test(rend), 'Guard Auto-Tune "LISTENING" còn nguyên');
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
