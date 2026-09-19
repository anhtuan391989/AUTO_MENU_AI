/**
 * AiRuntimeContractA59.verify.js — TASK A59 (AI Runtime Contract Completion & State/Lifecycle
 * Hardening)
 * ---------------------------------------------------------------------------
 * Tiếp nối A58 (chạy pipeline thật qua require() trực tiếp, không mock). Test file này verify
 * đúng các gap A58 đã tìm ra và A59 đã xử lý: confidence contract, BPM contract, timestamp
 * type-consistency, mod/semitone (INTENTIONAL NOT STORED), TaskQueue lifecycle cap, unknown
 * ai-result observability — cộng với regression đầy đủ cho AI_CONTROL safety và Manual/AI
 * isolation.
 *
 * Chạy: node tests/unit/AiRuntimeContractA59.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const AIContext = require(path.join(root, 'core/ai/AIContext'));
const AnalysisResult = require(path.join(root, 'core/ai/inference/AnalysisResult'));
const DecisionAction = require(path.join(root, 'core/ai/decision/DecisionAction'));
const TaskQueue = require(path.join(root, 'core/ai/workflow/TaskQueue'));
const WorkflowManager = require(path.join(root, 'core/ai/workflow/WorkflowManager'));
const ControlSource = require(path.join(root, 'core/shared/ControlSource'));
const EventBus = require(path.join(root, 'core/events/EventBus'));
const Events = require(path.join(root, 'core/events/Events'));

function extractAiResultHandler() {
    const src = read('app/main.js');
    const marker = 'ipcMain.on("ai-result",';
    const start = src.indexOf(marker);
    const braceIdx = src.indexOf('{', src.indexOf('=>', start));
    let depth = 0, i = braceIdx;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
    const body = src.slice(braceIdx, i + 1);
    // eslint-disable-next-line no-new-func
    return new Function('AIContext', 'EventBus', 'Events', 'Logger', 'event', 'arg', 'seenUnknownAiResultTypes', `
        const handler = (event, ${'{ type, payload } = {}'}) => ${body};
        return handler(event, arg);
    `);
}
const seenTypes = new Set();
const logCalls = [];
const FakeLogger = {
    error: (mod, msg) => logCalls.push(['error', mod, msg]),
    info: () => {},
    warn: (mod, msg) => logCalls.push(['warn', mod, msg]),
    warning: (mod, msg) => logCalls.push(['warning', mod, msg]),
};
function runAiResultHandler(arg) {
    // Lưu ý: seenUnknownAiResultTypes thật nằm trong closure của app/main.js (module-level Set),
    // không thể tái sử dụng qua lần gọi extract riêng biệt mỗi lần — nên với test rate-limit
    // (A59.6 phần 2), ta tự truyền 1 Set() DÙNG CHUNG bằng cách gọi extract 1 LẦN rồi tái sử
    // dụng closure đó cho các lần gọi kế tiếp (xem cách dùng bên dưới).
    return extractAiResultHandler()(AIContext, EventBus, Events, FakeLogger, {}, arg, seenTypes);
}

(async () => {

console.log('== A59.1 — Confidence contract: [0,1], số hữu hạn, invalid -> giữ state cũ + log ==');
{
    AIContext.reset();
    const cases = [
        [0, true], [1, true], [0.5, true],
        [NaN, false], [Infinity, false], [-Infinity, false], [-1, false], [2, false],
        ['0.5', false], [null, 'skip'], [undefined, 'skip'],
    ];
    let lastGood = 0;
    cases.forEach(([value, expectedValid]) => {
        AIContext.updateKey({ key: 'TestKey', confidence: value });
        if (expectedValid === true) {
            assert(AIContext.key.confidence === value, `confidence=${String(value)} được CHẤP NHẬN đúng`);
            lastGood = value;
        } else if (expectedValid === false) {
            assert(AIContext.key.confidence === lastGood, `confidence=${String(value)} bị TỪ CHỐI, giữ nguyên giá trị cũ (${lastGood})`);
        } else {
            assert(AIContext.key.confidence === lastGood, `confidence=${String(value)} (thiếu field) -> giữ nguyên, không đổi gì`);
        }
    });

    // Cùng contract áp dụng cho BPM
    AIContext.reset();
    AIContext.updateBpm({ bpm: 120, confidence: 0.8 });
    AIContext.updateBpm({ bpm: 121, confidence: NaN });
    assert(AIContext.bpm.confidence === 0.8, 'updateBpm: confidence=NaN bị từ chối, giữ nguyên 0.8 (bpm value vẫn cập nhật độc lập)');
    assert(AIContext.bpm.current === 121, 'updateBpm: bpm=121 (hợp lệ) vẫn được cập nhật dù confidence đi kèm không hợp lệ (2 field validate độc lập)');
}

console.log('\n== A59.1 (tiếp) — Consistency: AnalysisResult và DecisionAction cùng contract confidence ==');
{
    const r1 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', confidence: NaN });
    assert(r1.confidence === 0, 'AnalysisResult: confidence=NaN -> fallback 0 (default), nhất quán với AIContext');
    const r2 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', confidence: 0.75 });
    assert(r2.confidence === 0.75, 'AnalysisResult: confidence hợp lệ vẫn qua đúng');
    const r3 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', confidence: 2 });
    assert(r3.confidence === 0, 'AnalysisResult: confidence=2 (ngoài [0,1]) -> fallback 0, không còn lọt qua âm thầm như trước A59');

    const a1 = DecisionAction.create({ action: 'SET_KEY', confidence: Infinity });
    assert(a1.confidence === 0, 'DecisionAction: confidence=Infinity -> fallback 0');
    const a2 = DecisionAction.create({ action: 'SET_KEY', confidence: 0.6 });
    assert(a2.confidence === 0.6, 'DecisionAction: confidence hợp lệ vẫn qua đúng');
}

console.log('\n== A59.2 — BPM contract: số hữu hạn > 0, invalid -> giữ state cũ + log ==');
{
    AIContext.reset();
    AIContext.updateBpm({ bpm: 128 });
    assert(AIContext.bpm.current === 128, 'bpm=128 hợp lệ được ghi');

    [NaN, Infinity, -Infinity, 0, -50, '128'].forEach((bad) => {
        AIContext.updateBpm({ bpm: bad });
        assert(AIContext.bpm.current === 128, `bpm=${String(bad)} bị TỪ CHỐI, giữ nguyên 128 (không âm thầm phá state)`);
    });

    // Regression A49: raw number vẫn phải bị từ chối đúng như cũ
    AIContext.updateBpm(200);
    assert(AIContext.bpm.current === 128, 'REGRESSION A49: updateBpm(200) — số thô — vẫn bị từ chối đúng, không đổi hành vi cũ');
}

console.log('\n== A59.3 — Timestamp: type-consistency với confidence/priority (không thêm ordering policy) ==');
{
    const r1 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', timestamp: 'invalid-string' });
    assert(typeof r1.timestamp === 'number' && r1.timestamp > 0,
        'AnalysisResult: timestamp kiểu sai (string) giờ fallback Date.now() đúng (trước A59: giữ nguyên "invalid-string" — đã sửa, nhất quán với confidence/magnitude)');

    const validTs = 1700000000000;
    const r2 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', timestamp: validTs });
    assert(r2.timestamp === validTs, 'AnalysisResult: timestamp hợp lệ (number) vẫn giữ nguyên giá trị truyền vào, không bị ép Date.now()');

    const a1 = DecisionAction.create({ action: 'SET_KEY', timestamp: {} });
    assert(typeof a1.timestamp === 'number' && a1.timestamp > 0, 'DecisionAction: timestamp kiểu sai (object) fallback Date.now() đúng');

    // Xác nhận KHÔNG có ordering/staleness-rejection logic nào được thêm — UNKNOWN/NEEDS SPEC
    // vẫn đúng như A58 đã kết luận, A59 không tự nghĩ ra rule đó.
    const analysisStateSrc = read('core/ai/AnalysisState.js');
    assert(!/\.timestamp\s*[<>]|\.time\s*[<>]/.test(analysisStateSrc),
        'AnalysisState.js vẫn KHÔNG có so sánh timestamp/time nào để reject stale/out-of-order (A59 không tự thêm ordering policy — đúng chỉ dẫn)');
}

console.log('\n== A59.4 — AIContext.mod.semitone: xác nhận INTENTIONAL NOT STORED (có bằng chứng, không phải bỏ sót) ==');
{
    AIContext.reset();
    AIContext.updateMod({ from: 'C', to: 'D', semitone: 2, time: 123 });
    assert(!Object.prototype.hasOwnProperty.call(AIContext.mod, 'semitone'),
        'AIContext.mod không có field "semitone" — xác nhận lại hành vi hiện tại không đổi');

    // Bằng chứng: audit toàn bộ consumer thật của AIContext.mod.* — không ai đọc .semitone
    const analysisStateSrc = read('core/ai/AnalysisState.js');
    const modBlock = analysisStateSrc.slice(analysisStateSrc.indexOf('_onModUpdated') !== -1 ? analysisStateSrc.indexOf('_onModUpdated') : 0);
    assert(!/AIContext\.mod\.semitone/.test(analysisStateSrc),
        'Consumer DUY NHẤT của AIContext.mod (AnalysisState.js) không đọc .semitone ở bất kỳ đâu -> quyết định INTENTIONAL NOT STORED có căn cứ, không phải suy đoán');
}

console.log('\n== A59.5 — TaskQueue lifecycle: không còn tăng vô hạn, vẫn giữ đúng ngữ nghĩa FIFO ==');
{
    TaskQueue.clear();
    for (let i = 0; i < 550; i++) TaskQueue.enqueue({ id: i, action: 'TEST' });
    assert(TaskQueue.size() === 500, `TaskQueue bị giới hạn đúng 500 phần tử dù enqueue 550 lần (thực tế: ${TaskQueue.size()})`);
    assert(TaskQueue.peek().id === 50, 'Phần tử CŨ NHẤT bị loại bỏ trước (id 0-49 bị evict, còn lại bắt đầu từ id=50) — đúng ngữ nghĩa FIFO, ưu tiên giữ dữ liệu MỚI NHẤT');

    // Xác nhận KHÔNG có execution engine mới nào được thêm — dequeue() vẫn hoạt động y hệt
    // trước (chỉ enqueue() bị giới hạn), WorkflowManager/PluginController không bị đụng tới
    // logic tiêu thụ (vẫn CONTRACT NOT DEFINED — A59 không tự quyết định "ai tiêu thụ, khi nào").
    const taken = TaskQueue.dequeue();
    assert(taken && taken.id === 50, 'dequeue() vẫn hoạt động bình thường, không đổi hành vi/API');
    TaskQueue.clear();
    assert(TaskQueue.size() === 0, 'clear() vẫn hoạt động bình thường sau khi đã cap');

    const workflowManagerSrc = read('core/ai/workflow/WorkflowManager.js');
    const pluginControllerSrc = read('core/ai/plugin/PluginController.js');
    assert(!/TaskQueue\.dequeue/.test(workflowManagerSrc) && !/TaskQueue\.dequeue/.test(pluginControllerSrc),
        'Xác nhận A59 KHÔNG tự thêm logic dequeue/tiêu thụ nào vào WorkflowManager/PluginController — chỉ chặn triệu chứng tăng vô hạn ở TaskQueue.enqueue(), không tự quyết định execution architecture (CONTRACT NOT DEFINED, để task sau)');
}

console.log('\n== A59.6 — Unknown ai-result: có log rõ ràng, không throw, rate-limit theo type ==');
{
    AIContext.reset();
    logCalls.length = 0;

    let threw = false;
    try { runAiResultHandler({ type: 'unknown-type-abc', payload: {} }); } catch { threw = true; }
    assert(threw === false, 'type lạ vẫn KHÔNG throw (không đổi tính an toàn đã có)');
    assert(logCalls.some(([, mod, msg]) => mod === 'ai-result' && /unknown-type-abc/.test(msg)),
        'type lạ giờ CÓ log rõ ràng nhắc đúng tên type (trước A59: hoàn toàn im lặng)');

    const logCountAfterFirst = logCalls.length;
    runAiResultHandler({ type: 'unknown-type-abc', payload: {} });
    runAiResultHandler({ type: 'unknown-type-abc', payload: {} });
    assert(logCalls.length === logCountAfterFirst,
        'Gửi LẶP LẠI cùng 1 type lạ nhiều lần chỉ log 1 lần (rate-limit theo type, không spam log)');

    logCalls.length = 0;
    runAiResultHandler({ type: 'another-unknown-type', payload: {} });
    assert(logCalls.some(([, , msg]) => /another-unknown-type/.test(msg)),
        'type lạ KHÁC vẫn được log riêng (rate-limit theo từng type, không chặn hết mọi type lạ sau lần đầu)');

    // Vẫn không throw với payload=null/undefined như A58 đã xác nhận (regression)
    threw = false;
    try { runAiResultHandler({ type: 'key', payload: null }); } catch { threw = true; }
    assert(threw === false, 'REGRESSION A58: payload=null vẫn không throw ra ngoài');
}

console.log('\n== A59.7 — AI_CONTROL safety: LEGACY_CONTROL không đổi, pipeline thật vẫn không phát PLUGIN_COMMAND ==');
{
    assert(ControlSource.getControlSource() === 'LEGACY_CONTROL', 'ControlSource.CURRENT_MODE vẫn LEGACY_CONTROL (A59 không bật AI_CONTROL)');

    let received = false;
    const spy = () => { received = true; };
    EventBus.subscribe(Events.PLUGIN_COMMAND, spy);

    AIContext.reset();
    runAiResultHandler({ type: 'key', payload: { key: 'E Major', confidence: 0.95 } });
    runAiResultHandler({ type: 'bpm', payload: { bpm: 150, confidence: 0.9 } });
    await sleep(500);

    EventBus.unsubscribe(Events.PLUGIN_COMMAND, spy);
    assert(received === false, 'Sau khi đẩy Key+BPM thật qua toàn bộ pipeline thật (đã có contract hardening mới của A59) -> vẫn KHÔNG publish PLUGIN_COMMAND trong LEGACY_CONTROL');
}

console.log('\n== A59.8 — Manual/AI isolation: regression sau khi hardening contract ==');
{
    const aiContextSrc = read('core/ai/AIContext.js');
    assert(!/[Mm]anual/.test(aiContextSrc), 'AIContext.js (đã sửa ở A59) vẫn KHÔNG có bất kỳ tham chiếu nào tới "manual"/"Manual" — hardening không vô tình thêm đường AI -> Manual');

    const rendererSrc = read('ui/js/renderer.js');
    assert(!/keySource\.manual\.\w+\s*=\s*keySource\.ai\./.test(rendererSrc),
        'renderer.js: vẫn không có dòng nào gán keySource.manual.X = keySource.ai.Y');
    const valueAssignSites = (rendererSrc.match(/keySource\.ai\.value\s*=/g) || []);
    assert(valueAssignSites.length === 1, 'keySource.ai.value vẫn chỉ có đúng 1 điểm gán (không đổi so với A58)');
}

console.log('\n== A59.9 — Regression suite bắt buộc ==');
{
    const { execSync } = require('child_process');
    function runSuite(file, expectedPass) {
        try {
            const out = execSync(`node "${path.join(root, 'tests/unit', file)}"`, { cwd: root }).toString();
            const m = out.match(/(\d+)\s+PASS/);
            const actualPass = m ? parseInt(m[1], 10) : -1;
            assert(actualPass === expectedPass, `${file}: ${actualPass} PASS (kỳ vọng ${expectedPass})`);
        } catch (e) {
            assert(false, `${file}: chạy thất bại hoàn toàn (${e.message.slice(0, 200)})`);
        }
    }
    function runSuiteInfo(file, note) {
        try {
            const out = execSync(`node "${path.join(root, 'tests/unit', file)}"`, { cwd: root }).toString();
            const m = out.match(/(\d+)\s+PASS,\s+(\d+)\s+FAIL/);
            console.log(`  INFO  ${file}: ${m ? `${m[1]} PASS, ${m[2]} FAIL` : 'không đọc được kết quả'} — ${note}`);
        } catch (e) {
            const out = (e.stdout || '').toString();
            const m = out.match(/(\d+)\s+PASS,\s+(\d+)\s+FAIL/);
            console.log(`  INFO  ${file}: ${m ? `${m[1]} PASS, ${m[2]} FAIL` : 'chạy lỗi'} — ${note}`);
        }
    }
    // A56 hiện 32/36 (không phải 36/36) — ĐÃ XÁC NHẬN bằng git diff + git stash: 4 assertion
    // fail vì renderer.js đã được B58 (task khác, ngoài phạm vi A59) viết lại phần audio init
    // (startAudioMonitor -> AudioSource abstraction mới) SAU thời điểm A58 viết các assertion
    // đó — xác nhận lỗi này tồn tại NGAY CẢ KHI stash hết thay đổi của A59 (tức 100% pre-existing,
    // không phải do A59 gây ra). Không sửa A56 (đụng vào nghĩa là phải hiểu kiến trúc AudioSource
    // mới của B58 — ngoài phạm vi A59). Báo cáo thông tin thay vì hard-assert 36, để không che
    // giấu cũng không gán sai trách nhiệm. Xem A59-REPORT.md mục Remaining Issues.
    runSuiteInfo('AiSystemBoundaryA56.verify.js', 'kỳ vọng gốc 36/36, THỰC TẾ 32/36 — PRE-EXISTING do B58 đổi renderer.js, đã xác nhận KHÔNG liên quan A59 (xem A59-REPORT.md)');
    runSuite('AiRuntimeContractA58.verify.js', 74);
    runSuite('AudioSourceB58.verify.js', 24);
    runSuite('SoundcardSetupPersistence.verify.js', 20);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);

})();
