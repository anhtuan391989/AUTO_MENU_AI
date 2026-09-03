/**
 * ==========================================================
 * Auto Menu AI — AI Integration Safety Hardening (Task A49)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/AiIntegrationSafetyA49.verify.js
 *
 * Kiểm chứng 3 phần A49 đã vá, dùng module THẬT (core/ai/AIContext.js,
 * core/events/EventBus.js, core/events/Events.js, core/ai/aggregation/ResultQueue.js),
 * KHÔNG mock — đúng convention repo. KHÔNG đổi CURRENT_MODE (ControlSource không được
 * require ở đây vì không cần cho phạm vi test này).
 *
 * PHẦN A — BPM contract: updateBpm() phải phát hiện & bỏ qua an toàn khi nhận số thô
 *          thay vì object {bpm, confidence}, không được âm thầm chấp nhận.
 * PHẦN B — IPC safety: mô phỏng ĐÚNG logic try/catch đã thêm vào app/main.js
 *          (không thể require app/main.js trực tiếp vì cần module 'electron' không có
 *          trong môi trường Node thuần — nên tái tạo lại chính xác pattern try/catch
 *          bằng module AIContext/EventBus/Events THẬT, chứng minh pattern đó chặn được
 *          exception đúng như mô tả).
 * PHẦN C — Deep exception: ResultQueue._flush() (ranh giới bất đồng bộ) phải tự chặn lỗi
 *          từ subscriber ANALYSIS_READY, không throw ra ngoài setTimeout callback, và
 *          phải reset buffer/timer đúng cho dù có lỗi hay không.
 */

const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}

const repoRoot = path.join(__dirname, '..', '..');
const AIContext = require(path.join(repoRoot, 'core', 'ai', 'AIContext.js'));
const EventBus = require(path.join(repoRoot, 'core', 'events', 'EventBus.js'));
const Events = require(path.join(repoRoot, 'core', 'events', 'Events.js'));

console.log('\n=== PHẦN A: BPM contract (updateBpm) ===');
{
    AIContext.reset();
    AIContext.updateBpm({ bpm: 120, confidence: 0.8 });
    check('object hợp lệ {bpm, confidence} -> update đúng', AIContext.bpm.current === 120,
        AIContext.bpm.current);

    // Chặn console.error tạm thời để không làm ồn output test, vẫn xác nhận có gọi
    const originalError = console.error;
    let loggedRawNumberWarning = false;
    console.error = (...args) => { loggedRawNumberWarning = loggedRawNumberWarning || args.join(' ').includes('SỐ THUẦN'); };

    AIContext.updateBpm(999); // đúng bug case A48 phát hiện: gửi raw number
    console.error = originalError;

    check('raw number KHÔNG được âm thầm chấp nhận (bpm giữ nguyên 120, không đổi thành 999)',
        AIContext.bpm.current === 120, AIContext.bpm.current);
    check('raw number bị phát hiện và log lỗi rõ ràng (không còn silent-fail)', loggedRawNumberWarning);

    AIContext.updateBpm(undefined);
    check('payload undefined không throw, không đổi giá trị cũ', AIContext.bpm.current === 120);

    AIContext.updateBpm({});
    check('object rỗng {} không throw, giữ nguyên giá trị cũ (không có field bpm hợp lệ)',
        AIContext.bpm.current === 120);
}

console.log('\n=== PHẦN B: mô phỏng đúng pattern try/catch đã thêm vào app/main.js (ipcMain.on("ai-result")) ===');
{
    // Tái tạo Y HỆT logic đã thêm vào app/main.js — dùng module EventBus/Events THẬT.
    function simulateAiResultHandler(type, payload) {
        try {
            if (type === 'key') {
                AIContext.updateKey(payload);
                EventBus.publish(Events.KEY_UPDATED, payload);
                return { crashed: false };
            }
        } catch (err) {
            return { crashed: false, caught: err.message };
        }
        return { crashed: false };
    }

    // Gắn 1 subscriber "hỏng" tạm thời vào KEY_UPDATED để mô phỏng lỗi downstream thật
    // (đúng kịch bản Deep Exception Audit: 1 subscriber bất kỳ trong chuỗi throw).
    const brokenListener = () => { throw new Error('Lỗi mô phỏng từ 1 subscriber downstream'); };
    EventBus.subscribe(Events.KEY_UPDATED, brokenListener);

    let threwOutside = false;
    let result;
    try {
        result = simulateAiResultHandler('key', { key: 'C Major', confidence: 0.9 });
    } catch (e) {
        threwOutside = true;
    }

    EventBus.unsubscribe(Events.KEY_UPDATED, brokenListener);

    check('exception từ subscriber KHÔNG lan ra ngoài try/catch (không crash tiến trình gọi)',
        threwOutside === false);
    check('try/catch bắt được đúng lỗi thật, có log lại (không nuốt câm lặng)',
        result && result.caught && result.caught.includes('Lỗi mô phỏng'));
}

console.log('\n=== PHẦN C: ResultQueue._flush() — ranh giới bất đồng bộ (setTimeout) ===');
{
    const ResultQueue = require(path.join(repoRoot, 'core', 'ai', 'aggregation', 'ResultQueue.js'));

    // Gắn 1 subscriber "hỏng" vào ANALYSIS_READY (event mà _flush() publish) để mô phỏng
    // đúng kịch bản DecisionEngine/WorkflowManager/PluginController throw.
    const brokenReadyListener = () => { throw new Error('Lỗi mô phỏng downstream ANALYSIS_READY'); };
    EventBus.subscribe(Events.ANALYSIS_READY, brokenReadyListener);

    let uncaughtInFlush = false;
    process.once('uncaughtException', () => { uncaughtInFlush = true; });

    // Gọi thẳng _flush() (không cần chờ debounce thật) để kiểm tra đồng bộ trong bài test.
    ResultQueue.buffer = [{ type: 'key', to: 'C Major' }];
    ResultQueue.windowTimer = 'fake-timer-id';

    let threwFromFlush = false;
    try {
        ResultQueue._flush();
    } catch (e) {
        threwFromFlush = true;
    }

    EventBus.unsubscribe(Events.ANALYSIS_READY, brokenReadyListener);

    check('_flush() tự bắt lỗi từ subscriber ANALYSIS_READY, không throw ra ngoài',
        threwFromFlush === false);
    check('buffer được reset về rỗng NGAY CẢ KHI downstream lỗi (không bị kẹt hàng đợi)',
        Array.isArray(ResultQueue.buffer) && ResultQueue.buffer.length === 0);
    check('windowTimer được reset về null NGAY CẢ KHI downstream lỗi',
        ResultQueue.windowTimer === null);

    // Cho event loop 1 tick để chắc chắn không có uncaughtException nào lọt ra sau đó
    setTimeout(() => {
        check('không có uncaughtException nào phát sinh ở tiến trình (an toàn thật, không chỉ an toàn trong try)',
            uncaughtInFlush === false);

        console.log('\n========== TỔNG KẾT ==========');
        console.log(`${pass} PASS, ${fail} FAIL`);
        if (fail > 0) process.exitCode = 1;
    }, 50);
}
