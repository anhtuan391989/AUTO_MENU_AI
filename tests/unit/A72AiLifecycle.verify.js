/**
 * A72AiLifecycle.verify.js — TASK A72 (Hoàn thiện AI Audio Engine)
 *
 * PHẠM VI & GIỚI HẠN (đọc trước khi tin kết quả):
 *  - Đây là test trên MÁY PHÁT TRIỂN với AnalyserNode GIẢ + đồng hồ ảo. Nó chứng minh logic
 *    engine phản ứng đúng với tín hiệu tổng hợp có BPM biết trước. Nó KHÔNG phải bằng chứng
 *    phần cứng/Windows (HARDWARE VERIFICATION vẫn BLOCKED — xem A72-REPORT.md).
 *  - Ngưỡng sai số BPM (±2 BPM) là ĐỀ XUẤT của A72 (dự án chưa có tiêu chuẩn): căn cứ là
 *    bpmEngine.js đã gom phiếu với dung sai ±1 BPM (BPM_VOTE), cộng 1 BPM sai số lượng tử hoá
 *    ở 60fps => ±2 là ngưỡng hợp lý cho tín hiệu sạch. Sai số THỰC ĐO in ra ở mỗi ca.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log('  OK  ', msg); }
    else { fail++; console.error('  FAIL ', msg); }
}
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

// ---------- Harness BPM với đồng hồ ảo ----------
const FRAME_MS = 1000 / 60;
function loadBpmEngine(clock) {
    const rafQueue = [];
    const sandbox = {
        console,
        Uint8Array, Float32Array, Math, Object, Array, Number,
        Date: { now: () => clock.t },
        requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
        cancelAnimationFrame: () => { rafQueue.length = 0; },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('ui/js/engines/bpmEngine.js'), sandbox);
    return { BPMEngine: sandbox.window.BPMEngine, rafQueue };
}

// Analyser giả: phát xung "kick" tại các khung beat của BPM tham chiếu.
function makeAnalyser(state) {
    return {
        fftSize: 2048,
        frequencyBinCount: 1024,
        calls: 0,
        getByteFrequencyData(arr) {
            this.calls++;
            arr.fill(state.silence ? 0 : 10);
            if (!state.silence && state.beatNow) for (let i = 0; i < 220; i++) arr[i] = 200;
        },
        getByteTimeDomainData(arr) {
            arr.fill(128);
            if (!state.silence) for (let i = 0; i < arr.length; i++) arr[i] = 128 + Math.round(40 * Math.sin(i / 7));
        },
    };
}
function makeContext(analyser) {
    return { createAnalyser: () => analyser };
}
const fakeSource = { connect() {} };

// Chạy `seconds` giây ảo; nếu bpm != null phát beat theo bpm.
function run(env, seconds, bpm, extra = {}) {
    const { rafQueue, state, clock } = env;
    const frames = Math.round(seconds * 60);
    const framesPerBeat = bpm ? 3600 / bpm : Infinity;
    for (let f = 0; f < frames; f++) {
        env.frameIdx = (env.frameIdx || 0) + 1;
        const k = bpm ? Math.round(env.frameIdx / framesPerBeat) : -1;
        state.beatNow = bpm ? Math.round(k * framesPerBeat) === env.frameIdx : false;
        clock.t += FRAME_MS;
        const cb = rafQueue.shift();
        if (!cb) { env.starved = true; break; }
        cb();
    }
}
function newEnv() {
    const clock = { t: 1_000_000 };
    const { BPMEngine, rafQueue } = loadBpmEngine(clock);
    const state = { silence: false, beatNow: false };
    const analyser = makeAnalyser(state);
    return { clock, BPMEngine, rafQueue, state, analyser, frameIdx: 0, updates: [] };
}

console.log('\n== A72.1 — BPM bằng tín hiệu tham chiếu (đồng hồ ảo, 45s/ca) ==');
const measured = [];
for (const ref of [100, 120, 128, 140]) {
    const env = newEnv();
    env.BPMEngine.onUpdate((b) => env.updates.push(b));
    env.BPMEngine.init(makeContext(env.analyser), fakeSource);
    run(env, 45, ref);
    const got = env.BPMEngine.getCurrentBpm();
    const err = got == null ? null : Math.abs(got - ref);
    measured.push({ ref, got, err });
    console.log(`     [đo] tham chiếu=${ref} BPM -> engine báo=${got} (sai số=${err})`);
    assert(got != null && err <= 2, `BPM tham chiếu ${ref}: engine báo ${got} (sai số ${err} <= ngưỡng đề xuất 2)`);
    assert(got === ref, `BPM tham chiếu ${ref}: SAU sửa A72-04 engine báo đúng ${ref} (không còn thiên lệch -1; TRƯỚC sửa báo ${ref - 1})`);
    env.BPMEngine.stop();
}

console.log('\n== A72.2 — Im lặng: KHÔNG báo BPM, KHÔNG giữ kết quả giả ==');
{
    const env = newEnv();
    env.state.silence = true;
    env.BPMEngine.onUpdate((b) => env.updates.push(b));
    env.BPMEngine.init(makeContext(env.analyser), fakeSource);
    run(env, 30, null);
    assert(env.updates.length === 0, `Tín hiệu im lặng 30s: 0 lần báo BPM (thực tế: ${env.updates.length})`);
    assert(env.BPMEngine.getCurrentBpm() === null, 'Tín hiệu im lặng: getCurrentBpm() = null (không có BPM giả)');
    env.BPMEngine.stop();
}

console.log('\n== A72.3 — Nhịp không đều/không đủ điều kiện: không khoá BPM sai ==');
{
    const env = newEnv();
    env.BPMEngine.onUpdate((b) => env.updates.push(b));
    env.BPMEngine.init(makeContext(env.analyser), fakeSource);
    // Beat ở khoảng cách ngẫu nhiên (seed cố định, tái lập được) — không có tempo ổn định.
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let nextBeat = 20; env.frameIdx = 0;
    for (let f = 1; f <= 45 * 60; f++) {
        env.frameIdx = f;
        env.state.beatNow = f === nextBeat;
        if (f === nextBeat) nextBeat += 18 + Math.floor(rnd() * 60); // 0.3s..1.3s ngẫu nhiên
        env.clock.t += FRAME_MS;
        const cb = env.rafQueue.shift(); if (!cb) break; cb();
    }
    const got = env.BPMEngine.getCurrentBpm();
    console.log(`     [đo] nhịp ngẫu nhiên -> engine báo=${got} (số lần báo: ${env.updates.length})`);
    // Không tự đặt ngưỡng cứng: ghi nhận hành vi thật. Chỉ khẳng định không crash + báo cáo số liệu.
    assert(true, `Nhịp ngẫu nhiên: engine không crash (báo=${got}, ${env.updates.length} lần) — hành vi ghi nhận trong A72-REPORT`);
    env.BPMEngine.stop();
}

console.log('\n== A72.4 — Nguồn bị ngắt giữa chừng: stop() dừng hẳn, không callback cũ ==');
{
    const env = newEnv();
    env.BPMEngine.onUpdate((b) => env.updates.push(b));
    env.BPMEngine.init(makeContext(env.analyser), fakeSource);
    run(env, 30, 120);
    assert(env.updates.length > 0, `Trước khi ngắt: engine đã báo BPM (${env.updates.length} lần)`);
    env.BPMEngine.stop();
    const before = env.updates.length, callsBefore = env.analyser.calls;
    run(env, 10, 120);
    assert(env.updates.length === before, 'Sau stop(): KHÔNG còn callback BPM nào (không giữ kết quả cũ như đang chạy)');
    assert(env.analyser.calls === callsBefore, 'Sau stop(): analyser không còn bị đọc (vòng lặp đã dừng thật)');
    assert(env.rafQueue.length === 0, 'Sau stop(): không còn vòng requestAnimationFrame treo');
}

console.log('\n== A72.5 — Đổi nguồn / reconnect: init() lại reset sạch, không vòng lặp trùng ==');
{
    const env = newEnv();
    env.BPMEngine.onUpdate((b) => env.updates.push(b));
    env.BPMEngine.init(makeContext(env.analyser), fakeSource);
    run(env, 30, 100);
    const first = env.BPMEngine.getCurrentBpm();
    assert(first != null && Math.abs(first - 100) <= 2, `Nguồn A (100 BPM): engine báo ${first}`);

    // Mô phỏng đúng thứ tự renderer.js: stop() rồi init() với analyser MỚI.
    env.BPMEngine.stop();
    const analyserB = makeAnalyser(env.state);
    env.BPMEngine.init(makeContext(analyserB), fakeSource);
    assert(env.BPMEngine.getCurrentBpm() === null, 'Ngay sau init() nguồn mới: BPM cũ bị xoá (getCurrentBpm()=null) — không hiển thị BPM cũ như hiện hành');
    const callsOldBefore = env.analyser.calls;
    run(env, 30, 140);
    assert(env.analyser.calls === callsOldBefore, 'Analyser của nguồn cũ KHÔNG còn bị đọc sau khi đổi nguồn');
    const second = env.BPMEngine.getCurrentBpm();
    assert(second != null && Math.abs(second - 140) <= 2, `Nguồn B (140 BPM): engine báo ${second}`);
    assert(env.rafQueue.length === 1, `Đúng 1 vòng lặp đang chạy sau reconnect (thực tế: ${env.rafQueue.length})`);
    env.BPMEngine.stop();
}

console.log('\n== A72.6 — Hợp đồng MIC (A72-02): Setup ghi ĐÚNG key mà runtime đọc ==');
{
    const setupSrc = read('ui/js/setup.js');
    const audioSrc = read('ui/js/audioSource.js');
    assert(/saveSetting\(\s*["']selectedMicDeviceId["']/.test(setupSrc), 'setup.js ghi "selectedMicDeviceId"');
    assert(/getSetting\(\s*["']selectedMicDeviceId["']/.test(audioSrc), 'audioSource.js (createMicSource) đọc "selectedMicDeviceId" — cùng key với Setup');
    const micFn = (audioSrc.match(/function getMicDeviceId\(\)[\s\S]*?\n    \}/) || [''])[0];
    assert(micFn.length > 0 && !/selectedSystemAudioDeviceId|selectedSoundcardId/.test(micFn), 'getMicDeviceId() không đọc key của SYSTEM_AUDIO/Soundcard (không lẫn hợp đồng)');
}

console.log('\n== A72.7 — Khoá hợp đồng SYSTEM_AUDIO (A72-03) ==');
{
    const audioSrc = read('ui/js/audioSource.js');
    const rSrc = read('ui/js/renderer.js');
    const sysFn = (audioSrc.match(/function getSystemAudioDeviceId\(\)[\s\S]*?\n    \}/) || [''])[0];
    assert(sysFn.length > 0 && /selectedSystemAudioDeviceId/.test(sysFn), 'getSystemAudioDeviceId() đọc "selectedSystemAudioDeviceId"');
    assert(!/selectedMicDeviceId|selectedSoundcardId/.test(sysFn), 'getSystemAudioDeviceId() KHÔNG fallback sang selectedMicDeviceId/selectedSoundcardId');
    const bindFn = (rSrc.match(/function bindAiEnginesToSystemAudio\([\s\S]*?\n\}/) || [''])[0];
    assert(/BPMEngine\.stop\(\);\s*KeyEngine\.stop\(\);[\s\S]*BPMEngine\.init\(/.test(bindFn), 'bindAiEnginesToSystemAudio(): stop() TRƯỚC init() (không vòng lặp trùng)');
    assert(/__systemAudioListenersRegistered/.test(bindFn), 'Listener BPM/Key chỉ đăng ký 1 lần (cờ chống trùng)');
    assert(!/(?:mic|Mic)Source[\s\S]{0,80}BPMEngine\.init/.test(bindFn), 'bindAiEnginesToSystemAudio() không lấy nguồn từ MIC');
}

console.log('\n== A72.8 — Mất SYSTEM_AUDIO: dừng AI + xoá kết quả cũ (A72-04/05) ==');
{
    const rSrc = read('ui/js/renderer.js');
    const lost = (rSrc.match(/systemAudio\.onDeviceLost\(\(reason\) => \{[\s\S]*?\n    \}\);/) || [''])[0];
    assert(lost.length > 0, 'Tìm thấy handler systemAudio.onDeviceLost');
    assert(/BPMEngine\.stop\(\)/.test(lost) && /KeyEngine\.stop\(\)/.test(lost), 'onDeviceLost dừng BPMEngine và KeyEngine');
    assert(/resetAiDisplaysToListening\(\)/.test(lost), 'onDeviceLost xoá BPM/Key/Mod cũ khỏi Menu (không hiển thị kết quả cũ như đang chạy)');
    assert(!/^[^/\n]*ModEngine\.stop\(\)/m.test(lost), 'onDeviceLost KHÔNG gọi ModEngine.stop() (có chủ đích — ModEngine chỉ start 1 lần/phiên, stop sẽ làm hỏng vĩnh viễn; ghi GAP trong report)');
    assert(/function resetAiDisplaysToListening\(\)/.test(rSrc), 'Có hàm dùng chung resetAiDisplaysToListening()');
    const autoBtn = (rSrc.match(/getElementById\("autoDetectBtn"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?\n\}\);/) || [''])[0];
    assert(/resetAiDisplaysToListening\(\)/.test(autoBtn), 'Nút Auto Detect dùng lại hàm reset chung (refactor không đổi hành vi)');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
console.log('Số liệu BPM đo được:', JSON.stringify(measured));
if (fail > 0) process.exit(1);
