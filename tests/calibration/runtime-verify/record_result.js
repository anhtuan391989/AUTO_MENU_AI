#!/usr/bin/env node
/**
 * AI-RUNTIME-VERIFY-02 — công cụ GHI KẾT QUẢ kiểm thử 13 bài (ngoại tuyến, độc lập với app).
 * KHÔNG đụng engine/Menu. File chuẩn duy nhất: tests/calibration/runtime-verify/results.csv
 *
 *   node record_result.js status
 *   node record_result.js set S01 --key "A major" --bpm 169 --lock 4.4 --level yes --notes "ghi chú"
 *   node record_result.js set S01 --session 3            (lấy Key/LOCK từ log khi chấm, xem README)
 *   node record_result.js set S01 --key "A major" --force   (ghi đè bài đã có dữ liệu; tự sao lưu trước)
 *   node record_result.js import-legacy results.csv      (chuyển file cũ cột tiếng Việt; chỉ điền hàng còn trống)
 *
 * Tuỳ chọn: --file <csv> (mặc định results.csv cạnh file này), --truth <csv>.
 * Không bao giờ tạo số liệu giả: chỉ ghi đúng giá trị người dùng nhập.
 */
const fs = require("fs");
const path = require("path");
const S = require("./score_runtime_verify.js");

const COLS = S.RESULT_COLUMNS;
const DIR = __dirname;

function csvEscape(v) {
    const t = String(v === undefined || v === null ? "" : v).replace(/\r?\n/g, " ");
    return /[",]/.test(t) || /^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function truthIds(truthFile) {
    return S.parseCsv(fs.readFileSync(truthFile, "utf-8")).map((r) => r.id).filter(Boolean);
}

function load(file, ids) {
    if (!fs.existsSync(file)) {
        // Tạo mới (không bao giờ ghi đè file có sẵn): 13 hàng trống từ danh sách đáp án
        const rows = ids.map((id) => ({ id }));
        return { rows, created: true };
    }
    const text = fs.readFileSync(file, "utf-8");
    const head = S.csvHeader(text);
    if (head.join(",") !== COLS.join(",")) {
        throw new Error("File " + file + " sai cột. Cần: " + COLS.join(",") + " — hiện có: " + head.join(",") +
            ". Nếu là file cũ tiếng Việt hãy dùng: import-legacy.");
    }
    const rows = S.parseCsv(text);
    const have = new Set(rows.map((r) => r.id));
    for (const id of ids) if (!have.has(id)) rows.push({ id }); // bù hàng còn thiếu, không mất hàng cũ
    return { rows, created: false };
}

function hasData(r) { return COLS.slice(1).some((c) => String(r[c] || "").trim()); }

function save(file, rows, ids) {
    const order = (id) => { const i = ids.indexOf(id); return i < 0 ? 1e9 : i; };
    const sorted = rows.slice().sort((a, b) => order(a.id) - order(b.id));
    const out = [COLS.join(",")].concat(sorted.map((r) => COLS.map((c) => csvEscape(r[c])).join(","))).join("\n") + "\n";
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, out, "utf-8");
    fs.renameSync(tmp, file); // ghi nguyên tử: lỗi giữa chừng không làm hỏng file cũ
}

