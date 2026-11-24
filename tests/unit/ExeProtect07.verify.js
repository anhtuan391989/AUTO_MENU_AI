/**
 * EXE-PROTECT-07 — License phía Server cho Key Server /list?all=1 (chạy: node tests/unit/ExeProtect07.verify.js)
 * Chạy code THẬT của server/worker.js (D1 giả) + LicenseManager.js + KeyServerSync.js thật.
 * KHÔNG gọi mạng, KHÔNG đụng Cloudflare thật.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m); } };

// ---------- 1) Khoá công khai trong worker.js phải KHỚP ĐÚNG app/license-public-key.txt (lệch là hỏng toàn bộ xác minh) ----------
const workerSrc = fs.readFileSync(path.join(ROOT, 'server/worker.js'), 'utf8');
const pubKeyApp = fs.readFileSync(path.join(ROOT, 'app/license-public-key.txt'), 'utf8').replace(/\s+/g, '');
const mKhoa = /KHOA_CONG_KHAI_LICENSE_MAC_DINH\s*=\s*"([^"]+)"/.exec(workerSrc);
ok(!!mKhoa && mKhoa[1] === pubKeyApp, 'server/worker.js: khoá công khai License khớp đúng app/license-public-key.txt');
ok(/Access-Control-Allow-Headers"\s*:\s*"[^"]*X-License-Payload[^"]*X-License-Sig/.test(workerSrc), 'CORS: cho phép header X-License-Payload/X-License-Sig');
ok(/REQUIRE_LICENSE_FOR_LIST\s*===\s*"1"/.test(workerSrc), 'cổng chỉ bật khi biến Cloudflare REQUIRE_LICENSE_FOR_LIST=1 (mặc định TẮT)');
ok(!/env\.REQUIRE_LICENSE_FOR_LIST\s*=[^=]/.test(workerSrc), 'không có chỗ nào tự GHI biến này (chỉ ĐỌC env.REQUIRE_LICENSE_FOR_LIST — phải do Khói tự đặt trên Cloudflare)');

// ---------- 2) Nạp worker.js THẬT (cùng cách KeyServerDurationA88.verify.js đã dùng) ----------
function loadWorker(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^export default/m, 'module.exports =');
    const m = { exports: {} };
    new Function('module', 'exports', src)(m, m.exports);
    return m.exports;
}
const worker = loadWorker(path.join(ROOT, 'server/worker.js'));

// ---------- 3) D1 giả: đủ để trả lời đúng truy vấn /list (tôn trọng LIMIT) ----------
function makeDb(n) {
    const songs = [];
    for (let i = 0; i < n; i++) songs.push({ songId: 'bai_' + i, title: 'Bai ' + i, total_duration_sec: 200, updated_at: 1000 + i });
    return {
        prepare(sql) {
            const q = sql.replace(/\s+/g, ' ').trim();
            return {
                bind() { return this; },
                async all() {
                    const m = /LIMIT (\d+)\s*$/.exec(q); // LẤY LIMIT CUỐI CÂU (truy vấn còn 2 LIMIT 1 ở subquery key1/mode1)
                    const limit = m ? Number(m[1]) : songs.length;
                    if (q.startsWith('SELECT i.song_id as songId, i.title, i.total_duration_sec as tongGiay')) {
                        const sorted = [...songs].sort((a, b) => b.updated_at - a.updated_at).slice(0, limit)
                            .map((s) => ({ songId: s.songId, title: s.title, tongGiay: s.total_duration_sec, soDoan: 1, updated_at: s.updated_at, ngayDoanDau: s.updated_at, key1: 'C', mode1: 'major' }));
                        return { results: sorted };
                    }
                    throw new Error('all: không hỗ trợ trong D1 giả: ' + q.slice(0, 60));
                },
                async first() { throw new Error('first: không hỗ trợ: ' + q.slice(0, 60)); },
                async run() { throw new Error('run: không hỗ trợ: ' + q.slice(0, 60)); }
            };
        }
    };
}
const ctx = { waitUntil() {} }; // bỏ qua việc tự điền thời lượng nền (không liên quan test này)

async function goiList(env, headers) {
    const req = new Request('https://x/list?all=1', { headers: headers || {} });
    const res = await worker.fetch(req, env, ctx);
    return res.json();
}

// ---------- 4) Cặp khoá Ed25519 RIÊNG cho test (không phải khoá thật của Khói) ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubTestB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
function kySan(payloadObj) {
    const payloadStr = JSON.stringify(payloadObj);
    const sig = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey);
    return { 'X-License-Payload': Buffer.from(payloadStr, 'utf8').toString('base64'), 'X-License-Sig': sig.toString('base64') };
}
const licenseConHan = kySan({ v: 1, status: 'active', expiresAt: Date.now() + 999999999, machine: 'TEST' });
const licenseHetHan = kySan({ v: 1, status: 'active', expiresAt: Date.now() - 1000, machine: 'TEST' });

(async () => {
    const N = 150;
    const envTat = { DB: makeDb(N) }; // REQUIRE_LICENSE_FOR_LIST chưa đặt
    const envBat = { DB: makeDb(N), REQUIRE_LICENSE_FOR_LIST: '1', LICENSE_PUBLIC_KEY: pubTestB64, ADMIN_TOKEN: 'mat-khau-quan-tri-test' };

    // Biến CHƯA bật -> y như cũ, ai gọi ?all=1 cũng thấy hết (không đổi hành vi hiện có).
    ok((await goiList(envTat)).tongBai === N, 'biến REQUIRE_LICENSE_FOR_LIST chưa đặt: ?all=1 trả đủ ' + N + ' bài như trước (không đổi gì)');

    // Biến ĐÃ bật, KHÔNG có license, KHÔNG có admin -> KHÔNG lỗi, chỉ hạ xuống 100 bài gần nhất (y như không có ?all=1).
    const khongLicense = await goiList(envBat);
    ok(khongLicense.tongBai === 100 && !khongLicense.error, 'bật cổng: không có License -> hạ về 100 bài (không lỗi, không chặn tính năng miễn phí)');

    // Có License hợp lệ, còn hạn, ký đúng bằng khoá test -> được xem đủ.
    ok((await goiList(envBat, licenseConHan)).tongBai === N, 'bật cổng: License hợp lệ còn hạn -> xem đủ ' + N + ' bài');

    // License CHỮ KÝ ĐÚNG nhưng ĐÃ HẾT HẠN -> vẫn bị hạ về 100 (không được xem đủ).
    ok((await goiList(envBat, licenseHetHan)).tongBai === 100, 'bật cổng: License đã hết hạn -> vẫn hạ về 100, không được đi vòng');

    // Chữ ký SAI (giả mạo payload) -> hạ về 100.
    const gia = Object.assign({}, licenseConHan, { 'X-License-Payload': kySan({ v: 1, status: 'active', expiresAt: Date.now() + 999999999, machine: 'KHAC' })['X-License-Payload'] });
    // ghép payload KHÁC với chữ ký CŨ -> chữ ký không khớp payload
    const falsify = { 'X-License-Payload': gia['X-License-Payload'], 'X-License-Sig': licenseConHan['X-License-Sig'] };
    ok((await goiList(envBat, falsify)).tongBai === 100, 'bật cổng: payload bị đổi (chữ ký không khớp) -> hạ về 100, không được đi vòng');

    // Thiếu header hoàn toàn (như scraper gọi thẳng curl) -> hạ về 100.
    ok((await goiList(envBat, {})).tongBai === 100, 'bật cổng: gọi thẳng không kèm gì (vd curl) -> hạ về 100');

    // Mật khẩu quản trị (ADMIN_TOKEN) đi vòng được, không cần License -> trang quản trị của Khói không bị ảnh hưởng.
    ok((await goiList(envBat, { Authorization: 'Bearer mat-khau-quan-tri-test' })).tongBai === N, 'bật cổng: có mật khẩu quản trị (ADMIN_TOKEN) -> vẫn xem đủ, không cần License');
    ok((await goiList(envBat, { Authorization: 'Bearer sai' })).tongBai === 100, 'bật cổng: mật khẩu quản trị SAI -> hạ về 100 (không đi vòng được)');

    // /list KHÔNG kèm ?all=1 thì không liên quan gì tới cổng này — vẫn như cũ.
    {
        const res = await worker.fetch(new Request('https://x/list'), envBat, ctx);
        const j = await res.json();
        ok(j.tongBai === 100, '/list (không all=1) không bị ảnh hưởng, vẫn 100 bài như trước');
    }

    // ---------- 5) LicenseManager.getProof() ----------
    const { createLicenseManager } = require(path.join(ROOT, 'app/LicenseManager.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exe07-'));
    try {
        const lm = createLicenseManager({ userDataDir: tmp, publicKeyText: pubTestB64 });
        await lm.init();
        ok(lm.getProof() === null, 'getProof(): chưa kích hoạt -> null');

        // Giả lập 1 license đã kích hoạt + hợp lệ bằng cách ghi thẳng license.json (giống cache nội bộ của LicenseManager).
        const { machine } = { machine: await lm.getMachineCode() };
        const payloadObj = { v: 1, status: 'active', expiresAt: Date.now() + 999999999, machine: String(machine).replace(/-/g, ''), plan: '1y', activatedAt: Date.now() };
        const payloadStr = JSON.stringify(payloadObj);
        const sig = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey).toString('base64');
        fs.writeFileSync(path.join(tmp, 'license.json'), JSON.stringify({ v: 1, key: 'MENU-TESTT-ESTTE-STTES-TTEST', payload: payloadStr, sig, lastOkLocal: Date.now(), maxLocal: Date.now() }), 'utf8');
        const lm2 = createLicenseManager({ userDataDir: tmp, publicKeyText: pubTestB64, machineIdProvider: lm.getMachineCode ? undefined : undefined });
        // machineIdProvider không cần set lại vì machineCodeFromRaw là hàm thuần (cùng input -> cùng mã máy); nạp lại bằng init() để đọc license.json vừa ghi.
        await lm2.init();
        const proof = lm2.getProof();
        ok(!!proof && typeof proof.payloadB64 === 'string' && typeof proof.sig === 'string', 'getProof(): đã kích hoạt hợp lệ -> trả {payloadB64, sig}');
        if (proof) {
            const decoded = JSON.parse(Buffer.from(proof.payloadB64, 'base64').toString('utf8'));
            ok(decoded.status === 'active' && decoded.v === 1, 'getProof(): payloadB64 giải mã lại đúng JSON đã ký');
            ok(proof.sig === sig, 'getProof(): sig giữ nguyên, không đổi');
            // Worker thật phải xác minh được proof này bằng ĐÚNG khoá công khai test.
            const okWorker = await goiList(envBat, { 'X-License-Payload': proof.payloadB64, 'X-License-Sig': proof.sig });
            ok(okWorker.tongBai === N, 'liên thông: bằng chứng từ LicenseManager.getProof() được worker.js xác minh hợp lệ -> xem đủ');
        }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    // ---------- 6) KeyServerSync._request() gắn kèm header khi có getLicenseProof ----------
    const { KeyServerSync } = require(path.join(ROOT, 'core/integration/KeyServerSync.js'));
    {
        let seenHeaders = null;
        const fakeFetch = async (u, init) => { seenHeaders = (init && init.headers) || {}; return { ok: true, status: 200, json: async () => ({}) }; };
        const kss = new KeyServerSync({ fetchFn: fakeFetch, getLicenseProof: () => ({ payloadB64: 'AAA', sig: 'BBB' }) });
        await kss._request('/list', { method: 'GET' }, 1000);
        ok(seenHeaders['X-License-Payload'] === 'AAA' && seenHeaders['X-License-Sig'] === 'BBB', '_request(): gắn kèm X-License-Payload/X-License-Sig khi getLicenseProof trả bằng chứng');

        const kss2 = new KeyServerSync({ fetchFn: fakeFetch, getLicenseProof: () => null });
        await kss2._request('/set-song-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 1000);
        ok(seenHeaders['Content-Type'] === 'application/json' && !seenHeaders['X-License-Payload'], '_request(): chưa có license -> không gắn gì, header cũ (Content-Type) vẫn giữ nguyên');

        const kss3 = new KeyServerSync({ fetchFn: fakeFetch }); // không truyền getLicenseProof (hành vi cũ)
        await kss3._request('/list', { method: 'GET' }, 1000);
        ok(!seenHeaders['X-License-Payload'], '_request(): không truyền getLicenseProof -> hành vi y như cũ, không gắn gì');
    }

    // ---------- 7) EXE-PROTECT-07b: trang quản trị tự gửi mật khẩu quản trị (nếu ĐÃ TỪNG nhập) khi xem "tất cả bài" ----------
    // Không prompt (không hỏi) khi xem — chỉ gắn kèm nếu đã có sẵn. Test bằng cách chạy đúng đoạn JS nhúng trong worker.js (vm), không giả lập lại logic.
    {
        const htmlSrc = fs.readFileSync(path.join(ROOT, 'server/worker.js'), 'utf8');
        const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(htmlSrc);
        ok(!!scriptMatch, 'tìm thấy khối <script> của trang quản trị trong server/worker.js');
        const scriptSrc = scriptMatch ? scriptMatch[1] : '';
        ok(/var mkQuanTri = layMatKhauNeuCo\(\);/.test(scriptSrc) && /fetch\(SERVER \+ '\/list\?all=1'[\s\S]*?headers: tieuDeXin/.test(scriptSrc),
            'taiDanhSach(): gắn Authorization từ layMatKhauNeuCo() vào fetch /list?all=1');

        const fnMatch = /function layMatKhauNeuCo\(\) \{[\s\S]*?\n    \}/.exec(scriptSrc);
        ok(!!fnMatch, 'tìm thấy hàm layMatKhauNeuCo() để chạy thử riêng');
        if (fnMatch) {
            const sandbox = { sessionStorage: null, document: { getElementById: () => null }, console };
            vm.createContext(sandbox);
            new vm.Script(fnMatch[0] + '\nthis.__ket_qua__ = layMatKhauNeuCo;').runInContext(sandbox);
            const layMatKhauNeuCo = sandbox.__ket_qua__;

            // Chưa có gì -> trả '' (KHÔNG prompt, vì sandbox không có prompt — nếu lỡ gọi sẽ ném lỗi ReferenceError, test tự fail).
            sandbox.sessionStorage = { getItem: () => null };
            ok(layMatKhauNeuCo() === '', 'layMatKhauNeuCo(): chưa từng nhập -> trả rỗng, không hỏi gì (không prompt)');

            // Có trong sessionStorage (đã nhập lúc sửa/xoá 1 bài trước đó) -> trả đúng giá trị đó.
            sandbox.sessionStorage = { getItem: (k) => (k === 'menuAdminToken' ? 'tu-nho-truoc-do' : null) };
            ok(layMatKhauNeuCo() === 'tu-nho-truoc-do', 'layMatKhauNeuCo(): có sẵn trong sessionStorage -> dùng lại, không hỏi');

            // Có trong ô nhập (chưa kịp lưu sessionStorage) -> vẫn lấy được.
            sandbox.sessionStorage = { getItem: () => null };
            sandbox.document = { getElementById: (id) => (id === 'adminToken' ? { value: 'go-trong-o-nhap' } : null) };
            ok(layMatKhauNeuCo() === 'go-trong-o-nhap', 'layMatKhauNeuCo(): có trong ô nhập mật khẩu quản trị -> dùng được');
        }

        // Hành vi CŨ (sửa/xoá 1 bài) không bị đụng: layMatKhau() vẫn hỏi (prompt) khi chưa có sẵn.
        ok(/function layMatKhau\(\) \{[\s\S]*?prompt\(/.test(scriptSrc), 'layMatKhau() (dùng khi sửa/xoá bài) vẫn hỏi mật khẩu như cũ, không bị đổi');
        ok(/goiAdmin\(path, body, token\)/.test(scriptSrc), 'goiAdmin() (sửa/xoá bài) không bị đụng tới');
    }

    console.log(`\n${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI KHÔNG BẮT ĐƯỢC:', e && e.stack || e); process.exit(1); });
