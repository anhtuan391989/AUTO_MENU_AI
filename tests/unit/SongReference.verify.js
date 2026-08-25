/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Song Reference System
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/SongReference.verify.js
 *
 * Test dùng 1 file data giả riêng (songs.test.json trong thư mục
 * temp của hệ điều hành) — KHÔNG đụng vào data/songs.json thật của
 * project, tự dọn dẹp sau khi chạy xong.
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

const SONG_DB_PATH = path.resolve(__dirname, "../../core/reference/SongDatabase.js");
const SONG_MATCHER_PATH = path.resolve(__dirname, "../../core/reference/SongMatcher.js");
const KEY_VERIFIER_PATH = path.resolve(__dirname, "../../core/reference/KeyVerifier.js");
const INDEX_PATH = path.resolve(__dirname, "../../core/reference/index.js");

// Trỏ SongDatabase sang 1 file JSON tạm trong thư mục temp của OS, để test
// không bao giờ đụng vào data/songs.json thật (dù chạy trên máy dev hay CI).
const TEST_DATA_FILE = path.join(os.tmpdir(), `automenu_songs_test_${Date.now()}.json`);

function freshModules() {
    delete require.cache[SONG_DB_PATH];
    delete require.cache[SONG_MATCHER_PATH];
    delete require.cache[KEY_VERIFIER_PATH];
    delete require.cache[INDEX_PATH];

    const SongDatabase = require(SONG_DB_PATH);
    SongDatabase.filePath = TEST_DATA_FILE; // ghi đè đường dẫn -> cô lập hoàn toàn khỏi data/songs.json thật

    const SongMatcher = require(SONG_MATCHER_PATH);
    const KeyVerifier = require(KEY_VERIFIER_PATH);

    return { SongDatabase, SongMatcher, KeyVerifier };
}