function backup(file) {
    if (!fs.existsSync(file)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const b = file + ".bak-" + stamp;
    fs.copyFileSync(file, b);
    return b;
}

function validate(o) {
    const err = [];
    if (o.key !== undefined && o.key !== "" && !S.normKey(o.key)) err.push('Key "' + o.key + '" không hợp lệ (ví dụ: "A major", "F# minor", "Bb major").');
    if (o.bpm !== undefined && o.bpm !== "" && !(Number.isFinite(parseFloat(o.bpm)) && parseFloat(o.bpm) >= 20 && parseFloat(o.bpm) <= 300)) err.push('BPM "' + o.bpm + '" không hợp lệ (số từ 20 đến 300).');
    if (o.lock !== undefined && o.lock !== "" && !(Number.isFinite(parseFloat(o.lock)) && parseFloat(o.lock) >= 0)) err.push('Thời gian LOCK "' + o.lock + '" không hợp lệ (số giây ≥ 0).');
    if (o.session !== undefined && o.session !== "" && !(/^\d+$/.test(String(o.session)) && parseInt(o.session, 10) >= 1)) err.push('Session "' + o.session + '" không hợp lệ (số nguyên ≥ 1).');
    if (o.level !== undefined && o.level !== "" && !/^(yes|no)$/i.test(o.level)) err.push('level phải là yes hoặc no.');
    return err;
}

function setRow(file, ids, id, o, force) {
    id = String(id || "").toUpperCase();
    if (!ids.includes(id)) throw new Error("ID " + id + " không có trong bảng đáp án (hợp lệ: " + ids.join(", ") + ").");
    const err = validate(o);
    if (err.length) throw new Error(err.join("\n"));
    const given = ["key", "bpm", "session", "lock", "level", "notes"].filter((k) => o[k] !== undefined);
    if (!given.length) throw new Error("Chưa có giá trị nào để ghi. Dùng --key, --bpm, --lock, --level, --session hoặc --notes.");
    const { rows } = load(file, ids);
    const row = rows.find((r) => r.id === id);
    let bak = null;
    if (hasData(row)) {
        if (!force) throw new Error(id + " đã có dữ liệu — không ghi đè. Thêm --force nếu chắc chắn (file sẽ được sao lưu trước).");
        bak = backup(file);
    }
    const map = { key: "shown_key", bpm: "shown_bpm", session: "session", lock: "t_lock_s", level: "level_ok", notes: "notes" };
    for (const k of given) row[map[k]] = k === "level" ? String(o[k]).toLowerCase() : String(o[k]).trim();
    save(file, rows, ids);
    return { bak };
}

// ---- import file cũ (cột tiếng Việt) ----
function importLegacy(file, legacyFile, ids) {
    const text = fs.readFileSync(legacyFile, "utf-8");
    const head = S.csvHeader(text);
    const col = (names) => head.findIndex((h) => names.includes(h));
    const iId = col(["Tên bài", "id"]), iKey = col(["Key phát hiện"]), iBpm = col(["BPM phát hiện"]);
    const iSt = col(["Trạng thái tín hiệu"]), iLock = col(["Thời gian LOCK"]), iNote = col(["Ghi chú"]);
    if (iId < 0 || iKey < 0) throw new Error("Không nhận ra cột của file cũ (cần 'Tên bài' và 'Key phát hiện').");
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    const { rows } = load(file, ids);
    const done = [], skipped = [];
    let bak = null;
    for (const line of lines.slice(1)) {
        const c = S.parseCsv(head.join(",") + "\n" + line)[0];
        const get = (i) => (i >= 0 ? String(c[head[i]] || "").trim() : "");
        const id = get(iId).toUpperCase();
        const row = rows.find((r) => r.id === id);
        if (!row) { skipped.push(id + " (không có trong bảng đáp án)"); continue; }
        if (hasData(row)) { skipped.push(id + " (hàng chuẩn đã có dữ liệu — giữ nguyên)"); continue; }
        const key = get(iKey), bpm = get(iBpm), lock = get(iLock).replace(/s$/i, ""), st = get(iSt), note = get(iNote);
        if (!key && !bpm && !lock && !st && !note) { skipped.push(id + " (hàng cũ trống)"); continue; }
        if (!bak) bak = backup(file);
        row.shown_key = S.normKey(key) ? key : "";
        row.shown_bpm = Number.isFinite(parseFloat(bpm)) ? bpm : "";
        row.t_lock_s = Number.isFinite(parseFloat(lock)) ? lock : "";
        row.level_ok = /không có tín hiệu|yếu|❌|⚠/i.test(st) ? "no" : (/bình thường|✅/i.test(st) ? "yes" : "");
        row.notes = ["[import-legacy]", st && "trạng thái: " + st, note, (key && !S.normKey(key)) ? "key gốc: " + key : ""].filter(Boolean).join(" | ");
        done.push(id);
    }
    if (done.length) save(file, rows, ids);
    return { done, skipped, bak };
}

function status(file, ids) {
    const { rows } = load(file, ids);
    const out = [];
    for (const id of ids) {
        const r = rows.find((x) => x.id === id) || {};
        out.push(`${id} | ${hasData(r) ? "ĐÃ CÓ DỮ LIỆU" : "chưa kiểm thử"} | key=${r.shown_key || "-"} bpm=${r.shown_bpm || "-"} lock=${r.t_lock_s || "-"} session=${r.session || "-"} level=${r.level_ok || "-"}`);
    }
    const n = ids.filter((id) => hasData(rows.find((x) => x.id === id) || {})).length;
    out.push(`Tổng: ${n}/${ids.length} bài đã có dữ liệu.`);
    return out.join("\n");
}

function parseArgs(argv) {
    const o = {}, pos = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) {
            const k = argv[i].slice(2);
            if (k === "force") o.force = true;
            else { o[k] = argv[i + 1]; i++; }
        } else pos.push(argv[i]);
    }
    return { o, pos };
}

function main(argv) {
    const { o, pos } = parseArgs(argv);
    const file = path.resolve(o.file || path.join(DIR, "results.csv"));
    const truth = path.resolve(o.truth || path.join(DIR, "ground_truth.csv"));
    const ids = truthIds(truth);
    try {
        const cmd = pos[0];
        if (cmd === "status") { console.log(status(file, ids)); return 0; }
        if (cmd === "set") {
            const r = setRow(file, ids, pos[1], o, !!o.force);
            console.log("Đã lưu " + String(pos[1]).toUpperCase() + " vào " + file + (r.bak ? "\nĐã sao lưu bản cũ: " + r.bak : ""));
            return 0;
        }
        if (cmd === "import-legacy") {
            if (!pos[1]) throw new Error("Thiếu đường dẫn file cũ.");
            const r = importLegacy(file, path.resolve(pos[1]), ids);
            console.log("Đã chuyển: " + (r.done.join(", ") || "không có hàng nào") + "\nBỏ qua: " + (r.skipped.join("; ") || "không") + (r.bak ? "\nĐã sao lưu: " + r.bak : "") + "\nFile cũ giữ nguyên, không bị xoá hay sửa.");
            return 0;
        }
        console.error("Lệnh: status | set <ID> [--key --bpm --lock --level --session --notes --force] | import-legacy <file>");
        return 2;
    } catch (e) {
        console.error("LỖI: " + e.message);
        return 1;
    }
}

module.exports = { csvEscape, load, save, setRow, importLegacy, status, validate, hasData };
if (require.main === module) process.exit(main(process.argv.slice(2)));
