// PRESET-CC-01 + PRESET-LIT-01 — 4 nút NORM/LOFI/RAP/REMIX: luôn đúng 1 nút sáng; mỗi nút có 1 CC riêng (kênh 16, CC 114–117) + điều khiển trong surface Studio One.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const ren = rd('ui/js/renderer.js'), setup = rd('ui/js/setup.js'), xml = rd('studio_one/AutoMenuAI.surface.xml');

// ---- ensurePresetLit chạy thật trên DOM giả
const a = ren.indexOf('function ensurePresetLit()'); let depth = 0, i = ren.indexOf('{', a), b = i;
for (; b < ren.length; b++) { if (ren[b] === '{') depth++; else if (ren[b] === '}') { depth--; if (!depth) break; } }
const fnSrc = ren.slice(a, b + 1);
function mkBtn(t, active) { const cls = new Set(active ? ['active'] : []); return { textContent: t, dataset: {}, closest: () => null, classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) } }; }
function run(states, extra) {
  const btns = ['NORM', 'LOFI', 'RAP', 'REMIX'].map((n, k) => mkBtn(n, states[k]));
  const tune = mkBtn('TUNE ON', true); tune.dataset.tuneBtn = '1'; const all = [...btns, tune, ...(extra || [])];
  const document = { querySelectorAll: () => all };
  new Function('document', 'isIndependentPresetBtn', fnSrc + ';ensurePresetLit();')(document, (b) => !!(b.dataset && (b.dataset.tuneBtn === '1' || b.dataset.lofiBtn === '1'))); // A94: TUNE và LOFI độc lập
  return { lit: btns.map((x) => x.classList.contains('active')), tuneLit: tune.classList.contains('active') };
}
ok(run([false, false, false, false]).lit.join() === 'true,false,false,false', 'không nút nào sáng -> NORM sáng');
ok(run([false, false, true, false]).lit.join() === 'false,false,true,false', 'RAP đang sáng -> giữ nguyên RAP');
ok(run([true, false, true, false]).lit.filter(Boolean).length === 1 && run([true, false, true, false]).lit[0] === true, 'sáng 2 nút -> chỉ còn đúng 1 nút');
ok(run([false, false, false, true]).lit.join() === 'false,false,false,true', 'REMIX đang sáng -> giữ nguyên');
ok(run([false, false, false, false]).tuneLit === true, 'nút TUNE không bị đụng');
ok(/loadData\(\);\s*\n\s*ensurePresetLit\(\);/.test(ren.replace(/\r/g, '')), 'gọi ensurePresetLit() ngay sau loadData()');
const click = ren.slice(ren.indexOf('document.querySelectorAll(".preset-btn").forEach(btn => {'), ren.indexOf('document.getElementById("autoDetectBtn")'));
ok(/classList\.remove\("active"\)/.test(click) && /e\.target\.classList\.add\("active"\)/.test(click) && /PRESET_NAME_TO_ACTION\[/.test(click), 'bấm preset: tắt nhóm, sáng nút vừa chọn, gửi action PRESET_*');

// ---- bộ CC + surface
const m = /preset: Object\.freeze\(\{ title: "PRESET NORM\/LOFI\/RAP\/REMIX", count: 4, mappings: dawQfMake\(16, 127, \{([^}]*)\}\)/.exec(setup);
const nums = m ? [...m[1].matchAll(/(\w+): (\d+)/g)].map((x) => [x[1], +x[2]]) : [];
ok(nums.length === 4 && nums.map((x) => x[0]).join() === 'PRESET_NORM,PRESET_LOFI,PRESET_RAP,PRESET_REMIX' && nums.map((x) => x[1]).join() === '114,115,116,117', 'bộ điền nhanh PRESET: NORM/LOFI/RAP/REMIX = CC 114/115/116/117, kênh 16', nums);
ok(nums.every(([, n]) => n < 120), 'không dùng CC 120–127 (lệnh hệ thống MIDI)');
const used = [...setup.matchAll(/dawQfMake\((\d+), 127, \{([^}]*)\}\)/g)].flatMap((x) => [...x[2].matchAll(/(\w+): (\d+)/g)].map((y) => x[1] + ':' + y[2] + ':' + y[1]));
const studio = used.slice(0, 20).filter((u) => /PRESET_/.test(u) === false); const keys = studio.map((u) => u.split(':').slice(0, 2).join(':'));
ok(!nums.some(([, n]) => keys.slice(0, keys.length).includes('16:' + n) && false) && !studio.filter((u) => u.startsWith('16:')).some((u) => [114, 115, 116, 117].includes(+u.split(':')[1])), 'CC 114–117 kênh 16 chưa bị bộ khác trong Studio One dùng');
ok(/profile\.bundles\.preset \? `<button class="setup-btn" id="btnFillPresetCc">/.test(setup) && /runQuickFill\("preset"\)/.test(setup), 'Setup: có nút "Điền + lưu bộ PRESET gợi ý"');
ok(['presetNorm:114', 'presetLofi:115', 'presetRap:116', 'presetRemix:117'].every((s) => { const [n, c] = s.split(':'); return new RegExp(`name="${n}"[^>]*>\\s*<MidiMessage status="#BF" address="${c}"/>`).test(xml); }), 'surface Studio One: có 4 điều khiển Preset (#BF = kênh 16, CC 114–117)');
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
