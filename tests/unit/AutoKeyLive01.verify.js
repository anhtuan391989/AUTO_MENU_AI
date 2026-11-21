'use strict';
// AUTOKEY-TEMP-01 — chế độ "Auto Key tạm thời": thuật toán AutoKey Live Studio chạy trong Menu, chọn bằng chuột phải nút AUTO DETECT.
// Kiểm tra: (A) thuật toán JS khớp bản Python gốc (đáp án vàng); (B) logic chốt/cập nhật; (C) engine chạy trên AudioContext giả;
//           (D) thẻ chuột phải chạy thật (DOM giả); (E) các điểm nối trong renderer.js; (F) KHÔNG sửa HTML / KeyEngine.
const fs = require('fs'), vm = require('vm'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf-8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m + (!c && x !== undefined ? '  -> ' + x : '')); };
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const AK = require(path.join(__dirname, '../../ui/js/engines/autoKeyLiveEngine.js'));
const C = AK._core, K = C.constants, SR = 48000;
const GOLD = {
  chunk1Full: [1883631.067455493, 297763.722192965, 57290.97694167007, 316.320319201475, 791684.543644604, 1859.1077072488938, 12.365851684355267, 832131.1362878073, 89.65530498288128, 29.374003206754875, 308.21855370612764, 98019.67907430332],
  chunk1Bass: [368959.33929905755, 231143.60445528178, 0.0, 0.048645091327689696, 0.09906892058036132, 0.20969097472880008, 0.5160837795977548, 1.4694515452327033, 5.323300296652161, 27.896848345721125, 297.2499391851227, 31075.855982495123],
  keys: ["C", "C", "C"],
  conf: [0.9217744064, 0.8301931038, 0.99]
};

// ---- tín hiệu tổng hợp (giống hệt bản Python tạo đáp án vàng) ----
function chord(notes, dur) {
    dur = dur || 1.5; const n = Math.floor(SR * dur), y = new Float64Array(n);
    for (const m of notes) { const f = 440 * Math.pow(2, (m - 69) / 12); for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.3]]) for (let i = 0; i < n; i++) y[i] += a * Math.sin(2 * Math.PI * f * h * (i / SR)); }
    let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(y[i]));
    const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = y[i] / mx * 0.3; return o;
}
const P = { C: [48, 60, 64, 67], G: [43, 55, 59, 62], F: [41, 53, 57, 60], Am: [45, 57, 60, 64] };

console.log('A. Hằng số đúng như AutoKey Live Studio');
ok(JSON.stringify(K.MAJOR_TEMPLATE) === JSON.stringify([6.5, 2.0, 3.5, 2.1, 4.6, 4.0, 2.4, 5.3, 2.3, 3.7, 2.2, 3.3]), 'mẫu Trưởng');
ok(JSON.stringify(K.MINOR_TEMPLATE) === JSON.stringify([6.5, 2.6, 3.5, 5.4, 2.5, 3.6, 2.4, 5.2, 4.0, 2.7, 4.1, 3.2]), 'mẫu Thứ');
ok(K.CHUNK_SECONDS === 1.5 && K.BLOCK_SECONDS === 0.05 && K.SILENCE_THRESHOLD === 0.001, 'đoạn 1.5 s, khối 50 ms, ngưỡng im lặng 0.001');
ok(K.N_FFT === 8192 && K.HOP === 2048 && K.FREQ_MIN === 32 && K.FREQ_MAX === 2000 && K.BASS_MAX === 135 && K.DONE_CONFIDENCE === 0.85, 'FFT 8192 / bước 2048 / 32–2000 Hz / bass <= 135 Hz / DÒ XONG 0.85');
ok(K.NOTE_NAMES.join(',') === 'C,C#,D,D#,E,F,F#,G,G#,A,A#,B', 'tên 12 nốt (dấu thăng)');

