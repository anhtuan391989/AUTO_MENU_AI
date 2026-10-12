/**
 * SetupCompletionA77.verify.js — Task A: Setup persistence / Preset / Backup truthfulness.
 * Chạy: node tests/unit/SetupCompletionA77.verify.js
 * Mức bằng chứng: chạy mã thật (appSettings.js, setup.js trích hàm) trong vm với electronAPI GIẢ LẬP
 * (file settings giả = biến bộ nhớ). KHÔNG phải runtime Electron/Windows.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };

const appSrc = fs.readFileSync(path.join(root, 'ui/js/appSettings.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(root, 'ui/js/setup.js'), 'utf8');
function extractFn(src, name) {
    const s = src.indexOf(`function ${name}(`); if (s < 0) throw new Error(name);
    let i = src.indexOf('{', src.indexOf(')', s)), d = 0;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    return src.slice(s, i + 1);
}
function extractConstArr(src, name) { const s = src.indexOf(`const ${name}`); return src.slice(s, src.indexOf('];', s) + 2); }

function makeEnv(initialFile, opts = {}) {
    const env = { file: initialFile, alerts: [], writeOk: true, notified: 0 };
    const sandbox = {
        console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: {}, alert: (m) => env.alerts.push(m), confirm: () => true,
        window: {
            electronAPI: {
                loadSettingsSync: () => (env.file === undefined ? null : JSON.parse(JSON.stringify(env.file))),
                saveSettingsSync: (d) => { if (!env.writeOk) return false; env.file = JSON.parse(JSON.stringify(d)); return true; },
                notifySetupChanged: () => { env.notified++; }
            }
        }
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    const setupBits = [
        extractFn(setupSrc, 'saveSetting'), extractFn(setupSrc, 'notifySetupChanged'),
        extractConstArr(setupSrc, 'PRESET_FIELDS'), extractFn(setupSrc, 'savePreset'), extractFn(setupSrc, 'loadPreset'),
        'function updateSetupStatus(){} function updateSetupProgress(){}'
    ].join('\n');
    vm.runInContext(appSrc + '\n' + setupBits + '\nthis.__get=()=>appSettings;', sandbox);
    sandbox.window.loadSettingsSync = null;
    vm.runInContext('loadSetup()', sandbox);
    env.run = (code) => vm.runInContext(code, sandbox);
    env.sb = sandbox;
    return env;
}

console.log('== 1. loadSetup bỏ qua dữ liệu không phải object ==');
{ const e = makeEnv(['bad']); ok(Array.isArray(e.run('appSettings')) === false && e.run('appSettings.launchDAW') === false, 'file chứa mảng -> dùng mặc định, không spread mảng'); }

console.log('== 2. Stale-overwrite: setSetting không ghi đè giá trị mới hơn trong file ==');
{
    const e = makeEnv({ selectedDAW: 'Cubase', autoMenuData: { knobs: [{ id: 'musicKnob', value: 10 }] } });
    // cửa sổ khác (Menu) cập nhật knob trong file sau khi Setup đã nạp
    e.file.autoMenuData = { knobs: [{ id: 'musicKnob', value: 77 }] };
    e.run('setSetting("selectedBrowser","Brave")');
    ok(e.file.selectedBrowser === 'Brave', 'key vừa đổi được lưu');
    ok(e.file.autoMenuData.knobs[0].value === 77, 'giá trị Menu lưu sau đó (knob=77) KHÔNG bị ghi đè bằng bản cũ (10)');
    ok(e.file.selectedDAW === 'Cubase', 'key khác giữ nguyên');
}

console.log('== 3. setSetting trả false khi ghi thất bại ==');
{ const e = makeEnv({}); e.writeOk = false; ok(e.run('setSetting("selectedDAW","X")') === false, 'trả false'); }

console.log('== 4. savePreset: lưu đủ trường + không báo thành công giả ==');
{
    const e = makeEnv({ selectedDAW: 'Studio One', selectedSystemAudioDeviceId: 'sys1', selectedMicDeviceId: 'mic1', midiOutputPort: 'loopMIDI', launchDAW: false });
    e.run('savePreset()');
    ok(e.alerts.pop() === 'Đã lưu Preset', 'ghi OK -> báo Đã lưu');
    const p = e.file.autoMenuPreset;
    ok(p.selectedSystemAudioDeviceId === 'sys1' && p.selectedMicDeviceId === 'mic1' && p.midiOutputPort === 'loopMIDI', 'preset chứa device id + cổng MIDI');
    const e2 = makeEnv({ selectedDAW: 'A' }); e2.writeOk = false; e2.run('savePreset()');
    ok(/thất bại/.test(e2.alerts.pop()), 'ghi lỗi -> báo thất bại, KHÔNG "Đã lưu"');
}

console.log('== 5. loadPreset ==');
{
    const preset = { selectedDAW: 'Cubase', launchDAW: false, selectedBrowser: '', selectedSystemAudioDeviceId: 'sysP' };
    const e = makeEnv({ selectedDAW: 'Studio One', launchDAW: true, selectedBrowser: 'Brave', autoMenuPreset: preset });
    e.run('loadPreset()');
    ok(e.file.selectedDAW === 'Cubase', 'áp selectedDAW');
    ok(e.file.launchDAW === false, 'áp được boolean false (trước đây bị bỏ qua)');
    ok(e.file.selectedBrowser === 'Brave', 'trường rỗng trong preset KHÔNG xoá cấu hình hiện có');
    ok(e.file.selectedSystemAudioDeviceId === 'sysP', 'áp trường mới');
    ok(e.notified === 1, 'báo cho Menu nạp lại');

    const e2 = makeEnv({ selectedDAW: 'Cubase', autoMenuPreset: { selectedDAW: 'Cubase' } }); e2.run('loadPreset()');
    ok(/không có gì thay đổi/.test(e2.alerts.pop()), 'preset trùng -> không báo "đã tải" giả');

    const e3 = makeEnv({ selectedDAW: 'Old', autoMenuPreset: { selectedDAW: 'New' } }); e3.writeOk = false; e3.run('loadPreset()');
    ok(/thất bại/.test(e3.alerts.pop()) && e3.run('appSettings.selectedDAW') === 'Old', 'ghi lỗi -> hoàn tác bộ nhớ + báo thất bại');

    const e4 = makeEnv({ autoMenuPreset: 'junk' }); e4.run('loadPreset()');
    ok(/hỏng/.test(e4.alerts.pop()), 'preset hỏng -> báo lỗi, không crash');
    const e5 = makeEnv({}); e5.run('loadPreset()');
    ok(e5.alerts.pop() === 'Chưa có Preset', 'chưa có preset');
}

console.log('== 6. Preset cũ (10 trường) vẫn nạp được ==');
{
    const old = { selectedDAW: 'Cubase', selectedAutoKey: 'AK', selectedAutoTune: 'AT', selectedBrowser: 'Brave', selectedSoundcard: 'Mix', autokey1: '', autokey2: '', autotunekey: '', chromatic: '', launchDAW: true };
    const e = makeEnv({ autoMenuPreset: old }); e.run('loadPreset()');
    ok(e.file.selectedDAW === 'Cubase' && e.file.launchDAW === true && e.file.selectedSoundcard === 'Mix', 'tương thích ngược');
}

console.log('== 7. readSettingsFile giữ bản sao khi file hỏng ==');
{
    const mainSrc = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
    const code = extractFn(mainSrc, 'readSettingsFile');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a77-')); const f = path.join(dir, 'app-settings.json');
    fs.writeFileSync(f, '{broken'); const sb = { console, fs, SETTINGS_FILE: f }; vm.createContext(sb); vm.runInContext(code, sb);
    ok(sb.readSettingsFile() === null, 'file hỏng -> null, không throw');
    ok(fs.readdirSync(dir).some((n) => n.startsWith('app-settings.json.corrupt-')), 'đã giữ bản sao .corrupt-*');
}

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
