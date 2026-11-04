// TASK A95 — NORM/RAP/REMIX chọn-một thật + hiệu ứng: NORM bình thường; RAP chỉ tắt Verb dài; REMIX = NORM + 2 plugin Group Mic + Retune 10 (2 mic).
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('  OK  ', l); } else { fail++; console.error('  FAIL ', l, x !== undefined ? JSON.stringify(x) : ''); } };
// Mapping Knob / FX BUS do Setup điền nhanh (bộ KNOB: Retune 22/23; bộ FX BUS: Verb dài 30) — đúng thứ Khói đã lưu.
const SAVED = { 'Studio Pro 8': { RETUNE_SPEED_MIC1: { kind: 'cc', channel: 15, number: 22, value: 127 }, RETUNE_SPEED_MIC2: { kind: 'cc', channel: 15, number: 23, value: 127 }, FX_BUS_VERB_LONG_VOLUME: { kind: 'cc', channel: 15, number: 30, value: 127 } } };
function makeAR() {
    const sent = []; const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console: { log() {}, error: console.error, warn() {} }, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === 'selectedDAW' ? 'Studio Pro 8' : k === 'dawMidiOutMappings' ? SAVED : undefined), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { sent.push([n, v, ch]); return true; } };
    vm.createContext(sb); vm.runInContext(rd('ui/js/actionRegistry.js'), sb);
    return { AR: win.ActionRegistry, sent, win };
}
const knobs = () => { const k = { retune1: 20, retune2: 25, fxMasterKnob: 50 }; const set = []; return { k, set, ctx: { getKnob: (id) => k[id], setKnob: (id, v) => { k[id] = v; set.push([id, v]); } } }; };
(async () => {
    console.log('== A95: mặc định MIDI ==');
    { const { AR } = makeAR();
      ok(JSON.stringify(['PRESET_NORM', 'PRESET_RAP', 'PRESET_REMIX'].map((a) => { const m = AR.getMidiOutMapping(a); return [m.number, m.channel]; })) === '[[114,16],[116,16],[117,16]]', 'PRESET NORM/RAP/REMIX mặc định kênh 16 CC 114/116/117');
      ok(['REMIX_PLUGIN_1', 'REMIX_PLUGIN_2'].map((a) => AR.getMidiOutMapping(a).number).join() === '92,93', 'plugin REMIX: CC 92/93 (kênh 15)'); }
    console.log('== A95: NORM -> RAP ==');
    { const { AR, sent } = makeAR(); const K = knobs(); const r = await AR.applyPresetTransition('NORM', 'RAP', K.ctx);
      ok(JSON.stringify(sent[0]) === JSON.stringify([114, 0, 15]) && JSON.stringify(sent[1]) === JSON.stringify([116, 127, 15]), 'NORM TẮT (CC114=0) TRƯỚC, rồi RAP BẬT (CC116=127)', sent);
      ok(sent.some((x) => x[0] === 30 && x[1] === 0 && x[2] === 14), 'RAP tắt Verb dài: bus CC30 kênh 15 = 0', sent);
      ok(!sent.some((x) => [92, 93, 21, 22, 23, 24].includes(x[0]) && x[2] === 14 && false) && !sent.some((x) => x[0] === 92 || x[0] === 93), 'RAP KHÔNG đụng plugin REMIX', sent);
      ok(K.set.length === 0, 'RAP không đổi Retune', K.set); ok(r.ok, 'kết quả ok'); }
    console.log('== A95: RAP -> NORM trả Verb dài về mức knob FX ==');
    { const { AR, sent } = makeAR(); const K = knobs(); await AR.applyPresetTransition('NORM', 'RAP', K.ctx); sent.length = 0;
      await AR.applyPresetTransition('RAP', 'NORM', K.ctx);
      ok(JSON.stringify(sent[0]) === JSON.stringify([116, 0, 15]) && sent[sent.length - 1][0] === 114 && sent[sent.length - 1][1] === 127, 'RAP TẮT rồi NORM BẬT', sent);
      const v = sent.find((x) => x[0] === 30); ok(v && v[1] > 0 && v[2] === 14, 'Verb dài trả về mức knob (CC30 > 0)', sent); }
    console.log('== A95: NORM -> REMIX ==');
    { const { AR, sent } = makeAR(); const K = knobs(); await AR.applyPresetTransition('NORM', 'REMIX', K.ctx);
      ok(JSON.stringify(sent[0]) === JSON.stringify([114, 0, 15]) && JSON.stringify(sent[1]) === JSON.stringify([117, 127, 15]), 'NORM TẮT rồi REMIX BẬT', sent);
      ok(sent.some((x) => x[0] === 92 && x[1] === 0 && x[2] === 14) && sent.some((x) => x[0] === 93 && x[1] === 0 && x[2] === 14), '2 plugin Group Mic BẬT (CC92/93 = 0, kiểu bypass)', sent);
      ok(JSON.stringify(K.set) === JSON.stringify([['retune1', 10], ['retune2', 10]]), 'Retune Speed cả 2 mic về 10 (UI + MIDI)', K.set);
      const rt = AR.getMidiOutMapping('RETUNE_SPEED_MIC1'); ok(rt && sent.some((x) => x[0] === rt.number), 'đã gửi CC Retune mic 1', sent);
      ok(!sent.some((x) => x[0] === 30), 'REMIX không đụng Verb dài (giống NORM)', sent); }
    console.log('== A95: REMIX -> RAP (không chồng chéo, hoàn tác REMIX) ==');
    { const { AR, sent } = makeAR(); const K = knobs(); await AR.applyPresetTransition('NORM', 'REMIX', K.ctx); sent.length = 0; K.set.length = 0;
      await AR.applyPresetTransition('REMIX', 'RAP', K.ctx);
      const i117 = sent.findIndex((x) => x[0] === 117 && x[1] === 0), i116 = sent.findIndex((x) => x[0] === 116 && x[1] === 127);
      ok(i117 === 0 && i116 > i117, 'REMIX TẮT (CC117=0) trước khi RAP BẬT', sent);
      ok(sent.some((x) => x[0] === 92 && x[1] === 127) && sent.some((x) => x[0] === 93 && x[1] === 127), '2 plugin REMIX TẮT (127)', sent);
      ok(JSON.stringify(K.set) === JSON.stringify([['retune1', 20], ['retune2', 25]]), 'Retune trả về giá trị trước REMIX (20 / 25)', K.set);
      ok(sent.some((x) => x[0] === 30 && x[1] === 0), 'RAP tắt Verb dài', sent); }
    console.log('== A95: renderer ==');
    const ren = rd('ui/js/renderer.js');
    ok(/currentPresetName === "RAP" \? group\.filter\(\(n\) => n !== "FX_BUS_VERB_LONG_VOLUME"\)/.test(ren), 'RAP: knob FX không bật lại Verb dài');
    ok(/applyPresetTransition\(\["NORM", "RAP", "REMIX"\]\.includes\(prevName\)/.test(ren), 'bấm preset gọi applyPresetTransition(prev, next)');
    ok(/name="remixPlugin1"[\s\S]{0,140}address="92"/.test(rd('studio_one/AutoMenuAI.surface.xml')) && /name="remixPlugin2"[\s\S]{0,140}address="93"/.test(rd('studio_one/AutoMenuAI.surface.xml')), 'surface có remixPlugin1/2 (CC92/93)');
    console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