console.log('B. Thuật toán JS khớp đáp án vàng từ bản Python (sai số < 1e-6)');
{
    const f = C.extractChunkFeatures(chord(P.C), SR);
    ok(f && f.full.length === 12 && f.bass.length === 12, 'trích đặc trưng 12 nốt (toàn phổ + bass)');
    ok(f.full.every((v, i) => close(v, GOLD.chunk1Full[i], 1e-5)), 'năng lượng toàn phổ khớp Python', JSON.stringify(Array.from(f.full).slice(0, 3)));
    ok(f.bass.every((v, i) => close(v, GOLD.chunk1Bass[i], 1e-5)), 'năng lượng bass khớp Python');
    const cumF = new Float64Array(12), cumB = new Float64Array(12); let allOk = true, detail = '';
    [P.C, P.G, P.F].forEach((p, i) => {
        const x = C.extractChunkFeatures(chord(p), SR); for (let j = 0; j < 12; j++) { cumF[j] += x.full[j]; cumB[j] += x.bass[j]; }
        const ev = C.evaluateCumulativeKey(cumF, cumB); const name = K.NOTE_NAMES[ev.rootIndex] + (ev.mode === 'Minor' ? 'm' : '');
        if (name !== GOLD.keys[i] || !close(ev.confidence, GOLD.conf[i], 1e-5)) { allOk = false; detail += ` [${i}: ${name}/${ev.confidence} vs ${GOLD.keys[i]}/${GOLD.conf[i]}]`; }
    });
    ok(allOk, 'Key + % tin cậy cộng dồn 3 đoạn khớp Python', detail);
    ok(C.extractChunkFeatures(new Float32Array(72000), SR) === null, 'đoạn im lặng (RMS < 0.001) -> bỏ');
    ok(C.evaluateCumulativeKey(new Float64Array(12), new Float64Array(12)) === null, 'chưa có năng lượng -> chưa có Key');
    ok(C.pearsonCorr([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]) > 0.9999999 && C.pearsonCorr(new Array(12).fill(3), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) === 0, 'Pearson: tương quan hoàn hảo = 1, mẫu phẳng = 0');
    const t0 = Date.now(); C.extractChunkFeatures(chord(P.C), SR); ok(Date.now() - t0 < 200, 'xử lý 1 đoạn 1.5 s đủ nhanh (' + (Date.now() - t0) + ' ms, < 200 ms)');
}

console.log('C. Cắt đoạn: khối 50 ms im lặng bị BỎ QUA (không xoá bộ đệm)');
{
    const got = []; const ck = C.createChunker(SR, (c) => got.push(c));
    ok(ck.blockLen === 2400 && ck.chunkLen === 72000, 'khối 2400 mẫu, đoạn 72000 mẫu @48 kHz');
    const tone = chord(P.C, 1.0); ck.push(tone);                 // 1.0 s có tiếng
    ck.push(new Float32Array(Math.floor(SR * 0.2)));              // 0.2 s im lặng
    ok(got.length === 0, 'chưa đủ 1.5 s tiếng -> chưa ra đoạn');
    ck.push(chord(P.C, 0.6));                                     // thêm 0.6 s có tiếng => đủ 1.5 s tiếng
    ok(got.length === 1 && got[0].length === 72000, 'đủ 1.5 s TIẾNG (bỏ qua im lặng) -> ra đúng 1 đoạn 72000 mẫu');
    const ck2 = C.createChunker(SR, (c) => got.push(c)); ck2.push(new Float32Array(SR * 3)); ok(got.length === 1, '3 giây im lặng hoàn toàn -> không ra đoạn');
}

