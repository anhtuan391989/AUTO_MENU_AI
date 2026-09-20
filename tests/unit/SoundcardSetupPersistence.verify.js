/**
 * SoundcardSetupPersistence.verify.js — TASK B25.1
 * ---------------------------------------------------------------------------
 * Coverage trước đây CHƯA có: không có test nào cho vòng đời Soundcard
 * (chọn -> lưu -> reload -> device không còn tồn tại) lẫn quy tắc "không âm thầm
 * fallback sang mic mặc định" ở runtime (ui/js/renderer.js:startAudioMonitor).
 *
 * Test này chạy TRỰC TIẾP code thật trích từ:
 *   - ui/js/setup.js -> populateSoundcardOptions(), updateSoundcardDisplays()
 *   - ui/js/renderer.js -> đoạn guard đầu startAudioMonitor() (từ đầu hàm tới
 *     ngay trước khi tạo AudioContext — phần còn lại thuộc Key/BPM/Mod Engine,
 *     KHÔNG đụng tới vì đó là vùng cấm của A).
 *
 * Không dùng jsdom — dựng fake document/navigator tối giản, đủ để chạy code thật
 * (giữ đúng convention của SettingsPersistenceRoundtrip.verify.js).
 *
 * Chạy: node tests/unit/SoundcardSetupPersistence.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function extractFn(source, name) {
    let start = source.indexOf(`async function ${name}(`);
    if (start === -1) start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy ${name}()`);
    const parenOpen = source.indexOf('(', start);
    let pdepth = 0, j = parenOpen;
    for (; j < source.length; j++) { if (source[j] === '(') pdepth++; else if (source[j] === ')') { pdepth--; if (pdepth === 0) break; } }
    const braceIdx = source.indexOf('{', j);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(start, i + 1);
}

const setupSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'setup.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js'), 'utf8');

/* ---------- Fake DOM tối giản (không jsdom) ---------- */
function makeFakeSelect() {
    let opts = [];
    return {
        get options() { return opts; },
        set innerHTML(v) { opts = []; }, // mô phỏng .innerHTML = '<option .../>' -> clear danh sách cũ
        get innerHTML() { return ''; },
        appendChild(opt) { opts.push(opt); },
        value: '',
    };
}
function makeFakeEl() {
    return { textContent: '', className: '' };
}

function buildSetupSandbox({ devices, permissionDenied = false }) {
    const els = {
        statusSoundcardModal: makeFakeEl(),
        soundcardStatusBadge: makeFakeEl(),
    };
    const sandbox = {
        console,
        document: {
            createElement: () => ({ value: '', textContent: '' }),
            getElementById: (id) => els[id] || null,
        },
        navigator: {
            mediaDevices: {
                getUserMedia: async () => {
                    if (permissionDenied) throw new Error('Permission denied');
                    return { getTracks: () => [{ stop() {} }] };
                },
                enumerateDevices: async () => devices,
            },
        },
        getSetting: null, // gán riêng theo từng case
    };
    vm.createContext(sandbox);
    vm.runInContext(
        [extractFn(setupSrc, 'populateSoundcardOptions'), extractFn(setupSrc, 'updateSoundcardDisplays')].join('\n\n'),
        sandbox
    );
    return { sandbox, els };
}

/* ---------- Persistence roundtrip (dùng chung disk giả với các test khác) ---------- */
function makeDiskFile(initial) {
    let raw = JSON.stringify(initial);
    return { read: () => JSON.parse(raw), write: (obj) => { raw = JSON.stringify(obj); } };
}

