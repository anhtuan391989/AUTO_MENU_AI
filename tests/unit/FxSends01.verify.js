/** FxSends01.verify.js — FX-SENDS-01: nút FX (bấm tay + FX Auto) gửi thêm 6 CC cho 6 nút nguồn của hộp Sends trong Studio One (kênh 15, CC 40..45).
 *  MÔ PHỎNG (hàm gửi MIDI giả) — KHÔNG phải Studio One thật. Chạy: node tests/unit/FxSends01.verify.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const FX_SAVED = { FX_ON: { kind: 'cc', channel: 16, number: 108, value: 127 }, FX_OFF: { kind: 'cc', channel: 16, number: 109, value: 127 } };
function makeAR(daw, saved, settings, failCc) {
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? (saved || {}) : (settings || {})[k]), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { if (failCc === n) return false; sent.push([n, v, ch]); return true; } };
    vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb, { filename: 'actionRegistry.js' });
    return Object.assign({}, win.ActionRegistry, { __sent: sent, __win: win });
}
const SP = (v) => ({ 'Studio Pro 8': { ...FX_SAVED } });
(async () => {
    console.log('== 1. FX BẬT/TẮT gửi thêm 6 CC Sends (mặc định, không cần Setup) ==');
    let AR = makeAR('Studio Pro 8', SP());
    ok(['FX_SENDS_1', 'FX_SENDS_2', 'FX_SENDS_3', 'FX_SENDS_4', 'FX_SENDS_5', 'FX_SENDS_6'].every((a) => AR.ACTIONS[a] === a), '6 action FX_SENDS_1..6 tồn tại');
    let r = await AR.setDawControlState('FX', true, {});
    ok(r.ok && JSON.stringify(AR.__sent[0]) === JSON.stringify([108, 127, 15]), 'FX BẬT: lệnh chính FX_ON (CC108 kênh 16) vẫn gửi TRƯỚC, giữ nguyên');
    ok(JSON.stringify(AR.__sent.slice(1)) === JSON.stringify([40, 41, 42, 43, 44, 45].map((n) => [n, 127, 14])), 'FX BẬT: sau đó 6 CC 40..45 = 127 kênh 15 (index 14)');
    ok(r.sendsExtra && Object.values(r.sendsExtra).every((x) => x === 'OK') && Object.keys(r.sendsExtra).length === 6, 'kết quả báo sendsExtra 6/6 OK');
    AR.__sent.length = 0; r = await AR.setDawControlState('FX', false, {});
    ok(JSON.stringify(AR.__sent[0]) === JSON.stringify([109, 127, 15]) && JSON.stringify(AR.__sent.slice(1)) === JSON.stringify([40, 41, 42, 43, 44, 45].map((n) => [n, 0, 14])), 'FX TẮT: FX_OFF (CC109) rồi 6 CC 40..45 = 0');

    console.log('== 1b. Đường FX CŨ (chưa lưu FX ON/OFF): sendFxSendsLink gọi trực tiếp ==');
    AR = makeAR('Studio Pro 8', {}); const wsb = AR.__win; r = await AR.sendFxSendsLink(true, { reason: 'menu-button' });
    ok(r && r.ok && JSON.stringify(AR.__sent) === JSON.stringify([40, 41, 42, 43, 44, 45].map((n) => [n, 127, 14])), 'FX cũ BẬT: gửi đủ 6 CC 40..45 = 127 (không cần FX ON/OFF)');
    ok(AR.__win.__fxSendsLast && /đã GỬI 6\/6/.test(AR.__win.__fxSendsLast.text), 'ghi window.__fxSendsLast.text để hiện trên tooltip nút FX');
    AR.__sent.length = 0; await AR.sendFxSendsLink(false, {}); ok(AR.__sent.length === 6 && AR.__sent.every((m) => m[1] === 0), 'FX cũ TẮT: 6 CC = 0');
    AR = makeAR('Studio Pro 8', {}, {}, 43); r = await AR.sendFxSendsLink(true, {}); ok(r && !r.ok && r.okCount === 5 && /5\/6/.test(AR.__win.__fxSendsLast.text), 'một CC lỗi: báo 5/6 trên tooltip, không ném lỗi');
    AR = makeAR('Studio Pro 8', {}, { fxSendsLink: false }); r = await AR.sendFxSendsLink(true, {}); ok(r === null && AR.__sent.length === 0, 'fxSendsLink=false: không gửi');
    const rend = rd('ui/js/renderer.js');
    ok(/window\.__fxLastManualVia = "send";\s*\/\/ FX-SENDS-01[\s\S]{0,400}sendFxSendsLink\?\.\(!!target[\s\S]{0,300}group\.apply\(!!target, \{ force: true \}\)/.test(rend), 'renderer: đường FX cũ gọi sendFxSendsLink TRƯỚC lệnh FX cũ (lệnh cũ giữ nguyên)');
    ok(/withSends\(syncText0\(info\)\)/.test(rend), 'renderer: tooltip nút FX có thêm dòng kết quả Sends');

    console.log('== 2. Cờ tuỳ chọn ==');
    AR = makeAR('Studio Pro 8', SP(), { fxSendsInvert: true }); await AR.setDawControlState('FX', true, {});
    ok(AR.__sent.slice(1).every((m) => m[1] === 0) && AR.__sent.length === 7, 'fxSendsInvert=true: FX BẬT gửi 0 (đảo)');
    AR = makeAR('Studio Pro 8', SP(), { fxSendsLink: false }); r = await AR.setDawControlState('FX', true, {});
    ok(AR.__sent.length === 1 && !r.sendsExtra, 'fxSendsLink=false: chỉ còn lệnh FX chính, không gửi Sends');

    console.log('== 3. An toàn: không làm hỏng FX chính / các nút khác ==');
    AR = makeAR('Studio Pro 8', SP(), {}, 42); r = await AR.setDawControlState('FX', true, {});
    ok(r.ok && r.sendsExtra.FX_SENDS_3 === 'FAIL' && r.sendsExtra.FX_SENDS_4 === 'OK' && AR.__sent.length === 6, 'một CC phụ lỗi (CC42): FX chính vẫn ok, các CC còn lại vẫn gửi');
    AR = makeAR('Studio Pro 8', SP(), {}, 108); r = await AR.setDawControlState('FX', true, {});
    ok(!r.ok && AR.__sent.length === 0 && !r.sendsExtra, 'lệnh FX chính lỗi => KHÔNG gửi Sends');
    AR = makeAR('Studio Pro 8', {}); r = await AR.setDawControlState('FX', true, {});
    ok(AR.__sent.every((m) => m[0] < 40 || m[0] > 45) && !r.sendsExtra, 'chưa cấu hình FX ON/OFF (chế độ cũ): KHÔNG gửi Sends, hành vi cũ giữ nguyên');
    AR = makeAR('Studio Pro 8', SP()); await AR.setDawControlState('MIC1', true, {}); await AR.setDawControlState('LOFI', true, {}); await AR.setDawControlState('TUNE', true, {});
    ok(AR.__sent.every((m) => m[0] < 40 || m[0] > 45), 'MIC1 / LOFI / TUNE không gửi CC 40..45');
    AR = makeAR('Studio Pro 8', { 'Studio Pro 8': { ...FX_SAVED, FX_SENDS_2: { kind: 'cc', channel: 15, number: 77, value: 127 } } }); await AR.setDawControlState('FX', true, {});
    ok(AR.__sent.some((m) => m[0] === 77 && m[1] === 127) && !AR.__sent.some((m) => m[0] === 41), 'mapping người dùng đã lưu cho FX_SENDS_2 thắng mặc định (CC77 thay CC41)');
    AR = makeAR('Cubase 14', { 'Cubase 14': { FX_ON: { kind: 'cc', channel: 1, number: 50, value: 127 } } }); r = await AR.setDawControlState('FX', true, {});
    ok(AR.__sent.length === 1 && Object.values(r.sendsExtra || {}).every((x) => x === 'NOT_CONFIGURED'), 'Cubase: không có mặc định Sends (chưa kiểm chứng) => không gửi');

    console.log('== 4. Surface Studio One + Setup khớp ==');
    const xml = rd('studio_one/AutoMenuAI.surface.xml');
    ok([1, 2, 3, 4, 5, 6].every((i) => new RegExp('name="fxSends' + i + '"[\\s\\S]{0,200}status="#BE" address="' + (39 + i) + '"').test(xml)), 'surface có 6 control fxSends1..6 = kênh 15 (#BE) CC 40..45');
    const addrs = [...xml.matchAll(/status="(#B[EF])" address="(\d+)"/g)].map((m) => m[1] + m[2]);
    ok(new Set(addrs).size === addrs.length, 'surface: không có 2 control trùng (kênh, CC)');
    const setup = rd('ui/js/setup.js');
    ok(/FX_SENDS_\[1-6\][\s\S]{0,300}number: 39 \+ Number/.test(setup), 'Setup: mặc định FX_SENDS khớp actionRegistry');
    ok([1, 2, 3, 4, 5, 6].every((i) => setup.indexOf('{ action: "FX_SENDS_' + i + '"') > 0) && setup.indexOf('{ action: "FX_OFF"') < setup.indexOf('{ action: "FX_SENDS_1"') && /\{ action: "FX_ON"/.test(setup) && /\{ action: "FX_OFF"/.test(setup), 'Setup: 6 dòng FX_SENDS_1..6 ngay sau FX_OFF; dòng FX_ON / FX_OFF cũ vẫn còn');
    ok(/fxsends: Object\.freeze\(\{ title: "FX → SENDS[^\n]*count: 6[^\n]*FX_SENDS_1: 40[^\n]*FX_SENDS_6: 45/.test(setup), 'Setup: bộ điền nhanh Fender Studio Pro 8 có bộ fxsends (6 mapping, kênh 15, CC 40..45)');
    ok(/\.forEach\(\(a\) => MIDI_CONFLICT_GUARD_SET\.add\(a\)\)/.test(setup) && /FX_SENDS_6", "FX_SENDS_5|"FX_SENDS_1", "FX_SENDS_2"/.test(setup), 'Setup: 6 action FX_SENDS thuộc nhóm bảo vệ trùng CC');
    ok(!/FX_SENDS/.test(rd('ui/index.html')) && !/FX_SENDS/.test(rd('ui/js/renderer.js')), 'KHÔNG đổi HTML / renderer (giao diện giữ nguyên)');
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
