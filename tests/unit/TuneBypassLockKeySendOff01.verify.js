// TUNE-BYPASS-LOCK-01 + KEY-SEND-OFF-01 — chạy: node tests/unit/TuneBypassLockKeySendOff01.verify.js
// Chạy các hàm THẬT cắt từ ui/js/renderer.js trong môi trường giả. KHÔNG mở Electron, KHÔNG gửi MIDI thật.
// Tính năng 1: chuột phải TUNE -> ô tích "TUNE OFF (bypass hoàn toàn)": khoá, không bật được Tune.
// Tính năng 2: chuột phải AUTO DETECT -> ô tích "Tắt gửi sang Auto Tune": Menu chỉ dò, không gửi Key. Hai ô chạy RIÊNG LẺ.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const tick = () => new Promise((r) => setImmediate(r));

// ---------- A. Khối Tune-On-Lock (có thêm 2 hàm đọc cờ) ----------
const a = src.indexOf('let __tuneUserOverrideKey = null;'), b = src.indexOf('function applyActiveKeyToPlugin(sourceLabel) {');
ok(a > 0 && b > a, 'tìm thấy khối hàm Tune trong renderer.js');
const tuneBlock = src.slice(a, b);

function tuneEnv(o) {
  o = Object.assign({ lock: false, sendOff: false, onKeyLock: true, tuneOn: false }, o);
  const calls = [];
  const btn = { classList: { _on: o.tuneOn, contains(c) { return c === 'active' && this._on; } } };
  const ctx = {
    console: { log() {} }, Promise, String, Date,
    document: { querySelector: (s) => (/data-tune-btn/.test(s) ? btn : null) },
    window: { electronAPI: { loadSettingsSync: () => ({ tuneOnKeyLock: o.onKeyLock }) }, ActionRegistry: { setDawControlState: (n, v, x) => { calls.push([n, v, x && x.reason]); return Promise.resolve({ ok: true }); } } },
    getSetting: (k, d) => (k === 'tuneBypassLock' ? o.lock : k === 'keySendToTuneOff' ? o.sendOff : d),
    renderTuneBtn: (bt, on) => { bt.classList._on = on; }, reportDawStateResult: () => {},
    lastNowPlayingKey: 'A|x', keyEverDetected: true, getActiveSourceName: () => 'ai',
    keySource: { manual: { committedKey: null }, songDb: { value: null } }, __dbBypass: { pending: false }
  };
  vm.createContext(ctx);
  vm.runInContext(tuneBlock + '\nthis.setAuto=__setTuneAuto;this.maybeOn=__tuneMaybeOn;this.locked=__tuneBypassLocked;this.sendOff=__keySendOff;this.setInflight=(p)=>{__keySendInFlight=p;};', ctx);
  ctx.calls = calls; ctx.btn = btn; return ctx;
}

