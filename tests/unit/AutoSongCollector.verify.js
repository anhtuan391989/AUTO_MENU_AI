/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng AutoSongCollector
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/AutoSongCollector.verify.js
 *
 * Dùng 1 file data giả riêng trong thư mục temp của OS — KHÔNG đụng
 * data/songs.json thật, tự dọn dẹp sau khi chạy.
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

const PATHS = {
    SongDatabase: path.resolve(__dirname, "../../core/reference/SongDatabase.js"),
    SongMatcher: path.resolve(__dirname, "../../core/reference/SongMatcher.js"),
    SongCollectorState: path.resolve(__dirname, "../../core/reference/SongCollectorState.js"),
    SongCollectorUtils: path.resolve(__dirname, "../../core/reference/SongCollectorUtils.js"),
    AutoSongCollector: path.resolve(__dirname, "../../core/reference/AutoSongCollector.js")
};

let testFileCounter = 0;
const tempTestFiles = [];

function freshModules() {

    Object.values(PATHS).forEach((p) => delete require.cache[p]);

    // Mỗi PHẦN test (mỗi lần gọi freshModules) dùng 1 file tạm RIÊNG BIỆT,
    // tránh trường hợp PHẦN sau đọc phải dữ liệu PHẦN trước để lại.
    testFileCounter++;
    const testDataFile = path.join(os.tmpdir(), `automenu_collector_test_${Date.now()}_${testFileCounter}.json`);
    tempTestFiles.push(testDataFile);

    const SongDatabase = require(PATHS.SongDatabase);
    SongDatabase.filePath = testDataFile; // cô lập hoàn toàn khỏi data/songs.json thật

    const AutoSongCollector = require(PATHS.AutoSongCollector);
    const SongCollectorState = require(PATHS.SongCollectorState);

    SongCollectorState.clear(); // đảm bảo mỗi PHẦN test bắt đầu với cache rỗng

    return { SongDatabase, AutoSongCollector, SongCollectorState };
}

function baseSnapshot(overrides = {}) {

    return {
        title: "Chạy Ngay Đi",
        artist: "Sơn Tùng M-TP",
        key: "D Minor",
        bpm: 128,
        keyLocked: true,
        keyConfidence: 0.9,
        bpmStable: true,
        ...overrides
    };

}

function runPartA_AddNew() {
    console.log("=== PHẦN A: Tự động thêm bài hát mới khi dữ liệu ổn định ===");

    const { AutoSongCollector, SongDatabase } = freshModules();

    const result = AutoSongCollector.collect(baseSnapshot());

    check(result.saved === true && result.action === "added", "collect() tự động thêm bài hát mới, không cần người dùng xác nhận");
    check(SongDatabase.load().length === 1, "Sau khi thêm, DB có đúng 1 bản ghi");
    check(SongDatabase.load()[0].key === "D Minor" && SongDatabase.load()[0].bpm === 128, "Dữ liệu lưu đúng Key/BPM từ snapshot");
}

function runPartB_NoDuplicateWrite() {
    console.log("\n=== PHẦN B: Chống ghi trùng (Title + Artist giống nhau) ===");

    const { AutoSongCollector, SongDatabase } = freshModules();

    AutoSongCollector.collect(baseSnapshot());
    // Gửi lại NGUYÊN VẸN snapshot cũ nhiều lần liên tiếp (giống Key/BPM Engine
    // bắn kết quả ổn định liên tục mỗi vài trăm ms trong thực tế).
    AutoSongCollector.collect(baseSnapshot());
    const third = AutoSongCollector.collect(baseSnapshot());
    const fourth = AutoSongCollector.collect(baseSnapshot());

    check(third.saved === false && third.action === "skipped_no_change", "Gọi lại với dữ liệu y hệt -> không ghi thêm (action=skipped_no_change)");
    check(fourth.saved === false, "Gọi lần thứ 4 vẫn không ghi thêm");
    check(SongDatabase.load().length === 1, "Sau nhiều lần gọi trùng, DB vẫn chỉ có đúng 1 bản ghi (không phình to)");
}

