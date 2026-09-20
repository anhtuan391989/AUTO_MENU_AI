/**
 * AiKeyDetectionA60.verify.js — TASK A60 (AI Key Detection — Runtime Accuracy & Contract Audit)
 * ---------------------------------------------------------------------------
 * Chạy MÃ THẬT của ui/js/engines/keyEngine.js trong sandbox vm (đúng pattern đã dùng ở
 * A53/A58/A59) — KHÔNG viết lại thuật toán, KHÔNG mock logic chấm điểm. Vì keyEngine.js dùng
 * Web Audio API thật (AnalyserNode/AudioContext) không có trong Node, các test "accuracy" ở
 * đây gọi thẳng `KeyEngine.estimateKeyFromChroma(vector)` (hàm THẬT, public API) với các chroma
 * vector TỔNG HỢP mô phỏng đúng hình dạng Krumhansl-Schmuckler của từng key — đây là cách duy
 * nhất kiểm chứng được phần LÕI ÂM NHẠC (chấm điểm/chọn key) mà không cần audio hardware thật.
 * Phần trích xuất chroma từ FFT thật (updateChromaVector, cần AnalyserNode thật) KHÔNG kiểm
 * chứng được ở đây — ghi NOT VERIFIED rõ ràng, không suy diễn thành PASS.
 *
 * Chạy: node tests/unit/AiKeyDetectionA60.verify.js
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

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const keyEngineSrc = read('ui/js/engines/keyEngine.js');
const rendererSrc = read('ui/js/renderer.js');
const aiBootstrapSrc = read('core/ai/AIBootstrap.js');
const audioSourceSrc = read('ui/js/audioSource.js');
const indexHtml = read('ui/index.html');

function loadKeyEngine() {
    const sandbox = {
        console,
        window: {},
        requestAnimationFrame: () => {},
        cancelAnimationFrame: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        Date,
        Math,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSrc, sandbox);
    return sandbox.KeyEngine;
}

function initFresh(KeyEngine) {
    const analyser = { fftSize: 0, smoothingTimeConstant: -1, frequencyBinCount: 4096, getFloatFrequencyData: () => {} };
    const ctx = { createAnalyser: () => analyser, sampleRate: 48000 };
    const source = { connect: () => {} };
    KeyEngine.init(ctx, source);
    return { analyser, ctx, source };
}

const KS_MAJOR = [1.000, 0.065, 0.630, 0.088, 0.710, 0.568, 0.095, 0.851, 0.075, 0.688, 0.098, 0.425];
const KS_MINOR = [1.000, 0.072, 0.573, 0.782, 0.082, 0.571, 0.082, 0.851, 0.608, 0.082, 0.629, 0.082];
function rotate(profile, steps) {
    const s = ((steps % 12) + 12) % 12;
    return profile.slice(12 - s).concat(profile.slice(0, 12 - s));
}
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

console.log('== A60.1 — Xác định chính xác KeyEngine đang chạy (entry point thật, không suy luận từ tên file) ==');
{
    assert(/<script src="js\/engines\/keyEngine\.js">/.test(indexHtml),
        'ui/index.html nạp ĐÚNG file ui/js/engines/keyEngine.js làm global KeyEngine (script thật của cửa sổ chính)');
    assert(/KeyEngine\.init\(audioContext, source\)/.test(rendererSrc),
        'renderer.js gọi KeyEngine.init(audioContext, source) — entry point runtime thật');
    assert(/window\.__keyDetectStopWatcher = KeyEngine\.detectOnce\(/.test(rendererSrc),
        'renderer.js dùng KeyEngine.detectOnce() (không phải watchContinuous) làm cơ chế thật để lấy kết quả Key');

    const coreKeyEngineSrc = read('core/ai/engines/KeyEngine.js');
    assert(coreKeyEngineSrc.trim().length === 0,
        'core/ai/engines/KeyEngine.js hoàn toàn RỖNG (0 byte) — xác nhận đây KHÔNG PHẢI runtime thật, chỉ là tên file gây nhầm lẫn');

    const kernelSrc = read('core/ai/kernel/BootLoader.js');
    assert(/\/\/\s*const KeyEngine = require\("\.\.\/engines\/KeyEngine"\)/.test(kernelSrc),
        'core/ai/kernel/BootLoader.js — dòng require core/ai/engines/KeyEngine.js đã bị COMMENT OUT (double-dead: file rỗng + cũng không được require) — bằng chứng mạnh hơn A56 (trước đây chỉ xác nhận BootLoader.js không được ai require tới)');
    assert(!/require\(["']\.\/kernel\/BootLoader["']\)/.test(aiBootstrapSrc),
        'AIBootstrap.js (điểm khởi động AI thật, được app/main.js gọi) vẫn KHÔNG require core/ai/kernel/BootLoader.js — nhánh kernel/engines trùng lặp vẫn hoàn toàn dead');
}

console.log('\n== A60.2 — Pipeline audio: SYSTEM_AUDIO là nguồn DUY NHẤT, MIC không thể lọt vào KeyEngine (audit B58, không sửa) ==');
{
    assert(/const systemAudio = AudioSource\.createSystemAudioSource\(\)/.test(rendererSrc),
        'renderer.js lấy nguồn audio cho Key/BPM qua AudioSource.createSystemAudioSource() (không phải createMicSource())');
    assert(/const audioContext = systemAudio\.getAudioContextForAdapter\(\)/.test(rendererSrc) &&
        /const source = systemAudio\.getRawSourceNodeForAdapter\(\)/.test(rendererSrc),
        'renderer.js lấy audioContext/source cho KeyEngine.init() ĐÚNG từ systemAudio (SYSTEM_AUDIO), không tự tạo getUserMedia thứ 2');

    // Bằng chứng CẤU TRÚC (không chỉ quy ước đặt tên): getRawSourceNodeForAdapter chỉ tồn tại
    // trên instance có exposeRawNodeForAdapter=true — xác nhận chỉ SYSTEM_AUDIO có option này.
    const micFactory = audioSourceSrc.slice(audioSourceSrc.indexOf('function createMicSource'), audioSourceSrc.indexOf('function createSystemAudioSource'));
    const sysFactory = audioSourceSrc.slice(audioSourceSrc.indexOf('function createSystemAudioSource'));
    assert(!/exposeRawNodeForAdapter/.test(micFactory),
        'createMicSource() KHÔNG truyền exposeRawNodeForAdapter -> getRawSourceNodeForAdapter KHÔNG TỒN TẠI trên MIC instance (không chỉ là quy ước, là bất khả thi về cấu trúc)');
    assert(/exposeRawNodeForAdapter:\s*true/.test(sysFactory),
        'createSystemAudioSource() truyền exposeRawNodeForAdapter:true — CHỈ SYSTEM_AUDIO có adapter cho AI');
    assert(/requireExplicitDevice:\s*true/.test(sysFactory),
        'SYSTEM_AUDIO bắt buộc requireExplicitDevice:true — không rơi về thiết bị mặc định nếu chưa chọn ở Setup');

    // Sample rate / FFT: đọc TRỰC TIẾP từ audioContext thật khi init() chạy (không hard-code)
    const KeyEngine = loadKeyEngine();
    const { analyser } = initFresh(KeyEngine);
    assert(analyser.fftSize === 8192, `KeyEngine dùng fftSize=8192 (thực tế: ${analyser.fftSize})`);
    assert(analyser.smoothingTimeConstant === 0, 'AnalyserNode.smoothingTimeConstant=0 (không làm mượt tần số ở tầng AnalyserNode — mượt do chính KeyEngine tự làm qua CHROMA_SMOOTHING, tránh làm mượt 2 lần)');
    assert(/const sampleRate = audioCtxRef\?\.sampleRate \|\| 48000/.test(keyEngineSrc),
        'sample rate đọc THẬT từ audioCtxRef.sampleRate (chỉ fallback 48000 khi không có, không hard-code ghi đè giá trị thật)');
}

console.log('\n== A60.3 — Accuracy (synthetic canonical profile — KHÔNG PHẢI audio thật, xem giới hạn ở A60-REPORT.md) ==');
{
    const KeyEngine = loadKeyEngine();
    initFresh(KeyEngine);

    const cases = [
        ['C Major', rotate(KS_MAJOR, NOTE['C']), 'C Major'],
        ['A minor', rotate(KS_MINOR, NOTE['A']), 'A Minor'],
        ['G Major', rotate(KS_MAJOR, NOTE['G']), 'G Major'],
        ['E minor', rotate(KS_MINOR, NOTE['E']), 'E Minor'],
    ];
    const cleanMargins = [];
    cases.forEach(([label, vector, expectedKey]) => {
        const r = KeyEngine.estimateKeyFromChroma(vector);
        assert(r.key === expectedKey, `Chroma dạng KS-profile chuẩn của "${label}" -> estimateKeyFromChroma() nhận diện ĐÚNG "${expectedKey}" (thực tế: "${r.key}")`);
        cleanMargins.push(r.margin);
    });

    // Silence: vector rỗng hoàn toàn -> không có năng lượng nào để cosine-similarity phân biệt
    const rSilent = KeyEngine.estimateKeyFromChroma(new Array(12).fill(0));
    assert(rSilent.confidence === 0, 'Chroma im lặng hoàn toàn (all-zero) -> confidence=0 (gate hasMusicalContent chưa từng được bật bởi FFT năng lượng thật)');

    // Noisy/chromatic: năng lượng dàn đều cả 12 nốt (không có tâm điệu tính) -> margin phải rất nhỏ
    // (gần tie giữa nhiều ứng viên) — so sánh TƯƠNG ĐỐI với margin của tín hiệu sạch, không đặt
    // ngưỡng tuyệt đối tự nghĩ ra (margin tuyệt đối của thuật toán này nhỏ ngay cả với tín hiệu
    // sạch — đặc điểm đã biết của phương pháp KS-profile khi các key liền kề chia sẻ nhiều nốt
    // chung, KHÔNG phải lỗi cần "sửa" trong A60).
    const rNoisy = KeyEngine.estimateKeyFromChroma(new Array(12).fill(0.5));
    assert(rNoisy.margin <= Math.min(...cleanMargins),
        `Chroma "trắng" (12 nốt năng lượng bằng nhau, không tâm điệu tính) cho margin (${rNoisy.margin.toFixed(4)}) NHỎ HƠN HOẶC BẰNG margin nhỏ nhất trong 4 case sạch (${Math.min(...cleanMargins).toFixed(4)}) — đúng hướng: tín hiệu không có tâm điệu tính phải mơ hồ hơn tín hiệu có, dù giá trị tuyệt đối đều nhỏ`);

    // Determinism: cùng input phải luôn ra cùng output (không có yếu tố ngẫu nhiên/thời gian ẩn)
    const r1 = KeyEngine.estimateKeyFromChroma(rotate(KS_MAJOR, NOTE['C']));
    const r2 = KeyEngine.estimateKeyFromChroma(rotate(KS_MAJOR, NOTE['C']));
    assert(r1.key === r2.key && r1.margin === r2.margin,
        'Cùng 1 chroma vector đầu vào luôn cho ra ĐÚNG cùng 1 kết quả (estimateKeyFromChroma là hàm xác định, không phụ thuộc thời gian/ngẫu nhiên ẩn)');

    console.log('  NOT VERIFIED  Độ chính xác trên audio thật (micro/loopback thật, nhạc thật) — cần Windows + audio hardware thật, KHÔNG được suy ra PASS từ test synthetic ở trên. Test synthetic CHỈ xác nhận lõi chấm điểm/chọn key hoạt động đúng lý thuyết âm nhạc khi được cấp đúng hình dạng chroma KS-profile — KHÔNG xác nhận bước trích xuất chroma từ FFT thật (updateChromaVector) hoạt động chính xác trên tín hiệu thật.');
}

console.log('\n== A60.4 — Stability/false switching: xác nhận CẤU TRÚC debounce tồn tại và được nối đúng (không mô phỏng full real-time) ==');
{
    assert(/const STABLE_CHECKS = 4/.test(keyEngineSrc) && /const CHECK_INTERVAL_MS = 1500/.test(keyEngineSrc),
        'Hằng số STABLE_CHECKS=4, CHECK_INTERVAL_MS=1500ms tồn tại (chu kỳ kiểm tra ổn định chậm)');
    assert(/const VOTE_WINDOW = 8/.test(keyEngineSrc) && /const VOTE_MIN_AGREE = 5/.test(keyEngineSrc),
        'Hằng số VOTE_WINDOW=8, VOTE_MIN_AGREE=5 tồn tại (cơ chế biểu quyết đa số)');
    assert(/const STABILITY_REQUIRED_TICKS = 2/.test(keyEngineSrc),
        'Hằng số STABILITY_REQUIRED_TICKS=2 tồn tại (Stability Lock — Task A35)');
    assert(/function isTrueModulation\(/.test(keyEngineSrc) && /function updateCandidateHistory\(/.test(keyEngineSrc),
        'Hàm isTrueModulation()/updateCandidateHistory() tồn tại (phân biệt modulation thật với dao động thoáng qua)');
    assert(/const candidateStable = updateCandidateHistory\(candidateKey\)/.test(keyEngineSrc) &&
        /isTrueModulation\(lastLockedKey, currentFullKey, result\.margin, avgMargin\)/.test(keyEngineSrc),
        'Cả 2 cơ chế trên được GỌI THẬT bên trong vòng lặp fast-path (runVoteLoop) trước khi khoá Key mới — không chỉ định nghĩa suông, có nối dây thật');
    assert(/if \(candidateKey === fastPathLastFiredKey\) return;/.test(keyEngineSrc),
        'Có chặn phát lại (fire) cùng 1 key liên tiếp nhiều lần (fastPathLastFiredKey) — tránh gọi onWinner() lặp vô ích cho cùng 1 kết quả');

    console.log('  NOT VERIFIED  Hành vi debounce/ổn định THẬT theo thời gian thực với audio thay đổi liên tục (vd đổi hợp âm giữa bài) — cần mô phỏng chuỗi frame theo đúng nhịp CHECK_INTERVAL_MS/FAST_PATH_INTERVAL_MS thật hoặc audio thật; không nằm trong phạm vi test tĩnh/single-frame ở A60 này.');
}

console.log('\n== A60.5 — AI -> Manual isolation: regression (không redesign Manual Key) ==');
{
    assert(/keySource\.ai\.value = result\.key;/.test(rendererSrc),
        'AI detect ghi vào keySource.ai.value (không phải keySource.manual)');
    const valueAssignSites = (rendererSrc.match(/keySource\.ai\.value\s*=/g) || []);
    assert(valueAssignSites.length === 1, `keySource.ai.value chỉ có đúng 1 điểm gán (thực tế: ${valueAssignSites.length})`);
    assert(!/keySource\.manual\.\w+\s*=\s*keySource\.ai\./.test(rendererSrc),
        'Không có dòng nào gán keySource.manual.X = keySource.ai.Y (AI detect không ghi vào Manual Key)');

    const coreAIContextSrc = read('core/ai/AIContext.js');
    assert(!/[Mm]anual/.test(coreAIContextSrc),
        'core/ai/AIContext.js (tầng Core, nhận reportAiResult("key",...)) không có bất kỳ tham chiếu nào tới "manual"/"Manual"');

    // Manual SEND không gửi AI Key: tìm hàm applyActiveKeyToPlugin, xác nhận nó đọc theo NGUỒN
    // ĐANG ACTIVE (getActiveSourceName()) chứ không hard-code luôn dùng keySource.ai.
    assert(/getActiveSourceName\(\)/.test(rendererSrc),
        'renderer.js có hàm getActiveSourceName() quyết định nguồn nào (ai/manual/songDb) đang thật sự active trước khi gửi lệnh — không hard-code luôn ưu tiên AI');
}

console.log('\n== A60.6 — Malformed result fail-safe (regression IPC, không đổi hành vi core) ==');
{
    const mainSrc = read('app/main.js');
    function extractAiResultHandler() {
        const marker = 'ipcMain.on("ai-result",';
        const start = mainSrc.indexOf(marker);
        const braceIdx = mainSrc.indexOf('{', mainSrc.indexOf('=>', start));
        let depth = 0, i = braceIdx;
        for (; i < mainSrc.length; i++) { if (mainSrc[i] === '{') depth++; else if (mainSrc[i] === '}') { depth--; if (depth === 0) break; } }
        const body = mainSrc.slice(braceIdx, i + 1);
        // eslint-disable-next-line no-new-func
        return new Function('AIContext', 'EventBus', 'Events', 'Logger', 'event', 'arg', 'seenUnknownAiResultTypes', `
            const handler = (event, ${'{ type, payload } = {}'}) => ${body};
            return handler(event, arg);
        `);
    }
    const AIContext = require(path.join(root, 'core/ai/AIContext'));
    const EventBus = require(path.join(root, 'core/events/EventBus'));
    const Events = require(path.join(root, 'core/events/Events'));
    const FakeLogger = { error: () => {}, warning: () => {}, info: () => {} };
    const seenTypes = new Set();

    const badKeyPayloads = [
        ['payload=null', { type: 'key', payload: null }],
        ['payload thiếu field key', { type: 'key', payload: { confidence: 0.9 } }],
        ['payload.key là số thay vì string', { type: 'key', payload: { key: 12345 } }],
        ['payload rỗng', { type: 'key', payload: {} }],
    ];
    badKeyPayloads.forEach(([label, arg]) => {
        let threw = false;
        try { extractAiResultHandler()(AIContext, EventBus, Events, FakeLogger, {}, arg, seenTypes); } catch { threw = true; }
        assert(threw === false, `ai-result type="key" với ${label} -> KHÔNG throw ra ngoài main process (regression từ A58/A59, không đổi trong A60)`);
    });
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
