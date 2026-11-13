/**
 * KEY-TIMELINE-DBHIT-01 — bài đã có trong Database máy (kéo từ Key Server, có songId) vẫn phải nạp "kế hoạch lên tone" (MOD theo đoạn).
 * Lỗi gốc: chỉ nhánh "Database Miss" gọi ensureKeyTimeline => bài trúng Database chỉ có Key đoạn đầu, MOD trống.
 * Kiểm bằng đọc mã + chạy SongMatcher THẬT trên data/songs.json (không chạy Electron). Chạy: node tests/unit/KeyTimelineDbHit01.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m); } };
const main = fs.readFileSync(path.join(ROOT, "app/main.js"), "utf8");

console.log("== A. Mã nguồn app/main.js ==");
const a = main.indexOf("if (song && song.key) {");
const b = main.indexOf("} else {", a);
const matchBlock = a >= 0 && b > a ? main.slice(a, b) : "";
ok(matchBlock.length > 0, "tìm thấy nhánh Database Match");
ok(/if \(song\.songId\) ensureKeyTimeline\(song\.songId, resolved\.title, resolved\.artist \|\| ""\)/.test(matchBlock), "nhánh Database Match gọi ensureKeyTimeline khi bài có songId");
ok(/\.catch\(\(\) => \{\}\)/.test(matchBlock), "lỗi mạng không làm hỏng luồng Now Playing (có .catch)");
ok((main.match(/ensureKeyTimeline\(/g) || []).length === 4, "tổng 3 chỗ gọi (1 mới ở Database Match + 2 cũ ở Miss/Server Match) + 1 định nghĩa hàm");
ok(/if \(!songId \|\| timelineArmedKey === songKey\) return;/.test(main), "ensureKeyTimeline vẫn chống gọi server lặp lại cho cùng bài");

console.log("== B. Tái hiện lỗi bằng SongMatcher thật + data/songs.json ==");
const SM = require(path.join(ROOT, "core/reference/SongMatcher.js"));
const cases = [["(Karaoke) Chỉ Còn Những Mùa Nhớ - Ôn Vĩnh Quang (tone gốc)", 296], ["(Karaoke) Chỉ Còn Những Mùa Nhớ - Ôn Vĩnh Quang", 295]];
for (const [t, d] of cases) {
    const s = SM.findReference(t, "");
    if (!s) { console.log("  (bỏ qua: bài chưa có trong data/songs.json) " + t); continue; }
    ok(SM.sameRecording(s, d) && !!s.songId, `"${t.slice(0, 45)}…" trúng Database và có songId (${s.songId}) => nhánh Match phải nạp kế hoạch`);
}
console.log(`\n== TỔNG KẾT: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
