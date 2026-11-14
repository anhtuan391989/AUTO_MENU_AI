// QUICKFILL-ALL-01 — MỘT nút "Fender Studio Pro 8 MIDI" gộp TOÀN BỘ 9 bộ: LIVE + KNOB + CHỌN TRACK + TUNE BYPASS + LOFI + MIC VOLUME + PRESET + FX BUS + KEY/SCALE (logic thật từ ui/js/setup.js, mô phỏng phần mềm).
const fs = require('fs'), path = require('path');
const setup = fs.readFileSync(path.join(__dirname, '../../ui/js/setup.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  OK  ', n); } else { fail++; console.log('  FAIL', n, d ? JSON.stringify(d) : ''); } };
const a1 = setup.indexOf('const DAW_MIDI_ACTIONS = ['), a2 = setup.indexOf('function isMouseControlEnabledLocal');
const b1 = setup.indexOf('function getDawMidiOutMapping'), b2 = setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD');
const code = setup.slice(a1, a2) + '\n' + setup.slice(b1, b2) + '\nreturn {DAW_MIDI_ACTIONS, DAW_MIDI_PROFILES, DAW_QF_ALL, resolveDawProfile, dawProfileAllInOne, planDawProfileFill, applyDawProfileFill, getDawMidiOutMapping};';
function env(initial) {
  const st = JSON.parse(JSON.stringify(initial || {}));
  const api = new Function('getSetting', 'setSetting', code)((k) => st[k], (k, v) => { st[k] = JSON.parse(JSON.stringify(v)); });
  const A = api.DAW_MIDI_ACTIONS.map((x) => x.action);
  const click = () => { // giống runQuickFill(DAW_QF_ALL)
    const base = api.resolveDawProfile(st.selectedDAW); if (!base) return { blocked: 'no-profile' };
    const plan = api.planDawProfileFill(api.dawProfileAllInOne(base), api.DAW_QF_ALL, api.getDawMidiOutMapping, A);
    if (plan.errors.length) return { blocked: 'errors', plan }; if (plan.conflicts.length) return { blocked: 'conflict', plan };
    api.applyDawProfileFill(st.selectedDAW, plan, () => st.dawMidiOutMappings, (all) => { st.dawMidiOutMappings = JSON.parse(JSON.stringify(all)); });
    return { done: true, plan };
  };
  return { st, api, A, click };
}
console.log('== 1. Một lần bấm lưu đủ cả 9 bộ ==');
{
  const e = env({ selectedDAW: 'Studio Pro 8' }); const r = e.click(); const m = e.st.dawMidiOutMappings['Studio Pro 8'] || {};
  const base = e.api.resolveDawProfile('Studio Pro 8');
  const expect = Object.values(base.bundles).reduce((n, b) => n + Object.keys(b.mappings).length, 0);
  ok(r.done && Object.keys(m).length === expect && expect === 8 + 4 + 3 + 4 + 1 + 1 + 2 + 6 + 4 + 12, 'lưu đủ ' + expect + ' mapping (8 LIVE + 4 KNOB + 3 CHỌN TRACK + 4 TUNE + 1 LOFI + 1 BÈ + 2 MIC VOLUME + 6 PRESET + 4 FX BUS + 12 KEY/SCALE)', Object.keys(m).length);
  ok(m.MUSIC_ON && m.BEAT_INPUT_VOLUME && m.MUSIC_SELECT && m.MIC1_VOLUME && m.KEY_SCALE_MINOR && m.KEY_ROOT && m.TUNE_BYPASS && m.LOFI_STATE && m.BE_STATE && m.PRESET_NORM && m.FX_BUS_DELAY_VOLUME && m.KEY_ROOT_AT4, 'có mặt đủ đại diện từng bộ');
  ok(Object.values(m).every((x) => x.source === 'USER_DEFINED'), 'đều đánh dấu USER_DEFINED');
  ok(base.quickFillLabel === 'Fender Studio Pro 8 MIDI', 'tên nút = "Fender Studio Pro 8 MIDI"');
}
console.log('== 2. Studio One 7 cũng dùng cùng bộ; Cubase giữ các nút riêng (hàm gộp vẫn dùng được); DAW lạ bị chặn ==');
{
  ok(env({ selectedDAW: 'Studio One 7' }).click().done === true, 'Studio One 7 -> lưu được');
  const c = env({ selectedDAW: 'Cubase 13' }); const r = c.click();
  ok(r.done && Object.keys(c.st.dawMidiOutMappings['Cubase 13']).length === 16, 'Cubase (hàm gộp, C63) -> 16 mapping (2 MIC1 + 3 KNOB + 4 FX BUS + 3 KEY/SCALE + 1 TUNE + 1 LOFI + 1 REMIX + 1 BÈ)');
  ok(env({ selectedDAW: 'Logic' }).click().blocked === 'no-profile', 'DAW không có bộ -> chặn');
}
console.log('== 3. All-or-nothing, không đụng mapping khác, idempotent ==');
{
  const e = env({ selectedDAW: 'Studio Pro 8', dawMidiOutMappings: { 'Studio Pro 8': { DAW_PLAY: { kind: 'cc', channel: 1, number: 90, value: 127 } }, 'Cubase 13': { DAW_PLAY: { kind: 'cc', channel: 1, number: 5, value: 1 } } } });
  e.click();
  ok(e.st.dawMidiOutMappings['Studio Pro 8'].DAW_PLAY.number === 90 && e.st.dawMidiOutMappings['Cubase 13'].DAW_PLAY.number === 5, 'PLAY của DAW này và mapping DAW khác giữ nguyên');
  const before = JSON.stringify(e.st.dawMidiOutMappings); e.click();
  ok(JSON.stringify(e.st.dawMidiOutMappings) === before, 'bấm lần 2: kết quả y hệt');
  const f = env({ selectedDAW: 'Studio Pro 8', dawMidiOutMappings: { 'Studio Pro 8': { DAW_PLAY: { kind: 'cc', channel: 16, number: 102, value: 127 } } } });
  const r = f.click();
  ok(r.blocked === 'conflict' && !(f.st.dawMidiOutMappings['Studio Pro 8'].MUSIC_ON), 'PLAY đang dùng CC102 ch16 -> chặn toàn bộ, không lưu mapping nào');
}
console.log('== 4. Giao diện: chỉ còn 1 nút gộp (JS, không sửa HTML) ==');
{
  ok(/id="btnFillAllCc"/.test(setup) && /profile\.quickFillLabel \? `<br><button class="setup-btn" id="btnFillAllCc"/.test(setup) && /btnFillAllCcOff" disabled/.test(setup), 'Fender Studio Pro 8: chỉ hiện btnFillAllCc (9 nút cũ chỉ còn cho DAW khác như Cubase)');
  ok(/quickFillLabel: "Fender Studio Pro 8 MIDI"/.test(setup) && /id="btnClearAllCc"/.test(setup), 'có nhãn preset + nút Xoá toàn bộ preset');
  ok(/id="btnClearLiveCc"/.test(setup), 'nút "Xoá 8 mapping ON/OFF" giữ nguyên');
  ok(!/sendMidi|midi-send/.test(/function runQuickFill[\s\S]*?\n        }\n/.exec(setup)[0]), 'điền nhanh vẫn chỉ LƯU mapping, không gửi MIDI');
}
console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
