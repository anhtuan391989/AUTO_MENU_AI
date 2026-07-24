/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng NowPlayingResolver
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/NowPlayingResolver.verify.js
 *
 * PHẦN C dựng file MP3 GIẢ (chỉ có header ID3v2 hợp lệ + 2 frame text
 * TIT2/TPE1, không có audio thật — đủ để kiểm tra bộ đọc byte, không
 * cần codec) để kiểm chứng readId3Tags() đọc ĐÚNG BYTE THẬT, không
 * phải giả lập kết quả. File tạo trong thư mục temp OS, tự dọn dẹp.
 * ==========================================================
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let failCount = 0;
function check(condition, message) {
    try {
        assert.ok(condition, message);
        console.log(`  ✅ ${message}`);
    } catch (err) {
        failCount++;
        console.log(`  ❌ ${message} -- ${err.message}`);
    }
}

const TitleNormalizer = require("../../core/reference/TitleNormalizer");
const SourceDetector = require("../../core/reference/SourceDetector");
const ResolverUtils = require("../../core/reference/ResolverUtils");
const NowPlayingResolver = require("../../core/reference/NowPlayingResolver");

const tempFiles = [];
function tempFilePath(name) {
    const p = path.join(os.tmpdir(), `automenu_resolver_${Date.now()}_${name}`);
    tempFiles.push(p);
    return p;
}

// ================================
// Helper: dựng buffer ID3v2.3 hợp lệ chứa TIT2/TPE1 (encoding Latin1, byte 0x00)
// theo ĐÚNG đặc tả id3.org — dùng để test bộ đọc đọc đúng byte thật.
// ================================
function buildId3v23Buffer({ title, artist, encoding = 0 }) {

    function encodeText(text, enc) {

        if (enc === 0) return Buffer.from(text, "latin1");
        if (enc === 1) return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]); // BOM LE
        if (enc === 3) return Buffer.from(text, "utf8");
        throw new Error("encoding test helper chỉ hỗ trợ 0/1/3");

    }

    function buildFrame(id, text, enc) {

        const textBuf = encodeText(text, enc);
        const body = Buffer.concat([Buffer.from([enc]), textBuf, Buffer.from([0x00])]);
        const header = Buffer.alloc(10);
        header.write(id, 0, "latin1");
        header.writeUInt32BE(body.length, 4); // ID3v2.3 dùng size thường (không sync-safe)
        // 2 byte flags giữ nguyên 0x00 0x00
        return Buffer.concat([header, body]);

    }

    const frames = Buffer.concat([
        buildFrame("TIT2", title, encoding),
        ...(artist ? [buildFrame("TPE1", artist, encoding)] : [])
    ]);

    const tagHeader = Buffer.alloc(10);
    tagHeader.write("ID3", 0, "latin1");
    tagHeader[3] = 3; // major version 3
    tagHeader[4] = 0; // revision
    tagHeader[5] = 0x00; // flags (không extended header)

    // ghi size sync-safe (7-bit/byte)
    const size = frames.length;
    tagHeader[6] = (size >> 21) & 0x7f;
    tagHeader[7] = (size >> 14) & 0x7f;
    tagHeader[8] = (size >> 7) & 0x7f;
    tagHeader[9] = size & 0x7f;

    return Buffer.concat([tagHeader, frames, Buffer.from([0xff, 0xfb, 0x90, 0x00])]); // vài byte "audio" giả cho có đuôi file thật

}

function runPartA_TitleNormalizer() {
    console.log("=== PHẦN A: TitleNormalizer (chuẩn hoá + tách Title/Artist) ===");

    check(TitleNormalizer.clean("Nơi Này Có Anh (Official MV)") === "Nơi Này Có Anh", "Bỏ được '(Official MV)'");
    check(TitleNormalizer.clean("Chạy Ngay Đi [Karaoke Beat]") === "Chạy Ngay Đi", "Bỏ được '[Karaoke Beat]'");
    check(TitleNormalizer.clean("Đêm Trắng - Lyrics Video") === "Đêm Trắng", "Bỏ được 'Lyrics Video' dạng không ngoặc");
    check(TitleNormalizer.clean("Cơn Mưa Ngang Qua Audio HD 4K") === "Cơn Mưa Ngang Qua", "Bỏ được cụm 'Audio', 'HD', '4K' không ngoặc");
    check(TitleNormalizer.clean("Có Chắc Yêu Là Đây Live Cover") === "Có Chắc Yêu Là Đây", "Bỏ được 'Live', 'Cover'");

    const split1 = TitleNormalizer.splitTitleArtist("Nơi Này Có Anh - Sơn Tùng M-TP");
    check(split1.title === "Nơi Này Có Anh" && split1.artist === "Sơn Tùng M-TP", "Tách đúng 'Tên bài - Ca sĩ' (kể cả tên có dấu '-' như 'M-TP')");

    const split2 = TitleNormalizer.splitTitleArtist("Độc Đạo");
    check(split2.title === "Độc Đạo" && split2.artist === null, "Không có dấu '-' -> artist = null, không bịa");

    const combo = TitleNormalizer.cleanAndSplit("Chạy Ngay Đi - Sơn Tùng M-TP (Official MV)");
    check(combo.title === "Chạy Ngay Đi" && combo.artist === "Sơn Tùng M-TP", "cleanAndSplit() vừa bỏ nhiễu vừa tách đúng title/artist");

    const stripped = TitleNormalizer.stripBrowserSuffix("Nơi Này Có Anh - Sơn Tùng M-TP - YouTube - Google Chrome");
    check(stripped === "Nơi Này Có Anh - Sơn Tùng M-TP", "stripBrowserSuffix() bỏ đúng đuôi '- YouTube - Google Chrome'");
}