console.log('D. Logic chốt: chốt ngay đoạn đầu; chỉ cập nhật khi tin cậy CAO HƠN và Key ĐỔI');
{
    const s = C.createSession(SR); const r1 = s.pushChunk(chord(P.C));
    ok(r1 && r1.key === 'C Major' && r1.reason === 'first-chunk' && r1.engine === 'autokey-live', 'đoạn đầu chốt NGAY: ' + (r1 && r1.key) + ' (' + Math.round((r1 ? r1.confidence : 0) * 100) + '%)');
    ok(/^BẮT NHANH LIVE \(\d+%\)$/.test(s.state.status), 'trạng thái "BẮT NHANH LIVE (xx%)": ' + s.state.status);
    ok(r1 && typeof r1.rootIndex === 'number' && /^(Major|Minor)$/.test(r1.mode) && /^[A-G]#? (Major|Minor)$/.test(r1.key) && r1.confidence >= 0.5 && r1.confidence <= 0.99 && r1.top2 && 'margin' in r1, 'kết quả CÙNG hình dạng KeyEngine ({key, rootIndex, mode, confidence, margin, top2}), tin cậy trong 50–99%');
    ok(s.pushChunk(chord(P.G)) === null, 'đoạn 2: tin cậy thấp hơn mức đã chốt -> không báo');
    const before = s.state.bestConf; ok(s.pushChunk(chord(P.F)) === null && s.state.bestConf > before, 'đoạn 3: tin cậy cao hơn nhưng CÙNG Key -> không báo lại, chỉ nâng mức');
    ok(/^DÒ XONG \(\d+%\)$/.test(s.state.status), 'tin cậy >= 85% -> "DÒ XONG (xx%)": ' + s.state.status);
    ok(s.pushChunk(new Float32Array(72000)) === null && s.state.chunks === 3, 'đoạn im lặng không tính, không báo');
    // % tin cậy LUÔN hiện: trạng thái được báo ở đoạn đầu và MỖI lần mức đã chốt tăng — kể cả khi Key không đổi (pushChunk trả null)
    const evs = []; const s3 = C.createSession(SR, (e) => evs.push(e));
    s3.pushChunk(chord(P.C)); s3.pushChunk(chord(P.G)); s3.pushChunk(chord(P.F));
    ok(evs.length === 2 && evs[0].kind === 'quick' && evs[0].text === 'BẮT NHANH LIVE (' + evs[0].percent + '%)' && evs[0].key === 'C Major', 'đoạn đầu báo "BẮT NHANH LIVE (xx%)" kèm Key: ' + (evs[0] && evs[0].text));
    ok(evs[1] && evs[1].kind === 'done' && evs[1].percent > evs[0].percent && evs[1].key === 'C Major' && /^DÒ XONG \(\d+%\)$/.test(evs[1].text), '% tăng (cùng Key) vẫn được báo: ' + (evs[0] && evs[0].percent) + '% -> ' + (evs[1] && evs[1].text));
    ok(s3.pushChunk(chord(P.F)) === null && evs.length === 2, 'mức không tăng -> không báo thừa (không nháy chữ)');
    const s2 = C.createSession(SR); const seq = ['Am', 'F', 'C', 'G'].map((k) => s2.pushChunk(chord(P[k])));
    ok(seq[0] && seq[0].key === 'A Minor' && !seq[1] && !seq[2] && seq[3] && seq[3].key === 'C Major' && seq[3].reason === 'confidence-up' && seq[3].confidence > seq[0].confidence, 'Key ĐỔI + tin cậy tăng -> báo lại: A Minor -> C Major (' + (seq[3] ? Math.round(seq[3].confidence * 100) : '?') + '%)');
}

console.log('E. Engine chạy trên AudioContext giả (SYSTEM_AUDIO)');
{
    const mk = () => { const nodes = []; const ctx = { sampleRate: SR, destination: {}, createScriptProcessor: () => { const n = { connect() { n.connected = true; }, disconnect() { n.connected = false; }, onaudioprocess: null }; nodes.push(n); return n; }, createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) }; const src = { connect() {}, disconnect() {} }; return { ctx, src, nodes }; };
    const feed = (n, samples) => { for (let i = 0; i < samples.length; i += 4096) { const blk = samples.subarray(i, Math.min(samples.length, i + 4096)); n.onaudioprocess({ inputBuffer: { getChannelData: () => blk } }); } };
    const { ctx, src, nodes } = mk();
    AK.setEnabled(false); AK.init(ctx, src);
    ok(nodes.length === 0 && AK.getState().capturing === false, 'chế độ TẮT -> KHÔNG bắt âm thanh (không tốn CPU)');
    AK.setEnabled(true); AK.init(ctx, src);
    ok(nodes.length === 1 && AK.getState().capturing && AK.isReady(), 'chế độ BẬT + init -> bắt âm thanh từ nguồn');
    const sts = []; AK.onStatus((e) => sts.push(e));
    let got = null; AK.detectOnce((r) => { got = r; });
    feed(nodes[0], chord(P.C, 1.6));
    ok(sts.length >= 1 && sts[0].kind === 'quick' && sts[0].percent === Math.round(got.confidence * 100) && AK.getState().status === sts[sts.length - 1].text, 'engine báo % tin cậy ra ngoài qua onStatus: ' + (sts[0] && sts[0].text));
    ok(got && got.key === 'C Major' && got.engine === 'autokey-live', 'nghe 1.6 s -> chốt: ' + (got && got.key));
    ok(AK.getState().statusKind === 'quick' || AK.getState().statusKind === 'done', 'getState báo trạng thái');
    // kết quả đến khi chưa có người nghe -> giữ lại, giao ở detectOnce kế tiếp (renderer gọi lại detectOnce sau mỗi kết quả)
    AK.init(ctx, src); const n2 = nodes[nodes.length - 1]; feed(n2, chord(P.Am, 1.6));
    let late = null; AK.detectOnce((r) => { late = r; });
    setTimeout(() => {
        ok(late && late.key === 'A Minor', 'kết quả đến trước khi có người nghe -> được giao ở detectOnce kế tiếp: ' + (late && late.key));
        const nBefore = nodes.length; AK.init(ctx, src);
        ok(AK.getState().chunks === 0 && nodes.length === nBefore + 1 && nodes[nBefore - 1].connected === false, 'init = chu trình MỚI: xoá dữ liệu cộng dồn, gỡ bộ bắt cũ');
        let gone = false; const stopFn = AK.detectOnce(() => { gone = true; }); stopFn(); feed(nodes[nodes.length - 1], chord(P.C, 1.6));
        ok(gone === false, 'hàm huỷ watcher hoạt động (không báo sau khi huỷ)');
        AK.setEnabled(false); ok(AK.getState().capturing === false && AK.isReady() === false, 'tắt chế độ -> dừng bắt âm thanh');
        AK.onStatus(null);
        part2();
    }, 20);
}

