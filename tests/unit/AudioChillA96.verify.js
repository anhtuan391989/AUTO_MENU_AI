// TASK A96 — popup chuột phải MUSIC: nút AUDIO CHILL (ON/OFF) + knob điều khiển 1 VST, tất cả qua MIDI, nút và knob độc lập.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l, x !== undefined ? JSON.stringify(x) : ''); } };
function makeAR(daw, saved) {
    const sent = []; const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console: { log() {}, error: console.error, warn() {} }, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? daw : k === 'dawMidiOutMappings' ? (saved || {}) : undefined), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { sent.push([n, v, ch]); return true; } };
    vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb);
    return { AR: win.ActionRegistry, sent };
}
(async () => {
    console.log('== 1. MIDI mặc định + gửi ==');
    for (const daw of ['Studio Pro 8', 'Cubase 14']) { const { AR } = makeAR(daw);
        const a = AR.getMidiOutMapping('AUDIO_CHILL_STATE'), b = AR.getMidiOutMapping('AUDIO_CHILL_KNOB');
        ok(a && b && a.channel === 15 && a.number === 94 && b.channel === 15 && b.number === 95, daw + ': nút = CC94, knob = CC95 (kênh 15) mặc định', [a, b]); }
    { const { AR, sent } = makeAR('Studio Pro 8');
      let r = await AR.setDawControlState('AUDIO_CHILL', true, {}); ok(r.ok && JSON.stringify(sent[0]) === JSON.stringify([94, 0, 14]), 'nút SÁNG (ON) -> CC94 = 0 (kiểu bypass)', sent);
      r = await AR.setDawControlState('AUDIO_CHILL', false, {}); ok(JSON.stringify(sent[1]) === JSON.stringify([94, 127, 14]), 'nút TẮT (OFF) -> CC94 = 127', sent);
      sent.length = 0;
      for (const [v, cc] of [[0, 0], [50, 64], [100, 127]]) { await AR.executeAction(AR.ACTIONS.AUDIO_CHILL_KNOB, { reason: 'knob', value: v }); }
      ok(JSON.stringify(sent) === JSON.stringify([[95, 0, 14], [95, 64, 14], [95, 127, 14]]), 'knob 0/50/100 -> CC95 = 0/64/127', sent);
      ok(!sent.some((x) => x[0] === 94), 'xoay knob KHÔNG đụng nút ON/OFF');
      sent.length = 0; await AR.setDawControlState('AUDIO_CHILL', true, {}); ok(!sent.some((x) => x[0] === 95), 'bấm nút KHÔNG đụng knob'); }
    { const { AR, sent } = makeAR('Studio Pro 8', { 'Studio Pro 8': { AUDIO_CHILL_KNOB: { kind: 'cc', channel: 15, number: 70, value: 64 } } });
      await AR.executeAction(AR.ACTIONS.AUDIO_CHILL_KNOB, { reason: 'knob', value: 100 }); ok(JSON.stringify(sent[0]) === JSON.stringify([70, 127, 14]), 'mapping đã lưu thắng mặc định'); }
    console.log('== 2. Popup chuột phải MUSIC (mã renderer thật, DOM giả) ==');
    const ren = rd('ui/js/renderer.js');
    const i0 = ren.indexOf('function initAudioChillPopup()'), i1 = ren.indexOf('// ==========================================================\n// FX-AUTO-TOGGLE-01');
    ok(i0 > 0 && i1 > i0, 'tìm thấy initAudioChillPopup');
    const mk = (tag) => { const cls = new Set(); const style = { set cssText(v) { const m = /display:(\w+)/.exec(v); if (m) this.display = m[1]; } }; return { tag, id: '', children: [], style, dataset: {}, listeners: {}, _html: '', className: '',
        classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; } },
        addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }, contains(t) { return t === this || this.kids.includes(t); }, kids: [], querySelector(s) { return this.kids.find((k) => '#' + k.id === s); },
        getBoundingClientRect: () => ({ left: 300, top: 400, width: 100, bottom: 430 }), set innerHTML(h) { this._html = h; this.kids = []; for (const m of h.matchAll(/id="(\w+)"/g)) { const e = mk('x'); e.id = m[1]; this.kids.push(e); } }, get innerHTML() { return this._html; } }; };
    const els = { musicBtn: mk('button') }; els.musicBtn.id = 'musicBtn'; els.musicBtn.closest = () => null;
    const docL = {}; let body = [];
    const document = { getElementById: (id) => els[id] || body.map((c) => c.kids.find((k) => k.id === id)).find(Boolean) || null,
        createElement: (t) => mk(t), body: { appendChild: (c) => body.push(c) }, addEventListener: (n, f) => { (docL[n] = docL[n] || []).push(f); } };
    const calls = []; const knobs = [{ id: 'audioChillKnob', value: 50 }]; const updated = [];
    const sb = { document, window: { innerWidth: 1200, ActionRegistry: { setDawControlState: async (c, on) => { calls.push([c, on]); return { ok: true }; } } }, console, Promise, knobData: knobs, updateKnob: (k) => updated.push(k.id) };
    vm.createContext(sb); vm.runInContext(ren.slice(i0, i1) + '\nthis.__init = initAudioChillPopup;', sb);
    sb.__init();
    const card = body[0]; const chill = card && card.querySelector('#audioChillBtn');
    ok(card && chill && card.querySelector('#audioChillKnob') && card.querySelector('#audioChillValue'), 'thẻ có nút AUDIO CHILL (trên) + knob + số (dưới)');
    ok(card.innerHTML.indexOf('audioChillBtn') < card.innerHTML.indexOf('audioChillKnob'), 'nút nằm TRÊN knob');
    ok(card.style.display === 'none', 'mặc định ẩn'); ok(updated.includes('audioChillKnob'), 'vẽ knob theo giá trị đã khôi phục');
    let prevented = false; const ctx = (els.musicBtn.listeners.contextmenu || [])[0];
    ctx({ preventDefault: () => { prevented = true; } }); ok(prevented && card.style.display === 'flex', 'chuột phải MUSIC -> hiện thẻ');
    ctx({ preventDefault() {} }); ok(card.style.display === 'none', 'chuột phải lần nữa -> ẩn');
    ok(!(els.musicBtn.listeners.click || []).length, 'bấm trái MUSIC không bị đụng (popup không gắn click vào MUSIC)');
    const click = chill.listeners.click[0];
    click({ stopPropagation() {} }); ok(chill.classList.contains('active') && JSON.stringify(calls[0]) === JSON.stringify(['AUDIO_CHILL', true]), 'bấm nút: SÁNG + gửi ON');
    click({ stopPropagation() {} }); ok(!chill.classList.contains('active') && JSON.stringify(calls[1]) === JSON.stringify(['AUDIO_CHILL', false]), 'bấm lần nữa: TẮT + gửi OFF');
    ctx({ preventDefault() {} }); docL.mousedown[0]({ target: { closest: () => null } }); ok(card.style.display === 'none', 'bấm ra ngoài -> ẩn');
    ctx({ preventDefault() {} }); docL.keydown[0]({ key: 'Escape' }); ok(card.style.display === 'none', 'phím Esc -> ẩn');
    ok(/id: "audioChillKnob", valueId: "audioChillValue"/.test(ren) && /audioChillKnob: "AUDIO_CHILL_KNOB"/.test(ren), 'knobData + KNOB_ID_TO_ACTION có audioChillKnob');
    ok(/initAudioChillPopup === "function"\) initAudioChillPopup\(\)/.test(ren), 'được gọi sau loadData()');
    console.log('== 3. Setup / surface ==');
    const setup = rd('ui/js/setup.js');
    ok(/action: "AUDIO_CHILL_STATE"/.test(setup) && /action: "AUDIO_CHILL_KNOB"/.test(setup) && /"AUDIO_CHILL_STATE", "AUDIO_CHILL_KNOB"\]\)/.test(setup), 'Setup: 2 dòng mapping + nhóm bảo vệ trùng CC');
    const xml = rd('studio_one/AutoMenuAI.surface.xml');
    ok(/name="audioChillOnOff"[\s\S]{0,160}address="94"/.test(xml) && /name="audioChillKnob"[\s\S]{0,160}address="95"/.test(xml), 'surface: audioChillOnOff CC94, audioChillKnob CC95');
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
