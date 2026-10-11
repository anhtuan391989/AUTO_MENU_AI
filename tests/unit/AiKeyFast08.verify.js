/**
 * AiKeyFast08.verify.js — TASK AI-KEY-FAST-08 (chống gửi lại/log lặp khi MOUSE_DISABLED).
 * Chạy applyActiveKeyToPlugin()/pluginSend*() THẬT (trích từ renderer.js) + sendKeyToAutotune()/isMouseFallbackAllowed() THẬT
 * (vocalCommandRouter.js) với cài đặt/IPC giả lập. MÔ PHỎNG — KHÔNG phải bằng chứng Windows runtime.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.error('  FAIL ', m); } };
const R = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');
const V = fs.readFileSync(path.join(__dirname, '../../ui/js/vocalCommandRouter.js'), 'utf8');
function fnText(srcT, name, asyncFn) { const st = srcT.indexOf(`${asyncFn ? 'async ' : ''}function ${name}(`); if (st < 0) throw new Error(name); let i = srcT.indexOf('{', st), d = 0; for (; i < srcT.length; i++) { if (srcT[i] === '{') d++; else if (srcT[i] === '}' && --d === 0) break; } return srcT.slice(st, i + 1); }
const tick = () => new Promise((r) => setImmediate(r));

function rig({ withHelpers = true, clickResult } = {}) {
    const errs = [], clicks = [], settings = { mouseControlEnabled: true, midiOutputPort: '' };
    const sb = { console: { log() {}, error: (...a) => errs.push(a.join(' ')) }, Date, performance: { now: () => 1 }, JSON, Object, Promise };
    sb.window = sb; vm.createContext(sb);
    Object.assign(sb, { getSetting: (k, fb = '') => (settings[k] != null && settings[k] !== '' ? settings[k] : fb), getCoordinate: () => '100,200', setStatus() {}, refreshKeySourceDisplay() {}, logKeySource() {},
        getActiveKeyValue: () => sb.__v, getActiveSourceName: () => 'ai', isAiControlActive: () => false, keySelector: null, currentKeyEl: null, keyEverDetected: true,
        aiDiag() {}, sendMidiNotePulse: async () => false });
    sb.electronAPI = { clickAtPoint: async (pt) => { clicks.push(pt); return clickResult ? clickResult() : { ok: true, detail: 'ok' }; } };
    const send = [fnText(V, 'parseCapturedPoint'), fnText(V, 'isMouseFallbackAllowed'), fnText(V, 'sendKeyToAutotune', true)].join('\n');
    vm.runInContext(`const NOTE_MAP = { "C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11 };\n${send}\n`
        + `let originalKey = 'C Major', lastPluginKey = 'C Major', __aiCycleGen = 1;\nconst __aiPluginSend = { total: 0, ok: 0, fail: 0, byKey: {}, lastStatus: null, lastDetail: null };\n`
        + (withHelpers ? `const __pluginMouseBlock = { active: false, sig: null, keys: {}, logged: false, episodes: 0, suppressedSends: 0, suppressedLogs: 0, recoveries: 0 };\n${fnText(R, 'pluginMouseSig')}\n${fnText(R, 'pluginSendShouldSkip')}\n${fnText(R, 'pluginSendOutcome')}\n` : '')
        + `${fnText(R, 'aiRecordPluginSend')}\n${fnText(R, 'applyActiveKeyToPlugin')}\nthis.apply = (v) => { this.__v = v; applyActiveKeyToPlugin('AI Detect'); }; this.lpk = () => lastPluginKey; this.blk = () => JSON.parse(JSON.stringify(__aiPluginSend)); this.mb = () => ${withHelpers ? 'JSON.parse(JSON.stringify(__pluginMouseBlock))' : 'null'};`, sb);
    return { sb, errs, clicks, settings, apply: async (v) => { sb.apply(v); await tick(); await tick(); } };
}
const sendErr = (r) => r.errs.filter((e) => e.startsWith('sendKeyToAutotune lỗi')).length;

(async () => {
    console.log('\n== 1. MOUSE_DISABLED: cùng Key qua 6 chu kỳ => 1 log lỗi, 1 lần thử gửi ==');
    { const r = rig(); r.settings.mouseControlEnabled = false;
      for (let i = 0; i < 6; i++) await r.apply('F# Minor');
      ok(sendErr(r) === 1, `console.error đúng 1 lần (đếm=${sendErr(r)})`);
      ok(r.sb.blk().total === 1 && r.clicks.length === 0, `chỉ 1 lần gọi gửi (attempts=${r.sb.blk().total}); không click chuột`);
      ok(r.sb.mb().suppressedSends === 5 && r.sb.mb().episodes === 1, `5 lần bỏ qua gửi, 1 đợt lỗi (${JSON.stringify(r.sb.mb())})`);
      ok(r.sb.lpk() === 'C Major', 'lastPluginKey KHÔNG bị đánh dấu đã gửi (Key chưa thật sự tới plugin)'); }

    console.log('\n== 2. Mouse Control bật lại => cùng Key được gửi lại và thành công, không cần đổi Key ==');
    { const r = rig(); r.settings.mouseControlEnabled = false;
      for (let i = 0; i < 3; i++) await r.apply('F# Minor');
      r.settings.mouseControlEnabled = true; await r.apply('F# Minor');
      ok(r.clicks.length === 1 && r.sb.lpk() === 'F# Minor', 'bật lại => gửi lại cùng Key, thành công, lastPluginKey cập nhật');
      ok(r.sb.mb().recoveries === 1 && r.sb.mb().active === false, 'đợt lỗi kết thúc (recoveries=1)');
      await r.apply('F# Minor'); ok(r.clicks.length === 1, 'sau thành công: dedupe như cũ'); }

    console.log('\n== 3. Key đổi trong lúc tắt: không spam log; Key mới vẫn được ghi nhận ==');
    { const r = rig(); r.settings.mouseControlEnabled = false;
      for (const k of ['F# Minor', 'F# Minor', 'B Minor', 'B Minor', 'B Minor', 'F# Minor']) await r.apply(k);
      ok(sendErr(r) === 1, `chỉ 1 log lỗi cho cả đợt lỗi liên tục (đếm=${sendErr(r)})`);
      ok(r.sb.blk().byKey['B Minor'] && r.sb.blk().byKey['F# Minor'].attempts === 1 && r.sb.blk().byKey['B Minor'].attempts === 1, 'mỗi Key mới được thử đúng 1 lần (hành vi hiện tại), ghi nhận trong thống kê');
      ok(r.sb.mb().suppressedLogs === 1, 'log của Key mới bị nuốt vì cùng đợt lỗi (đã đếm)'); }

    console.log('\n== 4. Gửi thành công (Mouse bật): dedupe như trước ==');
    { const r = rig(); for (let i = 0; i < 5; i++) await r.apply('F# Minor');
      ok(r.clicks.length === 1 && sendErr(r) === 0 && r.sb.mb().episodes === 0, 'gửi 1 lần, không lỗi, không mở đợt lỗi'); }

    console.log('\n== 5. Lỗi KHÁC MOUSE_DISABLED: không bị nuốt, retry/log như cũ ==');
    { const r = rig({ clickResult: () => ({ ok: false, detail: 'click lỗi' }) });
      for (let i = 0; i < 4; i++) await r.apply('F# Minor');
      ok(sendErr(r) === 4 && r.sb.blk().total === 4, `4 lần lỗi => 4 log + 4 lần gửi như cũ (log=${sendErr(r)}, gửi=${r.sb.blk().total})`);
      ok(r.sb.mb().episodes === 0 && r.sb.mb().suppressedSends === 0, 'không mở đợt MOUSE_DISABLED'); }
    { const r = rig(); r.settings.mouseControlEnabled = false; r.sb.getCoordinate = () => ''; // không có toạ độ => lỗi "chưa cấu hình" (không status)
      for (let i = 0; i < 3; i++) await r.apply('F# Minor');
      ok(sendErr(r) === 3, 'lỗi "chưa cấu hình MIDI/toạ độ" (không phải MOUSE_DISABLED) vẫn log mỗi lần'); }
    { const r = rig({ clickResult: () => ({ ok: false, detail: 'x' }) }); r.settings.mouseControlEnabled = false;
      await r.apply('F# Minor'); r.settings.mouseControlEnabled = true; for (let i = 0; i < 2; i++) await r.apply('F# Minor');
      ok(sendErr(r) === 3, 'MOUSE_DISABLED rồi lỗi click thật: lỗi click không bị nuốt'); }

    console.log('\n== 6. Bật/tắt nhiều lần: mỗi đợt lỗi mới log 1 lần ==');
    { const r = rig();
      for (let cycle = 0; cycle < 3; cycle++) {
          const key = cycle % 2 ? 'B Minor' : 'F# Minor'; // luôn khác lastPluginKey của chu kỳ trước (không bị dedupe)
          r.settings.mouseControlEnabled = false; for (let i = 0; i < 4; i++) await r.apply(key);
          r.settings.mouseControlEnabled = true; await r.apply(key);
      }
      ok(r.sb.mb().episodes === 3 && r.clicks.length === 3, `3 đợt lỗi, 3 lần gửi thành công sau khi bật lại (episodes=${r.sb.mb().episodes}, clicks=${r.clicks.length})`);
      ok(sendErr(r) === r.sb.mb().episodes, `số log lỗi (${sendErr(r)}) = số đợt lỗi (${r.sb.mb().episodes}): đúng 1 log/đợt`); }

    console.log('\n== 7. Không có hook/callback trạng thái Mouse Control (không helper/getSetting): không crash, không retry nền ==');
    { const r = rig({ withHelpers: false }); r.settings.mouseControlEnabled = false;
      let threw = false; try { for (let i = 0; i < 3; i++) await r.apply('F# Minor'); } catch (e) { threw = true; }
      ok(!threw && sendErr(r) === 3, 'không helper => hành vi cũ (log mỗi lần), không crash'); }
    { const sb2 = { getSetting() { throw new Error('boom'); } }; vm.createContext(sb2); vm.runInContext(fnText(R, 'pluginMouseSig') + '\nthis.v = pluginMouseSig();', sb2); ok(sb2.v === 'err', 'getSetting ném lỗi: pluginMouseSig bắt lỗi, không crash'); }
    ok(!/setInterval|setTimeout/.test(fnText(R, 'pluginSendShouldSkip') + fnText(R, 'pluginSendOutcome') + fnText(R, 'pluginMouseSig')), 'helper không dùng timer => không có vòng retry nền');
    ok(!/\.addEventListener|onChange|MutationObserver/.test(fnText(R, 'pluginMouseSig')), 'không giả định có event Mouse Control: chỉ ĐỌC LẠI setting tại thời điểm gọi');

    console.log('\n== 8. Bất biến ==');
    const k = fs.readFileSync(path.join(__dirname, '../../ui/js/engines/keyEngine.js'), 'utf8');
    ok(/const frameHasContent = contentCount > 0 && Math\.sqrt\(contentRms \/ contentCount\) > 0\.0005;/.test(k) && /FAST_PATH_STREAK_REQUIRED\s*=\s*3/.test(k) && /FAST_PATH_MIN_ELAPSED_MS\s*=\s*1200/.test(k), 'công thức/ngưỡng Key nguyên văn');
    ok(/setTimeout\(\(\) => triggerAiKeyDetect\(\), 2000\)/.test(R), 'timer 2000ms nguyên vẹn');
    ok(/if \(value === lastPluginKey\) return;/.test(R), 'dedupe lastPluginKey nguyên vẹn');
    ok(/Mouse Control đang TẮT/.test(V) && /status: "MOUSE_DISABLED"/.test(V), 'sendKeyToAutotune/giao thức không đổi (test không sửa vocalCommandRouter.js)');
    console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`); process.exit(fail ? 1 : 0);
})();