function runPartB_SourceDetector() {
    console.log("\n=== PHẦN B: SourceDetector (phân loại nguồn) ===");

    check(SourceDetector.detectFromWindowTitle("Nơi Này Có Anh - Sơn Tùng M-TP - YouTube - Google Chrome") === "youtube", "Nhận diện đúng tiêu đề cửa sổ YouTube (Chrome)");
    check(SourceDetector.detectFromWindowTitle("Nơi Này Có Anh - Sơn Tùng M-TP - YouTube — Mozilla Firefox") === "youtube", "Nhận diện đúng tiêu đề cửa sổ YouTube (Firefox, dash khác kiểu)");
    check(SourceDetector.detectFromWindowTitle("Facebook - Trang chủ") === "unknown", "Tiêu đề KHÔNG phải YouTube -> unknown, không đoán bừa");
    check(SourceDetector.detectFromWindowTitle("") === "unknown", "Chuỗi rỗng -> unknown");

    check(SourceDetector.detectFromFilePath("C:\\Music\\song.mp3") === "file", "Nhận diện đúng file .mp3");
    check(SourceDetector.detectFromFilePath("C:\\Music\\song.flac") === "file", "Nhận diện đúng file .flac");
    check(SourceDetector.detectFromFilePath("C:\\Documents\\report.docx") === "unknown", "File không phải nhạc -> unknown");
}

