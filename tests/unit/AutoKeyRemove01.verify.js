'use strict';
// AUTOKEY-REMOVE-01: chế độ "Tự dò bằng tay" (Auto-Key) bị loại bỏ — luôn tắt, không còn thẻ chuột phải, Setup ẩn khối cài đặt.
const fs = require('fs'), vm = require('vm'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf-8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };
const r = rd('ui/js/renderer.js');
ok(/const __AUTOKEY_MODE_REMOVED = true;/.test(r), 'công tắc cứng __AUTOKEY_MODE_REMOVED = true');
ok(/!\(typeof __AUTOKEY_MODE_REMOVED !== "undefined" && __AUTOKEY_MODE_REMOVED\) && ak/.test(r), '__aiCoreCfg bỏ qua autoKeyMode đã lưu');
const f = r.slice(r.indexOf('function initAutoDetectModePopup'), r.indexOf('const btn = document.getElementById("autoDetectBtn")'));
ok(/__AUTOKEY_MODE_REMOVED/.test(f) && /return;/.test(f), 'initAutoDetectModePopup thoát sớm (không tạo thẻ chuột phải)');
// chạy thật nhánh thoát sớm: không tạo thẻ, ép cờ lưu về tắt
const sb = { __AUTOKEY_MODE_REMOVED: true, saved: null, getSetting: () => ({ enabled: true, waitSec: 9, via: 'midi' }), setSetting: (k, v) => { sb.saved = v; }, document: { getElementById: () => { throw new Error('không được tạo thẻ'); } } };
vm.createContext(sb); vm.runInContext(r.slice(r.indexOf('function initAutoDetectModePopup'), r.indexOf('const btn = document.getElementById("autoDetectBtn")')) + '}; initAutoDetectModePopup();', sb);
ok(sb.saved && sb.saved.enabled === false && sb.saved.waitSec === 9 && sb.saved.via === 'midi', 'cờ lưu ép về enabled=false, giữ waitSec/via');
const s = rd('ui/js/setupAutoKey.js');
ok(/autoKeyModeBlock/.test(s) && /display = "none"/.test(s) && /AUTOKEY-REMOVE-01/.test(s), 'Setup ẩn khối Auto-Key bằng JS (không sửa HTML)');
console.log(pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
