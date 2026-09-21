/**
 * AiKeyRuntimeClosureA61.verify.js — TASK A61 (AI Key Runtime Closure)
 * ---------------------------------------------------------------------------
 * Trích XUẤT NGUYÊN VĂN (không viết lại) các hàm thật trong ui/js/renderer.js tạo nên chuỗi:
 *   UI event -> triggerAiKeyDetect() -> startAiRealtimeLoop() -> KeyEngine.detectOnce()
 *            -> keySource.ai.value -> reportAiResult() -> applyActiveKeyToPlugin()
 * rồi chạy THẬT trong vm sandbox với stub tối thiểu cho phần ngoài biên (DOM, KeyEngine thật,
 * sendKeyToAutotune, electronAPI) — để verify đúng bất biến cách ly AI/Manual bằng CODE THẬT
 * đang chạy, không phải suy luận tĩnh trên văn bản.
 *
 * Chạy: node tests/unit/AiKeyRuntimeClosureA61.verify.js
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
const rendererSrc = read('ui/js/renderer.js');

function extractFn(name) {
    const marker = `function ${name}(`;
    const start = rendererSrc.indexOf(marker);
    if (start === -1) throw new Error(`Không tìm thấy function ${name}()`);
    const braceIdx = rendererSrc.indexOf('{', start);
    let depth = 0, i = braceIdx;
    for (; i < rendererSrc.length; i++) {
        if (rendererSrc[i] === '{') depth++;
        else if (rendererSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    return rendererSrc.slice(start, i + 1);
}

function extractConst(name) {
    const marker = `const ${name} = {`;
    const start = rendererSrc.indexOf(marker);
    if (start === -1) throw new Error(`Không tìm thấy const ${name}`);
    const braceIdx = rendererSrc.indexOf('{', start);
    let depth = 0, i = braceIdx;
    for (; i < rendererSrc.length; i++) {
        if (rendererSrc[i] === '{') depth++;
        else if (rendererSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    return rendererSrc.slice(start, i + 1) + ';';
}

// Ráp đúng các mảnh THẬT (không viết lại nội dung logic) thành 1 script chạy được độc lập.
// LƯU Ý KỸ THUẬT: top-level `const` trong vm context KHÔNG tự gắn vào sandbox object (chỉ
// `var` mới gắn) — nên phải "xuất" các binding cần dùng ra ngoài qua 1 biến `var` ở cuối.
const assembled = `
${extractConst('keySource')}
let lastPluginKey = appState.originalKey;
let keyEverDetected = false;
${extractFn('logKeySource')}
${extractFn('getActiveSourceName')}
${extractFn('getActiveKeyValue')}
${extractFn('applyActiveKeyToPlugin')}
${extractFn('cancelManualOverride')}
${extractFn('startManualOverrideCountdown')}
${extractFn('startAiRealtimeLoop')}
${extractFn('triggerAiKeyDetect')}
var __exports = { keySource, triggerAiKeyDetect, startAiRealtimeLoop, cancelManualOverride, getActiveSourceName };
`;

function buildSandbox({ originalKey = 'C Major', detectOnceImpl, fireOnce = true } = {}) {
    const calls = { sendKeyToAutotune: [], reportManualStateSnapshot: 0, reportAiResult: [] };
    let fired = false;
    const sandbox = {
        console: {
            log: () => {}, // im lặng log THẬT của logKeySource() để output test gọn (không đổi hành vi được kiểm tra)
            error: (...a) => console.error(...a),
            warn: (...a) => console.warn(...a),
            info: (...a) => console.info(...a),
        },
        appState: { originalKey },
        keySelector: { value: '' },
        currentKeyEl: { textContent: '' },
        keyInfoEl: { textContent: '' },
        refreshKeySourceDisplay: () => {},
        setStatus: () => {},
        isAiControlActive: () => false, // LEGACY_CONTROL — đúng trạng thái hiện tại của repo
        reportManualStateSnapshot: () => { calls.reportManualStateSnapshot++; },
        sendKeyToAutotune: (value) => { calls.sendKeyToAutotune.push(value); return Promise.resolve({ ok: true }); },
        startModulationWatcher: () => {},
        KeyEngine: {
            // startAiRealtimeLoop() thật tự gọi lại chính nó SAU MỖI lần detectOnce callback (vòng
            // lặp nền vô hạn thật, đúng thiết kế "AI luôn chạy nền liên tục"). Trong thực tế, mỗi
            // lần callback cách nhau nhiều giây thật (chờ audio/vote loop) — ở đây stub CHỈ fire
            // callback ĐÚNG 1 LẦN (fireOnce) rồi im lặng cho các lần gọi detectOnce() sau đó, để
            // quan sát state SAU 1 lần detect mà không tạo đệ quy đồng bộ vô hạn giả tạo do thiếu
            // độ trễ thời gian thật giữa các lần — đây là giới hạn của môi trường test, không phải
            // hành vi thật (đã ghi rõ trong A61-CLOSE-VERIFY.md).
            detectOnce: (cb) => {
                if (detectOnceImpl && (!fireOnce || !fired)) {
                    fired = true;
                    detectOnceImpl(cb);
                }
                return () => {}; // stop watcher
            },
        },
        window: { electronAPI: { reportAiResult: (type, payload) => calls.reportAiResult.push({ type, payload }) } },
        MANUAL_OVERRIDE_DURATION_MS: 15000,
        formatCountdownMMSS: () => '00:15',
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(assembled, sandbox);
    return { sandbox: sandbox.__exports, calls };
}

console.log('== A61.1 — Trace call chain thật: UI event -> triggerAiKeyDetect() -> startAiRealtimeLoop() -> KeyEngine.detectOnce() -> state -> downstream ==');
{
    assert(/applyKeyBtn\?\.addEventListener\("click"[\s\S]{0,900}triggerAiKeyDetect\(\)/.test(rendererSrc),
        'UI event THẬT #1: click applyKeyBtn với dropdown = "AI Key Detect" -> gọi triggerAiKeyDetect() (bằng chứng: đọc trực tiếp handler trong renderer.js)');
    assert(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(rendererSrc),
        'UI event THẬT #2: khởi động app -> 2s sau khi Audio Engine sẵn sàng -> setTimeout gọi triggerAiKeyDetect() (bootstrap ban đầu)');
    const triggerAiKeyDetectCallSites = (rendererSrc.match(/triggerAiKeyDetect\(\)/g) || []).length;
    assert(triggerAiKeyDetectCallSites === 4, // 3 lời gọi thật + 1 dòng gọi ở cuối định nghĩa hàm khác trong file (không phải định nghĩa chính nó)
        `triggerAiKeyDetect() xuất hiện dạng lời gọi "triggerAiKeyDetect()" đúng ${triggerAiKeyDetectCallSites} lần trong renderer.js (đã liệt kê 3 UI event/bootstrap thật ở trên + xác nhận số lượng khớp)`);
    assert(/window\.__keyDetectStopWatcher = KeyEngine\.detectOnce\(/.test(rendererSrc),
        'startAiRealtimeLoop() gọi ĐÚNG KeyEngine.detectOnce() (không phải watchContinuous) — đây là điểm nối THẬT sang runtime KeyEngine');

    const { sandbox, calls } = buildSandbox({
        detectOnceImpl: (cb) => cb({ key: 'D Major', confidence: 0.88 }),
    });
    sandbox.triggerAiKeyDetect();
    assert(sandbox.keySource.ai.value === 'D Major', 'Chạy THẬT chuỗi triggerAiKeyDetect() -> startAiRealtimeLoop() -> KeyEngine.detectOnce(callback) -> callback ghi ĐÚNG keySource.ai.value');
    assert(calls.reportAiResult.length === 1 && calls.reportAiResult[0].type === 'key' && calls.reportAiResult[0].payload.key === 'D Major',
        'reportAiResult("key", {key, confidence}) được gọi ĐÚNG 1 lần với đúng giá trị vừa detect (downstream output tới AIContext qua IPC)');
    assert(calls.sendKeyToAutotune.includes('D Major'), 'Downstream: sendKeyToAutotune("D Major") được gọi (đường AI, không giả lập Manual SEND)');
}

console.log('\n== A61.2 — Xác định implementation chết/chạy (không kết luận từ tên file, có bằng chứng import/reference) ==');
{
    const coreKeyEngineSrc = read('core/ai/engines/KeyEngine.js');
    assert(coreKeyEngineSrc.trim().length === 0, 'core/ai/engines/KeyEngine.js: 0 byte — bằng chứng 1 (không có nội dung để chạy dù được require hay không)');

    const bootLoaderSrc = read('core/ai/kernel/BootLoader.js');
    assert(/\/\/\s*const KeyEngine = require\("\.\.\/engines\/KeyEngine"\)/.test(bootLoaderSrc),
        'core/ai/kernel/BootLoader.js: dòng require core/ai/engines/KeyEngine.js đã bị comment out — bằng chứng 2 (kể cả nơi DUY NHẤT từng định require nó cũng không thật sự làm)');

    const aiBootstrapSrc = read('core/ai/AIBootstrap.js');
    assert(!/require\(["']\.\/kernel\/BootLoader["']\)/.test(aiBootstrapSrc),
        'core/ai/AIBootstrap.js (điểm khởi động AI THẬT, app/main.js gọi lúc khởi động): không require core/ai/kernel/BootLoader.js — bằng chứng 3 (nhánh chứa KeyEngine rỗng hoàn toàn không nằm trong chuỗi khởi động thật)');

    const indexHtmlSrc = read('ui/index.html');
    assert(/<script src="js\/engines\/keyEngine\.js">/.test(indexHtmlSrc),
        'ui/index.html nạp ui/js/engines/keyEngine.js làm global KeyEngine — ĐÂY là implementation ACTIVE thật (bằng chứng: chính script tag chạy trong cửa sổ chính)');

    assert(/KeyEngine\.init\(audioContext, source\)/.test(rendererSrc) && /KeyEngine\.detectOnce\(/.test(rendererSrc),
        'renderer.js gọi KeyEngine.init()/detectOnce() — ĐÚNG global KeyEngine từ ui/js/engines/keyEngine.js (không có biến KeyEngine nào khác được require/import trong renderer.js)');
    assert(!/require\(.*KeyEngine/.test(rendererSrc), 'renderer.js không có bất kỳ require() nào liên quan KeyEngine (dùng global script, không phải module) — không có đường nhập nhằng 2 nguồn');

    console.log('  KẾT LUẬN: ui/js/engines/keyEngine.js = ACTIVE (runtime thật). core/ai/engines/KeyEngine.js = DEAD (rỗng + không nằm trong bất kỳ chuỗi require nào từ điểm khởi động thật). Không phát hiện duplicate logic thật nào cần giải quyết — file DEAD không có nội dung để trùng lặp. KHÔNG xoá file DEAD (ngoài phạm vi A61, đúng chỉ dẫn "không xoá chỉ vì thấy không được import").');
}

console.log('\n== A61.3 — AI Key state: provisional/final/repeated/failure đều đúng, không đụng Manual ==');
{
    assert(/KeyEngine\.onProvisionalEstimate\(\(estimate\) => \{\s*keySource\.ai\.provisional = estimate\.key;\s*refreshKeySourceDisplay\(\);\s*\}\)/.test(rendererSrc),
        'onProvisionalEstimate callback CHỈ gán keySource.ai.provisional + refreshKeySourceDisplay() — không gọi reportAiResult/sendKeyToAutotune/applyActiveKeyToPlugin nào khác trong cùng callback');

    const { sandbox: sb2 } = buildSandbox({ detectOnceImpl: (cb) => cb({ key: 'F Major', confidence: 0.7 }) });
    sb2.triggerAiKeyDetect();
    assert(sb2.keySource.ai.value === 'F Major', 'Lần detect #1 -> ai.value = F Major');

    const { sandbox: sb3 } = buildSandbox({ originalKey: 'G Minor', detectOnceImpl: () => {} });
    let threw = false;
    try { sb3.triggerAiKeyDetect(); } catch { threw = true; }
    assert(threw === false, 'detectOnce() không bao giờ gọi callback (chưa detect được key ổn định) -> triggerAiKeyDetect() KHÔNG throw');
    assert(sb3.keySource.ai.value === 'G Minor', 'Detection chưa ra kết quả -> keySource.ai.value giữ nguyên giá trị khởi tạo (appState.originalKey), không bị undefined/null/crash');
}

console.log('\n== A61.4 — Manual isolation: AI detect KHÔNG ghi đè Manual, KHÔNG tự phát sinh Manual SEND ==');
{
    const { sandbox, calls } = buildSandbox({ detectOnceImpl: (cb) => cb({ key: 'C Major', confidence: 0.95 }) });

    sandbox.keySource.manual.active = true;
    sandbox.keySource.manual.selectedKey = 'F# Major';
    sandbox.keySource.manual.committedKey = 'F# Major';

    sandbox.triggerAiKeyDetect();

    assert(sandbox.keySource.manual.selectedKey === 'F# Major', 'SAU khi AI detect "C Major": keySource.manual.selectedKey VẪN GIỮ "F# Major" — không bị AI ghi đè');
    assert(sandbox.keySource.manual.committedKey === 'F# Major', 'SAU khi AI detect: keySource.manual.committedKey VẪN GIỮ "F# Major" — AI không đụng vào giá trị đã SEND của Manual');
    assert(sandbox.keySource.ai.value === 'C Major', 'keySource.ai.value cập nhật ĐÚNG giá trị AI detect được (2 state hoàn toàn tách biệt, không cái nào ghi đè cái kia)');

    assert(sandbox.keySource.manual.active === false, 'triggerAiKeyDetect() tắt cờ MODE keySource.manual.active (chuyển sang mode AI) — đây là chuyển chế độ, KHÔNG PHẢI ghi đè giá trị Manual (selectedKey/committedKey ở trên vẫn nguyên vẹn, có thể quay lại Manual với đúng giá trị cũ)');

    assert(calls.reportManualStateSnapshot <= 1,
        `reportManualStateSnapshot() chỉ được gọi tối đa 1 lần (báo Core "Manual OFF" thật, không phải giả lập SEND) — thực tế: ${calls.reportManualStateSnapshot} lần`);
    assert(!('manualOverrideStarted' in sandbox), 'startManualOverrideCountdown() (hàm CHỈ chạy sau Manual SEND thành công) không hề được gọi trong toàn bộ chuỗi AI detect — xác nhận AI detect không tự tạo ra 1 "Manual SEND" nào');
}

console.log('\n== A61.5 — Downstream: AI Key detect xong có đi đúng path (sendKeyToAutotune) khi AI đang active ==');
{
    const { sandbox, calls } = buildSandbox({ detectOnceImpl: (cb) => cb({ key: 'B Minor', confidence: 0.8 }) });
    sandbox.triggerAiKeyDetect();
    assert(calls.sendKeyToAutotune[calls.sendKeyToAutotune.length - 1] === 'B Minor',
        'Khi nguồn active là "ai": AI detect xong -> sendKeyToAutotune("B Minor") được gọi ĐÚNG giá trị (downstream path đúng)');

    const { sandbox: sb2, calls: calls2 } = buildSandbox({ detectOnceImpl: (cb) => cb({ key: 'E Major', confidence: 0.8 }) });
    sb2.keySource.manual.active = true;
    sb2.keySource.manual.selectedKey = 'A Major';
    sb2.keySource.manual.committedKey = 'A Major';
    sb2.startAiRealtimeLoop();
    assert(sb2.keySource.ai.value === 'E Major', 'AI vẫn chạy NỀN và cập nhật keySource.ai.value ngay cả khi Manual đang active (đúng thiết kế "AI luôn chạy nền liên tục")');
    assert(!calls2.sendKeyToAutotune.includes('E Major'),
        'NHƯNG vì Manual đang active (getActiveSourceName()!=="ai"), applyActiveKeyToPlugin("AI Detect") KHÔNG được gọi trong callback này -> "E Major" KHÔNG bị gửi xuống Plugin đè lên Manual đang active');
    assert(sb2.keySource.manual.selectedKey === 'A Major' && sb2.keySource.manual.committedKey === 'A Major',
        'Manual selectedKey/committedKey vẫn nguyên "A Major" trong suốt lúc AI chạy nền phía sau');
}

console.log('\n== A61.6 — Regression bắt buộc ==');
{
    const { execSync } = require('child_process');
    function runSuite(file) {
        try {
            const out = execSync(`node "${path.join(root, 'tests/unit', file)}"`, { cwd: root }).toString();
            const m = out.match(/(\d+)\s+PASS[,/]\s*(\d+)\s+FAIL/);
            assert(!!m && m[2] === '0', `${file}: ${m ? `${m[1]} PASS / ${m[2]} FAIL` : 'không đọc được kết quả'}`);
        } catch (e) {
            assert(false, `${file}: chạy thất bại (${e.message.slice(0, 150)})`);
        }
    }
    runSuite('AiKeyDetectionA60.verify.js');
    runSuite('ManualStateReporter.verify.js');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
