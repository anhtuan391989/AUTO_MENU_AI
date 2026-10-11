/**
 * AiKeyFast05.verify.js — TASK AI-KEY-FAST-05. Chỉ kiểm tra PROBE chẩn đoán (không đổi công thức Key) bằng keyEngine.js THẬT + analyser giả.
 * KHÔNG phải bằng chứng runtime Windows.
 */
const fs = require('fs'), path = require('path');
const { create } = require('../helpers/keyEngineSim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const k = read('ui/js/engines/keyEngine.js'), r = read('ui/js/renderer.js'), a = read('ui/js/audioSource.js');

console.log('\n== 1. Probe tại điểm KeyEngine đọc phổ (keyEngine.js thật) ==');
{
    const e = create({ root: 0, mode: 'major' }); e.KeyEngine.init(e.ctx, { connect() {} }); e.step(1000);
    const p = e.KeyEngine.getDebugSnapshot().inputProbe;
    ok(p && p.frames > 30 && p.framesWithContent > 30 && p.lastMaxDb !== null && p.finiteBins > 0 && p.sampleRate === 48000 && p.fftSize === 8192 && p.binCount === 4096, `có nhạc: frames=${p && p.frames}, content=${p && p.framesWithContent}, maxDb=${p && p.lastMaxDb}, sr/fft/bins đúng`);
    ok(p.lastContentRms > 0.0005, `contentRms=${p.lastContentRms.toExponential(2)} > ngưỡng 0.0005 (ngưỡng không đổi)`);
    ok(e.KeyEngine.getDebugSnapshot().chromaVector.some((v) => v > 0), 'chroma có dữ liệu khi có nhạc');
    // Im lặng: analyser trả -Infinity
    const s = create({ root: 0, mode: 'major' }); s.KeyEngine.init({ sampleRate: 48000, createAnalyser: () => ({ fftSize: 8192, frequencyBinCount: 4096, smoothingTimeConstant: 0, getFloatFrequencyData(arr) { arr.fill(-Infinity); } }) }, { connect() {} }); s.step(1000);
    const q = s.KeyEngine.getDebugSnapshot();
    ok(q.inputProbe.frames > 30 && q.inputProbe.framesWithContent === 0 && q.inputProbe.lastMaxDb === null && q.inputProbe.finiteBins === 0, 'buffer toàn -Infinity: probe báo maxDb=null, finiteBins=0, content=0 (phân biệt được "không có tín hiệu")');
    ok(q.hasMusicalContent === false && q.chromaVector.every((v) => v === 0), 'im lặng KHÔNG tạo chroma/Key giả (hành vi cũ giữ nguyên)');
    // Tín hiệu yếu dưới ngưỡng nội dung: có bin hữu hạn nhưng contentRms < 0.0005
    const w = create({ root: 0, mode: 'major' }); w.KeyEngine.init({ sampleRate: 48000, createAnalyser: () => ({ fftSize: 8192, frequencyBinCount: 4096, smoothingTimeConstant: 0, getFloatFrequencyData(arr) { arr.fill(-90); } }) }, { connect() {} }); w.step(1000);
    const wp = w.KeyEngine.getDebugSnapshot().inputProbe;
    ok(wp.lastMaxDb === -90 && wp.finiteBins > 0 && wp.framesWithContent === 0, 'tín hiệu rất yếu (-90 dB): probe thấy maxDb=-90 nhưng không đạt cổng nội dung -> phân biệt "yếu" với "không có"');
}
console.log('\n== 2. Công thức/ngưỡng không đổi ==');
ok(/const frameHasContent = contentCount > 0 && Math\.sqrt\(contentRms \/ contentCount\) > 0\.0005;/.test(k), 'cổng nội dung 0.0005 giữ nguyên nguyên văn');
ok(/hasMusicalContent = contentEnergyEMA >= 0\.5;/.test(k) && /FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k), 'EMA 0.5, fast-path 1200ms/streak 3 giữ nguyên');
ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(r), 'timer 2000ms giữ nguyên');
ok(/__meta\.gen === __aiCycleGen[\s\S]{0,120}__meta\.epoch === window\.__aiEngineEpoch[\s\S]{0,80}__meta\.src === window\.__aiEngineSrc/.test(r), 'guard FAST-02 giữ nguyên');
console.log('\n== 3. Chẩn đoán renderer/audioSource ==');
ok(/aiDiag\("KEY_TRIGGER", \{ caller,/.test(r) && /new Error\(\)\.stack/.test(r), 'KEY_TRIGGER ghi caller (stack) + gen/epoch/watcher/meta/srcState');
ok(/window\.__aiLastLevel/.test(r) && /out\.keyInput = d\.inputProbe/.test(r) && /out\.sourceInfo = /.test(r), '__aiDiagStatus có keyInput, musicVuLevel (BPMEngine = nguồn Music VU), sourceInfo');
ok(/if \(options\.exposeRawNodeForAdapter\) \{[\s\S]*api\.getDiagnostics/.test(a), 'getDiagnostics chỉ có ở SYSTEM_AUDIO (cùng điều kiện adapter, MIC không có)');
ok(!/getUserMedia/.test(a.slice(a.indexOf('api.getDiagnostics'), a.indexOf('api.getDiagnostics') + 700)), 'chẩn đoán không mở thiết bị');
console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
