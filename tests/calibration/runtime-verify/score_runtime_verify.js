#!/usr/bin/env node
/**
 * AI-RUNTIME-VERIFY-01 — chấm điểm Key/BPM của engine đang chạy so với bảng đáp án.
 * KHÔNG đụng keyEngine/bpmEngine; chỉ ĐỌC ground_truth.csv, results.csv và (tuỳ chọn) log .jsonl.
 *
 * Dùng:
 *   node score_runtime_verify.js --list-sessions logs/2026-xx.jsonl
 *   node score_runtime_verify.js --truth ground_truth.csv --results results.csv [--log logs/2026-xx.jsonl] [--out report.md]
 *
 * results.csv: id, shown_key, shown_bpm, session (số thứ tự phiên từ --list-sessions, tuỳ chọn),
 *              t_lock_s (giây, tuỳ chọn — dùng khi không có session), level_ok (yes/no, tuỳ chọn), notes
 * Telemetry KHÔNG ghi BPM => shown_bpm luôn do người dùng đọc từ giao diện.
 */
const fs = require("fs");
const path = require("path");

const analyzer = require(path.resolve(__dirname, "../../../scripts/analyzeTelemetry.js"));

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseCsv(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
    const split = (line) => {
        const out = []; let cur = ""; let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (q && line[i + 1] === '"') { cur += '"'; i++; } // "" trong ô được trích dẫn = 1 dấu "
                else q = !q;
            }
            else if (ch === "," && !q) { out.push(cur); cur = ""; }
            else cur += ch;
        }
        out.push(cur);
        return out.map((s) => s.trim());
    };
    const head = split(lines[0]);
    return lines.slice(1).map((l) => {
        const c = split(l); const o = {};
        head.forEach((h, i) => { o[h] = c[i] === undefined ? "" : c[i]; });
        return o;
    });
}

// Tên cột của results.csv chuẩn (đồng bộ với results_template.csv và record_result.js)
const RESULT_COLUMNS = ["id", "shown_key", "shown_bpm", "session", "t_lock_s", "level_ok", "notes"];
function csvHeader(text) {
    const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim().length) || "";
    return first.split(",").map((x) => x.replace(/^"|"$/g, "").trim());
}

