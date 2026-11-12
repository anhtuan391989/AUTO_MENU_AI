/**
 * core/integration/NowPlayingClock.js — Đồng hồ bài đang phát (Claude C)
 * ----------------------------------------------------------
 * Từ snapshot của nguồn đang active (MPC-HC hoặc trình duyệt qua SMTC) tính ra:
 *   { positionSec, durationSec, playing, source }
 * hoặc null nếu nguồn đó KHÔNG cung cấp thời lượng thật (không bịa số).
 *
 * Dùng chung cho 2 việc:
 *   1. Hiển thị "01:23 / 04:05" cạnh NOW PLAYING (app/main.js gửi sang renderer).
 *   2. Giúp MOD canh đúng phút (KeyTimeline.estimatePositionSec): tua bài thì đồng hồ + MOD đi theo.
 *
 * Quy ước dữ liệu:
 *   - MPC-HC  : positionMs/durationMs đọc lúc `timestamp` (mỗi lần poll), state 2 = đang phát.
 *   - Trình duyệt (SMTC): positionMs/durationMs/timelineUpdatedMs/playing/playbackRate do smtc-daemon.ps1 đọc
 *     từ GetTimelineProperties(). positionMs là vị trí TẠI timelineUpdatedMs; đang phát thì cộng phần thời gian đã trôi.
 *
 * Module THUẦN: không Electron, không mạng, không timer. `now` tiêm được nên test không phải chờ thật.
 */
"use strict";

const MPC_STATE_PLAYING = 2;

function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * @param {"smtc"|"mpc-hc"|"youtube"|null} source nguồn đang active (NowPlayingArbitrator.resolveActiveSource().source)
 * @param {object|null} snapshot snapshot MỚI NHẤT của chính nguồn đó (không phải bản cũ từ lần "change")
 * @param {number} [now] Date.now() (tiêm khi test)
 * @returns {{positionSec:number, durationSec:number, playing:boolean, source:string}|null}
 */
function compute(source, snapshot, now) {
    const t = isFiniteNumber(now) ? now : Date.now();
    if (!snapshot || typeof snapshot !== "object") return null;

    if (source === "mpc-hc") {
        if (!isFiniteNumber(snapshot.positionMs) || !(snapshot.durationMs > 0)) return null;
        const playing = snapshot.state === MPC_STATE_PLAYING;
        const elapsedMs = playing && isFiniteNumber(snapshot.timestamp) ? Math.max(0, t - snapshot.timestamp) : 0;
        const durationSec = snapshot.durationMs / 1000;
        return { positionSec: clamp((snapshot.positionMs + elapsedMs) / 1000, 0, durationSec), durationSec, playing, source };
    }

    if (source === "smtc") {
        // Trình duyệt chưa/không đẩy thời lượng vào SMTC (vd trang web không báo vị trí) -> không có đồng hồ thật.
        if (!isFiniteNumber(snapshot.positionMs) || !(snapshot.durationMs > 0)) return null;
        const playing = snapshot.playing === true;
        const rate = isFiniteNumber(snapshot.playbackRate) && snapshot.playbackRate > 0 ? snapshot.playbackRate : 1;
        // Không biết lúc nào vị trí được ghi -> coi như vừa đọc xong (timestamp của lần poll).
        const baseAtMs = isFiniteNumber(snapshot.timelineUpdatedMs) && snapshot.timelineUpdatedMs > 0
            ? snapshot.timelineUpdatedMs
            : (isFiniteNumber(snapshot.timestamp) ? snapshot.timestamp : t);
        const elapsedMs = playing ? Math.max(0, t - baseAtMs) * rate : 0;
        const durationSec = snapshot.durationMs / 1000;
        return { positionSec: clamp((snapshot.positionMs + elapsedMs) / 1000, 0, durationSec), durationSec, playing, source };
    }

    if (source === "youtube") {
        // Tiện ích YouTube: positionMs = null khi đang chiếu quảng cáo => chưa có đồng hồ (không bịa số).
        if (!isFiniteNumber(snapshot.positionMs) || !(snapshot.durationMs > 0)) return null;
        const playing = snapshot.isPlaying === true;
        const elapsedMs = playing && isFiniteNumber(snapshot.timestamp) ? Math.max(0, t - snapshot.timestamp) : 0;
        const durationSec = snapshot.durationMs / 1000;
        return { positionSec: clamp((snapshot.positionMs + elapsedMs) / 1000, 0, durationSec), durationSec, playing, source };
    }

    return null;
}

// 125 -> "02:05" ; từ 1 giờ trở lên -> "1:02:05". Không hợp lệ -> "--:--".
function formatClock(sec) {
    if (!isFiniteNumber(sec) || sec < 0) return "--:--";
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

module.exports = { compute, formatClock, MPC_STATE_PLAYING };
