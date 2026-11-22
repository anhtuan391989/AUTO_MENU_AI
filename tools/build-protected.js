"use strict";
// EXE-PROTECT-06 (Đợt 2) — Build bản cài với code lõi đã LÀM RỐI (obfuscate). Chạy trên máy Khói, KHÔNG đóng gói vào bản cài.
//
// Cách làm: KHÔNG sửa mã nguồn thật. Công cụ chép dự án sang thư mục tạm, làm rối file .js của app/ và core/ trong bản chép,
// rồi build .exe từ bản chép đó (kết quả vẫn nằm ở  <dự án>\dist ). Mã nguồn trong G:\AUTO_MENU_AI giữ nguyên nên auto-sync an toàn.
//
// Cách dùng: bấm đúp  tools\build-protected.bat   (hoặc: node tools/build-protected.js)
// Tuỳ chọn:  --release     build + đẩy lên GitHub Releases (như  npm run release)
//            --stage-only  chỉ tạo bản chép đã làm rối, không build .exe (để kiểm tra)
//            --stage <thư mục>  chỉ định thư mục tạm   --with-tests  chép cả tests/ vào bản chép (để kiểm thử)

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// Không làm rối: preload (cầu nối giao diện), file nén sẵn, file thư viện bên thứ ba.
const SKIP_FILE = /(^|[\\/])preload\.js$|\.min\.js$/;
const COPY_DIRS = ["app", "core", "ui", "ahk"];
const COPY_FILES = ["package.json", "package-lock.json", "docs/d1/midi-mapping.xml", "docs/d1/midi-mapping.xsd", "docs/d1/semanticValidate.js"];
const COPY_SKIP = /\.(zip|rar|patch|md|pyc)$|__pycache__/i;

// Cấu hình AN TOÀN cho Electron (main process): không đổi tên thuộc tính/khoá đối tượng (IPC, JSON, tên kênh), không làm phẳng luồng điều khiển (chậm).
const OBF_OPTIONS = {
    compact: true, simplify: true, target: "node", sourceMap: false,
    identifierNamesGenerator: "hexadecimal", renameGlobals: true, renameProperties: false, transformObjectKeys: false,
    stringArray: true, stringArrayThreshold: 1, stringArrayEncoding: ["base64"], stringArrayRotate: true, stringArrayShuffle: true,
    controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
    disableConsoleOutput: false, numbersToExpressions: false, splitStrings: false, unicodeEscapeSequence: false,
};

function loadObfuscator(root) {
    try { return require(require.resolve("javascript-obfuscator", { paths: [root || ROOT, ROOT] })); } catch (e) { return null; }
}

function copyTree(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (COPY_SKIP.test(e.name)) continue;
        if (e.isDirectory()) copyTree(s, d);
        else if (e.isFile()) fs.copyFileSync(s, d);
    }
}

function listJs(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) listJs(p, out);
        else if (e.isFile() && p.endsWith(".js") && !SKIP_FILE.test(p)) out.push(p);
    }
    return out;
}

// Làm rối 1 file; kiểm tra cú pháp kết quả; lỗi thì BÁO (không âm thầm bỏ qua).
function obfuscateFile(Obf, file) {
    const src = fs.readFileSync(file, "utf8");
    const code = src.replace(/^#!.*\r?\n/, "");
    const out = Obf.obfuscate(code, OBF_OPTIONS).getObfuscatedCode();
    new vm.Script(out, { filename: file }); // ném lỗi nếu kết quả sai cú pháp
    fs.writeFileSync(file, out, "utf8");
    return { before: src.length, after: out.length };
}

function makeStage(stage, opts) {
    const o = opts || {};
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    for (const d of COPY_DIRS.concat(o.withTests ? ["tests", "data", "docs"] : [])) if (fs.existsSync(path.join(ROOT, d))) copyTree(path.join(ROOT, d), path.join(stage, d));
    for (const f of COPY_FILES) {
        const s = path.join(ROOT, f);
        if (!fs.existsSync(s)) continue;
        fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
        fs.copyFileSync(s, path.join(stage, f));
    }
    const nm = path.join(ROOT, "node_modules");
    if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(stage, "node_modules"), "junction"); // dùng chung thư viện, không chép
}

function obfuscateStage(stage, Obf, log) {
    const files = [];
    for (const d of ["app", "core"]) listJs(path.join(stage, d), files);
    let b = 0, a = 0;
    for (const f of files) {
        try { const r = obfuscateFile(Obf, f); b += r.before; a += r.after; }
        catch (e) { throw new Error("Làm rối thất bại ở file " + path.relative(stage, f) + ": " + (e && e.message)); }
    }
    if (log) log(`Đã làm rối ${files.length} file (${Math.round(b / 1024)} KB -> ${Math.round(a / 1024)} KB).`);
    return files.length;
}

function main(argv) {
    const release = argv.includes("--release"), stageOnly = argv.includes("--stage-only"), withTests = argv.includes("--with-tests");
    const si = argv.indexOf("--stage");
    const stage = si >= 0 && argv[si + 1] ? path.resolve(argv[si + 1]) : path.join(os.tmpdir(), "automenu-stage");
    const Obf = loadObfuscator(ROOT);
    if (!Obf) { console.error("Chưa cài thư viện làm rối. Hãy chạy:  npm install --no-save javascript-obfuscator@4.1.1   (trong thư mục dự án) rồi chạy lại."); return 1; }
    console.log("1/3 Chép dự án sang thư mục tạm: " + stage);
    makeStage(stage, { withTests });
    console.log("2/3 Làm rối code app/ và core/ ...");
    try { obfuscateStage(stage, Obf, console.log); } catch (e) { console.error(e.message + "\nChưa build. Mã nguồn thật của anh không bị đổi."); return 1; }
    if (stageOnly) { console.log("Xong (--stage-only). Bản đã làm rối ở: " + stage); return 0; }
    console.log("3/3 Build .exe từ bản đã làm rối ...");
    const win = process.platform === "win32";
    const args = ["electron-builder", "--win", "nsis", "--publish", release ? "always" : "never", "-c.directories.output=" + path.join(ROOT, "dist")];
    const r = spawnSync(win ? "npx.cmd" : "npx", args, { cwd: stage, stdio: "inherit", shell: win });
    if (r.status !== 0) { console.error("Build thất bại (mã " + r.status + "). Mã nguồn thật không bị đổi."); return 1; }
    console.log("XONG. File cài .exe nằm ở: " + path.join(ROOT, "dist"));
    console.log("Mã nguồn trong dự án KHÔNG bị thay đổi. Hãy cài thử bản này trên Windows trước khi phát hành.");
    return 0;
}

module.exports = { OBF_OPTIONS, SKIP_FILE, COPY_DIRS, COPY_FILES, makeStage, obfuscateStage, obfuscateFile, listJs, loadObfuscator };

if (require.main === module) process.exit(main(process.argv.slice(2)));
