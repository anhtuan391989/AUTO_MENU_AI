"use strict";

// ================================================================
// TASK A52 — ADMIN AUTHENTICATION BACKEND (Claude A, SETUP OWNER)
// ================================================================
// Chịu trách nhiệm DUY NHẤT: hash + lưu trữ password Admin an toàn, xác thực
// password, đổi password. Đây là module CORE thuần Node — KHÔNG phụ thuộc
// renderer/UI. app/main.js chỉ gọi qua IPC (xem ipcMain.handle "admin-auth-*"),
// KHÔNG tự làm logic hash/so sánh ở đó (đúng nguyên tắc "không bypass từ renderer").
//
// AN TOÀN MẬT KHẨU (đúng mục 8 trong đặc tả Task A):
//   1) Password KHÔNG BAO GIỜ được lưu dạng đọc được ("Kh0i_AI!" không nằm trong
//      bất kỳ file nào trên đĩa sau khi bootstrap). Chỉ lưu {salt, hash} với
//      hash = scrypt(password, salt) — hàm băm một chiều, không thể đảo ngược.
//   2) Lớp bảo vệ THỨ HAI, đúng yêu cầu "bảo vệ bằng cơ chế phù hợp với
//      Electron/Windows": nếu Electron safeStorage khả dụng (Windows DPAPI, gắn
//      với tài khoản Windows đang đăng nhập), toàn bộ record {salt,hash} còn được
//      mã hoá thêm 1 lớp bằng safeStorage.encryptString() trước khi ghi ra đĩa.
//      Copy được file cũng không đọc được nội dung nếu không phải đúng tài khoản
//      Windows đó.
//   3) Nếu safeStorage KHÔNG khả dụng (máy dev không phải Windows, hoặc Electron
//      báo isEncryptionAvailable()=false) — vẫn AN TOÀN vì hash một chiều vẫn còn
//      nguyên, chỉ mất lớp mã hoá thứ 2. KHÔNG BAO GIỜ fallback về lưu plaintext.
//   4) So sánh hash dùng crypto.timingSafeEqual — chống timing attack.
//   5) KHÔNG log password ở bất kỳ đâu, kể cả khi lỗi — chỉ log true/false/reason
//      dạng text cố định, không bao giờ nội suy giá trị password vào log.
//
// TESTABLE Ở NODE THUẦN (không cần Electron) nhờ dependency injection qua
// createAdminAuth({userDataDir, safeStorage}) — xem tests/unit/AdminAuthA52.verify.js.
// module.exports mặc định là 1 singleton lazy-bind vào Electron thật khi chạy
// trong app/main.js.
// ================================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_PASSWORD = "Kh0i_AI!";
const MIN_PASSWORD_LENGTH = 6;
const SCRYPT_KEYLEN = 64;
const FILE_NAME = "admin-auth.json";
const ENC_PREFIX = "AMA1:"; // đánh dấu nội dung file đã qua safeStorage.encryptString

