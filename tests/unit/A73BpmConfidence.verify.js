/**
 * A73BpmConfidence.verify.js — TASK A73-03 (BPM Confidence contract)
 *
 * GIỚI HẠN: tín hiệu tổng hợp (đồng hồ ảo + analyser giả), KHÔNG phải audio thật/phần cứng.
 * Ngưỡng CV=0.15 trong bpmEngine.js là ĐỀ XUẤT TẠM THỜI — test này đo SỐ THẬT để Khói tham khảo
 * khi duyệt ngưỡng chính thức, không tự coi kết quả PASS ở đây là "đã chuẩn hoá".
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

const FRAME_MS = 1000 / 60;
function loadBpmEngine(clock) {
    const rafQueue = [];
    const sandbox = {
        console, Uint8Array, Float32Array, Math, Object, Array, Number,
        Date: { now: () => clock.t },
        requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
        cancelAnimationFrame: () => { rafQueue.length = 0; },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('ui/js/engines/bpmEngine.js'), sandbox);
    return { BPMEngine: sandbox.window.BPMEngine, rafQueue };
}
function makeAnalyser(state) {
    return {
        fftSize: 2048, frequencyBinCount: 1024, calls: 0,
        getByteFrequencyData(arr) { this.calls++; arr.fill(state.silence ? 0 : 10); if (!state.silence && state.beatNow) for (let i = 0; i < 220; i++) arr[i] = 200; },
        getByteTimeDomainData(arr) { arr.fill(128); },
    };
}
const fakeSource = { connect() {} };
function newEnv() {
    const clock = { t: 1_000_000 };
    const { BPMEngine, rafQueue } = loadBpmEngine(clock);
    const state = { silence: false, beatNow: false };
    const analyser = makeAnalyser(state);
    return { clock, BPMEngine, rafQueue, state, analyser, frameIdx: 0, confUpdates: [] };
}
function runSteadyBpm(env, seconds, bpm) {
    const framesPerBeat = 3600 / bpm;
    const frames = Math.round(seconds * 60);
    for (let f = 0; f < frames; f++) {
        env.frameIdx++;
        env.state.beatNow = Math.round(Math.round(env.frameIdx / framesPerBeat) * framesPerBeat) === env.frameIdx;
        env.clock.t += FRAME_MS;
        const cb = env.rafQueue.shift(); if (!cb) break; cb();
    }
}
function runJitter(env, seconds, meanMs, jitterFraction) {
    let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const frames = Math.round(seconds * 60);
    let nextBeatMs = env.clock.t + meanMs;
    for (let f = 0; f < frames; f++) {
        env.clock.t += FRAME_MS;
        if (env.clock.t >= nextBeatMs) {
            env.state.beatNow = true;
            const jitter = (rnd() * 2 - 1) * jitterFraction * meanMs;
            nextBeatMs = env.clock.t + meanMs + jitter;
        } else env.state.beatNow = false;
        const cb = env.rafQueue.shift(); if (!cb) break; cb();
    }
}
function runRandom(env, seconds, minMs, maxMs) {
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const frames = Math.round(seconds * 60);
    let nextBeat = env.clock.t + minMs + rnd() * (maxMs - minMs);
    for (let f = 0; f < frames; f++) {
        env.clock.t += FRAME_MS;
        if (env.clock.t >= nextBeat) { env.state.beatNow = true; nextBeat = env.clock.t + minMs + rnd() * (maxMs - minMs); }
        else env.state.beatNow = false;
        const cb = env.rafQueue.shift(); if (!cb) break; cb();
    }
}

console.log('\n== A73.1 — Tempo ổn định (100/120/128/140 BPM, 45s ảo): confidence CAO, stable=true ==');
const steadyResults = [];
for (const ref of [100, 120, 128, 140]) {
    const env = newEnv();
    env.BPMEngine.onConfidence((c) => env.confUpdates.push(c));
    env.BPMEngine.init({ createAnalyser: () => env.analyser }, fakeSource);
    runSteadyBpm(env, 45, ref);
    const conf = env.BPMEngine.getConfidence();
    steadyResults.push({ ref, conf });
    console.log(`     [đo] ${ref} BPM ổn định -> intervalCV=${conf?.intervalCV?.toFixed(4)} confidence=${conf?.confidence?.toFixed(3)} stable=${conf?.stable}`);
    assert(conf != null, `${ref} BPM: có object confidence`);
    assert(conf && conf.stable === true, `${ref} BPM ổn định: engine đánh giá stable=true (CV=${conf?.intervalCV?.toFixed(4)})`);
    assert(conf && conf.confidence > 0.7, `${ref} BPM ổn định: confidence cao (>0.7), thực tế=${conf?.confidence?.toFixed(3)}`);
    env.BPMEngine.stop();
}

console.log('\n== A73.2 — Beat ngẫu nhiên 0.3-1.3s (đúng ca A72 phát hiện "151 BPM giả"): stable phải là false ==');
{
    const env = newEnv();
    env.BPMEngine.onConfidence((c) => env.confUpdates.push(c));
    env.BPMEngine.init({ createAnalyser: () => env.analyser }, fakeSource);
    runRandom(env, 45, 300, 1300);
    const conf = env.BPMEngine.getConfidence();
    const confirmedBpm = env.BPMEngine.getCurrentBpm();
    console.log(`     [đo] beat ngẫu nhiên -> candidate=${env.BPMEngine.getCandidateBpm()} intervalCV=${conf?.intervalCV?.toFixed(4)} confidence=${conf?.confidence?.toFixed(3)} stable=${conf?.stable} | getCurrentBpm()=${confirmedBpm}`);
    if (conf) {
        assert(conf.stable === false, `Beat ngẫu nhiên: engine đánh giá stable=false (CV=${conf.intervalCV.toFixed(4)}, ngưỡng đề xuất 0.15)`);
        assert(conf.confidence < 0.5, `Beat ngẫu nhiên: confidence thấp (<0.5), thực tế=${conf.confidence.toFixed(3)}`);
    } else {
        assert(true, 'Beat ngẫu nhiên: chưa từng đủ 5 phiếu để có object confidence (cũng là kết quả CHẤP NHẬN ĐƯỢC — không confirm bậy)');
    }
    assert(confirmedBpm === null, `A73-03 điều kiện nghiệm thu: KHÔNG công bố BPM "confirmed" (getCurrentBpm()) từ nhịp ngẫu nhiên (thực tế: ${confirmedBpm}) — TRƯỚC A73 đã từng ra 151`);
    env.BPMEngine.stop();
}

console.log('\n== A73.3 — Jitter nhẹ (±5%, vẫn là tempo thật nhưng không tuyệt đối đều): ghi nhận số đo ==');
{
    const env = newEnv();
    env.BPMEngine.onConfidence((c) => env.confUpdates.push(c));
    env.BPMEngine.init({ createAnalyser: () => env.analyser }, fakeSource);
    runJitter(env, 45, 500, 0.05); // ~120 BPM +-5%
    const conf = env.BPMEngine.getConfidence();
    console.log(`     [đo] jitter ±5% quanh 120 BPM -> intervalCV=${conf?.intervalCV?.toFixed(4)} confidence=${conf?.confidence?.toFixed(3)} stable=${conf?.stable}`);
    assert(true, `Ghi nhận (không assert cứng — dùng để Khói tham khảo hiệu chỉnh ngưỡng): stable=${conf?.stable}, CV=${conf?.intervalCV?.toFixed(4)}`);
    env.BPMEngine.stop();
}

console.log('\n== A73.4 — Im lặng: không có candidate, không có confidence ==');
{
    const env = newEnv();
    env.BPMEngine.onConfidence((c) => env.confUpdates.push(c));
    env.BPMEngine.init({ createAnalyser: () => env.analyser }, fakeSource);
    // im lặng hoàn toàn — không set beatNow bao giờ
    for (let f = 0; f < 30 * 60; f++) { env.clock.t += FRAME_MS; const cb = env.rafQueue.shift(); if (!cb) break; cb(); }
    assert(env.BPMEngine.getConfidence() === null, 'Im lặng: getConfidence()=null (không có ứng viên nào để đánh giá)');
    assert(env.BPMEngine.getCandidateBpm() === null, 'Im lặng: getCandidateBpm()=null');
    assert(env.confUpdates.length === 0, 'Im lặng: onConfidence không fire lần nào');
    env.BPMEngine.stop();
}

console.log('\n== A73.5 — stop()/init() vô hiệu hoá confidence cũ ngay lập tức ==');
{
    const env = newEnv();
    env.BPMEngine.init({ createAnalyser: () => env.analyser }, fakeSource);
    runSteadyBpm(env, 45, 120);
    assert(env.BPMEngine.getConfidence() !== null, 'Trước stop(): có confidence');
    env.BPMEngine.stop();
    assert(env.BPMEngine.getConfidence() === null, 'Ngay sau stop(): getConfidence()=null (vô hiệu hoá ngay, không đợi init() lần sau)');
    assert(env.BPMEngine.getCandidateBpm() === null, 'Ngay sau stop(): getCandidateBpm()=null');
}

console.log('\n== A73.6 — Không đổi chữ ký onUpdate(bpm) hiện có (không phá vỡ renderer.js) ==');
{
    const bpmSrc = read('ui/js/engines/bpmEngine.js');
    assert(/listeners\.forEach\(\(cb\) => cb\(bestBpm\)\)/.test(bpmSrc), 'onUpdate() vẫn gọi callback(bpm) — 1 số, không đổi thành object (giữ tương thích renderer.js)');
    assert(/function onConfidence\(cb\)/.test(bpmSrc), 'Có API MỚI onConfidence() riêng cho ai muốn object chi tiết — không gộp vào onUpdate');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
console.log('Số liệu tempo ổn định:', JSON.stringify(steadyResults.map(r => ({ ref: r.ref, cv: r.conf?.intervalCV, confidence: r.conf?.confidence }))));
if (fail > 0) process.exit(1);
