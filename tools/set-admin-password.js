"use strict";
// EXE-PROTECT-03 — Công cụ ĐẶT MẬT KHẨU ADMIN RIÊNG cho bản phát hành (chạy trên máy Khói, KHÔNG đóng gói vào bản cài).
//
// Cách dùng (người không rành lập trình): bấm đúp  tools\set-admin-password.bat
//   1) Gõ mật khẩu mới (không hiện chữ khi gõ) rồi gõ lại lần nữa.
//   2) Công cụ tính salt + hash (scrypt, một chiều) rồi ghi vào core/shared/AdminAuth.js (2 dòng DEFAULT_SALT_HEX / DEFAULT_HASH_HEX).
//   3) Tự kiểm tra lại bằng module thật; lỗi thì trả file về nguyên trạng.
//   4) Build lại .exe như thường lệ.
//
// AN TOÀN: mật khẩu KHÔNG bao giờ được in ra màn hình, ghi vào file hay gửi đi đâu. Chỉ có salt+hash được ghi.
// Tuỳ chọn:  --print  chỉ in 2 dòng để tự dán (không sửa file);  --target <file>  sửa file khác (dùng cho test).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const DEFAULT_TARGET = path.join(__dirname, "..", "core", "shared", "AdminAuth.js");
const MIN_LEN = 12;
const SCRYPT_KEYLEN = 64;
const SALT_RE = /const DEFAULT_SALT_HEX = "[0-9a-f]{32}";/g;
const HASH_RE = /const DEFAULT_HASH_HEX = "[0-9a-f]{128}";/g;

// Trả về chuỗi lỗi (tiếng Việt) hoặc null nếu mật khẩu đạt yêu cầu.
function checkShape(pw) {
    if (typeof pw !== "string" || pw.length < MIN_LEN) return `Mật khẩu phải có ít nhất ${MIN_LEN} ký tự (hash sẽ nằm trong mã nguồn nên cần đủ dài).`;
    if (pw.length > 128) return "Mật khẩu quá dài (tối đa 128 ký tự).";
    if (/^[0-9]+$/.test(pw)) return "Mật khẩu không được chỉ toàn số.";
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Mật khẩu phải có cả chữ và số.";
    if (/^(.)\1+$/.test(pw)) return "Mật khẩu không được lặp một ký tự.";
    return null;
}

function buildRecord(pw) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(pw, salt, SCRYPT_KEYLEN).toString("hex");
    return { salt, hash };
}

function readCurrent(src) {
    const s = src.match(/const DEFAULT_SALT_HEX = "([0-9a-f]{32})";/);
    const h = src.match(/const DEFAULT_HASH_HEX = "([0-9a-f]{128})";/);
    return s && h ? { salt: s[1], hash: h[1] } : null;
}

function sameAsCurrent(src, pw) {
    const cur = readCurrent(src);
    if (!cur) return false;
    const cand = crypto.scryptSync(pw, cur.salt, SCRYPT_KEYLEN);
    const ref = Buffer.from(cur.hash, "hex");
    return cand.length === ref.length && crypto.timingSafeEqual(cand, ref);
}

// Thay đúng 2 dòng hằng số; phải khớp ĐÚNG 1 lần mỗi dòng, nếu không thì dừng (không sửa bừa).
function patchSource(src, salt, hash) {
    const ns = (src.match(SALT_RE) || []).length, nh = (src.match(HASH_RE) || []).length;
    if (ns !== 1 || nh !== 1) throw new Error(`Không tìm thấy đúng 1 dòng DEFAULT_SALT_HEX/DEFAULT_HASH_HEX trong file (thấy ${ns}/${nh}).`);
    return src
        .replace(SALT_RE, () => `const DEFAULT_SALT_HEX = "${salt}";`)
        .replace(HASH_RE, () => `const DEFAULT_HASH_HEX = "${hash}";`);
}

function hiddenQuestion(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        let mute = false;
        const orig = rl._writeToOutput;
        rl._writeToOutput = function (s) { if (!mute) orig.call(rl, s); };
        process.stdout.write(prompt);
        mute = true;
        rl.question("", (ans) => { rl.close(); process.stdout.write("\n"); resolve(ans); });
    });
}