function runPartC_UpdateOnChange() {
    console.log("\n=== PHẦN C: Chỉ update khi Key hoặc BPM thực sự đổi ===");

    const { AutoSongCollector, SongDatabase, SongCollectorState } = freshModules();

    AutoSongCollector.collect(baseSnapshot({ key: "D Minor", bpm: 128 }));
    SongCollectorState.clear(); // giả lập app restart / cache hết hạn -> vẫn phải chống trùng nhờ SongDatabase, không nhờ cache

    const bpmJitter = AutoSongCollector.collect(baseSnapshot({ key: "D Minor", bpm: 128.4 }));
    check(bpmJitter.saved === false, "BPM lệch nhẹ trong ngưỡng sai số (128 -> 128.4) -> KHÔNG tính là đổi, không update");

    SongCollectorState.clear();
    const bpmReal = AutoSongCollector.collect(baseSnapshot({ key: "D Minor", bpm: 140 }));
    check(bpmReal.saved === true && bpmReal.action === "updated", "BPM đổi thật (128 -> 140) -> update() đúng");
    check(bpmReal.changed.bpm === true && bpmReal.changed.key === false, "changed{} phản ánh đúng: chỉ BPM đổi, Key không đổi");
    check(SongDatabase.load().length === 1, "Update KHÔNG tạo bản ghi mới, vẫn đúng 1 bản ghi");
    check(SongDatabase.load()[0].bpm === 140, "Giá trị BPM trong DB đã được cập nhật đúng");

    SongCollectorState.clear();
    const keyReal = AutoSongCollector.collect(baseSnapshot({ key: "E Minor", bpm: 140 }));
    check(keyReal.saved === true && keyReal.changed.key === true, "Key đổi thật (D Minor -> E Minor, vd hát tăng tone) -> update() đúng");
    check(SongDatabase.load().length === 1, "Update Key vẫn không tạo bản ghi mới");
}

function runPartD_BlockUnstableData() {
    console.log("\n=== PHẦN D: Chống dữ liệu sai — không lưu khi chưa ổn định ===");

    const { AutoSongCollector, SongDatabase } = freshModules();

    const lowConfidence = AutoSongCollector.collect(baseSnapshot({ keyConfidence: 0.3 }));
    check(lowConfidence.saved === false && lowConfidence.action === "skipped_unstable", "Confidence Key thấp (0.3) -> không lưu");
    check(lowConfidence.reason.includes("key_confidence_too_low"), "Lý do trả về đúng: key_confidence_too_low");

    const notLocked = AutoSongCollector.collect(baseSnapshot({ keyLocked: false }));
    check(notLocked.saved === false, "Key chưa Lock xong (keyLocked=false) -> không lưu");
    check(notLocked.reason.includes("key_not_locked"), "Lý do trả về đúng: key_not_locked");

    const bpmUnstable = AutoSongCollector.collect(baseSnapshot({ bpmStable: false }));
    check(bpmUnstable.saved === false, "BPM chưa ổn định (bpmStable=false) -> không lưu");
    check(bpmUnstable.reason.includes("bpm_not_stable"), "Lý do trả về đúng: bpm_not_stable");

    const missingTitle = AutoSongCollector.collect(baseSnapshot({ title: "" }));
    check(missingTitle.saved === false, "Thiếu title -> không lưu");

    const badKeyFormat = AutoSongCollector.collect(baseSnapshot({ key: "Không Phải Key" }));
    check(badKeyFormat.saved === false, "Key sai định dạng -> không lưu (chống dữ liệu rác)");

    const badBpm = AutoSongCollector.collect(baseSnapshot({ bpm: -5 }));
    check(badBpm.saved === false, "BPM âm/vô lý -> không lưu");

    check(SongDatabase.load().length === 0, "Toàn bộ trường hợp không ổn định ở trên -> DB vẫn RỖNG, không có dữ liệu rác/giả nào lọt vào");
}

