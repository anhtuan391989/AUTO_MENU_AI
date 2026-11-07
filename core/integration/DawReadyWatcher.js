/**
 * core/integration/DawReadyWatcher.js — A106 (Start Hidden)
 * Tự ẨN DAW sau khi DAW MỞ XONG (đã nạp xong VST + đã mở xong project). Không bao giờ ẩn khi chưa chắc DAW đã sẵn sàng.
 *
 * "Sẵn sàng" = CẢ BỐN điều kiện đúng LIÊN TỤC ít nhất stableMs (mặc định 8 s):
 *   1. DAW đang phản hồi (không "Not Responding" — đang nạp plugin thường bị treo tạm).
 *   2. Tiêu đề cửa sổ chính CÓ TÊN PROJECT đã chọn ở Setup > Startup & Paths (bỏ phần đuôi .song/.flp…).
 *      Chưa chọn project => chỉ cần tiêu đề không rỗng.
 *   3. CPU của tiến trình DAW thấp (< cpuIdlePct % của 1 lõi) — nạp VST/mở project rất tốn CPU.
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

const DEFAULTS = Object.freeze({ pollIdleMs: 5000, pollReadyMs: 2000, stableMs: 8000, timeoutMs: 300000, cpuIdlePct: 15, hideRetries: 3, retryGapMs: 5000 });

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

// Đánh giá 1 lần đo. sample = { title, responding, cpuMs, t }. prev = lần đo trước (hoặc null).
function evaluateSample({ sample, prev, project, cpuIdlePct }) {
    const lim = cpuIdlePct == null ? DEFAULTS.cpuIdlePct : cpuIdlePct;
    if (!sample) return { ready: false, reason: 'NO_SAMPLE', cpuPct: null };
    let cpuPct = null;
    if (prev && sample.t > prev.t && Number.isFinite(sample.cpuMs) && Number.isFinite(prev.cpuMs)) cpuPct = Math.max(0, (sample.cpuMs - prev.cpuMs) / (sample.t - prev.t) * 100);
    if (sample.responding === false) return { ready: false, reason: 'NOT_RESPONDING', cpuPct };
    const title = String(sample.title || '').trim();
    if (!title) return { ready: false, reason: 'NO_WINDOW_TITLE', cpuPct };
    if (project && !norm(title).includes(norm(project))) return { ready: false, reason: 'TITLE_MISSING_PROJECT', cpuPct };
    if (cpuPct === null) return { ready: false, reason: 'MEASURING_CPU', cpuPct };
    if (cpuPct >= lim) return { ready: false, reason: 'CPU_BUSY', cpuPct };
    return { ready: true, reason: 'READY', cpuPct };
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
            return { enabled: !!(s.hiddenDaw && s.hiddenDaw.startHidden === true), exe: d.getExe ? d.getExe() : '', project: typeof sp.dawProject === 'string' ? sp.dawProject : '' };
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
                            tracked = { pid, firstSeen: now(), prev: null, readySince: null, tries: 0 };
                            log('thấy DAW pid=' + pid + ' — bắt đầu chờ nạp xong VST + mở project' + (c.project ? ' "' + projectName(c.project) + '"' : ' (chưa chọn project: chỉ cần có tiêu đề)'));
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
                const ev = evaluateSample({ sample: s, prev: tk.prev, project: projectName(c.project), cpuIdlePct: cfg.cpuIdlePct });
                tk.prev = s;
                const why = ev.reason + (ev.cpuPct != null ? ' cpu=' + ev.cpuPct.toFixed(1) + '%' : '') + ' tiêu đề="' + String(s.title || '').slice(0, 80) + '"';
                if (ev.reason !== lastReason) log('pid=' + pid + ' chưa/đã sẵn sàng: ' + why);
                lastReason = ev.reason;
                if (!ev.ready) { tk.readySince = null; setPhase('waiting_ready', 'Đang chờ DAW nạp xong VST/project (' + ev.reason + ').', pid); once(cfg.pollReadyMs); return; }
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

module.exports = { createDawReadyWatcher, evaluateSample, projectName, realDeps, DEFAULTS };
