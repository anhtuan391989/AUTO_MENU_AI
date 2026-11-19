/* TASK A-AUDIO-01 — kiểm tra thuật toán đo độ trễ vòng (hàm thuần) + nối giao diện Setup. Chạy: node tests/unit/AudioCalibrationA01.verify.js
   LƯU Ý: chỉ kiểm chứng THUẬT TOÁN bằng tín hiệu tổng hợp. KHÔNG chứng minh đo đúng trên card âm thanh/loa/mic thật (cần máy thật). */
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..', '..');
const AC = require(path.join(root, 'ui/js/audioCalibration.js'));
let pass = 0, fail = 0;
function check(l, c, d) { if (c) { pass++; console.log('  OK   ' + l); } else { fail++; console.log('  FAIL ' + l + (d !== undefined ? ' (thực tế: ' + JSON.stringify(d) + ')' : '')); } }
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function synth(sr, delayMs, noiseAmp, atten, times) {
    const burst = AC.makeChirp(sr, 40, 1000, 8000);
    const rec = new Float32Array(Math.round(sr * 3));
    for (let i = 0; i < rec.length; i++) rec[i] = noiseAmp * rnd();
    for (const t of times) { const p = Math.round((t + delayMs / 1000) * sr); for (let i = 0; i < burst.length && p + i < rec.length; i++) rec[p + i] += atten * burst[i]; }
    return { rec, burst };
}

console.log('== makeChirp ==');
const ch = AC.makeChirp(48000, 40);
check('chirp 40 ms @48k = 1920 mẫu', ch.length === 1920, ch.length);
check('chirp biên độ ≤ 1 và bắt đầu/kết thúc ≈ 0 (cửa sổ Hann)', Math.max(...ch.map(Math.abs)) <= 1 && Math.abs(ch[0]) < 1e-3 && Math.abs(ch[ch.length - 1]) < 1e-3);

console.log('\n== measureRoundTrip trên tín hiệu tổng hợp ==');
for (const sr of [44100, 48000]) {
    for (const d of [3, 12.5, 47, 120]) {
        const times = [0.3, 1.1, 1.9];
        const { rec, burst } = synth(sr, d, 0.02, 0.4, times);
        const r = AC.measureRoundTrip(rec, sr, burst, times, 0.6);
        check(`sr=${sr} trễ thật ${d} ms -> đo ${r.latencyMs && r.latencyMs.toFixed(2)} ms (sai số ≤ 0.1 ms)`, r.ok && Math.abs(r.latencyMs - d) <= 0.1, r);
    }
}
{
    const times = [0.3, 1.1, 1.9];
    const { rec, burst } = synth(48000, 20, 0.15, 0.2, times); // nhiễu to, tín hiệu nhỏ (SNR thấp)
    const r = AC.measureRoundTrip(rec, 48000, burst, times, 0.6);
    check('SNR thấp (nhiễu 0.15, chirp 0.2) vẫn đo đúng ±0.1 ms', r.ok && Math.abs(r.latencyMs - 20) <= 0.1, r);
}
{
    const times = [0.3, 1.1, 1.9];
    const { rec, burst } = synth(48000, 20, 0.05, 0, times); // KHÔNG có chirp nào (mic không nghe loa)
    const r = AC.measureRoundTrip(rec, 48000, burst, times, 0.6);
    check('chỉ có nhiễu -> ok=false, KHÔNG bịa ra độ trễ', r.ok === false && r.found <= 1, r);
}
{
    const times = [0.3, 1.1, 1.9];
    const { rec, burst } = synth(48000, 20, 0.02, 0.4, times);
    for (let i = Math.round(1.1 * 48000); i < Math.round(1.6 * 48000); i++) rec[i] = 0; // mất 1 burst
    const r = AC.measureRoundTrip(rec, 48000, burst, times, 0.6);
    check('mất 1/3 burst vẫn ok (median của 2 lần còn lại), found=2', r.ok && r.found === 2 && Math.abs(r.latencyMs - 20) <= 0.1, r);
}
{
    const r = AC.measureRoundTrip(new Float32Array(100), 48000, AC.makeChirp(48000, 40), [0.3], 0.6);
    check('rec quá ngắn/im lặng -> ok=false, không throw', r.ok === false);
}
console.log('\n== reportedLatencyMs ==');
check('baseLatency 0.01 + outputLatency 0.02 = 30 ms', Math.abs(AC.reportedLatencyMs({ baseLatency: 0.01, outputLatency: 0.02 }) - 30) < 1e-9);
check('không có thông tin -> null', AC.reportedLatencyMs({}) === null && AC.reportedLatencyMs(null) === null);

console.log('\n== Nối giao diện (tĩnh) ==');
const html = fs.readFileSync(path.join(root, 'ui/setup.html'), 'utf8');
const card = html.slice(html.indexOf('id="audioEngineCard"'), html.indexOf('</section>', html.indexOf('id="audioEngineCard"')));
check('khu Audio không còn thuộc tính disabled', !/disabled/.test(card));
check('không còn badge "Chưa có Engine" ở khu Audio', !card.includes('Chưa có Engine'));
check('có đủ 5 điều khiển có id', ['audioSampleRateSelect', 'audioBufferSelect', 'audioLatencyText', 'btnAudioTest', 'btnAudioCalibrate'].every((i) => card.includes('id="' + i + '"')));
check('setup.html nạp audioCalibration.js TRƯỚC setupAudioTest.js', html.indexOf('js/audioCalibration.js') > 0 && html.indexOf('js/audioCalibration.js') < html.indexOf('js/setupAudioTest.js'));
const ui = fs.readFileSync(path.join(root, 'ui/js/setupAudioTest.js'), 'utf8');
check('đọc đúng key output/mic đã có trong appSettings', ui.includes('selectedAudioOutputDeviceId') && ui.includes('selectedMicDeviceId'));
check('không đụng audioSource/renderer (không tham chiếu)', !/audioSource|renderer\.js/.test(ui.replace(/\/\*[\s\S]*?\*\//, '')));
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
