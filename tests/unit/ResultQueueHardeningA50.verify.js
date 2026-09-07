/**
 * ==========================================================
 * Auto Menu AI — ResultQueue Safety Hardening (Task A50)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/ResultQueueHardeningA50.verify.js
 *
 * Kiểm chứng 4 yêu cầu bắt buộc của A50, dùng module THẬT
 * (core/ai/aggregation/ResultQueue.js, core/events/EventBus.js, core/events/Events.js),
 * KHÔNG mock. KHÔNG đụng app/main.js, ui/, keyEngine/bpmEngine/modEngine, MIDI, ManualState —
 * đúng LOCK của task.
 *
 *   1. Đường ĐỒNG BỘ an toàn: _onAnalysisResult() tự bắt lỗi, không throw ra ngoài, kể cả
 *      khi KHÔNG có lưới an toàn nào bên ngoài bọc quanh nó (mô phỏng đúng việc app/main.js
 *      bị khoá — ResultQueue phải tự đứng vững một mình).
 *   2. Đường BẤT ĐỒNG BỘ/debounce an toàn: _flush() (chạy trong setTimeout) tự bắt lỗi,
 *      không tạo uncaughtException, kể cả khi lỗi bị throw KHÔNG PHẢI là Error thật
 *      (throw null / throw chuỗi) — đúng khe hở A50 mới vá thêm so với A49.
 *   3. Lỗi được LOG đầy đủ (không nuốt câm lặng) ở cả 2 đường trên.
 *   4. Khi KHÔNG có lỗi, hợp đồng (contract) của queue giữ nguyên: đúng thứ tự ưu tiên
 *      (NEW_SONG > KEY_CHANGE > MODULATION > BPM_CHANGE > NOISE), đúng cơ chế debounce 1 lần
 *      cho mỗi đợt gom, và ResultQueue.js không hề đụng tới KEY_UPDATED/BPM_UPDATED/
 *      MOD_UPDATED (không làm thay đổi thứ tự/kết quả 3 event đó, vì không tham chiếu chúng).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}

const repoRoot = path.join(__dirname, '..', '..');
const EventBus = require(path.join(repoRoot, 'core', 'events', 'EventBus.js'));
const Events = require(path.join(repoRoot, 'core', 'events', 'Events.js'));
const ResultQueue = require(path.join(repoRoot, 'core', 'ai', 'aggregation', 'ResultQueue.js'));

console.log('\n=== 0. Static check — ResultQueue.js KHÔNG đụng KEY_UPDATED/BPM_UPDATED/MOD_UPDATED ===');
{
    const src = fs.readFileSync(path.join(repoRoot, 'core', 'ai', 'aggregation', 'ResultQueue.js'), 'utf-8');
    check('không tham chiếu Events.KEY_UPDATED', !src.includes('KEY_UPDATED'));
    check('không tham chiếu Events.BPM_UPDATED', !src.includes('BPM_UPDATED'));
    check('không tham chiếu Events.MOD_UPDATED', !src.includes('MOD_UPDATED'));
}

console.log('\n=== 1. ĐƯỜNG ĐỒNG BỘ (_onAnalysisResult) — tự an toàn, không cần lưới bên ngoài ===');
{

    const originalError = console.error;
    let loggedSync = false;
    console.error = (...args) => { loggedSync = loggedSync || args.join(' ').includes('Lỗi khi nhận ANALYSIS_RESULT'); };

    // Ép buffer.push throw để mô phỏng lỗi thật ở đường đồng bộ (thay this.buffer bằng 1 mảng
    // giả có push() luôn throw) — KHÔNG gọi trực tiếp qua EventBus để chứng minh chính
    // _onAnalysisResult() tự bảo vệ được, không dựa vào bất kỳ ai bọc nó từ bên ngoài.
    ResultQueue.buffer = { push: () => { throw new Error('push hỏng (mô phỏng)'); } };

    let threwSync = false;
    try {
        ResultQueue._onAnalysisResult({ type: 'KEY_CHANGE', source: 'test', confidence: 1, key: { to: 'C' } });
    } catch (e) {
        threwSync = true;
    }

    console.error = originalError;

    check('_onAnalysisResult() tự bắt lỗi, KHÔNG throw ra ngoài dù không có lưới an toàn bên ngoài', threwSync === false);
    check('lỗi đường đồng bộ được LOG đầy đủ (không nuốt câm lặng)', loggedSync);

    // reset lại buffer thật cho các test sau
    ResultQueue.buffer = [];
    ResultQueue.windowTimer = null;
}

console.log('\n=== 2. ĐƯỜNG BẤT ĐỒNG BỘ (_flush qua setTimeout) — an toàn kể cả throw KHÔNG PHẢI Error ===');
{

    // Case A: subscriber throw 1 Error thật
    const brokenErrorListener = () => { throw new Error('Lỗi Error thật'); };
    EventBus.subscribe(Events.ANALYSIS_READY, brokenErrorListener);

    const originalError = console.error;
    let loggedA = false;
    console.error = (...args) => { loggedA = loggedA || args.join(' ').includes('Lỗi khi flush/publish'); };

    ResultQueue.buffer = [{ type: 'KEY_CHANGE', source: 'test', confidence: 1, key: { to: 'C' } }];
    ResultQueue.windowTimer = 'fake';
    let threwA = false;
    try { ResultQueue._flush(); } catch (e) { threwA = true; }
    console.error = originalError;
    EventBus.unsubscribe(Events.ANALYSIS_READY, brokenErrorListener);

    check('Case A (throw Error thật): _flush() không throw ra ngoài', threwA === false);
    check('Case A: lỗi được log đầy đủ', loggedA);
    check('Case A: buffer reset về rỗng dù có lỗi', Array.isArray(ResultQueue.buffer) && ResultQueue.buffer.length === 0);

    // Case B: subscriber throw giá trị KHÔNG PHẢI Error (null) — đúng khe hở A50 vá thêm
    const brokenNullListener = () => { throw null; };
    EventBus.subscribe(Events.ANALYSIS_READY, brokenNullListener);

    let loggedB = false;
    console.error = (...args) => { loggedB = loggedB || args.join(' ').includes('Lỗi khi flush/publish'); };

    ResultQueue.buffer = [{ type: 'BPM_CHANGE', source: 'test', confidence: 1, bpm: { to: 120 } }];
    ResultQueue.windowTimer = 'fake';
    let threwB = false;
    try { ResultQueue._flush(); } catch (e) { threwB = true; }
    console.error = originalError;
    EventBus.unsubscribe(Events.ANALYSIS_READY, brokenNullListener);

    check('Case B (throw null, KHÔNG phải Error): _flush() vẫn KHÔNG throw ra ngoài', threwB === false);
    check('Case B: lỗi vẫn được log đầy đủ dù throw không phải Error (không tự vỡ ở err.message)', loggedB);
    check('Case B: buffer reset về rỗng dù có lỗi', Array.isArray(ResultQueue.buffer) && ResultQueue.buffer.length === 0);

    // Case C: subscriber throw 1 chuỗi (không phải Error, không phải null)
    const brokenStringListener = () => { throw 'chuỗi lỗi thô'; };
    EventBus.subscribe(Events.ANALYSIS_READY, brokenStringListener);
    let loggedC = false;
    console.error = (...args) => { loggedC = loggedC || args.join(' ').includes('chuỗi lỗi thô'); };
    ResultQueue.buffer = [{ type: 'MODULATION', source: 'test', confidence: 1, modulation: { to: 'D' } }];
    ResultQueue.windowTimer = 'fake';
    let threwC = false;
    try { ResultQueue._flush(); } catch (e) { threwC = true; }
    console.error = originalError;
    EventBus.unsubscribe(Events.ANALYSIS_READY, brokenStringListener);

    check('Case C (throw chuỗi thô): _flush() không throw ra ngoài', threwC === false);
    check('Case C: nội dung chuỗi lỗi thô vẫn xuất hiện trong log (_safeMessage hoạt động đúng)', loggedC);
}

console.log('\n=== 3. Không có uncaughtException thật lọt ra tiến trình (kiểm tra sau 1 tick) ===');
{
    let uncaught = false;
    process.once('uncaughtException', () => { uncaught = true; });


    const brokenListener = () => { throw new Error('mô phỏng cuối'); };
    EventBus.subscribe(Events.ANALYSIS_READY, brokenListener);

    // Đi qua ĐÚNG đường thật: publish ANALYSIS_RESULT -> _onAnalysisResult -> setTimeout thật
    // (không gọi tắt _flush() trực tiếp) để kiểm tra toàn bộ đường debounce thật sự.
    EventBus.publish(Events.ANALYSIS_RESULT, { type: 'KEY_CHANGE', source: 'test', confidence: 1, key: { to: 'E' } });

    setTimeout(() => {
        EventBus.unsubscribe(Events.ANALYSIS_READY, brokenListener);

        check('đi qua đúng đường debounce THẬT (không gọi tắt _flush) vẫn không có uncaughtException', uncaught === false);

        console.log('\n=== 4. Hợp đồng (contract) khi KHÔNG có lỗi — thứ tự ưu tiên + debounce 1 lần/đợt ===');
        {

            let readyPayload = null;
            let readyCallCount = 0;
            const listener = (list) => { readyPayload = list; readyCallCount++; };
            EventBus.subscribe(Events.ANALYSIS_READY, listener);

            // Gửi 3 kết quả KHÁC trục (KEY_CHANGE, BPM_CHANGE) + 1 NOISE cùng lúc trong 1 đợt gom
            EventBus.publish(Events.ANALYSIS_RESULT, { type: 'BPM_CHANGE', source: 'bpm', confidence: 0.9, bpm: { to: 128 } });
            EventBus.publish(Events.ANALYSIS_RESULT, { type: 'KEY_CHANGE', source: 'key', confidence: 0.9, key: { to: 'G' } });
            EventBus.publish(Events.ANALYSIS_RESULT, { type: 'MODULATION', source: 'key', confidence: 0.5, modulation: { to: 'A' } });
            EventBus.publish(Events.ANALYSIS_RESULT, { type: 'NOISE', source: 'noise', confidence: 0.1 });

            setTimeout(() => {
                EventBus.unsubscribe(Events.ANALYSIS_READY, listener);

                check('CHỈ đúng 1 lần ANALYSIS_READY cho cả đợt gom (debounce hoạt động đúng, không phát nhiều lần)',
                    readyCallCount === 1, readyCallCount);
                check('NOISE bị loại khi có tín hiệu thật khác trong cùng đợt',
                    readyPayload && !readyPayload.some((r) => r.type === 'NOISE'));
                check('KEY_CHANGE (priority 80) thắng MODULATION (priority 60) trên cùng trục KEY_AXIS',
                    readyPayload && readyPayload.some((r) => r.type === 'KEY_CHANGE') &&
                    !readyPayload.some((r) => r.type === 'MODULATION'));
                check('BPM_CHANGE vẫn được giữ (trục riêng, không tranh với KEY_AXIS)',
                    readyPayload && readyPayload.some((r) => r.type === 'BPM_CHANGE'));
                check('Kết quả sắp xếp đúng theo priority giảm dần (KEY_CHANGE trước BPM_CHANGE)',
                    readyPayload && readyPayload[0].type === 'KEY_CHANGE');

                console.log('\n========== TỔNG KẾT ==========');
                console.log(`${pass} PASS, ${fail} FAIL`);
                if (fail > 0) process.exitCode = 1;
            }, 500);
        }
    }, 500);
}
