/**
 * SystemAudioLoopbackA78.verify.js — TASK A78
 * SYSTEM_AUDIO = "loopback:system" (Speaker01) -> getDisplayMedia (bỏ video), KHÔNG getUserMedia.
 * MIC dù có id "loopback:system" cũng KHÔNG được dùng loopback.
 * Chạy: node tests/unit/SystemAudioLoopbackA78.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };

function load(setting) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'audioSource.js'), 'utf8');
    const calls = { gum: 0, gdm: 0, videoStopped: 0, videoRemoved: 0 };
    class An { constructor() { this.fftSize = 2048; this.frequencyBinCount = 1024; } getByteTimeDomainData(a) { a.fill(128); } getByteFrequencyData(a) { a.fill(0); } }
    class Ctx { constructor() { this.state = 'running'; this.sampleRate = 48000; this.currentTime = 1; } createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return new An(); } resume() { return Promise.resolve(); } close() { return Promise.resolve(); } }
    const audioTrack = { addEventListener() {}, getSettings() { return { channelCount: 2 }; }, stop() {} };
    const mkStream = (withVideo, withAudio = true) => {
        const v = withVideo ? [{ stop() { calls.videoStopped++; } }] : [];
        return { getAudioTracks: () => (withAudio ? [audioTrack] : []), getVideoTracks: () => v.slice(), removeTrack() { calls.videoRemoved++; }, getTracks: () => [audioTrack] };
    };
    let dmAudio = true;
    const sandbox = {
        window: {}, AudioContext: Ctx, performance: { now: () => Date.now() },
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, console,
        getSetting: (k) => setting[k] || '',
        navigator: { mediaDevices: {
            getUserMedia: () => { calls.gum++; return Promise.resolve(mkStream(false)); },
            getDisplayMedia: () => { calls.gdm++; return Promise.resolve(mkStream(true, dmAudio)); },
        } },
    };
    sandbox.window.AudioContext = Ctx;
    vm.createContext(sandbox); vm.runInContext(src, sandbox);
    return { AS: sandbox.window.AudioSource, calls, noAudio: () => { dmAudio = false; } };
}

(async () => {
    console.log('\n== 1: SYSTEM_AUDIO + loopback:system -> getDisplayMedia, bỏ video ==');
    { const t = load({ selectedSystemAudioDeviceId: 'loopback:system' });
      const s = t.AS.createSystemAudioSource(); await s.start();
      ok(s.getState() === 'RUNNING', 'state RUNNING'); ok(t.calls.gdm === 1 && t.calls.gum === 0, 'dùng getDisplayMedia, không getUserMedia');
      ok(t.calls.videoStopped === 1 && t.calls.videoRemoved === 1, 'track video bị stop + remove'); }
    console.log('\n== 2: SYSTEM_AUDIO + deviceId thường -> vẫn getUserMedia (không đổi hành vi cũ) ==');
    { const t = load({ selectedSystemAudioDeviceId: 'abc' });
      const s = t.AS.createSystemAudioSource(); await s.start();
      ok(t.calls.gum === 1 && t.calls.gdm === 0, 'getUserMedia, không getDisplayMedia'); }
    console.log('\n== 3: chưa chọn -> NO_DEVICE ==');
    { const t = load({}); const s = t.AS.createSystemAudioSource(); await s.start();
      ok(s.getState() === 'NO_DEVICE' && t.calls.gdm === 0 && t.calls.gum === 0, 'NO_DEVICE, không mở gì'); }
    console.log('\n== 4: MIC không bao giờ dùng loopback ==');
    { const t = load({ selectedMicDeviceId: 'loopback:system' });
      const m = t.AS.createMicSource(); await m.start();
      ok(t.calls.gdm === 0, 'MIC không gọi getDisplayMedia'); }
    console.log('\n== 5: loopback không có audio track -> ERROR, không throw ==');
    { const t = load({ selectedSystemAudioDeviceId: 'loopback:system' }); t.noAudio();
      const s = t.AS.createSystemAudioSource(); await s.start();
      ok(s.getState() === 'ERROR', 'state ERROR'); }
    console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
