/**
 * core/integration/KeyTimeline.js — MOD theo đoạn của Key Server (Claude C)
 * ----------------------------------------------------------
 * Bài có nhiều đoạn Key trên server (vd 02:23 đổi Eb -> E):
 *   1. buildPlan(): đổi danh sách đoạn của server thành "kế hoạch": mỗi lần đổi tone = {time:"02:23", from:"Eb", to:"E", semitone:+1}.
 *   2. KeyTimelineRunner: canh phút hiện tại của bài; tới đoạn mới thì gọi onFire() ĐÚNG 1 LẦN (renderer sẽ gửi sang Auto-Tune
 *      bằng đường MOD sẵn có — SoundShifter KHÔNG bị chạm, SoundShifter chỉ chạy khi người dùng bấm SET).
 *   3. estimatePositionSec(): ước lượng phút hiện tại: MPC-HC có vị trí thật; trình duyệt (SMTC) chưa có vị trí -> tính từ lúc bắt đầu bài.
 *
 * Module THUẦN: không Electron, không mạng, không MIDI. Đồng hồ/timer đều tiêm được nên test không phải chờ thật.
 */
"use strict";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_TO_SHARP = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
const MPC_STATE_PLAYING = 2;

// "Eb" | "D#" | "E♭" -> 0..11, không hiểu -> -1
function rootIndex(raw) {
    const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(String(raw == null ? "" : raw).trim());
    if (!m) return -1;
    const root = m[1].toUpperCase() + m[2].replace("♯", "#").replace("♭", "b");
    return NOTES.indexOf(FLAT_TO_SHARP[root] || root);
}

function normMode(raw) {
    return /^min/i.test(String(raw || "").trim()) ? "minor" : "major";
}

// Số bán cung ngắn nhất (-6..+6) để đi từ Key này sang Key kia. Khác mode (Am <-> C) thì so theo giọng trưởng tương đối.
function tonicShift(fromRoot, fromMode, toRoot, toMode) {
    const rel = (idx, mode) => (mode === "minor" ? (idx + 3) % 12 : idx);
    let d = (((rel(toRoot, toMode) - rel(fromRoot, fromMode)) % 12) + 12) % 12;
    if (d > 6) d -= 12;
    return d;
}

function mmss(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function keyId(seg) { return seg.rootIdx + "|" + seg.mode; }

/**
 * @param {Array<{startSec:number, key?:string, khoa?:string, mode?:string}>} rawSegments đoạn của server (/song-full "doans")
 * @returns {{segments:Array, changes:Array}|null} null nếu bài không có ít nhất 1 lần đổi Key thật.
 */
function buildPlan(rawSegments) {
    if (!Array.isArray(rawSegments)) return null;
    const segments = [];
    for (const r of rawSegments) {
        if (!r) continue;
        const startSec = Number(r.startSec);
        const rootRaw = r.key != null ? r.key : r.khoa;
        const idx = rootIndex(rootRaw);
        if (!Number.isFinite(startSec) || startSec < 0 || idx < 0) continue; // đoạn hỏng: bỏ, không bịa
        const mode = normMode(r.mode);
        const rootName = String(rootRaw).trim();
        segments.push({ startSec, rootIdx: idx, mode, name: rootName + (mode === "minor" ? "m" : ""), keyName: rootName + (mode === "minor" ? " Minor" : " Major") });
    }
    segments.sort((a, b) => a.startSec - b.startSec);
    if (segments.length < 2) return null;

    const changes = [];
    for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1], cur = segments[i];
        if (keyId(prev) === keyId(cur)) continue; // cùng Key: không phải đổi tone
        const semitone = tonicShift(prev.rootIdx, prev.mode, cur.rootIdx, cur.mode);
        const time = mmss(cur.startSec);
        changes.push({ index: i, timeSec: cur.startSec, time, from: prev.name, to: cur.name, semitone, label: `${time} - ${prev.name} -> ${cur.name}` });
    }
    if (!changes.length) return null;
    return { segments, changes };
}

