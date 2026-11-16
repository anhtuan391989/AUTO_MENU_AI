// tools/patches/LIVE-SUBMIT-GATE-01_main.js — Sửa ĐÚNG 1 chỗ trong app/main.js (thêm `live: true` cho đường gửi Key của AI nghe trực tiếp).
// An toàn: chỉ sửa khi tìm thấy ĐÚNG 1 vị trí; chạy lại lần nữa cũng không sao (báo "đã áp dụng rồi"); giữ nguyên kiểu xuống dòng của file.
// Chạy (trong thư mục dự án):   node tools\patches\LIVE-SUBMIT-GATE-01_main.js
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'app', 'main.js');
if (!fs.existsSync(FILE)) { console.log('LỖI: không thấy ' + FILE); process.exit(2); }
const src = fs.readFileSync(FILE, 'utf8');
if (src.includes('LIVE-SUBMIT-GATE-01')) { console.log('Đã áp dụng rồi (main.js đã có LIVE-SUBMIT-GATE-01). Không làm gì thêm.'); process.exit(0); }
const re = /(key: d\.key,\s*confidence: d\.confidence,\s*durationSec: cur\.durationSec)(\s*\}\);)/g;
const found = src.match(re) || [];
if (found.length !== 1) { console.log('KHÔNG SỬA: cần đúng 1 vị trí, tìm thấy ' + found.length + '. main.js có thể đã khác bản mình đọc. Bạn gửi mình ảnh này.'); process.exit(1); }
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const out = src.replace(re, (m, a, b) => a + ',' + nl + '            live: true // LIVE-SUBMIT-GATE-01: Key AI nghe trực tiếp chỉ gửi khi đã nghe đủ lâu và Key ổn định (xem KeyServerSync)' + b);
fs.writeFileSync(FILE, out, 'utf8');
console.log('OK: đã sửa app/main.js (thêm live: true ở đường "server-submit-key"). Chạy tiếp các test để kiểm tra.');
