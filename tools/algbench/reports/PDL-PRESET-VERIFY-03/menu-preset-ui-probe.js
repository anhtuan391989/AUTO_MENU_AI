// PDL-PRESET-VERIFY-03 — probe MỨC MÃ + MIDI GIẢ (KHÔNG phải DAW thật).
// Trích NGUYÊN VĂN 2 đoạn từ ui/js/renderer.js (bộ xử lý click nút preset; đoạn khôi phục preset khi mở app)
// và nạp NGUYÊN VĂN ui/js/actionRegistry.js, dùng DOM giả + MIDI giả.
// Mục đích: chứng minh bằng chạy thử (mock) 3 rủi ro: (R1) nút sáng dù NOT_CONFIGURED/NO_DEVICE,
// (R2) khôi phục preset khi mở app không gọi executeAction, (R3) phím tắt REMIX không làm gì.
// Chạy: node menu-preset-ui-probe.js <đường-dẫn-repo>
const fs = require("fs"), path = require("path"), vm = require("vm");
const repo = path.resolve(process.argv[2] || ".");
const rd = fs.readFileSync(path.join(repo, "ui/js/renderer.js"), "utf8");
const ar = fs.readFileSync(path.join(repo, "ui/js/actionRegistry.js"), "utf8");

function cut(startMarker, endMarker) {
  const s = rd.indexOf(startMarker); if (s < 0) throw new Error("Không thấy mốc: " + startMarker);
  const e = rd.indexOf(endMarker, s); if (e < 0) throw new Error("Không thấy mốc cuối: " + endMarker);
  return rd.slice(s, e);
}
const clickBlock = cut("const PRESET_NAME_TO_ACTION", 'document.getElementById("autoDetectBtn")?.classList.add("active")');
const restoreBlock = cut("    if (data.preset) {", "    // BUTTON-RESET: 4 nút");
const shortcutBlock = cut("function clickPresetByName", "document.addEventListener(\"keydown\"");

