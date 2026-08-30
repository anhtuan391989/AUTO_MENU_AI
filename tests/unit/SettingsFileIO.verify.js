/**
 * SettingsFileIO.verify.js — TASK B25.5
 * ---------------------------------------------------------------------------
 * Coverage trước đây CHƯA có: readSettingsFile()/writeSettingsFile() (app/main.js) —
 * điểm cuối THẬT của toàn bộ chuỗi persistence (UI -> appSettings -> IPC -> file JSON
 * dùng chung -> reload) — chưa từng được test bằng file thật trên đĩa, chỉ được test
 * gián tiếp qua "disk giả" (object trong RAM) ở các test khác.
 *
 * Test này ghi/đọc THẬT vào 1 file tạm (os.tmpdir()), KHÔNG đụng tới app-settings.json
 * thật của người dùng, KHÔNG cần require("electron") (2 hàm này chỉ dùng fs/path thuần —
 * app.getPath() chỉ được dùng để TẠO đường dẫn SETTINGS_FILE ở nơi khác trong main.js,
 * không nằm trong 2 hàm này).
 *
 * Chạy: node tests/unit/SettingsFileIO.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function extractFn(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy ${name}()`);
    const braceIdx = source.indexOf('{', start);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(start, i + 1);
}

const mainSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');
const code = [extractFn(mainSrc, 'readSettingsFile'), extractFn(mainSrc, 'writeSettingsFile')].join('\n\n');

function buildSandbox(settingsFilePath) {
    const sandbox = { console, fs, SETTINGS_FILE: settingsFilePath };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

(async () => {
    const tmpFile = path.join(os.tmpdir(), `automenuai-b25-test-${Date.now()}.json`);

    try {
        console.log('== Case 1: File chưa tồn tại -> readSettingsFile() trả về null, KHÔNG throw ==');
        {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            const s = buildSandbox(tmpFile);
            const result = s.readSettingsFile();
            assert(result === null, `trả về null khi file chưa từng được tạo (thực tế: ${JSON.stringify(result)})`);
        }

        console.log('\n== Case 2: writeSettingsFile() ghi thật xuống đĩa -> readSettingsFile() đọc lại ĐÚNG NGUYÊN VẸN ==');
        {
            const s = buildSandbox(tmpFile);
            const data = {
                selectedDAW: 'studio_one',
                selectedSoundcardId: 'dev-XYZ',
                midiOutputPort: 'AUTO MENU AI',
                dawMidiOutMappings: { studio_one: { BEAT_INPUT_VOLUME: { kind: 'cc', number: 7, channel: 0 } } },
                coordinateProfiles: { studio_one: { autokey1: '10,20' } },
            };
            const ok = s.writeSettingsFile(data);
            assert(ok === true, 'writeSettingsFile() trả về true khi ghi thành công');
            assert(fs.existsSync(tmpFile), 'file thật sự được tạo trên đĩa');

            // "reload" — sandbox MỚI (mô phỏng app khởi động lại, đọc lại từ đĩa, không giữ state cũ trong RAM)
            const reloaded = buildSandbox(tmpFile).readSettingsFile();
            assert(JSON.stringify(reloaded) === JSON.stringify(data), 'đọc lại sau "reload" khớp 100% dữ liệu đã ghi (roundtrip thật qua đĩa)');
        }

        console.log('\n== Case 3: File bị hỏng (JSON không hợp lệ) -> readSettingsFile() trả về null, KHÔNG crash ứng dụng ==');
        {
            fs.writeFileSync(tmpFile, '{ this is not valid json !!', 'utf-8');
            const s = buildSandbox(tmpFile);
            let threw = false;
            let result;
            try { result = s.readSettingsFile(); } catch (e) { threw = true; }
            assert(threw === false, 'readSettingsFile() KHÔNG throw khi file JSON bị hỏng (không làm crash app)');
            assert(result === null, `trả về null một cách rõ ràng khi JSON hỏng, không trả về dữ liệu rác (thực tế: ${JSON.stringify(result)})`);
        }

        console.log('\n== Case 4: Ghi đè (setting mới thay setting cũ) -> lần đọc sau PHẢN ÁNH ĐÚNG bản mới nhất, không lẫn dữ liệu cũ ==');
        {
            let s = buildSandbox(tmpFile);
            s.writeSettingsFile({ selectedDAW: 'cubase' });
            s = buildSandbox(tmpFile);
            const after = s.readSettingsFile();
            assert(after.selectedDAW === 'cubase', `bản ghi mới nhất thắng, không còn dữ liệu Case 2 cũ (thực tế: ${JSON.stringify(after)})`);
            assert(after.selectedSoundcardId === undefined, 'ghi đè hoàn toàn (JSON.stringify(data) đầy đủ) — không phải merge âm thầm với file cũ');
        }
    } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
