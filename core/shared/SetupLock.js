"use strict";

// ================================================================
// SETUP-LOCK-01 — KHOÁ BẢO VỆ KHU VỰC CÀI ĐẶT (SETUP)
// ================================================================
// Việc DUY NHẤT của module này: kiểm tra mật khẩu mở Cài đặt, chạy ở tiến trình main (renderer
// chỉ gửi mật khẩu qua IPC "setup-lock-verify" và nhận đúng/sai — không tự so sánh).
//
// - Mật khẩu KHÔNG nằm trong mã nguồn ở dạng đọc được: chỉ lưu {salt, hash} (scrypt, một chiều).
// - So sánh bằng crypto.timingSafeEqual.
// - Chống dò mật khẩu: sai MAX_FAILS lần liên tiếp thì khoá thử LOCK_MS (giữ trong bộ nhớ, tắt app là reset).
// - Tách biệt hoàn toàn với core/shared/AdminAuth.js (mật khẩu Admin của tab AI) — không đụng file đó.
// - KHÔNG bao giờ log mật khẩu.
// ================================================================

const crypto = require("crypto");

const SALT_HEX = "e0468a4c1c6f247876ff3a73196f739a";
const HASH_HEX = "a3b9391db7effe1639881ed5dd844b1bbb51ddc9fec8f13909fcc25ae34bc732a31b8aa1dffd9105b8c8befc371927bbb03e83e41e4574e060a6fe5a5c8d9730";
const SCRYPT_KEYLEN = 64;
const MAX_FAILS = 5;
const LOCK_MS = 30 * 1000;

function createSetupLock(opts) {
    const o = opts || {};
    const salt = o.saltHex || SALT_HEX;
    const hash = o.hashHex || HASH_HEX;
    const now = typeof o.now === "function" ? o.now : () => Date.now();
    let fails = 0;
    let lockedUntil = 0;

    function verify(password) {
        const t = now();
        if (t < lockedUntil) {
            return { ok: false, reason: "locked", retryMs: lockedUntil - t };
        }
        if (typeof password !== "string" || password.length === 0 || password.length > 128) {
            return { ok: false, reason: "wrong" };
        }
        let match = false;
        try {
            const cand = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
            const ref = Buffer.from(hash, "hex");
            match = cand.length === ref.length && crypto.timingSafeEqual(cand, ref);
        } catch {
            match = false;
        }
        if (match) {
            fails = 0;
            return { ok: true };
        }
        fails += 1;
        if (fails >= MAX_FAILS) {
            fails = 0;
            lockedUntil = now() + LOCK_MS;
            return { ok: false, reason: "locked", retryMs: LOCK_MS };
        }
        return { ok: false, reason: "wrong", triesLeft: MAX_FAILS - fails };
    }

    return { verify };
}

const defaultInstance = createSetupLock();

module.exports = {
    createSetupLock,
    MAX_FAILS,
    LOCK_MS,
    verify: (password) => defaultInstance.verify(password)
};
