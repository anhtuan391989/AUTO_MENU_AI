/**
 * SetupHardeningA78.verify.js — Task A78: chống ghi đè Settings giữa 2 cửa sổ, Restore/Backup/Preset, file hỏng.
 * Chạy: node tests/unit/SetupHardeningA78.verify.js
 * Mức bằng chứng: MÔ PHỎNG (vm + electronAPI giả, "file" là biến bộ nhớ; riêng mục 8 dùng file thật trên đĩa tạm).
 * KHÔNG phải runtime Electron/Windows. Mỗi "cửa sổ" có sandbox + appSettings RIÊNG, dùng chung 1 file giả.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const appSrc = fs.readFileSync(path.join(root, 'ui/js/appSettings.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(root, 'ui/js/setup.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
function extractFn(src, name) {
    const s = src.indexOf(`function ${name}(`); if (s < 0) throw new Error(name);
    let i = src.indexOf('{', src.indexOf(')', s)), d = 0;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    return src.slice(s, i + 1);
}
function extractConstArr(src, name) { const s = src.indexOf(`const ${name}`); return src.slice(s, src.indexOf('];', s) + 2); }

// shared = { file, readThrows, writeOk, writes }
function newWindow(shared) {
    const w = { alerts: [], notified: 0 };
    const sb = {
        console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {},
        alert: (m) => w.alerts.push(m), confirm: () => true,
        window: { electronAPI: {
            loadSettingsSync: () => { if (shared.readThrows) throw new Error('IPC fail'); return shared.file === undefined ? null : JSON.parse(JSON.stringify(shared.file)); },
            saveSettingsSync: (d) => { shared.writes++; if (!shared.writeOk) return false; shared.file = JSON.parse(JSON.stringify(d)); return true; },
            notifySetupChanged: () => { w.notified++; },
            exportBackup: async (d) => { w.exported = JSON.parse(JSON.stringify(d)); return 'x.json'; },
            importBackup: async () => shared.importData
        } }
    };
    sb.window.window = sb.window; vm.createContext(sb);
    const bits = [extractFn(setupSrc, 'saveSetting'), extractFn(setupSrc, 'notifySetupChanged'), extractConstArr(setupSrc, 'PRESET_FIELDS'),
        extractFn(setupSrc, 'savePreset'), extractFn(setupSrc, 'loadPreset'), 'function updateSetupStatus(){} function updateSetupProgress(){}'].join('\n');
    vm.runInContext(appSrc + '\n' + bits, sb);
    vm.runInContext('loadSetup()', sb);
    w.run = (c) => vm.runInContext(c, sb);
    return w;
}
const mk = (file) => ({ file, readThrows: false, writeOk: true, writes: 0 });

console.log('== 1. Menu & Setup có appSettings RIÊNG; Menu đổi sau, Setup lưu sau KHÔNG đè ==');
{
    const sh = mk({ selectedDAW: 'Cubase', autoMenuData: { knobs: [{ id: 'musicKnob', value: 10 }] } });
    const menu = newWindow(sh), setup = newWindow(sh);
    ok(menu.run('appSettings') !== setup.run('appSettings'), 'hai cửa sổ có đối tượng appSettings độc lập');
    menu.run('appSettings.autoMenuData = {knobs:[{id:"musicKnob",value:77}]}; saveSetup()');
    setup.run('setSetting("selectedBrowser","Brave")');
    ok(sh.file.autoMenuData.knobs[0].value === 77, 'knob=77 do Menu lưu KHÔNG bị Setup (state cũ) đè');
    ok(sh.file.selectedBrowser === 'Brave' && sh.file.selectedDAW === 'Cubase', 'thay đổi của Setup + dữ liệu cũ đều còn');
    // Menu lưu trực tiếp (saveSetup không qua setSetting) khi Setup đã đổi trước
    setup.run('setSetting("selectedAutoKey","AK")');
    menu.run('appSettings.autoMenuData = {knobs:[{id:"musicKnob",value:55}]}; saveSetup()');
    ok(sh.file.selectedAutoKey === 'AK' && sh.file.autoMenuData.knobs[0].value === 55, 'Menu lưu sau Setup cũng không làm mất selectedAutoKey của Setup');
}

console.log('== 2. Người dùng chủ động đặt lại đúng giá trị baseline vẫn thắng giá trị cửa sổ khác ==');
{
    const sh = mk({ selectedDAW: 'X' }); const a = newWindow(sh), b = newWindow(sh);
    b.run('setSetting("selectedDAW","Y")');
    a.run('setSetting("selectedDAW","X")'); // a chủ động chọn X (baseline của a cũng là X)
    ok(sh.file.selectedDAW === 'X', 'setSetting ép key chủ động đổi');
}

console.log('== 3. KHÔNG đọc được Settings mới nhất -> KHÔNG ghi, trả false ==');
{
    const sh = mk({ selectedDAW: 'Cubase' }); const w = newWindow(sh);
    sh.readThrows = true; const before = sh.writes;
    ok(w.run('setSetting("selectedDAW","Z")') === false, 'setSetting trả false');
    ok(sh.writes === before && sh.file.selectedDAW === 'Cubase', 'không có lần ghi nào, file giữ nguyên');
    w.run('savePreset()'); ok(/Không đọc được/.test(w.alerts.pop()) && sh.writes === before, 'savePreset dừng, không ghi');
    w.run('loadPreset()'); ok(/Không đọc được/.test(w.alerts.pop()) && sh.writes === before, 'loadPreset dừng, không ghi');
}

console.log('== 4. Ghi thất bại: trả false, bộ nhớ/baseline không lệch, lần lưu sau vẫn đúng ==');
{
    const sh = mk({ selectedDAW: 'A' }); const w = newWindow(sh);
    sh.writeOk = false; ok(w.run('setSetting("selectedDAW","B")') === false, 'trả false khi ghi lỗi');
    sh.writeOk = true; w.run('setSetting("selectedBrowser","Brave")');
    ok(sh.file.selectedBrowser === 'Brave', 'lần lưu sau thành công');
}

const restoreBody = setupSrc.slice(setupSrc.indexOf('const data = await window.electronAPI.importBackup();'), setupSrc.indexOf('location.reload();'));
// Chạy ĐÚNG đoạn mã Restore thật của setup.js (bỏ location.reload) trong cửa sổ w.
const runRestore = (w, sh, data) => { sh.importData = data; return w.run('(async()=>{ ' + restoreBody + ' })()'); };

(async () => {
    console.log('== 5. Restore: hợp lệ / sai kiểu / ghi lỗi / không đọc được / không đè dữ liệu mới hơn ==');
    {
        const sh = mk({ selectedDAW: 'Old', selectedBrowser: 'Brave' }); const w = newWindow(sh);
        sh.file.selectedBrowser = 'Edge'; // đổi mới hơn ở cửa sổ khác, w chưa biết
        await runRestore(w, sh, { selectedDAW: 'FromBackup' });
        ok(sh.file.selectedDAW === 'FromBackup', 'Restore hợp lệ áp trường có trong backup');
        ok(sh.file.selectedBrowser === 'Edge', 'Restore KHÔNG ghi mất thay đổi mới hơn (selectedBrowser=Edge)');
        ok(w.notified === 1, 'báo Menu nạp lại sau khi lưu thành công');

        for (const [bad, name] of [[[], 'mảng'], ['str', 'chuỗi'], [42, 'số'], [true, 'boolean']]) {
            const s2 = mk({ selectedDAW: 'Keep' }); const w2 = newWindow(s2);
            await runRestore(w2, s2, bad);
            ok(/không hợp lệ/.test(w2.alerts.pop() || '') && s2.file.selectedDAW === 'Keep' && s2.writes === 0, 'backup kiểu ' + name + ' bị từ chối, không ghi');
        }
        const s3 = mk({ selectedDAW: 'Keep' }); const w3 = newWindow(s3);
        await runRestore(w3, s3, null);
        ok(w3.alerts.length === 0 && s3.writes === 0, 'importBackup trả null (huỷ/JSON sai cú pháp đã bị main.js chặn) -> không làm gì, không ghi');

        const s4 = mk({ selectedDAW: 'Old' }); const w4 = newWindow(s4); s4.writeOk = false;
        await runRestore(w4, s4, { selectedDAW: 'New' });
        ok(/thất bại/.test(w4.alerts.pop()) && w4.run('appSettings.selectedDAW') === 'Old' && w4.notified === 0, 'ghi lỗi -> báo thất bại, rollback đúng trạng thái trước, KHÔNG notify/reload');

        const s5 = mk({ selectedDAW: 'Old' }); const w5 = newWindow(s5); s5.readThrows = true;
        await runRestore(w5, s5, { selectedDAW: 'New' });
        ok(/Không đọc được/.test(w5.alerts.pop()) && s5.file.selectedDAW === 'Old' && s5.writes === 0, 'không đọc được bản mới nhất -> Restore dừng, không ghi');
    }

    console.log('== 6. Backup chứa bản MỚI NHẤT, không phải state cũ của cửa sổ ==');
    {
        const sh = mk({ selectedDAW: 'A' }); const w = newWindow(sh);
        sh.file.selectedDAW = 'Newer';
        const body = setupSrc.slice(setupSrc.indexOf('// TASK A78: backup phải chứa'), setupSrc.indexOf('if (path) alert("Đã backup vào'));
        await w.run('(async()=>{ ' + body + ' })()');
        ok(w.exported && w.exported.selectedDAW === 'Newer', 'file backup có selectedDAW=Newer');
        const sh2 = mk({}); const w2 = newWindow(sh2); sh2.readThrows = true;
        await w2.run('(async()=>{ ' + body + ' })()');
        ok(!w2.exported && /Không đọc được/.test(w2.alerts.pop()), 'không đọc được -> không tạo backup lệch');
    }

    console.log('== 7. Preset: false, 0, trường thiếu, không đè cửa sổ khác ==');
    {
        const sh = mk({ launchDAW: true, selectedSoundcardId: 'dev9', selectedDAW: 'Keep', autoMenuPreset: { launchDAW: false, selectedSoundcardId: 0, selectedDAW: '' } });
        const w = newWindow(sh);
        w.run('loadPreset()');
        ok(sh.file.launchDAW === false, 'false được áp');
        ok(sh.file.selectedSoundcardId === 0, '0 được áp (không bị coi là rỗng)');
        ok(sh.file.selectedDAW === 'Keep', 'trường rỗng/thiếu không xoá giá trị hiện hành');
        const sh2 = mk({ selectedDAW: 'A', autoMenuPreset: { selectedDAW: 'B' } }); const a = newWindow(sh2), b = newWindow(sh2);
        b.run('setSetting("selectedBrowser","Brave")'); // cửa sổ khác lưu sau khi a đã nạp
        a.run('loadPreset()');
        ok(sh2.file.selectedDAW === 'B' && sh2.file.selectedBrowser === 'Brave', 'Load Preset không làm mất Settings cửa sổ khác lưu trước đó');
        const sh3 = mk({ selectedDAW: 'A' }); const c = newWindow(sh3), d = newWindow(sh3);
        d.run('setSetting("selectedBrowser","Edge")');
        c.run('savePreset()');
        ok(sh3.file.selectedBrowser === 'Edge' && sh3.file.autoMenuPreset.selectedBrowser === 'Edge', 'Save Preset thấy + giữ Settings mới nhất');
        const sh4 = mk({ selectedDAW: 'A', autoMenuPreset: { selectedDAW: 'A' } }); const e = newWindow(sh4); e.run('loadPreset()');
        ok(/không có gì thay đổi/.test(e.alerts.pop()), 'thông báo "không có thay đổi" đúng khi trùng');
    }

    console.log('== 8. File settings hỏng (file thật trên đĩa tạm, mã readSettingsFile thật) ==');
    {
        const code = extractFn(mainSrc, 'readSettingsFile');
        const cases = [['JSON sai cú pháp', '{broken'], ['mảng', '[1,2]'], ['chuỗi', '"x"'], ['null', 'null'], ['số', '7']];
        for (const [name, content] of cases) {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a78-')); const f = path.join(dir, 'app-settings.json');
            fs.writeFileSync(f, content);
            const sb = { console: { error() {} }, fs, SETTINGS_FILE: f }; vm.createContext(sb); vm.runInContext(code, sb);
            let threw = false, r; try { r = sb.readSettingsFile(); r = sb.readSettingsFile(); r = sb.readSettingsFile(); } catch { threw = true; }
            const copies = fs.readdirSync(dir).filter((n) => n.startsWith('app-settings.json.corrupt-'));
            ok(!threw && r === null, name + ': trả null, không throw');
            ok(copies.length === 1 && fs.readFileSync(path.join(dir, copies[0]), 'utf8') === content, name + ': đúng 1 bản .corrupt-* giống hệt gốc dù đọc 3 lần');
            ok(fs.readFileSync(f, 'utf8') === content, name + ': file gốc KHÔNG bị sửa/xoá khi đọc (không tự ghi đè)');
        }
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a78-')); const f = path.join(dir, 'app-settings.json');
        const sb = { console: { error() {} }, fs, SETTINGS_FILE: f }; vm.createContext(sb); vm.runInContext(code, sb);
        ok(sb.readSettingsFile() === null && fs.readdirSync(dir).length === 0, 'file chưa tồn tại: null, không tạo bản .corrupt');
        fs.writeFileSync(f, '{"a":1}'); ok(sb.readSettingsFile().a === 1 && fs.readdirSync(dir).length === 1, 'file hợp lệ: đọc đúng, không tạo bản sao');
        // thư mục không ghi được/ lỗi sao lưu không làm app lỗi
        const sb2 = { console: { error() {} }, fs: { existsSync: () => true, readFileSync: () => '{bad', readdirSync: () => { throw new Error('EACCES'); }, writeFileSync: () => { throw new Error('EACCES'); } }, SETTINGS_FILE: path.join(os.tmpdir(), 'x.json') };
        vm.createContext(sb2); vm.runInContext(code, sb2);
        let t2 = false, r2; try { r2 = sb2.readSettingsFile(); } catch { t2 = true; }
        ok(!t2 && r2 === null, 'sao lưu thất bại (EACCES) -> vẫn trả null, KHÔNG làm app lỗi/không khởi động');
    }

    console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