(async () => {
    console.log('== Case 1: Chưa từng chọn soundcard -> badge "Chưa chọn", foundInRealList=false ==');
    {
        const devices = [{ deviceId: 'dev-A', label: 'Focusrite 2i2', kind: 'audioinput' }];
        const { sandbox, els } = buildSetupSandbox({ devices });
        sandbox.getSetting = (k) => (k === 'selectedSoundcardId' ? '' : '');
        const select = makeFakeSelect();
        const { foundInRealList } = await sandbox.populateSoundcardOptions(select, '');
        sandbox.updateSoundcardDisplays(foundInRealList);
        assert(foundInRealList === false, 'foundInRealList=false khi chưa chọn gì');
        assert(els.soundcardStatusBadge.textContent.includes('Chưa chọn'), `badge đúng "Chưa chọn" (thực tế: ${els.soundcardStatusBadge.textContent})`);
        assert(els.soundcardStatusBadge.className.includes('warn'), 'badge class = warn khi chưa chọn');
    }

    console.log('\n== Case 2: Đã chọn, device vẫn còn trong danh sách thật -> "Đã chọn Audio Interface" ==');
    {
        const devices = [{ deviceId: 'dev-A', label: 'Focusrite 2i2', kind: 'audioinput' }];
        const { sandbox, els } = buildSetupSandbox({ devices });
        sandbox.getSetting = () => 'dev-A';
        const select = makeFakeSelect();
        const { foundInRealList } = await sandbox.populateSoundcardOptions(select, 'dev-A');
        sandbox.updateSoundcardDisplays(foundInRealList);
        assert(foundInRealList === true, 'foundInRealList=true khi device còn trong danh sách thật');
        assert(select.value === 'dev-A', 'select.value khớp đúng thiết bị đã lưu');
        assert(els.soundcardStatusBadge.textContent.includes('Đã chọn'), `badge = "Đã chọn Audio Interface" (thực tế: ${els.soundcardStatusBadge.textContent})`);
        assert(els.soundcardStatusBadge.className.includes('live'), 'badge class = live khi device hợp lệ');
    }

    console.log('\n== Case 3: Đã chọn trước đó, nhưng device hiện KHÔNG còn trong enumerateDevices() (rút dây) ==');
    {
        // Danh sách thật hiện tại KHÔNG có "dev-OLD" nữa
        const devices = [{ deviceId: 'dev-B', label: 'USB Mic', kind: 'audioinput' }];
        const { sandbox, els } = buildSetupSandbox({ devices });
        sandbox.getSetting = () => 'dev-OLD';
        const select = makeFakeSelect();
        const { foundInRealList } = await sandbox.populateSoundcardOptions(select, 'dev-OLD');
        sandbox.updateSoundcardDisplays(foundInRealList);
        assert(foundInRealList === false, 'foundInRealList=false khi device đã lưu không còn trong danh sách thật');
        assert(select.value === 'dev-OLD', 'setting KHÔNG bị tự xoá — vẫn giữ giá trị đã lưu (không tự fallback)');
        assert(els.soundcardStatusBadge.textContent.includes('không khả dụng'), `badge cảnh báo đúng "không khả dụng" (thực tế: ${els.soundcardStatusBadge.textContent})`);
        assert(els.soundcardStatusBadge.className.includes('warn'), 'badge class = warn khi device không khả dụng (không giả vờ connected)');
    }

    console.log('\n== Case 4: Persistence roundtrip — Setup lưu selectedSoundcardId -> "reload" -> vẫn đúng giá trị ==');
    {
        const disk = makeDiskFile({});
        // "Setup" ghi (mô phỏng saveSetting -> setSetting thật của appSettings.js)
        const d = disk.read();
        d.selectedSoundcard = 'Focusrite 2i2';
        d.selectedSoundcardId = 'dev-A';
        disk.write(d);

        // "reload" — đọc lại như 1 process/renderer mới mở lên
        const reloaded = disk.read();
        assert(reloaded.selectedSoundcardId === 'dev-A', `selectedSoundcardId khôi phục đúng sau reload (thực tế: ${reloaded.selectedSoundcardId})`);
        assert(reloaded.selectedSoundcard === 'Focusrite 2i2', 'selectedSoundcard (tên hiển thị) khôi phục đúng sau reload');
    }

    console.log('\n== Case 5 (runtime, renderer.js) — TASK B58/C62: SYSTEM_AUDIO NO_DEVICE -> KHÔNG đi tiếp tới BPMEngine/KeyEngine ==');
    {
        // TASK B58: startAudioMonitor() không còn tự gọi getUserMedia trực tiếp — việc đó
        // chuyển vào AudioSource.createSystemAudioSource() (ui/js/audioSource.js), đã có test
        // riêng (tests/unit/AudioSourceB58.verify.js Test 2/6: "không rơi về mặc định khi chưa
        // chọn device", "device lost không throw"). Test này xác nhận ĐÚNG phần renderer.js còn
        // giữ: khi AudioSource báo NO_DEVICE, startAudioMonitor() phải DỪNG trước khi gọi
        // BPMEngine.init()/KeyEngine.init() — không đi tiếp với source rỗng.
        //
        // TASK C62 — CẬP NHẬT: startAudioMonitor() không còn gọi trực tiếp BPMEngine.init()/
        // KeyEngine.init() inline nữa (đã tách ra bindAiEnginesToSystemAudio(), chỉ được gọi qua
        // sự kiện systemAudio.onStateChange("RUNNING") — xem C62-CLOSE-VERIFY.md). Vì vậy không
        // cần "cắt" source text ở 1 điểm đánh dấu (// ADAPTER BOUNDARY) như trước nữa — lấy
        // NGUYÊN VẸN cả hàm là đủ để test đúng: miễn là mock AudioSource.createSystemAudioSource()
        // không tự bắn sự kiện onStateChange("RUNNING"), bindAiEnginesToSystemAudio() (không được
        // nạp vào sandbox — xem bên dưới) chắc chắn không có cách nào được gọi.
        const fullFn = extractFn(rendererSrc, 'startAudioMonitor');

        let startCalls = 0;
        const sandbox = {
            console,
            audioMonitorStarted: false,
            setStatus: () => {},
            startMicAndMasterVu: () => {}, // đã có test riêng (AudioSourceB58.verify.js) cho Mic/Master — stub ở đây để cô lập đúng invariant SYSTEM_AUDIO
            document: { getElementById: () => ({ textContent: '' }) },
            AudioSourceState: { NO_DEVICE: 'NO_DEVICE', STARTING: 'STARTING', RUNNING: 'RUNNING', STOPPING: 'STOPPING', ERROR: 'ERROR' },
            AudioSource: {
                getSystemAudioDeviceId: () => '', // TASK C62 — startAudioMonitor() đọc giá trị này để lưu mốc so sánh (Test L)
                createSystemAudioSource: () => ({
                    getState: () => 'NO_DEVICE', // mô phỏng: chưa chọn Soundcard ở Setup
                    start: async () => { startCalls++; },
                    onDeviceLost: () => {},
                    onStateChange: () => {}, // TASK C62 — nhận & bỏ qua callback; KHÔNG BAO GIỜ tự bắn RUNNING (đúng NO_DEVICE)
                }),
            },
            // TASK C62 — KHÔNG nạp source thật của bindAiEnginesToSystemAudio() vào sandbox này —
            // nếu code (do lỗi) lỡ gọi tới nó, ReferenceError sẽ tự làm test FAIL rõ ràng, thay vì
            // cần 1 marker "REACHED_ADAPTER" giả để phát hiện như cách làm cũ.
            window: {},
        };
        vm.createContext(sandbox);
        vm.runInContext(fullFn, sandbox);
        let threw = null;
        try { await sandbox.startAudioMonitor(); } catch (e) { threw = e; }

        assert(startCalls === 1, 'AudioSource.createSystemAudioSource().start() được gọi đúng 1 lần');
        assert(threw === null, 'startAudioMonitor() không throw (nếu code lỡ gọi bindAiEnginesToSystemAudio() — hàm KHÔNG được nạp vào sandbox này — sẽ ném ReferenceError ở đây, tức là code ĐÃ đi tiếp sai khi NO_DEVICE)' + (threw ? ` (lỗi thực tế: ${threw.message})` : ''));
    }

    console.log('\n== Case 6 (runtime, renderer.js) — TASK B58/C62: SYSTEM_AUDIO ERROR (device đã lưu không còn tồn tại) -> KHÔNG đi tiếp, không fallback ==');
    {
        const fullFn = extractFn(rendererSrc, 'startAudioMonitor');

        let startCalls = 0;
        let deviceLostHandlerRegistered = false;
        let stateChangeHandlerRegistered = false;
        const sandbox = {
            console,
            audioMonitorStarted: false,
            setStatus: () => {},
            startMicAndMasterVu: () => {},
            document: { getElementById: () => ({ textContent: '' }) },
            AudioSourceState: { NO_DEVICE: 'NO_DEVICE', STARTING: 'STARTING', RUNNING: 'RUNNING', STOPPING: 'STOPPING', ERROR: 'ERROR' },
            AudioSource: {
                getSystemAudioDeviceId: () => 'dev-OLD-GONE', // TASK C62 — startAudioMonitor() đọc giá trị này để lưu mốc so sánh (Test L)
                createSystemAudioSource: () => ({
                    getState: () => 'ERROR', // mô phỏng: deviceId cũ (dev-OLD-GONE) không còn khả dụng
                    start: async () => { startCalls++; },
                    onDeviceLost: (cb) => { deviceLostHandlerRegistered = true; },
                    onStateChange: (cb) => { stateChangeHandlerRegistered = true; }, // TASK C62 — không tự bắn RUNNING (đúng ERROR)
                }),
            },
            window: {},
        };
        vm.createContext(sandbox);
        vm.runInContext(fullFn, sandbox);
        let threw = null;
        try { await sandbox.startAudioMonitor(); } catch (e) { threw = e; }
        assert(threw === null, 'startAudioMonitor() không throw khi SYSTEM_AUDIO = ERROR' + (threw ? ` (lỗi thực tế: ${threw.message})` : ''));

        assert(startCalls === 1, 'AudioSource.createSystemAudioSource().start() được gọi đúng 1 lần (không tự thử lại TỪ renderer.js — retry thật giờ nằm trong audioSource.js, xem AudioReconnectC62.verify.js)');
        assert(deviceLostHandlerRegistered === true, 'onDeviceLost() được đăng ký để bắt lỗi mất thiết bị giữa chừng');
        assert(stateChangeHandlerRegistered === true, 'TASK C62 — onStateChange() được đăng ký (để tự rebind Key/BPM khi audioSource.js tự reconnect thành công sau này)');
        // TASK C62 — audioMonitorStarted KHÔNG còn bị đặt lại về false trong nhánh NO_DEVICE/ERROR
        // nữa (khác hành vi CŨ trước C62): biến này giờ chỉ còn ý nghĩa "startAudioMonitor() đã
        // được bootstrap" — không còn được dùng để quyết định có cho gọi lại startAudioMonitor()
        // hay không (hàm này vốn chỉ được gọi ĐÚNG 1 LẦN qua listener {once:true}; việc thử lại
        // thật giờ hoàn toàn nằm trong audioSource.js, độc lập với cờ này). Xem C62-CLOSE-VERIFY.md
        // mục ROOT CAUSE/IMPLEMENTATION.
        assert(sandbox.audioMonitorStarted === true, 'audioMonitorStarted giữ nguyên true sau ERROR (TASK C62 — không còn ý nghĩa "cho phép gọi lại", chỉ còn là cờ "đã bootstrap")');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
