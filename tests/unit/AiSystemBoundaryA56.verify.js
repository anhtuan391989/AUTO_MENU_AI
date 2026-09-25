/**
 * AiSystemBoundaryA56.verify.js — TASK A56 (Audit + Boundary lock, KHÔNG sửa engine)
 * ---------------------------------------------------------------------------
 * A56 là task AUDIT — file này KHÔNG viết lại logic của keyEngine/bpmEngine/modEngine/
 * AIContext/PluginController để test (những file đó không bị A56 sửa), mà đọc THẲNG
 * source thật của chúng để xác nhận cấu trúc/hợp đồng (contract) đúng như audit đã ghi
 * trong A56-REPORT.md. Đây là cách verify khả thi duy nhất không cần Electron/Windows
 * thật (audio thật, GPU thật) — các phần cần runtime thật được ghi NOT VERIFIED.
 *
 * Chạy: node tests/unit/AiSystemBoundaryA56.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const rendererSrc = read('ui/js/renderer.js');
const mainSrc = read('app/main.js');
const preloadSrc = read('app/preload.js');
const aiContextSrc = read('core/ai/AIContext.js');
const aiBootstrapSrc = read('core/ai/AIBootstrap.js');
const controlSourceSrc = read('core/shared/ControlSource.js');
const pluginControllerSrc = read('core/ai/plugin/PluginController.js');
const manualPriorityGuardSrc = read('core/shared/ManualPriorityGuard.js');
const vocalRouterSrc = read('ui/js/vocalCommandRouter.js');
// TASK A62 — TASK B58/C62 đã chuyển phần khởi tạo SYSTEM_AUDIO (deviceId/constraints/gate
// "không rơi về mic mặc định") từ renderer.js sang file MỚI ui/js/audioSource.js. A56.4/5 dưới
// đây kiểm tra ĐÚNG vị trí production hiện tại thay vì tìm logic cũ đã dời đi (xem
// A62-CLOSE-VERIFY.md mục "Production location mới" cho bằng chứng đối chiếu đầy đủ).
const audioSourceSrc = read('ui/js/audioSource.js');

console.log('== A56.1 — Runtime entry duy nhất cho Key/BPM/Mod: 1 interface, không có đường tắt ==');
{
    const reportCalls = (rendererSrc.match(/window\.electronAPI\?\.reportAiResult\(\s*["'](key|bpm|mod)["']/g) || []);
    assert(reportCalls.length === 3, `renderer.js gọi reportAiResult() đúng 3 lần (key/bpm/mod), mỗi loại 1 lần (thực tế: ${reportCalls.length})`);
    assert(/reportAiResult:\s*\(type, payload\)\s*=>\s*ipcRenderer\.send\("ai-result"/.test(preloadSrc),
        'preload.js: reportAiResult() là cổng DUY NHẤT gửi "ai-result" qua IPC');
    assert((mainSrc.match(/ipcMain\.on\("ai-result"/g) || []).length === 1,
        'app/main.js: chỉ có đúng 1 handler ipcMain.on("ai-result") (không có handler trùng/khác tên làm đường tắt)');
    assert(!/ipcMain\.(on|handle)\("ai-result-2"|ipcMain\.(on|handle)\("ai-key-result"/.test(mainSrc),
        'Không có kênh IPC "phụ"/duplicate nào khác cho Key/BPM/Mod ngoài "ai-result"');
}

console.log('\n== A56.2/3 — AIContext.js (lõi Core) không bao giờ đụng Manual state ==');
{
    assert(!/[Mm]anual/.test(aiContextSrc),
        'core/ai/AIContext.js không có bất kỳ tham chiếu nào tới "manual"/"Manual" (không có đường AI ghi vào Manual state ở tầng Core)');
    assert(/updateKey\(/.test(aiContextSrc) && /updateBpm\(/.test(aiContextSrc) && /updateMod\(/.test(aiContextSrc),
        'AIContext có đủ updateKey/updateBpm/updateMod — đúng 3 nhánh Key/BPM/Mod');
    assert(!/require\(["'].*ManualState/.test(aiContextSrc),
        'AIContext.js không require ManualState — không có cách nào ghi trực tiếp vào Manual từ Core');
}

console.log('\n== A56.3 — Manual/AI Key isolation ở renderer.js (đã có từ trước A56, audit lại) ==');
{
    assert(/const keySource = \{/.test(rendererSrc), 'renderer.js có object keySource (chứa cả .ai và .manual)');
    assert(/keySource\.ai\b/.test(rendererSrc) && /keySource\.manual\b/.test(rendererSrc),
        'renderer.js có cả keySource.ai và keySource.manual — 2 state tách biệt');

    // Không có dòng nào gán trực tiếp giá trị .ai.* sang .manual.* (kiểu keySource.manual.xxx = keySource.ai.xxx)
    const crossAssignRe = /keySource\.manual\.\w+\s*=\s*keySource\.ai\./g;
    assert(!crossAssignRe.test(rendererSrc), 'Không có dòng nào gán keySource.manual.X = keySource.ai.Y (không có đường AI -> Manual state)');

    // Manual SEND (commit) không được tự ý gán từ AI — tìm hàm commit/SEND Manual, xác nhận
    // nó đọc từ biến do USER chọn (selectedKey/dropdown), không đọc từ keySource.ai.value.
    assert(/keySource\.manual\.tickHandle/.test(rendererSrc), 'Manual có cơ chế đếm ngược riêng (tickHandle) — độc lập vòng đời với AI');
}

console.log('\n== A56.4/5 — Audio input cho Key/BPM/Mod: bắt buộc chọn thiết bị ở Setup, KHÔNG fallback mic mặc định ==');
{
    // TASK A62 — 4 assertion dưới đây trước kia tìm logic trong renderer.js (kiến trúc trước
    // B58). B58/C62 đã tách phần chọn/khởi tạo SYSTEM_AUDIO ra ui/js/audioSource.js — sửa lại
    // ĐÚNG vị trí production hiện tại, KHÔNG đổi ý nghĩa/độ chặt của assertion, KHÔNG yêu cầu
    // production quay lại kiến trúc cũ (đúng chỉ dẫn A62).
    // TASK A65 — GAP-1 audit trong A64-REPORT.md: "selectedSoundcardId" là dropdown Setup CHUNG
    // (mọi audioinput, không lọc loopback) và trên máy thật giá trị đó là Mix 01/MIC — coi nó là
    // SYSTEM_AUDIO chính là root cause khiến BPM/Key/Mod phân tích MIC. A65 xoá fallback này:
    // SYSTEM_AUDIO giờ đọc RIÊNG "selectedSystemAudioDeviceId" (xem A65-REPORT.md). Assertion cũ
    // (kiểm tra CÒN fallback selectedSoundcardId) SIẾT LẠI ngược lại — kiểm tra ĐÚNG THÂN HÀM
    // getSystemAudioDeviceId() (không phải toàn file, vì comment giải thích lịch sử vẫn hợp lệ
    // nhắc tới chuỗi "selectedSoundcardId").
    const getSystemAudioDeviceIdFnMatch = audioSourceSrc.match(/function getSystemAudioDeviceId\(\) \{[\s\S]*?\n    \}/);
    assert(!!getSystemAudioDeviceIdFnMatch, 'Tìm thấy thân hàm getSystemAudioDeviceId() trong audioSource.js để kiểm tra');
    const getSystemAudioDeviceIdFnBody = getSystemAudioDeviceIdFnMatch ? getSystemAudioDeviceIdFnMatch[0] : '';
    assert(!/selectedSoundcardId/.test(getSystemAudioDeviceIdFnBody),
        'TASK A65: getSystemAudioDeviceId() KHÔNG còn fallback đọc "selectedSoundcardId" (GAP-1 A64 đã đóng — SYSTEM_AUDIO không còn ngầm định = Mix 01/MIC)');
    assert(/getSetting\(\s*["']selectedSystemAudioDeviceId["']/.test(getSystemAudioDeviceIdFnBody),
        'TASK A65: getSystemAudioDeviceId() đọc đúng key RIÊNG "selectedSystemAudioDeviceId" — tách biệt khỏi dropdown Setup chung selectedSoundcardId');
    assert(/deviceId:\s*\{\s*exact:\s*deviceId\s*\}/.test(audioSourceSrc),
        'ui/js/audioSource.js: getUserMedia dùng deviceId: {exact: deviceId} — KHÔNG dùng "ideal" (thứ có thể âm thầm rơi về thiết bị khác) — biến đổi tên từ "soundcardId" -> "deviceId" khi B58 tổng quát hoá hàm này dùng chung cho cả MIC/SYSTEM_AUDIO, hành vi exact-match không đổi');

    // Gate "không rơi về mic mặc định" giờ nằm ở 2 lớp, phải xác nhận CẢ 2:
    //   (a) audioSource.js: start() không gọi getUserMedia nếu thiếu deviceId VÀ
    //       requireExplicitDevice=true (chỉ SYSTEM_AUDIO bật cờ này — xem assertion riêng bên dưới)
    //   (b) renderer.js: KeyEngine.init()/BPMEngine.init() CHỈ được gọi bên trong
    //       bindAiEnginesToSystemAudio(), hàm này CHỈ được onStateChange gọi khi state === RUNNING
    //       — không có đường nào khác gọi trực tiếp KeyEngine.init() nữa.
    assert(/if \(!deviceId && options\.requireExplicitDevice\)/.test(audioSourceSrc) &&
        /setState\(AudioSourceState\.NO_DEVICE\)/.test(audioSourceSrc),
        'ui/js/audioSource.js: start() chủ động dừng ở NO_DEVICE (không gọi getUserMedia) khi thiếu deviceId và requireExplicitDevice=true — không rơi về mic mặc định của trình duyệt');
    assert(/requireExplicitDevice:\s*true/.test(audioSourceSrc.slice(audioSourceSrc.indexOf('function createSystemAudioSource'))),
        'createSystemAudioSource() (không phải createMicSource()) truyền requireExplicitDevice:true — đúng CHỈ SYSTEM_AUDIO bắt buộc chọn thiết bị tường minh, MIC thì không (đúng bản chất khác nhau của 2 loại nguồn)');
    const bindFnBody = (rendererSrc.match(/function bindAiEnginesToSystemAudio\([\s\S]*?\n\}/) || [''])[0];
    assert(/KeyEngine\.init\(audioContext, source\)/.test(bindFnBody) && /BPMEngine\.init\(audioContext, source\)/.test(bindFnBody),
        'renderer.js: KeyEngine.init()/BPMEngine.init() nằm bên trong bindAiEnginesToSystemAudio() — hàm DUY NHẤT gọi 2 init này (đã xác nhận ở A56.1 kiểu test đếm số lần xuất hiện tương tự)');
    assert(/systemAudio\.onStateChange\(\(state\) => \{\s*if \(state !== AudioSourceState\.RUNNING\) return;\s*bindAiEnginesToSystemAudio\(systemAudio\);/.test(rendererSrc),
        'renderer.js: bindAiEnginesToSystemAudio() CHỈ được gọi khi onStateChange báo state===RUNNING — không có đường nào gọi KeyEngine.init() khi audioSource chưa RUNNING (tức chưa có device hợp lệ), giữ đúng bất biến "không init khi chưa chọn Soundcard" dù cơ chế đã đổi từ if-inline sang event-driven (đúng kiến trúc C62 auto-reconnect)');
    assert(/KHÔNG khởi tạo Key\/BPM\/MOD/.test(rendererSrc),
        'renderer.js vẫn còn nguyên thông điệp "KHÔNG khởi tạo Key/BPM/MOD" khi systemAudio không đạt RUNNING (NO_DEVICE) — cùng ý nghĩa cũ, chỉ khác vị trí code (nay nằm trong nhánh xử lý sau await systemAudio.start(), không phải if-inline ngay sau getUserMedia)');

    assert(/echoCancellation:\s*false/.test(audioSourceSrc) && /noiseSuppression:\s*false/.test(audioSourceSrc) && /autoGainControl:\s*false/.test(audioSourceSrc),
        'ui/js/audioSource.js: tắt các bộ lọc tối ưu cho giọng nói (echo/noise/AGC) — xác nhận luồng audio này được thiết kế cho NHẠC, không phải MIC/voice (đúng vị trí mới)');

    // Có ĐÚNG 1 chỗ khác trong renderer.js gọi getUserMedia({audio:true}) không ràng buộc thiết
    // bị: listAudioInputDevices() — chỉ xin quyền tạm để enumerateDevices() lấy device LABEL
    // (giới hạn của trình duyệt: label rỗng nếu chưa có permission), rồi DỪNG stream ngay,
    // KHÔNG truyền vào BPMEngine/KeyEngine.init() nào. Audit riêng hàm này để không nhầm với
    // luồng audio thật của Key/BPM/Mod (đã xác nhận ở các assert phía trên dùng deviceId: exact).
    // KHÔNG đổi phần này — listAudioInputDevices() vẫn ở renderer.js, không bị B58/C62 di dời.
    const listDevicesMatch = rendererSrc.match(/async function listAudioInputDevices\(\)[\s\S]*?\n\}/);
    assert(!!listDevicesMatch, 'Tìm thấy hàm listAudioInputDevices() (nơi DUY NHẤT còn lại gọi getUserMedia không ràng buộc thiết bị)');
    const listDevicesBody = listDevicesMatch ? listDevicesMatch[0] : '';
    assert(/getUserMedia\(\{\s*audio:\s*true\s*\}\)/.test(listDevicesBody),
        'listAudioInputDevices(): xác nhận đúng là hàm chứa getUserMedia({audio:true}) không ràng buộc');
    assert(!/BPMEngine\.init|KeyEngine\.init|ModEngine\.init/.test(listDevicesBody),
        'listAudioInputDevices() KHÔNG truyền stream của nó vào BPMEngine/KeyEngine/ModEngine.init() — chỉ dùng để liệt kê tên thiết bị, không phải nguồn phân tích AI');
    assert(/stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/.test(listDevicesBody),
        'listAudioInputDevices() dừng stream ngay sau khi đọc xong danh sách thiết bị (không giữ lại, không rò rỉ vào phân tích)');

    // Đúng 1 lệnh getUserMedia({audio:true}) không ràng buộc trong TOÀN BỘ file, và nó chính
    // là hàm listAudioInputDevices() vừa audit ở trên — không còn chỗ nào khác.
    const allUnconstrained = (rendererSrc.match(/getUserMedia\(\{\s*audio:\s*true\s*\}\)/g) || []);
    assert(allUnconstrained.length === 1,
        `Chỉ có đúng 1 lệnh getUserMedia({audio:true}) không ràng buộc trong renderer.js, và nó thuộc listAudioInputDevices() (thực tế: ${allUnconstrained.length} lệnh)`);
}

console.log('\n== A56.6 — AI -> Menu boundary: ControlSource là nguồn DUY NHẤT, mặc định LEGACY_CONTROL (an toàn) ==');
{
    assert(/CURRENT_MODE\s*=\s*MODES\.LEGACY_CONTROL/.test(controlSourceSrc),
        'ControlSource.js: CURRENT_MODE mặc định = LEGACY_CONTROL (PluginController KHÔNG tự phát PLUGIN_COMMAND theo mặc định hiện tại)');
    assert(/require\(["'].*shared\/ControlSource["']\)/.test(pluginControllerSrc),
        'PluginController.js đọc ControlSource từ ĐÚNG 1 nguồn dùng chung (core/shared/ControlSource.js), không tự giữ bản sao riêng');
    assert(/isLegacyControl\(\)/.test(pluginControllerSrc),
        'PluginController.js có nhánh kiểm tra isLegacyControl() để KHÔNG gửi PLUGIN_COMMAND khi đang LEGACY_CONTROL');
    assert(/ManualPriorityGuard/.test(pluginControllerSrc),
        'PluginController.js có gọi ManualPriorityGuard — dù ở AI_CONTROL, Manual Key/Mod đang active vẫn được ưu tiên chặn AI (fail-safe)');
    assert(/TUYỆT ĐỐI KHÔNG:.*publish event/.test(manualPriorityGuardSrc.replace(/\n/g, ' ')),
        'ManualPriorityGuard.js là hàm thuần (pure) — không tự publish event/đổi state, chỉ trả kết quả cho nơi gọi quyết định');
}

console.log('\n== A56.6 (tiếp) — vocalCommandRouter.js là ACTUATOR downstream, không phải nơi AI gọi trực tiếp ==');
{
    assert(!/reportAiResult|electronAPI\.reportAiResult/.test(vocalRouterSrc),
        'vocalCommandRouter.js không tự gọi reportAiResult (nó là actuator downstream, không phải nguồn phát AI result)');
    assert(!/AIContext|core\/ai/.test(vocalRouterSrc),
        'vocalCommandRouter.js không require/tham chiếu core/ai — tách biệt tầng actuator khỏi tầng AI state');
}

console.log('\n== A56.1 — Dead/scaffold code KHÔNG được require bởi runtime thật (AIBootstrap) ==');
{
    assert(!/require\(["'].*kernel\/BootLoader/.test(aiBootstrapSrc),
        'AIBootstrap.js (điểm khởi động AI THẬT, được app/main.js gọi) KHÔNG require core/ai/kernel/BootLoader.js (nhánh kernel/engines trùng lặp là DEAD CODE, không chạy)');
    assert(/require\(["']\.\/AIBrain["']\)/.test(aiBootstrapSrc), 'AIBootstrap.js require AIBrain (thành phần thật)');
    assert(/require\(["']\.\/AnalysisState["']\)/.test(aiBootstrapSrc) &&
        /require\(["']\.\/inference\/InferenceEngine["']\)/.test(aiBootstrapSrc) &&
        /require\(["']\.\/aggregation\/ResultQueue["']\)/.test(aiBootstrapSrc) &&
        /require\(["']\.\/workflow\/WorkflowManager["']\)/.test(aiBootstrapSrc) &&
        /require\(["']\.\/plugin\/PluginController["']\)/.test(aiBootstrapSrc),
        'AIBootstrap.js require đủ chuỗi pipeline THẬT: AnalysisState -> InferenceEngine -> ResultQueue -> WorkflowManager -> PluginController');
    assert(/await AIBootstrap\.initialize\(\)/.test(mainSrc), 'app/main.js thực sự gọi AIBootstrap.initialize() lúc khởi động (không chỉ định nghĩa suông)');
}

console.log('\n== A56.7 — AI Setup Lock: xác nhận lại (không sửa gì, chỉ audit) tests A52/A53 vẫn còn & PASS ==');
{
    const a53Path = path.join(root, 'tests', 'unit', 'AiTabAdminLockA53.verify.js');
    const a52Path = path.join(root, 'tests', 'unit', 'AdminAuthA52.verify.js');
    assert(fs.existsSync(a53Path), 'tests/unit/AiTabAdminLockA53.verify.js vẫn còn tồn tại trong repo');
    assert(fs.existsSync(a52Path), 'tests/unit/AdminAuthA52.verify.js vẫn còn tồn tại trong repo');
    const adminAuthSrc = read('core/shared/AdminAuth.js');
    assert(/scryptSync|scrypt/.test(adminAuthSrc), 'core/shared/AdminAuth.js vẫn dùng scrypt hash (không plaintext)');
    assert(!/["'`]Kh0i_AI!["'`]\s*===/.test(adminAuthSrc), 'AdminAuth.js không so sánh trực tiếp password với literal "Kh0i_AI!" (so sánh qua hash, không phải string literal so sánh thẳng)');
    assert(!/console\.(log|error)\([^)]*\bpassword\b/i.test(adminAuthSrc), 'AdminAuth.js không log biến password nào');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
