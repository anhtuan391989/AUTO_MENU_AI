/**
 * ==========================================================
 * Auto Menu AI — PLUGIN_COMMAND Event Bridge (Task B19)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/PluginCommandBridge.verify.js
 *
 * ROOT CAUSE đã sửa ở B19 (xem core/events/Events.js): `Events.PLUGIN_COMMAND`
 * từng là `undefined` trong file THẬT SỰ được mọi module require
 * (core/events/Events.js) — PluginController.js (publisher) và app/main.js
 * (subscriber) "khớp" nhau chỉ vì CẢ HAI cùng đọc ra undefined, không phải vì
 * đặt tên đúng. Bộ test này KHÔNG chấp nhận việc "cả 2 phía cùng undefined" là
 * PASS — mọi assertion dưới đây đòi hỏi giá trị THẬT, khác undefined.
 *
 * Dùng module THẬT (require thật core/events/Events.js, core/events/EventBus.js,
 * core/ai/plugin/PluginController.js — đúng convention của repo, không mock
 * Events/EventBus), CHỈ monkey-patch tạm thời 2 hàm của ControlSource (module
 * singleton, in-memory only, không sửa file nào) để mô phỏng AI_CONTROL trong
 * phạm vi bài test — vì CURRENT_MODE trong core/shared/ControlSource.js là
 * hằng số cứng, cố ý không có API đổi lúc chạy (đúng thiết kế, B19 không được
 * đổi default), nên đây là cách DUY NHẤT test được nhánh AI_CONTROL mà không
 * đụng file nguồn. Khôi phục lại nguyên trạng ngay sau khi dùng xong.
 */
'use strict';

const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}

// ---------------------------------------------------------------------------
// 1. Events.PLUGIN_COMMAND !== undefined — trong ĐÚNG file mọi module require
// ---------------------------------------------------------------------------
console.log('\n== 1: Events.PLUGIN_COMMAND phải có giá trị thật, không phải undefined ==');
const Events = require(path.join(__dirname, '..', '..', 'core', 'events', 'Events.js'));
check('Events.PLUGIN_COMMAND !== undefined', Events.PLUGIN_COMMAND !== undefined, Events.PLUGIN_COMMAND);
check('Events.PLUGIN_COMMAND === "PLUGIN_COMMAND" (giá trị cụ thể, không phải chuỗi rỗng/giá trị đoán)', Events.PLUGIN_COMMAND === 'PLUGIN_COMMAND', Events.PLUGIN_COMMAND);

