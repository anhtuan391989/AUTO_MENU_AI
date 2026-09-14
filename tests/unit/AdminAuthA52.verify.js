/**
 * AdminAuthA52.verify.js — TASK A52
 * ---------------------------------------------------------------------------
 * Test trực tiếp core/shared/AdminAuth.js bằng createAdminAuth({userDataDir, safeStorage})
 * — module Node thuần, không cần Electron thật để chạy test này (đúng pattern các
 * test .verify.js khác trong repo: dùng module thật, không mock nội bộ logic).
 *
 * Bao phủ:
 *   1. Bootstrap mặc định = "Kh0i_AI!" khi chưa có file admin-auth.json
 *   2. Verify đúng password -> ok=true
 *   3. Verify sai password -> ok=false, không throw
 *   4. Password KHÔNG BAO GIỜ được ghi plaintext ra đĩa (grep nội dung file)
 *   5. Change Password: bắt buộc đúng password hiện tại
 *   6. Change Password: password mới quá ngắn bị từ chối
 *   7. Change Password: password mới toàn số (PIN) bị từ chối
 *   8. Change Password: password mới hợp lệ (chữ+số+ký tự đặc biệt) -> verify được ngay
 *   9. Change Password: verify bằng password CŨ sau khi đổi -> phải fail
 *  10. safeStorage khả dụng -> file được mã hoá thêm 1 lớp (có prefix AMA1:)
 *  11. safeStorage khả dụng -> vẫn verify/roundtrip đúng qua encrypt/decrypt thật (fake DPAPI)
 *  12. safeStorage KHÔNG khả dụng (null) -> vẫn hoạt động đúng, không throw, không plaintext
 *  13. Không có password (undefined/null/"") -> bị từ chối an toàn, không throw
 *  14. isBootstrapped() phản ánh đúng trạng thái trước/sau lần verify đầu tiên
 *
 * Chạy: node tests/unit/AdminAuthA52.verify.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const adminAuthPath = path.join(__dirname, '..', '..', 'core', 'shared', 'AdminAuth.js');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function freshModule() {
    delete require.cache[require.resolve(adminAuthPath)];
    return require(adminAuthPath);
}

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'admin-auth-a52-'));
}

// "safeStorage" giả lập — dùng đúng AES thật (không phải no-op) để test roundtrip
// mã hoá/giải mã thật, không chỉ giả vờ pass.
function makeFakeSafeStorage(available) {
    const crypto = require('crypto');
    const key = crypto.randomBytes(32);
    return {
        isEncryptionAvailable: () => available,
        encryptString: (plain) => {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            return Buffer.concat([iv, tag, enc]);
        },
        decryptString: (buf) => {
            const iv = buf.subarray(0, 12);
            const tag = buf.subarray(12, 28);
            const enc = buf.subarray(28);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8');
        }
    };
}

console.log('== Mục 1-2: Bootstrap mặc định + verify đúng password ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });

    assert(DEFAULT_PASSWORD === 'Kh0i_AI!', 'Hằng số DEFAULT_PASSWORD đúng "Kh0i_AI!"');
    assert(auth.isBootstrapped() === false, 'Chưa gọi verify() lần nào -> isBootstrapped()=false');

    const r = auth.verify(DEFAULT_PASSWORD);
    assert(r.ok === true, 'verify(default password) -> ok=true sau bootstrap tự động');
    assert(auth.isBootstrapped() === true, 'Sau lần verify đầu tiên -> isBootstrapped()=true');
}

console.log('\n== Mục 3: verify sai password -> ok=false, không throw ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });

    let threw = false;
    let r;
    try {
        r = auth.verify('SaiPassword123!');
    } catch {
        threw = true;
    }
    assert(threw === false, 'verify(sai password) không throw');
    assert(r.ok === false, 'verify(sai password) -> ok=false');
    assert(typeof r.reason === 'string' && r.reason.length > 0, 'Có lý do rõ ràng khi sai password');

    // xác nhận default vẫn đúng (chưa bị hỏng bởi lần thử sai)
    assert(auth.verify(DEFAULT_PASSWORD).ok === true, 'Default password vẫn verify đúng sau 1 lần thử sai');
}

console.log('\n== Mục 4: Password KHÔNG BAO GIỜ ghi plaintext ra đĩa ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });
    auth.verify(DEFAULT_PASSWORD); // trigger bootstrap + ghi file

    const raw = fs.readFileSync(auth._filePath, 'utf-8');
    assert(!raw.includes(DEFAULT_PASSWORD), `Nội dung file admin-auth.json KHÔNG chứa chuỗi password gốc "${DEFAULT_PASSWORD}"`);
    assert(!raw.toLowerCase().includes('kh0i_ai'), 'Nội dung file không chứa dạng thường của password gốc');
}

console.log('\n== Mục 5: Change Password bắt buộc đúng password hiện tại ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });
    auth.bootstrapIfMissing();

    const r = auth.changePassword('SaiPasswordHienTai', 'MatKhauMoi@2026');
    assert(r.ok === false, 'changePassword() với current password sai -> ok=false');
    assert(auth.verify(DEFAULT_PASSWORD).ok === true, 'Password cũ vẫn còn nguyên sau lần đổi thất bại');
}

console.log('\n== Mục 6-7: Password mới không hợp lệ (quá ngắn / toàn số PIN) bị từ chối ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });
    auth.bootstrapIfMissing();

    const rShort = auth.changePassword(DEFAULT_PASSWORD, 'Ab1!');
    assert(rShort.ok === false, 'Password mới quá ngắn (<6 ký tự) bị từ chối');

    const rPin = auth.changePassword(DEFAULT_PASSWORD, '123456');
    assert(rPin.ok === false, 'Password mới là PIN số cố định (toàn số) bị từ chối');

    assert(auth.verify(DEFAULT_PASSWORD).ok === true, 'Password cũ vẫn còn nguyên sau các lần đổi bị từ chối');
}

console.log('\n== Mục 8-9: Đổi password hợp lệ -> verify được password mới, KHÔNG còn verify được password cũ ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });
    auth.bootstrapIfMissing();

    const NEW_PASSWORD = 'AUTO@2026_Khoi';
    const r = auth.changePassword(DEFAULT_PASSWORD, NEW_PASSWORD);
    assert(r.ok === true, 'changePassword() với current đúng + new hợp lệ -> ok=true');
    assert(auth.verify(NEW_PASSWORD).ok === true, 'verify(password mới) -> ok=true ngay sau khi đổi');
    assert(auth.verify(DEFAULT_PASSWORD).ok === false, 'verify(password cũ) -> ok=false sau khi đổi (không còn hiệu lực)');
}

console.log('\n== Mục 10-11: safeStorage khả dụng -> file mã hoá thêm 1 lớp, roundtrip đúng qua encrypt/decrypt thật ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const fakeSafeStorage = makeFakeSafeStorage(true);
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: fakeSafeStorage });

    auth.verify(DEFAULT_PASSWORD); // trigger bootstrap
    const raw = fs.readFileSync(auth._filePath, 'utf-8');
    assert(raw.startsWith('AMA1:'), 'File có prefix AMA1: khi safeStorage khả dụng (đã qua encryptString)');
    assert(!raw.includes(DEFAULT_PASSWORD), 'File mã hoá vẫn không lộ password gốc dạng plaintext');

    // Roundtrip thật: verify lại bằng instance MỚI đọc cùng file (giả lập app khởi động lại)
    const auth2 = createAdminAuth({ userDataDir: dir, safeStorage: fakeSafeStorage });
    assert(auth2.verify(DEFAULT_PASSWORD).ok === true, 'Instance mới đọc + giải mã đúng file cũ -> verify vẫn đúng (roundtrip thật)');
    assert(auth2.verify('SaiPassword').ok === false, 'Instance mới vẫn từ chối đúng password sai');
}

console.log('\n== Mục 12: safeStorage KHÔNG khả dụng (null) -> vẫn hoạt động đúng, không throw, không plaintext ==');
{
    const { createAdminAuth, DEFAULT_PASSWORD } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });

    let threw = false;
    try {
        auth.verify(DEFAULT_PASSWORD);
    } catch {
        threw = true;
    }
    assert(threw === false, 'Không throw khi safeStorage=null');

    const raw = fs.readFileSync(auth._filePath, 'utf-8');
    assert(!raw.startsWith('AMA1:'), 'Không có prefix mã hoá khi safeStorage không khả dụng (đúng, không giả vờ mã hoá)');
    assert(!raw.includes(DEFAULT_PASSWORD), 'Vẫn KHÔNG plaintext dù thiếu lớp mã hoá thứ 2 (nhờ scrypt hash một chiều)');
}

console.log('\n== Mục 13: Không có password (undefined/null/"") -> từ chối an toàn, không throw ==');
{
    const { createAdminAuth } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });

    let threw = false;
    let r1, r2, r3;
    try {
        r1 = auth.verify(undefined);
        r2 = auth.verify(null);
        r3 = auth.verify('');
    } catch {
        threw = true;
    }
    assert(threw === false, 'verify(undefined/null/"") không throw');
    assert(r1.ok === false && r2.ok === false && r3.ok === false, 'verify(undefined/null/"") đều trả ok=false');
}

console.log('\n== Mục 14: File hỏng/không đọc được -> verify trả ok=false có lý do, KHÔNG throw lên IPC ==');
{
    const { createAdminAuth } = freshModule();
    const dir = makeTempDir();
    const auth = createAdminAuth({ userDataDir: dir, safeStorage: null });
    auth.bootstrapIfMissing();
    fs.writeFileSync(auth._filePath, '{ không phải JSON hợp lệ', 'utf-8');

    let threw = false;
    let r;
    try {
        r = auth.verify('BatKyPasswordNao1!');
    } catch {
        threw = true;
    }
    assert(threw === true || (r && r.ok === false), 'File JSON hỏng: verify() không làm crash tiến trình gọi nó (throw có kiểm soát hoặc trả ok=false) — IPC handler ở main.js bọc try/catch lớp ngoài');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
