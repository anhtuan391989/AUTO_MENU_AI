'use strict';
// AUTOKEY-SYNC-01: ô "Bật" ở Setup đồng bộ với thẻ "Tự dò bằng tay / Dò bằng AI" ở Menu; lưu ở Setup không xoá `via`.
const fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };
const code = fs.readFileSync(path.join(__dirname, '../../ui/js/setupAutoKey.js'), 'utf-8');
let file = { autoKeyMode: { enabled: false, waitSec: 15, via: 'midi' } };
const en = { checked: false, addEventListener(e, f) { this['on_' + e] = f; } }, wt = { value: '', addEventListener(e, f) { this['on_' + e] = f; } }, st = { textContent: '' };
const els = { autoKeyModeEnable: en, autoKeyWaitSec: wt, autoKeyModeStatus: st };
let saved = null, timer = null, focusFn = null;
const win = { electronAPI: { loadSettingsSync: () => JSON.parse(JSON.stringify(file)) }, addEventListener: (e, f) => { if (e === 'focus') focusFn = f; } };
const sb = { window: win, document: { getElementById: (i) => els[i], activeElement: null, addEventListener() {} }, getSetting: (k, d) => d, setSetting: (k, v) => { saved = v; file[k] = v; }, setInterval: (f) => { timer = f; }, module: undefined };
vm.createContext(sb); vm.runInContext(code, sb); win.setupAutoKey.init.call(null);
ok(en.checked === false && wt.value === 15, 'mở Setup: đọc đúng file (Bật = tắt, 15 giây)');
file.autoKeyMode.enabled = true; // Menu: tích "Tự dò bằng tay"
timer(); ok(en.checked === true, 'Menu tích "Tự dò bằng tay" -> ô Bật ở Setup tự bật (tick 2 giây)');
file.autoKeyMode.enabled = false; focusFn(); ok(en.checked === false, 'Menu chọn "Dò bằng AI" -> ô Bật tự tắt (khi cửa sổ lấy focus)');
file.autoKeyMode.enabled = true; timer(); wt.value = '20'; wt.on_change();
ok(saved && saved.enabled === true && saved.waitSec === 20 && saved.via === 'midi', 'đổi số giây ở Setup: giữ enabled=true từ Menu và via=midi (không bị ghi đè)');
console.log(pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