function scryptHash(password, salt) {
    return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

function timingSafeEqualHex(hexA, hexB) {
    const a = Buffer.from(hexA, "hex");
    const b = Buffer.from(hexB, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Yêu cầu mục 6: password KHÔNG được thiết kế là PIN số cố định — phải hỗ trợ
// chữ/số/ký tự đặc biệt. Ở đây KHÔNG ép buộc bắt buộc phải trộn đủ 3 loại (đặc tả
// chỉ nói "hỗ trợ", không nói "bắt buộc trộn") — chỉ chặn độ dài quá ngắn và chặn
// password toàn số (để không ai vô tình biến nó thành PIN 4-6 số).
function validatePasswordShape(password) {
    if (typeof password !== "string") {
        return { ok: false, reason: "Password phải là chuỗi ký tự." };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, reason: `Password phải có tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.` };
    }
    if (/^[0-9]+$/.test(password)) {
        return { ok: false, reason: "Password không được là dãy số PIN cố định — hãy thêm chữ hoặc ký tự đặc biệt." };
    }
    return { ok: true };
}

/**
 * Tạo 1 instance AdminAuth độc lập, có thể inject userDataDir/safeStorage khác
 * nhau — dùng để test ở Node thuần, và dùng thật trong Electron qua
 * getDefaultInstance() ở dưới.
 *
 * @param {Object} deps
 * @param {string} deps.userDataDir  Thư mục lưu file (thay app.getPath("userData"))
 * @param {Object|null} deps.safeStorage  Electron safeStorage thật, hoặc null
 */
function createAdminAuth(deps) {
    const userDataDir = deps.userDataDir;
    const safeStorage = deps.safeStorage || null;
    const filePath = path.join(userDataDir, FILE_NAME);

    function canEncrypt() {
        try {
            return !!(
                safeStorage &&
                typeof safeStorage.isEncryptionAvailable === "function" &&
                safeStorage.isEncryptionAvailable()
            );
        } catch {
            return false;
        }
    }

    function writeRecord(record) {
        const json = JSON.stringify(record);
        fs.mkdirSync(userDataDir, { recursive: true });

        if (canEncrypt()) {
            const encBuf = safeStorage.encryptString(json);
            fs.writeFileSync(filePath, ENC_PREFIX + encBuf.toString("base64"), "utf-8");
            return;
        }

        // Không có safeStorage khả dụng -> vẫn KHÔNG plaintext password (record chỉ
        // chứa salt+hash một chiều), chỉ thiếu lớp mã hoá thứ 2.
        fs.writeFileSync(filePath, json, "utf-8");
    }

    function readRecord() {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf-8");

        if (raw.startsWith(ENC_PREFIX)) {
            if (!canEncrypt()) {
                throw new Error(
                    "Không giải mã được admin-auth.json (safeStorage không khả dụng trên máy/tài khoản Windows hiện tại)."
                );
            }
            const encBuf = Buffer.from(raw.slice(ENC_PREFIX.length), "base64");
            const json = safeStorage.decryptString(encBuf);
            return JSON.parse(json);
        }

        return JSON.parse(raw);
    }

    function bootstrapIfMissing() {
        if (fs.existsSync(filePath)) return;
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = scryptHash(DEFAULT_PASSWORD, salt);
        writeRecord({ salt, hash, updatedAt: new Date().toISOString() });
    }

    function isBootstrapped() {
        return fs.existsSync(filePath);
    }

    function verify(password) {
        bootstrapIfMissing();

        if (typeof password !== "string" || password.length === 0) {
            return { ok: false, reason: "Thiếu password." };
        }

        let record;
        try {
            record = readRecord();
        } catch (err) {
            return { ok: false, reason: err.message };
        }

        if (!record || !record.salt || !record.hash) {
            return { ok: false, reason: "Không đọc được dữ liệu xác thực Admin." };
        }

        const candidateHash = scryptHash(password, record.salt);
        const match = timingSafeEqualHex(candidateHash, record.hash);
        return { ok: match, reason: match ? null : "Sai password." };
    }

    function changePassword(currentPassword, newPassword) {
        const current = verify(currentPassword);
        if (!current.ok) {
            return { ok: false, reason: current.reason || "Password hiện tại không đúng." };
        }

        const shape = validatePasswordShape(newPassword);
        if (!shape.ok) {
            return { ok: false, reason: shape.reason };
        }

        if (newPassword === currentPassword) {
            return { ok: false, reason: "Password mới phải khác password hiện tại." };
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const hash = scryptHash(newPassword, salt);
        writeRecord({ salt, hash, updatedAt: new Date().toISOString() });
        return { ok: true };
    }

    return {
        verify,
        changePassword,
        isBootstrapped,
        bootstrapIfMissing,
        _filePath: filePath // chỉ dùng cho test — không dùng ở app/main.js
    };
}

function getElectronSafeStorage() {
    try {
        const electron = require("electron");
        return electron.safeStorage || null;
    } catch {
        return null;
    }
}

function getElectronUserDataDir() {
    try {
        const { app } = require("electron");
        return app.getPath("userData");
    } catch {
        return null;
    }
}

// Instance mặc định dùng thật trong app/main.js (Electron). Lazy-bind vì
// app.getPath("userData") chỉ hợp lệ SAU app.whenReady() — gọi getDefaultInstance()
// quá sớm trong lifecycle Electron sẽ throw rõ ràng thay vì âm thầm sai đường dẫn.
let defaultInstance = null;
function getDefaultInstance() {
    if (defaultInstance) return defaultInstance;
    const userDataDir = getElectronUserDataDir();
    if (!userDataDir) {
        throw new Error(
            "AdminAuth: không lấy được userData path từ Electron. Module này phải được gọi từ tiến trình main, sau app.whenReady()."
        );
    }
    defaultInstance = createAdminAuth({ userDataDir, safeStorage: getElectronSafeStorage() });
    return defaultInstance;
}

module.exports = {
    createAdminAuth,
    DEFAULT_PASSWORD,
    MIN_PASSWORD_LENGTH,
    verify: (password) => getDefaultInstance().verify(password),
    changePassword: (currentPassword, newPassword) => getDefaultInstance().changePassword(currentPassword, newPassword),
    isBootstrapped: () => getDefaultInstance().isBootstrapped()
};
