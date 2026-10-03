/**
 * A71SystemAudioSetup.verify.js
 * TASK A71 — SETUP SYSTEM_AUDIO DEVICE SELECTION.
 *
 * Kiểm tra tĩnh (đọc source, không cần Electron thật) các bất biến bắt buộc của A71:
 *   1. Setup UI có 2 mục ĐỘC LẬP: MIC (soundcardSelect, không đổi) và SYSTEM_AUDIO (systemAudioSelect, MỚI).
 *   2. Chọn SYSTEM_AUDIO ghi đúng "selectedSystemAudioDeviceId", KHÔNG đụng "selectedSoundcardId".
 *   3. Chọn None (giá trị rỗng) là hành động HỢP LỆ — không bị chặn bởi guard như nút Soundcard cũ.
 *   4. Thiết bị đã lưu không còn tồn tại -> chỉ đổi badge, KHÔNG tự xoá/tự đổi setting.
 *   5. notifySetupChanged() được gọi sau khi lưu -> tự nối lại cơ chế reconnect A65/C62 có sẵn.
 *   6. IPC 2 chiều trạng thái RUNTIME: preload.js expose đủ 3 hàm, main.js relay đúng chiều
 *      (renderer cửa sổ chính -> setupWin, KHÔNG phải mainWin).
 *   7. renderer.js: listener báo cáo state là 1 listener RIÊNG, không đụng vào listener cũ đã bị
 *      AiSystemBoundaryA56 audit (bindAiEnginesToSystemAudio() vẫn đứng một mình trong listener gốc).
 *
 * Không cần navigator/getUserMedia/Electron thật — thuần đọc text + regex, giống phong cách các
 * file test khác trong repo (AiSystemBoundaryA56, AudioRoutingClosureC61...).
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log('  OK  ', msg); }
    else { fail++; console.error('  FAIL ', msg); }
}

const setupHtml = fs.readFileSync(path.join(__dirname, '../../ui/setup.html'), 'utf8');
const setupSrc = fs.readFileSync(path.join(__dirname, '../../ui/js/setup.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(__dirname, '../../app/preload.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(__dirname, '../../app/main.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(__dirname, '../../ui/js/renderer.js'), 'utf8');

console.log('\n== A71.1 — Setup UI: 2 mục độc lập ==');
assert(/id="soundcardSelect"/.test(setupHtml), 'Mục MIC/Soundcard cũ (soundcardSelect) vẫn còn nguyên, không bị xoá/gộp');
assert(/id="systemAudioSelect"/.test(setupHtml), 'Mục SYSTEM_AUDIO MỚI (systemAudioSelect) đã có mặt');
assert(/id="btnSelectSystemAudio"/.test(setupHtml) && /id="btnClearSystemAudio"/.test(setupHtml),
    'Có đủ 2 nút: Chọn SYSTEM_AUDIO + Đặt về None');
assert(/id="systemAudioStatusBadge"/.test(setupHtml) && /id="systemAudioStateBadge"/.test(setupHtml),
    'Có 2 badge TÁCH BIỆT: đã-chọn-gì (persisted) và đang-chạy-gì (runtime) — không gộp làm 1');
assert(!/Desktop audio capture engine unavailable/.test(setupHtml),
    'Placeholder "Desktop Audio COMING SOON" cũ đã được thay thế (không còn tồn tại song song gây trùng lặp)');

console.log('\n== A71.2 — Không gộp field, không ghi đè selectedSoundcardId ==');
const initSysAudioFnBody = (setupSrc.match(/function initSystemAudioSection\(\)[\s\S]*?\n\}/) || [''])[0];
assert(initSysAudioFnBody.length > 0, 'Tìm thấy thân hàm initSystemAudioSection() trong setup.js');
assert(/saveSetting\(\s*["']selectedSystemAudioDeviceId["']/.test(initSysAudioFnBody),
    'initSystemAudioSection() ghi đúng key "selectedSystemAudioDeviceId"');
assert(!/saveSetting\(\s*["']selectedSoundcardId["']/.test(initSysAudioFnBody),
    'initSystemAudioSection() KHÔNG ghi vào "selectedSoundcardId" (không đụng cấu hình MIC)');
assert(/notifySetupChanged\(\)/.test(initSysAudioFnBody),
    'initSystemAudioSection() gọi notifySetupChanged() sau khi lưu -> nối lại cơ chế reconnect A65/C62 có sẵn');

console.log('\n== A71.3 — None là lựa chọn hợp lệ (không bị chặn) ==');
const btnSelectSysAudioHandler = (initSysAudioFnBody.match(/btnSelectSystemAudio["'][\s\S]*?\}\);/) || [''])[0];
assert(!/if \(!select\.value\)/.test(btnSelectSysAudioHandler),
    'Nút "Chọn SYSTEM_AUDIO" KHÔNG chặn giá trị rỗng (khác nút Soundcard cũ) — chọn None là hành động hợp lệ tường minh');

console.log('\n== A71.4 — Thiết bị đã lưu không còn tồn tại: không tự đổi/xoá ==');
const updateBadgeFnBody = (setupSrc.match(/function updateSystemAudioStatusBadge\([\s\S]*?\n\}/) || [''])[0];
assert(updateBadgeFnBody.length > 0, 'Tìm thấy thân hàm updateSystemAudioStatusBadge()');
assert(/không còn khả dụng/.test(updateBadgeFnBody), 'Có nhánh badge riêng cho "đã lưu nhưng không còn khả dụng"');
assert(!/saveSetting/.test(updateBadgeFnBody), 'updateSystemAudioStatusBadge() KHÔNG tự ghi lại setting nào (chỉ đọc + hiển thị, không tự sửa dữ liệu)');

console.log('\n== A71.5 — Tái dùng populateSoundcardOptions() với placeholder riêng (không tạo hàm trùng lặp) ==');
assert(/populateSoundcardOptions\(selectEl, selectedValue, placeholderText = /.test(setupSrc),
    'populateSoundcardOptions() có tham số placeholderText tuỳ chọn (mở rộng ngược tương thích, không đổi lời gọi cũ)');
assert(/populateSoundcardOptions\(select, savedId, "— None \/ Chưa chọn thiết bị —"\)/.test(initSysAudioFnBody),
    'initSystemAudioSection() tái dùng đúng populateSoundcardOptions() với placeholder "None" riêng cho SYSTEM_AUDIO');

console.log('\n== A71.6 — IPC 2 chiều trạng thái RUNTIME ==');
assert(/reportSystemAudioState:\s*\(state\)\s*=>\s*ipcRenderer\.send\("system-audio-state-changed"/.test(preloadSrc),
    'preload.js expose reportSystemAudioState() (renderer cửa sổ chính -> main process)');
assert(/onSystemAudioStateChange:\s*\(callback\)\s*=>\s*ipcRenderer\.on\("system-audio-state-changed"/.test(preloadSrc),
    'preload.js expose onSystemAudioStateChange() (main process -> renderer Setup)');
assert(/getSystemAudioState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("get-system-audio-state"\)/.test(preloadSrc),
    'preload.js expose getSystemAudioState() (query giá trị cache hiện tại, cho lúc Setup vừa mở)');
assert(/ipcMain\.on\("system-audio-state-changed",[\s\S]{0,150}setupWin\?\.webContents\.send\("system-audio-state-changed"/.test(mainSrc),
    'main.js relay ĐÚNG CHIỀU: system-audio-state-changed -> setupWin (KHÔNG PHẢI mainWin — chiều ngược với setup-changed)');
assert(/ipcMain\.handle\("get-system-audio-state"/.test(mainSrc),
    'main.js có handler trả lại giá trị cache lastKnownSystemAudioState cho lời gọi invoke');

console.log('\n== A71.7 — renderer.js: listener báo cáo TÁCH RIÊNG, không đụng listener gốc (giữ A56 PASS) ==');
// Chỉ đếm lời gọi THẬT trong code (loại các dòng comment giải thích cũng nhắc tới đúng chuỗi này).
const onStateChangeOccurrences = (rendererSrc.match(/^\s*systemAudio\.onStateChange\(/gm) || []).length;
assert(onStateChangeOccurrences === 2,
    `renderer.js có ĐÚNG 2 lời gọi THẬT (không tính comment) systemAudio.onStateChange() — 1 cái gốc (bindAiEnginesToSystemAudio, không đổi) + 1 cái MỚI (báo cáo IPC) (thực tế: ${onStateChangeOccurrences})`);
// TASK A74-02 — nới regex để chấp nhận thêm 1 dòng cập nhật nhãn AI State UI
// (__aiState.sysState = state; updateAiSourceStateLabel();) ngay sau dòng báo IPC gốc — đây là mở
// rộng HỢP LỆ (thuần hiển thị/báo cáo trạng thái, xem A73/A74-REPORT.md), KHÔNG phải logic BPM/
// Key. Bất biến THẬT giữ nguyên: listener này tuyệt đối không được gọi bindAiEnginesToSystemAudio
// hay BPMEngine/KeyEngine.init trực tiếp — assert riêng dòng dưới để khoá đúng phần cốt lõi.
const newListenerBlock = (rendererSrc.match(/systemAudio\.onStateChange\(\(state\) => \{\s*window\.electronAPI\?\.reportSystemAudioState\?\.\(\{ state \}\);[\s\S]*?\n    \}\);/) || [''])[0];
assert(newListenerBlock.length > 0,
    'Listener MỚI (báo IPC + nhãn AI State UI) tồn tại đúng hình dạng mở rộng từ A74');
assert(!/bindAiEnginesToSystemAudio|BPMEngine\.init|KeyEngine\.init/.test(newListenerBlock),
    'Listener MỚI vẫn KHÔNG xen logic khởi tạo BPM/Key nào vào (chỉ IPC + nhãn hiển thị)');

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
if (fail > 0) process.exit(1);