async function readPasswords() {
    if (!process.stdin.isTTY) { // chạy bằng ống dẫn (test): dòng 1 = mật khẩu, dòng 2 = nhập lại
        const lines = fs.readFileSync(0, "utf8").split(/\r?\n/);
        return [lines[0] || "", lines[1] || ""];
    }
    const a = await hiddenQuestion("Nhập mật khẩu Admin mới (không hiện chữ khi gõ): ");
    const b = await hiddenQuestion("Nhập lại mật khẩu để xác nhận: ");
    return [a, b];
}

// Tự kiểm tra: nạp bản đã sửa bằng module thật, mật khẩu đúng phải qua, mật khẩu sai phải trượt.
function selfCheck(patchedSrc, pw) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "setadminpw-"));
    const modFile = path.join(tmpDir, "AdminAuth.check.js");
    try {
        fs.writeFileSync(modFile, patchedSrc, "utf8");
        const M = require(modFile);
        const a = M.createAdminAuth({ userDataDir: path.join(tmpDir, "ud"), safeStorage: null });
        return a.verify(pw).ok === true && a.verify(pw + "x").ok === false;
    } catch (e) {
        return false;
    } finally {
        try { delete require.cache[require.resolve(modFile)]; } catch (e) { /* bỏ qua */ }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ }
    }
}

async function main(argv) {
    const printOnly = argv.includes("--print");
    const ti = argv.indexOf("--target");
    const target = ti >= 0 && argv[ti + 1] ? path.resolve(argv[ti + 1]) : DEFAULT_TARGET;

    let src;
    try { src = fs.readFileSync(target, "utf8"); } catch (e) { console.error("Không đọc được file: " + target); return 1; }
    if (!readCurrent(src)) { console.error("File không có DEFAULT_SALT_HEX/DEFAULT_HASH_HEX đúng dạng: " + target); return 1; }

    const [pw, pw2] = await readPasswords();
    if (pw !== pw2) { console.error("HAI LẦN NHẬP KHÔNG GIỐNG NHAU. Chưa thay đổi gì."); return 1; }
    const bad = checkShape(pw);
    if (bad) { console.error("MẬT KHẨU CHƯA ĐẠT: " + bad + " Chưa thay đổi gì."); return 1; }
    if (sameAsCurrent(src, pw)) { console.error("Mật khẩu này trùng với mật khẩu đang đặt sẵn trong code. Hãy chọn mật khẩu khác. Chưa thay đổi gì."); return 1; }

    const { salt, hash } = buildRecord(pw);
    let patched;
    try { patched = patchSource(src, salt, hash); } catch (e) { console.error(e.message + " Chưa thay đổi gì."); return 1; }

    if (printOnly) {
        console.log(`const DEFAULT_SALT_HEX = "${salt}";`);
        console.log(`const DEFAULT_HASH_HEX = "${hash}";`);
        return 0;
    }
    if (!selfCheck(patched, pw)) { console.error("Tự kiểm tra thất bại. Chưa thay đổi gì."); return 1; }

    fs.writeFileSync(target, patched, "utf8");
    // Đọc lại từ đĩa để chắc chắn đã ghi đúng.
    if (!selfCheck(fs.readFileSync(target, "utf8"), pw)) { fs.writeFileSync(target, src, "utf8"); console.error("Ghi file xong nhưng kiểm tra lại thất bại — đã trả file về nguyên trạng."); return 1; }

    console.log("ĐÃ ĐẶT MẬT KHẨU ADMIN MỚI cho bản phát hành (đã tự kiểm tra: mật khẩu đúng qua, mật khẩu sai trượt).");
    console.log("File đã sửa: " + target);
    console.log("Việc tiếp theo: build lại .exe. Máy nào còn dùng mật khẩu mặc định cũ sẽ tự được nâng lên mật khẩu mới này.");
    console.log("GHI NHỚ mật khẩu của anh: công cụ không lưu nó ở đâu cả, quên là phải đặt lại.");
    return 0;
}

module.exports = { checkShape, buildRecord, patchSource, readCurrent, sameAsCurrent, selfCheck, MIN_LEN, DEFAULT_TARGET };

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => { console.error("Lỗi: " + (e && e.message)); process.exit(1); });
}