(async () => {
  // 1) Khoá TUNE: tự động KHÔNG bật được Tune
  let e = tuneEnv({ lock: true, tuneOn: false });
  e.setAuto(true, 'test'); await tick();
  ok(e.calls.length === 0 && e.btn.classList._on === false, 'KHOÁ bypass: __setTuneAuto(true) bị chặn — không gửi lệnh, nút vẫn TUNE OFF');
  e = tuneEnv({ lock: true, tuneOn: false }); e.setInflight(Promise.resolve(true)); e.maybeOn(); await tick();
  ok(e.calls.length === 0 && e.btn.classList._on === false, 'KHOÁ bypass: Tune-On-Lock (chốt Key xong tự bật Tune) cũng bị chặn');
  // 2) Mở khoá: như cũ
  e = tuneEnv({ lock: false, tuneOn: false }); e.setAuto(true, 'test'); await tick();
  ok(e.btn.classList._on === true && e.calls.length === 1 && e.calls[0][1] === false, 'BỎ TÍCH: __setTuneAuto(true) bật Tune như cũ (bypass TẮT)');
  e = tuneEnv({ lock: false, tuneOn: false }); e.setInflight(Promise.resolve(true)); e.maybeOn(); await tick();
  ok(e.btn.classList._on === true && e.calls.length === 1, 'BỎ TÍCH: Tune-On-Lock bật Tune như cũ');
  // 3) Khoá vẫn cho TẮT Tune (đúng hướng bypass)
  e = tuneEnv({ lock: true, tuneOn: true }); e.setAuto(false, 'test'); await tick();
  ok(e.btn.classList._on === false && e.calls.length === 1 && e.calls[0][1] === true, 'KHOÁ: vẫn cho TẮT Tune (gửi bypass BẬT)');
  // 4) Hai ô độc lập
  e = tuneEnv({ lock: true, sendOff: false }); ok(e.locked() === true && e.sendOff() === false, 'ĐỘC LẬP: chỉ khoá Tune -> "Tắt gửi Auto Tune" vẫn TẮT');
  e = tuneEnv({ lock: false, sendOff: true }); ok(e.locked() === false && e.sendOff() === true, 'ĐỘC LẬP: chỉ tắt gửi Key -> Tune KHÔNG bị khoá');
  e = tuneEnv({ lock: false, sendOff: true, tuneOn: false }); e.setAuto(true, 'manual-like'); await tick();
  ok(e.btn.classList._on === true, 'ĐỘC LẬP: tắt gửi Key không cản việc bật Tune bằng tay/tự động khác');
  e = tuneEnv({ lock: false, sendOff: true, tuneOn: false }); e.setInflight(Promise.resolve(true)); e.maybeOn(); await tick();
  ok(e.calls.length === 0, 'Tắt gửi Key: Tune-On-Lock không tự bật Tune (không có Key nào vào plugin)');

  // ---------- B. Lõi gửi Key xuống Auto-Tune ----------
  const c0 = src.indexOf('function __applyActiveKeyToPluginCore(sourceLabel) {'), c1 = src.indexOf('function cancelManualOverride() {');
  ok(c0 > 0 && c1 > c0, 'tìm thấy lõi __applyActiveKeyToPluginCore');
  const core = src.slice(c0, c1);
  function coreEnv(o) {
    o = Object.assign({ sendOff: false, source: 'ai', value: 'C Major' }, o);
    const sent = [];
    const ctx = {
      console: { log() {}, error() {} }, Promise, String,
      getActiveKeyValue: () => o.value, getActiveSourceName: () => o.source, normalizeKeyForSend: (v) => v,
      currentKeyEl: { textContent: '' }, keySelector: { value: '' }, keySource: { manual: { selectedKey: null } },
      __dbBypass: { pending: false }, displayKeyText: (v) => v, keyEverDetected: true,
      logKeySource() {}, refreshKeySourceDisplay() {}, isAiControlActive: () => false,
      __aiCoreCfg: () => ({ autoApply: true, autoKeyMode: false }), pluginSendShouldSkip: () => false,
      setStatus() {}, window: {}, midiDiag() {}, aiRecordPluginSend() {}, pluginSendOutcome: () => true,
      getSetting: (k, d) => (k === 'keySendToTuneOff' ? o.sendOff : d),
      sendKeyToAutotune: (k) => { sent.push(k); return Promise.resolve({ ok: true }); },
      lastPluginKey: null, originalKey: null
    };
    vm.createContext(ctx);
    vm.runInContext(tuneBlock.slice(tuneBlock.indexOf('function __keySendOff()'), tuneBlock.indexOf('function __setTuneAuto')) + '\n' + core + '\nthis.run=__applyActiveKeyToPluginCore;', ctx);
    ctx.sent = sent; return ctx;
  }
  let k = coreEnv({ sendOff: false }); k.run('t'); await tick();
  ok(k.sent.length === 1 && k.sent[0] === 'C Major', 'Tắt gửi = BỎ TÍCH: Key AI vẫn gửi xuống Auto-Tune như cũ');
  k = coreEnv({ sendOff: true }); k.run('t'); await tick();
  ok(k.sent.length === 0, 'Tắt gửi = TÍCH: Key AI KHÔNG gửi xuống Auto-Tune');
  ok(k.currentKeyEl.textContent === 'C Major', 'Tắt gửi = TÍCH: Menu VẪN hiển thị Key đã dò');
  ok(k.lastPluginKey === null, 'Tắt gửi = TÍCH: không ghi lastPluginKey (bỏ tick là gửi lại được)');
  k.getSetting = () => false; // bỏ tick giữa chừng
  k.run('t'); await tick();
  ok(k.sent.length === 1 && k.sent[0] === 'C Major', 'Bỏ tick xong: lần áp Key kế tiếp GỬI lại Key đó');
  k = coreEnv({ sendOff: true, source: 'songDb' }); k.run('t'); await tick();
  ok(k.sent.length === 0, 'Tắt gửi = TÍCH: Key từ Song Database / Server Timeline cũng KHÔNG gửi');
  k = coreEnv({ sendOff: true, source: 'manual' }); k.run('t'); await tick();
  ok(k.sent.length === 1, 'Key chọn TAY không bị ô này chặn (nút SEND/Manual giữ nguyên)');

  // ---------- C. Kiểm tĩnh cấu trúc ----------
  const clickIdx = src.indexOf("isTuneOffBtn(e.target) && __tuneBypassLocked()"), clickOrig = src.indexOf('const tuneOnNow = !e.target.classList.contains("active")');
  ok(clickIdx > 0 && clickIdx < clickOrig, 'bấm trái TUNE: chặn khi khoá nằm TRƯỚC logic bật/tắt cũ');
  ok(/setSetting\("tuneBypassLock", locked\)/.test(src) && /setSetting\("keySendToTuneOff", !!sendOffChk\.checked\)/.test(src), 'mỗi ô tích lưu setting RIÊNG (tuneBypassLock / keySendToTuneOff)');
  ok(/setSetting\("tuneBypassLock", false\)/.test(src) && /setSetting\("keySendToTuneOff", false\)/.test(src), 'mở app: cả 2 ô về BỎ TÍCH');
  ok(/initTuneBypassLockMenu\(\)/.test(src) && /typeof initTuneBypassLockMenu === "function"/.test(src), 'thẻ chuột phải TUNE được khởi tạo lúc mở app');
  ok(!/akChk\.addEventListener\("change", \(\) => choose\(true\)\);[\s\S]{0,80}sendOffChk/.test(src), 'ô "Tắt gửi sang Auto Tune" không nằm trong nhóm chọn-một của AI / Auto Key tạm');
  const bridgeCnt = (src.match(/__keySendOff\(\)/g) || []).length;
  ok(bridgeCnt >= 5, 'cổng __keySendOff() có ở lõi gửi Key, Tune-On-Lock, Bridge SET_KEY, SHIFT_KEY, ô tích (' + bridgeCnt + ' chỗ)');
  // Không đụng HTML/CSS
  const { execSync } = require('child_process');
  let htmlDiff = '';
  try { htmlDiff = execSync('git diff --name-only -- ui/index.html ui/setup.html ui/css', { cwd: ROOT }).toString().trim(); } catch (e2) { htmlDiff = ''; }
  ok(htmlDiff === '', 'KHÔNG sửa HTML/CSS');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
