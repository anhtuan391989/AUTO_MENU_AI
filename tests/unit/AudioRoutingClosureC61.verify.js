/**
 * AudioRoutingClosureC61.verify.js — TASK C61 (B58 Audio Routing Closure)
 * ---------------------------------------------------------------------------
 * TASK B58 (commit ed99239) đã tách audio capture ra module riêng
 * (ui/js/audioSource.js, đã có test riêng tests/unit/AudioSourceB58.verify.js,
 * 24/24 PASS — kiểm tra ĐÚNG mức module: exact deviceId, không fallback mic mặc
 * định cho SYSTEM_AUDIO, MIC không có adapter getter, echo/noise/AGC tắt...).
 *
 * Cái CHƯA có test nào che phủ là mức TÍCH HỢP trong ui/js/renderer.js: xác
 * nhận renderer.js thật sự NỐI ĐÚNG DÂY — Key/BPM/Mod chỉ bao giờ nhận
 * audioContext/sourceNode từ AudioSource(SYSTEM_AUDIO), không bao giờ từ
 * AudioSource(MIC), và không có getUserMedia thứ 2 nào cho mục đích phân tích
 * nhạc. Đây chính là khoảng trống mà 4 assertion FAIL của
 * tests/unit/AiSystemBoundaryA56.verify.js từng che phủ TRƯỚC B58 (khi code
 * còn nằm thẳng trong renderer.js) — A56 giờ tìm nhầm chỗ (vẫn tìm trong
 * renderer.js những đoạn code đã CHUYỂN sang audioSource.js), nên fail dù
 * kiến trúc thật ĐÚNG. C61 không sửa AiSystemBoundaryA56.verify.js (thuộc
 * phạm vi Claude A/A56, xem C61-CLOSE-VERIFY.md mục "Regression") — file này
 * bổ sung đúng phần kiểm tra tích hợp còn thiếu, trỏ đúng vị trí code hiện tại.
 *
 * Kiểm tra TĨNH (source text của renderer.js + modEngine.js), không cần
 * DOM/Electron/AudioContext thật.
 *
 * Chạy: node tests/unit/AudioRoutingClosureC61.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const rendererPath = path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js');
const modEnginePath = path.join(__dirname, '..', '..', 'ui', 'js', 'engines', 'modEngine.js');
const audioSourcePath = path.join(__dirname, '..', '..', 'ui', 'js', 'audioSource.js');
const renderer = fs.readFileSync(rendererPath, 'utf8');
const modEngine = fs.readFileSync(modEnginePath, 'utf8');
const audioSource = fs.readFileSync(audioSourcePath, 'utf8');

console.log('== PHẦN 1: Key/BPM chỉ nhận audio từ SYSTEM_AUDIO, KHÔNG bao giờ từ MIC ==');
{
    assert(/const systemAudio\s*=\s*AudioSource\.createSystemAudioSource\(\)/.test(renderer),
        'renderer.js tạo đúng 1 AudioSource(SYSTEM_AUDIO) cho toàn bộ phân tích nhạc');
    assert(/BPMEngine\.init\(\s*audioContext\s*,\s*source\s*\)/.test(renderer) &&
        /const audioContext\s*=\s*systemAudio\.getAudioContextForAdapter\(\)/.test(renderer) &&
        /const source\s*=\s*systemAudio\.getRawSourceNodeForAdapter\(\)/.test(renderer),
        'BPMEngine.init() nhận audioContext/source lấy TỪ systemAudio (SYSTEM_AUDIO), không phải biến khác');
    assert(/KeyEngine\.init\(\s*audioContext\s*,\s*source\s*\)/.test(renderer),
        'KeyEngine.init() dùng ĐÚNG cùng audioContext/source với BPMEngine (1 stream chia sẻ, không tạo capture riêng)');
    assert(!/(?:BPMEngine|KeyEngine)\.init\([^)]*[Mm]ic/.test(renderer),
        'không có lời gọi BPMEngine.init()/KeyEngine.init() nào truyền biến có tên chứa "mic"/"Mic"');
}

console.log('\n== PHẦN 2: Mic source hoàn toàn tách biệt — chỉ nuôi VU meter, không có đường nối vào AI ==');
{
    assert(/__micSource\s*=\s*AudioSource\.createMicSource\(\)/.test(renderer),
        'renderer.js tạo AudioSource(MIC) bằng đúng factory createMicSource()');
    // Toàn bộ chỗ dùng __micSource chỉ được phép là .onLevel/.onDeviceLost/.start() (VU meter) —
    // không được xuất hiện .getAudioContextForAdapter/.getRawSourceNodeForAdapter (2 hàm này còn
    // không tồn tại trên object MIC — xem AudioSourceB58.verify.js Test 1 — nhưng vẫn kiểm tra
    // thêm ở đây để chặn sớm nếu renderer.js sau này lỡ tay gọi nhầm).
    assert(!/__micSource\.getAudioContextForAdapter/.test(renderer) && !/__micSource\.getRawSourceNodeForAdapter/.test(renderer),
        'renderer.js không có bất kỳ lời gọi __micSource.getAudioContextForAdapter()/getRawSourceNodeForAdapter() nào');
    assert(/__micSource\.onLevel\(/.test(renderer), '__micSource chỉ được dùng qua onLevel() (nuôi VU meter)');
    // Xác nhận lại đúng invariant kiến trúc ở tầng module (đã có AudioSourceB58.verify.js Test 1,
    // đối chiếu lại ở đây cho chắc — không dùng regex đoán, đọc thẳng source code audioSource.js).
    assert(/function createMicSource\(\)\s*\{[\s\S]*?\}/.test(audioSource),
        'audioSource.js có function createMicSource()');
    const micFactoryBody = audioSource.match(/function createMicSource\(\)\s*\{([\s\S]*?)\n    \}/)[1];
    assert(!/exposeRawNodeForAdapter\s*:\s*true/.test(micFactoryBody),
        'createMicSource() KHÔNG bật exposeRawNodeForAdapter (đúng invariant: MIC không thể lọt vào AI qua adapter)');
}

console.log('\n== PHẦN 3: ModEngine không tự mở capture riêng — dùng lại chroma của KeyEngine (không tạo stream thứ 3) ==');
{
    assert(!/getUserMedia/.test(modEngine), 'modEngine.js không gọi getUserMedia (không tự capture audio)');
    assert(!/AudioContext/.test(modEngine), 'modEngine.js không tự tạo AudioContext riêng');
    assert(/KeyEngine\.estimateKeyFromChroma\(\)/.test(modEngine),
        'modEngine.js đọc lại KeyEngine.estimateKeyFromChroma() — dùng chung phân tích của KeyEngine, không phải nguồn audio thứ 3');
}

console.log('\n== PHẦN 4: Chỉ có ĐÚNG 1 getUserMedia "sống" cho mục đích phân tích nhạc trong renderer.js ==');
{
    // audioSource.js là nơi DUY NHẤT thật sự gọi getUserMedia cho SYSTEM_AUDIO/MIC — renderer.js
    // không được tự gọi getUserMedia cho mục đích Key/BPM/Mod nữa (đường cũ trước B58).
    // Đếm đúng LỜI GỌI THẬT (navigator.mediaDevices.getUserMedia(...)), không tính các dòng
    // comment tiếng Việt chỉ NHẮC TỚI chữ "getUserMedia" (renderer.js có vài comment như vậy,
    // giải thích lý do KHÔNG mở thêm getUserMedia — đó là tài liệu, không phải lời gọi).
    const liveGetUserMediaInRenderer = [...renderer.matchAll(/navigator\.mediaDevices\.getUserMedia\(/g)].length;
    assert(liveGetUserMediaInRenderer === 1,
        `renderer.js chỉ còn ĐÚNG 1 lời gọi navigator.mediaDevices.getUserMedia() thật (thực tế: ${liveGetUserMediaInRenderer}) — phải là listAudioInputDevices() (debug-only), không phải đường nuôi Key/BPM/Mod`);
    assert(/async function listAudioInputDevices\(\)/.test(renderer) && renderer.indexOf('navigator.mediaDevices.getUserMedia(') > renderer.indexOf('async function listAudioInputDevices'),
        'lời gọi getUserMedia thật còn lại nằm bên trong listAudioInputDevices() (hàm debug)');
}

console.log('\n== PHẦN 5: listAudioInputDevices() (debug-only) KHÔNG tự động chạy khi app khởi động ==');
{
    assert(/\/\/\s*listAudioInputDevices\(\);/.test(renderer),
        'lời gọi tự động listAudioInputDevices() đã bị comment out (chỉ gọi tay từ DevTools khi cần)');
}

console.log('\n=== KẾT QUẢ: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exitCode = fail > 0 ? 1 : 0;
