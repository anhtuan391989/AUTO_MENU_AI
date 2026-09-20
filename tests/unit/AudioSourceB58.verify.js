/**
 * AudioSourceB58.verify.js — TASK B58
 * ---------------------------------------------------------------------------
 * Test code THẬT trong ui/js/audioSource.js (không mock riêng logic — chạy
 * đúng file qua vm, chỉ giả lập browser API tối thiểu: navigator.mediaDevices,
 * AudioContext, requestAnimationFrame, performance — cùng convention với
 * SoundcardSetupPersistence.verify.js/SettingsFileIO.verify.js đã có sẵn trong
 * repo, không dùng jsdom).
 *
 * Coverage (đúng Mục 19 đề bài B58):
 *   Test 1 — MIC isolation (kiến trúc): MIC source KHÔNG có adapter getter nào
 *            để lấy audioContext/sourceNode ra ngoài -> không có đường nào để
 *            MIC lọt vào Key/BPM/Mod qua file này.
 *   Test 2 — SYSTEM_AUDIO: requireExplicitDevice=true -> không rơi về mic mặc
 *            định khi chưa chọn device (giữ đúng hành vi cũ đã audit ở B56/B57).
 *   Test 3 — SYSTEM_AUDIO có adapter getter (exposeRawNodeForAdapter=true).
 *   Test 4 — DAW_MASTER: luôn NO_DEVICE, onLevel luôn trả vuPercent=0/noDevice,
 *            KHÔNG bao giờ lấy số liệu khác 0 (không giả lập bằng SYSTEM_AUDIO).
 *   Test 5 — AudioLevel contract: có đủ rms/dbfs/peak/vuPercent/timestamp/sourceType.
 *   Test 6 — device lost (getUserMedia reject) -> không throw ra ngoài, state
 *            chuyển ERROR, onDeviceLost được gọi.
 *
 * Chạy: node tests/unit/AudioSourceB58.verify.js
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

function loadAudioSourceModule({ getUserMediaImpl, getSettingImpl }) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'audioSource.js'), 'utf8');

    // AudioContext giả — đủ để code thật chạy được (createMediaStreamSource/createAnalyser/
    // currentTime/close/resume), KHÔNG cần audio thật.
    class FakeAnalyserNode {
        constructor() { this.fftSize = 2048; this.frequencyBinCount = 1024; }
        getByteTimeDomainData(arr) { arr.fill(128); } // im lặng tuyệt đối -> rms=0
        getByteFrequencyData(arr) { arr.fill(0); }
    }
    class FakeMediaStreamSourceNode {
        connect() {}
    }
    class FakeAudioContext {
        constructor() { this.state = 'running'; this.sampleRate = 48000; this.currentTime = 1.23; }
        createMediaStreamSource() { return new FakeMediaStreamSourceNode(); }
        createAnalyser() { return new FakeAnalyserNode(); }
        resume() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
    }

    const fakeTrack = {
        addEventListener() {},
        getSettings() { return { channelCount: 2 }; },
    };
    const fakeStream = {
        getAudioTracks() { return [fakeTrack]; },
        getTracks() { return [Object.assign({ stop() {} }, fakeTrack)]; },
    };

    const sandbox = {
        window: {},
        navigator: { mediaDevices: { getUserMedia: getUserMediaImpl || (() => Promise.resolve(fakeStream)) } },
        AudioContext: FakeAudioContext,
        webkitAudioContext: undefined,
        performance: { now: () => Date.now() },
        requestAnimationFrame: () => 1, // không cần loop thật chạy nhiều lần cho unit test này
        cancelAnimationFrame: () => {},
        // TASK C62 — audioSource.js giờ dùng setTimeout/clearTimeout cho auto-reconnect
        // (SYSTEM_AUDIO). Đây là API chuẩn của MỌI môi trường JS thật (browser/Electron), không
        // cần fake riêng như AudioContext/getUserMedia — dùng thẳng bản thật của Node là đủ,
        // không ảnh hưởng gì tới các assertion B58 vốn có (test này không cần điều khiển thời
        // gian, khác với tests/unit/AudioReconnectC62.verify.js).
        // QUAN TRỌNG: dùng bản NO-OP (không tự bắn callback) — không phải setTimeout thật của
        // Node — vì nếu dùng thật, retry backoff (2s/4s/8s.../15s) sẽ khiến tiến trình Node của
        // CHÍNH file test này treo hàng chục giây chờ timer trong lúc chạy Test 6 (getUserMedia
        // luôn reject) — vượt quá thời gian cho phép. File test này không cần retry THẬT SỰ bắn
        // ra (không kiểm tra hành vi reconnect ở đây, xem AudioReconnectC62.verify.js), chỉ cần
        // start() không throw ra ngoài khi có setTimeout/clearTimeout tồn tại như 1 global thật.
        setTimeout: () => 0,
        clearTimeout: () => {},
        console,
        getSetting: getSettingImpl || (() => ''),
    };
    sandbox.window.AudioContext = FakeAudioContext;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'audioSource.js' });
    return sandbox.window.AudioSource;
}

async function run() {
    console.log('\n== Test 1: MIC source KHÔNG có adapter getter (kiến trúc cách ly khỏi AI) ==');
    {
        const AudioSource = loadAudioSourceModule({});
        const mic = AudioSource.createMicSource();
        assert(typeof mic.getAudioContextForAdapter !== 'function', 'MIC không có getAudioContextForAdapter()');
        assert(typeof mic.getRawSourceNodeForAdapter !== 'function', 'MIC không có getRawSourceNodeForAdapter()');
        assert(typeof mic.onFrame === 'function', 'MIC vẫn có onFrame() (API đối xứng) nhưng không expose raw node ra ngoài');
    }

    console.log('\n== Test 2: SYSTEM_AUDIO không rơi về mặc định khi chưa chọn device ==');
    {
        const AudioSource = loadAudioSourceModule({ getSettingImpl: () => '' }); // không có systemAudioDeviceId lẫn selectedSoundcardId
        const sys = AudioSource.createSystemAudioSource();
        await sys.start();
        assert(sys.getState() === 'NO_DEVICE', `SYSTEM_AUDIO state = NO_DEVICE khi chưa chọn (thực tế: ${sys.getState()})`);
    }

    console.log('\n== Test 3: SYSTEM_AUDIO có adapter getter khi đã chọn device + RUNNING ==');
    {
        const AudioSource = loadAudioSourceModule({
            getSettingImpl: (k) => (k === 'selectedSoundcardId' ? 'dev-XYZ' : ''), // MIGRATION FALLBACK path
        });
        const sys = AudioSource.createSystemAudioSource();
        await sys.start();
        assert(sys.getState() === 'RUNNING', `SYSTEM_AUDIO RUNNING sau khi có deviceId qua fallback selectedSoundcardId (thực tế: ${sys.getState()})`);
        assert(typeof sys.getAudioContextForAdapter === 'function' && !!sys.getAudioContextForAdapter(), 'SYSTEM_AUDIO có getAudioContextForAdapter() trả về AudioContext thật');
        assert(typeof sys.getRawSourceNodeForAdapter === 'function' && !!sys.getRawSourceNodeForAdapter(), 'SYSTEM_AUDIO có getRawSourceNodeForAdapter() trả về source node thật');
        sys.stop();
        assert(sys.getState() === 'NO_DEVICE', 'SYSTEM_AUDIO trở về NO_DEVICE sau stop() (không treo ở RUNNING)');
    }

    console.log('\n== Test 4: DAW_MASTER luôn NO_DEVICE, KHÔNG giả lập bằng số liệu khác 0 ==');
    {
        const AudioSource = loadAudioSourceModule({});
        const master = AudioSource.createDawMasterSource();
        let received = null;
        master.onLevel((level) => { received = level; });
        master.start();
        assert(master.getState() === 'NO_DEVICE', 'DAW_MASTER.getState() luôn NO_DEVICE');
        assert(received !== null, 'DAW_MASTER vẫn emit 1 AudioLevel (để UI vẽ trạng thái NO_DEVICE)');
        assert(received.vuPercent === 0 && received.rms === 0, 'DAW_MASTER level luôn rms=0/vuPercent=0 — không mượn số liệu SYSTEM_AUDIO');
        assert(received.noDevice === true, 'DAW_MASTER level có cờ noDevice=true rõ ràng');
        assert(received.sourceType === 'DAW_MASTER', 'DAW_MASTER level có đúng sourceType');
    }

    console.log('\n== Test 5: AudioLevel contract có đủ field bắt buộc (Mục 11) ==');
    {
        const AudioSource = loadAudioSourceModule({ getSettingImpl: () => 'dev-A' });
        const sys = AudioSource.createSystemAudioSource();
        let level = null;
        sys.onLevel((l) => { if (!level) level = l; });
        await sys.start();
        // requestAnimationFrame giả trả 1 lần synchronous qua loop() gọi trực tiếp 1 lần
        // trong start() — kiểm tra field ngay sau start() là đủ vì loop() chạy đồng bộ lần đầu.
        assert(level !== null, 'onLevel được gọi ít nhất 1 lần sau start()');
        for (const field of ['rms', 'dbfs', 'peak', 'vuPercent', 'timestamp', 'sourceType']) {
            assert(level && Object.prototype.hasOwnProperty.call(level, field), `AudioLevel có field "${field}"`);
        }
        assert(level.timestamp === 1.23, 'timestamp lấy THẬT từ AudioContext.currentTime (fake=1.23), không hard-code');
        sys.stop();
    }

    console.log('\n== Test 6: device lost / getUserMedia reject không throw ra ngoài ==');
    {
        const AudioSource = loadAudioSourceModule({
            getSettingImpl: () => 'dev-B',
            getUserMediaImpl: () => Promise.reject(Object.assign(new Error('device gone'), { name: 'NotFoundError' })),
        });
        const sys = AudioSource.createSystemAudioSource();
        let lostReason = null;
        sys.onDeviceLost((reason) => { lostReason = reason; });
        let threw = false;
        try {
            await sys.start();
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'start() không throw ra ngoài khi getUserMedia reject (bắt lỗi nội bộ)');
        assert(sys.getState() === 'ERROR', `state = ERROR sau khi device reject (thực tế: ${sys.getState()})`);
        assert(lostReason === 'NotFoundError', `onDeviceLost nhận đúng lý do (thực tế: ${lostReason})`);
    }

    console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
    if (fail > 0) process.exit(1);
}

run();
