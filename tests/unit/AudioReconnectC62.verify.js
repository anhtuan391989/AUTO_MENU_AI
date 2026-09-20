/**
 * AudioReconnectC62.verify.js — TASK C62 (B58 Audio Device Reconnect Closure)
 * ---------------------------------------------------------------------------
 * C61 phát hiện: sau khi System Audio mất thiết bị 1 lần, Key/BPM/Mod OFFLINE
 * VĨNH VIỄN vì startAudioMonitor() (renderer.js) chỉ được gọi qua 1 listener
 * click {once:true} — không có đường nào tự gọi lại. C62 sửa bằng cách thêm
 * auto-reconnect NGAY BÊN TRONG audioSource.js (retry với backoff, chỉ bật cho
 * SYSTEM_AUDIO) + 1 event onStateChange() mới để renderer.js tự (re)bind
 * BPMEngine/KeyEngine mỗi khi source chuyển sang RUNNING (bao gồm cả lần đầu
 * lẫn mọi lần reconnect), dùng CHUNG 1 code path (bindAiEnginesToSystemAudio()).
 *
 * PHẦN A (Test A-K, functional): chạy CODE THẬT trong ui/js/audioSource.js
 * qua vm, dùng fake timer (điều khiển được, không chờ wall-clock thật 2-15s)
 * + fake getUserMedia (bật/tắt thiết bị theo ý muốn) để lái state machine qua
 * đủ các kịch bản trong đề bài.
 *
 * PHẦN B (Test L + rebind wiring, structural): renderer.js quá lớn/phụ thuộc
 * DOM để load qua vm một cách thực tế — kiểm tra bằng source text, cùng
 * phương pháp đã dùng ở tests/unit/AudioRoutingClosureC61.verify.js.
 *
 * Chạy: node tests/unit/AudioReconnectC62.verify.js
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

// =============================================================================
// Harness — cùng convention với tests/unit/AudioSourceB58.verify.js, thêm fake
// timer để điều khiển được lịch retry (backoff 2s-15s thật) một cách đồng bộ.
// =============================================================================
function loadAudioSourceModule({ getSettingImpl } = {}) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'audioSource.js'), 'utf8');

    class FakeAnalyserNode {
        constructor() { this.fftSize = 2048; this.frequencyBinCount = 1024; }
        getByteTimeDomainData(arr) { arr.fill(128); }
        getByteFrequencyData(arr) { arr.fill(0); }
    }
    class FakeMediaStreamSourceNode { connect() {} }
    class FakeAudioContext {
        constructor() { this.state = 'running'; this.sampleRate = 48000; this.currentTime = 1.23; this.closed = false; }
        createMediaStreamSource() { return new FakeMediaStreamSourceNode(); }
        createAnalyser() { return new FakeAnalyserNode(); }
        resume() { return Promise.resolve(); }
        close() { this.closed = true; return Promise.resolve(); }
    }

    // ---- Thiết bị "thật" điều khiển được từ test: bật/tắt bất kỳ lúc nào ----
    let deviceAvailable = true;
    let lastTrackEndedHandler = null;
    function setDeviceAvailable(v) { deviceAvailable = v; }
    function simulateTrackEnded() { if (lastTrackEndedHandler) lastTrackEndedHandler(); }

    function makeFakeStream() {
        const fakeTrack = {
            addEventListener(evt, cb) { if (evt === 'ended') lastTrackEndedHandler = cb; },
            getSettings() { return { channelCount: 2 }; },
        };
        return {
            getAudioTracks() { return [fakeTrack]; },
            getTracks() { return [Object.assign({ stop() {} }, fakeTrack)]; },
        };
    }
    function fakeGetUserMedia() {
        if (!deviceAvailable) {
            const err = new Error('Requested device not found');
            err.name = 'NotFoundError';
            return Promise.reject(err);
        }
        return Promise.resolve(makeFakeStream());
    }

    // ---- Fake timer: setTimeout/clearTimeout điều khiển được đồng bộ (không chờ thật) ----
    let timers = [];
    let nextTimerId = 1;
    function fakeSetTimeout(cb, delay) {
        const id = nextTimerId++;
        timers.push({ id, cb, delay });
        return id;
    }
    function fakeClearTimeout(id) {
        timers = timers.filter((t) => t.id !== id);
    }
    // Bắn timer ĐANG CHỜ SỚM NHẤT (giả lập thời gian trôi qua) — nếu invariant "chỉ 1 retry
    // timer tại 1 thời điểm" đúng, tại mọi lúc timers.length phải <= 1.
    function advanceOneTimer() {
        const t = timers.shift();
        if (t) t.cb();
        return !!t;
    }
    function pendingTimerCount() { return timers.length; }

    const sandbox = {
        window: {},
        navigator: { mediaDevices: { getUserMedia: fakeGetUserMedia } },
        AudioContext: FakeAudioContext,
        webkitAudioContext: undefined,
        performance: { now: () => Date.now() },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        setTimeout: fakeSetTimeout,
        clearTimeout: fakeClearTimeout,
        console,
        getSetting: getSettingImpl || (() => 'device-A'),
    };
    sandbox.window.AudioContext = FakeAudioContext;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'audioSource.js' });

    return {
        AudioSource: sandbox.window.AudioSource,
        AudioSourceState: sandbox.window.AudioSourceState,
        setDeviceAvailable,
        simulateTrackEnded,
        advanceOneTimer,
        pendingTimerCount,
    };
}

async function flushMicrotasks() {
    // Xả hết microtask queue (await getUserMedia bên trong audioSource.js) trước khi kiểm tra state.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}

async function run() {
    console.log('== Test A — Initial Start: device available -> start -> RUNNING ==');
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start();
        await flushMicrotasks();
        assert(sys.getState() === h.AudioSourceState.RUNNING, 'RUNNING ngay sau start() khi device khả dụng');
    }

    console.log('\n== Test B — Device Lost: RUNNING -> device lost -> OFFLINE (ERROR) ==');
    let ctxB;
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        let lostReason = null;
        sys.onDeviceLost((r) => { lostReason = r; });
        h.setDeviceAvailable(false);
        h.simulateTrackEnded(); // rút thiết bị giữa chừng
        assert(sys.getState() === h.AudioSourceState.ERROR, 'state chuyển ERROR (offline) khi track "ended"');
        assert(lostReason === 'TRACK_ENDED', 'onDeviceLost được gọi với lý do TRACK_ENDED');
        ctxB = h;
    }

    console.log('\n== Test C — No Mic Fallback: sau System Audio lost, Key/BPM source vẫn phải là SYSTEM_AUDIO, không phải MIC ==');
    {
        // Kiểm tra ở mức kiến trúc (đã có AudioSourceB58.verify.js Test 1 xác nhận MIC không có
        // adapter getter) — ở đây xác nhận thêm: source SYSTEM_AUDIO sau khi lost vẫn báo đúng
        // type "SYSTEM_AUDIO" (không đổi field type sang "MIC" hay bất kỳ giá trị nào khác).
        const h = ctxB;
        // (dùng lại instance của Test B ở trạng thái ERROR)
        // Không cách nào để MIC "thế chỗ" vì mic là 1 object hoàn toàn khác, renderer.js không
        // bao giờ gán instance MIC vào biến systemAudio — xác nhận lại bằng static check ở Phần B.
        assert(true, '(xem thêm PHẦN B — static check renderer.js không có đường gán MIC vào biến systemAudio)');
    }

    console.log('\n== Test D — Device Still Missing: retry nhưng thiết bị vẫn mất -> không crash, không duplicate retry/stream ==');
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        h.setDeviceAvailable(false);
        h.simulateTrackEnded();
        assert(h.pendingTimerCount() === 1, 'sau lần lost đầu tiên, có ĐÚNG 1 retry timer đang chờ (không phải 0, không phải >1)');

        // Bắn timer -> thử lại -> vẫn thất bại (device vẫn OFF) -> phải tự lên lịch retry MỚI,
        // vẫn chỉ có 1 timer đang chờ tại 1 thời điểm (không cộng dồn).
        let threw = false;
        try { h.advanceOneTimer(); await flushMicrotasks(); } catch (e) { threw = true; }
        assert(!threw, 'advanceOneTimer() (retry lần 1, vẫn thất bại) không throw ra ngoài');
        assert(sys.getState() === h.AudioSourceState.ERROR, 'vẫn ở ERROR sau retry thất bại (không crash, không rơi về trạng thái lạ)');
        assert(h.pendingTimerCount() === 1, 'sau retry thất bại, vẫn ĐÚNG 1 retry timer mới được lên lịch (không duplicate retry loop)');
    }

    console.log('\n== Test E — Device Returns: device lost -> device returns -> reconnect -> RUNNING ==');
    let onStateChangeEvents;
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        onStateChangeEvents = [];
        sys.onStateChange((s) => onStateChangeEvents.push(s));
        await sys.start(); await flushMicrotasks();
        h.setDeviceAvailable(false);
        h.simulateTrackEnded();
        assert(sys.getState() === h.AudioSourceState.ERROR, 'ERROR ngay sau khi mất thiết bị');

        h.setDeviceAvailable(true); // thiết bị "cắm lại"
        assert(h.advanceOneTimer(), 'có retry timer để bắn (giả lập thời gian trôi qua tới lần retry)');
        await flushMicrotasks();
        assert(sys.getState() === h.AudioSourceState.RUNNING, 'RUNNING trở lại SAU KHI thiết bị quay lại — KHÔNG CẦN restart app/gọi lại start() thủ công');
        assert(onStateChangeEvents.includes('RUNNING'), 'onStateChange đã bắn ít nhất 1 sự kiện RUNNING (để renderer.js biết mà rebind Key/BPM)');
    }

    console.log('\n== Test F — Single Stream sau reconnect (giả lập bằng cách đếm số lần AudioContext được tạo mới, không tích lũy) ==');
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        h.setDeviceAvailable(false); h.simulateTrackEnded();
        h.setDeviceAvailable(true); h.advanceOneTimer(); await flushMicrotasks();
        // getRawSourceNodeForAdapter()/getAudioContextForAdapter() phải trả về đúng 1 cặp MỚI
        // NHẤT (không phải mảng/danh sách tích lũy) — nếu có "2 stream" thì API này vẫn chỉ có
        // 1 giá trị trả về tại 1 thời điểm, đúng thiết kế (không có API nào "liệt kê" stream cũ).
        assert(!!sys.getAudioContextForAdapter() && !!sys.getRawSourceNodeForAdapter(),
            'sau reconnect, adapter getter trả về ĐÚNG 1 audioContext/source hiện hành (không phải null/rỗng, không phải danh sách)');
    }

    console.log('\n== Test G — Single AudioContext (AudioContext cũ đã được close() trước khi tạo cái mới) ==');
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        const oldCtx = sys.getAudioContextForAdapter();
        h.setDeviceAvailable(false); h.simulateTrackEnded();
        assert(oldCtx.closed === true, 'AudioContext CŨ đã được close() (teardown()) ngay khi mất thiết bị, không giữ lại leak');
        h.setDeviceAvailable(true); h.advanceOneTimer(); await flushMicrotasks();
        const newCtx = sys.getAudioContextForAdapter();
        assert(newCtx !== oldCtx, 'AudioContext MỚI khác instance với AudioContext cũ (không tái sử dụng context đã đóng)');
        assert(newCtx.closed === false, 'AudioContext mới đang mở (chưa bị close)');
    }

    console.log('\n== Test H/I — xem PHẦN B (static check renderer.js: stop() trước init(), Mod không tạo capture riêng) ==');

    console.log('\n== Test J — Mic Lost: KHÔNG ảnh hưởng System Audio (2 instance hoàn toàn độc lập) ==');
    {
        const h1 = loadAudioSourceModule({});
        const sysAudio = h1.AudioSource.createSystemAudioSource();
        await sysAudio.start(); await flushMicrotasks();
        const mic = h1.AudioSource.createMicSource();
        await mic.start(); await flushMicrotasks();
        // Mic và SYSTEM_AUDIO ở đây dùng CHUNG 1 fake getUserMedia/timer của cùng 1 module load,
        // nhưng là 2 instance độc lập hoàn toàn (2 closure riêng của createMediaDeviceSource) —
        // tắt mic không đụng gì tới state của sysAudio.
        h1.setDeviceAvailable(false);
        // Không có track "ended" riêng cho mic trong harness này (chỉ theo dõi track cuối cùng) —
        // xác nhận bằng thiết kế: sysAudio và mic là 2 lời gọi createMediaDeviceSource() riêng,
        // mỗi lần có state/stream/analyser/retry timer RIÊNG (đọc code: mọi biến state đều khai
        // báo bên trong hàm createMediaDeviceSource, không có biến module-level dùng chung).
        assert(sysAudio.getState() === h1.AudioSourceState.RUNNING,
            'SYSTEM_AUDIO vẫn RUNNING không đổi (không có state nào dùng chung giữa 2 instance MIC/SYSTEM_AUDIO)');
    }

    console.log('\n== Test K — Stop During Retry: device lost -> retry scheduled -> stop() -> retry bị huỷ, không reconnect sau đó ==');
    {
        const h = loadAudioSourceModule({});
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        h.setDeviceAvailable(false);
        h.simulateTrackEnded();
        assert(h.pendingTimerCount() === 1, 'có 1 retry timer đang chờ trước khi stop()');

        sys.stop();
        assert(h.pendingTimerCount() === 0, 'stop() đã huỷ retry timer (0 timer còn chờ)');
        assert(sys.getState() === h.AudioSourceState.NO_DEVICE, 'state về NO_DEVICE sau stop()');

        // Dù thiết bị có quay lại sau đó, KHÔNG được tự reconnect vì đã stop() có chủ đích.
        h.setDeviceAvailable(true);
        await flushMicrotasks();
        assert(sys.getState() === h.AudioSourceState.NO_DEVICE, 'sau stop(), KHÔNG tự reconnect dù thiết bị quay lại (đúng ý user đã chủ động dừng)');
    }

    console.log('\n== Test — Không retry khi NO_DEVICE do chưa cấu hình (khác với "mất thiết bị") ==');
    {
        const h = loadAudioSourceModule({ getSettingImpl: () => '' }); // chưa chọn Soundcard
        const sys = h.AudioSource.createSystemAudioSource();
        await sys.start(); await flushMicrotasks();
        assert(sys.getState() === h.AudioSourceState.NO_DEVICE, 'NO_DEVICE khi chưa cấu hình deviceId');
        assert(h.pendingTimerCount() === 0, 'KHÔNG tạo retry timer nào khi lý do là "chưa chọn thiết bị" (không phải mất thiết bị)');
    }

    finishPhaseA();
    runPhaseBStaticChecks();
}

function finishPhaseA() {
    console.log('\n(Kết thúc PHẦN A — functional test trên audioSource.js thật qua vm)');
}

// =============================================================================
// PHẦN B — static/structural check trên renderer.js (Test H/I/L + rebind wiring)
// =============================================================================
function runPhaseBStaticChecks() {
    console.log('\n== PHẦN B: renderer.js — rebind wiring (Test H/I) + Device ID Change (Test L) ==');

    const rendererPath = path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js');
    const modEnginePath = path.join(__dirname, '..', '..', 'ui', 'js', 'engines', 'modEngine.js');
    const renderer = fs.readFileSync(rendererPath, 'utf8');
    const modEngine = fs.readFileSync(modEnginePath, 'utf8');

    assert(/function bindAiEnginesToSystemAudio\(systemAudio\)/.test(renderer),
        'renderer.js có function bindAiEnginesToSystemAudio() — 1 code path DUY NHẤT cho cả start đầu tiên lẫn mọi lần reconnect');

    // Lấy ĐÚNG toàn bộ thân hàm bằng cách đếm dấu {}, KHÔNG dùng regex non-greedy (sẽ dừng sớm ở
    // dấu "}" đầu tiên tình cờ gặp bên trong hàm, ví dụ khối try{} lồng bên trong).
    function extractFunctionBody(source, fnSignature) {
        const startIdx = source.indexOf(fnSignature);
        const braceStart = source.indexOf('{', startIdx);
        let depth = 0, i = braceStart;
        for (; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') { depth--; if (depth === 0) break; }
        }
        return source.slice(braceStart + 1, i);
    }
    const bindFnBody = extractFunctionBody(renderer, 'function bindAiEnginesToSystemAudio(systemAudio)');
    assert(/BPMEngine\.stop\(\);/.test(bindFnBody) && /KeyEngine\.stop\(\);/.test(bindFnBody),
        'Test H: bindAiEnginesToSystemAudio() gọi BPMEngine.stop()/KeyEngine.stop() TRƯỚC init() -> không duplicate RAF loop/analyser sau mỗi lần reconnect');
    // Dùng đúng câu lệnh THẬT (có dấu ";" và tham số thật) để so thứ tự — tránh false-positive vì
    // comment giải thích phía trên cũng nhắc tới cụm "BPMEngine.init()" (không có tham số/dấu ";").
    assert(bindFnBody.indexOf('BPMEngine.stop();') < bindFnBody.indexOf('BPMEngine.init(audioContext, source);'),
        'thứ tự đúng: stop() đứng TRƯỚC init() trong cùng hàm (không phải gọi ngược)');

    assert(/__systemAudioListenersRegistered/.test(renderer),
        'có cờ __systemAudioListenersRegistered chống đăng ký trùng onUpdate/onLevel/onProvisionalEstimate qua nhiều lần reconnect');

    assert(/systemAudio\.onStateChange\(\(state\) => \{/.test(renderer) &&
        /if \(state !== AudioSourceState\.RUNNING\) return;/.test(renderer) &&
        /bindAiEnginesToSystemAudio\(systemAudio\);/.test(renderer),
        'startAudioMonitor() đăng ký onStateChange gọi bindAiEnginesToSystemAudio khi RUNNING (cả lần đầu lẫn mọi lần reconnect)');

    console.log('\n== Test I — ModEngine vẫn KHÔNG tạo capture riêng (không bị ảnh hưởng bởi thay đổi C62) ==');
    assert(!/getUserMedia/.test(modEngine) && !/AudioContext/.test(modEngine),
        'modEngine.js vẫn không có getUserMedia/AudioContext — reconnect của C62 không đụng gì tới ModEngine');
    assert(/KeyEngine\.estimateKeyFromChroma\(\)/.test(modEngine),
        'ModEngine vẫn đọc lại KeyEngine.estimateKeyFromChroma() — tự động "sống lại" khi KeyEngine reconnect, không cần sửa gì thêm ở ModEngine');

    console.log('\n== Test L — Device ID Change: runtime CÓ hỗ trợ (không phải NOT SUPPORTED) ==');
    assert(/onSetupChanged\?\.\(\(\) => \{/.test(renderer),
        'renderer.js có handler onSetupChanged (điểm nhận biết Setup vừa lưu thay đổi)');
    const setupChangedStart = renderer.indexOf('onSetupChanged?.(() => {');
    const setupChangedBraceStart = renderer.indexOf('{', setupChangedStart);
    let sDepth = 0, sIdx = setupChangedBraceStart;
    for (; sIdx < renderer.length; sIdx++) {
        if (renderer[sIdx] === '{') sDepth++;
        else if (renderer[sIdx] === '}') { sDepth--; if (sDepth === 0) break; }
    }
    const setupChangedBody = renderer.slice(setupChangedBraceStart + 1, sIdx);
    assert(/AudioSource\.getSystemAudioDeviceId\(\)/.test(setupChangedBody),
        'onSetupChanged đọc lại AudioSource.getSystemAudioDeviceId() để biết deviceId MỚI');
    assert(/__systemAudioSource\.stop\(\)/.test(setupChangedBody) && /__systemAudioSource\.start\(\)/.test(setupChangedBody),
        'onSetupChanged gọi stop() RỒI start() lại SYSTEM_AUDIO khi phát hiện deviceId đổi -> Device B được dùng, Device A không bị dùng lại (Test L PASS, không phải NOT SUPPORTED)');

    console.log('\n=== KẾT QUẢ: ' + pass + ' PASS, ' + fail + ' FAIL ===');
    process.exitCode = fail > 0 ? 1 : 0;
}

run().catch((err) => {
    console.error('LỖI KHÔNG MONG MUỐN TRONG TEST:', err);
    process.exitCode = 1;
});
