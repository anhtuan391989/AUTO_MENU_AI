/**
 * core/integration/DawReadyWatcher.js — A106 (Start Hidden)
 * Tự ẨN DAW sau khi DAW MỞ XONG (đã nạp xong VST + đã mở xong project). Không bao giờ ẩn khi chưa chắc DAW đã sẵn sàng.
 *
 * "Sẵn sàng" = CẢ BỐN điều kiện đúng LIÊN TỤC ít nhất stableMs (mặc định 8 s):
 *   1. DAW đang phản hồi (không "Not Responding" — đang nạp plugin thường bị treo tạm).
 *   2. Tiêu đề cửa sổ chính CÓ TÊN PROJECT: đã chọn project ở Setup > AI > Mở kèm Project => tiêu đề phải chứa tên đó (bỏ đuôi .song/.flp…);
 *      chưa chọn => tiêu đề phải KHÁC tên chương trình trần (FSP8 hiện "Studio Pro" khi chưa mở project và "Studio Pro - <tên project>" khi đã mở).
 *   3. CPU của DAW đã "lắng": hoặc thấp (< cpuIdlePct % của 1 lõi), HOẶC ổn định tương đối (5 lần đo gần nhất chênh nhau ≤ 50%).
 *      (A111 — log thật 07/11: FSP8 chạy 113–167% CPU ngay cả khi đã mở project xong, KHÔNG BAO GIỜ xuống dưới 15% => không thể dùng ngưỡng tuyệt đối.
 *      Nạp VST thì CPU nhảy lên xuống rất mạnh; khi xong thì mức tải đều.)
 *   4. Cả ba điều kiện trên giữ liên tục, không bị ngắt giữa chừng.
 * Quá timeoutMs (mặc định 5 phút) mà chưa sẵn sàng => BỎ CUỘC, KHÔNG ẩn (DAW vẫn hiện bình thường), ghi lý do vào nhật ký.
 * Mỗi tiến trình DAW (PID) chỉ được tự ẩn đúng 1 lần: người dùng tự Hiện lại thì KHÔNG bị ẩn lại. DAW tắt rồi mở lại => lượt mới.
 *
 * Module Node thuần: mọi thứ chạm Windows (tasklist/PowerShell/ẩn cửa sổ/đọc cấu hình) được TIÊM vào => test được bằng đối tượng giả.
 * KHÔNG BAO GIỜ throw ra ngoài. KHÔNG tự đóng/kill DAW.
 */
'use strict';

const path = require('path');
const { execFile } = require('child_process');

const DEFAULTS = Object.freeze({ pollIdleMs: 5000, pollReadyMs: 2000, stableMs: 10000, timeoutMs: 300000, cpuIdlePct: 15, cpuWindow: 5, cpuSpread: 0.5, hideRetries: 3, retryGapMs: 5000 });

const norm = (s) => String(s == null ? '' : s).normalize('NFC').toLowerCase();

// "D:\Show\Live Set.song" -> "Live Set"
function projectName(projectPath) {
    try {
        const p = String(projectPath || '').trim();
        if (!p) return '';
        const base = p.split(/[\\/]/).filter(Boolean).pop() || '';
        return base.replace(/\.[^.\\/]{1,8}$/, '').trim();
    } catch (e) { return ''; }
}

