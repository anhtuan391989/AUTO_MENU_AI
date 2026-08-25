/**
 * ManualState.verify.js — TASK B3-C
 * ---------------------------------------------------------------------------
 * Test trực tiếp core/shared/ManualState.js (module Node thuần, không cần mock gì) — bao phủ
 * đúng các mục 1-7 trong danh sách 14 test bắt buộc của B3-C (phần CÓ THỂ chạy được, vì
 * ManualPriorityGuard — mục 8-14 — KHÔNG tồn tại trong repo, xem báo cáo B3-C).
 *
 * Chạy: node tests/unit/ManualState.verify.js
 */
'use strict';

const path = require('path');
const manualStatePath = path.join(__dirname, '..', '..', 'core', 'shared', 'ManualState.js');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

function freshModule() {
    delete require.cache[require.resolve(manualStatePath)];
    return require(manualStatePath);
}

console.log('== Mục 7: chưa từng nhận state -> getManualState() = null (KHÔNG suy ra false) ==');
{
    const ManualState = freshModule();
    assert(ManualState.getManualState() === null, 'getManualState() = null trước khi setManualState() lần nào được gọi');
}

console.log('\n== Mục 1-2: Manual Key inactive/active được lưu đúng ==');
{
    const ManualState = freshModule();
    let r = ManualState.setManualState({ keyActive: false, modActive: false, timestamp: 1000 });
    assert(r.ok === true, 'setManualState() chấp nhận snapshot hợp lệ');
    assert(ManualState.getManualState().keyActive === false, 'keyActive=false được lưu đúng');

    r = ManualState.setManualState({ keyActive: true, modActive: false, timestamp: 2000 });
    assert(ManualState.getManualState().keyActive === true, 'keyActive=true được lưu đúng');
}

console.log('\n== Mục 3-4: Manual Mod inactive/active được lưu đúng ==');
{
    const ManualState = freshModule();
    ManualState.setManualState({ keyActive: false, modActive: false, timestamp: 1000 });
    assert(ManualState.getManualState().modActive === false, 'modActive=false được lưu đúng');

    ManualState.setManualState({ keyActive: false, modActive: true, timestamp: 2000 });
    assert(ManualState.getManualState().modActive === true, 'modActive=true được lưu đúng');
}

console.log('\n== Mục 5: timestamp được truyền NGUYÊN VẸN, không bị ghi đè bằng Date.now() nội bộ ==');
{
    const ManualState = freshModule();
    const FIXED_TIMESTAMP = 1234567890; // giá trị cố định, không phải "thời điểm hiện tại" -> nếu module tự gán Date.now() thì test này sẽ fail chắc chắn
    ManualState.setManualState({ keyActive: true, modActive: false, timestamp: FIXED_TIMESTAMP });
    assert(ManualState.getManualState().timestamp === FIXED_TIMESTAMP, `timestamp lưu đúng nguyên văn ${FIXED_TIMESTAMP} (thực tế: ${ManualState.getManualState().timestamp})`);
}

console.log('\n== Mục 6: state thay đổi -> snapshot MỚI thay thế snapshot cũ (không cộng dồn, không giữ bản cũ) ==');
{
    const ManualState = freshModule();
    ManualState.setManualState({ keyActive: false, modActive: false, timestamp: 1000 });
    ManualState.setManualState({ keyActive: true, modActive: true, timestamp: 5000 });
    const s = ManualState.getManualState();
    assert(s.keyActive === true && s.modActive === true && s.timestamp === 5000, `snapshot mới nhất thắng, không còn dấu vết snapshot cũ (thực tế: ${JSON.stringify(s)})`);
}

console.log('\n== Không tự tính stale/missing trong ManualState.js — chỉ lưu/trả nguyên văn (Mục 5 đề bài: việc đó thuộc về Guard) ==');
{
    const ManualState = freshModule();
    // timestamp CỐ TÌNH rất cũ (giả lập "stale") — ManualState.js KHÔNG được tự chặn/sửa lại,
    // chỉ lưu đúng những gì nhận được. Quyết định BLOCK vì stale là việc của Guard (chưa có).
    ManualState.setManualState({ keyActive: true, modActive: false, timestamp: 1 });
    assert(ManualState.getManualState().timestamp === 1, 'timestamp rất cũ (=1) vẫn được lưu nguyên văn, không bị "sửa hộ" hay chặn ở tầng này');
}

console.log('\n== Snapshot sai kiểu dữ liệu -> bị từ chối, KHÔNG ghi đè state cũ, KHÔNG throw ==');
{
    const ManualState = freshModule();
    ManualState.setManualState({ keyActive: true, modActive: false, timestamp: 100 });
    const before = ManualState.getManualState();

    const r1 = ManualState.setManualState({ keyActive: "yes", modActive: false, timestamp: 200 }); // sai kiểu
    assert(r1.ok === false, 'từ chối snapshot có keyActive không phải boolean');
    const r2 = ManualState.setManualState(null); // null hẳn
    assert(r2.ok === false, 'từ chối snapshot null, không throw');
    const r3 = ManualState.setManualState({}); // thiếu field
    assert(r3.ok === false, 'từ chối snapshot thiếu field');

    assert(JSON.stringify(ManualState.getManualState()) === JSON.stringify(before), 'state cũ KHÔNG bị ghi đè bởi bất kỳ snapshot không hợp lệ nào ở trên');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
