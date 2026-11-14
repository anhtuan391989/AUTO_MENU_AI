const fs = require("fs");
const SongDatabase = require("./SongDatabase");
const SongCollectorState = require("./SongCollectorState");
const SongMatcher = require("./SongMatcher");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SongDbAdmin (DB-SETUP-01)
 * ----------------------------------------------------------
 * Các thao tác quản trị cho thẻ Setup > Database: thống kê, nhập, xuất,
 * dựng lại (dọn dữ liệu), xoá bộ nhớ đệm. KHÔNG sửa SongDatabase/SongMatcher —
 * chỉ gọi load()/save() có sẵn. Không dialog/IPC ở đây (việc của app/main.js)
 * để test được bằng Node thuần. Mọi hàm nhận `db` (mặc định SongDatabase thật).
 * ==========================================================
 */

const norm = (v) => String(v || "").trim().toLowerCase();
const keyOf = (s) => norm(s.title) + "|" + norm(s.artist);
// Khoá chống trùng khi NHẬP: bỏ dấu nữa, để "Đêm Trắng" và "dem trang" (cùng ca sĩ) không thành 2 bản ghi.
// Chỉ dùng cho importSongs (chỉ bỏ qua, không xoá gì); rebuild vẫn dùng keyOf cũ vì rebuild XOÁ bản ghi.
const foldKeyOf = (s) => SongMatcher.fold(s.title) + "|" + SongMatcher.fold(s.artist);

// Chuẩn hoá 1 bản ghi đúng định dạng SongDatabase; null nếu không hợp lệ (thiếu title / không phải object).
function cleanEntry(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return null;
    const title = String(s.title || "").trim();
    if (!title) return null;
    const bpm = Number(s.bpm);
    return {
        ...s,
        title,
        artist: String(s.artist || "").trim(),
        key: String(s.key || "").trim(),
        bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
        modulation: s.modulation || null,
        notes: String(s.notes || "")
    };
}

function stats(db = SongDatabase, state = SongCollectorState) {
    try {
        const songs = db.load();
        const artists = new Set();
        const keyCount = new Map();
        let withKey = 0, withBpm = 0, bpmSum = 0, bpmMin = null, bpmMax = null;
        for (const s of songs) {
            const a = norm(s && s.artist);
            if (a) artists.add(a);
            const k = String((s && s.key) || "").trim();
            if (k) { withKey++; keyCount.set(k, (keyCount.get(k) || 0) + 1); }
            const b = Number(s && s.bpm);
            if (Number.isFinite(b) && b > 0) {
                withBpm++; bpmSum += b;
                bpmMin = bpmMin === null ? b : Math.min(bpmMin, b);
                bpmMax = bpmMax === null ? b : Math.max(bpmMax, b);
            }
        }
        const topKeys = [...keyCount.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3).map(([key, n]) => ({ key, count: n }));
        let fileBytes = null;
        try { fileBytes = fs.statSync(db.filePath).size; } catch (e) { /* chưa có file: bỏ qua */ }
        return {
            ok: true, count: songs.length, artists: artists.size, withKey, withBpm,
            bpmAvg: withBpm ? Math.round((bpmSum / withBpm) * 10) / 10 : null, bpmMin, bpmMax,
            topKeys, cache: state.size, fileBytes
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// Nhập: chỉ THÊM bài mới (bỏ qua trùng title+artist và bản ghi sai) — không ghi đè dữ liệu đang có.
function importSongs(list, db = SongDatabase) {
    if (!Array.isArray(list)) return { ok: false, error: "File phải chứa một mảng (danh sách) bài hát." };
    let existing;
    try { existing = db.load(); } catch (err) { return { ok: false, error: err.message }; }
    const seen = new Set(existing.map(foldKeyOf));
    const merged = existing.slice();
    let added = 0, duplicates = 0, invalid = 0;
    for (const raw of list) {
        const e = cleanEntry(raw);
        if (!e) { invalid++; continue; }
        const k = foldKeyOf(e);
        if (seen.has(k)) { duplicates++; continue; }
        seen.add(k); merged.push(e); added++;
    }
    if (added > 0) db.save(merged);
    return { ok: true, added, duplicates, invalid, total: merged.length };
}

function exportSongs(file, db = SongDatabase) {
    try {
        const songs = db.load();
        fs.writeFileSync(file, JSON.stringify(songs, null, 4) + "\n", "utf-8");
        return { ok: true, count: songs.length, file };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// Dựng lại: bỏ bản ghi sai/trùng, chuẩn hoá trường; có file .bak trước khi ghi; xoá luôn bộ nhớ đệm.
// File hỏng (không phải JSON) -> báo lỗi và KHÔNG đụng vào file.
function rebuild(db = SongDatabase, state = SongCollectorState) {
    let songs;
    try { songs = db.load(); } catch (err) { return { ok: false, error: err.message }; }
    const seen = new Set();
    const out = [];
    let invalid = 0, duplicates = 0;
    for (const raw of songs) {
        const e = cleanEntry(raw);
        if (!e) { invalid++; continue; }
        const k = keyOf(e);
        if (seen.has(k)) { duplicates++; continue; }
        seen.add(k); out.push(e);
    }
    const changed = JSON.stringify(out) !== JSON.stringify(songs);
    if (changed) {
        try { fs.copyFileSync(db.filePath, db.filePath + ".bak"); } catch (e) { /* chưa có file để sao lưu */ }
        db.save(out);
    }
    state.clear();
    return { ok: true, before: songs.length, after: out.length, invalid, duplicates, changed };
}

function clearCache(state = SongCollectorState) {
    const cleared = state.size;
    state.clear();
    return { ok: true, cleared };
}

module.exports = { stats, importSongs, exportSongs, rebuild, clearCache, cleanEntry };
