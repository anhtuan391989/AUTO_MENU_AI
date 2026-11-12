// KEY-DIAG-LOG-01 — Đọc nhật ký dò Key và cho biết AI sai KIỂU nào.
// Chạy:  node tools/key_log_report.js            (đọc thư mục logs ở gốc project)
//        node tools/key_log_report.js <thư mục logs>
// Đáp án thật (ưu tiên): Key người dùng GỬI tay (KEY_LOG_MANUAL) > Key ghi trong tên bài ("Key: G Major").
"use strict";
const fs = require("fs"), path = require("path");

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = { DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#" };
function parseKey(k) {
    const m = String(k || "").trim().replace(/♯/g, "#").replace(/♭/g, "b").match(/^([A-Ga-g])\s*([#b]?)\s*(major|minor|maj|min|m)?$/i);
    if (!m) return null;
    let n = (m[1] + (m[2] || "")).toUpperCase(); n = FLAT[n] || n;
    const root = NOTES.indexOf(n); if (root < 0) return null;
    return { root, minor: /^m(in(or)?)?$/i.test(m[3] || "") };
}
const label = (p) => NOTES[p.root] + (p.minor ? " Minor" : " Major");
const majorRoot = (p) => (p.minor ? (p.root + 3) % 12 : p.root); // bộ nốt = Key Trưởng tương ứng

// Phân loại sai kiểu gì: "dung" | "tuong-ung" (cùng bộ nốt) | "lan-can-5" (±1 vòng quãng 5) | "lan-can-5+tuong-ung" | "khac"
function classify(truthKey, aiKey) {
    const t = parseKey(truthKey), a = parseKey(aiKey);
    if (!t || !a) return { type: "khong-doc-duoc", shift: null };
    const shift = (((a.root - t.root) % 12) + 12) % 12; // AI cao hơn đáp án bao nhiêu bán cung (nốt chủ)
    if (t.root === a.root && t.minor === a.minor) return { type: "dung", shift };
    const d = (((majorRoot(a) - majorRoot(t)) % 12) + 12) % 12; // khoảng cách giữa 2 bộ nốt
    if (d === 0) return { type: "tuong-ung", shift };
    if (d === 5 || d === 7) return { type: t.minor === a.minor ? "lan-can-5" : "lan-can-5+tuong-ung", shift };
    return { type: "khac", shift };
}

function readRecords(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
        for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
            if (line.indexOf("KEY_LOG") < 0) continue;
            try { const r = JSON.parse(line); if (r && (r.event === "KEY_LOG" || r.event === "KEY_LOG_MANUAL")) out.push(r); } catch (e) {}
        }
    }
    return out;
}

function buildRows(records) {
    const bySong = new Map();
    for (const r of records) {
        if (!r.song) continue;
        if (!bySong.has(r.song)) bySong.set(r.song, { song: r.song, ai: [], manual: null, hint: null });
        const s = bySong.get(r.song);
        if (r.titleHint) s.hint = r.titleHint;
        if (r.event === "KEY_LOG") s.ai.push(r); else s.manual = r.key;
    }
    const rows = [];
    for (const s of bySong.values()) {
        if (!s.ai.length) continue;
        const first = s.ai[0], truth = s.manual || s.hint || null;
        const c = truth ? classify(truth, first.key) : { type: "chua-co-dap-an", shift: null };
        rows.push({ song: s.song.length > 46 ? s.song.slice(0, 45) + "…" : s.song, truth, truthFrom: s.manual ? "tay" : (s.hint ? "tên bài" : "-"),
            ai: first.key, ai2: first.key2 || null, conf: first.confidence, margin: first.margin, lockMs: first.lockMs, locks: s.ai.length, type: c.type, shift: c.shift });
    }
    return rows;
}

function report(rows) {
    const known = rows.filter((r) => r.truth && r.type !== "khong-doc-duoc");
    const cnt = {}; for (const r of known) cnt[r.type] = (cnt[r.type] || 0) + 1;
    const lines = [];
    lines.push(`Tổng ${rows.length} bài có nhật ký; ${known.length} bài có đáp án (Key tay hoặc tên bài).`);
    if (known.length) {
        const pc = (n) => `${n || 0} (${Math.round(100 * (n || 0) / known.length)}%)`;
        lines.push(`  Đúng: ${pc(cnt["dung"])} | Cùng bộ nốt (Trưởng↔Thứ): ${pc(cnt["tuong-ung"])} | Lân cận vòng 5: ${pc(cnt["lan-can-5"])} | Lân cận+tương ứng: ${pc(cnt["lan-can-5+tuong-ung"])} | Khác: ${pc(cnt["khac"])}`);
        const sh = {}; for (const r of known) if (r.type !== "dung" && r.shift !== null) sh[r.shift] = (sh[r.shift] || 0) + 1;
        const top = Object.entries(sh).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `+${k} bán cung: ${v} bài`);
        if (top.length) lines.push("  AI sai thường lệch (nốt chủ): " + top.join(", "));
    }
    const lm = rows.map((r) => r.lockMs).filter((x) => typeof x === "number").sort((a, b) => a - b);
    if (lm.length) lines.push(`  Thời gian AI chốt Key: trung vị ${(lm[Math.floor(lm.length / 2)] / 1000).toFixed(1)}s, chậm nhất ${(lm[lm.length - 1] / 1000).toFixed(1)}s`);
    lines.push("");
    for (const r of rows) lines.push(`${r.type.padEnd(20)} AI=${(r.ai || "?").padEnd(9)} (kế: ${(r.ai2 || "-").padEnd(9)}) đáp án=${(r.truth || "?").padEnd(9)}[${r.truthFrom}] tin cậy=${r.conf != null ? Number(r.conf).toFixed(2) : "?"} margin=${r.margin != null ? Number(r.margin).toFixed(2) : "?"} chốt=${r.lockMs != null ? (r.lockMs / 1000).toFixed(1) + "s" : "?"}  ${r.song}`);
    return lines.join("\n");
}

module.exports = { parseKey, classify, buildRows, report, readRecords, label };

if (require.main === module) {
    const dir = process.argv[2] || path.join(__dirname, "..", "logs");
    const rows = buildRows(readRecords(dir));
    console.log(rows.length ? report(rows) : "Chưa có nhật ký KEY_LOG trong: " + dir + "\n(Phát vài bài với app đã cập nhật rồi chạy lại.)");
}
