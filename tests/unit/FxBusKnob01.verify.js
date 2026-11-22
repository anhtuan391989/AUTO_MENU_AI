// FX-BUS-KNOB-01 + MASTER-CURVE-01 — Knob FX điều khiển volume 4 bus; MASTER dùng đường cong fader như Beat. Chỉ đọc mã nguồn, không gửi MIDI thật.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const reg = fs.readFileSync(path.join(root, 'ui/js/actionRegistry.js'), 'utf8');
const ren = fs.readFileSync(path.join(root, 'ui/js/renderer.js'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'ui/js/setup.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };

const a = reg.indexOf('const KNOB_CC_ANCHORS'), b = reg.indexOf('function getSelectedDaw');
const c = {}; new Function('c', 'getSelectedDaw', reg.slice(a, b) + ';c.f=knobToCc;c.base=FX_BUS_BASE_DB;')(c, () => 'Studio Pro 8');
const BUS = ['FX_BUS_DELAY_VOLUME', 'FX_BUS_VERB_SHORT_VOLUME', 'FX_BUS_VERB_LONG_VOLUME', 'FX_BUS_COM_VERB_VOLUME'];
const cc = (act, v, daw) => c.f(act, v, daw || 'Studio Pro 8');

// MASTER: cùng đường cong Beat
let same = true; for (let v = 0; v <= 100; v++) if (cc('MASTER_OUTPUT_VOLUME', v) !== cc('BEAT_INPUT_VOLUME', v)) same = false;
ok(same && cc('MASTER_OUTPUT_VOLUME', 90) === 97, 'MASTER 90 -> CC97 (≈0 dB) và trùng đường cong Beat ở mọi giá trị 0..100', cc('MASTER_OUTPUT_VOLUME', 90));
ok(cc('MASTER_OUTPUT_VOLUME', 90, 'Cubase 13') === Math.round(90 * 127 / 100), 'DAW khác (Cubase) giữ công thức cũ cho MASTER');

// 4 bus
ok(BUS.length === 4 && BUS.every((x) => c.base[x] !== undefined), '4 action bus đều có mức gốc');
for (const x of BUS) {
  const seq = []; for (let v = 0; v <= 100; v++) seq.push(cc(x, v));
  ok(seq.every((n, i) => i === 0 || n >= seq[i - 1]), `${x}: tăng knob -> CC không giảm`);
  ok(seq.every((n) => Number.isInteger(n) && n >= 0 && n <= 127), `${x}: CC luôn nguyên trong 0..127`);
  ok(seq[0] < seq[50] && seq[50] < seq[100], `${x}: 0 < 50 < 100 (0 = trừ, 100 = cộng)`, [seq[0], seq[50], seq[100]]);
}
ok(cc('FX_BUS_DELAY_VOLUME', 50, 'Cubase 13') === 64, 'DAW khác: công thức tuyến tính cũ (50 -> 64)');

// FX-BUS-RANGE-01 — knob 100 = +10 dB (CC127, tối đa fader) · knob 0 = −100 dB (CC0, tối thiểu) · knob 50 = giữ mức gốc từng bus
const dbAt = (ccv) => { const T = [[0, -100], [16, -60], [32, -40], [48, -24], [58, -15.3], [64, -11.3], [81, -5.1], [95, -0.5], [97, 0.2], [98, 0.5], [99, 0.8], [114, 5.7], [127, 10]]; for (let i = 0; i < T.length - 1; i++) if (ccv >= T[i][0] && ccv <= T[i + 1][0]) return T[i][1] + (T[i + 1][1] - T[i][1]) * (ccv - T[i][0]) / (T[i + 1][0] - T[i][0]); return 10; };
ok(/FX_BUS_MAX_DB = 10;/.test(reg) && /FX_BUS_MIN_DB = -100;/.test(reg) && /FX_BUS_TAPER = Object\.freeze\(\[\[0, -100\]/.test(reg), 'FX bus: hằng số +10 max / −100 min có trong actionRegistry');
for (const x of BUS) {
  ok(cc(x, 100) === 127, `${x}: knob 100 -> CC127 (+10 dB max)`, cc(x, 100));
  ok(cc(x, 0) === 0, `${x}: knob 0 -> CC0 (−100 dB min)`, cc(x, 0));
  ok(Math.abs(dbAt(cc(x, 50)) - c.base[x]) < 1.5, `${x}: knob 50 vẫn ≈ mức gốc ${c.base[x]} dB`, dbAt(cc(x, 50)));
}
ok(/\[58, -15\.3\]/.test(reg), 'taper có điểm đo thật CC58 = -15.3 dB (FX-BUS-TAPER-02)');
ok(cc('FX_BUS_VERB_LONG_VOLUME', 50) === 57 && Math.abs(dbAt(57) - (-16)) <= 0.3, 'Verb dài knob 50 -> CC57 ~ -16 dB (không còn -15.3)', [cc('FX_BUS_VERB_LONG_VOLUME', 50), dbAt(57)]);
ok(cc('FX_BUS_VERB_SHORT_VOLUME', 50) === 63 && Math.abs(dbAt(63) - (-12)) <= 0.3, 'Verb ngắn knob 50 -> CC63 ~ -12 dB', [cc('FX_BUS_VERB_SHORT_VOLUME', 50), dbAt(63)]);
ok(cc('FX_BUS_COM_VERB_VOLUME', 101) === 127 && cc('FX_BUS_COM_VERB_VOLUME', -5) === 0, 'FX bus: ngoài 0..100 bị kẹp, không vượt +10 / −100');

// Nối dây
ok(/fxMasterKnob", valueId: "fxMasterValue", value: 50, defaultValue: 50/.test(ren), 'renderer: knobData có fxMasterKnob mặc định 50');
const grp = /KNOB_ID_TO_ACTION_GROUP = \{([\s\S]*?)\};/.exec(ren);
ok(grp && BUS.every((x) => grp[1].includes('"' + x + '"')) && /fxMasterKnob/.test(grp[1]), 'renderer: fxMasterKnob -> đủ 4 action bus');
const pairs = /const KNOB_ID_TO_ACTION = \{([\s\S]*?)\};/.exec(ren)[1];
ok(!/fxMasterKnob/.test(pairs), 'KNOB_ID_TO_ACTION (1-1) không đổi');
ok(BUS.every((x) => new RegExp(`${x}: "${x}"`).test(reg)), 'actionRegistry: ACTIONS có đủ 4 action');
ok(/FX_BUS_BASE_DB\[action\] !== undefined\);/.test(reg), 'actionRegistry: 4 bus đi đường Knob->CC (isKnobCc)');
ok(BUS.every((x) => new RegExp(`action: "${x}"`).test(setup)), 'setup: 4 hàng mapping MIDI Output cho 4 bus');
const m = /fxbus: Object\.freeze\(\{ title: "FX BUS VOLUME", count: 4, mappings: dawQfMake\(15, 127, \{([^}]*)\}\)/.exec(setup);
const nums = m ? [...m[1].matchAll(/(\w+): (\d+)/g)].map((x) => [x[1], +x[2]]) : [];
ok(nums.length === 4 && new Set(nums.map((x) => x[1])).size === 4 && nums.every(([k, n]) => BUS.includes(k) && n >= 28 && n <= 31), 'bộ điền nhanh FX BUS: 4 CC khác nhau 28–31, kênh 15', nums);
const used = [...setup.matchAll(/dawQfMake\(15, 127, \{([^}]*)\}\)/g)].flatMap((x) => [...x[1].matchAll(/(\w+): (\d+)/g)].map((y) => y[1] + ':' + y[2]));
const studioNums = used.filter((s) => !/_(VOLUME)$/.test(s.split(':')[0]) || BUS.includes(s.split(':')[0])).map((s) => s.split(':')[1]);
// FX-BUS-CC-01 — thứ tự CC khớp Studio One thật của người dùng (ảnh External Devices): CC28 Com Verb · CC29 Verb dài · CC30 Verb ngắn · CC31 Delay
const want = { FX_BUS_COM_VERB_VOLUME: 28, FX_BUS_VERB_LONG_VOLUME: 29, FX_BUS_VERB_SHORT_VOLUME: 30, FX_BUS_DELAY_VOLUME: 31 };
ok(Object.entries(want).every(([k, n]) => nums.some(([kk, nn]) => kk === k && nn === n)), 'bộ điền nhanh FX BUS: Com Verb 28 · Verb dài 29 · Verb ngắn 30 · Delay 31 (khớp Studio One)', nums);
ok(!ren.slice(ren.indexOf('function loadData()')).slice(0, 4000).includes('dispatchKnobVolume(\'fxMasterKnob'), 'loadData không gửi MIDI cho knob FX');
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
