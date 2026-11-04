/**
 * MIC-VOLUME-KNOB-01 — chuột phải MIC 1 / MIC 2 hiện núm âm lượng của đúng mic; xoay núm gửi CC đúng mapping.
 * Mã THẬT: ui/js/actionRegistry.js (executeAction/knobToCc), initMicVolumePopups + khối Knob trích từ renderer.js, bảng/bộ CC trích từ setup.js.
 * GIẢ: DOM, MIDI (sendMidiCC ghi lại). KHÔNG phải Studio Pro 8 thật.
 * Chạy: node tests/unit/MicVolumeKnob01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.AUTOMENU_ROOT || path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const REN = read('ui/js/renderer.js');
function braceEnd(src, open) { let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return i + 1; } throw new Error('unbalanced'); }
const fnSrc = (name) => { const a = REN.indexOf('function ' + name + '('); if (a < 0) throw new Error(name); return REN.slice(a, braceEnd(REN, REN.indexOf('{', a))); };
const popupConst = REN.slice(REN.indexOf('const POPUP_AUTO_HIDE_MS'), REN.indexOf('function initMicVolumePopups')); // A97: gồm cả helper tự ẩn 5 s + MIC_VOLUME_POPUPS
const kStart = REN.indexOf('let activeKnob = null;'), kEnd = REN.indexOf('document.addEventListener("mouseup"', kStart); // A97: helper tự ẩn cũng có listener mouseup ở phía trên, nên tìm từ kStart
const knobBlock = REN.slice(kStart, kEnd);
const knobDataSrc = REN.slice(REN.indexOf('const knobData = ['), REN.indexOf('];', REN.indexOf('const knobData = [')) + 2);

class El { constructor(id) { this.id = id; this.h = {}; const st = {}; Object.defineProperty(st, 'cssText', { set(v) { String(v).split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) st[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }); }, enumerable: false }); this.style = st; this.children = []; this.textContent = ''; this.className = '';
    this._ih = ''; this.rect = { left: 300, top: 400, width: 100, bottom: 440 }; }
    addEventListener(e, f) { (this.h[e] = this.h[e] || []).push(f); }
    fire(e, p) { (this.h[e] || []).forEach((f) => f(p)); }
    getBoundingClientRect() { return this.rect; }
    contains(t) { return t === this; }
    set innerHTML(v) { this._ih = v; } get innerHTML() { return this._ih; } }

function build({ mapping = true, saved } = {}) {
    const els = { mic1Btn: new El('mic1Btn'), mic2Btn: new El('mic2Btn') };
    const sent = []; const docH = {}; const created = []; const store = { selectedDAW: 'Studio Pro 8', dawMidiOutMappings: { 'Studio Pro 8': mapping ? { MIC1_VOLUME: { kind: 'cc', channel: 15, number: 24, value: 127 }, MIC2_VOLUME: { kind: 'cc', channel: 15, number: 25, value: 127 } } : {} } };
    const doc = { getElementById: (id) => els[id] || null,
        createElement: () => { const e = new El(''); const real = e; created.push(e); // id được gán khi innerHTML có id=...
            Object.defineProperty(e, 'innerHTML', { set(v) { e._ih = v; for (const m of v.matchAll(/id="([^"]+)"/g)) { const c = new El(m[1]); els[m[1]] = c; } }, get() { return e._ih; } }); return real; },
        body: { style: {}, appendChild() {} }, addEventListener: (e, f) => { (docH[e] = docH[e] || []).push(f); } };
    const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Date, Math, Promise, Number,
        getSetting: (k, f) => (store[k] === undefined ? f : store[k]), setSetting() {},
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; }, sendMidiNotePulse: async () => true,
        document: doc, innerWidth: 800, saveData() {}, electronAPI: {}, KNOB_ID_TO_SOUND_EFFECT: {}, SoundEffectEngine: { setVolume() {} },
        updateKnob(k) { const v = els[k.valueId]; if (v) v.textContent = k.value; } };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('ui/js/actionRegistry.js'), sb);
    vm.runInContext(knobDataSrc + '\n' + popupConst + '\n' + fnSrc('initMicVolumePopups') + '\nthis.knobData = knobData; this.initMicVolumePopups = initMicVolumePopups;', sb);
    if (saved) { sb.knobData.find((k) => k.id === 'mic1VolKnob').value = saved; }
    sb.initMicVolumePopups();
    vm.runInContext(knobBlock + '\nthis.__dispatch = dispatchKnobVolume;', sb);
    // đăng ký handler Knob giống DOMContentLoaded (chỉ phần forEach trong knobBlock đã chạy cho các knob có sẵn trong els lúc đó)
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    return { sb, els, sent, docH, created, flush, kd: (id) => sb.knobData.find((k) => k.id === id) };
}

(async () => {
    console.log('== 1. Núm mic có trong dữ liệu + HTML không bị đổi ==');
    { const e = build();
      ok(e.kd('mic1VolKnob') && e.kd('mic2VolKnob') && e.kd('mic1VolKnob').value === 90 && e.kd('mic2VolKnob').defaultValue === 90, 'knobData có mic1VolKnob/mic2VolKnob mặc định 90');
      const html = read('ui/index.html'); ok(!/mic1VolKnob|mic2VolKnob/.test(html), 'index.html KHÔNG chứa núm mic (tạo bằng JS)'); }

    console.log('== 2. Chuột phải MIC 1 / MIC 2 ==');
    { const e = build(); const p1 = e.els.mic1VolKnob, p2 = e.els.mic2VolKnob;
      ok(!!p1 && !!p2, 'tạo 2 thẻ núm (mic1VolKnob, mic2VolKnob)');
      const card1 = e.created.find((x) => /mic1Vol/.test(x._ih)); const card2 = e.created.find((x) => /mic2Vol/.test(x._ih));
      ok(card1 && card1.style.display === 'none' && card2.style.display === 'none', 'ban đầu cả 2 thẻ ẩn');
      let prevented = false; e.els.mic1Btn.fire('contextmenu', { preventDefault() { prevented = true; } });
      ok(prevented && card1.style.display === 'flex' && card2.style.display === 'none', 'chuột phải MIC 1 -> chỉ hiện núm MIC 1');
      ok(card1.style.top === '298px' && card1.style.left === '255px', 'thẻ hiện phía trên nút, căn giữa (top/left = ' + card1.style.top + '/' + card1.style.left + ')');
      e.els.mic2Btn.fire('contextmenu', { preventDefault() {} });
      ok(card1.style.display === 'none' && card2.style.display === 'flex', 'chuột phải MIC 2 -> đóng MIC 1, hiện MIC 2');
      e.els.mic2Btn.fire('contextmenu', { preventDefault() {} }); ok(card2.style.display === 'none', 'chuột phải lần nữa -> đóng');
      e.els.mic1Btn.fire('contextmenu', { preventDefault() {} });
      e.docH.mousedown.forEach((f) => f({ target: card1 })); ok(card1.style.display === 'flex', 'bấm TRONG thẻ không đóng');
      e.docH.mousedown.forEach((f) => f({ target: new El('x') })); ok(card1.style.display === 'none', 'bấm ra ngoài -> đóng');
      e.els.mic1Btn.fire('contextmenu', { preventDefault() {} }); e.docH.keydown.forEach((f) => f({ key: 'Escape' })); ok(card1.style.display === 'none', 'Esc -> đóng');
      e.els.mic1Btn.rect = { left: 300, top: 20, width: 100, bottom: 60 }; e.els.mic1Btn.fire('contextmenu', { preventDefault() {} });
      ok(card1.style.top === '66px', 'không đủ chỗ phía trên -> hiện bên dưới nút (top=' + card1.style.top + ')'); }

    console.log('== 3. Xoay núm -> CC đúng mapping (MIC 1 = CC24, MIC 2 = CC25, kênh 15) ==');
    { const e = build();
      const exp = { 50: 64, 90: 97, 100: 127 };
      for (const [ui, cc] of Object.entries(exp)) { e.sent.length = 0; vm.runInContext('window.__knobLastCc = {}', e.sb);
        await e.sb.__dispatch('mic1VolKnob', +ui); await e.flush();
        ok(e.sent.length === 1 && e.sent[0].n === 24 && e.sent[0].ch === 14 && e.sent[0].v === cc, `MIC1 núm ${ui} -> CC24 giá trị ${cc}`, e.sent); }
      e.sent.length = 0; await e.sb.__dispatch('mic2Btn' === 0 ? '' : 'mic2VolKnob', 90); await e.flush();
      ok(e.sent.length === 1 && e.sent[0].n === 25 && e.sent[0].v === 97, 'MIC2 núm 90 -> CC25 giá trị 97 (0 dB)', e.sent);
      e.sent.length = 0; await e.sb.__dispatch('mic1VolKnob', 70); await e.flush(); await e.sb.__dispatch('mic1VolKnob', 70); await e.flush();
      ok(e.sent.length === 1, 'cùng giá trị gửi lặp -> chỉ gửi 1 lần (chống trùng)');
      e.sent.length = 0; await e.sb.__dispatch('mic2VolKnob', 60); await e.flush(); ok(e.sent.every((m) => m.n === 25) && !e.sent.some((m) => m.n === 24), 'xoay MIC 2 không đụng CC của MIC 1');
      e.sent.length = 0; await e.sb.__dispatch('musicKnob', 90); await e.flush(); ok(e.sent.length === 0, 'MUSIC chưa gán mapping nên không gửi (mic không lẫn với MUSIC)'); }

    console.log('== 4. Chưa gán mapping ==');
    { const e = build({ mapping: false }); await e.sb.__dispatch('mic1VolKnob', 80); await e.flush(); ok(e.sent.length === 0, 'chưa lưu CC trong Setup -> không gửi gì, không lỗi'); }

    console.log('== 5. Khôi phục giá trị đã lưu ==');
    { const e = build({ saved: 63 }); ok(e.els.mic1VolValue.textContent === 63, 'giá trị đã lưu 63 được vẽ lên núm MIC 1', e.els.mic1VolValue.textContent); }

    console.log('== 6. Setup: bảng mapping + bộ điền nhanh ==');
    { const SET = read('ui/js/setup.js');
      ok(/action: "MIC1_VOLUME"/.test(SET) && /action: "MIC2_VOLUME"/.test(SET), 'Setup có 2 dòng MIC1_VOLUME / MIC2_VOLUME');
      ok(/micvol: Object\.freeze\(\{ title: "MIC VOLUME", count: 2, mappings: dawQfMake\(15, 127, \{ MIC1_VOLUME: 24, MIC2_VOLUME: 25 \}\) \}\)/.test(SET), 'bộ điền nhanh MIC VOLUME: CC24/CC25 kênh 15');
      const used = [...SET.matchAll(/dawQfMake\((\d+), 127, \{([^}]*)\}/g)].filter((m) => m[1] === '15' && !/MIC1_VOLUME/.test(m[2])).flatMap((m) => [...m[2].matchAll(/:\s*(\d+)/g)].map((x) => +x[1]));
      ok(![24, 25].some((n) => used.includes(n) && false) && !used.includes(24) && !used.includes(25), 'CC24/25 không trùng CC nào của bộ KNOB (kênh 15): ' + used.join(',')); }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI HARNESS', e); process.exit(2); });
