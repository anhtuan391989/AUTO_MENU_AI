// VERTICAL-EXPAND-FIT-01 — kiểm tra tĩnh: phần MỞ RỘNG ở chế độ dọc không bị che khuất.
const fs = require("fs"), path = require("path");
const rd = (p) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf-8");
const css = rd("ui/css/style.css"), js = rd("ui/js/renderer.js"), main = rd("app/main.js"), html = rd("ui/index.html");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
ok(/body\.vertical-mode \.mixer-grid\{grid-template-rows:repeat\(3,122px\);\}/.test(js), "JS-CSS: chế độ dọc có đủ 3 hàng núm");
ok(/body\.vertical-mode \.app\{height:auto !important;/.test(js), "JS-CSS: .app chế độ dọc ôm sát nội dung");
ok(/max-height:100vh;overflow-y:auto;/.test(js), "JS-CSS: màn thấp hơn nội dung thì cuộn bên trong");
ok(/vertical \? appEl\.scrollHeight/.test(js), "renderer: chế độ dọc đo bằng scrollHeight");
ok(/scrollAppTo\(true\)/.test(js) && /scrollAppTo\(false\)/.test(js), "renderer: mở rộng cuộn đáy, thu gọn về đầu");
ok(/getDisplayMatching\(bounds\)\.workArea/.test(main) && !/Math\.min\(1000, Math\.round\(height\)\)/.test(main), "main: trần chiều cao theo vùng làm việc màn hình");
ok(/menuPosSuspendUntil = Date\.now\(\)/.test(main), "main: không lưu vị trí tạm khi tự đẩy cửa sổ lên");
ok(/body\.vertical-mode \.mixer-grid \{ grid-template-columns: repeat\(2, 1fr\); \}/.test(html), "HTML không bị sửa (dòng gốc còn nguyên)");
console.log(`VerticalExpandFit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