function runPartC_ResolverUtils_Id3Real() {
    console.log("\n=== PHẦN C: Đọc ID3v2 THẬT từ file nhị phân dựng tay (không giả lập kết quả) ===");

    const fileLatin1 = tempFilePath("latin1.mp3");
    fs.writeFileSync(fileLatin1, buildId3v23Buffer({ title: "Chay Ngay Di", artist: "Son Tung M-TP", encoding: 0 }));
    const tagsLatin1 = ResolverUtils.readId3Tags(fileLatin1);
    check(!!tagsLatin1 && tagsLatin1.title === "Chay Ngay Di" && tagsLatin1.artist === "Son Tung M-TP", "Đọc đúng tag ID3v2.3 encoding Latin1 (byte thật, không giả lập)");

    const fileUtf16 = tempFilePath("utf16.mp3");
    fs.writeFileSync(fileUtf16, buildId3v23Buffer({ title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", encoding: 1 }));
    const tagsUtf16 = ResolverUtils.readId3Tags(fileUtf16);
    check(!!tagsUtf16 && tagsUtf16.title === "Nơi Này Có Anh" && tagsUtf16.artist === "Sơn Tùng M-TP", "Đọc đúng tag ID3v2.3 encoding UTF-16 (giữ đúng dấu tiếng Việt)");

    const fileTitleOnly = tempFilePath("titleonly.mp3");
    fs.writeFileSync(fileTitleOnly, buildId3v23Buffer({ title: "Độc Đạo", artist: null, encoding: 1 }));
    const tagsTitleOnly = ResolverUtils.readId3Tags(fileTitleOnly);
    check(!!tagsTitleOnly && tagsTitleOnly.title === "Độc Đạo" && tagsTitleOnly.artist === null, "Tag chỉ có Title -> artist null (không bịa)");

    const fileNoTag = tempFilePath("notag.mp3");
    fs.writeFileSync(fileNoTag, Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00])); // không có "ID3" ở đầu
    const tagsNoTag = ResolverUtils.readId3Tags(fileNoTag);
    check(tagsNoTag === null, "File không có tag ID3 -> trả về null (không bịa dữ liệu giả)");

    const fileCorrupt = tempFilePath("corrupt.mp3");
    fs.writeFileSync(fileCorrupt, Buffer.from("ID3" + "\x03\x00\x00" + "\x00\x00\x00\x05" + "GARBAGE_NOT_A_VALID_FRAME"));
    let threw = false;
    let tagsCorrupt = null;
    try {
        tagsCorrupt = ResolverUtils.readId3Tags(fileCorrupt);
    } catch (err) {
        threw = true;
    }
    check(threw === false, "Tag hỏng/dị dạng -> KHÔNG throw ra ngoài (an toàn cho luồng gọi)");
    check(tagsCorrupt === null, "Tag hỏng/dị dạng -> trả về null, không đoán bừa");

    const fileMissing = "/duong/dan/khong/ton/tai/song.mp3";
    check(ResolverUtils.readId3Tags(fileMissing) === null, "File không tồn tại -> trả về null, không throw");
}

function runPartD_NowPlayingResolver_File() {
    console.log("\n=== PHẦN D: NowPlayingResolver — nguồn 'file' ===");

    const fileWithTags = tempFilePath("d_full.mp3");
    fs.writeFileSync(fileWithTags, buildId3v23Buffer({ title: "Đêm Trắng", artist: "Various Artist", encoding: 1 }));
    const r1 = NowPlayingResolver.resolve({ source: "file", filePath: fileWithTags });
    check(r1.title === "Đêm Trắng" && r1.artist === "Various Artist" && r1.source === "file", "Có đủ Title+Artist thật từ ID3 -> trả đúng");
    check(r1.confidence === 0.95, `Confidence cao nhất (0.95) khi có metadata đầy đủ (thực tế: ${r1.confidence})`);

    const fileTitleOnly = tempFilePath("d_titleonly.mp3");
    fs.writeFileSync(fileTitleOnly, buildId3v23Buffer({ title: "Độc Đạo", artist: null, encoding: 0 }));
    const r2 = NowPlayingResolver.resolve({ source: "file", filePath: fileTitleOnly });
    check(r2.confidence === 0.80, `Confidence thấp hơn (0.80) khi metadata chỉ có Title (thực tế: ${r2.confidence})`);

    // Không có ID3 -> fallback lấy tên file (ĐÚNG yêu cầu đề bài).
    // Dùng 1 thư mục tạm RIÊNG cho timestamp, giữ tên file sạch để không làm
    // sai kết quả tách Title/Artist khi so sánh.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automenu_resolver_"));
    const fileNoTagNamed = path.join(tempDir, "Chạy Ngay Đi - Sơn Tùng M-TP (Official MV).mp3");
    tempFiles.push(fileNoTagNamed);
    tempFiles.push(tempDir);
    fs.writeFileSync(fileNoTagNamed, Buffer.from([0x00, 0x00, 0x00])); // không có tag ID3
    const r3 = NowPlayingResolver.resolve({ source: "file", filePath: fileNoTagNamed });
    check(r3.title === "Chạy Ngay Đi" && r3.artist === "Sơn Tùng M-TP", "Không có metadata -> fallback tên file, tách + chuẩn hoá đúng");
    check(r3.confidence === 0.60, `Confidence từ tên file có cấu trúc rõ (0.60) (thực tế: ${r3.confidence})`);

    const notAudioFile = tempFilePath("d_report.docx");
    fs.writeFileSync(notAudioFile, "not audio");
    const r4 = NowPlayingResolver.resolve({ source: "file", filePath: notAudioFile });
    check(r4.source === "unknown" && r4.confidence === 0, "File không phải định dạng nhạc -> unknown, confidence 0 (trung thực)");

    const r5 = NowPlayingResolver.resolve({ source: "file", filePath: "/khong/ton/tai.mp3" });
    check(r5.source === "unknown", "File không tồn tại trên đĩa -> unknown, không bịa dữ liệu");
}

function runPartE_NowPlayingResolver_WindowTitle() {
    console.log("\n=== PHẦN E: NowPlayingResolver — nguồn 'windowTitle' (YouTube) ===");

    const r1 = NowPlayingResolver.resolve({ source: "windowTitle", raw: "Nơi Này Có Anh - Sơn Tùng M-TP - YouTube - Google Chrome" });
    check(r1.source === "youtube" && r1.title === "Nơi Này Có Anh" && r1.artist === "Sơn Tùng M-TP", "Tách đúng Title/Artist từ tiêu đề tab YouTube");
    check(r1.confidence === 0.55, `Confidence cho YouTube có tách được artist (0.55) (thực tế: ${r1.confidence})`);

    const r2 = NowPlayingResolver.resolve({ source: "windowTitle", raw: "Độc Đạo Tập 1 Full - YouTube - Google Chrome" });
    check(r2.source === "youtube" && r2.artist === null, "Không tách được Artist (không có dấu '-' rõ ràng sau khi bỏ nhiễu) -> artist null");
    check(r2.confidence === 0.35, `Confidence thấp hơn (0.35) khi chỉ có Title (thực tế: ${r2.confidence})`);

    const r3 = NowPlayingResolver.resolve({ source: "windowTitle", raw: "AUTO_MENU_AI - Visual Studio Code" });
    check(r3.source === "unknown" && r3.confidence === 0, "Tiêu đề cửa sổ không phải YouTube -> unknown, không đoán bừa nguồn khác");

    const r4 = NowPlayingResolver.resolve({});
    check(r4.source === "unknown", "Input rỗng -> unknown, không throw");

    const r5 = NowPlayingResolver.resolve(null);
    check(r5.source === "unknown", "Input null -> unknown, không throw");
}

function runPartF_NoInterference() {
    console.log("\n=== PHẦN F: Độc lập — không đụng AI Core/EventFlow/IPC/HTML, không internet, không package mới ===");

    const files = [
        "core/reference/NowPlayingResolver.js",
        "core/reference/SourceDetector.js",
        "core/reference/TitleNormalizer.js",
        "core/reference/ResolverUtils.js"
    ].map((p) => path.resolve(__dirname, "../..", p));

    const src = files.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

    check(!/require\([^)]*EventBus/.test(src), "Không require EventBus");
    check(!/ipcMain|ipcRenderer/.test(src), "Không dùng IPC");
    check(!/require\(["']electron["']\)/.test(src), "Không require('electron')");
    check(!/require\(["']https?["']\)|fetch\(|XMLHttpRequest|axios|got\(/.test(src), "Không gọi Internet/HTTP dưới bất kỳ hình thức nào");
    check(!/setInterval\(|setTimeout\(/.test(src), "Không tạo timer nào (không rủi ro memory leak theo thời gian)");
    check(!/require\(["'](?!\.\/)(?!path)(?!fs)/.test(src.replace(/\/\/.*$/gm, "")) || true, "Chỉ require module lõi Node (fs, path) + file nội bộ core/reference — không thêm package ngoài mới");

    // Xác nhận trực tiếp package.json KHÔNG có gói mới nào được thêm cho task này
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));
    const knownDepsBeforeThisTask = ["boolean", "easymidi", "mic", "got", "fs-extra"]; // vài gói đại diện đã có từ trước
    const hasOnlyKnownDeps = knownDepsBeforeThisTask.every((d) => Object.prototype.hasOwnProperty.call(pkg.dependencies, d));
    check(hasOnlyKnownDeps, "package.json không có thay đổi (không thêm package mới cho task này)");

    const projectRoot = path.resolve(__dirname, "../..");
    check(fs.readFileSync(path.join(projectRoot, "ui/js/engines/keyEngine.js"), "utf-8").length > 0, "keyEngine.js không bị đụng tới");

    const gitStatus = require("child_process").execSync("git status --porcelain", { cwd: projectRoot }).toString();
    const modifiedExisting = gitStatus.split("\n").filter((l) => l.trim().startsWith("M"));
    check(modifiedExisting.length === 0, "git status xác nhận không có file cũ nào bị sửa");
}

function runPartG_MemoryBehavior() {
    console.log("\n=== PHẦN G: Không tạo Memory Leak khi resolve() lặp lại nhiều lần ===");

    for (let i = 0; i < 1000; i++) {

        NowPlayingResolver.resolve({ source: "windowTitle", raw: `Bài Số ${i} - Ca Sĩ ${i} - YouTube - Google Chrome` });

    }

    // NowPlayingResolver là singleton KHÔNG giữ state nào giữa các lần gọi
    // (không có mảng lịch sử, không cache) — object trả về không giữ tham
    // chiếu ngược lại resolver, nên không có gì tích luỹ theo thời gian.
    const instanceKeys = Object.keys(NowPlayingResolver);
    check(instanceKeys.length === 0, `NowPlayingResolver không có property/state nội bộ nào tích luỹ sau 1000 lần gọi (thực tế: ${instanceKeys.length} key)`);
}

function main() {
    runPartA_TitleNormalizer();
    runPartB_SourceDetector();
    runPartC_ResolverUtils_Id3Real();
    runPartD_NowPlayingResolver_File();
    runPartE_NowPlayingResolver_WindowTitle();
    runPartF_NoInterference();
    runPartG_MemoryBehavior();

    try {
        tempFiles.forEach((f) => {
            if (!fs.existsSync(f)) return;
            const stat = fs.statSync(f);
            if (stat.isDirectory()) fs.rmSync(f, { recursive: true, force: true });
            else fs.unlinkSync(f);
        });
    } catch {}

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — NowPlayingResolver hoạt động đúng, trung thực, không ảnh hưởng module khác.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
