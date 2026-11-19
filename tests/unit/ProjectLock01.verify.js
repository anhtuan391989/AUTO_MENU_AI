/**
 * ProjectLock01.verify.js — PROJECT-LOCK-01 (khóa cứng file Project Pj)
 * ---------------------------------------------------------------------------
 * Test module THẬT core/integration/ProjectLock.js bằng fs + icacls GIẢ LẬP (DI) để kiểm đúng THỨ TỰ và LOGIC:
 *   - khóa: Chỉ đọc TRƯỚC, rồi icacls /deny Everyone; kết luận bằng "thử ghi" chứ không tin lệnh trả về
 *   - mở khóa: gỡ DENY TRƯỚC rồi mới bỏ Chỉ đọc (vì DENY "ghi thuộc tính" chặn luôn chmod)
 *   - đổi Pj: mở Pj cũ, khóa Pj mới; tắt: mở + xóa ghi nhớ; file vốn Chỉ đọc từ trước không bị đổi thành ghi được
 *   - lỗi: không có Pj / file mất / là thư mục / icacls lỗi (rơi về Chỉ đọc) / vẫn ghi được / mở khóa lỗi (giữ ghi nhớ)
 *   - cấu trúc nối dây: main.js (chỉ Setup được gọi, khởi động chỉ KHÓA không bao giờ mở), preload, setup.html (đúng 1 công tắc,
 *     nằm giữa thẻ "DAW đang dùng" và thẻ Auto-Key), setup.js, bản dịch Việt/Anh.
 * KHÔNG test được (cần Windows + NTFS thật): quyền DENY thật của icacls, DAW thật bấm Save khi file bị khóa.
 * Chạy: node tests/unit/ProjectLock01.verify.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const { createProjectLock, EVERYONE_SID, DENY_RIGHTS } = require(path.join(root, 'core/integration/ProjectLock'));

let pass = 0, fail = 0;
function ok(cond, label, extra) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL', label, extra === undefined ? '' : extra); }
}
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');

// ---------------- fs + icacls giả lập ----------------
function makeEnv(opts) {
    const o = opts || {};
    const files = {};      // path -> { readOnly, deny, dir }
    const store = {};      // record file (nội dung chuỗi)
    const events = [];
    const REC = '/userdata/project-lock.json';
    const err = (code) => { const e = new Error(code); e.code = code; return e; };
    const fakeFs = {
        statSync(p) {
            const f = files[p];
            if (!f) throw err('ENOENT');
            return { isFile: () => !f.dir, mode: f.readOnly ? 0o100444 : 0o100666 };
        },
        chmodSync(p, mode) {
            const f = files[p];
            if (!f) throw err('ENOENT');
            if (f.deny) throw err('EPERM'); // DENY "ghi thuộc tính" => không chmod được
            f.readOnly = (mode & 0o200) === 0;
            events.push('chmod:' + p + ':' + mode.toString(8));
        },
        openSync(p, flags) {
            const f = files[p];
            if (!f) throw err('ENOENT');
            if (o.alwaysWritable) return 1; // giả lập "khóa không có tác dụng"
            if (f.readOnly || f.deny) throw err('EPERM');
            return 1;
        },
        closeSync() { },
        existsSync(p) { return p === REC ? REC in store : !!files[p]; },
        readFileSync(p) { if (!(p in store)) throw err('ENOENT'); return store[p]; },
        writeFileSync(p, d) { store[p] = String(d); },
        unlinkSync(p) { delete store[p]; }
    };
    const fakeExec = (cmd, args, _o, cb) => {
        events.push('exec:' + cmd + ' ' + args.slice(1).join(' '));
        const p = args[0], f = files[p];
        if (o.failIcacls) { cb(new Error('icacls fail'), '', 'denied'); return; }
        if (!f) { cb(new Error('not found'), '', ''); return; }
        if (args[1] === '/deny') { f.deny = true; cb(null, 'Successfully processed 1 files', ''); return; }
        if (args[1] === '/remove:d') {
            if (o.removeDenyFails) { cb(new Error('remove fail'), '', ''); return; }
            f.deny = false; cb(null, 'Successfully processed 1 files', ''); return;
        }
        cb(null, p + ' Everyone:' + (f.deny ? '(DENY)(W,D)' : '(F)'), '');
    };
    const lock = createProjectLock({ fs: fakeFs, execFile: fakeExec, platform: o.platform || 'win32', recordFile: REC });
    return { files, store, events, REC, lock };
}
const A = '/proj/A.song', B = '/proj/B.cpr';
const record = (env) => { try { return JSON.parse(env.store[env.REC]); } catch (e) { return null; } };

(async function main() {
    // ---------- 1) khóa cứng ----------
    console.log('--- khóa cứng (Windows) ---');
    {
        const env = makeEnv(); env.files[A] = { readOnly: false, deny: false };
        const r = await env.lock.apply({ enabled: true, projectPath: A });
        ok(r.ok === true && r.level === 'hard', 'bật -> ok, mức "hard"', JSON.stringify(r));
        const iChmod = env.events.indexOf('chmod:' + A + ':444');
        const iDeny = env.events.findIndex((e) => e.startsWith('exec:icacls /deny'));
        ok(iChmod >= 0 && iDeny > iChmod, 'thứ tự: Chỉ đọc (chmod 444) TRƯỚC, rồi mới icacls /deny', env.events.join(' | '));
        ok(env.events.some((e) => e === 'exec:icacls /deny ' + EVERYONE_SID + ':' + DENY_RIGHTS), 'icacls /deny đúng SID Everyone + đúng quyền', env.events.join(' | '));
        ok(DENY_RIGHTS.includes('WA') && DENY_RIGHTS.includes('WD') && DENY_RIGHTS.includes('D'), 'quyền bị cấm gồm ghi dữ liệu (WD), ghi thuộc tính (WA), xóa (D)');
        ok(record(env) && record(env).lockedPath === A && record(env).wasReadOnly === false, 'ghi nhớ file đã khóa + trạng thái Chỉ đọc ban đầu');
        const st = await env.lock.status(A);
        ok(st.locked === true && st.level === 'hard' && st.lockedByMenu === true, 'status: locked / hard / do Menu khóa', JSON.stringify(st));
        // bật lại lần nữa (khởi động Menu) -> không làm lại
        const before = env.events.length;
        const r2 = await env.lock.apply({ enabled: true, projectPath: A });
        ok(r2.ok && r2.level === 'hard' && !env.events.slice(before).some((e) => e.includes('/deny')), 'bật lần 2 cùng Pj: giữ nguyên, KHÔNG chạy lại icacls /deny', env.events.slice(before).join(' | '));
    }

    // ---------- 2) mở khóa ----------
    console.log('--- mở khóa ---');
    {
        const env = makeEnv(); env.files[A] = { readOnly: false, deny: false };
        await env.lock.apply({ enabled: true, projectPath: A });
        env.events.length = 0;
        const r = await env.lock.apply({ enabled: false, projectPath: A });
        ok(r.ok && r.level === 'none' && r.unlockedOld === A, 'tắt -> ok, đã mở file cũ', JSON.stringify(r));
        const iRem = env.events.findIndex((e) => e.startsWith('exec:icacls /remove:d'));
        const iCh = env.events.indexOf('chmod:' + A + ':666');
        ok(iRem >= 0 && iCh > iRem, 'thứ tự: gỡ DENY TRƯỚC, rồi mới bỏ Chỉ đọc (chmod 666)', env.events.join(' | '));
        ok(!env.files[A].deny && !env.files[A].readOnly, 'file ghi được lại');
        ok(record(env) === null, 'đã xóa ghi nhớ');
        const st = await env.lock.status(A);
        ok(st.locked === false && st.level === 'none', 'status: chưa khóa', JSON.stringify(st));
    }
    {   // file vốn Chỉ đọc từ trước: mở khóa KHÔNG được biến nó thành ghi được
        const env = makeEnv(); env.files[A] = { readOnly: true, deny: false };
        await env.lock.apply({ enabled: true, projectPath: A });
        ok(record(env).wasReadOnly === true, 'nhớ file vốn đã Chỉ đọc');
        env.events.length = 0;
        const r = await env.lock.apply({ enabled: false, projectPath: A });
        ok(r.ok && env.files[A].readOnly === true && !env.events.some((e) => e.includes(':666')), 'mở khóa: gỡ DENY nhưng GIỮ Chỉ đọc cũ (không chmod 666)', env.events.join(' | '));
    }

    // ---------- 3) đổi Pj ----------
    console.log('--- đổi Pj ---');
    {
        const env = makeEnv(); env.files[A] = { readOnly: false, deny: false }; env.files[B] = { readOnly: false, deny: false };
        await env.lock.apply({ enabled: true, projectPath: A });
        const r = await env.lock.apply({ enabled: true, projectPath: B });
        ok(r.ok && r.level === 'hard' && r.unlockedOld === A, 'đổi sang Pj mới: ok, mở Pj cũ', JSON.stringify(r));
        ok(!env.files[A].deny && !env.files[A].readOnly, 'Pj cũ được mở khóa');
        ok(env.files[B].deny && env.files[B].readOnly, 'Pj mới được khóa cứng');
        ok(record(env).lockedPath === B, 'ghi nhớ chuyển sang Pj mới');
    }

    // ---------- 4) lỗi đầu vào ----------
    console.log('--- lỗi đầu vào (không gọi icacls, không throw) ---');
    {
        const env = makeEnv();
        let r = await env.lock.apply({ enabled: true, projectPath: '' });
        ok(r.ok === false && r.reason === 'no_project', 'chưa chọn Pj -> no_project', JSON.stringify(r));
        r = await env.lock.apply({ enabled: true, projectPath: '/nope.song' });
        ok(r.ok === false && r.reason === 'missing', 'file không tồn tại -> missing', JSON.stringify(r));
        env.files['/dir'] = { dir: true };
        r = await env.lock.apply({ enabled: true, projectPath: '/dir' });
        ok(r.ok === false && r.reason === 'not_a_file', 'là thư mục -> not_a_file', JSON.stringify(r));
        ok(!env.events.some((e) => e.startsWith('exec:')), 'cả 3 trường hợp: không chạy icacls');
        r = await env.lock.apply(undefined);
        ok(r.ok === true && r.level === 'none', 'apply(undefined) = tắt, không throw', JSON.stringify(r));
        const st = await env.lock.status('');
        ok(st.locked === false && st.path === null, 'status(rỗng) không throw');
    }

    // ---------- 5) lỗi hệ thống ----------
    console.log('--- lỗi hệ thống ---');
    {
        const env = makeEnv({ failIcacls: true }); env.files[A] = { readOnly: false, deny: false };
        const r = await env.lock.apply({ enabled: true, projectPath: A });
        ok(r.ok === true && r.level === 'readonly' && r.warnings.some((w) => /DENY/.test(w)), 'icacls lỗi -> vẫn khóa mức Chỉ đọc + cảnh báo (không báo "hard" giả)', JSON.stringify(r));
    }
    {
        const env = makeEnv({ alwaysWritable: true }); env.files[A] = { readOnly: false, deny: false };
        const r = await env.lock.apply({ enabled: true, projectPath: A });
        ok(r.ok === false && r.reason === 'still_writable' && r.level === 'none', 'khóa nhưng vẫn ghi được -> THẤT BẠI (still_writable), không báo thành công giả', JSON.stringify(r));
    }
    {
        const env = makeEnv({ platform: 'linux' }); env.files[A] = { readOnly: false, deny: false };
        const r = await env.lock.apply({ enabled: true, projectPath: A });
        ok(r.ok && r.level === 'readonly' && !env.events.some((e) => e.startsWith('exec:')), 'không phải Windows: chỉ Chỉ đọc, không gọi icacls', JSON.stringify(r));
    }
    {
        const env = makeEnv(); env.files[A] = { readOnly: false, deny: false };
        await env.lock.apply({ enabled: true, projectPath: A });
        const rm = makeEnv({ removeDenyFails: true });
        rm.files[A] = { readOnly: true, deny: true }; rm.store[rm.REC] = JSON.stringify({ lockedPath: A, wasReadOnly: false });
        const r = await rm.lock.apply({ enabled: false, projectPath: A });
        ok(r.ok === false && r.reason === 'unlock_failed', 'mở khóa thất bại -> unlock_failed (không báo thành công giả)', JSON.stringify(r));
        ok(record(rm) && record(rm).lockedPath === A, 'mở khóa thất bại -> GIỮ ghi nhớ để lần sau thử lại');
    }
    {   // file đã bị xóa/đổi tên ngoài Menu: tắt công tắc vẫn dọn được ghi nhớ
        const env = makeEnv(); env.store[env.REC] = JSON.stringify({ lockedPath: '/gone.song', wasReadOnly: false });
        const r = await env.lock.apply({ enabled: false, projectPath: '/gone.song' });
        ok(r.ok && record(env) === null, 'file đã mất: tắt công tắc vẫn dọn ghi nhớ, không kẹt');
    }

    // ---------- 6) hàng đợi ----------
    console.log('--- hàng đợi (bấm nhanh) ---');
    {
        const env = makeEnv(); env.files[A] = { readOnly: false, deny: false };
        const ps = [env.lock.apply({ enabled: true, projectPath: A }), env.lock.apply({ enabled: false, projectPath: A }), env.lock.apply({ enabled: true, projectPath: A })];
        const rs = await Promise.all(ps);
        ok(rs.every((x) => x.ok), 'bật-tắt-bật liên tiếp: cả 3 lệnh ok', JSON.stringify(rs.map((x) => x.ok)));
        ok(env.files[A].deny && env.files[A].readOnly && record(env).lockedPath === A, 'kết quả cuối = đang khóa (đúng lệnh cuối cùng)');
    }

    // ---------- 7) fs thật (chỉ khi không phải root) ----------
    console.log('--- fs thật ---');
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
        console.log('  SKIP  đang chạy bằng root: root vẫn ghi được file 0444 nên không kiểm được trên Linux — cần chạy ở Windows thật');
    } else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plock-'));
        try {
            const f = path.join(dir, 'x.song'); fs.writeFileSync(f, 'a');
            const lk = createProjectLock({ platform: 'linux', recordFile: path.join(dir, 'rec.json') });
            const r = await lk.apply({ enabled: true, projectPath: f });
            let blocked = false; try { fs.writeFileSync(f, 'b'); } catch (e) { blocked = true; }
            ok(r.ok && blocked, 'fs thật: sau khi khóa, ghi file bị chặn');
            await lk.apply({ enabled: false, projectPath: f });
            let writable = true; try { fs.writeFileSync(f, 'c'); } catch (e) { writable = false; }
            ok(writable, 'fs thật: sau khi mở khóa, ghi lại được');
        } finally { try { fs.chmodSync(path.join(dir, 'x.song'), 0o666); } catch (e) { } fs.rmSync(dir, { recursive: true, force: true }); }
    }

    // ---------- 8) nối dây (cấu trúc) ----------
    console.log('--- nối dây ---');
    const main = rd('app/main.js'), pre = rd('app/preload.js'), html = rd('ui/setup.html'), js = rd('ui/js/setup.js');
    ok(/ipcMain\.handle\("project-lock-set"/.test(main) && /ipcMain\.handle\("project-lock-status"/.test(main), 'main.js: có 2 handler project-lock-set / project-lock-status');
    const setBlock = main.slice(main.indexOf('ipcMain.handle("project-lock-set"'), main.indexOf('ipcMain.handle("project-lock-status"'));
    ok(/isFromSetupWindow\(event\)/.test(setBlock) && /reason: "denied"/.test(setBlock), 'project-lock-set: chỉ cửa sổ Setup được gọi (cửa sổ khác bị từ chối)');
    ok(/enabled: r\.enabled === true/.test(setBlock), 'project-lock-set: chỉ coi enabled === true là bật (giá trị lạ = tắt)');
    const startBlock = main.slice(main.indexOf('app.whenReady().then(() => licenseReady).then(() => {\n    if (!licenseManager.isLicensed()) return;\n    try {\n        const s = readSettingsFile()'));
    ok(/apply\(\{ enabled: true, projectPath: pj \}\)/.test(startBlock) && !/apply\(\{ enabled: false/.test(startBlock.slice(0, 900)), 'khởi động: chỉ gọi apply enabled:true (không bao giờ mở khóa lúc khởi động)');
    ok(/&& pj\)/.test(startBlock), 'khởi động: chỉ khóa khi có đường dẫn Pj (cài đặt thiếu/hỏng thì giữ nguyên trạng thái)');
    ok(!/before-quit[\s\S]{0,200}ProjectLock/.test(main), 'thoát Menu: KHÔNG mở khóa (khóa phải giữ khi Menu tắt)');
    ok(/fs\.chmodSync\(b, 0o666\)/.test(main), 'bản COPY Pj luôn ghi được (không thừa kế cờ Chỉ đọc)');
    ok(/projectLockSet: \(req\) => ipcRenderer\.invoke\("project-lock-set", req\)/.test(pre) && /projectLockStatus: \(projectPath\) => ipcRenderer\.invoke\("project-lock-status", projectPath\)/.test(pre), 'preload.js: bridge projectLockSet/projectLockStatus');

    ok((html.match(/id="projectLockEnable"/g) || []).length === 1, 'setup.html: đúng 1 công tắc projectLockEnable');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    ok(new Set(ids).size === ids.length, 'setup.html: không có id trùng', ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
    const iDaw = html.indexOf('🎛 DAW đang dùng'), iLock = html.indexOf('id="projectLockCard"'), iAuto = html.indexOf('⌨ Auto-Key');
    ok(iDaw > 0 && iLock > iDaw && iLock < iAuto, 'setup.html: thẻ Khóa Project nằm NGAY DƯỚI thẻ "DAW đang dùng", trước thẻ Auto-Key');
    const panelDaw = html.slice(html.indexOf('id="panel-daw"'), html.indexOf('id="panel-daw"') + 200000);
    ok(panelDaw.indexOf('projectLockCard') < panelDaw.indexOf('</section>'), 'công tắc nằm trong tab DAW');
    ok(/initProjectLockSection\(\); \/\/ PROJECT-LOCK-01/.test(js) && /function initProjectLockSection\(\)/.test(js), 'setup.js: có và có gọi initProjectLockSection()');
    ok((js.match(/window\.__projectLockSync\?\.\(\)/g) || []).length === 2, 'setup.js: đổi Pj (Chọn PJ + Lưu PJ) đều gọi đồng bộ khóa');
    const lockFn = js.slice(js.indexOf('function initProjectLockSection()'), js.indexOf('/* ================= SOUNDCARD'));
    const iApi = lockFn.indexOf('api.projectLockSet({ enabled: want'), iSave = lockFn.indexOf('saveSetting("projectLockEnabled", want)');
    ok(iApi > 0 && iSave > iApi, 'setup.js: khóa/mở khóa file THÀNH CÔNG rồi mới lưu cờ (cờ luôn khớp ổ đĩa)');
    ok(/if \(want && !pj\) \{ cb\.checked = false;/.test(lockFn), 'setup.js: chưa chọn Pj thì không cho bật');
    ok(/cb\.checked = !want; \/\/ việc khóa\/mở khóa THẤT BẠI/.test(lockFn), 'setup.js: thất bại -> công tắc quay về trạng thái thật');

    // ---------- 9) bản dịch ----------
    console.log('--- bản dịch Việt/Anh ---');
    const I = require(path.join(root, 'ui/js/i18n.js'));
    I.setLang('en');
    const vi = [...lockFn.matchAll(/(?:^|[\s,{])(?:[a-zA-Z]+): ("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/gm)].map((m) => eval(m[1])).filter((s) => /[À-ỹ]/.test(s));
    ok(vi.length >= 15, 'tìm thấy các chuỗi tĩnh trong initProjectLockSection', vi.length);
    const missing = vi.filter((s) => { const t = I.translate(s); return t === null || t === s; });
    ok(missing.length === 0, 'MỌI chuỗi hiển thị trong initProjectLockSection đều có bản dịch tiếng Anh', JSON.stringify(missing));
    const staticHtml = ['🔒 Khóa Project (Pj)', 'Đang tắt', 'Bật = KHÓA CỨNG file Project (không ai sửa/lưu đè được) · Tắt = cho phép sửa', '→ "Mở kèm Project / Youtube".'];
    const missingHtml = staticHtml.filter((s) => { const t = I.translate(s); return t === null || t === s; });
    ok(missingHtml.length === 0, 'chuỗi tĩnh trong setup.html có bản dịch', JSON.stringify(missingHtml));
    I.setLang('vi');

    console.log('\n' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
})();