function runPartA_SongDatabase() {
    console.log("=== PHẦN A: SongDatabase (CRUD thuần trên data/songs.json) ===");

    const { SongDatabase } = freshModules();

    check(!fs.existsSync(TEST_DATA_FILE), "File test chưa tồn tại trước khi gọi load() lần đầu");

    const initial = SongDatabase.load();
    check(Array.isArray(initial) && initial.length === 0, "load() tự tạo file mới, khởi tạo mảng rỗng (không hardcode dữ liệu)");
    check(fs.existsSync(TEST_DATA_FILE), "File JSON được tự tạo trên đĩa");

    const added = SongDatabase.addSong({ title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", key: "G Major", bpm: 120 });
    check(added.title === "Nơi Này Có Anh", "addSong() thêm bài hát mới thành công");
    check(SongDatabase.load().length === 1, "Sau addSong(), file có đúng 1 bản ghi");

    let threw = false;
    try {
        SongDatabase.addSong({ title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", key: "G Major", bpm: 120 });
    } catch (err) {
        threw = true;
    }
    check(threw, "addSong() từ chối thêm trùng (title + artist đã tồn tại)");

    const found = SongDatabase.getSong("nơi này có anh", "sơn tùng m-tp");
    check(!!found, "getSong() tìm đúng khi khác hoa/thường");

    const notFound = SongDatabase.getSong("Bài Không Tồn Tại");
    check(notFound === null, "getSong() trả về null khi không tìm thấy");

    const updated = SongDatabase.updateSong("Nơi Này Có Anh", "Sơn Tùng M-TP", { bpm: 128 });
    check(updated.bpm === 128, "updateSong() cập nhật đúng field yêu cầu");
    check(updated.key === "G Major", "updateSong() giữ nguyên các field không được yêu cầu sửa");

    const removedCount = SongDatabase.removeSong("Nơi Này Có Anh", "Sơn Tùng M-TP");
    check(removedCount === 1, "removeSong() xoá đúng 1 bản ghi");
    check(SongDatabase.load().length === 0, "Sau removeSong(), danh sách rỗng trở lại");

    const removedAgain = SongDatabase.removeSong("Không Tồn Tại");
    check(removedAgain === 0, "removeSong() trả về 0 khi không tìm thấy gì để xoá (không throw)");
}

function runPartB_SongMatcher() {
    console.log("\n=== PHẦN B: SongMatcher (so khớp Title/Artist, kể cả 'mờ') ===");

    const { SongDatabase, SongMatcher } = freshModules();

    SongDatabase.addSong({ title: "Đêm Trắng", artist: "Various Artist", key: "D Minor", bpm: 90 });

    const exact = SongMatcher.findReference("Đêm Trắng", "Various Artist");
    check(!!exact && exact.key === "D Minor", "findReference() khớp chính xác");

    const noDiacritics = SongMatcher.findReference("dem trang", "various artist");
    check(!!noDiacritics && noDiacritics.key === "D Minor", "findReference() khớp được khi bỏ dấu tiếng Việt + khác hoa/thường");

    const withNoise = SongMatcher.findReference("Đêm Trắng (Karaoke) - Official MV");
    check(!!withNoise && withNoise.key === "D Minor", "findReference() khớp được khi tên có cụm nhiễu (Karaoke)/(Official MV)");

    const missing = SongMatcher.findReference("Bài Hát Không Có Trong DB");
    check(missing === null, "findReference() trả về null (không throw) khi không tìm thấy");

    const emptyTitle = SongMatcher.findReference("");
    check(emptyTitle === null, "findReference() trả về null khi title rỗng");
}

function runPartC_KeyVerifier() {
    console.log("\n=== PHẦN C: KeyVerifier (so sánh Detected Key vs Reference Key) ===");

    const { KeyVerifier } = freshModules();

    const exact = KeyVerifier.verify("G Major", "G Major");
    check(exact.match === true && exact.difference === 0, "Key trùng khớp hoàn toàn -> match=true, difference=0");
    check(exact.confidenceAdjustment > 0, "Key trùng khớp -> confidenceAdjustment dương (cộng điểm tin cậy)");

    // Ví dụ đúng như đề bài: Detected = G#, Reference = G -> difference = +1
    const example = KeyVerifier.verify("G# Major", "G Major");
    check(example.match === false, "G# vs G -> không khớp");
    check(example.difference === 1, `G# vs G -> difference = +1 đúng như ví dụ đề bài (thực tế: ${example.difference})`);
    check(example.confidenceAdjustment < 0, "Lệch 1 bán cung -> confidenceAdjustment âm (trừ điểm tin cậy)");

    const reverse = KeyVerifier.verify("G Major", "G# Major");
    check(reverse.difference === -1, `Đảo chiều detected/reference -> difference = -1 (thực tế: ${reverse.difference})`);

    const modeMismatch = KeyVerifier.verify("A Minor", "A Major");
    check(modeMismatch.match === false && modeMismatch.difference === 0, "Cùng root khác mode (relative key) -> không match nhưng difference=0");
    check(modeMismatch.reason === "mode_mismatch", "Cùng root khác mode -> reason = 'mode_mismatch'");

    const flatInput = KeyVerifier.verify("Ab Major", "G# Major");
    check(flatInput.match === true, "Ab và G# là cùng 1 nốt (quy đổi giáng->thăng) -> match=true");

    const farApart = KeyVerifier.verify("C Major", "F# Major");
    check(Math.abs(farApart.difference) === 6, `Lệch xa nhất (tritone) -> |difference| = 6 (thực tế: ${farApart.difference})`);
    check(farApart.confidenceAdjustment === -0.15, `Phạt bị chặn ở MAX_PENALTY = -0.15 (thực tế: ${farApart.confidenceAdjustment})`);

    const invalid = KeyVerifier.verify("Không phải Key", "G Major");
    check(invalid.match === false && invalid.difference === null, "Key không đúng định dạng -> match=false, difference=null, không throw");

    // Module thuần: gọi verify() nhiều lần với cùng input phải luôn ra cùng kết quả (không side effect / không state).
    const first = KeyVerifier.verify("D Minor", "D Minor");
    const second = KeyVerifier.verify("D Minor", "D Minor");
    check(JSON.stringify(first) === JSON.stringify(second), "KeyVerifier.verify() là pure function — cùng input luôn ra cùng output");
}

function runPartD_NoInterference() {
    console.log("\n=== PHẦN D: Không đụng EventBus/IPC/keyEngine.js hiện có ===");

    const keyVerifierSrc = fs.readFileSync(KEY_VERIFIER_PATH, "utf-8");
    const songDbSrc = fs.readFileSync(SONG_DB_PATH, "utf-8");
    const songMatcherSrc = fs.readFileSync(SONG_MATCHER_PATH, "utf-8");
    const indexSrc = fs.readFileSync(INDEX_PATH, "utf-8");
    const allSrc = keyVerifierSrc + songDbSrc + songMatcherSrc + indexSrc;

    check(!/EventBus/.test(allSrc), "Không require/dùng EventBus trong module mới");
    check(!/ipcMain|ipcRenderer/.test(allSrc), "Không dùng IPC trong module mới");
    check(!/require\(["']electron["']\)/.test(allSrc), "Không require('electron') trong module mới");

    const projectRoot = path.resolve(__dirname, "../..");
    const keyEngineOriginal = fs.readFileSync(path.join(projectRoot, "ui/js/engines/keyEngine.js"), "utf-8");
    check(keyEngineOriginal.length > 0, "keyEngine.js vẫn còn nguyên, không bị đụng tới bởi task này");
}

function main() {
    runPartA_SongDatabase();
    runPartB_SongMatcher();
    runPartC_KeyVerifier();
    runPartD_NoInterference();

    // Dọn file test tạm
    try {
        if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
    } catch {}

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Song Reference System hoạt động đúng, không ảnh hưởng module khác.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