// ---------------------------------------------------------------------------
// 2. Publisher (PluginController.js) và subscriber (mô phỏng đúng app/main.js)
//    phải cùng require ĐÚNG 1 module Events, cùng 1 giá trị.
// ---------------------------------------------------------------------------
console.log('\n== 2: Publisher và subscriber cùng resolve về đúng 1 module Events, cùng giá trị ==');
const pluginControllerSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'core', 'ai', 'plugin', 'PluginController.js'), 'utf8'
);
const mainSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8'
);
check(
    'PluginController.js require đúng "../../events/Events" (-> core/events/Events.js)',
    /require\(\s*["']\.\.\/\.\.\/events\/Events["']\s*\)/.test(pluginControllerSrc)
);
check(
    'app/main.js require đúng "../core/events/Events" (-> core/events/Events.js — CÙNG file với PluginController)',
    /require\(\s*["']\.\.\/core\/events\/Events["']\s*\)/.test(mainSrc)
);
check(
    'PluginController.js publish đúng Events.PLUGIN_COMMAND (không phải chuỗi hardcode lệch)',
    /EventBus\.publish\(\s*Events\.PLUGIN_COMMAND\s*,/.test(pluginControllerSrc)
);
check(
    'app/main.js subscribe đúng Events.PLUGIN_COMMAND (không phải chuỗi hardcode lệch)',
    /EventBus\.subscribe\(\s*Events\.PLUGIN_COMMAND\s*,/.test(mainSrc)
);

// ---------------------------------------------------------------------------
// 3. End-to-end thật: PluginController (module thật) publish qua EventBus
//    (singleton thật) -> subscriber thật (mô phỏng đúng dòng app/main.js) nhận
//    được đúng message, trên đúng topic Events.PLUGIN_COMMAND.
// ---------------------------------------------------------------------------
console.log('\n== 3: End-to-end thật — WORKFLOW_READY -> PluginController -> EventBus -> subscriber ==');

const EventBus = require(path.join(__dirname, '..', '..', 'core', 'events', 'EventBus.js'));
const ControlSource = require(path.join(__dirname, '..', '..', 'core', 'shared', 'ControlSource.js'));
const ManualState = require(path.join(__dirname, '..', '..', 'core', 'shared', 'ManualState.js'));
// require PluginController THẬT — module singleton, việc require() này tự đăng ký
// listener WORKFLOW_READY thật của chính nó (đúng _registerListeners() trong file gốc).
require(path.join(__dirname, '..', '..', 'core', 'ai', 'plugin', 'PluginController.js'));

// Monkey-patch tạm thời (in-memory, không sửa file) — mô phỏng AI_CONTROL cho đúng
// phạm vi bài test, khôi phục ngay sau khối test này dù pass hay fail.
const originalIsLegacyControl = ControlSource.isLegacyControl;
const originalGetControlSource = ControlSource.getControlSource;
ControlSource.isLegacyControl = () => false;
ControlSource.getControlSource = () => 'AI_CONTROL';
ManualState.setManualState({ keyActive: false, modActive: false, timestamp: Date.now() });

try {
    let received = null;
    let receivedOnUndefinedTopic = false;

    EventBus.subscribe(Events.PLUGIN_COMMAND, (message) => { received = message; });
    // Mục "4. Không phụ thuộc undefined↔undefined" — subscribe thêm vào literal
    // JS `undefined` để chứng minh publish thật KHÔNG rơi vào topic đó nữa.
    EventBus.subscribe(undefined, () => { receivedOnUndefinedTopic = true; });

    EventBus.publish('WORKFLOW_READY', {
        actions: [{ action: 'SET_KEY', value: 'C Major', confidence: 0.9, reason: 'test', timestamp: Date.now() }],
    });

    check('Subscriber thật nhận được message qua Events.PLUGIN_COMMAND', received !== null, received);
    check('Message nhận được đúng command=SET_KEY', received && received.command === 'SET_KEY', received);
    check('Message nhận được đúng value=C Major', received && received.value === 'C Major', received);
    check(
        '4. KHÔNG phụ thuộc undefined↔undefined — publish thật KHÔNG lọt vào topic literal undefined',
        receivedOnUndefinedTopic === false
    );
} finally {
    ControlSource.isLegacyControl = originalIsLegacyControl;
    ControlSource.getControlSource = originalGetControlSource;
    ManualState._resetForTest();
    EventBus.removeAllListeners(Events.PLUGIN_COMMAND);
    EventBus.removeAllListeners(undefined);
}

// ---------------------------------------------------------------------------
// 5. Regression an toàn — LEGACY_CONTROL (mặc định thật của repo) vẫn KHÔNG
//    publish PLUGIN_COMMAND (hành vi cũ, không đổi do fix B19).
// ---------------------------------------------------------------------------
console.log('\n== 5: Regression — LEGACY_CONTROL (mặc định thật) vẫn KHÔNG publish PLUGIN_COMMAND ==');
{
    let receivedInLegacy = false;
    EventBus.subscribe(Events.PLUGIN_COMMAND, () => { receivedInLegacy = true; });
    // KHÔNG monkey-patch gì ở đây — dùng đúng ControlSource.CURRENT_MODE thật (LEGACY_CONTROL).
    EventBus.publish('WORKFLOW_READY', {
        actions: [{ action: 'SET_KEY', value: 'D Minor', confidence: 0.9, reason: 'test-legacy', timestamp: Date.now() }],
    });
    EventBus.removeAllListeners(Events.PLUGIN_COMMAND);
    check(
        'ControlSource mặc định thật vẫn là LEGACY_CONTROL sau khi khôi phục monkey-patch',
        ControlSource.getControlSource() === 'LEGACY_CONTROL', ControlSource.getControlSource()
    );
    check('LEGACY_CONTROL: PluginController vẫn KHÔNG publish PLUGIN_COMMAND (hành vi cũ giữ nguyên)', receivedInLegacy === false);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