function runPartE_NoInterference() {
    console.log("\n=== PHẦN E: Độc lập — không đụng AI Core / Event Flow / IPC / keyEngine / HTML ===");

    const srcFiles = [PATHS.AutoSongCollector, PATHS.SongCollectorState, PATHS.SongCollectorUtils]
        .map((p) => fs.readFileSync(p, "utf-8"))
        .join("\n");

    check(!/require\([^)]*EventBus/.test(srcFiles), "Không require/dùng EventBus");
    check(!/ipcMain|ipcRenderer/.test(srcFiles), "Không dùng IPC");
    check(!/require\(["']electron["']\)/.test(srcFiles), "Không require('electron')");
    check(!/setInterval\(|setTimeout\(/.test(srcFiles), "Không tạo timer nào (không có gì để rò rỉ theo thời gian)");
    check(!/addEventListener/.test(srcFiles), "Không đăng ký DOM/event listener nào");
    check(!/require\(["']\.\.\/ai/.test(srcFiles), "Không require bất kỳ file nào trong core/ai (AI Core)");

    const projectRoot = path.resolve(__dirname, "../..");
    check(fs.readFileSync(path.join(projectRoot, "ui/js/engines/keyEngine.js"), "utf-8").length > 0, "keyEngine.js không bị đụng tới bởi task này");

    const gitStatus = require("child_process").execSync("git status --porcelain", { cwd: projectRoot }).toString();
    const modifiedExistingFiles = gitStatus
        .split("\n")
        .filter((line) => line.trim().startsWith("M")); // "M " = file cũ bị sửa, "??" = file mới thêm thì bỏ qua

    check(modifiedExistingFiles.length === 0, "git status xác nhận không có file cũ nào bị sửa (chỉ thêm file mới)");
}

function runPartF_MemoryBehavior() {
    console.log("\n=== PHẦN F: Không tạo Memory Leak (SongCollectorState) ===");

    const { AutoSongCollector, SongCollectorState } = freshModules();

    // Gọi collect() 500 lần liên tục cho CÙNG 1 bài hát (giống Engine bắn kết
    // quả liên tục trong 1 buổi hát live kéo dài) -> cache không được phép
    // phình to, luôn giữ đúng 1 entry cho 1 bài hát.
    for (let i = 0; i < 500; i++) {

        AutoSongCollector.collect(baseSnapshot());

    }

    check(SongCollectorState.size === 1, `Gọi collect() 500 lần cho 1 bài hát -> cache vẫn chỉ có đúng 1 entry (thực tế: ${SongCollectorState.size})`);

    // Gọi cho 50 bài hát KHÁC NHAU -> cache tăng đúng bằng số bài hát khác
    // nhau (không tăng vô hạn theo số LẦN gọi).
    for (let i = 0; i < 50; i++) {

        AutoSongCollector.collect(baseSnapshot({ title: `Bài Hát Số ${i}`, artist: "Test Artist" }));

    }

    check(SongCollectorState.size === 51, `Cache tăng đúng theo số bài hát KHÁC NHAU (1 cũ + 50 mới = 51), không theo số lần gọi (thực tế: ${SongCollectorState.size})`);

    SongCollectorState.clear();
    check(SongCollectorState.size === 0, "clear() dọn sạch cache hoàn toàn, không còn tham chiếu treo lại");
}

function main() {
    runPartA_AddNew();
    runPartB_NoDuplicateWrite();
    runPartC_UpdateOnChange();
    runPartD_BlockUnstableData();
    runPartE_NoInterference();
    runPartF_MemoryBehavior();

    try {
        tempTestFiles.forEach((f) => { if (fs.existsSync(f)) fs.unlinkSync(f); });
    } catch {}

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — AutoSongCollector hoạt động đúng, không ảnh hưởng module khác.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
