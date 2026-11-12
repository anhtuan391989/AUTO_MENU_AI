// TUNE-ON-LOCK-01 — chạy: node tests/unit/TuneOnLock01.verify.js
// Chạy các hàm THẬT cắt từ ui/js/renderer.js trong môi trường giả (nút Tune giả, DAW giả). KHÔNG mở Electron.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const src = rd('ui/js/renderer.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };
const tick = () => new Promise((r) => setImmediate(r));

const a = src.indexOf('let __tuneUserOverrideKey = null;'), b = src.indexOf('function applyActiveKeyToPlugin(sourceLabel) {');
ok(a > 0 && b > a, 'tìm thấy khối hàm Tune-On-Lock trong renderer.js');
const block = src.slice(a, b);

function env(o) {
  o = Object.assign({ enabled: true, tuneOn: true, source: 'ai', everDetected: false, manualKey: null, dbValue: null, dbPending: false, song: 'A|x' }, o);
  const calls = [], logs = [];
  const btn = { classList: { _on: o.tuneOn, contains(c) { return c === 'active' && this._on; }, toggle() {} } };
  const ctx = {
    console: { log: (m) => logs.push(String(m)) }, Promise, String, Date,
    document: { querySelector: (s) => (/data-tune-btn/.test(s) ? btn : null) },
    window: { electronAPI: { loadSettingsSync: () => ({ tuneOnKeyLock: o.enabled }) }, ActionRegistry: { setDawControlState: (n, v, x) => { calls.push([n, v, x && x.reason]); return Promise.resolve({ ok: true }); } } },
    renderTuneBtn: (bt, on) => { bt.classList._on = on; }, reportDawStateResult: () => {},
    lastNowPlayingKey: o.song, keyEverDetected: o.everDetected,
    getActiveSourceName: () => ctx.__src, __src: o.source,
    keySource: { manual: { committedKey: o.manualKey }, songDb: { value: o.dbValue } }, __dbBypass: { pending: o.dbPending }
  };
  vm.createContext(ctx); vm.runInContext(block + '\nthis.maybeOn=__tuneMaybeOn;this.onSong=__tuneOnSongChange;this.getOverride=()=>__tuneUserOverrideKey;this.setOverride=(v)=>{__tuneUserOverrideKey=v;};this.setInflight=(p)=>{__keySendInFlight=p;};', ctx);
  ctx.calls = calls; ctx.btn = btn; return ctx;
}