// "F# minor" / "F♯ Minor" / "Gb major" / "Am" -> { pc, mode } hoặc null
function normKey(s) {
    if (!s) return null;
    const t = String(s).trim().replace(/♯/g, "#").replace(/♭/g, "b");
    const m = t.match(/^([A-Ga-g])([#b]?)\s*(major|minor|maj|min|m)?$/i);
    if (!m) return null;
    let pc = NOTE_PC[m[1].toUpperCase()];
    if (m[2] === "#") pc += 1; else if (m[2] === "b") pc -= 1;
    pc = ((pc % 12) + 12) % 12;
    const w = (m[3] || "major").toLowerCase();
    const mode = (w === "minor" || w === "min" || (w === "m" && m[3] === "m")) ? "minor" : "major";
    return { pc, mode };
}

function sameKey(a, b) { return a && b && a.pc === b.pc && a.mode === b.mode; }

function classifyKey(shown, truth, altList) {
    const s = normKey(shown), t = normKey(truth);
    if (!s) return "NO_RESULT";
    if (!t) return "NO_TRUTH";
    if (sameKey(s, t)) return "EXACT";
    for (const a of altList) if (sameKey(s, normKey(a))) return "ALT_ACCEPTED";
    if (s.mode !== t.mode) {
        const rel = t.mode === "minor" ? (t.pc + 3) % 12 : (t.pc + 9) % 12;
        if (s.pc === rel) return "RELATIVE";
        if (s.pc === t.pc) return "PARALLEL";
    } else {
        const d = (s.pc - t.pc + 12) % 12;
        if (d === 7 || d === 5) return "FIFTH";
    }
    return "WRONG";
}

function classifyBpm(shown, truth, alt) {
    const s = parseFloat(shown);
    if (!Number.isFinite(s)) return "NO_RESULT";
    const cands = [truth, alt].map(parseFloat).filter(Number.isFinite);
    if (!cands.length) return "NO_TRUTH";
    const tol = 2;
    for (const c of cands) if (Math.abs(s - c) <= tol) return "OK";
    for (const c of cands) {
        if (Math.abs(s - c / 2) <= tol) return "HALF";
        if (Math.abs(s - c * 2) <= tol) return "DOUBLE";
    }
    return "WRONG";
}

function sessionsFromLog(file) {
    const recs = [];
    for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
        if (!line.trim()) continue;
        try { recs.push(JSON.parse(line)); } catch (e) { /* bỏ dòng hỏng */ }
    }
    return analyzer.groupIntoSessions(recs).map((s, i) => {
        const a = analyzer.analyzeSession(s);
        const locks = a.lockRecords;
        const normal = a.normal;
        const zero = normal.filter((r) => r.confidence === 0).length;
        return {
            index: i + 1,
            records: s.records.length,
            normalCount: normal.length,
            zeroConfRatio: normal.length ? zero / normal.length : null,
            firstLockKey: locks[0] ? locks[0].key : null,
            firstLockTime: locks[0] ? locks[0].time : null,
            finalLockKey: locks.length ? locks[locks.length - 1].key : null,
            lockCount: locks.length
        };
    });
}

function median(a) { return a.length ? analyzer.median(a) : null; }
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + "% (" + n + "/" + d + ")" : "N/A");

function score(truthRows, resultRows, sessions) {
    const byId = new Map(resultRows.map((r) => [r.id, r]));
    const rows = [];
    for (const t of truthRows) {
        const r = byId.get(t.id) || {};
        const sess = r.session && sessions ? sessions.find((x) => x.index === parseInt(r.session, 10)) : null;
        const alts = (t.key_alt || "").split(";").map((x) => x.trim()).filter(Boolean);

        let shownKey = r.shown_key || "";
        let keySrc = "nguoi dung";
        if (!shownKey && sess && sess.finalLockKey) { shownKey = sess.finalLockKey; keySrc = "log (LOCK cuoi)"; }

        let tLock = parseFloat(r.t_lock_s);
        if (!Number.isFinite(tLock) && sess && sess.firstLockTime != null) tLock = sess.firstLockTime;
        if (!Number.isFinite(tLock)) tLock = null;

        // Hàng không có bất kỳ dữ liệu nào (kể cả ghi chú/session) = CHƯA KIỂM THỬ, không phải "sai"
        const untested = RESULT_COLUMNS.slice(1).every((c) => !String(r[c] || "").trim());
        if (untested) {
            rows.push({ t, shownKey: "", keySrc: "", shown_bpm: "", keyClass: "UNTESTED", bpmClass: "UNTESTED", tLock: null, cause: "CHUA_KIEM_THU", quiet: false, hasResult: false, untested: true });
            continue;
        }

        const keyClass = t.key ? classifyKey(shownKey, t.key, alts) : "NO_TRUTH";
        const bpmClass = t.bpm ? classifyBpm(r.shown_bpm, t.bpm, t.bpm_alt) : "NO_TRUTH";

        // Nguyên nhân (tách riêng): nguồn quá nhỏ / không đủ dữ liệu / sai Key
        let cause = "";
        const quiet = (r.level_ok || "").toLowerCase() === "no" || (sess && sess.lockCount === 0 && sess.zeroConfRatio !== null && sess.zeroConfRatio >= 0.9);
        if (keyClass === "NO_RESULT") cause = quiet ? "NGUON_AM_QUA_NHO" : "KHONG_DU_DU_LIEU";
        else if (keyClass === "WRONG" || keyClass === "FIFTH" || keyClass === "PARALLEL") cause = "SAI_KEY";
        if (bpmClass === "HALF" || bpmClass === "DOUBLE") cause = cause ? cause + "+BPM_" + bpmClass : "BPM_" + bpmClass;
        else if (bpmClass === "WRONG") cause = cause ? cause + "+SAI_BPM" : "SAI_BPM";

        rows.push({ t, shownKey, keySrc, shown_bpm: r.shown_bpm || "", keyClass, bpmClass, tLock, cause, quiet: !!quiet, hasResult: !!(shownKey || r.shown_bpm), untested: false });
    }
    return rows;
}

function summarize(rows) {
    const done = rows.filter((x) => !x.untested);
    const k = done.filter((x) => x.keyClass !== "NO_TRUTH");
    const b = done.filter((x) => x.bpmClass !== "NO_TRUTH");
    const count = (arr, f, v) => arr.filter((x) => x[f] === v).length;
    const kAnswered = k.filter((x) => x.keyClass !== "NO_RESULT");
    const bAnswered = b.filter((x) => x.bpmClass !== "NO_RESULT");
    return {
        songs: rows.length, tested: done.length, untested: rows.length - done.length,
        keyTotal: k.length, keyAnswered: kAnswered.length,
        keyExact: count(k, "keyClass", "EXACT"),
        keyExactAlt: count(k, "keyClass", "EXACT") + count(k, "keyClass", "ALT_ACCEPTED"),
        keyExactAltRel: count(k, "keyClass", "EXACT") + count(k, "keyClass", "ALT_ACCEPTED") + count(k, "keyClass", "RELATIVE"),
        bpmTotal: b.length, bpmAnswered: bAnswered.length,
        bpmOk: count(b, "bpmClass", "OK"), bpmHalf: count(b, "bpmClass", "HALF"), bpmDouble: count(b, "bpmClass", "DOUBLE"), bpmWrong: count(b, "bpmClass", "WRONG"),
        lockMedian: median(done.map((x) => x.tLock).filter((v) => v !== null)),
        lockCount: done.filter((x) => x.tLock !== null).length,
        quiet: rows.filter((x) => x.cause.startsWith("NGUON_AM_QUA_NHO")).length,
        insufficient: rows.filter((x) => x.cause.startsWith("KHONG_DU_DU_LIEU")).length
    };
}

function report(rows, sum) {
    const L = [];
    L.push("# Kết quả chấm AI-RUNTIME-VERIFY-01", "");
    L.push("| ID | Bài | Key đáp án | Key hiển thị | Phân loại Key | BPM đáp án | BPM hiển thị | Phân loại BPM | Tới LOCK (s) | Nguyên nhân |", "|---|---|---|---|---|---|---|---|--:|---|");
    for (const x of rows) {
        L.push(`| ${x.t.id} | ${x.t.title} | ${x.t.key || "—"} | ${x.shownKey || "—"} | ${x.keyClass} | ${x.t.bpm || "—"}${x.t.bpm_alt ? "/" + x.t.bpm_alt : ""} | ${x.shown_bpm || "—"} | ${x.bpmClass} | ${x.tLock === null ? "—" : x.tLock} | ${x.cause || ""} |`);
    }
    L.push("", "## Tổng hợp", "");
    L.push(`- Đã kiểm thử: ${sum.tested}/${sum.songs} bài; chưa kiểm thử: ${sum.untested} bài (không tính vào tỉ lệ bên dưới)`);
    L.push(`- Key đúng tuyệt đối: ${pct(sum.keyExact, sum.keyTotal)}`);
    L.push(`- Key đúng + chấp nhận thang âm tương đương (ALT): ${pct(sum.keyExactAlt, sum.keyTotal)}`);
    L.push(`- Key đúng + ALT + tương đối trưởng/thứ (báo riêng): ${pct(sum.keyExactAltRel, sum.keyTotal)}`);
    L.push(`- BPM đúng (±2): ${pct(sum.bpmOk, sum.bpmTotal)}; nửa nhịp: ${sum.bpmHalf}; gấp đôi nhịp: ${sum.bpmDouble}; sai khác: ${sum.bpmWrong}`);
    L.push(`- Thời gian tới LOCK đầu tiên (trung vị): ${sum.lockMedian === null ? "N/A" : sum.lockMedian + " s"} (n=${sum.lockCount})`);
    L.push(`- Không đủ dữ liệu: ${sum.insufficient} bài; nguồn âm quá nhỏ: ${sum.quiet} bài`);
    const bad = rows.filter((x) => x.cause && !x.untested);
    L.push("", "## Ca sai / thiếu", "");
    if (!bad.length) L.push("Không có.");
    for (const x of bad) L.push(`- ${x.t.id} ${x.t.title}: ${x.cause} (Key ${x.shownKey || "—"} vs ${x.t.key || "—"}; BPM ${x.shown_bpm || "—"} vs ${x.t.bpm || "—"})`);
    return L.join("\n");
}

function main(argv) {
    const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
    if (arg("--list-sessions")) {
        const ss = sessionsFromLog(arg("--list-sessions"));
        console.log("session | records | lock# | first LOCK key @ s | final LOCK key | %conf=0");
        for (const s of ss) console.log(`${s.index} | ${s.records} | ${s.lockCount} | ${s.firstLockKey || "-"} @ ${s.firstLockTime === null ? "-" : s.firstLockTime} | ${s.finalLockKey || "-"} | ${s.zeroConfRatio === null ? "-" : Math.round(s.zeroConfRatio * 100) + "%"}`);
        return 0;
    }
    const truthFile = arg("--truth"), resFile = arg("--results");
    if (!truthFile || !resFile) { console.error("Thiếu --truth hoặc --results (xem đầu file)."); return 2; }
    const sessions = arg("--log") ? sessionsFromLog(arg("--log")) : null;
    const resText = fs.readFileSync(resFile, "utf-8");
    const head = csvHeader(resText);
    const miss = RESULT_COLUMNS.filter((c) => !head.includes(c));
    if (miss.length) {
        console.error("File kết quả sai định dạng: thiếu cột " + miss.join(", ") + ".\n" +
            "Cột hiện có: " + head.join(" | ") + "\n" +
            "Dùng file chuẩn tests/calibration/runtime-verify/results.csv (xem README-GHI-KET-QUA.md). " +
            "Nếu là file cũ (cột tiếng Việt) thì chuyển bằng: node record_result.js import-legacy <file>");
        return 3;
    }
    const rows = score(parseCsv(fs.readFileSync(truthFile, "utf-8")), parseCsv(resText), sessions);
    const md = report(rows, summarize(rows));
    if (arg("--out")) fs.writeFileSync(arg("--out"), md, "utf-8"); else console.log(md);
    return 0;
}

module.exports = { RESULT_COLUMNS, csvHeader, parseCsv, normKey, classifyKey, classifyBpm, sessionsFromLog, score, summarize, report };
if (require.main === module) process.exit(main(process.argv.slice(2)));
