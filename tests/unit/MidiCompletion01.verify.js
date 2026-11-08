// MIDI-COMPLETION-01 — Preset gộp Fender Studio Pro 8 (xem DawQuickFillAll01), lọc kênh MIDI Input, Program Change + Pitch Bend.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : x); } };

// easymidi / xmllint-wasm là module ngoài (không cài trong môi trường test) -> giả lập tối thiểu để nạp được runtime/driver.
const Module = require('module'); const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'easymidi') return { getInputs: () => [], getOutputs: () => [], Input: function () {}, Output: function () {} }; if (req === 'xmllint-wasm') return { validateXML: async () => ({ valid: true, errors: [] }) }; return origLoad.call(this, req, ...rest); };
// ---- 1) lọc kênh Input (main process)
const rt = require(path.join(root, 'core/command-engine-js/runtime.js'));
ok(rt.normalizeChannelFilter(0) === 0 && rt.normalizeChannelFilter('5') === 5 && rt.normalizeChannelFilter(16) === 16, 'normalizeChannelFilter: 0=Omni, 1–16 giữ nguyên');
ok([17, -1, 2.5, 'abc', null, undefined].every((v) => rt.normalizeChannelFilter(v) === 0), 'giá trị lạ -> Omni (không chặn nhầm)');
const rsrc = rd('core/command-engine-js/runtime.js');
ok(/inputChannelFilter && msg\.channel !== inputChannelFilter\) return/.test(rsrc) && /inputChannelFilter = normalizeChannelFilter\(settings\?\.midiInputChannel\)/.test(rsrc), 'dispatchFromMidi bỏ tín hiệu sai kênh; đọc lại từ settings mỗi lần nạp mapping');
const mi = rd('ui/js/setupMidiInput.js');
ok(/function initChannelSelect/.test(mi) && /Kênh \$\{i \+ 1\}/.test(mi) && /setSetting\("midiInputChannel"/.test(mi) && /notifySetupChanged/.test(mi), 'ô Channel (Input): 17 lựa chọn, lưu midiInputChannel, báo main');
ok(/event\.data\[0\] >= 0xf0\) return/.test(mi) && /chFilter && \(\(event\.data\[0\] & 0x0f\) \+ 1\) !== chFilter\) return/.test(mi), 'Learn bỏ qua Clock/System và tín hiệu sai kênh');

// ---- 2) Program Change + Pitch Bend: driver
const MidiDriver = require(path.join(root, 'core/command-engine-js/drivers/midiDriver.js'));
const sent = []; const d = Object.create(MidiDriver.prototype); d.output = { send: (t, p) => sent.push([t, p]) };
(async () => {
  let r = await d.execute({ program: 5, channel: 3 });
  ok(r.ok && sent[0][0] === 'program' && sent[0][1].number === 5 && sent[0][1].channel === 2, 'driver: Program Change số 5 kênh 3 -> easymidi program {number:5, channel:2}', JSON.stringify(sent[0]));
  r = await d.execute({ program: 200, channel: 1 });
  ok(sent[1][1].number === (200 & 0x7f), 'driver: Program được cắt về 0–127');
  r = await d.execute({ pitch: 8192, channel: 1 });
  ok(r.ok && sent[2][0] === 'pitch' && sent[2][1].value === 8192 && sent[2][1].channel === 0, 'driver: Pitch Bend 8192 (giữa) kênh 1');
  await d.execute({ pitch: 99999, channel: 1 }); await d.execute({ pitch: -5, channel: 1 });
  ok(sent[3][1].value === 16383 && sent[4][1].value === 0, 'driver: Pitch Bend kẹp trong 0–16383');
  r = await d.execute({ cc: 7, value: 100, channel: 1 });
  ok(r.ok && sent[5][0] === 'cc', 'driver: CC cũ vẫn chạy như trước');
  // ---- 3) runtime.sendMidi nhận kind mới (kiểm tham số, chưa start -> NOT_STARTED nhưng KHÔNG phải INVALID_PARAMS)
  for (const kind of ['program', 'pitch']) { const x = await rt.sendMidi({ kind, number: 1, value: 8192, channel: 0 }); ok(x.reason === 'NOT_STARTED', `sendMidi nhận kind "${kind}" (không bị INVALID_PARAMS)`, JSON.stringify(x)); }
  const bad = await rt.sendMidi({ kind: 'sysex', number: 1 }); ok(bad.reason === 'NOT_STARTED' || bad.reason === 'INVALID_PARAMS', 'kind lạ vẫn bị từ chối');
  ok(/kind === "pitch" \? \[0xe0 \| ch, val & 0x7f, \(val >> 7\) & 0x7f\]/.test(rsrc) && /kind === "program" \? \[0xc0 \| ch, num\]/.test(rsrc), 'bytes đúng chuẩn: Program C0 pp, Pitch E0 lsb msb');
  // ---- 4) renderer + UI
  const as = rd('ui/js/appSettings.js'), su = rd('ui/js/setup.js');
  ok(/async function sendMidiProgramChange/.test(as) && /async function sendMidiPitchBend/.test(as) && /__midiSendViaMain\("program"/.test(as) && /__midiSendViaMain\("pitch"/.test(as), 'appSettings: sendMidiProgramChange / sendMidiPitchBend qua cùng đường main');
  ok(/btnTestMidiPC/.test(su) && /btnTestMidiPB/.test(su) && /sendMidiPitchBend\(v \+ 8192, 0\)/.test(su), 'Setup: 2 hàng test Program/Pitch Bend (Pitch -8192…8191, giữa = 0)');
  ok(!/<script src="js\/setupDatabase/.test(rd('ui/setup.html')), 'không sửa HTML');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
