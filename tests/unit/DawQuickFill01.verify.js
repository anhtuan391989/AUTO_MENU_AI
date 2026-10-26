// DAW-SPECIFIC-MIDI-QUICK-FILL-01 — kiểm profile điền nhanh theo DAW (logic thật trích từ ui/js/setup.js).
const fs = require('fs'), path = require('path');
const setup = fs.readFileSync(path.join(__dirname, '../../ui/js/setup.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + JSON.stringify(d) : '')); } };

const a1 = setup.indexOf('const DAW_MIDI_ACTIONS = [');
const a2 = setup.indexOf('function isMouseControlEnabledLocal');
const b1 = setup.indexOf('function getDawMidiOutMapping');
const b2 = setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD');
if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0) { console.log('FAIL markers'); process.exit(1); }
const code = setup.slice(a1, a2) + '\n' + setup.slice(b1, b2) +
  '\nreturn {DAW_MIDI_ACTIONS, DAW_MIDI_PROFILES, resolveDawProfile, dawProfileVersionStatus, validateDawProfileBundle, planDawProfileFill, applyDawProfileFill, getDawMidiOutMapping, setDawMidiOutMapping};';
function env(initial) {
  const st = JSON.parse(JSON.stringify(initial || {}));
  let sets = 0;
  const api = new Function('getSetting', 'setSetting', code)((k) => st[k], (k, v) => { sets++; st[k] = JSON.parse(JSON.stringify(v)); });
  const A = api.DAW_MIDI_ACTIONS.map((x) => x.action);
  // mô phỏng handler nút: đọc DAW hiện tại, resolve profile, lập kế hoạch, (confirm), ghi
  const click = (bundle, confirmFn = () => true) => {
    const daw = st.selectedDAW; if (!daw) return { blocked: 'no-daw' };
    const prof = api.resolveDawProfile(daw); if (!prof) return { blocked: 'no-profile' };
    const plan = api.planDawProfileFill(prof, bundle, api.getDawMidiOutMapping, A);
    if (plan.errors.length) return { blocked: 'errors', plan };
    if (plan.conflicts.length) return { blocked: 'conflict', plan };
    if (!confirmFn(plan)) return { blocked: 'cancel', plan };
    api.applyDawProfileFill(daw, plan, () => st.dawMidiOutMappings, (all) => { st.dawMidiOutMappings = JSON.parse(JSON.stringify(all)); sets++; });
    return { done: true, plan };
  };
  return { st, api, A, click, sets: () => sets };
}
const snap = (o) => JSON.stringify(o);
const LIVE_S1 = { MUSIC_ON: 102, MUSIC_OFF: 103, MIC1_ON: 104, MIC1_OFF: 105, MIC2_ON: 106, MIC2_OFF: 107, FX_ON: 108, FX_OFF: 109 };
const KNOB_S1 = { BEAT_INPUT_VOLUME: 20, MASTER_OUTPUT_VOLUME: 21, RETUNE_SPEED_MIC1: 22, RETUNE_SPEED_MIC2: 23 };

// 1 Studio One -> đúng LIVE & KNOB
{
  for (const d of ['Studio One 7', 'Studio One 6', 'Studio Pro 8']) {
    const e = env({ selectedDAW: d });
    e.click('live'); e.click('knob');
    const m = e.st.dawMidiOutMappings[d];
    const liveOk = Object.entries(LIVE_S1).every(([a, n]) => m[a] && m[a].kind === 'cc' && m[a].channel === 16 && m[a].number === n && m[a].value === 127 && m[a].source === 'USER_DEFINED');
    const knobOk = Object.entries(KNOB_S1).every(([a, n]) => m[a] && m[a].kind === 'cc' && m[a].channel === 15 && m[a].number === n);
    ok(liveOk && knobOk && Object.keys(m).length === 12, `[1] ${d}: LIVE 8 (CC102–109 ch16 v127) + KNOB 4 (CC20–23 ch15) đúng, tổng 12`, m);
  }
}
// 2 Cubase -> profile riêng, không phải Studio One
{
  const e = env({ selectedDAW: 'Cubase 13' });
  e.click('live'); e.click('knob');
  const m = e.st.dawMidiOutMappings['Cubase 13'];
  const prof = e.api.DAW_MIDI_PROFILES.cubase, s1 = e.api.DAW_MIDI_PROFILES['studio-one'];
  const nums = Object.values(m).map((x) => x.number);
  const reserved = [7, 10, 12, 13, 23, 24, 64];
  ok(Object.keys(m).length === 12 && e.api.resolveDawProfile('Cubase 13') === prof && prof !== s1, '[2] Cubase 13 dùng profile Cubase riêng (12 mapping)');
  ok(nums.every((n) => !reserved.includes(n)) && new Set(nums.map((n, i) => n + '|' + (i < 8 ? 16 : 15))).size === 12, '[2] CC Cubase không trùng CC đã biết (7/10/12/13/23/24/64) và không trùng nhau');
  ok(Object.keys(LIVE_S1).every((a) => m[a].number !== LIVE_S1[a]) && /Quy ước CC gợi ý của AUTO_MENU_AI/.test(prof.origin) && /KHÔNG phải mặc định của Cubase/.test(prof.origin), '[2] Cubase khác số Studio One và được ghi rõ là quy ước AUTO_MENU_AI, không phải mặc định Cubase');
  ok(e.api.dawProfileVersionStatus(prof, 'Cubase 13') !== 'UNVERIFIED' && e.api.dawProfileVersionStatus(prof, 'Cubase 12') === 'UNVERIFIED' && e.api.dawProfileVersionStatus(prof, 'Cubase 15') === 'UNVERIFIED', '[2] Cubase 13 có bằng chứng file; 12/14/15 gắn UNVERIFIED');
}
// 3 Studio One -> Cubase -> Studio One giữ nguyên
{
  const e = env({ selectedDAW: 'Studio One 7' });
  e.click('live'); e.click('knob');
  const s1 = snap(e.st.dawMidiOutMappings['Studio One 7']);
  e.st.selectedDAW = 'Cubase 13'; const before = snap(e.st.dawMidiOutMappings);
  ok(snap(e.st.dawMidiOutMappings) === before && e.st.dawMidiOutMappings['Cubase 13'] === undefined, '[3] đổi DAW không ghi gì (Cubase chưa có mapping)');
  e.click('live'); e.click('knob');
  const cub = snap(e.st.dawMidiOutMappings['Cubase 13']);
  ok(snap(e.st.dawMidiOutMappings['Studio One 7']) === s1, '[3] điền Cubase không đổi Studio One');
  e.st.selectedDAW = 'Studio One 7';
  ok(snap(e.st.dawMidiOutMappings['Studio One 7']) === s1 && snap(e.st.dawMidiOutMappings['Cubase 13']) === cub, '[3] quay lại Studio One: mapping hai DAW còn nguyên');
  // điền Studio One 6 không đụng Studio One 7 (khoá DAW riêng)
  e.st.selectedDAW = 'Studio One 6'; e.click('live');
  ok(snap(e.st.dawMidiOutMappings['Studio One 7']) === s1 && e.st.dawMidiOutMappings['Studio One 6'].MUSIC_ON.number === 102, '[3] mapping thủ công/điền của DAW này không ảnh hưởng DAW khác');
}
// 4 mapping thủ công không bị ghi đè âm thầm
{
  const e = env({ selectedDAW: 'Studio One 7', dawMidiOutMappings: { 'Studio One 7': { MUSIC_ON: { kind: 'cc', channel: 3, number: 55, value: 100, source: 'USER_DEFINED' }, FX_SEND_REVERB: { kind: 'cc', channel: 2, number: 90, value: 127, source: 'USER_DEFINED' } } } });
  let asked = null;
  const r = e.click('live', (plan) => { asked = plan; return false; });
  ok(r.blocked === 'cancel' && asked.overwrite.length === 1 && asked.overwrite[0] === 'MUSIC_ON' && e.st.dawMidiOutMappings['Studio One 7'].MUSIC_ON.number === 55, '[4] có mapping thủ công -> hỏi xác nhận (liệt kê MUSIC_ON); Huỷ -> không đổi gì');
  ok(e.sets() === 0, '[4] huỷ xác nhận -> không gọi lưu lần nào');
  e.click('live');
  const m = e.st.dawMidiOutMappings['Studio One 7'];
  ok(m.MUSIC_ON.number === 102 && m.FX_SEND_REVERB.number === 90 && m.FX_SEND_REVERB.channel === 2, '[4]/[11] xác nhận -> chỉ bộ LIVE bị đổi; FX_SEND_REVERB ngoài bộ giữ nguyên');
  ok(/Sẽ GHI ĐÈ \$\{plan\.overwrite\.length\} mapping đã lưu: \$\{plan\.overwrite\.join/.test(setup) && /if \(!confirm\(msg\)\) return;/.test(setup), '[4] static: confirm(msg) nêu số lượng + tên action ghi đè, chỉ ghi sau confirm');
}
// 5 xung đột Knob <-> LIVE
{
  // Knob đã lưu CC102 ch16 (trùng MUSIC_ON gợi ý)
  const e = env({ selectedDAW: 'Studio One 7', dawMidiOutMappings: { 'Studio One 7': { BEAT_INPUT_VOLUME: { kind: 'cc', channel: 16, number: 102, value: 100, source: 'USER_DEFINED' } } } });
  const r = e.click('live');
  ok(r.blocked === 'conflict' && r.plan.conflicts.some(([a, o]) => a === 'MUSIC_ON' && o === 'BEAT_INPUT_VOLUME') && !e.st.dawMidiOutMappings['Studio One 7'].MUSIC_ON, '[5] LIVE trùng CC của Knob -> chặn, không ghi gì');
  // LIVE đã lưu CC20 ch15 -> điền KNOB bị chặn
  const f = env({ selectedDAW: 'Studio One 7', dawMidiOutMappings: { 'Studio One 7': { MIC1_ON: { kind: 'cc', channel: 15, number: 20, value: 127, source: 'USER_DEFINED' } } } });
  const r2 = f.click('knob');
  ok(r2.blocked === 'conflict' && !f.st.dawMidiOutMappings['Studio One 7'].BEAT_INPUT_VOLUME, '[5] KNOB trùng CC của LIVE macro -> chặn');
  // CC giống nhưng khác kênh -> không xung đột
  const g = env({ selectedDAW: 'Studio One 7', dawMidiOutMappings: { 'Studio One 7': { BEAT_INPUT_VOLUME: { kind: 'cc', channel: 14, number: 102, value: 100 } } } });
  ok(g.click('live').done === true, '[5] cùng số CC nhưng khác kênh -> không xung đột');
}
// 6 profile thiếu/hỏng -> không ghi một phần
{
  const e = env({ selectedDAW: 'Studio One 7' });
  const good = e.api.DAW_MIDI_PROFILES['studio-one'].bundles.live;
  const bads = {
    outOfRange: { count: 8, mappings: { ...good.mappings, FX_OFF: { kind: 'cc', channel: 16, number: 300, value: 127 } } },
    badChannel: { count: 8, mappings: { ...good.mappings, FX_OFF: { kind: 'cc', channel: 17, number: 109, value: 127 } } },
    dupInside: { count: 8, mappings: { ...good.mappings, FX_OFF: { kind: 'cc', channel: 16, number: 102, value: 127 } } },
    unknownAction: { count: 8, mappings: { ...good.mappings, FAKE_ACTION: { kind: 'cc', channel: 16, number: 120, value: 127 } } },
    missingEntry: { count: 8, mappings: { ...good.mappings, FX_OFF: null } },
    countMismatch: { count: 7, mappings: good.mappings },
    empty: { count: 0, mappings: {} },
    nullBundle: null,
  };
  let allBlocked = true, detail = {};
  for (const [k, b] of Object.entries(bads)) {
    const plan = e.api.planDawProfileFill({ bundles: { live: b } }, 'live', e.api.getDawMidiOutMapping, e.A);
    const wrote = e.api.applyDawProfileFill('Studio One 7', plan, () => e.st.dawMidiOutMappings, (all) => { e.st.dawMidiOutMappings = all; });
    detail[k] = { errors: plan.errors.length, wrote };
    if (!plan.errors.length || wrote || e.st.dawMidiOutMappings) allBlocked = false;
  }
  ok(allBlocked, '[6] bộ CC lỗi (ngoài dải/kênh sai/trùng/action lạ/thiếu mục/sai số lượng/rỗng/null) -> báo lỗi, KHÔNG ghi gì', detail);
  const noBundle = e.api.planDawProfileFill(e.api.DAW_MIDI_PROFILES['studio-one'], 'nope', e.api.getDawMidiOutMapping, e.A);
  ok(!noBundle.ok && noBundle.errors.length === 1 && e.api.applyDawProfileFill('Studio One 7', noBundle, () => ({}), () => { throw new Error('write'); }) === false, '[6] bundle không tồn tại -> không ghi');
  // bộ CC hợp lệ ghi đúng 1 lần (all-or-nothing)
  const e2 = env({ selectedDAW: 'Studio One 7' });
  const plan = e2.api.planDawProfileFill(e2.api.DAW_MIDI_PROFILES['studio-one'], 'live', e2.api.getDawMidiOutMapping, e2.A);
  let calls = 0;
  e2.api.applyDawProfileFill('Studio One 7', plan, () => e2.st.dawMidiOutMappings, (all) => { calls++; e2.st.dawMidiOutMappings = all; });
  ok(calls === 1 && Object.keys(e2.st.dawMidiOutMappings['Studio One 7']).length === 8, '[6] ghi 8 mapping bằng MỘT lần lưu duy nhất');
}
// 7 chưa chọn DAW
{
  const e = env({});
  ok(e.click('live').blocked === 'no-daw' && e.click('knob').blocked === 'no-daw' && e.st.dawMidiOutMappings === undefined, '[7] chưa chọn DAW -> không điền được, không ghi gì');
  ok(/btnFillLiveCcOff" disabled/.test(setup) && /btnFillKnobCcOff" disabled/.test(setup) && /Cần chọn DAW trước khi điền bộ CC gợi ý/.test(setup), '[7] static: nút bị vô hiệu hoá + thông báo cần chọn DAW');
  ok(/const dawNow = getSetting\("selectedDAW"\);\s*if \(!dawNow\) \{ alert\("Cần chọn DAW/.test(setup), '[7] static: handler đọc DAW tại lúc bấm và chặn khi không có DAW');
}
// 8 DAW chưa có profile
{
  for (const d of ['Ableton Live 12', 'FL Studio 21', 'REAPER 7', 'Pro Tools']) {
    const e = env({ selectedDAW: d });
    ok(e.api.resolveDawProfile(d) === null && e.click('live').blocked === 'no-profile' && e.click('knob').blocked === 'no-profile' && e.st.dawMidiOutMappings === undefined, `[8] ${d}: không có profile, không dùng profile DAW khác, không ghi`);
  }
  ok(/Chưa có bộ CC gợi ý cho DAW này — hãy cấu hình mapping thủ công\./.test(setup) && /\$\{profile \? /.test(setup), '[8] static: thông báo đúng câu yêu cầu; nút điền chỉ render khi có profile');
}
// 9 Studio One giữ giá trị hiện tại; không sửa hằng cũ
{
  ok(/const DAW_STATE_SUGGESTED = Object\.freeze\(\{\s*MUSIC_ON: 102, MUSIC_OFF: 103, MIC1_ON: 104, MIC1_OFF: 105, MIC2_ON: 106, MIC2_OFF: 107, FX_ON: 108, FX_OFF: 109,/.test(setup) && /DAW_STATE_SUGGESTED_CHANNEL = 16/.test(setup) && /DAW_STATE_SUGGESTED_VALUE = 127/.test(setup), '[9] hằng gợi ý cũ (102–109, ch16, 127) giữ nguyên');
  const e = env({ selectedDAW: 'Studio One 7' });
  ok(Object.entries(e.api.DAW_MIDI_PROFILES['studio-one'].bundles.live.mappings).every(([a, m]) => LIVE_S1[a] === m.number && m.channel === 16 && m.value === 127), '[9] profile Studio One LIVE trùng đúng 102–109');
}
// 10 Knob độc lập + quy đổi 0–100→0–127 không đổi
{
  const e = env({ selectedDAW: 'Studio One 7' });
  e.click('knob');
  const m = e.st.dawMidiOutMappings['Studio One 7'];
  ok(Object.keys(m).sort().join() === Object.keys(KNOB_S1).sort().join() && !m.MUSIC_ON, '[10] điền KNOB chỉ ghi 4 Knob, không đụng LIVE');
  const reg = fs.readFileSync(path.join(__dirname, '../../ui/js/actionRegistry.js'), 'utf8');
  ok(/Math\.round\(\s*\(?\s*\w+\s*\*\s*127\s*\)?\s*\/\s*100\s*\)|Math\.round\(\w+ \* 127 \/ 100\)/.test(reg) || /127\s*\/\s*100/.test(reg), '[10] actionRegistry vẫn quy đổi 0–100→0–127 (file không bị sửa trong task này)');
  ok(!/btnFillKnobCc[^\n]*(sendMidi|midi-send|executeAction)/.test(setup) && !/function runQuickFill[\s\S]*?\n        }\n/.exec(setup)[0].match(/sendMidi|midi-send|executeAction|sendMidiCC/), '[10] static: nút điền không gửi MIDI');
}
// 11 action ngoài hai bộ không đổi
{
  const store = { MONITOR_FX: { kind: 'cc', channel: 1, number: 50, value: 127 }, FX_SEND_DELAY: { kind: 'note', channel: 1, number: 60, velocity: 100 }, PLAY: { kind: 'cc', channel: 1, number: 51, value: 127 } };
  const e = env({ selectedDAW: 'Cubase 13', dawMidiOutMappings: { 'Cubase 13': JSON.parse(JSON.stringify(store)) } });
  e.click('live'); e.click('knob');
  const m = e.st.dawMidiOutMappings['Cubase 13'];
  ok(Object.keys(store).every((k) => JSON.stringify(m[k]) === JSON.stringify(store[k])) && Object.keys(m).length === 15, '[11] MONITOR_FX/FX_SEND_*/PLAY (ngoài 2 bộ) giữ nguyên, thêm đúng 12 mapping');
  ok(!/FX_SEND_REVERB|FX_SEND_DELAY|MONITOR_FX|TRANSPORT/.test(setup.slice(setup.indexOf('const DAW_QF_S1_LIVE'), setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD'))), '[11] static: khối profile không nhắc tới action ngoài hai bộ');
}
// 12 an toàn khởi động/đổi DAW + phạm vi sửa
{
  const blk = setup.slice(setup.indexOf('const DAW_QF_S1_LIVE'), setup.indexOf('// S8 — 3 hàng PLAY/STOP/RECORD'));
  ok(!/applyDawProfileFill\(/.test(setup.replace(/function applyDawProfileFill[\s\S]*?\n}\n/, '').replace(/applyDawProfileFill\(dawNow,[^\n]*\n/, '')), '[12] applyDawProfileFill chỉ được gọi từ handler nút (không tự áp dụng lúc mở/đổi DAW)');
  ok(!/setSetting/.test(blk.replace(/function applyDawProfileFill[\s\S]*$/, '')), '[12] logic profile/plan không tự ghi setting');
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
