// LICENSE-02 — chạy: node tests/unit/LicenseManagerUptimeGuard01.verify.js
// Kiểm tra app/LicenseManager.js: chống lùi đồng hồ hệ thống NGAY CẢ KHI app đang TẮT lúc bị chỉnh giờ,
// bằng cách so "thời gian đồng hồ nói đã trôi qua" với "thời gian máy THẬT SỰ đã bật" (os.uptime, không bị
// đồng hồ hệ thống ảnh hưởng, chỉ reset khi máy khởi động lại thật).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

const { createLicenseManager, machineCodeFromRaw } = require(path.join(ROOT, 'app/LicenseManager.js'));

const RAW_MACHINE = 'test-machine-raw-id';
const MACHINE = machineCodeFromRaw(RAW_MACHINE); // "XXXXX-XXXXX-XXXXX-XXXXX"
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB_B64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function signPayload(payloadObj) {
    const payloadStr = JSON.stringify(payloadObj);
    const sig = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey).toString('base64');
    return { payload: payloadStr, sig };
}

function mkManager(tmpDir, fakeNowBox, fakeUptimeBox) {
    return createLicenseManager({
        userDataDir: tmpDir,
        publicKeyText: PUB_B64,
        now: () => fakeNowBox.v,
        uptimeMs: () => fakeUptimeBox.v,
        machineIdProvider: async () => RAW_MACHINE,
        fetchFn: async () => { throw new Error('không dùng mạng trong test này'); },
    });
}

async function activateDirect(mgr, fetchStub) {
    // ghi đè fetchFn cho đúng 1 lần activate() bằng cách tạo 1 manager riêng chỉ để activate, rồi dùng chung thư mục cache.
    return mgr;
}

