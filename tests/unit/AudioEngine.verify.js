/**
 * AudioEngine.verify.js — TASK B13
 * ---------------------------------------------------------------------------
 * Test trực tiếp ui/js/audioEngine.js — load thật bằng cách stub `window` tối thiểu (file
 * không đụng `document`, chỉ dùng `window` + `Audio` — tương tự cách test midiHealth.js).
 * Dùng FakeAudio (mock HTMLAudioElement) để mô phỏng play() thành công/thất bại thật, không
 * cần trình duyệt thật.
 *
 * Chạy: node tests/unit/AudioEngine.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function loadAudioEngine() {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'audioEngine.js'), 'utf8');
    const sandboxWindow = {};
    const fn = new Function('window', code + '\nreturn window.AudioEngine;');
    return fn(sandboxWindow);
}

// FakeAudio mô phỏng HTMLAudioElement — có thể cấu hình play() thành công hay ném lỗi (giả
// lập file không tồn tại/404, giống hệt hành vi thật của trình duyệt khi src sai).
function makeFakeAudioCtor({ shouldFail = false, failMessage = 'NotSupportedError: no supported source' } = {}) {
    return class FakeAudio {
        constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; }
        play() {
            if (shouldFail) return Promise.reject(new Error(failMessage));
            return Promise.resolve();
        }
    };
}

(async () => {
    console.log('== Volume: setClapVolume/setLaughVolume convert đúng 0-100 -> 0.0-1.0, ĐỘC LẬP hoàn toàn ==');
    {
        const AudioEngine = loadAudioEngine();
        AudioEngine.setClapVolume(50);
        AudioEngine.setLaughVolume(80);
        assert(AudioEngine.getClapVolume01() === 0.5, `Clap 50 -> 0.5 (thực tế: ${AudioEngine.getClapVolume01()})`);
        assert(AudioEngine.getLaughVolume01() === 0.8, `Laugh 80 -> 0.8 (thực tế: ${AudioEngine.getLaughVolume01()})`);
        AudioEngine.setClapVolume(0);
        assert(AudioEngine.getClapVolume01() === 0, 'Clap=0 (biên dưới) đúng 0.0, không lỗi kiểu falsy');
        assert(AudioEngine.getLaughVolume01() === 0.8, 'Đổi Clap KHÔNG ảnh hưởng Laugh (vẫn 0.8) — 2 state hoàn toàn tách biệt');
    }

    console.log('\n== Clamp: giá trị ngoài 0-100 vẫn được kẹp về 0.0-1.0 an toàn ==');
    {
        const AudioEngine = loadAudioEngine();
        AudioEngine.setClapVolume(150);
        assert(AudioEngine.getClapVolume01() === 1, `value>100 kẹp về 1.0 (thực tế: ${AudioEngine.getClapVolume01()})`);
        AudioEngine.setClapVolume(-20);
        assert(AudioEngine.getClapVolume01() === 0, `value<0 kẹp về 0.0 (thực tế: ${AudioEngine.getClapVolume01()})`);
    }

    console.log('\n== play(): chưa cấu hình HTMLAudioElement khả dụng -> NOT_CONFIGURED, không giả PASS ==');
    {
        const AudioEngine = loadAudioEngine();
        const r = await AudioEngine.playClap(null); // ép không có Audio ctor khả dụng
        assert(r.ok === false && r.reason === 'NOT_CONFIGURED', `NOT_CONFIGURED khi không có Audio ctor (thực tế: ${JSON.stringify(r)})`);
    }

    console.log('\n== play(): file không load được (giả lập lỗi thật, giống 404) -> PLAYBACK_FAILED, KHÔNG báo ok:true giả ==');
    {
        const AudioEngine = loadAudioEngine();
        const FailingAudio = makeFakeAudioCtor({ shouldFail: true });
        const r = await AudioEngine.playClap(FailingAudio);
        assert(r.ok === false && r.reason === 'PLAYBACK_FAILED', `PLAYBACK_FAILED khi Audio.play() thật sự lỗi (thực tế: ${JSON.stringify(r)})`);
        assert(r.detail.includes('assets/sounds/clap.mp3'), `detail nêu đúng đường dẫn quy ước đang dùng (thực tế: ${r.detail})`);
    }

    console.log('\n== play(): file load + play thành công thật -> ok:true ==');
    {
        const AudioEngine = loadAudioEngine();
        const WorkingAudio = makeFakeAudioCtor({ shouldFail: false });
        const rClap = await AudioEngine.playClap(WorkingAudio);
        const rLaugh = await AudioEngine.playLaugh(WorkingAudio);
        assert(rClap.ok === true, `playClap() ok:true khi play() thật thành công (thực tế: ${JSON.stringify(rClap)})`);
        assert(rLaugh.ok === true, `playLaugh() ok:true độc lập, không phụ thuộc Clap (thực tế: ${JSON.stringify(rLaugh)})`);
    }

    console.log('\n== setClapSamplePath()/setLaughSamplePath(): ghi đè đường dẫn quy ước, 2 bên độc lập ==');
    {
        const AudioEngine = loadAudioEngine();
        AudioEngine.setClapSamplePath('custom/my-clap.mp3');
        assert(AudioEngine.getClapResolvedPath() === 'custom/my-clap.mp3', `Clap dùng đúng path tự cấu hình (thực tế: ${AudioEngine.getClapResolvedPath()})`);
        assert(AudioEngine.getLaughResolvedPath() === 'assets/sounds/laugh.mp3', `Laugh KHÔNG bị ảnh hưởng, vẫn dùng path quy ước mặc định (thực tế: ${AudioEngine.getLaughResolvedPath()})`);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
