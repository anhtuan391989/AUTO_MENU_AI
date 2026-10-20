// PDL-PRESET-RESEARCH-02 — probe MỨC MÃ (không phải DAW).
// Nạp NGUYÊN VĂN ui/js/actionRegistry.js vào vm, thay MIDI thật bằng hàm ghi nhận (mock).
// Mục đích: xác minh Menu hiện làm gì khi nhận PRESET_NORM/LOFI/RAP (và REMIX nếu có).
// KHÔNG gửi MIDI thật, KHÔNG chứng minh DAW phản ứng. Chạy: node menu-dispatch-probe.js <đường-dẫn-repo>
const fs = require("fs"), path = require("path"), vm = require("vm");
const repo = path.resolve(process.argv[2] || ".");
const src = fs.readFileSync(path.join(repo, "ui/js/actionRegistry.js"), "utf8");

function run(label, settings, opts = {}) {
  const sent = [], logs = [];
  const sandbox = {
    window: { electronAPI: opts.noElectron ? undefined : { clickAtPoint: async () => ({ mock: true }) } },
    console: { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")) },
    getSetting: (k) => settings[k],
    setSetting: (k, v) => { settings[k] = v; },
    getCoordinate: () => "",
    sendMidiCC: async (n, v, ch) => { sent.push({ kind: "cc", number: n, value: v, channel0: ch }); return opts.portOk !== false; },
    sendMidiNotePulse: async (n, v, ch) => { sent.push({ kind: "note", number: n, velocity: v, channel0: ch }); return opts.portOk !== false; },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, sent, logs, label };
}

(async () => {
  const out = [];
  const A = (r) => r.sandbox.window.ActionRegistry;
  const names = ["PRESET_NORM", "PRESET_LOFI", "PRESET_RAP", "PRESET_REMIX"];

  out.push("== 1. Danh sách action PRESET trong ACTIONS (đọc từ mã thật)");
  { const r = run("x", {}); out.push(JSON.stringify(Object.keys(A(r).ACTIONS).filter(k => /PRESET/.test(k)))); }

  out.push("\n== 2. DAW=studio-one, CHƯA có mapping");
  for (const n of names) {
    const r = run("a", { selectedDAW: "studio-one", dawMidiOutMappings: {} });
    const res = A(r).ACTIONS[n] ? await A(r).executeAction(A(r).ACTIONS[n]) : "ACTIONS." + n + " = undefined (không tồn tại)";
    out.push(n + " -> " + JSON.stringify(res) + " | MIDI đã gửi (mock): " + JSON.stringify(r.sent) + " | status=" + (A(r).ACTIONS[n] ? JSON.stringify(A(r).getActionStatus(n)) : "n/a"));
  }

  out.push("\n== 3. CHƯA chọn DAW");
  { const r = run("b", {}); out.push("PRESET_RAP -> " + JSON.stringify(await A(r).executeAction("PRESET_RAP")) + " | status=" + JSON.stringify(A(r).getActionStatus("PRESET_RAP"))); }

  out.push("\n== 4. Có mapping người dùng CC ch1 số 80 value 127 cho PRESET_RAP (số GIẢ để thử đường dẫn, KHÔNG phải số của PDL)");
  { const r = run("c", { selectedDAW: "studio-one", dawMidiOutMappings: { "studio-one": { PRESET_RAP: { kind: "cc", channel: 1, number: 80, value: 127 } } } });
    out.push("PRESET_RAP -> " + JSON.stringify(await A(r).executeAction("PRESET_RAP")) + " | MIDI mock: " + JSON.stringify(r.sent) + " | status=" + JSON.stringify(A(r).getActionStatus("PRESET_RAP")));
    out.push("PRESET_NORM (chưa map) -> " + JSON.stringify(await A(r).executeAction("PRESET_NORM")) + " | MIDI mock thêm: " + JSON.stringify(r.sent.slice(1))); }

  out.push("\n== 5. Có mapping nhưng cổng MIDI không mở được (mock trả false)");
  { const r = run("d", { selectedDAW: "studio-one", dawMidiOutMappings: { "studio-one": { PRESET_LOFI: { kind: "cc", channel: 1, number: 81, value: 127 } } } }, { portOk: false });
    out.push("PRESET_LOFI -> " + JSON.stringify(await A(r).executeAction("PRESET_LOFI"))); }

  out.push("\n== 6. Có đường 'gửi phím tắt' trong executeAction không? (tìm trong mã nguồn)");
  out.push("chuỗi 'hotkey'/'sendKeys'/'send_keys' trong actionRegistry.js: " + JSON.stringify((src.match(/hotkey|sendKeys|send_keys/gi) || [])));
  out.push("ACTION_COORDINATE_KEY có PRESET_*? " + /ACTION_COORDINATE_KEY[\s\S]{0,400}PRESET_/.test(src));

  console.log(out.join("\n"));
})();
