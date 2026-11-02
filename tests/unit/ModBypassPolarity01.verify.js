/**
 * MOD-BYPASS-01 — MOD ON => SoundShifter Bypass TẮT; MOD OFF => Bypass BẬT.
 * Mã THẬT: ui/js/vocalCommandRouter.js (setSoundShifterPower) + nối dây trong ui/js/renderer.js; MIDI giả (ghi lại CC gửi đi).
 * KHÔNG phải SoundShifter/DAW thật. Chạy: node tests/unit/ModBypassPolarity01.verify.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.AUTOMENU_ROOT || path.join(__dirname, '..', '..');
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };

function build({ port = 'loopMIDI', ccFail = false, src } = {}) {
    const sent = [];
    const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, Number, JSON, Error, Array, Object, setTimeout: (f) => { f(); return 0; },
        getSetting: (k, f) => (k === 'midiOutputPort' ? port : f), setSetting() {}, getCoordinate: () => null,
        sendMidiCC: async (n, v) => { sent.push([n, v]); return !ccFail; }, sendMidiNotePulse: async () => true, electronAPI: undefined };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext((src || read('ui/js/vocalCommandRouter.js')) + '\nthis.setSoundShifterPower = setSoundShifterPower; this.TOGGLE_CC = SOUNDSHIFTER_TOGGLE_CC;', sb);
    return { sb, sent };
}

(async () => {
    console.log('== 1. Mặc định: nút Bypass ==');
    { const e = build();
      let r = await e.sb.setSoundShifterPower(true);
      ok(r.ok && e.sent[0][0] === e.sb.TOGGLE_CC && e.sent[0][1] === 0, 'MOD ON -> gửi CC Bypass = 0 (Bypass TẮT, plugin chạy)', e.sent);
      e.sent.length = 0; r = await e.sb.setSoundShifterPower(false);
      ok(r.ok && e.sent.length === 1 && e.sent[0][1] === 127, 'MOD OFF -> gửi CC Bypass = 127 (Bypass BẬT, plugin bị bỏ qua)', e.sent);
      ok(e.sb.TOGGLE_CC === 24, 'vẫn dùng đúng CC 24 như cũ (không đổi số CC)'); }

    console.log('== 2. Lỗi / chưa chọn cổng ==');
    { const e = build({ port: '' }); const r = await e.sb.setSoundShifterPower(true);
      ok(!r.ok && e.sent.length === 0, 'chưa chọn cổng MIDI -> báo lỗi, không gửi gì', r);
      const f = build({ ccFail: true }); const r2 = await f.sb.setSoundShifterPower(false);
      ok(!r2.ok && r2.driverUsed === 'midi', 'gửi CC lỗi -> ok=false (renderer sẽ hiện đỏ như cũ)', r2); }

    console.log('== 3. Công tắc đảo (nút kiểu Power/Enable) ==');
    { const src = read('ui/js/vocalCommandRouter.js').replace('const SOUNDSHIFTER_TOGGLE_IS_BYPASS = true;', 'const SOUNDSHIFTER_TOGGLE_IS_BYPASS = false;');
      ok(src !== read('ui/js/vocalCommandRouter.js'), 'có hằng SOUNDSHIFTER_TOGGLE_IS_BYPASS để đảo');
      const e = build({ src }); await e.sb.setSoundShifterPower(true); await e.sb.setSoundShifterPower(false);
      const tg = e.sent.filter((x) => x[0] === e.sb.TOGGLE_CC); ok(tg[0][1] === 127 && tg[1][1] === 0, 'đặt false -> quay về ON=127, OFF=0', e.sent); }

    console.log('== 4. Nối dây trong renderer.js (không đổi) ==');
    { const R = read('ui/js/renderer.js');
      ok(/setSoundShifterPower\(true\)/.test(R) && /setSoundShifterPower\(false\)/.test(R), 'MOD ON gọi setSoundShifterPower(true); MOD OFF gọi setSoundShifterPower(false)');
      const iBack = R.indexOf('sendToneStepToSoundShifter(shifterBack)'), iOff = R.indexOf('setSoundShifterPower(false)', iBack);
      ok(iBack > 0 && iOff > iBack, 'MOD OFF: trả SoundShifter về 0 TRƯỚC rồi mới bật Bypass (đúng thứ tự cũ)'); }

    console.log('== 5. Phạm vi ==');
    { const { execFileSync } = require('child_process');
      let ch = ''; try { ch = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString(); } catch (e) {}
      ok(!ch.split('\n').some((l) => /\.(html|css)$/i.test(l.trim())), 'không sửa file .html/.css nào'); }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI HARNESS', e); process.exit(2); });
