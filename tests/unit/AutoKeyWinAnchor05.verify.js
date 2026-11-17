// TASK AUTOKEY-WINANCHOR-05 — toạ độ theo cửa sổ plugin Auto-Key. Chạy: node tests/unit/AutoKeyWinAnchor05.verify.js (MÔ PHỎNG, không bấm thật)
const fs = require("fs"), path = require("path");
const sc = require("../../app/silentClick.js");
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x)); } };
const dec = (args) => Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
// exec giả: nhận biết script nào được chạy rồi trả đúng kết quả
function fakeExec(world) {
  const log = []; const exec = (file, args, opt, cb) => {
    const s = dec(args);
    if (s.includes("FindByTitleSuffix('")) { const sfx = /FindByTitleSuffix\('([^']*)'\)/.exec(s)[1]; log.push({ k: "find", sfx }); const w = world.win;
      return cb(null, !w ? "NOT_FOUND" : w.min ? "MINIMIZED" : ("OK\t" + w.title + "\t" + w.left + "\t" + w.top), ""); }
    if (s.includes("]::RealClick(")) { const m = /RealClick\((-?\d+), (-?\d+), '([^']*)'\)/.exec(s); log.push({ k: "click", real: true, x: +m[1], y: +m[2], sfx: m[3] });
      return cb(null, world.covered ? "COVERED\t" + world.covered : "OK\tBeat · Inserts · 5 - Auto-Key", ""); }
    if (s.includes("GetAncestor")) { const m = /\$sp\.X = (-?\d+)\s+\$sp\.Y = (-?\d+)/.exec(s); log.push({ k: "describe", x: +m[1], y: +m[2] }); const w = world.under;
      return cb(null, !w ? "NO_WINDOW" : ("OK\t" + w.title + "\t" + w.left + "\t" + w.top), ""); }
    if (s.includes("PostMessage")) { const m = /\$sp\.X = (-?\d+)\s+\$sp\.Y = (-?\d+)/.exec(s); log.push({ k: "click", x: +m[1], y: +m[2] }); return cb(null, "OK class=JUCE hwnd=1 client=1,1 manHinh=2560x1440", ""); }
    cb(new Error("script lạ"), "", "");
  }; return { exec, log };
};
(async () => {
  const D = (w, extra) => ({ platform: "win32", exec: fakeExec(w).exec, ...(extra || {}) });
  // 1) Lấy toạ độ: điểm nằm trong cửa sổ "... - Auto-Key" -> gắn neo + toạ độ tương đối
  let w = { under: { title: "Beat · Inserts · 5 - Auto-Key", left: 1087, top: 316 } };
  let r = await sc.anchorPoint({ x: 1287, y: 516 }, D(w));
  ok(r.anchor === "Auto-Key" && r.rx === 200 && r.ry === 200 && r.x === 1287 && r.y === 516 && r.anchorTitle.endsWith("Auto-Key"), "gắn neo: anchor=Auto-Key, rx=200, ry=200, vẫn giữ x,y", r);
  // 2) Không gắn neo khi điểm nằm ngoài cửa sổ Auto-Key
  r = await sc.anchorPoint({ x: 5, y: 6 }, D({ under: { title: "Studio Pro - 22102026*", left: 0, top: 0 } })); ok(r.anchor === undefined && r.x === 5, "cửa sổ khác (Studio Pro) -> không neo, giữ toạ độ màn hình", r);
  r = await sc.anchorPoint({ x: 5, y: 6 }, D({ under: { title: "Mic · Inserts · 14 - Tune 1", left: 0, top: 0 } })); ok(r.anchor === undefined, "cửa sổ Auto-Tune (Tune 1) -> không neo");
  r = await sc.anchorPoint({ x: 5, y: 6 }, D({ under: null })); ok(r.anchor === undefined, "không có cửa sổ -> không neo, không lỗi");
  r = await sc.anchorPoint({ x: 5, y: 6 }, { platform: "linux" }); ok(r.anchor === undefined && r.x === 5, "không phải Windows -> giữ nguyên");

  // 3) Bấm: cửa sổ ở CHỖ CŨ -> đúng toạ độ cũ; cửa sổ ĐÃ DỜI -> toạ độ mới theo cửa sổ
  const pt = { x: 1287, y: 516, anchor: "Auto-Key", anchorTitle: "Beat · Inserts · 5 - Auto-Key", rx: 200, ry: 200 };
  let fx = fakeExec({ win: { title: "Beat · Inserts · 5 - Auto-Key", left: 1087, top: 316 } }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  let c = fx.log.find((l) => l.k === "click"); ok(r.ok && c.x === 1287 && c.y === 516, "cửa sổ chưa dời: bấm đúng (1287,516)", [r, fx.log]);
  fx = fakeExec({ win: { title: "Beat · Inserts · 7 - Auto-Key", left: 300, top: 50 } }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  c = fx.log.find((l) => l.k === "click"); ok(r.ok && c.x === 500 && c.y === 250, "cửa sổ đã dời sang (300,50) (và đổi số slot): bấm (500,250) theo cửa sổ", [r, fx.log]);
  ok(/theo cửa sổ/.test(r.detail), "detail ghi rõ 'theo cửa sổ' (nút Thử bấm ngầm hiển thị được)", r.detail);
  ok(fx.log[0].k === "find" && fx.log[0].sfx === "Auto-Key", "tìm cửa sổ theo đuôi tên 'Auto-Key'");
  fx = fakeExec({ win: null }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  ok(!r.ok && /Không thấy cửa sổ 'Auto-Key'/.test(r.detail) && !fx.log.some((l) => l.k === "click"), "chưa mở plugin: báo rõ, KHÔNG bấm bậy vào toạ độ cũ", r);
  fx = fakeExec({ win: { min: true } }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  ok(!r.ok && /thu nhỏ/.test(r.detail) && !fx.log.some((l) => l.k === "click"), "plugin đang thu nhỏ: báo rõ, không bấm");

  // 3b) Điểm có neo = bấm CHUỘT THẬT nhanh (plugin JUCE bỏ qua chuột gửi ngầm), có kiểm tra cửa sổ dưới điểm bấm
  fx = fakeExec({ win: { title: "Beat · Inserts · 5 - Auto-Key", left: 1087, top: 316 } }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  c = fx.log.find((l) => l.k === "click"); ok(c && c.real === true && c.sfx === "Auto-Key" && /chuột thật/.test(r.detail) && /trả về chỗ cũ/.test(r.detail), "điểm có neo: bấm chuột THẬT nhanh + báo 'con trỏ đã trả về chỗ cũ'", [r, fx.log]);
  fx = fakeExec({ win: { title: "Beat · Inserts · 5 - Auto-Key", left: 1087, top: 316 }, covered: "Zalo" }); r = await sc.silentClickPoint(pt, { platform: "win32", exec: fx.exec });
  ok(!r.ok && /bị cửa sổ khác che \('Zalo'\)/.test(r.detail), "bị cửa sổ khác che điểm bấm: báo rõ (không bấm nhầm vào Zalo)", r);
  r = await sc.realClickAt(1, 1, "x'); calc; ('", { platform: "win32", exec: fakeExec({}).exec }); ok(!r.ok, "realClickAt từ chối tên cửa sổ lạ");

  // 4) Toạ độ CŨ (không neo) chạy y như trước
  fx = fakeExec({}); r = await sc.silentClickPoint({ x: 800, y: 600 }, { platform: "win32", exec: fx.exec });
  ok(r.ok && fx.log.length === 1 && fx.log[0].k === "click" && fx.log[0].x === 800 && fx.log[0].y === 600, "toạ độ cũ không neo: bấm thẳng (800,600), không tìm cửa sổ", fx.log);
  r = await sc.silentClickPoint({}, { platform: "win32", exec: fakeExec({}).exec }); ok(!r.ok, "thiếu toạ độ -> lỗi như cũ");

  // 5) An toàn: tên neo lạ không được nhúng vào script
  fx = fakeExec({}); r = await sc.silentClickPoint({ x: 1, y: 1, anchor: "x'); Remove-Item *; ('", rx: 1, ry: 1 }, { platform: "win32", exec: fx.exec });
  ok(!r.ok && fx.log.length === 0, "tên neo có ký tự lạ bị từ chối, không chạy script", r);

  // 6) Script PowerShell: dấu tab truyền sang C# dạng \t (không phải tab thật) + không đụng chuột thật
  const f = sc.PS_FIND("Auto-Key"), d = sc.PS_DESCRIBE(1, 2);
  ok(f.includes('"OK\\t"') && !/\tOK/.test(f), "script C# dùng \\t chuẩn");
  ok(!/SetCursorPos|SendInput|mouse_event/.test(sc.PS_SCRIPT(1, 2)), "đường bấm ngầm cũ (toạ độ không neo) vẫn không đụng con trỏ");
  const rc = sc.PS_REALCLICK(5, 6, "Auto-Key");
  ok(/GetCursorPos\(out old\)/.test(rc) && /SetCursorPos\(old\.X, old\.Y\)/.test(rc), "bấm thật: nhớ vị trí con trỏ và TRẢ VỀ sau khi bấm");
  ok(/SetProcessDpiAwarenessContext\(new IntPtr\(-4\)\)/.test(f + d + rc), "script đọc/bấm dùng Per-Monitor DPI (khớp AutoHotkey, màn hình phụ)");
  ok(/WindowFromPoint\(p\)[\s\S]*EndsWith\(suffix/.test(rc), "bấm thật chỉ khi cửa sổ dưới điểm bấm đúng là cửa sổ Auto-Key");

  // 7) Nối dây trong main.js
  const main = fs.readFileSync(path.join(__dirname, "../../app/main.js"), "utf8");
  ok(/sc\.anchorPoint\(q\)/.test(main) && /name === "autokey1" \|\| name === "autokey2"/.test(main), "setup-capture: Auto-Key 1/2 được gắn neo sau khi lấy toạ độ");
  ok(/silentClickPoint\(point\)/.test(main), "click-at-point-silent dùng silentClickPoint");
  const aks = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
  ok(/click\(q\)/.test(aks) && !/AUTOKEY-WINANCHOR/.test(aks), "renderer truyền nguyên điểm đã lưu (có neo) cho IPC, không cần sửa");
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
