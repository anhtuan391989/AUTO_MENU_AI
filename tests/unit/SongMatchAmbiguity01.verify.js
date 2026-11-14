/**
 * ==========================================================
 * Auto Menu AI — SONG-MATCH-AMBIGUITY-01
 * Kiểm chứng: tìm bài không dấu + xử lý bài trùng tên (SongMatcher) + nhập không trùng khác dấu (SongDbAdmin).
 * Chạy: node tests/unit/SongMatchAmbiguity01.verify.js
 * Dùng file data tạm trong thư mục temp của OS — KHÔNG đụng data/songs.json thật.
 * ==========================================================
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); }
}

const TMP = path.join(os.tmpdir(), `automenu_ambig_${Date.now()}.json`);
const SongDatabase = require(path.join(ROOT, "core/reference/SongDatabase.js"));
SongDatabase.filePath = TMP;
const SongMatcher = require(path.join(ROOT, "core/reference/SongMatcher.js"));
const SongDbAdmin = require(path.join(ROOT, "core/reference/SongDbAdmin.js"));

const origLog = console.log;
function quiet(fn) { console.log = () => {}; try { return fn(); } finally { console.log = origLog; } }
function setDb(list) { fs.writeFileSync(TMP, JSON.stringify(list), "utf-8"); }

try {

    console.log("=== A. Tìm không dấu (đã có từ trước, khoá lại bằng test) ===");
    setDb([{ title: "Đêm Trắng", artist: "Hà Anh Tuấn", key: "A Minor" }]);
    ok((SongMatcher.findReference("dem trang") || {}).key === "A Minor", "'dem trang' tìm ra 'Đêm Trắng'");
    ok((SongMatcher.findReference("ĐÊM TRẮNG (Karaoke)") || {}).key === "A Minor", "Tên có hậu tố '(Karaoke)' vẫn tìm ra");
    ok((SongMatcher.findReference("Dem Trang", "ha anh tuan") || {}).key === "A Minor", "Ca sĩ không dấu 'ha anh tuan' vẫn khớp");
    ok(SongMatcher.findReference("Bài Không Có") === null, "Bài không có -> null");
    ok(SongMatcher.findReference("") === null && SongMatcher.findReference(null) === null, "Title rỗng/null -> null, không throw");

    console.log("=== B. Bài trùng tên, khác ca sĩ ===");
    setDb([
        { title: "Em Ơi", artist: "Ca Sĩ A", key: "C Major" },
        { title: "Em Ơi", artist: "Ca Sĩ B", key: "D Major" }
    ]);
    const amb = quiet(() => SongMatcher.resolve("em oi", ""));
    ok(amb.song === null && amb.ambiguous === true, "Không biết ca sĩ + khác Key -> null và ambiguous=true (không đoán bừa)");
    ok(quiet(() => SongMatcher.findReference("Em Ơi")) === null, "findReference trả null khi mơ hồ");
    ok((SongMatcher.findReference("Em Ơi", "Ca Sĩ B") || {}).key === "D Major", "Có ca sĩ B -> chọn đúng Key D");
    ok((SongMatcher.findReference("em oi", "ca si a") || {}).key === "C Major", "Ca sĩ viết không dấu/thường -> chọn đúng Key C");
    ok(SongMatcher.resolve("Em Ơi", "Ca Sĩ C").song === null && SongMatcher.resolve("Em Ơi", "Ca Sĩ C").ambiguous === false, "Ca sĩ lạ (không có trong DB) -> null nhưng KHÔNG coi là mơ hồ");

    console.log("=== C. Trùng tên nhưng cùng Key thì chọn được ===");
    setDb([
        { title: "Bài X", artist: "A", key: "G Major" },
        { title: "Bài X", artist: "B", key: "g major" }
    ]);
    ok((SongMatcher.findReference("Bài X") || {}).key === "G Major", "Cùng Key (khác hoa/thường) -> chọn bản đầu, vẫn đúng Key");

    console.log("=== D. Ưu tiên khớp chính xác; bản ghi artist rỗng yếu hơn ===");
    setDb([
        { title: "dem trang", artist: "", key: "C Major" },
        { title: "Đêm Trắng", artist: "", key: "A Minor" }
    ]);
    ok((SongMatcher.findReference("Đêm Trắng") || {}).key === "A Minor", "Có bản khớp chính xác (đúng dấu) -> ưu tiên bản đó");
    setDb([
        { title: "Mưa Chiều", artist: "", key: "E Minor" },
        { title: "Mưa Chiều", artist: "Ca Sĩ Z", key: "F Major" }
    ]);
    ok((SongMatcher.findReference("mua chieu", "Ca Sĩ Z") || {}).key === "F Major", "Biết ca sĩ -> ưu tiên bản có ca sĩ khớp hơn bản artist rỗng");

    console.log("=== E. Hành vi cũ giữ nguyên ===");
    setDb([{ title: "Chỉ Một Bài", artist: "", key: "B Major" }]);
    ok((SongMatcher.findReference("Chỉ Một Bài", "ai đó") || {}).key === "B Major", "Bản ghi artist rỗng (kéo từ server) vẫn khớp theo tên");
    ok(typeof SongMatcher.sameRecording === "function" && SongMatcher.sameRecording({ durationSec: 200 }, 200) === true, "sameRecording vẫn hoạt động");

    console.log("=== F. Nhập (importSongs) không tạo bài trùng khác dấu ===");
    const fakeDb = { filePath: TMP + ".x", data: [{ title: "Đêm Trắng", artist: "Hà Anh Tuấn", key: "A Minor" }], load() { return this.data; }, save(v) { this.data = v; } };
    const r = SongDbAdmin.importSongs([
        { title: "dem trang", artist: "ha anh tuan", key: "C Major" },
        { title: "Đêm Trắng", artist: "Ca Sĩ Khác", key: "D Major" },
        { title: "  ", artist: "x" }
    ], fakeDb);
    ok(r.ok && r.added === 1 && r.duplicates === 1 && r.invalid === 1, "Bản khác dấu bị bỏ qua (duplicates=1), bản khác ca sĩ được thêm (added=1), bản sai bị đếm invalid");
    ok(fakeDb.data.length === 2 && fakeDb.data[0].key === "A Minor", "Bản ghi cũ không bị ghi đè");
    const fakeDb2 = { filePath: TMP + ".y", data: [{ title: "Đêm Trắng", artist: "A", key: "C Major" }, { title: "dem trang", artist: "A", key: "D Major" }], load() { return this.data; }, save(v) { this.data = v; } };
    const rb = SongDbAdmin.rebuild(fakeDb2, { size: 0, clear() {} });
    ok(rb.ok && rb.after === 2 && rb.duplicates === 0, "rebuild KHÔNG đổi: không xoá bản khác dấu (tránh xoá nhầm dữ liệu)");

    console.log("=== G. Phạm vi sửa ===");
    const main = fs.readFileSync(path.join(ROOT, "app/main.js"), "utf-8");
    ok(/SongMatcher\.findReference\(resolved\.title, resolved\.artist\)/.test(main), "app/main.js vẫn gọi findReference đúng như cũ (không sửa main.js)");
    const matcherSrc = fs.readFileSync(path.join(ROOT, "core/reference/SongMatcher.js"), "utf-8");
    ok(!/document\.|require\(["']electron["']\)|keyEngine|EventBus/.test(matcherSrc), "SongMatcher không chạm giao diện / Electron / Key Engine / EventBus");

} finally {
    for (const f of [TMP]) { try { fs.unlinkSync(f); } catch (e) { /* không có thì thôi */ } }
}

console.log(`\n== TỔNG KẾT: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
