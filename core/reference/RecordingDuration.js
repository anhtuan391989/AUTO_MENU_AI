'use strict';
/**
 * core/reference/RecordingDuration.js — DB-MATCH-ID-02
 * Cùng tên bài nhưng KHÁC bản thu (MV / Karaoke / Lyrics / bản live...) thường KHÁC độ dài.
 * Hai bên (bài đang phát và bản ghi trong Database/Server) cùng biết độ dài -> lệch quá ngưỡng = KHÁC bản thu.
 * Thiếu độ dài ở một bên = không đủ căn cứ để bác -> coi là chưa biết (giữ cách khớp theo tên như cũ).
 * Ngưỡng 3 giây là GIÁ TRỊ TẠM (làm tròn giây + sai số đọc của Windows/trình duyệt) — chỉnh theo dữ liệu thật.
 * Lệch nhầm về phía "khác bản" chỉ khiến AI dò lại vài giây; lệch về phía "cùng bản" mới làm Auto-Tune dùng sai tone.
 */
const DURATION_TOLERANCE_SEC = 3;

function toSec(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }

// true CHỈ khi cả hai độ dài đều biết và lệch hơn ngưỡng.
function durationMismatch(a, b, tol = DURATION_TOLERANCE_SEC) {
    const x = toSec(a), y = toSec(b);
    if (x === null || y === null) return false;
    return Math.abs(x - y) > tol;
}

// "03:45" (định dạng /list của Server) -> 225; không đọc được -> null.
function parseClock(str) {
    const m = /^(\d+):(\d{2})$/.exec(String(str || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

module.exports = { DURATION_TOLERANCE_SEC, durationMismatch, parseClock };
