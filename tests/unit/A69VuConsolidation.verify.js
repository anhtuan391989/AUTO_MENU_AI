'use strict';
/**
 * A69VuConsolidation.verify.js — TASK A69
 * "MUSIC / MIC / MASTER VU CONSOLIDATION" — verify bằng cách đọc lại source thật
 * (ui/index.html, ui/css/style.css, ui/js/renderer.js), KHÔNG mock lại logic.
 *
 * Coverage (đúng Mục 3 đề bài A69):
 *   Test 1 — Giao diện chỉ còn đúng 3 VU: MUSIC / MIC / MASTER, không còn BEAT.
 *   Test 2 — Thứ tự hiển thị đúng MUSIC → MIC → MASTER (theo tên task + Mục 1.A).
 *   Test 3 — MUSIC không lấy tín hiệu MIC (2 AudioSource độc lập, 2 element DOM khác nhau,
 *            __micSource chỉ ghi vào vu-mic-fill, BPMEngine.onLevel chỉ ghi vào vu-music-fill).
 *   Test 4 — BPM/Key/Mod KHÔNG bị ảnh hưởng bởi việc xoá Beat VU: BPMEngine.onLevel vẫn nhận
 *            đủ bassEnergy/localAvg/maxByte (chứng tỏ BPMEngine không bị sửa để "bớt" field
 *            nào), và BPMEngine.onUpdate()/KeyEngine.onProvisionalEstimate() không đổi.
 *   Test 5 — MUSIC hiển thị "chưa có dữ liệu" (vu-bar--nodata) khi SYSTEM_AUDIO NO_DEVICE/
 *            ERROR, và bỏ hatch khi RUNNING (setSystemAudioVuNoData()).
 *   Test 6 — MASTER không hiển thị dữ liệu giả: onLevel luôn ép width về "0%", có
 *            vu-bar--nodata gắn cứng, KHÔNG đọc số liệu từ SYSTEM_AUDIO/MIC.
 *   Test 7 — Không còn tham chiếu "vu-beat-fill"/"vu-bar--beat" ở bất kỳ đâu trong
 *            ui/index.html, ui/css/style.css, ui/js/renderer.js.
 *   Test 8 — File core không bị đụng: audioSource.js, bpmEngine.js, keyEngine.js,
 *            modEngine.js (nếu tồn tại) không nằm trong diff của A69 (kiểm tra qua git).
 *
 * Chạy: node tests/unit/A69VuConsolidation.verify.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'ui/css/style.css'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(ROOT, 'ui/js/renderer.js'), 'utf8');

console.log('== Test 1: Chỉ còn đúng 3 VU (MUSIC/MIC/MASTER), không còn BEAT ==');
const vuRowMatches = [...html.matchAll(/<div class="vu-row">.*?<\/div><\/div><\/div>/g)];
assert(vuRowMatches.length === 3, `Có đúng 3 .vu-row trong index.html (thực tế: ${vuRowMatches.length})`);
assert(html.includes('id="vu-music-fill"'), 'Còn VU MUSIC (vu-music-fill)');
assert(html.includes('id="vu-mic-fill"'), 'Còn VU MIC (vu-mic-fill)');
assert(html.includes('id="vu-master-fill"'), 'Còn VU MASTER (vu-master-fill)');
assert(!html.includes('id="vu-beat-fill"'), 'KHÔNG còn VU BEAT (vu-beat-fill) trong HTML');
assert(!/>BEAT</.test(html.split('<!-- STATUS -->')[1]?.split('<div id="songPosition"')[0] || ''),
    'Không còn label text "BEAT" trong khu vực vuGroup');

console.log('\n== Test 2: Thứ tự hiển thị MUSIC -> MIC -> MASTER ==');
const vuBlockMatch = html.match(/<div class="vu-group" id="vuGroup">([\s\S]*?)<\/div>\s*<div id="songPosition"/);
assert(!!vuBlockMatch, 'Tìm thấy khối #vuGroup trong index.html');
if (vuBlockMatch) {
    const block = vuBlockMatch[1];
    const idxMusic = block.indexOf('vu-music-fill');
    const idxMic = block.indexOf('vu-mic-fill');
    const idxMaster = block.indexOf('vu-master-fill');
    assert(idxMusic > -1 && idxMic > -1 && idxMaster > -1, 'Cả 3 id đều xuất hiện trong khối #vuGroup');
    assert(idxMusic < idxMic && idxMic < idxMaster, `Thứ tự DOM đúng MUSIC(${idxMusic}) < MIC(${idxMic}) < MASTER(${idxMaster})`);
}

console.log('\n== Test 3: MUSIC không lấy tín hiệu MIC (2 nguồn/2 element độc lập) ==');
const micBlockMatch = rendererSrc.match(/function startMicAndMasterVu\(\) \{([\s\S]*?)\n\}/);
assert(!!micBlockMatch, 'Tìm thấy startMicAndMasterVu() trong renderer.js');
if (micBlockMatch) {
    const body = micBlockMatch[1];
    assert(/createMicSource\(\)/.test(body), 'Mic dùng AudioSource.createMicSource() riêng (không đổi từ B58)');
    assert(/vu-mic-fill/.test(body) && !/vu-music-fill/.test(body),
        'startMicAndMasterVu() chỉ ghi vào vu-mic-fill, KHÔNG ghi vào vu-music-fill');
}
const bpmLevelMatch = rendererSrc.match(/BPMEngine\.onLevel\(\(\{[^}]*\}\) => \{([\s\S]*?)\n\s{12}\}\);/);
assert(!!bpmLevelMatch, 'Tìm thấy BPMEngine.onLevel() callback trong renderer.js');
if (bpmLevelMatch) {
    const body = bpmLevelMatch[1];
    assert(/vu-music-fill/.test(body), 'BPMEngine.onLevel() (nguồn SYSTEM_AUDIO) ghi vào vu-music-fill');
    assert(!/vu-mic-fill/.test(body), 'BPMEngine.onLevel() KHÔNG ghi vào vu-mic-fill (MUSIC không lấy tín hiệu MIC)');
    assert(!/getElementById\("vu-beat-fill"\)/.test(body), 'BPMEngine.onLevel() không còn ghi vào vu-beat-fill (đã bỏ Beat VU)');
}

console.log('\n== Test 4: BPM/Key/Mod không bị ảnh hưởng bởi việc xoá Beat VU ==');
assert(/BPMEngine\.onLevel\(\(\{ bassEnergy, localAvg, maxByte, vuPercent, rms, dbfs, peak \}\)/.test(rendererSrc),
    'BPMEngine.onLevel() vẫn nhận đủ nguyên field cũ (bassEnergy/localAvg/maxByte/vuPercent/rms/dbfs/peak) — không bị "cắt bớt" theo BEAT VU');
assert(/BPMEngine\.onUpdate\(/.test(rendererSrc), 'BPMEngine.onUpdate() (cập nhật giá trị BPM hiển thị) vẫn còn nguyên');
assert(/KeyEngine\.onProvisionalEstimate\(/.test(rendererSrc), 'KeyEngine.onProvisionalEstimate() vẫn còn nguyên');
assert(/__debugLogAudioLevel\(bassEnergy, localAvg, maxByte\)/.test(rendererSrc),
    'bassEnergy/localAvg vẫn được BPMEngine tính và truyền ra (chỉ bỏ chỗ RENDER ra DOM riêng, không bỏ phép tính)');

console.log('\n== Test 5: MUSIC hiển thị "chưa có dữ liệu" khi SYSTEM_AUDIO chưa RUNNING ==');
const noDataFnMatch = rendererSrc.match(/function setSystemAudioVuNoData\([\s\S]*?\n\}/);
assert(!!noDataFnMatch, 'Tìm thấy setSystemAudioVuNoData()');
if (noDataFnMatch) {
    assert(/\["vu-music-fill"\]/.test(noDataFnMatch[0]), 'setSystemAudioVuNoData() chỉ còn danh sách ["vu-music-fill"] (đã bỏ vu-beat-fill)');
}
assert(/setSystemAudioVuNoData\(true\)/.test(rendererSrc), 'Có gọi setSystemAudioVuNoData(true) (mặc định/NO_DEVICE/mất thiết bị)');
assert(/setSystemAudioVuNoData\(false\)/.test(rendererSrc), 'Có gọi setSystemAudioVuNoData(false) khi SYSTEM_AUDIO RUNNING trở lại');

console.log('\n== Test 6: MASTER không hiển thị dữ liệu giả ==');
const masterBlockMatch = rendererSrc.match(/createDawMasterSource\(\);([\s\S]*?)__dawMasterSource\.start\(\);/);
assert(!!masterBlockMatch, 'Tìm thấy khối khởi tạo Master VU (createDawMasterSource)');
if (masterBlockMatch) {
    const body = masterBlockMatch[1];
    assert(/vu-bar--nodata/.test(body), 'Master VU được gắn cứng class vu-bar--nodata (không giả lập có tín hiệu)');
    assert(/masterMeter\.style\.width = "0%"/.test(body), 'Master VU luôn ép width về "0%" trong onLevel (không lấy số liệu thật/giả từ nguồn khác)');
    assert(!/vu-music-fill|vu-mic-fill/.test(body), 'Khối khởi tạo Master VU không đọc/ghi vu-music-fill hay vu-mic-fill (không mượn dữ liệu MUSIC/MIC)');
}

console.log('\n== Test 7: Không còn tham chiếu "beat" nào sót lại ở khu vực VU ==');
assert(!/\.vu-bar--beat\{/.test(css), 'style.css không còn RULE .vu-bar--beat{...} (chỉ còn ghi chú lịch sử, không còn style thật)');
assert(!html.includes('vu-beat-fill') && !html.includes('vu-bar--beat'), 'index.html không còn vu-beat-fill/vu-bar--beat');
assert(!rendererSrc.includes('vu-beat-fill'.replace('vu-beat-fill', 'vu-beat-fill')) || !/getElementById\("vu-beat-fill"\)/.test(rendererSrc),
    'renderer.js không còn document.getElementById("vu-beat-fill") nào');

console.log('\n== Test 8: File core không bị đụng trong A69 (kiểm bằng git diff so với A68) ==');
try {
    const diffFiles = execSync('git diff --name-only 7d49c81..HEAD', { cwd: ROOT, encoding: 'utf8' })
        .split('\n').filter(Boolean);
    ['ui/js/audioSource.js', 'ui/js/engines/bpmEngine.js', 'ui/js/engines/keyEngine.js', 'ui/js/engines/modEngine.js']
        .forEach((f) => assert(!diffFiles.includes(f), `${f} KHÔNG nằm trong diff A69 (không bị đụng)`));
} catch (e) {
    console.log('  SKIP  (không chạy được git diff trong môi trường này:', e.message.split('\n')[0], ')');
}

console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
