"use strict";

// Thư viện hiệu ứng (Bảng Hiệu Ứng nhiều nút + mục "Hiệu Ứng" trong Cài đặt).
// Chạy: node tests/unit/EffectsLibrary.verify.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");
let pass = 0;
let fail = 0;
function check(cond, name) { if (cond) pass++; else { fail++; console.log("FAIL:", name); } }

const { createEffectsLibrary } = require(path.join(root, "app", "EffectsLibrary.js"));
const bundledDir = path.join(root, "ui", "assets", "effects");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fxlib-"));
const mk = () => createEffectsLibrary({ fs, path, pathToFileURL, bundledDir, userDir: tmp });

// ---- Seed mặc định ----
let lib = mk();
let items = lib.list();
check(items.length === 42, "seed có 42 hiệu ứng");
check(items.filter((i) => i.group === "HIEUUNG").length === 21 && items.filter((i) => i.group === "NHAC").length === 21, "mỗi tab 21 nút");
check(items.every((i) => i.exists), "mọi file mp3 của seed đều tồn tại");
check(items.every((i) => i.src.startsWith("file:///")), "src là đường dẫn file://");
check(new Set(items.map((i) => i.id)).size === 42, "id không trùng");

// ---- Đổi tên / chuyển nhóm / validate ----
const first = items[0];
check(lib.rename(first.id, "  Tên   mới  ").ok && lib.list()[0].name === "Tên mới", "đổi tên (gọn khoảng trắng)");
check(!lib.rename(first.id, "   ").ok, "tên rỗng bị từ chối");
check(lib.rename(first.id, "x".repeat(100)).ok && lib.list()[0].name.length === 40, "tên dài bị cắt còn 40 ký tự");
check(lib.move(first.id, "NHAC").ok && lib.list()[0].group === "NHAC", "chuyển sang tab NHẠC");
check(!lib.move(first.id, "KHAC").ok, "nhóm lạ bị từ chối");
check(!lib.rename("khong-co", "a").ok && !lib.remove("khong-co").ok, "id không tồn tại bị từ chối");

// ---- Lưu bền: dựng lại vẫn thấy thay đổi ----
check(mk().list()[0].name.length === 40 && mk().list()[0].group === "NHAC", "thay đổi còn sau khi khởi động lại");

// ---- Thêm / thay file (sao chép vào userDir) ----
const mp3 = path.join(tmp, "nguon.mp3");
fs.writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x00]));
const txt = path.join(tmp, "x.txt");
fs.writeFileSync(txt, "hi");
check(!lib.add("NHAC", "Sai", txt).ok, "file không phải âm thanh bị từ chối");
check(!lib.add("NHAC", "Sai", path.join(tmp, "khong-co.mp3")).ok, "file không tồn tại bị từ chối");
check(!lib.add("SAI", "Sai", mp3).ok, "nhóm sai khi thêm bị từ chối");
check(lib.add("HIEUUNG", "Của tôi", mp3).ok && lib.list().length === 43, "thêm nút mới");
const mine = lib.list().find((i) => i.name === "Của tôi");
check(mine && mine.exists && mine.src.includes("effects-sounds"), "file được sao chép vào effects-sounds");
fs.unlinkSync(mp3);
check(lib.list().find((i) => i.id === mine.id).exists, "xoá file gốc không làm mất nút (đã sao chép)");

const mp3b = path.join(tmp, "nguon2.wav");
fs.writeFileSync(mp3b, Buffer.from([1, 2, 3, 4]));
const oldFile = lib.find(mine.id).file;
check(lib.replaceFile(mine.id, mp3b).ok && lib.find(mine.id).file !== oldFile, "thay file cho nút");
check(!fs.existsSync(oldFile), "file cũ do người dùng thêm bị dọn khi thay");

// ---- Xoá: không bao giờ xoá file bundled ----
const bundledFile = path.join(bundledDir, lib.find(items[1].id).file);
check(lib.remove(items[1].id).ok && fs.existsSync(bundledFile), "xoá nút seed không xoá file mp3 trong ui/assets");
const mineFile = lib.find(mine.id).file;
check(lib.remove(mine.id).ok && !fs.existsSync(mineFile), "xoá nút do người dùng thêm thì dọn file đã sao chép");

// ---- Khôi phục mặc định ----
check(lib.reset().ok && lib.list().length === 42, "khôi phục mặc định về 42 nút");

// ---- File lưu hỏng -> rơi về mặc định, không văng lỗi ----
fs.writeFileSync(path.join(tmp, "effects-library.json"), "{hong");
check(mk().list().length === 42, "file lưu hỏng -> dùng bản mặc định");