// Chỉ số đoạn đang phát tại giây `sec` (đoạn cuối có startSec <= sec; trước đoạn đầu -> 0).
function segmentIndexAt(plan, sec) {
    let idx = 0;
    for (let i = 0; i < plan.segments.length; i++) {
        if (plan.segments[i].startSec <= sec) idx = i; else break;
    }
    return idx;
}

/**
 * Ước lượng phút hiện tại (giây) của bài đang phát. Trả null nếu chưa biết.
 *  - MPC-HC: vị trí thật từ lần poll gần nhất (+ thời gian trôi qua nếu đang Playing).
 *  - Nguồn khác (trình duyệt/SMTC): SMTC của Menu hiện KHÔNG có vị trí -> tính từ lúc Menu thấy bài bắt đầu (songStartedAtMs).
 */
function estimatePositionSec({ source, mpcSnapshot, songStartedAtMs, now }) {
    const t = typeof now === "number" ? now : Date.now();
    if (source === "mpc-hc" && mpcSnapshot && Number.isFinite(mpcSnapshot.positionMs) && mpcSnapshot.durationMs > 0) {
        const elapsedMs = mpcSnapshot.state === MPC_STATE_PLAYING && Number.isFinite(mpcSnapshot.timestamp) ? Math.max(0, t - mpcSnapshot.timestamp) : 0;
        return (mpcSnapshot.positionMs + elapsedMs) / 1000;
    }
    if (Number.isFinite(songStartedAtMs)) return Math.max(0, (t - songStartedAtMs) / 1000);
    return null;
}

class KeyTimelineRunner {
    /**
     * @param {object} o
     * @param {Function} o.getPositionSec () => number|null
     * @param {Function} o.onFire         ({index,timeSec,time,toName,toKeyName,fromName}) => void
     */
    constructor(o) {
        this.getPositionSec = o.getPositionSec;
        this.onFire = o.onFire;
        this.tickMs = o.tickMs || 500;
        this._setInterval = o.setIntervalFn || setInterval;
        this._clearInterval = o.clearIntervalFn || clearInterval;
        this._timer = null;
        this._plan = null;
        this._appliedId = null;
        this._appliedIdx = 0;
    }

    isArmed() { return !!this._plan; }

    arm(plan) {
        this.disarm();
        if (!plan || !plan.segments || plan.segments.length < 2) return;
        this._plan = plan;
        this._appliedIdx = 0;
        this._appliedId = keyId(plan.segments[0]); // mở đầu bài = Key gốc (đoạn 0), Menu đã dùng Key này rồi
        this._timer = this._setInterval(() => this.tick(), this.tickMs);
        if (this._timer && typeof this._timer.unref === "function") this._timer.unref();
        this.tick();
    }

    disarm() {
        if (this._timer !== null) { this._clearInterval(this._timer); this._timer = null; }
        this._plan = null;
        this._appliedId = null;
        this._appliedIdx = 0;
    }

    // Quyết định theo TRẠNG THÁI (đang ở đoạn nào), không theo sự kiện: tua tới/lùi vẫn ra Key đúng; mỗi lần Key đổi gửi đúng 1 lần.
    tick() {
        const plan = this._plan;
        if (!plan) return;
        let pos = null;
        try { pos = this.getPositionSec(); } catch (e) { pos = null; }
        if (typeof pos !== "number" || !Number.isFinite(pos)) return;
        const idx = segmentIndexAt(plan, pos);
        const seg = plan.segments[idx];
        if (keyId(seg) === this._appliedId) { this._appliedIdx = idx; return; }
        const from = plan.segments[this._appliedIdx];
        this._appliedId = keyId(seg);
        this._appliedIdx = idx;
        try {
            this.onFire({ index: idx, timeSec: seg.startSec, time: mmss(seg.startSec), fromName: from.name, toName: seg.name, toKeyName: seg.keyName });
        } catch (e) { /* lỗi gửi không được làm hỏng vòng canh giờ */ }
    }
}

module.exports = { buildPlan, segmentIndexAt, estimatePositionSec, KeyTimelineRunner, tonicShift, rootIndex, mmss };
