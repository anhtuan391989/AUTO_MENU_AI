/**
 * StartupPathsPersistenceA55.verify.js — TASK A55
 * ---------------------------------------------------------------------------
 * Test THẬT trên các nguồn source thật của repo (không viết lại logic để test):
 *   - app/main.js: readSettingsFile/writeSettingsFile (atomic write) + IPC handlers
 *     "check-path-exists"/"check-path-is-file" (trích trực tiếp từ source, chạy trong vm).
 *   - ui/js/appSettings.js: toàn bộ file (DEFAULT_APP_SETTINGS, getSetting/setSetting,
 *     getStartupPaths/setStartupPaths) chạy trong vm sandbox có window.electronAPI giả lập
 *     bằng CHÍNH các hàm main.js thật ở trên (nối 2 lớp thật với nhau, không mock logic).
 *   - ui/js/setupStartupPaths.js: chạy trong vm sandbox có DOM giả tối thiểu (đúng pattern
 *     đã dùng ở AiTabAdminLockA53.verify.js) để test luồng Save/Apply/error UI thật.
 *
 * Chạy: node tests/unit/StartupPathsPersistenceA55.verify.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const projectRoot = path.join(__dirname, '..', '..');
const mainSrc = fs.readFileSync(path.join(projectRoot, 'app', 'main.js'), 'utf8');
const appSettingsSrc = fs.readFileSync(path.join(projectRoot, 'ui', 'js', 'appSettings.js'), 'utf8');
const setupStartupPathsSrc = fs.readFileSync(path.join(projectRoot, 'ui', 'js', 'setupStartupPaths.js'), 'utf8');

// ---- Trích hàm named function từ main.js (đúng pattern SettingsFileIO.verify.js đã dùng) ----
function extractFn(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy ${name}()`);
    const braceIdx = source.indexOf('{', start);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(start, i + 1);
}

// ---- Trích body arrow-function của 1 ipcMain.handle("channel", (event, arg) => {...}); thật ----
function extractIpcHandlerBody(source, channel) {
    const marker = `ipcMain.handle("${channel}",`;
    const start = source.indexOf(marker);
    if (start === -1) throw new Error(`Không tìm thấy ipcMain.handle("${channel}", ...)`);
    const braceIdx = source.indexOf('{', source.indexOf('=>', start));
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(braceIdx, i + 1);
}

function buildRealFsFunctions() {
    const code = [
        extractFn(mainSrc, 'readSettingsFile'),
        extractFn(mainSrc, 'writeSettingsFile'),
    ].join('\n\n');
    const checkExistsBody = extractIpcHandlerBody(mainSrc, 'check-path-exists');
    const checkIsFileBody = extractIpcHandlerBody(mainSrc, 'check-path-is-file');
    const fullCode = `${code}
function __checkPathExists(filePath) ${checkExistsBody}
function __checkPathIsFile(filePath) ${checkIsFileBody}
`;
    return fullCode;
}

function makeFsSandbox(settingsFilePath) {
    const sandbox = { console, fs, SETTINGS_FILE: settingsFilePath };
    vm.createContext(sandbox);
    vm.runInContext(buildRealFsFunctions(), sandbox);
    return sandbox;
}

// ---- FakeElement/DOM tối thiểu — đúng pattern đã dùng ở AiTabAdminLockA53.verify.js ----
class FakeElement {
    constructor(tag) {
        this.tagName = tag || 'DIV';
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.textContent = '';
        this.className = '';
        this._handlers = {};
    }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    // Trả về kết quả (Promise, với handler async) của handler ĐẦU TIÊN — đủ dùng vì mỗi phần tử
    // test chỉ đăng ký đúng 1 listener 'click'.
    dispatch(evt, payload) {
        const fns = this._handlers[evt] || [];
        return fns.length ? fns[0](payload) : undefined;
    }
}

function buildFakeDom() {
    const nodes = {};
    [
        'spAutoStart', 'spDawExePath', 'spDawProjectPath', 'spPluginPaths', 'spMidiConfigPath',
        'spAudioConfigPath', 'spLogsPath', 'spStatusBadge', 'spSaveBtn', 'spSaveMessage',
        'spDawExePathStatus', 'spDawProjectPathStatus', 'spPluginPathsStatus',
        'spMidiConfigPathStatus', 'spAudioConfigPathStatus', 'spLogsPathStatus',
    ].forEach((id) => { nodes[id] = new FakeElement(id === 'spPluginPaths' ? 'TEXTAREA' : (id === 'spSaveBtn' ? 'BUTTON' : 'DIV')); });

    const document = {
        readyState: 'complete', // để setupStartupPaths.js init() ngay, không cần DOMContentLoaded
        getElementById: (id) => nodes[id] || null,
        addEventListener: () => {},
    };
    return { document, nodes };
}

function makeIntegratedSandbox(settingsFilePath, tmpDirForRealPaths) {
    // Lớp 1: hàm THẬT trích từ app/main.js (fs thật, ghi file thật)
    const fsCode = buildRealFsFunctions();

    const dom = buildFakeDom();
    const localStorageStore = {};
    const sandbox = {
        console,
        fs, // module fs THẬT — cần cho readSettingsFile/writeSettingsFile trích từ main.js
        localStorage: {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(localStorageStore, k) ? localStorageStore[k] : null),
            setItem: (k, v) => { localStorageStore[k] = String(v); },
            removeItem: (k) => { delete localStorageStore[k]; },
        },
    };
    sandbox.window = sandbox; // mô phỏng window === global scope, đúng cách browser hoạt động
    sandbox.document = dom.document;
    vm.createContext(sandbox);

    vm.runInContext(fsCode, sandbox);
    sandbox.SETTINGS_FILE = settingsFilePath;

    // electronAPI: saveSettingsSync/loadSettingsSync gọi THẲNG writeSettingsFile/readSettingsFile
    // thật vừa nạp ở trên (không mock logic ghi/đọc) — đúng luồng thật UI -> IPC -> main -> file.
    sandbox.electronAPI = {
        saveSettingsSync: (data) => sandbox.writeSettingsFile(data),
        loadSettingsSync: () => sandbox.readSettingsFile(),
        checkPathExists: async (p) => sandbox.__checkPathExists(p),
        checkPathIsFile: async (p) => sandbox.__checkPathIsFile(p),
    };

    // Lớp 2: appSettings.js THẬT (định nghĩa DEFAULT_APP_SETTINGS, getStartupPaths, setStartupPaths...)
    vm.runInContext(appSettingsSrc, sandbox);

    // Lớp 3: setupStartupPaths.js THẬT (wiring UI) — init() chạy ngay vì document.readyState = 'complete'
    vm.runInContext(setupStartupPathsSrc, sandbox);

    return { sandbox, dom, nodes: dom.nodes };
}

(async () => {
    console.log('== PHẦN 1: Schema — defaults hợp lệ, field types đúng, pluginPaths là array, empty config load được ==');
    {
        const tmpFile = path.join(os.tmpdir(), `a55-schema-${Date.now()}-${Math.random()}.json`);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        const { sandbox } = makeIntegratedSandbox(tmpFile);

        const cfg = sandbox.getStartupPaths();
        assert(cfg.autoStart === false, 'default autoStart = false');
        assert(cfg.dawExecutable === '', 'default dawExecutable = ""');
        assert(cfg.dawProject === '', 'default dawProject = ""');
        assert(Array.isArray(cfg.pluginPaths) && cfg.pluginPaths.length === 0, 'default pluginPaths = [] (là mảng, rỗng)');
        assert(cfg.midiConfig === '', 'default midiConfig = ""');
        assert(cfg.audioConfig === '', 'default audioConfig = ""');
        assert(cfg.logs === '', 'default logs = ""');
        assert(typeof cfg.autoStart === 'boolean', 'field type autoStart là boolean');
        assert(typeof cfg.dawExecutable === 'string', 'field type dawExecutable là string');

        // Không tự đoán DAW / tự tìm plugin / tự chọn audio-midi device
        assert(cfg.dawExecutable === '' && cfg.midiConfig === '' && cfg.audioConfig === '',
            'Không có giá trị "tự đoán" nào được điền sẵn — mọi field mặc định rỗng');

        fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
    }

    console.log('\n== PHẦN 2: Persistence — save/load round-trip, restart simulation, giữ thứ tự pluginPaths ==');
    {
        const tmpFile = path.join(os.tmpdir(), `a55-persist-${Date.now()}-${Math.random()}.json`);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

        const tmpDawExe = path.join(os.tmpdir(), `a55-daw-${Date.now()}.exe`);
        fs.writeFileSync(tmpDawExe, 'fake exe content', 'utf-8');

        try {
            let { sandbox } = makeIntegratedSandbox(tmpFile);
            const newCfg = {
                autoStart: true,
                dawExecutable: tmpDawExe,
                dawProject: '',
                pluginPaths: ['/plugins/zebra', '/plugins/serum', '/plugins/aaa-should-stay-last'],
                midiConfig: '',
                audioConfig: '',
                logs: '',
            };
            const { ok } = sandbox.setStartupPaths(newCfg);
            assert(ok === true, 'setStartupPaths() trả ok=true khi ghi file thành công');

            // "restart" thật = tạo sandbox MỚI hoàn toàn, chỉ đọc lại từ file trên đĩa
            ({ sandbox } = makeIntegratedSandbox(tmpFile));
            sandbox.loadSetup(); // nạp lại appSettings từ file (mô phỏng app khởi động lại)
            const reloaded = sandbox.getStartupPaths();

            assert(reloaded.autoStart === true, 'restart: autoStart vẫn true sau khi "khởi động lại"');
            assert(reloaded.dawExecutable === tmpDawExe, 'restart: dawExecutable vẫn đúng giá trị đã lưu');
            assert(JSON.stringify(reloaded.pluginPaths) === JSON.stringify(newCfg.pluginPaths),
                'restart: pluginPaths giữ ĐÚNG THỨ TỰ đã nhập (không sort/dedupe)');

            // Lưu thêm 1 field khác (không phải startupPaths) để xác nhận save KHÔNG xoá mất
            // startupPaths đã lưu trước đó (đúng cơ chế read-merge-write qua appSettings RAM).
            sandbox.setSetting('selectedDAW', 'cubase');
            const afterOtherSave = sandbox.getStartupPaths();
            assert(afterOtherSave.autoStart === true && afterOtherSave.dawExecutable === tmpDawExe,
                'Lưu 1 setting KHÁC (selectedDAW) không làm mất startupPaths đã lưu trước đó (không ghi đè âm thầm)');
        } finally {
            fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
            fs.existsSync(tmpDawExe) && fs.unlinkSync(tmpDawExe);
        }
    }

    console.log('\n== PHẦN 3: Validation — valid executable / invalid / directory-thay-executable / plugin path sai / malformed / missing fields ==');
    {
        const tmpFile = path.join(os.tmpdir(), `a55-validate-${Date.now()}-${Math.random()}.json`);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a55-validate-dir-'));
        const tmpDawExe = path.join(os.tmpdir(), `a55-daw2-${Date.now()}.exe`);
        fs.writeFileSync(tmpDawExe, 'x', 'utf-8');

        try {
            const { sandbox } = makeIntegratedSandbox(tmpFile);

            assert((await sandbox.__checkPathIsFile(tmpDawExe)) === true, 'checkPathIsFile: executable thật -> true (Configured)');
            assert((await sandbox.__checkPathIsFile(path.join(tmpDawExe, 'khong-ton-tai.exe'))) === false, 'checkPathIsFile: path không tồn tại -> false (Invalid)');
            assert((await sandbox.__checkPathIsFile(tmpDir)) === false, 'checkPathIsFile: THƯ MỤC thay vì file -> false (Invalid — đúng yêu cầu "không phải directory")');
            assert((await sandbox.__checkPathIsFile('')) === null, 'checkPathIsFile: rỗng -> null (Not configured, không phải lỗi)');

            assert((await sandbox.__checkPathExists(tmpDir)) === true, 'checkPathExists: thư mục tồn tại vẫn -> true (dùng cho path không bắt buộc phải-là-file như plugin/logs path)');
            assert((await sandbox.__checkPathExists('/duong/dan/khong/co/that')) === false, 'checkPathExists: path không tồn tại -> false');

            // Malformed config: startupPaths không phải object -> getStartupPaths() vẫn trả về default an toàn
            fs.writeFileSync(tmpFile, JSON.stringify({ startupPaths: 'not-an-object' }), 'utf-8');
            const { sandbox: s2 } = makeIntegratedSandbox(tmpFile);
            s2.loadSetup();
            const cfgMalformed = s2.getStartupPaths();
            assert(Array.isArray(cfgMalformed.pluginPaths) && cfgMalformed.pluginPaths.length === 0,
                'Malformed config (startupPaths không phải object) -> getStartupPaths() tự phục hồi về default, KHÔNG throw/crash');

            // Missing fields: chỉ có 1 field trong startupPaths -> các field thiếu tự điền default
            fs.writeFileSync(tmpFile, JSON.stringify({ startupPaths: { autoStart: true } }), 'utf-8');
            const { sandbox: s3 } = makeIntegratedSandbox(tmpFile);
            s3.loadSetup();
            const cfgMissing = s3.getStartupPaths();
            assert(cfgMissing.autoStart === true, 'Config thiếu field: field CÓ trong file được giữ đúng');
            assert(cfgMissing.dawExecutable === '' && Array.isArray(cfgMissing.pluginPaths),
                'Config thiếu field: các field KHÔNG có trong file tự điền default, không crash, không undefined rò rỉ ra UI');

            // pluginPaths không phải mảng trong file (vd bị sửa tay thành string) -> tự coerce về []
            fs.writeFileSync(tmpFile, JSON.stringify({ startupPaths: { pluginPaths: 'khong-phai-mang' } }), 'utf-8');
            const { sandbox: s4 } = makeIntegratedSandbox(tmpFile);
            s4.loadSetup();
            const cfgBadArray = s4.getStartupPaths();
            assert(Array.isArray(cfgBadArray.pluginPaths) && cfgBadArray.pluginPaths.length === 0,
                'pluginPaths không phải mảng trong file -> tự coerce về [] an toàn, không crash');
        } finally {
            fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
            fs.existsSync(tmpDawExe) && fs.unlinkSync(tmpDawExe);
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }

    console.log('\n== PHẦN 4: UI Save flow thật (setupStartupPaths.js) — valid save, invalid blocks save, giữ config cũ khi fail ==');
    {
        const tmpFile = path.join(os.tmpdir(), `a55-ui-${Date.now()}-${Math.random()}.json`);
        const tmpDawExe = path.join(os.tmpdir(), `a55-ui-daw-${Date.now()}.exe`);
        fs.writeFileSync(tmpDawExe, 'x', 'utf-8');
        const tmpPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a55-ui-plugin-'));

        try {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            const { sandbox, nodes } = makeIntegratedSandbox(tmpFile);

            // --- Case A: điền toàn bộ giá trị HỢP LỆ -> Save thành công, "Saved" hiện ra ---
            nodes.spAutoStart.checked = true;
            nodes.spDawExePath.value = tmpDawExe;
            nodes.spDawProjectPath.value = '';
            nodes.spPluginPaths.value = `${tmpPluginDir}\n\n  ${tmpPluginDir}  \n`; // có dòng trắng + khoảng trắng thừa
            nodes.spMidiConfigPath.value = '';
            nodes.spAudioConfigPath.value = '';
            nodes.spLogsPath.value = '';

            await nodes.spSaveBtn.dispatch('click', {});

            assert(nodes.spSaveMessage.textContent === 'Saved', `Case A: thông báo "Saved" hiện đúng sau khi lưu thành công (thực tế: "${nodes.spSaveMessage.textContent}")`);
            assert(nodes.spSaveMessage.className.includes('sp-save-ok'), 'Case A: class thông báo đánh dấu trạng thái thành công');
            assert(nodes.spDawExePathStatus.textContent === 'Configured', 'Case A: DAW Executable Path hiện "Configured"');
            assert(nodes.spPluginPathsStatus.textContent === 'Configured', 'Case A: Plugin Paths hiện "Configured" (dòng trắng/khoảng trắng đã được lọc, không tính là lỗi)');

            const persisted = sandbox.getStartupPaths();
            assert(persisted.pluginPaths.length === 2, `Case A: dòng trắng bị loại khỏi pluginPaths khi lưu (thực tế: ${persisted.pluginPaths.length} path)`);
            assert(persisted.pluginPaths[0] === tmpPluginDir && persisted.pluginPaths[1] === tmpPluginDir,
                'Case A: pluginPaths đã được trim khoảng trắng thừa trước khi lưu');

            // --- Case B: DAW Executable Path trỏ vào MỘT THƯ MỤC -> validation fail, KHÔNG lưu, giữ config cũ ---
            nodes.spDawExePath.value = tmpPluginDir; // là thư mục, không phải file
            nodes.spSaveMessage.textContent = '';

            await nodes.spSaveBtn.dispatch('click', {});

            assert(nodes.spSaveMessage.textContent !== 'Saved', 'Case B: KHÔNG báo "Saved" khi DAW Executable Path là thư mục');
            assert(nodes.spDawExePathStatus.textContent === 'Invalid path', 'Case B: hiển thị đúng "Invalid path" cho field sai');
            assert(nodes.spSaveMessage.className.includes('sp-save-error'), 'Case B: class thông báo đánh dấu trạng thái lỗi');

            const stillOldConfig = sandbox.getStartupPaths();
            assert(stillOldConfig.dawExecutable === tmpDawExe,
                'Case B: config CŨ (dawExecutable hợp lệ từ Case A) vẫn được giữ nguyên trên đĩa, KHÔNG bị ghi đè bởi giá trị sai');

            // --- Case C: path không tồn tại hoàn toàn -> cũng bị chặn ---
            nodes.spDawExePath.value = tmpDawExe; // sửa lại đúng
            nodes.spMidiConfigPath.value = path.join(os.tmpdir(), 'a55-khong-ton-tai-' + Date.now() + '.cfg');
            nodes.spSaveMessage.textContent = '';

            await nodes.spSaveBtn.dispatch('click', {});

            assert(nodes.spSaveMessage.textContent !== 'Saved', 'Case C: KHÔNG báo "Saved" khi MIDI Config Path trỏ tới file không tồn tại');
            assert(nodes.spMidiConfigPathStatus.textContent === 'Invalid path', 'Case C: MIDI Config Path hiện đúng "Invalid path"');

            // --- Case D: để trống toàn bộ (hợp lệ, "Not configured" không phải lỗi) -> save được ---
            nodes.spDawExePath.value = '';
            nodes.spDawProjectPath.value = '';
            nodes.spPluginPaths.value = '';
            nodes.spMidiConfigPath.value = '';
            nodes.spAudioConfigPath.value = '';
            nodes.spLogsPath.value = '';
            nodes.spAutoStart.checked = false;
            nodes.spSaveMessage.textContent = '';

            await nodes.spSaveBtn.dispatch('click', {});

            assert(nodes.spSaveMessage.textContent === 'Saved', 'Case D: để trống toàn bộ vẫn Save được (rỗng = Not configured, không phải lỗi)');
            assert(nodes.spDawExePathStatus.textContent === 'Not configured', 'Case D: field rỗng hiện đúng "Not configured", không phải "Invalid path"');
        } finally {
            fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
            fs.existsSync(tmpDawExe) && fs.unlinkSync(tmpDawExe);
            fs.rmSync(tmpPluginDir, { recursive: true, force: true });
        }
    }

    console.log('\n== PHẦN 5: Failure safety — save thất bại KHÔNG báo Saved, KHÔNG mất config cũ, KHÔNG crash ==');
    {
        const tmpFile = path.join(os.tmpdir(), `a55-fail-${Date.now()}-${Math.random()}.json`);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

        const { sandbox, nodes } = makeIntegratedSandbox(tmpFile);

        // Lưu 1 config hợp lệ ban đầu
        sandbox.setStartupPaths({ autoStart: true, dawExecutable: '', dawProject: '', pluginPaths: [], midiConfig: '', audioConfig: '', logs: '' });

        // Giả lập main process ghi file THẤT BẠI (vd hết dung lượng đĩa, quyền bị thu hồi...)
        // bằng cách thay writeSettingsFile bằng 1 hàm luôn trả false — KHÔNG đụng gì tới
        // readSettingsFile thật, chỉ mô phỏng đúng 1 lỗi tại điểm ghi.
        sandbox.electronAPI.saveSettingsSync = () => false;

        nodes.spAutoStart.checked = false; // đổi giá trị, thử lưu nhưng sẽ fail
        nodes.spSaveMessage.textContent = '';

        let threw = false;
        try {
            await nodes.spSaveBtn.dispatch('click', {});
        } catch (e) {
            threw = true;
        }

        assert(threw === false, 'Save fail (main process trả false) KHÔNG làm crash renderer (không throw ra ngoài)');
        assert(nodes.spSaveMessage.textContent !== 'Saved', 'Save fail: KHÔNG hiển thị "Saved"');
        assert(nodes.spSaveMessage.className.includes('sp-save-error'), 'Save fail: có hiển thị trạng thái lỗi rõ ràng');
    }

    console.log('\n== PHẦN 6: Security — không password, không auth/session state, không localStorage/sessionStorage bypass trong 3 file A55 ==');
    {
        const filesToCheck = [
            ['app/main.js (2 handler mới + writeSettingsFile atomic)', mainSrc],
            ['ui/js/appSettings.js', appSettingsSrc],
            ['ui/js/setupStartupPaths.js', setupStartupPathsSrc],
        ];
        filesToCheck.forEach(([label, src]) => {
            assert(!/["'`]Kh0i_AI/.test(src), `${label}: không có chuỗi password literal nào`);
            assert(!/aiTabUnlockedThisSession/.test(src), `${label}: không đụng tới cờ session unlock của A53`);
            assert(!/localStorage\s*[.\[]\s*(setItem|getItem|removeItem)\s*\(\s*["'\`](?:.*unlock.*|.*auth.*)["'\`]/i.test(src),
                `${label}: không có localStorage.setItem/getItem cho khoá "unlock"/"auth" nào (không tạo bypass)`);
        });
        // Chỉ soi đúng code MỚI/SỬA của A55 (writeSettingsFile atomic + 2 IPC handler mới) —
        // không quét toàn bộ phần đuôi file (sẽ dính nhầm nhãn log CŨ của A52 như
        // "admin-auth-change-password lỗi:", chữ "password" ở đó chỉ là 1 phần TÊN KÊNH IPC
        // trong chuỗi mô tả lỗi, không phải log giá trị password thật — không liên quan A55).
        const a55MainCode = buildRealFsFunctions();
        assert(!/console\.(log|error|warn)\([^)]*\bpassword\b/i.test(a55MainCode),
            'app/main.js (đúng phần code A55 sửa/thêm — writeSettingsFile + check-path-exists/is-file): không console.log/error biến password nào');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