// Đánh giá 1 lần đo. sample = { title, responding, cpuMs, t }. prev = lần đo trước (hoặc null). hist = các %CPU đo trước đó. appName = tên chương trình trần (vd "Studio Pro").
function evaluateSample({ sample, prev, project, cpuIdlePct, appName, hist, cpuWindow, cpuSpread }) {
    const lim = cpuIdlePct == null ? DEFAULTS.cpuIdlePct : cpuIdlePct;
    const win = cpuWindow || DEFAULTS.cpuWindow, spread = cpuSpread == null ? DEFAULTS.cpuSpread : cpuSpread;
    const prevH = Array.isArray(hist) ? hist : [];
    if (!sample) return { ready: false, reason: 'NO_SAMPLE', cpuPct: null, hist: prevH, cpuStable: false };
    let cpuPct = null;
    if (prev && sample.t > prev.t && Number.isFinite(sample.cpuMs) && Number.isFinite(prev.cpuMs)) cpuPct = Math.max(0, (sample.cpuMs - prev.cpuMs) / (sample.t - prev.t) * 100);
    const h2 = cpuPct === null ? prevH : prevH.concat([cpuPct]).slice(-win);
    let cpuStable = false;
    if (h2.length >= win) { const mx = Math.max(...h2), mn = Math.min(...h2), mean = h2.reduce((x, y) => x + y, 0) / h2.length; cpuStable = mean > 0 && (mx - mn) / mean <= spread; }
    const out = (ready, reason) => ({ ready, reason, cpuPct, hist: h2, cpuStable });
    if (sample.responding === false) return out(false, 'NOT_RESPONDING');
    const title = String(sample.title || '').trim();
    if (!title) return out(false, 'NO_WINDOW_TITLE');
    if (project) { if (!norm(title).includes(norm(project))) return out(false, 'TITLE_MISSING_PROJECT'); }
    else if (appName && norm(title) === norm(appName)) return out(false, 'TITLE_NO_PROJECT');
    if (cpuPct === null) return out(false, 'MEASURING_CPU');
    if (cpuPct >= lim && !cpuStable) return out(false, 'CPU_BUSY');
    return out(true, 'READY');
}

// Tên chương trình trần từ đường dẫn exe: "C:\\...\\Studio Pro.exe" -> "Studio Pro"
function appNameOf(exe) { try { return path.win32.basename(String(exe || '')).replace(/\.exe$/i, ''); } catch (e) { return ''; } }

// Project thật của người dùng = ô "Mở kèm Project" (appSettings.projectPath). Ô Startup & Paths cũ (đã bỏ khỏi giao diện) chỉ còn là dự phòng cho cấu hình cũ.
function pickProject(s, sp) {
    const a = typeof s.projectPath === 'string' ? s.projectPath.trim() : '';
    if (a && a !== 'Chưa chọn project') return a;
    return typeof sp.dawProject === 'string' ? sp.dawProject.trim() : '';
}

