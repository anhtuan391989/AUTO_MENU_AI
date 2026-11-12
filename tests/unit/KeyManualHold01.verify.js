// KEY-MANUAL-HOLD-01 — chạy: node tests/unit/KeyManualHold01.verify.js
// Kiểm tra: đã GỬI Key tay -> bấm Tự dò / AI Dò Key + GỬI KHÔNG đổi Key tay; đổi bài -> về tự động.
// Chạy hàm thật cắt từ ui/js/renderer.js trong môi trường giả. KHÔNG mở Electron.
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui/js/renderer.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

const a = src.indexOf('function isManualKeyHeld()'), b = src.indexOf('function triggerAiKeyDetect()');
ok(a > 0 && b > a, 'tìm thấy 3 hàm trợ giúp trong renderer.js');
const helpers = src.slice(a, b);

function makeEnv(manual) {
  const logs = [];
  const ctx = { keySource: { manual: Object.assign({ active: false, selectedKey: null, committedKey: null }, manual) },
    keySelector: { value: 'AI Key Detect' }, console: { log: (m) => logs.push(String(m)) },
    modActive: false, modOffCalls: 0, isManualOverrideActive() { return ctx.modActive; }, turnManualOverrideOff() { ctx.modOffCalls++; ctx.modActive = false; } };
  vm.createContext(ctx); vm.runInContext(helpers + '\nthis.isManualKeyHeld=isManualKeyHeld;this.__holdManualKey=__holdManualKey;this.__releaseManualKeyForNewSong=__releaseManualKeyForNewSong;', ctx);
  ctx.logs = logs; return ctx;
}

// 1) Đang giữ Key tay
let e = makeEnv({ active: true, selectedKey: 'AI Key Detect', committedKey: 'E Major' });
ok(e.isManualKeyHeld() === true, 'Manual active + có committedKey -> đang giữ Key tay');
e.keySelector.value = 'AI Key Detect';
e.__holdManualKey('Tự dò');
ok(e.keySource.manual.committedKey === 'E Major' && e.keySource.manual.active === true, 'bấm Tự dò: Key tay E Major vẫn nguyên, Manual vẫn active');
ok(e.keySelector.value === 'E Major' && e.keySource.manual.selectedKey === 'E Major', 'bấm Tự dò: dropdown quay lại đúng Key tay (không kẹt "AI Key Detect")');
ok(e.logs.some((l) => /\[Manual Hold\]/.test(l)), 'có log [Manual Hold] để dễ gỡ lỗi');

// 2) Không giữ khi chưa gửi Key tay / gửi chưa xác nhận
ok(makeEnv({ active: false, committedKey: 'E Major' }).isManualKeyHeld() === false, 'Manual đã tắt -> không giữ (Tự dò hoạt động bình thường)');
ok(makeEnv({ active: true, committedKey: null }).isManualKeyHeld() === false, 'chưa có Key xác nhận -> không giữ');

// 3) Đổi bài -> về tự động
e = makeEnv({ active: false, selectedKey: 'E Major', committedKey: 'E Major' }); e.modActive = true; e.keySelector.value = 'E Major';
e.__releaseManualKeyForNewSong();
ok(e.keySource.manual.selectedKey === null && e.keySelector.value === 'AI Key Detect', 'đổi bài: nhả lựa chọn Key tay, dropdown về "AI Key Detect"');
ok(e.modOffCalls === 1 && e.modActive === false, 'đổi bài: Mod tay đang bật cũng được tắt về tự động');
e = makeEnv({}); e.__releaseManualKeyForNewSong();
ok(e.modOffCalls === 0, 'đổi bài khi Mod tay không bật: không gọi tắt thừa');

// 4) Dây nối trong renderer.js
ok(/function triggerAiKeyDetect\(\) \{\s*\n\s*if \(isManualKeyHeld\(\)\) \{ __holdManualKey\("Tự dò"\); return; \}[^\n]*\n\s*cancelManualOverride\(\);/.test(src), 'triggerAiKeyDetect: guard giữ Key tay đứng TRƯỚC cancelManualOverride()');
ok(/cancelManualOverride\(\);\s*\n\s*__releaseManualKeyForNewSong\(\);/.test(src), 'đổi bài: nhả Manual rồi mới trả về tự động');
ok(/if \(!__autoDetectInternal && isManualKeyHeld\(\)\) return;/.test(src), 'nút AUTO DETECT (Auto-Key): người dùng bấm khi giữ Key tay -> không dò + Send đè');
ok(/if \(!__autoDetectInternal && isManualKeyHeld\(\)\) \{ __holdManualKey\("AUTO DETECT"\); return; \}/.test(src), 'nút AUTO DETECT: người dùng bấm khi giữ Key tay -> không reset AI/Key');
ok(/__autoDetectInternal = true;[^\n]*\n\s*try \{ document\.getElementById\("autoDetectBtn"\)\?\.click\(\);/.test(src), 'đổi bài (internal) vẫn đi đường cũ -> tự động dò lại bình thường');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
