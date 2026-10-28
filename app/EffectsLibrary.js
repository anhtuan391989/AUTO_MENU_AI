"use strict";

/* ==========================================================
   EFFECTS LIBRARY — danh sách hiệu ứng/nhạc của "Bảng Hiệu Ứng Độc Lập".

   - Nguồn mặc định (seed): ui/assets/effects/EffectsData.json + các file mp3 đi kèm.
   - Bản người dùng chỉnh (đổi tên / thay file / thêm / xoá / chuyển tab) lưu ở
     <userData>/effects-library.json; file mp3 người dùng chọn được SAO CHÉP vào
     <userData>/effects-sounds/ để không mất khi file gốc bị xoá/di chuyển.
   - Module thuần Node (fs/path truyền vào) để test được bằng thư mục tạm.
   - Mỗi mục: { id, group: "HIEUUNG" | "NHAC", name, file }.
       file tương đối  -> nằm trong thư mục bundled (ui/assets/effects)
       file tuyệt đối  -> file người dùng đã sao chép vào userDir/effects-sounds
   ========================================================== */

const GROUPS = Object.freeze(["HIEUUNG", "NHAC"]);
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a)$/i;
const MAX_NAME = 40;

function createEffectsLibrary({ fs, path, pathToFileURL, bundledDir, userDir }) {
    const libFile = path.join(userDir, "effects-library.json");
    const soundsDir = path.join(userDir, "effects-sounds");
    let items = null;
    let counter = 0;

    function readSeed() {
        const raw = fs.readFileSync(path.join(bundledDir, "EffectsData.json"), "utf-8");
        const data = JSON.parse(raw.replace(/^\uFEFF/, ""));
        return sanitizeList(data && data.items);
    }

    function sanitizeList(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const out = [];
        for (const it of list) {
            if (!it || typeof it.id !== "string" || typeof it.file !== "string") continue;
            if (!GROUPS.includes(it.group)) continue;
            if (seen.has(it.id)) continue;
            const name = cleanName(it.name);
            if (!name) continue;
            seen.add(it.id);
            out.push({ id: it.id, group: it.group, name, file: it.file });
        }
        return out;
    }

    function cleanName(name) {
        if (typeof name !== "string") return "";
        return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    }

    function save() {
        fs.mkdirSync(userDir, { recursive: true });
        const tmp = libFile + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1), "utf-8");
        fs.renameSync(tmp, libFile);
    }

    function load() {
        if (items) return items;
        try {
            if (fs.existsSync(libFile)) {
                const data = JSON.parse(fs.readFileSync(libFile, "utf-8"));
                const list = sanitizeList(data && data.items);
                if (list.length > 0 || (data && Array.isArray(data.items) && data.items.length === 0)) {
                    items = list;
                    return items;
                }
            }
        } catch (err) {
            console.error("effects-library đọc lỗi (dùng bản mặc định):", err);
        }
        try {
            items = readSeed();
        } catch (err) {
            console.error("effects-library seed lỗi:", err);
            items = [];
        }
        return items;
    }

    function absolutePath(item) {
        return path.isAbsolute(item.file) ? item.file : path.join(bundledDir, item.file);
    }

    // Danh sách gửi cho giao diện: có src (file://) và exists (file còn tồn tại thật).
    function list() {
        return load().map((it) => {
            const abs = absolutePath(it);
            let exists = false;
            try { exists = fs.existsSync(abs); } catch { exists = false; }
            return { id: it.id, group: it.group, name: it.name, src: pathToFileURL(abs).href, exists };
        });
    }

    function find(id) {
        return load().find((it) => it.id === id) || null;
    }

    function newId() {
        counter += 1;
        return "u" + Date.now().toString(36) + counter.toString(36);
    }

    function copyIn(srcPath) {
        if (typeof srcPath !== "string" || !path.isAbsolute(srcPath) || !AUDIO_EXT.test(srcPath)) {
            throw new Error("File âm thanh không hợp lệ (chỉ nhận mp3, wav, ogg, m4a).");
        }
        if (!fs.existsSync(srcPath)) throw new Error("Không tìm thấy file đã chọn.");
        fs.mkdirSync(soundsDir, { recursive: true });
        const ext = path.extname(srcPath).toLowerCase();
        const dest = path.join(soundsDir, newId() + ext);
        fs.copyFileSync(srcPath, dest);
        return dest;
    }

    function fail(error) { return { ok: false, error }; }

    function rename(id, name) {
        const it = find(id);
        if (!it) return fail("Không tìm thấy hiệu ứng.");
        const n = cleanName(name);
        if (!n) return fail("Tên không được để trống.");
        it.name = n;
        save();
        return { ok: true };
    }

    function move(id, group) {
        const it = find(id);
        if (!it) return fail("Không tìm thấy hiệu ứng.");
        if (!GROUPS.includes(group)) return fail("Nhóm không hợp lệ.");
        it.group = group;
        save();
        return { ok: true };
    }

    function replaceFile(id, srcPath) {
        const it = find(id);
        if (!it) return fail("Không tìm thấy hiệu ứng.");
        let dest;
        try { dest = copyIn(srcPath); } catch (err) { return fail(err.message); }
        const old = it.file;
        it.file = dest;
        save();
        removeOwnedFile(old);
        return { ok: true };
    }

    function add(group, name, srcPath) {
        if (!GROUPS.includes(group)) return fail("Nhóm không hợp lệ.");
        const n = cleanName(name);
        if (!n) return fail("Tên không được để trống.");
        let dest;
        try { dest = copyIn(srcPath); } catch (err) { return fail(err.message); }
        load().push({ id: newId(), group, name: n, file: dest });
        save();
        return { ok: true };
    }

    // Chỉ xoá file nằm trong soundsDir (file người dùng đã sao chép); không bao giờ xoá file bundled.
    function removeOwnedFile(file) {
        try {
            if (path.isAbsolute(file) && path.dirname(file) === soundsDir && fs.existsSync(file)) fs.unlinkSync(file);
        } catch (err) { console.error("effects-library xoá file lỗi:", err); }
    }

    function remove(id) {
        const arr = load();
        const idx = arr.findIndex((it) => it.id === id);
        if (idx < 0) return fail("Không tìm thấy hiệu ứng.");
        const [gone] = arr.splice(idx, 1);
        save();
        removeOwnedFile(gone.file);
        return { ok: true };
    }

    function reset() {
        try {
            items = readSeed();
            save();
            return { ok: true };
        } catch (err) {
            return fail("Không khôi phục được danh sách mặc định: " + err.message);
        }
    }

    return { list, find, rename, move, replaceFile, add, remove, reset, GROUPS, AUDIO_EXT };
}

module.exports = { createEffectsLibrary, GROUPS, AUDIO_EXT };