function createDawReadyWatcher(deps) {
    const d = deps || {};
    const cfg = { ...DEFAULTS, ...(d.options || {}) };
    const now = d.now || (() => Date.now());
    const setT = d.setTimer || ((f, ms) => setTimeout(f, ms));
    const clearT = d.clearTimer || ((t) => clearTimeout(t));
    const log = (m) => { try { (d.log || (() => {}))('[StartHidden] ' + m); } catch (e) { /* bỏ qua */ } };

    let timer = null, running = false, handled = null, tracked = null, lastReason = '';
    let st = { phase: 'off', detail: '', pid: null };
    const setPhase = (phase, detail, pid) => { st = { phase, detail: detail || '', pid: pid == null ? (tracked ? tracked.pid : null) : pid }; };

    function readCfg() {
        try {
            const s = (d.readSettings && d.readSettings()) || {};
            const sp = s.startupPaths || {};
            return { enabled: !!(s.hiddenDaw && s.hiddenDaw.startHidden === true), exe: d.getExe ? d.getExe() : '', project: pickProject(s, sp) };
        } catch (e) { return { enabled: false, exe: '', project: '' }; }
    }
    const next = (ms) => { if (!running) return; try { if (timer) clearT(timer); } catch (e) { /* bỏ qua */ } timer = setT(tick, ms); if (timer && typeof timer.unref === 'function') timer.unref(); };

    function giveUp(pid, why) {
        handled = pid; setPhase('gave_up', 'Không tự ẩn vì chưa xác nhận DAW mở xong: ' + why, pid);
        log('BỎ CUỘC pid=' + pid + ' — ' + why + ' (DAW giữ nguyên, vẫn hiện)');
        tracked = null;
    }

    function tick() {
        let finished = false;
        const once = (ms) => { if (finished) return; finished = true; next(ms); };
        try {
            const c = readCfg();
            if (!c.enabled || !c.exe) { handled = null; tracked = null; lastReason = ''; setPhase('off', ''); once(cfg.pollIdleMs); return; }
            d.taskPids(c.exe, (pids) => {
                try {
                    if (!Array.isArray(pids)) { once(cfg.pollIdleMs); return; }
                    if (handled != null) { if (pids.includes(handled)) { once(cfg.pollIdleMs); return; } handled = null; lastReason = ''; } // DAW đã tắt => lượt mới
                    if (tracked && !pids.includes(tracked.pid)) tracked = null;
                    if (!pids.length) { tracked = null; setPhase('waiting_daw', 'Chờ DAW được mở.'); once(cfg.pollIdleMs); return; }
                    if (tracked) { measure(c, once); return; }
                    d.identify(c.exe, (ids) => {
                        try {
                            const pid = (Array.isArray(ids) ? ids : []).find((p) => p !== handled);
                            if (pid == null) { setPhase('waiting_daw', 'Chờ DAW được mở (đúng file đã chọn).'); once(cfg.pollIdleMs); return; }
                            tracked = { pid, firstSeen: now(), prev: null, readySince: null, tries: 0, hist: [], lastLog: 0 };
                            log('thấy DAW pid=' + pid + ' — bắt đầu chờ nạp xong VST + mở project' + (c.project ? ' "' + projectName(c.project) + '"' : ' (chưa chọn project: tiêu đề phải khác tên chương trình trần "' + appNameOf(c.exe) + '")'));
                            measure(c, once);
                        } catch (e) { log('lỗi identify: ' + (e && e.message)); once(cfg.pollIdleMs); }
                    });
                } catch (e) { log('lỗi tick: ' + (e && e.message)); once(cfg.pollIdleMs); }
            });
        } catch (e) { log('lỗi tick: ' + (e && e.message)); once(cfg.pollIdleMs); }
    }

    function measure(c, once) {
        const tk = tracked; const pid = tk.pid;
        d.sample(pid, (s) => {
            try {
                if (tracked !== tk) { once(cfg.pollIdleMs); return; }
                if (s === 'GONE') { tracked = null; once(cfg.pollIdleMs); return; }
                if (now() - tk.firstSeen > cfg.timeoutMs) { giveUp(pid, 'quá ' + Math.round(cfg.timeoutMs / 1000) + ' giây; lý do cuối: ' + (lastReason || 'không đo được')); once(cfg.pollIdleMs); return; }
                if (!s) { once(cfg.pollReadyMs); return; }
                const ev = evaluateSample({ sample: s, prev: tk.prev, project: projectName(c.project), cpuIdlePct: cfg.cpuIdlePct, appName: appNameOf(c.exe), hist: tk.hist, cpuWindow: cfg.cpuWindow, cpuSpread: cfg.cpuSpread });
                tk.prev = s; tk.hist = ev.hist;
                const why = ev.reason + (ev.cpuPct != null ? ' cpu=' + ev.cpuPct.toFixed(1) + '%' : '') + ' tiêu đề="' + String(s.title || '').slice(0, 80) + '"';
                if (ev.reason !== lastReason || now() - tk.lastLog >= 10000) { tk.lastLog = now(); log('pid=' + pid + ' chưa/đã sẵn sàng: ' + why + (ev.cpuStable ? ' (CPU ổn định)' : '')); }
                lastReason = ev.reason;
                if (!ev.ready) { tk.readySince = null; setPhase('waiting_ready', 'Đang chờ DAW nạp xong VST/project (' + ev.reason + (ev.reason === 'TITLE_NO_PROJECT' ? ': tiêu đề DAW chỉ là "' + String(s.title || '').slice(0, 60) + '" — chưa thấy project nào được mở' : '') + (ev.reason === 'TITLE_MISSING_PROJECT' ? ': tiêu đề DAW hiện là "' + String(s.title || '').slice(0, 60) + '", cần có chữ "' + projectName(c.project) + '"' : '') + (ev.cpuPct != null ? '; CPU ' + ev.cpuPct.toFixed(0) + '%' : '') + ').', pid); once(cfg.pollReadyMs); return; }
                if (tk.readySince == null) tk.readySince = now();
                if (now() - tk.readySince < cfg.stableMs) { setPhase('waiting_ready', 'DAW có vẻ đã xong, đang xác nhận ổn định…', pid); once(cfg.pollReadyMs); return; }
                if (d.isHidden && d.isHidden()) { handled = pid; tracked = null; setPhase('done', 'DAW đã được ẩn sẵn.', pid); once(cfg.pollIdleMs); return; }
                setPhase('hiding', 'Đang ẩn DAW…', pid);
                log('pid=' + pid + ' đã sẵn sàng ổn định ' + cfg.stableMs + ' ms — ẨN DAW');
                d.hide((r) => {
                    try {
                        if (tracked !== tk) { once(cfg.pollIdleMs); return; }
                        if (r && r.ok) { handled = pid; tracked = null; setPhase('done', 'Đã tự ẩn DAW sau khi mở xong.', pid); log('ẨN OK pid=' + pid); once(cfg.pollIdleMs); return; }
                        tk.tries++; tk.readySince = null;
                        log('ẨN LỖI lần ' + tk.tries + ': ' + ((r && r.message) || 'không rõ'));
                        if (tk.tries >= cfg.hideRetries) { giveUp(pid, 'ẩn thất bại ' + tk.tries + ' lần — ' + ((r && r.message) || 'không rõ')); once(cfg.pollIdleMs); return; }
                        once(cfg.retryGapMs);
                    } catch (e) { once(cfg.pollIdleMs); }
                });
            } catch (e) { log('lỗi measure: ' + (e && e.message)); once(cfg.pollIdleMs); }
        });
    }

    return {
        start() { if (running) return; running = true; log('bật theo dõi Start Hidden'); next(1000); },
        stop() { running = false; try { if (timer) clearT(timer); } catch (e) { /* bỏ qua */ } timer = null; },
        tick, phase: () => ({ ...st }), _state: () => ({ handled, tracked }),
    };
}