(async () => {
    // ---------- Kịch bản 1: tắt app, lùi đồng hồ về 1 mốc "còn hạn" nhưng uptime THẬT SỰ chứng minh đã trôi qua rất lâu ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic02-'));
        try {
            const t0 = 1000000000000; // mốc kích hoạt
            const u0 = 5000000; // uptime máy lúc kích hoạt
            const expiresAt = t0 + 3 * 86400000; // gói 3 ngày
            const { payload, sig } = signPayload({ v: 1, status: 'active', plan: '3d', activatedAt: t0, expiresAt, machine: MACHINE.replace(/-/g, '') });

            const fakeNow = { v: t0 }, fakeUptime = { v: u0 };
            const mgr = createLicenseManager({
                userDataDir: tmp, publicKeyText: PUB_B64,
                now: () => fakeNow.v, uptimeMs: () => fakeUptime.v,
                machineIdProvider: async () => RAW_MACHINE,
                fetchFn: async () => ({ json: async () => ({ ok: true, payload, sig }) }),
            });
            await mgr.init();
            const act = await mgr.activate('MENU-AAAAA-AAAAA-AAAAA-AAAAA');
            ok(act.ok === true, 'kịch bản 1: kích hoạt thành công');

            // App đóng lại. THẬT SỰ trôi qua 10 ngày (uptime máy tăng đúng 10 ngày vì máy không tắt/ngủ đông).
            // Kẻ tấn công chỉnh đồng hồ lùi về t0 + 1 ngày (vẫn "sau" t0 nên qua được kiểm tra lùi giờ cũ) rồi mở lại app, KHÔNG có mạng.
            fakeUptime.v = u0 + 10 * 86400000;
            fakeNow.v = t0 + 1 * 86400000; // giả, còn hạn (< expiresAt) nếu không có kiểm tra mới

            const st = mgr.getStatus();
            ok(st.licensed === false && st.code === 'NEED_ONLINE', 'kịch bản 1: PHÁT HIỆN lùi giờ khi app đang tắt, bắt xác minh lại online (trước khi vá: sẽ báo LICENSED sai)');
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }

    // ---------- Kịch bản 2: nghỉ ngắn bình thường (vài phút) — không được báo nhầm là lùi giờ ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic02-'));
        try {
            const t0 = 2000000000000, u0 = 9000000;
            const expiresAt = t0 + 3 * 86400000;
            const { payload, sig } = signPayload({ v: 1, status: 'active', plan: '3d', activatedAt: t0, expiresAt, machine: MACHINE.replace(/-/g, '') });
            const fakeNow = { v: t0 }, fakeUptime = { v: u0 };
            const mgr = createLicenseManager({
                userDataDir: tmp, publicKeyText: PUB_B64,
                now: () => fakeNow.v, uptimeMs: () => fakeUptime.v,
                machineIdProvider: async () => RAW_MACHINE,
                fetchFn: async () => ({ json: async () => ({ ok: true, payload, sig }) }),
            });
            await mgr.init();
            await mgr.activate('MENU-AAAAA-AAAAA-AAAAA-AAAAA');
            // Nghỉ trưa 20 phút: cả đồng hồ lẫn uptime đều trôi đúng 20 phút.
            fakeNow.v = t0 + 20 * 60000;
            fakeUptime.v = u0 + 20 * 60000;
            const st = mgr.getStatus();
            ok(st.licensed === true && st.code === 'LICENSED', 'kịch bản 2: nghỉ ngắn bình thường không bị báo nhầm là lùi giờ');
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }

    // ---------- Kịch bản 3: khởi động lại máy thật (uptime reset về nhỏ) — không khoá oan ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic02-'));
        try {
            const t0 = 3000000000000, u0 = 5000000;
            const expiresAt = t0 + 3 * 86400000;
            const { payload, sig } = signPayload({ v: 1, status: 'active', plan: '3d', activatedAt: t0, expiresAt, machine: MACHINE.replace(/-/g, '') });
            const fakeNow = { v: t0 }, fakeUptime = { v: u0 };
            const mgr = createLicenseManager({
                userDataDir: tmp, publicKeyText: PUB_B64,
                now: () => fakeNow.v, uptimeMs: () => fakeUptime.v,
                machineIdProvider: async () => RAW_MACHINE,
                fetchFn: async () => ({ json: async () => ({ ok: true, payload, sig }) }),
            });
            await mgr.init();
            await mgr.activate('MENU-AAAAA-AAAAA-AAAAA-AAAAA');
            // 2 ngày sau (vẫn trong hạn 3 ngày, còn trong 72h kể từ lần online cuối? KHÔNG — nhưng ta chỉ kiểm tra riêng phần uptime ở đây
            // bằng cách giữ khoảng cách lastOkLocal trong hạn 72h để không bị chặn bởi lý do khác).
            fakeNow.v = t0 + 2 * 3600000; // 2 giờ sau — còn trong hạn 72h và còn hạn license
            fakeUptime.v = 120000; // máy khởi động lại thật, uptime chỉ còn 2 phút (nhỏ hơn hẳn u0 đã lưu)
            const st = mgr.getStatus();
            ok(st.licensed === true && st.code === 'LICENSED', 'kịch bản 3: khởi động lại máy thật (uptime reset) không bị khoá oan');
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }

    // ---------- Kịch bản 4: file license.json kiểu CŨ (trước LICENSE-02, chưa có maxLocalUptime) — không được lỗi, tự bổ sung dần ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic02-'));
        try {
            const t0 = 4000000000000;
            const expiresAt = t0 + 3 * 86400000;
            const { payload, sig } = signPayload({ v: 1, status: 'active', plan: '3d', activatedAt: t0, expiresAt, machine: MACHINE.replace(/-/g, '') });
            // Ghi tay file cache kiểu cũ — KHÔNG có trường maxLocalUptime.
            fs.writeFileSync(path.join(tmp, 'license.json'), JSON.stringify({ v: 1, key: 'MENU-AAAAA-AAAAA-AAAAA-AAAAA', payload, sig, lastOkLocal: t0, maxLocal: t0 }), 'utf8');

            const fakeNow = { v: t0 }, fakeUptime = { v: 7000000 };
            const mgr = createLicenseManager({
                userDataDir: tmp, publicKeyText: PUB_B64,
                now: () => fakeNow.v, uptimeMs: () => fakeUptime.v,
                machineIdProvider: async () => RAW_MACHINE,
                fetchFn: async () => { throw new Error('không cần mạng ở đây'); },
            });
            const st0 = await mgr.init();
            ok(st0.licensed === true, 'kịch bản 4: đọc được cache kiểu cũ (chưa có maxLocalUptime), không bị lỗi/khoá oan');

            // Mở lại app sau đó ít phút (thời gian thật trôi) — để kiểm tra cơ chế đã tự bổ sung maxLocalUptime lần init() trước.
            fakeNow.v = t0 + 5 * 60000;
            fakeUptime.v = 7000000 + 5 * 60000;
            const st1 = await mgr.init();
            ok(st1.licensed === true, 'kịch bản 4: lần mở sau đó vẫn hợp lệ, đã tự có mốc uptime để bảo vệ từ đây về sau');

            const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'license.json'), 'utf8'));
            ok(typeof saved.maxLocalUptime === 'number', 'kịch bản 4: file cache đã được bổ sung trường maxLocalUptime trên đĩa');
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