function part2() {
console.log('F. Thẻ chuột phải nút AUTO DETECT chạy thật (DOM giả)');
const r = rd('ui/js/renderer.js');
const s0 = r.indexOf('/* AUTOKEY-TEMP-01 BEGIN'), s1 = r.indexOf('/* AUTOKEY-TEMP-01 END */');
ok(s0 > 0 && s1 > s0, 'khối AUTOKEY-TEMP-01 có trong renderer.js');
const blockSrc = r.slice(s0, s1);
const mkEl = (tag) => { const style = { set cssText(v) { if (/display:\s*none/.test(v)) this.display = 'none'; } }; const el = { tag, style, children: [], listeners: {}, checked: false, title: '', textContent: '', offsetWidth: 150, offsetHeight: 60, id: '', type: '',
    appendChild(c) { this.children.push(c); return c; }, addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    getBoundingClientRect() { return { left: 100, top: 300, width: 80, height: 30, bottom: 330 }; }, contains() { return false; }, closest() { return null; },
    click() { this.clicks = (this.clicks || 0) + 1; this.internalAtClick = sb.__autoDetectInternal; } }; return el; };
function build(opts) {
    opts = opts || {}; const els = {}; const saved = []; let mode = opts.startMode || 'ai';
    const sb = { __autoDetectInternal: false, saved, console, setTimeout, Promise,
        getSetting: (k, f) => (k === 'keyDetectMode' ? mode : f), setSetting: (k, v) => { saved.push([k, v]); if (k === 'keyDetectMode') mode = v; return true; },
        createPopupAutoHide: () => ({ arm() {}, disarm() {} }), isManualKeyHeld: () => !!opts.held,
        AudioSourceState: { RUNNING: 'RUNNING' }, AutoKeyLive: { init() {}, isReady() { return true; }, setEnabled() {}, detectOnce() {} },
        KeyEngine: { detectOnce() { return 'ai'; } },
        window: { innerWidth: 800, __systemAudioSource: { getState: () => (opts.running === false ? 'STOPPED' : 'RUNNING') } },
        document: { head: mkEl('head'), body: mkEl('body'), addEventListener() {}, createElement: (t) => mkEl(t),
            getElementById: (id) => (id === 'autoDetectBtn' ? (els.btn = els.btn || Object.assign(mkEl('button'), { id: 'autoDetectBtn', title: 'TIP' })) : (id === 'autoKeyTempCard' ? (els.card || null) : null)) } };
    sb.window.document = sb.document; vm.createContext(sb); // eslint-disable-line
    sb.__els = els; sb.__getMode = () => mode;
    globalThis.sb = sb; // el.click đọc cờ nội bộ
    vm.runInContext(blockSrc.replace(/try \{ if \(__akTempOn\(\)\) __akLoadEngine\(\); \} catch \(e\) \{[^\n]*\n/, '') + '\ninitAutoKeyTempCard();', sb);
    return sb;
}
{
    const sb = build(); const btn = sb.__els.btn; const card = sb.document.body.children[0];
    const aiChk = card.children[0].children[0], akChk = card.children[1].children[0];
    ok(card.id === 'autoKeyTempCard' && card.children.length === 2, 'thẻ có đúng 2 ô tích');
    ok(card.children[0].children[1].textContent === 'Dò bằng AI' && card.children[1].children[1].textContent === 'Auto Key tạm thời', 'nhãn: "Dò bằng AI" và "Auto Key tạm thời"');
    ok(btn.listeners.contextmenu && btn.listeners.contextmenu.length === 1, 'chuột phải nút AUTO DETECT mở thẻ');
    let prevented = false; btn.listeners.contextmenu[0]({ preventDefault() { prevented = true; } });
    ok(prevented && card.style.display === 'block', 'chuột phải -> thẻ hiện, chặn menu chuột phải mặc định');
    ok(aiChk.checked === true && akChk.checked === false && sb.__getMode() === 'ai', 'MẶC ĐỊNH = "Dò bằng AI" (như cũ)');
    akChk.listeners.change[0]();
    ok(sb.saved.some((x) => x[0] === 'keyDetectMode' && x[1] === 'autokey-temp') && akChk.checked && !aiChk.checked, 'tích "Auto Key tạm thời" -> lưu setting, ô kia tự bỏ');
    ok(btn.clicks === 1 && btn.internalAtClick === true && sb.__autoDetectInternal === false, 'đổi chế độ -> chạy lại chu trình dò như ĐỔI BÀI (cờ nội bộ BẬT lúc bấm, trả lại sau đó — không coi là người dùng bấm)');
    ok(btn.title.indexOf('Auto Key tạm thời đang BẬT') === 0, 'chú thích nút AUTO DETECT báo chế độ đang BẬT');
    aiChk.listeners.change[0]();
    ok(sb.__getMode() === 'ai' && aiChk.checked && !akChk.checked && btn.title === 'TIP' && btn.clicks === 2, 'tích lại "Dò bằng AI" -> về AI, chú thích trả về như cũ, dò lại');
    const nSaved = sb.saved.length; aiChk.listeners.change[0]();
    ok(sb.saved.length === nSaved && btn.clicks === 2, 'chọn lại đúng chế độ đang dùng -> không ghi file, không dò lại');
    const sbH = build({ held: true }); const cardH = sbH.document.body.children[0]; cardH.children[1].children[0].listeners.change[0]();
    ok(sbH.__getMode() === 'autokey-temp' && !sbH.__els.btn.clicks, 'đang GIỮ Key tay -> chỉ lưu chế độ, KHÔNG dò lại/đè Key tay');
    const sbN = build({ running: false }); sbN.document.body.children[0].children[1].children[0].listeners.change[0]();
    ok(sbN.__getMode() === 'autokey-temp' && !sbN.__els.btn.clicks, 'SYSTEM_AUDIO chưa chạy -> chỉ lưu chế độ (có hiệu lực khi nguồn chạy)');
    { // dòng trạng thái khối KEY
        const mkS = (mode, src, busy) => { const x = build({ startMode: mode }); x.keyInfoEl = { textContent: 'GIỮ' }; x.getActiveSourceName = () => src; x.__autoKeyRun = { busy: !!busy }; return x; };
        const st = { key: 'C Major', text: 'BẮT NHANH LIVE (92%)' };
        const a = mkS('autokey-temp', 'ai'); vm.runInContext('__akShowStatus(' + JSON.stringify(st) + ')', a);
        ok(a.keyInfoEl.textContent === 'Auto Key tạm: BẮT NHANH LIVE (92%)', 'chế độ BẬT: dòng KEY hiện "' + a.keyInfoEl.textContent + '"');
        vm.runInContext('__akShowStatus({ key: "C Major", text: "DÒ XONG (99%)" })', a);
        ok(a.keyInfoEl.textContent === 'Auto Key tạm: DÒ XONG (99%)', '% tự cập nhật: "' + a.keyInfoEl.textContent + '"');
        const b = mkS('ai', 'ai'); vm.runInContext('__akShowStatus(' + JSON.stringify(st) + ')', b); ok(b.keyInfoEl.textContent === 'GIỮ', 'chế độ AI: dòng KEY KHÔNG bị đụng');
        const c = mkS('autokey-temp', 'manual'); vm.runInContext('__akShowStatus(' + JSON.stringify(st) + ')', c); ok(c.keyInfoEl.textContent === 'GIỮ', 'Manual đang điều khiển: không đè dòng Manual Key');
        const d = mkS('autokey-temp', 'songDb'); vm.runInContext('__akShowStatus(' + JSON.stringify(st) + ')', d); ok(d.keyInfoEl.textContent === 'GIỮ', 'Song Database đang điều khiển: không đè');
        const e = mkS('autokey-temp', 'ai', true); vm.runInContext('__akShowStatus(' + JSON.stringify(st) + ')', e); ok(e.keyInfoEl.textContent === 'GIỮ', 'Auto-Key cũ đang chạy: không đè');
        const f = mkS('autokey-temp', 'ai'); f.AutoKeyLive.getState = () => ({ status: 'DÒ XONG (97%)' });
        ok(vm.runInContext('__akStatusLine({ confidence: 0.97 })', f) === 'Auto Key tạm: DÒ XONG (97%)' && vm.runInContext('(function(){ AutoKeyLive.getState = () => ({ status: "" }); return __akStatusLine({ confidence: 0.97 }); })()', f) === 'Auto Key tạm (97% tin cậy)', 'dòng trạng thái lúc có Key: nhãn engine; dự phòng "(xx% tin cậy)" nếu chưa có nhãn');
    }
    const sbK = build({ startMode: 'autokey-temp' });
    ok(sbK.__akTempOn === undefined ? vm.runInContext('__akTempOn()', sbK) === true : true, 'mở app khi đang ở chế độ Auto Key tạm thời -> nhận đúng chế độ đã lưu');
    ok(vm.runInContext('__akDetectOnce(function(){})', sbK) === undefined, 'chế độ BẬT + engine sẵn sàng -> chu trình dò dùng AutoKeyLive.detectOnce (không phải KeyEngine)');
    const sbA = build({ startMode: 'ai' }); ok(vm.runInContext('__akDetectOnce(function(){})', sbA) === 'ai', 'chế độ AI (mặc định) -> chu trình dò dùng KeyEngine.detectOnce y như cũ');
    const sbX = build({ startMode: 'autokey-temp' }); sbX.AutoKeyLive.isReady = () => false; ok(vm.runInContext('__akDetectOnce(function(){})', sbX) === 'ai', 'engine chưa sẵn sàng -> tự lùi về AI (an toàn)');
}

console.log('G. Các điểm nối trong renderer.js + KHÔNG sửa HTML / KeyEngine');
ok(/window\.__keyDetectStopWatcher = \(typeof __akDetectOnce === "function" \? __akDetectOnce : KeyEngine\.detectOnce\)\(\(result\) => \{/.test(r), 'chu trình dò Key chọn nguồn qua __akDetectOnce (mặc định vẫn KeyEngine.detectOnce)');
ok(/!\(result && result\.engine === "autokey-live"\) && !\(keySource\.manual && \(keySource\.manual\.active/.test(r), 'Key của Auto Key tạm KHÔNG tự thay Key Database (DB_BYPASS_AUTO)');
ok(/if \(result && result\.engine === "autokey-live"\) \{[^\n]*\} else if \(keySource\.songDb && !keySource\.songDb\.active\) \{\s*\n\s*window\.electronAPI\?\.submitDetectedKey/.test(r), 'Key của Auto Key tạm KHÔNG ghi lên Key Server (dòng gốc `if (keySource.songDb && !keySource.songDb.active)` giữ nguyên)');
ok(/KeyEngine\.onProvisionalEstimate\(\(estimate\) => \{\n\s+if \(typeof __akTempOn === "function" && __akTempOn\(\)\) return;/.test(r), 'Key tạm/tự sửa của AI cũ im lặng khi đang dùng Auto Key tạm thời');
ok(/KeyEngine\.init\(audioContext, source\);\n\s+if \(typeof __akBind === "function"\) __akBind\(audioContext, source\);/.test(r), 'bindAiEnginesToSystemAudio khởi động chu trình mới cho engine');
ok((r.match(/if \(typeof AutoKeyLive !== "undefined"\) AutoKeyLive\.stop\(\); \/\/ AUTOKEY-TEMP-01/g) || []).length === 2, 'mất thiết bị (2 chỗ) -> engine dừng bắt âm thanh');
ok(/if \(typeof initAutoKeyTempCard === "function"\) initAutoKeyTempCard\(\);/.test(r), 'thẻ chuột phải được khởi tạo lúc mở app');
ok(/keyInfoEl && !__autoKeyRun\.busy\) keyInfoEl\.textContent = `Auto Detect \(/.test(r) && /result\.engine === "autokey-live" && keyInfoEl && !__autoKeyRun\.busy\) keyInfoEl\.textContent = __akStatusLine\(result\)/.test(r), 'dòng trạng thái: AI cũ vẫn "Auto Detect (xx% tin cậy)" (nguyên văn); Auto Key tạm dùng nhãn riêng (__akStatusLine)');
ok(/AutoKeyLive\.onStatus === "function"\) AutoKeyLive\.onStatus\(__akShowStatus\)/.test(r), 'mỗi lần bind, engine được nối với dòng trạng thái KEY (% tự cập nhật)');
const html = rd('ui/index.html'); ok(!/autoKeyLive|AutoKeyLive|keyModeAutoKey/.test(html), 'index.html KHÔNG bị sửa (không thêm script/nút nào)');
const ke = rd('ui/js/engines/keyEngine.js'); ok(!/AutoKeyLive|autokey-live/.test(ke), 'keyEngine.js (AI cũ) không bị sửa');
const eng = rd('ui/js/engines/autoKeyLiveEngine.js'); ok(!/KeyEngine|require\(|fetch\(|XMLHttpRequest/.test(eng.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'engine độc lập: không gọi KeyEngine, không mạng');
const I = require(path.join(__dirname, '../../ui/js/i18n.js'));
I.setLang('en'); ok(I.translate('Auto Key tạm thời') === 'Temporary Auto Key' && I.translate('Auto Key tạm (87% tin cậy)') === 'Temp Auto Key (87% confidence)', '[en] chữ mới được dịch');
ok(I.translate('Auto Key tạm: BẮT NHANH LIVE (92%)') === 'Temp Auto Key: QUICK LIVE LOCK (92%)' && I.translate('Auto Key tạm: DÒ XONG (99%)') === 'Temp Auto Key: DONE (99%)', '[en] nhãn % mới được dịch');
I.setLang('vi'); ok(I.translate('Temporary Auto Key') === 'Auto Key tạm thời', '[vi] trả lại tiếng Việt');
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
}