// ---- main.js / preload.js / setup.html nối đúng ----
const main = read("app/main.js");
check(/ipcMain\.handle\("effects-lib-op"[\s\S]*event\.sender !== setupWin\.webContents/.test(main), "main: chỉ cửa sổ Cài đặt được sửa danh sách");
check(/ipcMain\.on\("effects-lib-play"[\s\S]*isFromEffects\(event\.sender\)[\s\S]*effectsLibrary\.find\(id\)/.test(main), "main: chỉ bảng hiệu ứng được phát, id phải có trong thư viện");
check(/ipcMain\.on\("effects-lib-stop"[\s\S]*isFromEffects/.test(main), "main: Dừng chỉ nhận từ bảng hiệu ứng");
check(/ipcMain\.on\("effects-open-editor"[\s\S]*isFromEffects[\s\S]*panel-effects/.test(main), "main: EDIT mở Cài đặt tới mục Hiệu Ứng");
const preload = read("app/preload.js");
["getEffectsLibrary", "effectsLibraryOp", "playLibEffect", "stopLibEffects", "openEffectsEditor", "onEffectsLibChanged", "onEffectsLibPlay", "onEffectsLibStop", "onSetupGotoPanel"]
    .forEach((n) => check(preload.includes(n + ":"), "preload: " + n));
const setup = read("ui/setup.html");
check(setup.includes('data-panel="panel-effects"') && setup.includes('id="panel-effects"') && setup.includes("js/setupEffects.js"), "setup.html: có nav + panel + script Hiệu Ứng");

// ---- SoundEffectEngine.loadLibrary với Audio giả ----
const renderer = read("ui/js/renderer.js");
const start = renderer.indexOf("const SoundEffectEngine = (() => {");
const end = renderer.indexOf("\n})();", start);
const made = [];
class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.handlers = {}; this.plays = 0; this.paused = 0; this.sink = ""; made.push(this); }
    addEventListener(ev, cb) { this.handlers[ev] = cb; }
    play() { this.plays++; return Promise.resolve(); }
    pause() { this.paused++; }
    removeAttribute() { this.src = ""; }
    load() {}
    setSinkId(id) { this.sink = id; return Promise.resolve(); }
}
const sb = { Audio: FakeAudio, console };
vm.createContext(sb);
vm.runInContext(renderer.slice(start, end + 5).replace("const SoundEffectEngine", "var SoundEffectEngine"), sb);
const eng = sb.SoundEffectEngine;
const events = [];
eng.onChange((id, playing) => events.push([id, playing]));
check(made.length === 2, "chưa nạp thư viện: vẫn chỉ CLAP và LAUGH");
eng.setVolume("ALL", 70);
eng.loadLibrary([{ id: "a", src: "file:///a.mp3" }, { id: "b", src: "file:///b.mp3" }]);
check(made.length === 4, "nạp thư viện: thêm 2 audio");
check(made.slice(2).every((a) => Math.abs(a.volume - 0.7) < 1e-9), "hiệu ứng thêm sau dùng đúng âm lượng chung (70)");
check(eng.toggle("LIB:a") === true && made[2].plays === 1, "bấm nút thư viện -> phát");
check(eng.toggle("LIB:a") === false, "bấm lần nữa -> dừng");
eng.toggle("LIB:a"); eng.toggle("LIB:b");
eng.stopAll();
check(!eng.isPlaying("LIB:a") && !eng.isPlaying("LIB:b"), "Dừng: tắt mọi hiệu ứng thư viện");
eng.toggle("CLAP");
eng.stopAll();
check(eng.isPlaying("CLAP"), "Dừng của bảng không tắt nút CLAP của menu");
// Chạy hiệu ứng khác -> tắt hiệu ứng đang chạy (đúng như listener trong renderer.js)
eng.toggle("LIB:a");
eng.stopAll("LIB:b"); eng.toggle("LIB:b");
check(!eng.isPlaying("LIB:a") && eng.isPlaying("LIB:b"), "bấm hiệu ứng khác: cái cũ tắt ngay, cái mới chạy");
eng.stopAll("LIB:b"); eng.toggle("LIB:b");
check(!eng.isPlaying("LIB:b"), "bấm lại đúng nút đang chạy: dừng");
check(eng.isPlaying("CLAP"), "đổi hiệu ứng trong bảng không tắt nút CLAP của menu");
check(/stopAll\("LIB:" \+ id\);\s*SoundEffectEngine\.toggle\("LIB:" \+ id\)/.test(renderer), "renderer: listener tắt hiệu ứng cũ trước khi phát mới");
eng.toggle("CLAP");
eng.toggle("LIB:b");
eng.loadLibrary([{ id: "b", src: "file:///b2.mp3" }, { id: "c", src: "file:///c.mp3" }]);
check(!eng.isPlaying("LIB:b"), "đổi file của nút đang phát -> dừng và tạo lại");
check(eng.toggle("LIB:a") === false && !eng.isPlaying("LIB:a"), "nút đã bị xoá không còn phát được");
eng.loadLibrary([]);
check(made.length >= 6 && eng.toggle("CLAP") === true, "xoá hết thư viện không ảnh hưởng CLAP");

console.log(`\nEffectsLibrary: ${pass} đạt, ${fail} lỗi`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* bỏ qua */ }
process.exit(fail === 0 ? 0 : 1);