function makeDom(names, activeName) {
  const btns = names.map(n => {
    const b = { textContent: n, _cls: new Set(n === activeName ? ["active"] : []), _h: {},
      classList: { add: (c) => b._cls.add(c), remove: (c) => b._cls.delete(c), contains: (c) => b._cls.has(c) },
      addEventListener: (ev, fn) => { b._h[ev] = fn; },
      click: () => b._h.click && b._h.click({ target: b }) };
    return b;
  });
  return { btns, document: { querySelectorAll: (sel) => sel === ".preset-btn" ? btns : [], getElementById: () => null, querySelector: (sel) => sel === ".preset-btn.active" ? btns.find(b => b._cls.has("active")) : null } };
}
function mkSandbox(settings, opts, dom) {
  const sent = [], logs = [];
  const sb = {
    window: { electronAPI: { clickAtPoint: async () => ({}) } },
    document: dom.document,
    console: { log: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push("WARN " + a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")) },
    getSetting: (k) => settings[k], setSetting: (k, v) => { settings[k] = v; }, getCoordinate: () => "",
    sendMidiCC: async (n, v, ch) => { sent.push({ kind: "cc", n, v, ch0: ch }); return opts.portOk !== false; },
    sendMidiNotePulse: async (n, v, ch) => { sent.push({ kind: "note", n, v, ch0: ch }); return opts.portOk !== false; },
    saveData: () => { sb._saves++; }, _saves: 0,
  };
  vm.createContext(sb); vm.runInContext(ar, sb);
  // bọc executeAction để đếm lời gọi + ghi kết quả thật của registry
  const real = sb.window.ActionRegistry.executeAction; sb._calls = []; sb._results = [];
  sb.window.ActionRegistry.executeAction = async (...a) => { sb._calls.push(a[0]); const r = await real(...a); sb._results.push(r); return r; };
  return { sb, sent, logs };
}
const tick = () => new Promise(r => setTimeout(r, 20));

(async () => {
  const out = [];
  out.push("NHÃN: mock / đọc mã — KHÔNG phải kết quả DAW thật. Đoạn mã trích nguyên văn từ ui/js/renderer.js.\n");

  // R1: click LOFI
  const scenarios = [
    ["R1a. DAW=studio-one, CHƯA có mapping -> executeAction trả NOT_CONFIGURED", { selectedDAW: "studio-one", dawMidiOutMappings: {} }, {}],
    ["R1b. Có mapping CC GIẢ (số 81) nhưng cổng MIDI mở thất bại -> NO_DEVICE", { selectedDAW: "studio-one", dawMidiOutMappings: { "studio-one": { PRESET_LOFI: { kind: "cc", channel: 1, number: 81, value: 127 } } } }, { portOk: false }],
    ["R1c. Có mapping CC GIẢ (số 81) và cổng OK -> SUCCESS (đối chứng)", { selectedDAW: "studio-one", dawMidiOutMappings: { "studio-one": { PRESET_LOFI: { kind: "cc", channel: 1, number: 81, value: 127 } } } }, {}],
  ];
  for (const [label, settings, opts] of scenarios) {
    const dom = makeDom(["NORM", "LOFI", "RAP"], "NORM");
    const { sb, sent } = mkSandbox(settings, opts, dom);
    vm.runInContext(clickBlock, sb);
    dom.btns[1].click(); await tick();
    out.push(`== ${label}`);
    out.push(`   nút sáng sau click: ${dom.btns.filter(b => b._cls.has("active")).map(b => b.textContent).join(",")} | saveData gọi: ${sb._saves} lần`);
    out.push(`   executeAction nhận: ${JSON.stringify(sb._calls)} -> kết quả: ${JSON.stringify(sb._results)} | MIDI giả đã gửi: ${JSON.stringify(sent)}`);
  }

  // R2: restore
  out.push("\n== R2. Khôi phục preset khi mở app (đoạn restore trích nguyên văn), data.preset = 'RAP'");
  { const dom = makeDom(["NORM", "LOFI", "RAP"], "NORM");
    const { sb, sent } = mkSandbox({ selectedDAW: "studio-one", dawMidiOutMappings: { "studio-one": { PRESET_RAP: { kind: "cc", channel: 1, number: 80, value: 127 } } } }, {}, dom);
    sb.data = { preset: "RAP" };
    vm.runInContext(restoreBlock.replace(/^\s*if \(data\.preset\)/, "if (data.preset)"), sb);
    await tick();
    out.push(`   nút sáng sau restore: ${dom.btns.filter(b => b._cls.has("active")).map(b => b.textContent).join(",")} | executeAction gọi: ${sb._calls.length} lần | MIDI giả đã gửi: ${JSON.stringify(sent)}`); }

  // R3: shortcut remix + R4 REMIX action
  out.push("\n== R3. Phím tắt: SHORTCUT_ACTIONS.remix và nút REMIX");
  { const dom = makeDom(["NORM", "LOFI", "RAP"], "NORM");
    const { sb, logs } = mkSandbox({ selectedDAW: "studio-one" }, {}, dom);
    vm.runInContext(shortcutBlock + "\n__SA = SHORTCUT_ACTIONS;", sb);
    sb.__SA.remix();
    out.push(`   gọi SHORTCUT_ACTIONS.remix() -> log: ${JSON.stringify(logs)} | executeAction gọi: ${sb._calls.length} | nút sáng: ${dom.btns.filter(b => b._cls.has("active")).map(b => b.textContent).join(",")}`);
    out.push(`   ui/index.html có nút REMIX? ${/preset-btn">REMIX/.test(fs.readFileSync(path.join(repo, "ui/index.html"), "utf8")) ? "CÓ nút REMIX" : "KHÔNG có nút REMIX trong ui/index.html"}`);
    out.push(`   ACTIONS có PRESET_REMIX? ${"PRESET_REMIX" in sb.window.ActionRegistry.ACTIONS}`); }

  console.log(out.join("\n"));
})().catch(e => { console.error("PROBE LỖI:", e); process.exit(1); });
