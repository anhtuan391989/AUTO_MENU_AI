// YT-KEY-NODUP-01 — yt-key không cho thêm bài trùng (đã có trên server). Chạy: node tests/unit/YtKeyNoDup01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../yt-key/popup.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
new vm.Script(src); ok(true, "popup.js cú pháp hợp lệ");
ok(/\/song-full\?id=/.test(src), "hỏi server /song-full");
ok(/tongDoan > 0/.test(src), "trùng = bài đã có đoạn Key");
ok((src.match(/if \(await baiDaCoTrenServer\(id\)\)/g) || []).length === 2, "chặn cả Lưu Thông Tin và Thêm Đoạn");
ok(/ghiNhoBaiVuaThem\(id\)/.test(src), "bài vừa nhập xong vẫn nhập tiếp được đoạn sau");
// chạy thật hàm baiDaCoTrenServer với server giả
const store = {};
const ctx = { console, Date, encodeURIComponent, document: { addEventListener() {}, getElementById: () => null }, chrome: { storage: { session: { get: async () => store, set: async (o) => Object.assign(store, o) } } }, fetch: null };
vm.createContext(ctx); vm.runInContext(src.replace(/document\.getElementById\("btn[\s\S]*$/, "") , ctx);
(async () => {
  ctx.fetch = async () => ({ ok: true, json: async () => ({ tongDoan: 3 }) });
  ok(await vm.runInContext("baiDaCoTrenServer('AAAAAAAAAAA')", ctx) === true, "bài có 3 đoạn -> trùng (chặn)");
  ctx.fetch = async () => ({ ok: true, json: async () => ({ tongDoan: 0 }) });
  ok(await vm.runInContext("baiDaCoTrenServer('BBBBBBBBBBB')", ctx) === false, "bài mới -> cho thêm");
  await vm.runInContext("ghiNhoBaiVuaThem('AAAAAAAAAAA')", ctx);
  ctx.fetch = async () => ({ ok: true, json: async () => ({ tongDoan: 3 }) });
  ok(await vm.runInContext("baiDaCoTrenServer('AAAAAAAAAAA')", ctx) === false, "bài vừa tự thêm -> nhập tiếp được");
  ctx.fetch = async () => { throw new Error("net"); };
  ok(await vm.runInContext("baiDaCoTrenServer('CCCCCCCCCCC')", ctx) === false, "lỗi mạng -> không chặn nhầm");
  console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
