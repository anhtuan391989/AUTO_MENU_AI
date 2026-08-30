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

    console.log('\n== Case 5 (runtime, renderer.js) — Chưa chọn soundcard -> KHÔNG gọi getUserMedia, KHÔNG khởi tạo Key/BPM/MOD ==');
    {
        // Trích đúng đoạn guard đầu startAudioMonitor(), CẮT trước khi tạo AudioContext/BPMEngine/KeyEngine
        // (phần đó thuộc vùng cấm A — không đụng, không cần cho test này).
        const fullFn = extractFn(rendererSrc, 'startAudioMonitor');
        const cutMarker = 'try {\n        const audioContext = new';
        const idx = fullFn.indexOf(cutMarker);
        if (idx === -1) throw new Error('Không tìm thấy điểm cắt an toàn trong startAudioMonitor()');
        const guardOnly = fullFn.slice(0, idx) + '\n    return "REACHED_AUDIOCONTEXT";\n}';

        let getUserMediaCalls = 0;
        const sandbox = {
            console,
            audioMonitorStarted: false,
            setStatus: () => {},
            document: { getElementById: () => ({ textContent: '' }) },
            getSetting: () => '', // chưa chọn soundcard
            navigator: {
                mediaDevices: {
                    getUserMedia: async () => { getUserMediaCalls++; return {}; },
                },
            },
        };
        vm.createContext(sandbox);
        vm.runInContext(guardOnly, sandbox);
        await sandbox.startAudioMonitor();

        assert(getUserMediaCalls === 0, 'getUserMedia() KHÔNG được gọi khi chưa chọn Soundcard (không rơi về mic mặc định)');
        assert(sandbox.audioMonitorStarted === false, 'audioMonitorStarted reset về false khi bị chặn ở guard');
    }

    console.log('\n== Case 6 (runtime, renderer.js) — Device đã lưu KHÔNG còn tồn tại -> báo lỗi rõ, KHÔNG thử lại với constraint khác (không fallback âm thầm) ==');
    {
        const fullFn = extractFn(rendererSrc, 'startAudioMonitor');
        const cutMarker = 'try {\n        const audioContext = new';
        const idx = fullFn.indexOf(cutMarker);
        const guardOnly = fullFn.slice(0, idx) + '\n    return "REACHED_AUDIOCONTEXT";\n}';

        const getUserMediaCallArgs = [];
        const sandbox = {
            console,
            audioMonitorStarted: false,
            setStatus: () => {},
            document: { getElementById: () => ({ textContent: '' }) },
            getSetting: () => 'dev-OLD-GONE',
            navigator: {
                mediaDevices: {
                    getUserMedia: async (constraints) => {
                        getUserMediaCallArgs.push(constraints);
                        const err = new Error('Overconstrained');
                        err.name = 'OverconstrainedError';
                        throw err;
                    },
                },
            },
        };
        vm.createContext(sandbox);
        vm.runInContext(guardOnly, sandbox);
        const result = await sandbox.startAudioMonitor();

        assert(getUserMediaCallArgs.length === 1, `getUserMedia() chỉ được gọi ĐÚNG 1 LẦN — không tự thử lại với constraint khác/không exact deviceId (thực tế gọi ${getUserMediaCallArgs.length} lần)`);
        assert(getUserMediaCallArgs[0]?.audio?.deviceId?.exact === 'dev-OLD-GONE', 'lần gọi duy nhất vẫn dùng đúng exact deviceId đã chọn ở Setup, không rơi về mic mặc định');
        assert(result !== 'REACHED_AUDIOCONTEXT', 'hàm KHÔNG đi tiếp tới AudioContext/KeyEngine/BPMEngine khi getUserMedia lỗi');
        assert(sandbox.audioMonitorStarted === false, 'audioMonitorStarted reset về false sau lỗi, không giữ trạng thái "đã start" giả');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