// ---- Cài đặt thật trên Windows (không chạy ở test) ----
function realDeps({ windowHider, log, readSettings, getExe, hide, isHidden }) {
    const win = process.platform === 'win32';
    const psRun = (script, cb) => {
        if (!win) { cb(null); return; }
        try {
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + script], { windowsHide: true, timeout: 12000, encoding: 'utf8' }, (err, out) => cb(err ? null : String(out || '').trim()));
        } catch (e) { cb(null); }
    };
    return {
        log, readSettings, getExe, hide, isHidden,
        taskPids(exe, cb) {
            if (!win) { cb(null); return; }
            try {
                const img = path.win32.basename(String(exe));
                execFile('tasklist', ['/FI', 'IMAGENAME eq ' + img, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000, encoding: 'utf8' }, (err, out) => {
                    if (err) { cb(null); return; }
                    const pids = []; String(out || '').split(/\r?\n/).forEach((l) => { const m = /^"[^"]*","(\d+)"/.exec(l.trim()); if (m) pids.push(parseInt(m[1], 10)); });
                    cb(pids);
                });
            } catch (e) { cb(null); }
        },
        identify(exe, cb) { // xác minh ĐÚNG đường dẫn bằng WindowHider.probe (đã chuẩn hoá ở A102)
            try { windowHider.probe(exe, (p) => cb(p && p.state === 'running' && Array.isArray(p.pids) ? p.pids : [])); } catch (e) { cb([]); }
        },
        sample(pid, cb) {
            const n = parseInt(pid, 10); if (!Number.isSafeInteger(n) || n <= 0) { cb(null); return; }
            psRun('$p = Get-Process -Id ' + n + ' -ErrorAction SilentlyContinue; if ($null -eq $p) { "GONE" } else { "S|" + $p.Responding + "|" + [int64]$p.TotalProcessorTime.TotalMilliseconds + "|" + $p.MainWindowTitle }', (out) => {
                if (out == null) { cb(null); return; }
                if (out === 'GONE') { cb('GONE'); return; }
                const m = /^S\|(True|False)\|(\d+)\|([\s\S]*)$/.exec(out);
                cb(m ? { responding: m[1] === 'True', cpuMs: parseInt(m[2], 10), title: m[3], t: Date.now() } : null);
            });
        },
    };
}

module.exports = { createDawReadyWatcher, evaluateSample, projectName, pickProject, appNameOf, realDeps, DEFAULTS };
