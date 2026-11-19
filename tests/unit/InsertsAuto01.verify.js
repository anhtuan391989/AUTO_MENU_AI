/** InsertsAuto01.verify.js — INSERTS-AUTO-01: thẻ chuột phải nút FX = 3 Ô TÍCH; Auto Inserts theo nhạc ĐỘC LẬP Auto FX.
 *  Chạy THẬT hàm initFxAutoMenu() lấy từ ui/js/renderer.js (DOM giả tối giản, MIDI giả). Chạy: node tests/unit/InsertsAuto01.verify.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l); } };
const rend = fs.readFileSync(path.join(__dirname, '..', '..', 'ui/js/renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const a = rend.indexOf('function initFxAutoMenu()');
const b = rend.indexOf('// AUTODETECT-MODE-01', a);
const src = rend.slice(a, b);

function makeEnv(initSettings) {
    const settings = Object.assign({ fxAutoEnabled: true }, initSettings || {});
    const sent = [];
    const mkInput = () => { const h = {}; return { checked: false, dataset: {}, style: {}, addEventListener: (ev, fn) => { (h[ev] = h[ev] || []).push(fn); },
        click() { this.checked = !this.checked; (h.change || []).forEach((f) => f({ stopPropagation() {} })); } }; };
    const inputs = {};
    const card = { id: '', style: {}, innerHTML: '', offsetWidth: 100, offsetHeight: 60,
        querySelector: (sel) => { const id = sel.replace('#', ''); if (!new RegExp('id="' + id + '"').test(card.innerHTML)) return null;
            if (!inputs[id]) { inputs[id] = mkInput(); if (new RegExp('id="' + id + '"[^>]* checked').test(card.innerHTML)) inputs[id].checked = true; } return inputs[id]; },
        contains: () => false };
    const fxBtn = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 100, width: 10, bottom: 120 }) };
    const document = { getElementById: (id) => (id === 'fxBtn' ? fxBtn : null), createElement: () => card, body: { appendChild() {} }, addEventListener() {} };
    const win = { innerWidth: 800, ActionRegistry: { sendInsertsState: async (w, on, o) => { sent.push([w, on, o && o.reason]); return { ok: true }; } } };
    const sb = { document, window: win, console: { log() {}, error() {}, warn() {} }, Promise,
        getSetting: (k, fb) => (settings[k] !== undefined ? settings[k] : fb), setSetting: (k, v) => { settings[k] = v; },
        createPopupAutoHide: () => ({ arm() {}, disarm() {} }) };
    vm.createContext(sb); vm.runInContext(src + '\ninitFxAutoMenu();', sb, { filename: 'initFxAutoMenu' });
    return { win, sent, settings, card, inputs, flush: () => new Promise((r) => setImmediate(r)) };
}

(async () => {
    console.log('== 1. Giao diện: 3 ô tích (không còn nút AUTO MUSIC ON / INSERTS) ==');
    let e = makeEnv();
    ok((e.card.innerHTML.match(/type="checkbox"/g) || []).length === 3, 'thẻ FX có đúng 3 ô tích');
    ok(!/AUTO MUSIC ON/.test(e.card.innerHTML) && !/preset-btn/.test(e.card.innerHTML), 'không còn nút AUTO MUSIC ON / nút INSERTS');
    ok(e.inputs.fxAutoEnabledBtn.checked && e.inputs.insertsAutoChk.checked && e.inputs.insertsAllBtn.checked, 'mở app: cả 3 ô đều TÍCH (Auto FX, Auto Inserts, Inserts BẬT)');
    ok(/Auto bật FX khi có nhạc/.test(e.card.innerHTML) && /Auto Inserts theo nhạc/.test(e.card.innerHTML) && />Inserts</.test(e.card.innerHTML), 'nhãn đúng');

    console.log('== 2. Auto Inserts: có nhạc BẬT / không nhạc TẮT ==');
    const m = (s) => e.win.__insertsAutoOnMusic(s);
    m('UNKNOWN'); await e.flush(); ok(e.sent.length === 0, 'chưa rõ trạng thái nhạc: không gửi gì');
    m('MUSIC_SILENT'); await e.flush(); ok(e.sent.length === 1 && e.sent[0][1] === false && e.sent[0][2] === 'inserts-auto-music' && !e.inputs.insertsAllBtn.checked, 'không nhạc => Inserts TẮT (ô bỏ tích, gửi 0)');
    m('MUSIC_SILENT'); await e.flush(); ok(e.sent.length === 1, 'trạng thái nhạc không đổi => không gửi lại');
    m('MUSIC_PRESENT'); await e.flush(); ok(e.sent.length === 2 && e.sent[1][1] === true && e.inputs.insertsAllBtn.checked, 'có nhạc => Inserts BẬT (ô tích, gửi 127)');
    m('SOURCE_UNAVAILABLE'); await e.flush(); ok(e.sent.length === 2, 'mất nguồn nhạc => giữ nguyên');

    console.log('== 3. Độc lập với Auto FX ==');
    e = makeEnv({ fxAutoEnabled: false });
    e.win.__insertsAutoOnMusic('MUSIC_SILENT'); await e.flush();
    ok(e.sent.length === 1 && e.sent[0][1] === false, 'Auto FX đang BỎ tích: Auto Inserts vẫn chạy theo nhạc');
    ok(!/__insertsAllSet\?\.\(!!target, "fx-auto-music"\)/.test(rend), 'onRequest của Auto FX không còn điều khiển Inserts (hết bị kẹt 60 s khi bấm tay nút FX)');
    ok(/window\.__insertsAutoOnMusic\?\.\(info\.musicState\)/.test(rend), 'onState (mọi thay đổi nhạc) gọi Auto Inserts');

    console.log('== 4. Chế độ NGƯỜI DÙNG (bỏ tích Auto Inserts) ==');
    e = makeEnv();
    e.inputs.insertsAutoChk.click(); ok(e.settings.insertsAutoEnabled === false, 'bỏ tích => lưu insertsAutoEnabled = false');
    e.win.__insertsAutoOnMusic('MUSIC_SILENT'); await e.flush(); ok(e.sent.length === 0 && e.inputs.insertsAllBtn.checked, 'chế độ người dùng + không nhạc: Inserts KHÔNG tự tắt');
    e.inputs.insertsAllBtn.click(); await e.flush(); ok(e.sent.length === 1 && e.sent[0][1] === false && e.sent[0][2] === 'menu-button', 'người dùng bỏ tích Inserts => TẮT (gửi 0, lý do menu-button)');
    e.win.__insertsAutoOnMusic('MUSIC_PRESENT'); await e.flush(); ok(e.sent.length === 1 && !e.inputs.insertsAllBtn.checked, 'chế độ người dùng + có nhạc: Inserts KHÔNG tự bật');
    e.inputs.insertsAutoChk.click(); await e.flush(); ok(e.settings.insertsAutoEnabled === true, 'tích lại => lưu insertsAutoEnabled = true');
    e = makeEnv(); e.win.__fxAutoInfo = null; // tích lại khi đang có nhạc => bật NGAY
    e.win.__insertsAutoOnMusic('MUSIC_SILENT'); await e.flush(); e.inputs.insertsAutoChk.click(); e.win.__fxAutoInfo = { musicState: 'MUSIC_PRESENT' }; e.inputs.insertsAutoChk.click(); await e.flush();
    ok(e.sent[e.sent.length - 1][1] === true && e.inputs.insertsAllBtn.checked, 'tích lại Auto Inserts lúc đang có nhạc => Inserts BẬT ngay');

    console.log('== 5. Bấm tay giữa lúc Auto ==');
    e = makeEnv(); e.win.__insertsAutoOnMusic('MUSIC_PRESENT'); await e.flush();
    e.inputs.insertsAllBtn.click(); await e.flush(); ok(!e.inputs.insertsAllBtn.checked && e.sent[e.sent.length - 1][1] === false, 'bấm tay TẮT trong lúc có nhạc: có hiệu lực ngay');
    e.win.__insertsAutoOnMusic('MUSIC_PRESENT'); await e.flush(); const n = e.sent.length; ok(true, 'nhạc không đổi => Auto không đè lên lựa chọn tay');
    e.win.__insertsAutoOnMusic('MUSIC_SILENT'); e.win.__insertsAutoOnMusic('MUSIC_PRESENT'); await e.flush(); ok(e.sent.length === n + 2 && e.sent[e.sent.length - 1][1] === true, 'nhạc đổi lần kế => Auto tiếp tục (tắt rồi bật lại)');

    console.log('KẾT QUẢ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
