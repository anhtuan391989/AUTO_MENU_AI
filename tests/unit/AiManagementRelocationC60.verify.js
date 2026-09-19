/**
 * AiManagementRelocationC60.verify.js — TASK C60
 * ---------------------------------------------------------------------------
 * Kiểm tra nội dung tĩnh (HTML string + JS source string, không cần DOM/Electron
 * thật) rằng 2 khu vực "Mở kèm Project/Youtube" và "Đường dẫn & khởi động DAW"
 * đã ĐƯỢC DI CHUYỂN (MOVE) từ Setup (panel-dashboard / panel-daw) sang panel-ai,
 * mà KHÔNG:
 *   - tạo id trùng lặp ở bất kỳ đâu trong ui/setup.html
 *   - để lại bản sao (duplicate) ở panel cũ
 *   - làm mất/đổi handler, IPC, hay persistence key hiện có trong ui/js/setup.js
 *   - thêm disabled/readonly/khoá mới vào các control đã chuyển (đây là MOVE,
 *     không phải LOCK)
 *
 * Chạy: node tests/unit/AiManagementRelocationC60.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const setupHtmlPath = path.join(__dirname, '..', '..', 'ui', 'setup.html');
const setupJsPath = path.join(__dirname, '..', '..', 'ui', 'js', 'setup.js');
const html = fs.readFileSync(setupHtmlPath, 'utf8');
const setupJs = fs.readFileSync(setupJsPath, 'utf8');

// Cắt riêng từng <section class="setup-panel" id="panel-XXX">...</section> để mọi
// assertion "phải có X trong panel Y" / "KHÔNG được còn X trong panel Z" chỉ tính
// đúng phạm vi panel đó, không tính nhầm nội dung panel khác.
function extractPanel(id) {
    const startMarker = `id="${id}"`;
    const start = html.indexOf(startMarker);
    if (start === -1) return null;
    const sectionStart = html.lastIndexOf('<section', start);
    const nextSection = html.indexOf('<section', start + startMarker.length);
    const end = nextSection === -1 ? html.indexOf('</main>', start) : nextSection;
    return html.slice(sectionStart, end);
}

const panelDashboard = extractPanel('panel-dashboard');
const panelAi = extractPanel('panel-ai');
const panelDaw = extractPanel('panel-daw');

console.log('== PHẦN 1: Project / YouTube — đã có mặt trong panel-ai ==');
{
    assert(panelAi !== null, 'ui/setup.html có section id="panel-ai"');
    assert(/panel-card-title">🚀 Mở kèm Project \/ Youtube/.test(panelAi), 'panel-ai có CARD thật "Mở kèm Project / Youtube"');
    const projectIds = ['checkOpenPj', 'checkCopyPj', 'checkOpenYt', 'pjPathDisplay', 'btnSelectPj', 'btnSaveCurrentPj', 'btnOpenProjectBundle', 'btnClosePj'];
    for (const id of projectIds) {
        assert(new RegExp(`id="${id}"`).test(panelAi), `panel-ai có control id="${id}" (Project/Youtube)`);
    }
}

console.log('\n== PHẦN 2: DAW Path/Startup — đã có mặt trong panel-ai ==');
{
    assert(/panel-card-title">📁 Đường dẫn &amp; khởi động/.test(panelAi), 'panel-ai có CARD thật "Đường dẫn & khởi động"');
    const dawIds = ['currentDawPath', 'browseDawBtn', 'launchDawOnStartup'];
    for (const id of dawIds) {
        assert(new RegExp(`id="${id}"`).test(panelAi), `panel-ai có control id="${id}" (DAW Path/Startup)`);
    }
    // A55 Startup & Paths (spDawExePath/spDawProjectPath/spAutoStart) đã có sẵn trong panel-ai
    // TRƯỚC C60 — C60 không đụng, chỉ xác nhận vẫn còn nguyên (không bị move nhầm/xoá nhầm).
    assert(/id="spDawExePath"/.test(panelAi), 'panel-ai vẫn còn spDawExePath (A55, không bị C60 đụng tới)');
    assert(/id="spAutoStart"/.test(panelAi), 'panel-ai vẫn còn spAutoStart (A55, không bị C60 đụng tới)');
}

console.log('\n== PHẦN 3: Setup (panel cũ) KHÔNG còn bản duplicate ==');
{
    // Dùng đúng thẻ <div class="panel-card-title"> (dấu hiệu của 1 CARD thật trong UI) thay vì
    // chỉ match cụm từ, vì comment giải thích "đã chuyển sang panel-ai" ở panel cũ CHỦ Ý nhắc lại
    // đúng tên card đó — match theo cụm từ sẽ báo FAIL giả (false positive) ngay trên comment của
    // chính C60, không phải trên 1 card thật còn sót lại.
    assert(panelDashboard !== null, 'ui/setup.html có section id="panel-dashboard"');
    assert(!/panel-card-title">🚀 Mở kèm Project \/ Youtube/.test(panelDashboard), 'panel-dashboard KHÔNG còn CARD "Mở kèm Project / Youtube" (chỉ còn comment ghi chú đã move)');
    assert(!/id="checkOpenPj"/.test(panelDashboard), 'panel-dashboard KHÔNG còn id="checkOpenPj"');
    assert(!/id="btnOpenProjectBundle"/.test(panelDashboard), 'panel-dashboard KHÔNG còn id="btnOpenProjectBundle"');

    assert(panelDaw !== null, 'ui/setup.html có section id="panel-daw"');
    assert(!/panel-card-title">📁 Đường dẫn &amp; khởi động/.test(panelDaw), 'panel-daw KHÔNG còn CARD "Đường dẫn & khởi động" (chỉ còn comment ghi chú đã move)');
    assert(!/id="browseDawBtn"/.test(panelDaw), 'panel-daw KHÔNG còn id="browseDawBtn"');
    assert(!/id="currentDawPath"/.test(panelDaw), 'panel-daw KHÔNG còn id="currentDawPath"');
    assert(!/id="launchDawOnStartup"/.test(panelDaw), 'panel-daw KHÔNG còn id="launchDawOnStartup"');
    // panel-daw vẫn phải còn nguyên các phần KHÔNG thuộc phạm vi di chuyển (chọn DAW cho toạ độ
    // click, Auto-Key, Bridging...) — C60 chỉ bỏ đúng 1 card, không được xoá nhầm phần khác.
    assert(/id="saveDawBtn"/.test(panelDaw), 'panel-daw vẫn còn "DAW đang dùng" (saveDawBtn) — không bị xoá nhầm');
    assert(/id="saveAutoKeyBtn"/.test(panelDaw), 'panel-daw vẫn còn "Auto-Key" — không bị xoá nhầm');
}

console.log('\n== PHẦN 4: Không có id trùng lặp ở BẤT KỲ đâu trong toàn bộ ui/setup.html ==');
{
    const idMatches = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const seen = new Map();
    for (const id of idMatches) seen.set(id, (seen.get(id) || 0) + 1);
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    assert(dupes.length === 0, 'không có id nào xuất hiện > 1 lần trong ui/setup.html (dupes: ' + JSON.stringify(dupes) + ')');

    // Đối chiếu tổng số thẻ <div>/<section> mở-đóng phải cân bằng (chỉ move nội dung, không
    // làm rách cấu trúc HTML khi cắt/dán).
    const openDiv = (html.match(/<div/g) || []).length;
    const closeDiv = (html.match(/<\/div>/g) || []).length;
    assert(openDiv === closeDiv, `<div> mở/đóng cân bằng (open=${openDiv}, close=${closeDiv})`);
    const openSection = (html.match(/<section/g) || []).length;
    const closeSection = (html.match(/<\/section>/g) || []).length;
    assert(openSection === closeSection, `<section> mở/đóng cân bằng (open=${openSection}, close=${closeSection})`);
}

console.log('\n== PHẦN 5: setup.js — handler/IPC/persistence hiện có KHÔNG bị đổi ==');
{
    // Project/Youtube: vẫn đúng function, đúng persistence key, đúng IPC (electronAPI.selectFile),
    // KHÔNG có API mới nào được tạo thêm cho việc move này.
    assert(/function initProjectSection\(\)/.test(setupJs), 'setup.js vẫn có function initProjectSection() (không đổi tên/xoá)');
    assert(/initProjectSection\(\);/.test(setupJs), 'initProjectSection() vẫn được gọi (không bị bỏ sót lời gọi)');
    for (const key of ['projectPath', 'projectOpenEnabled', 'projectCopyEnabled', 'projectOpenYoutube']) {
        assert(setupJs.includes(`"${key}"`), `setup.js vẫn dùng đúng persistence key "${key}" (không đổi tên key)`);
    }
    assert(/window\.electronAPI\?\.selectFile/.test(setupJs), 'setup.js Project section vẫn gọi electronAPI.selectFile (IPC hiện có, không tạo mới)');
    assert(/openProjectYoutubeBundle\(\)/.test(setupJs), 'setup.js vẫn gọi openProjectYoutubeBundle() (giữ nguyên action handler mở kèm)');

    // DAW Path/Startup: vẫn đúng id lookup, đúng persistence key, đúng IPC.
    assert(/getElementById\("launchDawOnStartup"\)/.test(setupJs), 'setup.js vẫn getElementById("launchDawOnStartup") (không đổi id lookup)');
    assert(/getElementById\("browseDawBtn"\)/.test(setupJs), 'setup.js vẫn getElementById("browseDawBtn")');
    assert(/getElementById\("currentDawPath"\)/.test(setupJs), 'setup.js vẫn getElementById("currentDawPath")');
    for (const key of ['launchDAW', 'selectedDAWPath']) {
        assert(setupJs.includes(`"${key}"`), `setup.js vẫn dùng đúng persistence key "${key}" (không đổi tên key)`);
    }
}

console.log('\n== PHẦN 6: Không có disabled/readonly MỚI trên các control đã chuyển (MOVE, không phải LOCK) ==');
{
    const movedControlPattern = /<[^>]*id="(checkOpenPj|checkCopyPj|checkOpenYt|pjPathDisplay|btnSelectPj|btnSaveCurrentPj|btnOpenProjectBundle|currentDawPath|browseDawBtn|launchDawOnStartup)"[^>]*>/g;
    let m;
    let anyDisabled = false;
    while ((m = movedControlPattern.exec(panelAi))) {
        if (/\bdisabled\b/.test(m[0])) { anyDisabled = true; console.error('    tag có disabled:', m[0]); }
    }
    assert(!anyDisabled, 'không control nào trong nhóm vừa move bị thêm "disabled" so với bản gốc');
    // pjPathDisplay giữ nguyên "readonly" — thuộc tính này đã có SẴN từ trước khi move (đây là ô
    // hiển thị đường dẫn, không phải input cho gõ tay), không phải khoá mới do C60 thêm vào.
    assert(/id="pjPathDisplay"[^>]*readonly/.test(panelAi), 'pjPathDisplay vẫn readonly như bản gốc (thuộc tính có sẵn từ trước C60, không phải khoá mới)');
}

console.log('\n== PHẦN 7: Ghi nhận (không phải lỗi) — panel-ai vẫn bị khoá bằng admin password (TASK A53), kế thừa từ trước C60 ==');
{
    const setupNavPath = path.join(__dirname, '..', '..', 'ui', 'js', 'setupNav.js');
    const setupNavJs = fs.readFileSync(setupNavPath, 'utf8');
    assert(/aiTabUnlockedThisSession/.test(setupNavJs), 'setupNav.js vẫn còn cơ chế khoá admin password cho panel-ai (A53) — C60 không tự ý gỡ, chỉ ghi nhận trong C60-REPORT.md');
}

console.log('\n=== KẾT QUẢ: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exitCode = fail > 0 ? 1 : 0;
