// TASK AUTO-KEY-DETAIL-03 — Dò tay: bấm Tự dò -> MIDI dò (LISTENING) -> chờ -> MIDI Send. Chạy: node tests/unit/AutoKeyDetail03.verify.js (MÔ PHỎNG)
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x)); } };
const dm = /const __AI_CORE_DEFAULT[\s\S]*?try \{ setInterval/.exec(src), am = /const __autoKeyRun[\s\S]*?\nfunction restartAiForNewSong/.exec(src);
ok(!!dm && !!am, "tìm thấy khối Auto-Key");
function make(o) {
  const midi = [], clicks = [], sleeps = [], ivs = []; const info = { textContent: "" };
  const ctx = { t: 100000, console: { log() {} }, keyInfoEl: info, Date: (function () { const F = function () { return new Date(); }; F.now = () => ctx.t; return F; })(),
    window: { electronAPI: { clickAtPointSilent: async (q) => { clicks.push(q); return { ok: true }; }, loadSettingsSync: () => ({ autoKeyMode: { enabled: true, waitSec: 10, via: o.via || "midi" } }) }, ActionRegistry: { executeAction: async (a) => { midi.push(a); return { ok: true }; } } },
    getSetting: () => null, getCoordinate: (k) => (o.via === "click" ? ({ autokey1: [{ x: 10, y: 20 }], autokey2: [{ x: 30, y: 40 }] })[k] || "" : ""), getActiveSourceName: () => o.src || "ai", KeyEngine: { setTuning() { return {}; } },
    setTimeout: (fn, ms) => { sleeps.push({ fn, ms }); }, setInterval: (fn) => { ivs.push(fn); return ivs.length; }, clearInterval: () => {} };
  vm.createContext(ctx);
  vm.runInContext(dm[0].replace(/try \{ setInterval$/, "") + "\n" + am[0].replace(/\nfunction restartAiForNewSong$/, "") + ";this.run=runAutoKeyDetect;this.st=__autoKeyRun;", ctx);
  const st = ctx.st;
  const settle = () => new Promise((r) => setImmediate(r));
  const release = async () => { await settle(); while (sleeps.length) { const s = sleeps.shift(); s.fn(); await settle(); } };
  return { ctx, st: ctx.st, clicks, midi, info, sleeps, ivs, release, settle };
}
(async () => {
  // 1) Luồng chuẩn
  let m = make({}); let p = m.ctx.run("t", { force: true, user: true }); await m.settle();
  ok(/chuẩn bị/.test(m.info.textContent), "bắt đầu: hiện 'chuẩn bị dò...'", m.info.textContent);
  m.sleeps.shift().fn(); await m.settle();
  ok(JSON.stringify(m.midi) === '["AUTOKEY_DETECT"]', "MIDI 1: AUTOKEY_DETECT (điều khiển phần chọn Key của Auto-Key)", m.midi);
  ok(/Auto-Key: đang nghe\.\.\. còn 10 giây/.test(m.info.textContent), "hiện 'đang nghe... còn 10 giây'", m.info.textContent);
  m.ctx.t += 4000; m.ivs[0](); ok(/còn 6 giây/.test(m.info.textContent), "đếm ngược tới còn 6 giây", m.info.textContent);
  ok(m.sleeps[0] && m.sleeps[0].ms === 10000, "chờ đúng thời gian đã cài (10s)", m.sleeps.map((s) => s.ms));
  m.sleeps.shift().fn(); const r = await p;
  ok(r.sent && JSON.stringify(m.midi) === '["AUTOKEY_DETECT","AUTOKEY_SEND"]', "hết giờ: MIDI 2 AUTOKEY_SEND tự gửi Key sang Auto-Tune", [r, m.midi]);
  ok(/đã gửi sang Auto-Tune \(MIDI\)/.test(m.info.textContent), "hiện 'đã gửi sang Auto-Tune (MIDI)'", m.info.textContent);
  ok(m.st.busy === false, "xong: không còn busy");

  // 2) Bấm lại trong lúc nghe -> lượt cũ KHÔNG Send, lượt mới chạy đủ
  m = make({}); let a = m.ctx.run("t", { force: true, user: true }); await m.settle(); m.sleeps.shift().fn(); await m.settle(); // A đã gửi DETECT, đang nghe
  let b = m.ctx.run("t", { force: true, user: true }); await m.settle();
  const old = m.sleeps.shift(); old.fn(); const ra = await a; // đồng hồ chờ của A hết
  ok(ra.why === "superseded" && !m.midi.includes("AUTOKEY_SEND"), "bấm lại khi đang nghe: lượt cũ bị huỷ, KHÔNG Send", [ra, m.midi]);
  ok(m.st.busy === true, "lượt mới vẫn đang chạy (busy giữ nguyên)");
  await m.release(); const rb = await b;
  ok(rb.sent && m.midi.filter((x) => x === "AUTOKEY_SEND").length === 1 && m.midi.filter((x) => x === "AUTOKEY_DETECT").length === 2, "lượt mới: dò lại từ đầu + Send đúng 1 lần", m.midi);

  // 3) force bỏ qua cooldown; gọi thường vẫn bị cooldown/busy
  m = make({}); let q = m.ctx.run("t", { force: true, user: true }); await m.release(); await q;
  let r2 = await m.ctx.run("t"); ok(r2.why === "cooldown", "gọi thường trong 8s -> cooldown (như cũ)");
  q = m.ctx.run("t", { force: true, user: false }); await m.release(); r2 = await q; ok(r2.sent === true, "đổi bài (force) bỏ qua cooldown -> bài mới vẫn được dò");

  // 4) Bài có Key Database
  m = make({ src: "songDb" }); r2 = await m.ctx.run("t", { force: true, user: false }); ok(r2.why === "song-db" && m.midi.length === 0, "đổi bài tự động + bài có Database -> KHÔNG chạy Auto-Key");
  m = make({ src: "songDb" }); q = m.ctx.run("t", { force: true, user: true }); await m.release(); r2 = await q; ok(r2.sent === true && m.midi.length === 2, "NGƯỜI DÙNG bấm Tự dò trên bài có Database -> vẫn chạy Auto-Key");
  m = make({ src: "manual" }); r2 = await m.ctx.run("t", { force: true, user: true }); ok(r2.why === "manual" && m.midi.length === 0, "đang Key tay -> không chạy, kể cả người dùng bấm");

  // 4b) Mặc định bấm ngầm (Auto-Key 1/2 không có MIDI Learn): luồng dò -> nghe -> Send giống hệt, nhưng bằng toạ độ
  m = make({ via: "click" }); p = m.ctx.run("t", { force: true, user: true }); await m.settle(); m.sleeps.shift().fn(); await m.settle();
  m.sleeps.shift().fn(); await m.settle(); // nghỉ 300ms sau cú bấm ngầm
  ok(m.clicks.length === 1 && m.midi.length === 0, "bấm ngầm: dò Key = bấm toạ độ Auto-Key 1, không gửi MIDI", [m.clicks, m.midi]);
  ok(/đang nghe\.\.\. còn 10 giây/.test(m.info.textContent), "bấm ngầm: vẫn hiện đang nghe + đếm ngược");
  await m.release(); r2 = await p;
  ok(r2.sent && m.clicks.length === 2 && m.midi.length === 0 && /bấm ngầm/.test(m.info.textContent), "bấm ngầm: hết giờ tự bấm Send (Auto-Key 2) rồi báo 'đã gửi sang Auto-Tune (bấm ngầm)'", [m.clicks, m.info.textContent]);

  // 5) Nối dây
  ok(/runAutoKeyDetect\("AUTO DETECT", \{ force: true, user: !__autoDetectInternal \}\)/.test(src), "nút Tự dò: người dùng bấm = user:true; đổi bài (internal) = user:false");
  ok(/keyInfoEl && !__autoKeyRun\.busy\) keyInfoEl\.textContent = `Auto Detect/.test(src), "kết quả AI không đè dòng trạng thái khi Auto-Key đang chạy");
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
