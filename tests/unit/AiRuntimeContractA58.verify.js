/**
 * AiRuntimeContractA58.verify.js — TASK A58 (AI Runtime Contract Hardening & Verification)
 * ---------------------------------------------------------------------------
 * Khác với A56 (chỉ audit tĩnh bằng regex), A58 khai thác việc toàn bộ core/ai/** +
 * core/shared/{ControlSource,ManualState,ManualPriorityGuard}.js là module Node THUẦN
 * (không phụ thuộc Electron) — nên có thể require() và VẬN HÀNH THẬT ngay trong Node, đẩy
 * event thật qua EventBus thật, quan sát state thật thay đổi qua toàn bộ pipeline thật:
 *
 *   AIContext -> AnalysisState -> InferenceEngine -> ResultQueue -> DecisionEngine ->
 *   WorkflowManager -> PluginController
 *
 * Không mock bất kỳ lớp nào ở giữa — chỉ mock đúng biên ngoài cùng (IPC renderer<->main,
 * vì cần Electron thật). File này CHỈ ĐỌC/QUAN SÁT hành vi hiện có — không sửa
 * core/ai/**, không bật AI_CONTROL.
 *
 * Chạy: node tests/unit/AiRuntimeContractA58.verify.js
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

// ---- Nạp pipeline THẬT (singleton, side-effect: đăng ký listener ngay khi require) ----
const AIContext = require(path.join(root, 'core/ai/AIContext'));
const AnalysisState = require(path.join(root, 'core/ai/AnalysisState'));
require(path.join(root, 'core/ai/inference/InferenceEngine'));
const ResultQueue = require(path.join(root, 'core/ai/aggregation/ResultQueue'));
require(path.join(root, 'core/ai/decision/DecisionEngine'));
const WorkflowManager = require(path.join(root, 'core/ai/workflow/WorkflowManager'));
const TaskQueue = require(path.join(root, 'core/ai/workflow/TaskQueue'));
require(path.join(root, 'core/ai/plugin/PluginController'));
const ControlSource = require(path.join(root, 'core/shared/ControlSource'));
const ManualState = require(path.join(root, 'core/shared/ManualState'));
const ManualPriorityGuard = require(path.join(root, 'core/shared/ManualPriorityGuard'));
const EventBus = require(path.join(root, 'core/events/EventBus'));
const Events = require(path.join(root, 'core/events/Events'));

// ---- Trích nguyên văn handler ipcMain.on("ai-result") thật từ app/main.js để test malformed
//      IPC payload mà KHÔNG cần Electron thật (đúng pattern extractFn đã dùng ở các task trước) ----
function extractAiResultHandler() {
    const src = read('app/main.js');
    const marker = 'ipcMain.on("ai-result",';
    const start = src.indexOf(marker);
    const braceIdx = src.indexOf('{', src.indexOf('=>', start));
    let depth = 0, i = braceIdx;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
    const body = src.slice(braceIdx, i + 1);
    // eslint-disable-next-line no-new-func
    return new Function('AIContext', 'EventBus', 'Events', 'Logger', 'event', 'arg', `
        const handler = (event, ${'{ type, payload } = {}'}) => ${body};
        return handler(event, arg);
    `);
}
const FakeLogger = { error: () => {}, info: () => {}, warn: () => {} };
const runAiResultHandler = (arg) => extractAiResultHandler()(AIContext, EventBus, Events, FakeLogger, {}, arg);

(async () => {

console.log('== A58.1/2 — Valid Key/BPM/Mod result: contract + state transition đúng ==');
{
    AIContext.reset();

    AIContext.updateKey({ key: 'C Major', confidence: 0.8 });
    assert(AIContext.key.current === 'C Major', 'updateKey: key.current cập nhật đúng');
    assert(AIContext.key.previous === null, 'updateKey lần đầu: key.previous = null (chưa có current cũ)');
    assert(AIContext.key.confidence === 0.8, 'updateKey: confidence cập nhật đúng');
    assert(AIContext.key.stable === true, 'updateKey: stable = true sau khi có ít nhất 1 lần update');

    AIContext.updateKey({ key: 'G Major', confidence: 0.9 });
    assert(AIContext.key.previous === 'C Major', 'updateKey lần 2: previous = current CŨ (không phải giá trị mới) — đúng semantics "previous là state trước đó"');
    assert(AIContext.key.current === 'G Major', 'updateKey lần 2: current = giá trị mới');

    AIContext.updateBpm({ bpm: 128, confidence: 0.7 });
    assert(AIContext.bpm.current === 128 && AIContext.bpm.confidence === 0.7, 'updateBpm: object hợp lệ cập nhật đúng cả 2 field');

    AIContext.updateMod({ from: 'C Major', to: 'D Major', semitone: 2, time: 12345 });
    assert(AIContext.mod.detected === true && AIContext.mod.from === 'C Major' && AIContext.mod.to === 'D Major',
        'updateMod: detected/from/to cập nhật đúng');
}

console.log('\n== A58.1 (finding) — updateMod() KHÔNG lưu field "semitone" (payload có, AIContext.mod không có chỗ chứa) ==');
{
    // Đây là GHI NHẬN hành vi hiện tại (contract gap), KHÔNG phải bug được sửa trong A58 —
    // xem A58-REPORT.md mục "Findings". Test này khoá lại đúng hành vi HIỆN TẠI để không ai
    // vô tình nghĩ semitone đã được lưu đâu đó trong AIContext.
    AIContext.reset();
    AIContext.updateMod({ from: 'C Major', to: 'D Major', semitone: 2, time: 12345 });
    assert(!Object.prototype.hasOwnProperty.call(AIContext.mod, 'semitone'),
        'FINDING (không sửa trong A58): AIContext.mod không có field "semitone" — payload.semitone bị lặng lẽ bỏ qua khi lưu vào Core (renderer vẫn giữ semitone ở biến cục bộ riêng để tự gửi Plugin, nên không ảnh hưởng hành vi hiện tại — nhưng nếu sau này có module Core nào cần đọc semitone từ AIContext.mod, sẽ không có).');
    assert(AIContext.mod.confidence === 1, 'updateMod() luôn hard-code confidence=1 (payload không có field confidence để đọc — renderer.js không tính confidence cho Mod) — ghi nhận, không phải bug.');
}

console.log('\n== A58.1/4 — Malformed/invalid payload cho Key/BPM/Mod: không crash, nhưng CÓ lỗ hổng validation cần ghi nhận ==');
{
    AIContext.reset();

    // --- Key: null/undefined/wrong type ---
    let threw = false;
    try { AIContext.updateKey(undefined); } catch { threw = true; }
    assert(threw === false, 'updateKey(undefined) không throw (default param {} áp dụng đúng)');
    assert(AIContext.key.current === null, 'updateKey(undefined): current vẫn giữ nguyên (null, chưa có gì)');

    threw = false;
    try { AIContext.updateKey(null); } catch { threw = true; }
    assert(threw === true, 'updateKey(null) THẬT SỰ throw (destructuring {key,confidence}={} không áp dụng cho null, chỉ áp dụng cho undefined) — ĐÃ được chặn an toàn ở lớp ngoài (ipcMain.on("ai-result") try/catch, xem test IPC bên dưới), nhưng bản thân AIContext.updateKey() không tự vệ với null.');

    // --- Confidence: NaN/Infinity/negative/out-of-range/string — TẤT CẢ đều lọt qua "typeof === number" ---
    AIContext.reset();
    AIContext.updateKey({ key: 'C Major', confidence: NaN });
    assert(Number.isNaN(AIContext.key.confidence),
        'FINDING (không sửa trong A58): confidence=NaN được CHẤP NHẬN ÂM THẦM (typeof NaN === "number" nên qua được guard hiện tại) — contract hiện tại KHÔNG có range/NaN validation cho confidence.');

    AIContext.updateKey({ key: 'C Major', confidence: Infinity });
    assert(AIContext.key.confidence === Infinity, 'FINDING: confidence=Infinity cũng được chấp nhận âm thầm (cùng lỗ hổng)');

    AIContext.updateKey({ key: 'C Major', confidence: -1 });
    assert(AIContext.key.confidence === -1, 'FINDING: confidence=-1 (ngoài khoảng [0,1] hợp lý) được chấp nhận âm thầm — không có range check');

    AIContext.updateKey({ key: 'C Major', confidence: 2 });
    assert(AIContext.key.confidence === 2, 'FINDING: confidence=2 (>1) được chấp nhận âm thầm');

    const beforeStringConfidence = AIContext.key.confidence;
    AIContext.updateKey({ key: 'C Major', confidence: '0.9' });
    assert(AIContext.key.confidence === beforeStringConfidence,
        'confidence="0.9" (string) bị TỪ CHỐI đúng (typeof guard hoạt động cho string) — giữ nguyên giá trị cũ, không NaN hoá state');

    // --- BPM: quy hồi lỗi cũ A48/A49 (raw number thay vì object) PHẢI vẫn bị chặn ---
    AIContext.reset();
    AIContext.updateBpm(128); // ĐÚNG hình dạng lỗi cũ đã sửa ở A49
    assert(AIContext.bpm.current === 0, 'REGRESSION GUARD (A49): updateBpm(128) — số thô — vẫn bị TỪ CHỐI đúng như thiết kế A49, không âm thầm set bpm.current');

    AIContext.updateBpm({ bpm: NaN, confidence: 0.5 });
    assert(Number.isNaN(AIContext.bpm.current), 'FINDING: bpm=NaN trong object cũng lọt qua (cùng lỗ hổng typeof-only validation như confidence)');
}

console.log('\n== A58.3 — Timestamp/ordering: chưa có formal timestamp trong AIContext.key/bpm; AnalysisResult/DecisionAction có default Date.now() an toàn ==');
{
    const AnalysisResult = require(path.join(root, 'core/ai/inference/AnalysisResult'));
    const r1 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY' }); // không truyền timestamp
    assert(typeof r1.timestamp === 'number' && r1.timestamp > 0, 'AnalysisResult: thiếu timestamp -> tự điền Date.now(), không phải undefined/NaN');

    const r2 = AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', timestamp: 'invalid' });
    assert(r2.timestamp === 'invalid',
        'FINDING (UNKNOWN mức độ nghiêm trọng, không đủ evidence để kết luận BUG THẬT — xem A58-REPORT.md mục Timestamp/Ordering): AnalysisResult không validate KIỂU của timestamp truyền vào — "invalid" (string) được giữ nguyên thay vì fallback Date.now(), vì code chỉ check `fields.timestamp || Date.now()` (falsy-check, không phải type-check). Trong thực tế, timestamp luôn do chính Core tạo ra (Date.now() ở InferenceEngine/DecisionRules), KHÔNG bao giờ nhận trực tiếp từ input bên ngoài chưa qua xử lý — nên đường khai thác thực tế của gap này chưa xác định được, ghi UNKNOWN thay vì PASS/FAIL.');

    // Không có cơ chế reorder/reject cho thứ tự t1/t3/t2 ở bất kỳ đâu trong pipeline — xác nhận
    // bằng audit tĩnh (không tìm thấy so sánh timestamp nào để quyết định chấp nhận/từ chối 1
    // update). Kênh IPC Electron (ipcRenderer.send) đảm bảo FIFO cho 1 channel, nên trong vận
    // hành thực tế qua đúng 1 channel "ai-result" hiện tại, khả năng nhận sai thứ tự gần như
    // không xảy ra — nhưng bản thân CODE không có gì chủ động bảo vệ nếu giả định FIFO đó sai.
    const analysisStateSrc = read('core/ai/AnalysisState.js');
    const hasOrderingCheck = /\.timestamp\s*[<>]|\.time\s*[<>]/.test(analysisStateSrc);
    assert(hasOrderingCheck === false,
        'Xác nhận: AnalysisState.js không có bất kỳ so sánh timestamp/time nào để phát hiện stale/out-of-order update — dựa hoàn toàn vào thứ tự IPC đến. UNKNOWN nếu FIFO bị vi phạm trong thực tế, không tự thêm ordering logic (đúng chỉ dẫn A58 mục 7: "không tự thêm nếu chưa định nghĩa sẵn").');
}

console.log('\n== A58.5 — keySource.ai (renderer) tách biệt provisional/stable, chỉ 1 điểm commit value ==');
{
    const rendererSrc = read('ui/js/renderer.js');
    const valueAssignSites = (rendererSrc.match(/keySource\.ai\.value\s*=/g) || []);
    assert(valueAssignSites.length === 1, `keySource.ai.value chỉ được gán ở ĐÚNG 1 nơi trong renderer.js (thực tế: ${valueAssignSites.length})`);
    assert(/keySource\.ai\.provisional\s*=/.test(rendererSrc), 'keySource.ai.provisional có điểm gán riêng (tách biệt với .value)');
    assert(!/keySource\.manual\.\w+\s*=\s*keySource\.ai\.provisional/.test(rendererSrc),
        'provisional KHÔNG bao giờ được copy sang keySource.manual (chỉ dùng hiển thị UI "đang dò...")');
}

console.log('\n== A58.6 — ManualPriorityGuard: xác minh lại toàn bộ ma trận quyết định (không redesign) ==');
{
    const now = 1_000_000;

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: now }, 'UPDATE_BPM', now).allowed === false,
        'UPDATE_BPM luôn BLOCK bất kể gì khác (chưa có backend thật)');

    assert(ManualPriorityGuard.evaluate('LEGACY_CONTROL', { keyActive: false, modActive: false, timestamp: now }, 'SET_KEY', now).allowed === false,
        'LEGACY_CONTROL luôn BLOCK (hành vi không đổi)');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', null, 'SET_KEY', now).allowed === false,
        'AI_CONTROL + ManualState=null -> fail-safe BLOCK (không coi null là "inactive")');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: 'x' }, 'SET_KEY', now).allowed === false,
        'AI_CONTROL + timestamp không phải số -> fail-safe BLOCK');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: now - 20000 }, 'SET_KEY', now).allowed === false,
        'AI_CONTROL + ManualState quá cũ (stale > 10s) -> fail-safe BLOCK');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: now + 5000 }, 'SET_KEY', now).allowed === false,
        'AI_CONTROL + timestamp ở TƯƠNG LAI (đồng hồ lệch) -> fail-safe BLOCK (age < 0)');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: true, modActive: false, timestamp: now }, 'SET_KEY', now).allowed === false,
        'AI_CONTROL + Manual Key active -> BLOCK action SET_KEY');
    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: true, modActive: false, timestamp: now }, 'LOAD_NEW_SONG', now).allowed === false,
        'AI_CONTROL + Manual Key active -> BLOCK action LOAD_NEW_SONG');
    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: true, modActive: false, timestamp: now }, 'SHIFT_KEY', now).allowed === true,
        'AI_CONTROL + Manual KEY active nhưng KHÔNG active Mod -> SHIFT_KEY (Mod) vẫn ALLOWED (2 trạng thái độc lập)');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: true, timestamp: now }, 'SHIFT_KEY', now).allowed === false,
        'AI_CONTROL + Manual Mod active -> BLOCK action SHIFT_KEY');
    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: true, timestamp: now }, 'SET_KEY', now).allowed === true,
        'AI_CONTROL + Manual MOD active nhưng KHÔNG active Key -> SET_KEY vẫn ALLOWED (2 trạng thái độc lập)');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: now }, 'SET_KEY', now).allowed === true,
        'AI_CONTROL + cả 2 Manual đều inactive + timestamp mới -> ALLOWED');

    assert(ManualPriorityGuard.evaluate('AI_CONTROL', { keyActive: false, modActive: false, timestamp: now }, 'UNKNOWN_ACTION', now).allowed === false,
        'AI_CONTROL + action lạ (không thuộc KEY_ACTIONS/MOD_ACTIONS) -> fail-safe BLOCK, không mặc định cho qua');
}

console.log('\n== A58.7 — AI -> Menu boundary: PLUGIN_COMMAND không thể phát ra ngoài PluginController ==');
{
    const pluginControllerSrc = read('core/ai/plugin/PluginController.js');
    const publishSites = (pluginControllerSrc.match(/EventBus\.publish\(\s*Events\.PLUGIN_COMMAND/g) || []);
    assert(publishSites.length === 1, `Events.PLUGIN_COMMAND chỉ được publish() ở ĐÚNG 1 nơi trong PluginController.js (thực tế: ${publishSites.length})`);

    const otherCoreFiles = [
        'core/ai/AIContext.js', 'core/ai/AnalysisState.js', 'core/ai/inference/InferenceEngine.js',
        'core/ai/aggregation/ResultQueue.js', 'core/ai/decision/DecisionEngine.js', 'core/ai/workflow/WorkflowManager.js',
    ];
    otherCoreFiles.forEach((f) => {
        assert(!/EventBus\.publish\(\s*Events\.PLUGIN_COMMAND/.test(read(f)), `${f} không tự publish PLUGIN_COMMAND (đúng đúng 1 nguồn phát duy nhất)`);
    });
}

console.log('\n== A58.8 — IPC "ai-result": malformed payload không làm throw ra ngoài (extracted handler thật) ==');
{
    AIContext.reset();

    const cases = [
        ['undefined arg (không có object)', undefined],
        ['object rỗng {}', {}],
        ['type hợp lệ, payload=null', { type: 'key', payload: null }],
        ['type hợp lệ, payload=undefined', { type: 'key', payload: undefined }],
        ['type="bpm", payload=số thô (lỗi cũ A48)', { type: 'bpm', payload: 128 }],
        ['type lạ chưa từng định nghĩa', { type: 'unknown-type-xyz', payload: { foo: 1 } }],
        ['type=null', { type: null, payload: {} }],
        ['type=42 (sai kiểu, không phải string)', { type: 42, payload: {} }],
        ['payload thừa field lạ', { type: 'key', payload: { key: 'C Major', confidence: 0.5, extraJunkField: true } }],
    ];

    cases.forEach(([label, arg]) => {
        let threw = false;
        try { runAiResultHandler(arg); } catch (e) { threw = true; }
        assert(threw === false, `ipcMain.on("ai-result") handler: "${label}" -> KHÔNG throw ra ngoài (an toàn cho main process)`);
    });

    assert(AIContext.key.current === 'C Major',
        'Case "payload thừa field lạ" vẫn cập nhật đúng field hợp lệ (key), field lạ (extraJunkField) bị bỏ qua vô hại');

    // FINDING: type lạ hoàn toàn KHÔNG được log — không throw (an toàn), nhưng CŨNG không có
    // dấu vết nào (không Logger.error/warn) — khác với updateBpm(số thô) đã có Logger.error rõ
    // ràng (A49). Đây là 1 GAP NHẤT QUÁN, không phải bug làm sai state — ghi nhận trong report,
    // KHÔNG sửa code trong A58 (đúng chính sách "chỉ thêm test nếu implementation đã an toàn").
    const mainSrc = read('app/main.js');
    const aiResultBlock = mainSrc.slice(mainSrc.indexOf('ipcMain.on("ai-result"'), mainSrc.indexOf('ipcMain.on("ai-result"') + 1200);
    const hasElseForUnknownType = /\}\s*else\s*\{/.test(aiResultBlock) || /Logger\.(warn|error)\([^)]*unknown/i.test(aiResultBlock);
    assert(hasElseForUnknownType === false,
        'FINDING (ghi nhận, không sửa trong A58): handler "ai-result" không có nhánh else/log riêng cho type lạ/không xác định — im lặng bỏ qua, không throw (an toàn) nhưng không để lại log nào để debug.');
}

console.log('\n== A58.9 — ResultQueue/Workflow: empty/invalid input không throw/hang ==');
{
    let threw = false;
    try { EventBus.publish(Events.ANALYSIS_READY, []); } catch { threw = true; }
    assert(threw === false, 'DecisionEngine nhận ANALYSIS_READY=[] (rỗng) -> không throw, không publish DECISION_READY (đã audit code: results.length===0 return sớm)');

    threw = false;
    try { EventBus.publish(Events.DECISION_READY, []); } catch { threw = true; }
    assert(threw === false, 'WorkflowManager nhận DECISION_READY=[] (rỗng) -> không throw');

    threw = false;
    try { EventBus.publish(Events.ANALYSIS_RESULT, null); } catch { threw = true; }
    assert(threw === false, 'ResultQueue nhận ANALYSIS_RESULT=null (invalid) -> không throw (try/catch A50 đã bọc)');

    threw = false;
    try { EventBus.publish(Events.WORKFLOW_READY, {}); } catch { threw = true; }
    assert(threw === false, 'PluginController nhận WORKFLOW_READY={} (thiếu field actions) -> không throw (payload.actions || [] guard)');

    // FINDING (ghi nhận, không sửa trong A58 — xem A58-REPORT.md): TaskQueue được
    // WorkflowManager.enqueue() liên tục nhưng KHÔNG có nơi nào gọi dequeue() (PluginController
    // xử lý trực tiếp từ payload sự kiện, không đọc từ TaskQueue) -> hàng đợi phình to vô thời
    // hạn trong 1 phiên chạy dài (app này chạy liên tục hàng giờ khi biểu diễn). Không phải
    // throw/hang/silent-fail/incorrect-command (4 hành vi A58.9 hỏi cụ thể) nên không thuộc
    // diện "REAL BUG cần sửa ngay" theo chính sách A58 — nhưng là state-growth thật, đáng lưu ý
    // cho A59+ hoặc khi xây "tầng thực thi" (execution layer) thật.
    const sizeBefore = TaskQueue.size();
    WorkflowManager._onDecisionReady?.([{ action: 'SET_KEY', target: 'key', value: 'A Major', confidence: 1, reason: 'test', priority: 80, timestamp: Date.now() }]);
    const sizeAfter = TaskQueue.size();
    assert(sizeAfter === sizeBefore + 1,
        `FINDING: TaskQueue.size() tăng sau khi WorkflowManager xử lý 1 action mới (trước=${sizeBefore}, sau=${sizeAfter}) và KHÔNG có cơ chế dequeue tự động nào trong pipeline hiện tại — xác nhận queue tích luỹ vô thời hạn theo thiết kế hiện tại.`);
}

console.log('\n== A58.9 (FIX regression) — 1 ANALYSIS_RESULT null/hỏng KHÔNG còn làm mất các kết quả HỢP LỆ khác trong cùng cửa sổ gom ==');
{
    // Trước bản vá A58: publish(null) xen giữa 2 publish hợp lệ trong cùng cửa sổ 400ms sẽ làm
    // _reduce() throw giữa chừng -> TOÀN BỘ batch (kể cả 2 kết quả hợp lệ) bị huỷ, không có
    // ANALYSIS_READY nào được phát ra. Test này xác nhận sau bản vá, batch vẫn ra đúng.
    let readyPayload = null;
    const spy = (list) => { readyPayload = list; };
    EventBus.subscribe(Events.ANALYSIS_READY, spy);

    const AnalysisResult = require(path.join(root, 'core/ai/inference/AnalysisResult'));
    EventBus.publish(Events.ANALYSIS_RESULT, AnalysisResult.create({ type: 'KEY_CHANGE', source: 'KEY', confidence: 0.9, key: { from: 'X', to: 'Y-A58-REGRESSION' } }).toJSON());
    EventBus.publish(Events.ANALYSIS_RESULT, null); // entry hỏng, xen giữa
    EventBus.publish(Events.ANALYSIS_RESULT, 'chuỗi bất thường, không phải object'); // entry hỏng khác
    EventBus.publish(Events.ANALYSIS_RESULT, AnalysisResult.create({ type: 'BPM_CHANGE', source: 'BPM', confidence: 0.9, bpm: { from: 100, to: 199 } }).toJSON());

    await sleep(500);
    EventBus.unsubscribe(Events.ANALYSIS_READY, spy);

    assert(readyPayload !== null, 'ANALYSIS_READY VẪN được phát ra dù có entry null/string lẫn trong cùng cửa sổ (trước bản vá: batch bị huỷ hoàn toàn, không phát gì)');
    const types = (readyPayload || []).map((r) => r.type).sort();
    assert(types.includes('KEY_CHANGE') || types.includes('BPM_CHANGE') || types.includes('NEW_SONG'),
        `Ít nhất 1 trong 2 kết quả HỢP LỆ (KEY_CHANGE/BPM_CHANGE, hoặc gộp thành NEW_SONG nếu InferenceEngine coi 2 thay đổi gần nhau là 1 bài mới) sống sót qua cửa sổ gom — types thực tế: [${types.join(', ')}]`);
}

console.log('\n== A58.10 — LEGACY_CONTROL: toàn bộ pipeline thật chạy hết nhưng KHÔNG publish PLUGIN_COMMAND ==');
{
    assert(ControlSource.getControlSource() === 'LEGACY_CONTROL', 'Xác nhận CURRENT_MODE vẫn là LEGACY_CONTROL (A58 không bật AI_CONTROL)');

    let pluginCommandReceived = false;
    const spy = () => { pluginCommandReceived = true; };
    EventBus.subscribe(Events.PLUGIN_COMMAND, spy);

    AIContext.reset();
    // Đẩy 1 chuỗi Key/BPM thay đổi THẬT qua đúng entry point IPC thật (extracted handler) —
    // mô phỏng chính xác những gì renderer.js thật sự gửi qua reportAiResult().
    runAiResultHandler({ type: 'key', payload: { key: 'F Major', confidence: 0.95 } });
    runAiResultHandler({ type: 'bpm', payload: { bpm: 140, confidence: 0.9 } });

    // Đợi ResultQueue flush thật (cửa sổ gom 400ms, xem ResultQueue.js) — không rút ngắn giả
    // lập, dùng đúng độ trễ thật của hệ thống để test có giá trị thật.
    await sleep(500);

    EventBus.unsubscribe(Events.PLUGIN_COMMAND, spy);

    assert(pluginCommandReceived === false,
        'Sau khi đẩy Key+BPM thật qua TOÀN BỘ pipeline thật (không mock bất kỳ lớp nào) và đợi hết cửa sổ gom 400ms thật -> PLUGIN_COMMAND KHÔNG BAO GIỜ được publish trong khi LEGACY_CONTROL — bất biến an toàn quan trọng nhất được khoá lại bằng chính pipeline thật, không phải giả lập.');
}

console.log('\n== A58.11 — AIBootstrap: initialize() 2 lần không tạo duplicate listener ==');
{
    const AIBootstrap = require(path.join(root, 'core/ai/AIBootstrap'));

    const countsBefore = {
        KEY_UPDATED: EventBus.listenerCount(Events.KEY_UPDATED),
        DECISION_READY: EventBus.listenerCount(Events.DECISION_READY),
        WORKFLOW_READY: EventBus.listenerCount(Events.WORKFLOW_READY),
        ANALYSIS_RESULT: EventBus.listenerCount(Events.ANALYSIS_RESULT),
    };

    await AIBootstrap.initialize();
    await AIBootstrap.initialize();
    await AIBootstrap.initialize();

    const countsAfter = {
        KEY_UPDATED: EventBus.listenerCount(Events.KEY_UPDATED),
        DECISION_READY: EventBus.listenerCount(Events.DECISION_READY),
        WORKFLOW_READY: EventBus.listenerCount(Events.WORKFLOW_READY),
        ANALYSIS_RESULT: EventBus.listenerCount(Events.ANALYSIS_RESULT),
    };

    assert(JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
        `Gọi AIBootstrap.initialize() 3 lần liên tiếp KHÔNG làm tăng số listener nào (trước=${JSON.stringify(countsBefore)}, sau=${JSON.stringify(countsAfter)}) — bảo vệ kép: (1) guard "if (this.initialized) return" trong AIBootstrap, (2) mỗi module pipeline là singleton require() cache của Node nên constructor (nơi gọi _registerListeners) chỉ chạy đúng 1 lần bất kể require() lại bao nhiêu lần.`);
}

console.log('\n== A58.12 — Không có duplicate subscriber cho các event trục chính (đếm trực tiếp qua EventBus thật) ==');
{
    // Ngưỡng kỳ vọng: mỗi event trục chính chỉ có ĐÚNG 1 subscriber thật trong pipeline core/ai/**
    // (không tính subscriber do chính file test này thêm/gỡ ở trên — đã unsubscribe sạch).
    assert(EventBus.listenerCount(Events.KEY_UPDATED) === 1, `Events.KEY_UPDATED có đúng 1 subscriber (AnalysisState) — thực tế: ${EventBus.listenerCount(Events.KEY_UPDATED)}`);
    assert(EventBus.listenerCount(Events.BPM_UPDATED) === 1, `Events.BPM_UPDATED có đúng 1 subscriber — thực tế: ${EventBus.listenerCount(Events.BPM_UPDATED)}`);
    assert(EventBus.listenerCount(Events.MOD_UPDATED) === 1, `Events.MOD_UPDATED có đúng 1 subscriber — thực tế: ${EventBus.listenerCount(Events.MOD_UPDATED)}`);
    assert(EventBus.listenerCount(Events.DECISION_READY) === 1, `Events.DECISION_READY có đúng 1 subscriber (WorkflowManager) — thực tế: ${EventBus.listenerCount(Events.DECISION_READY)}`);
    assert(EventBus.listenerCount(Events.WORKFLOW_READY) === 1, `Events.WORKFLOW_READY có đúng 1 subscriber (PluginController) — thực tế: ${EventBus.listenerCount(Events.WORKFLOW_READY)}`);
    assert(EventBus.listenerCount(Events.PLUGIN_COMMAND) === 0, `Events.PLUGIN_COMMAND có đúng 0 subscriber trong core/ai/** — chỉ app/main.js (Electron thật, không nạp trong test này) mới subscribe — thực tế: ${EventBus.listenerCount(Events.PLUGIN_COMMAND)}`);
}

console.log('\n== A58.13 — Dead AI branch: chỉ ghi nhận, KHÔNG cleanup (đúng phạm vi A58) ==');
{
    // Xác nhận lại đúng 1 phát hiện trọng tâm từ A56 (không lặp lại toàn bộ audit dead-code —
    // việc đó thuộc C58/cleanup task) — dùng để nối mạch báo cáo, không phải audit mới.
    const aiBootstrapSrc = read('core/ai/AIBootstrap.js');
    assert(!/require\(["']\.\/kernel\/BootLoader["']\)/.test(aiBootstrapSrc),
        'AIBootstrap.js (điểm khởi động thật) vẫn KHÔNG require core/ai/kernel/BootLoader.js — nhánh kernel/engines trùng lặp vẫn DEAD, không có gì thay đổi so với A56 (A58 không xoá, không mở rộng thành cleanup)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);

})();
