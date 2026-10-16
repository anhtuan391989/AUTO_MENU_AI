'use strict';
// AI-ALG-08 — chạy KeyEngine + ModEngine THẬT (đọc nguyên mã ui/js/engines trong vm, đồng hồ ảo) trên 1 file audio.
// Giải mã bằng ffmpeg -> mono float32 22050 Hz. KHÔNG sửa engine. Mô phỏng cách renderer dùng: ModEngine bắt đầu sau khi Key đầu tiên được báo.
const { spawnSync } = require('child_process'), path = require('path');
const { mkAnalyser, sandbox, loadEngine } = require('../lib.js');
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function decode(file, sr = 22050) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
    if (r.status !== 0) throw new Error('ffmpeg lỗi: ' + String(r.stderr).slice(0, 200));
    const b = r.stdout; return { pcm: new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)), sr };
}
function runEngines(repo, pcm, sr, opt = {}) {
    const clock = { t: 1000 }, secs = pcm.length / sr, S = sandbox(clock, () => mkAnalyser(pcm, sr, 8192, clock, 1000), sr);
    loadEngine(repo, S.sb, 'keyEngine.js', 'KeyEngine'); loadEngine(repo, S.sb, 'modEngine.js', 'ModEngine');
    const K = S.sb.KeyEngine, M = S.sb.ModEngine; K.init(S.ctx, { connect() {} });
    const T = () => (clock.t - 1000) / 1000, timeline = [], events = [], labels = []; let modOn = false, firstPc = null;
    K.watchContinuous((res) => {
        timeline.push({ t: T(), pc: res.rootIndex, mode: String(res.mode).toLowerCase() });
        if (!modOn) { modOn = true; firstPc = res.rootIndex;
            M.start(res.rootIndex, (d) => events.push({ t: T(), kind: d.kind || 'MODULATION', semitone_abs: d.semitone, semitone_delta: undefined, target_key: d.targetKey }),
                () => false, (st, p) => { if (st === 'KEY_LABEL_CHANGED') labels.push({ t: T(), kind: p && p.kind }); }, { originalMode: res.mode }); }
    });
    S.step(Math.floor(secs * 1000)); try { M.stop(); } catch (e) { } K.stop();
    // semitone_delta (có dấu, so với key đứng ngay trước) suy từ semitone_abs của ModEngine (đã là offset tuyệt đối so với key gốc)
    let prev = 0; events.filter((e) => e.kind === 'MODULATION').forEach((e) => { if (Number.isFinite(e.semitone_abs)) { let d = ((e.semitone_abs - prev) % 12 + 12) % 12; e.semitone_delta = d > 6 ? d - 12 : d; prev = e.semitone_abs; } });
    return { key_timeline: timeline, mod_events: events, label_events: labels, duration_s: secs, first_key: firstPc === null ? null : NOTE[firstPc] };
}
module.exports = { decode, runEngines };
