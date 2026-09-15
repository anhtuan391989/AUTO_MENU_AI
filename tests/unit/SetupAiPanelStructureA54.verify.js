/**
 * SetupAiPanelStructureA54.verify.js — TASK A54
 * ---------------------------------------------------------------------------
 * Kiểm tra nội dung tĩnh (HTML string, không cần DOM/Electron thật) của ba nhóm
 * mới bên trong #panel-ai (Hidden DAW / Startup & Paths / AI Configuration &
 * Readiness) + kiểm tra an toàn cấu hình + không phá cơ chế khoá A53.
 *
 * Chạy: node tests/unit/SetupAiPanelStructureA54.verify.js
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
const setupNavPath = path.join(__dirname, '..', '..', 'ui', 'js', 'setupNav.js');
const html = fs.readFileSync(setupHtmlPath, 'utf8');

// Cắt đúng đoạn <section id="panel-ai">...</section> để mọi assertion "phải có X" chỉ
// tính trong phạm vi panel-ai, không tính nhầm nội dung panel khác.
const panelStart = html.indexOf('id="panel-ai"');
const panelAiSection = html.slice(panelStart, html.indexOf('<section', panelStart + 10));

console.log('== PHẦN 1: UI Structure — có panel-ai, có đủ 3 nhóm ==');
{
    assert(panelStart !== -1, 'ui/setup.html có section id="panel-ai"');
    assert(/🎛 Hidden DAW/.test(panelAiSection), 'panel-ai có nhóm "Hidden DAW"');
    assert(/Startup &amp; Paths|Startup & Paths/.test(panelAiSection), 'panel-ai có nhóm "Startup & Paths"');
    assert(/AI Configuration \/ Readiness/.test(panelAiSection), 'panel-ai có nhóm "AI Configuration / Readiness"');
}

console.log('\n== PHẦN 2: Mỗi field có label + id ổn định, không trùng id ==');
{
    const requiredIds = [
        'hiddenDawEnable', 'hiddenDawApp', 'hiddenDawExePath', 'hiddenDawProjectPath',
        'hiddenDawAutoLaunch', 'hiddenDawStartHidden', 'hiddenDawLifecyclePolicy',
        'spAutoStart', 'spDawExePath', 'spDawProjectPath', 'spPluginPaths',
        'spMidiConfigPath', 'spAudioConfigPath', 'spLogsPath',
        'aiReadyKeyPill', 'aiReadyBpmPill', 'aiReadyModPill', 'aiReadyAudioSourcePill',
        'aiReadyWasapiPill', 'aiReadyOverallPill',
    ];
    requiredIds.forEach((id) => {
        const re = new RegExp(`id="${id}"`);
        assert(re.test(panelAiSection), `Field/status id="${id}" tồn tại trong panel-ai`);
    });

    // Không có id nào trong panel-ai bị lặp lại (kể cả với nội dung AI Core cũ)
    const allIds = (html.match(/id="([a-zA-Z0-9_]+)"/g) || []).map((m) => m.slice(4, -1));
    const seen = new Set();
    const dupes = new Set();
    allIds.forEach((id) => { if (seen.has(id)) dupes.add(id); seen.add(id); });
    assert(dupes.size === 0, `Không có id nào bị trùng trong toàn bộ setup.html (trùng: ${[...dupes].join(', ') || 'không có'})`);

    // Mọi input/select/textarea id mới của A54 đều nằm trong 1 <label class="ph-field"> có text mô tả
    // (kiểm tra bằng cách xác nhận id xuất hiện ngay sau 1 label mở, không đứng trơ trọi)
    const fieldInputIds = requiredIds.filter((id) => !id.startsWith('aiReady'));
    fieldInputIds.forEach((id) => {
        const idx = panelAiSection.indexOf(`id="${id}"`);
        const before = panelAiSection.slice(Math.max(0, idx - 400), idx);
        assert(/<label class="ph-field">/.test(before), `Field "${id}" nằm trong 1 <label class="ph-field"> có mô tả (có label thật, không phải input trơ trọi)`);
    });
}

console.log('\n== PHẦN 3: Không có control giả dạng trạng thái runtime / không có nút Save-Apply-Verify-Launch chưa có backend ==');
{
    assert(!/>Show DAW</.test(panelAiSection) && !/>Hide DAW</.test(panelAiSection),
        'Không có nút "Show DAW"/"Hide DAW" (chưa có backend Tray/Background — đúng yêu cầu A54)');
    assert(!/>Save</.test(panelAiSection) && !/>Apply</.test(panelAiSection) &&
        !/>Verify</.test(panelAiSection) && !/>Launch</.test(panelAiSection),
        'Không có nút Save/Apply/Verify/Launch nào trong 3 nhóm mới (chưa có implementation tương ứng)');

    // Toàn bộ input/select/textarea mới đều disabled (chưa có backend thật)
    const newFieldTagsRegex = /<(input|select|textarea)\b[^>]*id="(hiddenDaw|sp[A-Z])[^"]*"[^>]*>/g;
    let m; let checked = 0;
    while ((m = newFieldTagsRegex.exec(panelAiSection))) {
        checked++;
        assert(/disabled/.test(m[0]), `Control mới "${m[0].slice(0, 60)}..." có thuộc tính disabled (chưa có backend thật)`);
    }
    assert(checked >= 13, `Đã kiểm tra ${checked} control mới đều disabled (kỳ vọng >= 13)`);

    assert(!/\d{1,3}\s*%/.test(panelAiSection.match(/AI Readiness[\s\S]{0,300}/)?.[0] || ''),
        'AI Readiness overall KHÔNG dùng số phần trăm giả');
    assert(/Pending backend verification/.test(panelAiSection), 'AI Readiness ghi đúng "Pending backend verification", không giả lập READY');
}

console.log('\n== PHẦN 4: Key/BPM/Mod ghi đúng nguồn System Audio/WASAPI, AI Key tách biệt Manual Key ==');
{
    assert(/System Audio \(WASAPI Loopback\)/.test(panelAiSection) || /WASAPI Loopback/.test(panelAiSection),
        'Có ghi rõ Key/BPM/Mod lấy từ System Audio / WASAPI Loopback');
    assert(/không phải Microphone|không phải MIC/i.test(panelAiSection),
        'Có ghi rõ KHÔNG phải Microphone (đúng phân biệt MIC vs System Audio)');
    assert(/AI Key.*Manual Key.*độc lập|Manual Key.*độc lập/.test(panelAiSection.replace(/\s+/g, ' ')),
        'Có ghi rõ AI Key và Manual Key là 2 state độc lập');
    assert(!/<button[^>]*>[^<]*SEND[^<]*<\/button>/i.test(panelAiSection),
        'Không có <button>...SEND...</button> nào trong panel-ai (không đụng Manual Key SEND flow) — (lưu ý: chữ "SEND" có thể xuất hiện trong câu giải thích dạng "không có nút SEND", đó không phải vi phạm)');
}

console.log('\n== PHẦN 5: Hidden DAW lifecycle policy không có lựa chọn "kill on close" ==');
{
    const policyMatch = panelAiSection.match(/id="hiddenDawLifecyclePolicy"[\s\S]*?<\/select>/);
    assert(!!policyMatch, 'Tìm thấy select DAW Lifecycle Policy');
    const policyHtml = policyMatch ? policyMatch[0] : '';
    assert(/Leave DAW running when Menu closes/.test(policyHtml), 'Có option "Leave DAW running when Menu closes"');
    assert(/Close DAW only when explicitly requested/.test(policyHtml), 'Có option "Close DAW only when explicitly requested"');
    assert(!/kill/i.test(policyHtml), 'KHÔNG có lựa chọn nào mang nghĩa "kill DAW" tự động khi đóng Menu');
}

console.log('\n== PHẦN 6: Config safety — không password, không localStorage/sessionStorage, không hard-code path máy Claude ==');
{
    assert(!/type="password"/.test(panelAiSection), 'Không có input type="password" nào trong 3 nhóm mới (không lưu password vào field cấu hình)');
    assert(!/Kh0i_AI/.test(panelAiSection), 'Không có chuỗi password nào xuất hiện trong panel-ai');
    assert(!/localStorage/.test(panelAiSection) && !/sessionStorage/.test(panelAiSection),
        'Không tham chiếu localStorage/sessionStorage trong panel-ai (không có cơ chế unlock/persist kiểu đó)');
    assert(!/\/home\/claude|\/mnt\/user-data|C:\\\\Users\\\\[A-Za-z]+\\\\(?!.*Program Files)/.test(panelAiSection),
        'Không hard-code đường dẫn máy Claude (sandbox path) trong placeholder');
    // placeholder ví dụ path phải là ví dụ chung chung, không phải path thật của máy nào
    assert(/placeholder="Ví dụ: C:\\Program Files\\DAW\\daw.exe"|placeholder="Path selection backend pending"/.test(panelAiSection),
        'Placeholder path là ví dụ chung chung hoặc ghi rõ "Path selection backend pending", không phải path thật');
}

console.log('\n== PHẦN 7: Lock regression — A53 vẫn nguyên vẹn sau khi A54 thêm nội dung ==');
{
    const setupNavSrc = fs.readFileSync(setupNavPath, 'utf8');
    assert(/aiTabUnlockedThisSession/.test(setupNavSrc), 'setupNav.js vẫn còn cơ chế khoá A53 (aiTabUnlockedThisSession)');
    assert(/AdminAuthUI\.requestLogin/.test(setupNavSrc), 'setupNav.js vẫn gọi AdminAuthUI.requestLogin() cho tab AI');

    // Đếm: lời gọi THẬT activatePanel("panel-ai"); (kèm dấu chấm phẩy ngay sau — phân biệt với
    // câu comment giải thích phía trên có nhắc tới cụm này nhưng không phải statement thật)
    // CHỈ được phép xuất hiện đúng 1 lần — không có đường tắt nào khác bỏ qua auth.
    const occurrences = (setupNavSrc.match(/activatePanel\("panel-ai"\);/g) || []).length;
    assert(occurrences === 1, `Lời gọi activatePanel("panel-ai"); (statement thật) chỉ xuất hiện đúng 1 lần trong setupNav.js (thực tế: ${occurrences}) — không có đường tắt nào khác bỏ qua auth`);

    const idx = setupNavSrc.indexOf('activatePanel("panel-ai");');
    const before = setupNavSrc.slice(Math.max(0, idx - 200), idx);
    assert(/aiTabUnlockedThisSession = true;/.test(before),
        'Lời gọi activatePanel("panel-ai") duy nhất nằm ngay sau khi set aiTabUnlockedThisSession = true (tức bên trong callback onSuccess của AdminAuthUI, không phải đường tắt khác)');
}

console.log('\n== PHẦN 8: Không có overlay/position:fixed nào làm lộ nội dung panel-ai khi bị khoá ==');
{
    assert(!/position:\s*fixed/.test(panelAiSection), 'Không có "position: fixed" nào trong nội dung 3 nhóm mới (không có overlay lách qua display:none của .setup-panel)');
    assert(!/z-index/.test(panelAiSection), 'Không có z-index tuỳ chỉnh nào trong nội dung 3 nhóm mới');
}

console.log('\n== PHẦN 9: Scope regression — A54 không đụng AI engine / MIDI mapping / Menu mapping / Manual Key ==');
{
    const forbiddenPaths = [
        'ui/js/engines/keyEngine.js',
        'ui/js/engines/bpmEngine.js',
        'ui/js/engines/modEngine.js',
        'ui/js/vocalCommandRouter.js',
    ];
    const { execSync } = require('child_process');
    const projectRoot = path.join(__dirname, '..', '..');
    let gitStatus = '';
    try {
        gitStatus = execSync('git status --porcelain', { cwd: projectRoot }).toString();
    } catch (e) {
        gitStatus = '';
    }
    const touchedForbidden = forbiddenPaths.filter((p) => gitStatus.includes(p));
    assert(touchedForbidden.length === 0,
        `Không có file bị cấm nào (engine/vocalCommandRouter) xuất hiện trong git status hiện tại (nếu FAIL và git status không sạch vì lý do khác, xem A53 report về hiện tượng test-artifact tương tự)`);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
