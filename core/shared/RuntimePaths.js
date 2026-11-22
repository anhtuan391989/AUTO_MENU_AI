"use strict";

/**
 * ==========================================================
 * Auto Menu AI
 * RuntimePaths  (PACKAGE-01)
 * ----------------------------------------------------------
 * Chỉ trả về ĐƯỜNG DẪN thư mục dùng để GHI dữ liệu (logs, data/songs.json...).
 *
 *  - Chạy từ mã nguồn (npm start / node test): giữ NGUYÊN như cũ = thư mục gốc project
 *    (ví dụ G:\AUTO_MENU_AI\logs) -> máy dev không đổi gì.
 *  - Chạy từ bản cài .exe (app.isPackaged): dùng thư mục dữ liệu người dùng
 *    (%APPDATA%\automenu-ai\...) để khi "Cập nhật" (cài đè bản mới) dữ liệu KHÔNG bị mất.
 *
 * Không đọc/ghi file, không có tác dụng phụ — dễ test.
 * ==========================================================
 */

const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", ".."); // core/shared/../.. = gốc project (hoặc resources/app khi đã đóng gói)

function electronApp() {
    try {
        const e = require("electron");
        // Ngoài Electron (node thuần), require("electron") trả về chuỗi đường dẫn hoặc lỗi -> không có .app
        return e && typeof e === "object" && e.app ? e.app : null;
    } catch (_) {
        return null;
    }
}

function isPackaged(appObj) {
    const a = appObj === undefined ? electronApp() : appObj;
    return !!(a && a.isPackaged);
}

/** Thư mục GHI được cho `name` (vd "logs", "data"). */
function writableDir(name, opts) {
    const o = opts || {};
    const a = o.app === undefined ? electronApp() : o.app;
    if (a && a.isPackaged) return path.join(a.getPath("userData"), name);
    return path.join(o.projectRoot || PROJECT_ROOT, name);
}

/** Thư mục ĐỌC (đi kèm bản cài) cho `name` — dùng làm dữ liệu mẫu lần chạy đầu. */
function bundledDir(name, opts) {
    const o = opts || {};
    return path.join(o.projectRoot || PROJECT_ROOT, name);
}

/**
 * EXE-PROTECT-01 — Bản cài .exe đóng gói code vào app.asar. Chương trình BÊN NGOÀI (AutoHotkey, Python, PowerShell)
 * không đọc được file nằm trong .asar, nên các file đó được giải nén ra "app.asar.unpacked" (xem build.asarUnpack
 * trong package.json). Hàm này đổi đường dẫn ".../app.asar/..." thành ".../app.asar.unpacked/..." để truyền cho
 * chương trình ngoài. Chạy từ mã nguồn (không có "app.asar" trong đường dẫn) => trả về NGUYÊN VẸN, máy dev không đổi gì.
 */
function unpackedPath(p) {
    if (typeof p !== "string") return p;
    return p.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

module.exports = { PROJECT_ROOT, isPackaged, writableDir, bundledDir, unpackedPath };
