"use strict";
/**
 * SETUP-LOCK-01 + MENU-NOMAX-01 + MENU-FRAMELESS-01 + MARQUEE-VISIBLE-01 — kiểm tra tự động.
 * KHÔNG chứa mật khẩu thật (repo công khai): phần "đúng mật khẩu" đã được chạy tay trong báo cáo; ở đây chỉ kiểm
 * logic từ chối / chống dò / cấu trúc nối dây.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  OK   " + msg); } else { fail++; console.log("  FAIL " + msg); } }

// ---- SetupLock (logic) ----
const { createSetupLock, MAX_FAILS, LOCK_MS } = require(path.join(root, "core/shared/SetupLock.js"));
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync("mat-khau-chi-de-test", salt, 64).toString("hex");
let clock = 1000;
const lock = createSetupLock({ saltHex: salt, hashHex: hash, now: () => clock });

ok(lock.verify("mat-khau-chi-de-test").ok === true, "đúng mật khẩu => ok");
ok(lock.verify("sai").ok === false, "sai mật khẩu => từ chối");
ok(lock.verify("").ok === false && lock.verify(null).ok === false && lock.verify(123).ok === false, "rỗng / null / không phải chuỗi => từ chối");
ok(lock.verify("x".repeat(500)).ok === false, "chuỗi quá dài => từ chối");
const lk = createSetupLock({ saltHex: salt, hashHex: hash, now: () => clock });
let last;
for (let i = 0; i < MAX_FAILS; i++) last = lk.verify("sai" + i);
ok(last.ok === false && last.reason === "locked" && last.retryMs === LOCK_MS, "sai " + MAX_FAILS + " lần => bị khoá tạm");
ok(lk.verify("mat-khau-chi-de-test").ok === false, "đang bị khoá: ngay cả mật khẩu đúng cũng chưa được");
clock += LOCK_MS + 1;
ok(lk.verify("mat-khau-chi-de-test").ok === true, "hết thời gian khoá => mật khẩu đúng mở được");
const mod = read("core/shared/SetupLock.js");
ok(/SALT_HEX = "[0-9a-f]{32}"/.test(mod) && /HASH_HEX = "[0-9a-f]{128}"/.test(mod), "mã nguồn chỉ chứa salt + hash (hex), không có mật khẩu rõ");
ok(!/console\.(log|error|warn)\([^)]*password/i.test(mod), "không log mật khẩu");

// ---- nối dây main/preload/renderer ----
const main = read("app/main.js");
ok(/ipcMain\.handle\("setup-lock-verify"/.test(main), "main có IPC setup-lock-verify");
ok(/event\.sender !== setupWin\.webContents\) return \{ ok: false, reason: "denied" \}/.test(main), "IPC chỉ nhận từ cửa sổ Setup");
ok(/setupWin\.on\("hide"/.test(main) && /"setup-lock-engage"/.test(main), "main báo khoá lại khi Setup bị ẩn");
const mw = main.slice(main.indexOf("function createMainWindow"), main.indexOf("function createSetupWindow"));
ok(/frame:\s*false/.test(mw), "Menu không khung (bỏ thanh tiêu đề Windows => hết ✕ thừa)");
ok(/maximizable:\s*false/.test(mw) && /fullscreenable:\s*false/.test(mw), "Menu không phóng to / không toàn màn hình");
ok(/on\("maximize"/.test(mw) && /unmaximize\(\)/.test(mw) && /on\("enter-full-screen"/.test(mw) && /setFullScreen\(false\)/.test(mw), "lớp bảo hiểm: lỡ phóng to thì tự đưa về");
ok(/-webkit-app-region: drag/.test(mw), "vẫn kéo được cửa sổ bằng header");
const pre = read("app/preload.js");
ok(/setupLockVerify:/.test(pre) && /onSetupLockEngage:/.test(pre), "preload mở đủ 2 kênh khoá");
const nav = read("ui/js/setupNav.js");
ok(/SETUP-LOCK-01 BEGIN/.test(nav) && /setupLockVerify/.test(nav) && /fail-closed/.test(nav), "setupNav.js dựng khoá và giữ khoá khi lỗi");
const rend = read("ui/js/renderer.js");
ok(/\.marquee-bar\{flex-shrink:0;\}/.test(rend), "dòng Key dịch vụ không bị ép mỏng (flex-shrink:0)");
const setupHtml = read("ui/setup.html");
ok(!/setupLock/i.test(setupHtml), "setup.html không bị sửa");

console.log("\n" + pass + " PASS, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