(async () => {
  // 1) Tính năng TẮT (mặc định): không làm gì
  let e = env({ enabled: false, tuneOn: true });
  e.onSong(null); e.keyEverDetected = true; e.maybeOn(); await tick();
  ok(e.calls.length === 0 && e.btn.classList._on === true, 'công tắc TẮT: đổi bài/chốt Key đều KHÔNG đụng nút Tune');

  // 2) Đổi bài, chưa có Key
  e = env({ tuneOn: true }); e.onSong({ title: 'B' });
  ok(e.btn.classList._on === false && e.calls.length === 1 && e.calls[0][0] === 'TUNE' && e.calls[0][1] === true, 'đổi bài chưa có Key, Tune đang BẬT -> chuyển TẮT (gửi bypass BẬT)');
  e = env({ tuneOn: false }); e.onSong({ title: 'B' });
  ok(e.btn.classList._on === false && e.calls.length === 0, 'đổi bài chưa có Key, Tune đang TẮT -> giữ nguyên, không gửi lệnh');

  // 3) Chốt Key -> BẬT Tune, sau khi lệnh gửi Key xong
  e = env({ tuneOn: false, source: 'ai', everDetected: true });
  let release; e.setInflight(new Promise((r) => { release = r; }));
  e.maybeOn(); await tick();
  ok(e.calls.length === 0, 'Key đang được gửi xuống plugin -> CHƯA bật Tune (đúng thứ tự: Key trước, Tune sau)');
  release(true); await tick();
  ok(e.btn.classList._on === true && e.calls.length === 1 && e.calls[0][1] === false, 'Key gửi xong -> BẬT Tune (bypass TẮT)');

  // 4) Gửi Key thất bại -> không bật Tune
  e = env({ tuneOn: false, source: 'ai', everDetected: true }); e.setInflight(Promise.resolve(false)); e.maybeOn(); await tick();
  ok(e.calls.length === 0 && e.btn.classList._on === false, 'gửi Key thất bại -> KHÔNG bật Tune');

  // 5) Chưa chốt -> không bật
  e = env({ tuneOn: false, source: 'ai', everDetected: false }); e.maybeOn(); await tick();
  ok(e.calls.length === 0, 'AI chưa có kết quả thật (ĐANG NGHE) -> không bật Tune');

  // 6) Key tay và Database
  e = env({ tuneOn: false, source: 'manual', manualKey: 'E Major' }); e.maybeOn(); await tick();
  ok(e.btn.classList._on === true, 'Key tay đã gửi -> bật Tune');
  e = env({ tuneOn: false, source: 'songDb', dbValue: 'A# Major' }); e.maybeOn(); await tick();
  ok(e.btn.classList._on === true, 'Key từ Database/Server -> bật Tune');
  e = env({ tuneOn: false, source: 'songDb', dbValue: 'A# Major', dbPending: true }); e.maybeOn(); await tick();
  ok(e.btn.classList._on === false, 'Database đang chờ nghe lại (pending) -> chưa bật');

  // 7) Đổi bài mà bài đã có Key ngay -> bật (không tắt rồi bật)
  e = env({ tuneOn: false, source: 'songDb', dbValue: 'F Major' }); e.onSong({ databaseMatch: { key: 'F Major' } }); await tick();
  ok(e.btn.classList._on === true && e.calls.length === 1 && e.calls[0][1] === false, 'đổi bài đã có Key ngay -> BẬT Tune');
  e = env({ tuneOn: true, source: 'songDb', dbValue: 'F Major' }); e.onSong({ databaseMatch: { key: 'F Major' } }); await tick();
  ok(e.calls.length === 0, 'đổi bài đã có Key, Tune đang BẬT sẵn -> không tắt rồi bật lại (không gửi lệnh thừa)');

  // 8) Người dùng tự bấm Tune -> giữ tới khi đổi bài
  e = env({ tuneOn: false, source: 'ai', everDetected: true, song: 'A|x' }); e.setOverride('A|x'); e.maybeOn(); await tick();
  ok(e.calls.length === 0 && e.btn.classList._on === false, 'người dùng đã tự bấm Tune -> chốt Key KHÔNG tự bật Tune');
  e.lastNowPlayingKey = 'B|y'; e.onSong({ title: 'B' });
  ok(e.getOverride() === null, 'đổi bài -> hết giữ lựa chọn của người dùng');

  // 9) Dây nối
  ok(/__tuneUserOverrideKey = String\(lastNowPlayingKey\);[^\n]*\n\s*const tuneOnNow/.test(src), 'bấm nút Tune: ghi nhận người dùng tự bấm');
  ok(/if \(__songChangedTune\) __tuneOnSongChange\(payload\);/.test(src) && /__songChangedTune = true;/.test(src), 'đổi bài: gọi __tuneOnSongChange SAU khi AI/Database đã reset');
  ok(/function applyActiveKeyToPlugin\(sourceLabel\) \{\s*\n\s*const __r = __applyActiveKeyToPluginCore\(sourceLabel\);\s*\n\s*__tuneMaybeOn\(\);/.test(src), 'applyActiveKeyToPlugin bọc lõi cũ rồi mới xét bật Tune');
  ok(/__keySendInFlight = sendKeyToAutotune\(sendValue\)\.then/.test(src) && /return result\.ok === true; \/\/ TUNE-ON-LOCK-01/.test(src), 'nhớ lệnh gửi Key (true/false) để bật Tune sau khi gửi xong');
  ok(/Auto Tune on Key Lock/.test(rd('ui/setup.html')) && /tuneOnKeyLock/.test(rd('ui/js/setupAiCore.js')) && /Tự bật Tune khi chốt Key/.test(rd('ui/js/i18n.js')), 'Setup: có ô "Tự bật Tune khi chốt Key" (HTML + nối setting + bản dịch)');
  ok(/getSetting\("tuneOnKeyLock", false\)[^\n]*=== true/.test(rd('ui/js/setupAiCore.js')) && /st\.tuneOnKeyLock === true/.test(src), 'mặc định TẮT (chỉ BẬT khi setting === true)');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
