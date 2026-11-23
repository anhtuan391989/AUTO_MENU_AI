// BE-MULTI-01 + FX-BUS-CC-02 — (1) nút BÈ gửi Harmony Player cho Auto-Tune 1..4 như nút TUNE gửi bypass cho 4 Auto-Tune;
// (2) 4 CC âm lượng bus FX có MẶC ĐỊNH trong code (máy mới cài không cần điền nhanh): CC28 Com Verb · CC29 Verb dài · CC30 Verb ngắn · CC31 Delay.
// Chạy: node tests/unit/BeMultiAndFxBusDefaultC01.verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const reg = fs.readFileSync(path.join(ROOT, 'ui/js/actionRegistry.js'), 'utf8');
const setup = fs.readFileSync(path.join(ROOT, 'ui/js/setup.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, extra) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } }

// ---- Nạp actionRegistry.js thật với settings giả + bộ gửi MIDI giả (ghi lại mọi CC gửi đi)
function boot(daw, saved) {
  const sent = [];
  const store = { selectedDAW: daw, dawMidiOutMappings: saved || {} };
  const sb = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Number, String, Set, Map, Error,
    getSetting: (k, f = '') => (store[k] != null && store[k] !== '' ? store[k] : f),
    setSetting: (k, v) => { store[k] = v; return true; },
    document: { querySelectorAll: () => [], getElementById: () => null },
    localStorage: { getItem: () => null, setItem() {} },
  };
  sb.window = sb;
  sb.sendMidiCC = async (n, v, ch0) => { sent.push({ number: n, value: v, channel: ch0 + 1 }); return true; }; // cùng chữ ký sendMidiCC(number, value, channel0) mà executeAction dùng
  vm.createContext(sb);
  vm.runInContext(reg + '\n;this.__AR = (typeof ActionRegistry !== "undefined") ? ActionRegistry : window.ActionRegistry;', sb, { filename: 'actionRegistry.js' });
  return { sb, sent, store, AR: sb.__AR || sb.window.ActionRegistry };
}

console.log('--- A. CC mặc định (không có mapping đã lưu)');
{
  const { sb } = boot('Studio Pro 8', {});
  const gm = (sb.getMidiOutMapping || (() => null));
  ok(typeof gm === 'function', 'getMidiOutMapping có trong actionRegistry');
  const want = { FX_BUS_COM_VERB_VOLUME: 28, FX_BUS_VERB_LONG_VOLUME: 29, FX_BUS_VERB_SHORT_VOLUME: 30, FX_BUS_DELAY_VOLUME: 31, BE_STATE: 104, BE_STATE_2: 105, BE_STATE_3: 106, BE_STATE_4: 107 };
  for (const [a, n] of Object.entries(want)) {
    const m = gm(a);
    ok(m && m.kind === 'cc' && m.channel === 15 && m.number === n && m.source === 'DEFAULT_PRESET', `${a} -> kênh 15 CC ${n} (mặc định)`, m);
  }
}
console.log('--- B. Mapping đã lưu luôn thắng mặc định (không ghi đè cài đặt người dùng)');
{
  const saved = { 'Studio Pro 8': { FX_BUS_VERB_LONG_VOLUME: { kind: 'cc', channel: 15, number: 77, value: 127, source: 'USER_DEFINED' } } };
  const { sb } = boot('Studio Pro 8', saved);
  ok(sb.getMidiOutMapping('FX_BUS_VERB_LONG_VOLUME').number === 77, 'mapping đã lưu (CC77) thắng mặc định (CC29)');
  ok(sb.getMidiOutMapping('FX_BUS_VERB_SHORT_VOLUME').number === 30, 'bus khác chưa lưu vẫn dùng mặc định CC30');
}
console.log('--- C. Cubase không bị đổi');
{
  const { sb } = boot('Cubase 13', {});
  ok(sb.getMidiOutMapping('FX_BUS_DELAY_VOLUME').number === 1 && sb.getMidiOutMapping('FX_BUS_DELAY_VOLUME').channel === 1, 'Cubase: FX bus vẫn theo bảng C63 (kênh 1, CC1)');
  { const m = sb.getMidiOutMapping('BE_STATE_2'); ok(m && m.channel === 2, 'Cubase (C65): BÈ phụ có CC kênh 2'); };
  ok(sb.getMidiOutMapping('BE_STATE').number === 14, 'Cubase: BÈ chính vẫn CC14');
}
console.log('--- D. Bấm BÈ gửi đủ 4 Auto-Tune');
(async () => {
  for (const [label, on, val] of [['BẬT', true, 0], ['TẮT', false, 127]]) {
    const { AR, sent } = boot('Studio Pro 8', {});
    const r = await AR.setDawControlState('BE', on, { reason: 'menu-button' });
    const nums = sent.map((m) => m.number);
    const vals = sent.map((m) => m.value);
    ok(r && r.ok, `BÈ ${label}: kết quả chính OK`, r && r.text);
    ok(JSON.stringify(nums) === JSON.stringify([104, 105, 106, 107]), `BÈ ${label}: gửi CC 104,105,106,107 theo thứ tự`, nums);
    ok(vals.length === 4 && vals.every((v) => v === val), `BÈ ${label}: cả 4 cùng giá trị ${val}`, vals);
    ok(r && r.beExtra && r.beExtra.BE_STATE_2 === 'OK' && r.beExtra.BE_STATE_3 === 'OK' && r.beExtra.BE_STATE_4 === 'OK', `BÈ ${label}: beExtra báo OK cho Auto-Tune 2/3/4`, r && r.beExtra);
  }
  // CC phụ chưa cấu hình (Cubase) không làm hỏng CC chính
  {
    const { AR, sent } = boot('Cubase 13', {});
    const r = await AR.setDawControlState('BE', true, { reason: 'menu-button' });
    ok(r && r.ok && sent.length === 4, 'Cubase (C65): CC chính + 3 CC phụ kênh 2 đều gửi', { ok: r && r.ok, n: sent.length, extra: r && r.beExtra });
    ok(r && r.beExtra && r.beExtra.BE_STATE_2 === 'OK', 'Cubase (C65): beExtra = OK');
  }
  // Núm FX bus gửi đúng CC mặc định, không cần mapping đã lưu
  {
    const { AR, sent } = boot('Studio Pro 8', {});
    const r = await AR.executeAction('FX_BUS_VERB_SHORT_VOLUME', { reason: 'knob', value: 50 });
    const n = sent.map((m) => m.number);
    ok(r && r.ok && n.length === 1 && n[0] === 30, 'Núm Verb ngắn gửi CC30 mặc định (không cần điền nhanh)', { ok: r && r.ok, n });
    ok(sent[0] && sent[0].channel === 15, 'Núm FX bus gửi trên kênh 15', sent[0]);
  }

  console.log('--- E. Setup (mirror, hàng hiển thị, bảo vệ trùng, điền nhanh)');
  for (const a of ['BE_STATE_2', 'BE_STATE_3', 'BE_STATE_4']) {
    ok(new RegExp(`action: "${a}"`).test(setup), `Setup có hàng MIDI cho ${a}`);
    ok(setup.includes(`"${a}"`) && /\["BE_STATE_2", "BE_STATE_3", "BE_STATE_4"\]\.forEach\(\(a\) => MIDI_CONFLICT_GUARD_SET\.add\(a\)\)/.test(setup), `${a} thuộc nhóm bảo vệ trùng CC`);
  }
  ok(/be: Object\.freeze\(\{ title: "BÈ ON\/OFF", count: 4, mappings: dawQfMake\(15, 127, \{ BE_STATE: 104, BE_STATE_2: 105, BE_STATE_3: 106, BE_STATE_4: 107 \}\) \}\)/.test(setup), 'Điền nhanh Studio One: BÈ gồm 4 CC (104..107)');
  ok(/FX_BUS_COM_VERB_VOLUME: 28, FX_BUS_VERB_LONG_VOLUME: 29, FX_BUS_VERB_SHORT_VOLUME: 30, FX_BUS_DELAY_VOLUME: 31/.test(setup), 'Setup: mirror mặc định FX bus 28/29/30/31');
  // 8 action mới không trùng CC với bất kỳ CC kênh 15 nào đã dùng
  const used = [20, 21, 22, 23, 24, 25, 26, 27, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 44, 45, 46, 47, 48, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 102, 103];
  ok([105, 106, 107].every((n) => !used.includes(n)) && [28, 29, 30, 31].every((n) => !used.includes(n)), 'CC mới (105-107, 28-31) không trùng CC kênh 15 đã dùng');
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('LỖI TEST: ' + (e && e.stack || e)); process.exit(1); });
