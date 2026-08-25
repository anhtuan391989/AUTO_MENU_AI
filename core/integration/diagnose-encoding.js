const fs = require("fs");
const path = require("path");
const WindowsMediaSession = require("./WindowsMediaSession");

/**
 * ==========================================================
 * Auto Menu AI — Chẩn đoán lỗi encoding tiếng Việt (SMTC)
 * ----------------------------------------------------------
 * CÁCH CHẠY (trên Windows thật):
 *   node core/integration/diagnose-encoding.js
 *
 * MỤC ĐÍCH: xác định CHÍNH XÁC lỗi "Chß║»c Chß║»n..." nằm ở đâu, bằng
 * cách xuất dữ liệu qua 2 kênh KHÔNG bị ảnh hưởng bởi codepage console:
 *
 *   1. In ra HEX byte thật của chuỗi Title/Artist trong bộ nhớ Node
 *      (hex luôn hiển thị đúng trong MỌI console, bất kể codepage).
 *   2. Ghi JSON ra 1 FILE bằng encoding 'utf8' tường minh, để mở bằng
 *      trình soạn thảo nhận UTF-8 đúng (VS Code, Notepad hiện đại) —
 *      KHÔNG dùng Notepad cũ hoặc "type" trong cmd.exe để xem file này.
 *
 * CÁCH ĐỌC KẾT QUẢ:
 *   - Nếu HEX bắt đầu bằng chuỗi byte đúng UTF-8 của "Chắc" (bắt đầu
 *     "43 68 e1 ba af 63" — xem "HEX MONG ĐỢI" bên dưới) VÀ file .json
 *     mở lên hiển thị ĐÚNG tiếng Việt
 *     -> DỮ LIỆU HOÀN TOÀN ĐÚNG. Lỗi "Chß║»c" mà bạn thấy CHỈ là do
 *        console (cmd.exe/PowerShell) bạn dùng để xem log chưa bật
 *        codepage UTF-8. Cách sửa: chạy `chcp 65001` trong cửa sổ đó
 *        TRƯỚC khi chạy app, hoặc đổi Font console hỗ trợ Unicode.
 *        KHÔNG CẦN sửa code.
 *   - Nếu HEX bị sai/khác (không phải đúng byte UTF-8 của "Chắc")
 *     -> DỮ LIỆU THẬT SỰ bị hỏng trước khi tới Node. Cần gửi lại kết
 *        quả HEX này để điều tra tiếp phía smtc-daemon.ps1.
 * ==========================================================
 */

// Byte UTF-8 ĐÚNG của "Chắc" — dùng để đối chiếu (tính sẵn, không suy đoán):
// C(43) h(68) ắ(e1 ba af) c(63) — nếu Title bắt đầu bằng "Chắc"
const EXPECTED_HEX_PREFIX_FOR_CHAC = "43 68 e1 ba af 63";

const OUTPUT_FILE = path.join(__dirname, "diagnose-encoding-output.json");

console.log("=== AUTO_MENU_AI — Chẩn đoán encoding SMTC ===");
console.log(`Đang chờ snapshot... (mở Chrome/Edge/Brave + phát 1 bài có tên tiếng Việt)\n`);

const session = new WindowsMediaSession();

session.on("unavailable", (info) => {
    console.log("[KHÔNG DÙNG ĐƯỢC]", info);
    console.log("Không thể chẩn đoán vì WindowsMediaSession không khởi động được trên máy này.");
});

session.on("change", (snapshot) => {

    if (!snapshot || !snapshot.title) {
        console.log("(Snapshot rỗng, chờ bài tiếp theo...)");
        return;
    }

    console.log("========================================");
    console.log("Title (in trực tiếp, CÓ THỂ bị lỗi hiển thị nếu console sai codepage):");
    console.log("  " + snapshot.title);

    const titleHex = Buffer.from(snapshot.title, "utf8").toString("hex").match(/../g).join(" ");
    console.log("\nTitle — HEX byte THẬT trong bộ nhớ Node (không bị ảnh hưởng bởi console):");
    console.log("  " + titleHex);

    if (titleHex.startsWith(EXPECTED_HEX_PREFIX_FOR_CHAC)) {

        console.log("\n  ✅ Byte KHỚP ĐÚNG với UTF-8 của \"Chắc...\" — dữ liệu trong Node HOÀN TOÀN ĐÚNG.");
        console.log("     Nếu vẫn thấy 'Chß║»c' trên console -> đó CHỈ là lỗi HIỂN THỊ của console.");
        console.log("     Sửa bằng cách chạy: chcp 65001   (trong CHÍNH cửa sổ đang xem log này)");

    } else if (snapshot.title.startsWith("Chắc") || snapshot.title.startsWith("Chß")) {

        console.log("\n  ⚠️ Byte KHÔNG khớp mẫu mong đợi — cần gửi lại dòng HEX ở trên để điều tra tiếp.");

    }

    console.log("========================================\n");

    try {

        fs.writeFileSync(
            OUTPUT_FILE,
            JSON.stringify({ snapshot, titleHex, capturedAt: new Date().toISOString() }, null, 2),
            "utf8"
        );
        console.log(`Đã ghi file: ${OUTPUT_FILE}`);
        console.log("-> Mở file này bằng VS Code hoặc Notepad hiện đại (Windows 11) để kiểm tra.\n");

    } catch (err) {

        console.log("Không ghi được file chẩn đoán:", err.message);

    }

});

session.on("error", (err) => {
    console.log("[ERROR]", err.message);
});

console.log("[START]");
session.start();

// Tự thoát sau 60 giây nếu không nhận được gì, tránh treo vô thời hạn.
setTimeout(() => {
    console.log("\nHết thời gian chờ (60s). Nếu chưa thấy snapshot nào, kiểm tra lại:");
    console.log("- Đã mở Chrome/Edge/Brave và đang phát nhạc/video chưa?");
    console.log("- Có thấy dòng [READY] không? Nếu không, vấn đề nằm ở bước khởi động PowerShell, không phải encoding.");
    session.stop();
    process.exit(0);
}, 60000);
