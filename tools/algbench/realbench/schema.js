'use strict';
// AI-ALG-08 — schema ground-truth Key/Modulation cho nhạc thật. Chỉ kiểm tra dữ liệu; KHÔNG chạm runtime.
// Nhãn: reference_status = VERIFIED_INDEPENDENT (đã kiểm chứng độc lập) | UNVERIFIED_REFERENCE (người dùng cung cấp, chưa kiểm chứng).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = { DB: 1, EB: 3, GB: 6, AB: 8, BB: 10, CB: 11, FB: 4, 'E#': 5, 'B#': 0 };
const REF_STATUS = ['VERIFIED_INDEPENDENT', 'UNVERIFIED_REFERENCE'];
const SPLITS = ['dev', 'test'];
// Đoạn không xác định chắc chắn: mode "undetermined", tonic null — KHÔNG ép về một key; bị loại khỏi mẫu số key accuracy.
const MODES = ['major', 'minor', 'undetermined'];
// AI-ALG-09 (tùy chọn, tương thích ngược): label_state mô tả mức tin cậy của nhãn; ánh xạ UNDETERMINED = NO_REFERENCE / segments mode "undetermined".
const LABEL_STATES = ['VERIFIED', 'USER_LABEL_UNVERIFIED', 'NO_REFERENCE', 'NEEDS_CLARIFICATION'];

function pc(name) { // tên nốt -> pitch class 0..11, hoặc null
    if (typeof name !== 'string') return null;
    const s = name.trim().toUpperCase().replace('♯', '#').replace('♭', 'B');
    const i = NOTE.indexOf(s); if (i >= 0) return i;
    return Object.prototype.hasOwnProperty.call(FLAT, s) ? FLAT[s] : null;
}
function parseKey(k) { // {tonic:"D",mode:"major"} -> {pc,mode} | null (không hợp lệ). undetermined -> {pc:null,mode:"undetermined"}
    if (!k || typeof k !== 'object') return null;
    const mode = String(k.mode || '').toLowerCase();
    if (!MODES.includes(mode)) return null;
    if (mode === 'undetermined') return { pc: null, mode };
    const p = pc(k.tonic); return p === null ? null : { pc: p, mode };
}

// AI-ALG-10 — đọc tên giọng dạng chuỗi ("Bb Minor", "A# minor", "E Major", "Db trưởng"). Enharmonic quy về cùng pitch class.
// Major/Minor luôn tách biệt (relative KHÔNG bằng nhau). Không có mode rõ ràng => null (không đoán).
function parseKeyString(str) {
    if (typeof str !== 'string') return null;
    const m = str.trim().replace('♯', '#').replace('♭', 'b').match(/^([A-Ga-g])\s*([#b]?)\s*[-\s]*(major|minor|maj|min|trưởng|thứ)$/i);
    if (!m) return null;
    const mode = /^(major|maj|trưởng)$/i.test(m[3]) ? 'major' : 'minor', p = pc(m[1].toUpperCase() + (m[2] === 'b' ? 'B' : m[2]));
    return p === null ? null : { pc: p, mode };
}
const keyLabel = (k) => (k && k.pc !== null ? `${NOTE[k.pc]} ${k.mode}` : null);   // tên chuẩn hóa (dùng thang # cho enharmonic)
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Kiểm tra 1 track. Trả {errors[], warnings[]}.
function validateTrack(t, idx) {
    const E = [], W = [], id = (t && t.track_id) || `#${idx}`, at = (m) => `${id}: ${m}`;
    if (!t || typeof t !== 'object') return { errors: [`#${idx}: không phải object`], warnings: [] };
    if (!t.track_id || typeof t.track_id !== 'string') E.push(at('thiếu track_id'));
    if (!t.audio_reference || typeof t.audio_reference !== 'object') E.push(at('thiếu audio_reference'));
    else if (!t.audio_reference.path && !t.audio_reference.source_url && t.reference_status === 'VERIFIED_INDEPENDENT') E.push(at('bài VERIFIED cần audio_reference.path hoặc source_url (bài chưa xác minh được phép chưa có nguồn audio)'));
    if (t.audio_hash !== null && t.audio_hash !== undefined && !/^[0-9a-f]{64}$/.test(String(t.audio_hash))) E.push(at('audio_hash phải là sha256 hex 64 ký tự hoặc null'));
    if (!REF_STATUS.includes(t.reference_status)) E.push(at(`reference_status phải thuộc ${REF_STATUS.join('|')}`));
    if (!t.annotator || typeof t.annotator !== 'string') E.push(at('thiếu annotator/nguồn xác minh'));
    if (!SPLITS.includes(t.split)) E.push(at('split phải là dev|test'));
    if (typeof t.annotation_notes !== 'string') E.push(at('thiếu annotation_notes (có thể để chuỗi rỗng)'));
    if (!Array.isArray(t.segments)) E.push(at('segments phải là mảng'));
    else {
        let prevEnd = -Infinity;
        t.segments.forEach((s, i) => {
            const p = at(`segments[${i}]`);
            if (!isNum(s.start_time) || s.start_time < 0) E.push(`${p}: start_time không hợp lệ`);
            if (s.end_time !== null && !isNum(s.end_time)) E.push(`${p}: end_time phải là số hoặc null (null = đến hết bài)`);
            if (isNum(s.end_time) && isNum(s.start_time) && s.end_time <= s.start_time) E.push(`${p}: end_time <= start_time`);
            if (!parseKey(s)) E.push(`${p}: tonic/mode không hợp lệ`);
            if (isNum(s.start_time) && s.start_time < prevEnd) E.push(`${p}: chồng lấn đoạn trước`);
            prevEnd = s.end_time === null ? Infinity : (isNum(s.end_time) ? s.end_time : prevEnd);
        });
    }
    if (!Array.isArray(t.modulations)) E.push(at('modulations phải là mảng (rỗng = nhóm đối chứng không chuyển tông)'));
    else t.modulations.forEach((m, i) => {
        const p = at(`modulations[${i}]`);
        if (!isNum(m.time) || m.time < 0) E.push(`${p}: time không hợp lệ`);
        const f = parseKey(m.from_key), to = parseKey(m.to_key);
        if (!f || f.mode === 'undetermined') E.push(`${p}: from_key không hợp lệ`);
        if (!to || to.mode === 'undetermined') E.push(`${p}: to_key không hợp lệ`);
        if (f && to && f.pc === to.pc && f.mode === to.mode) E.push(`${p}: from_key trùng to_key`);
    });
    if (t.audio_hash && t.reference_status === 'VERIFIED_INDEPENDENT' && !t.annotator) E.push(at('nhãn VERIFIED cần nguồn xác minh'));
    if (t.reference_status === 'VERIFIED_INDEPENDENT' && Array.isArray(t.segments) && t.segments.length === 0 && Array.isArray(t.modulations) && t.modulations.length === 0)
        W.push(at('VERIFIED nhưng không có segments lẫn modulations: không chấm được gì'));

    // ---- AI-ALG-09: trường tùy chọn (title, label_state, user_reference, observations) ----
    if (t.title !== undefined && (typeof t.title !== 'string' || !t.title.trim())) E.push(at('title phải là chuỗi không rỗng'));
    if (t.label_state !== undefined) {
        if (!LABEL_STATES.includes(t.label_state)) E.push(at(`label_state phải thuộc ${LABEL_STATES.join('|')}`));
        else if (t.reference_status === 'VERIFIED_INDEPENDENT' && t.label_state !== 'VERIFIED') E.push(at('VERIFIED_INDEPENDENT chỉ đi với label_state=VERIFIED'));
        else if (t.reference_status === 'UNVERIFIED_REFERENCE' && t.label_state === 'VERIFIED') E.push(at('label_state=VERIFIED mâu thuẫn với UNVERIFIED_REFERENCE'));
    }
    if (t.user_reference !== undefined && t.user_reference !== null) {
        const u = t.user_reference;
        if (u.key !== null && u.key !== undefined && !parseKey(u.key)) E.push(at('user_reference.key không hợp lệ'));
        if (u.modulation) { if (!parseKey(u.modulation.from_key) || !parseKey(u.modulation.to_key)) E.push(at('user_reference.modulation from/to_key không hợp lệ')); if (u.modulation.time !== null && !isNum(u.modulation.time)) E.push(at('user_reference.modulation.time phải là số hoặc null')); }
    }
    if (t.data_conflicts !== undefined) {   // AI-ALG-10R: mâu thuẫn dữ liệu được GIỮ nguyên từng giá trị + nguồn, không tự chọn
        if (!Array.isArray(t.data_conflicts)) E.push(at('data_conflicts phải là mảng'));
        else t.data_conflicts.forEach((c, i) => { if (!c || typeof c.field !== 'string' || !Array.isArray(c.values) || c.values.length < 2 || c.values.some((v) => !v || typeof v.source !== 'string')) E.push(at(`data_conflicts[${i}] cần field + ≥2 values có source`)); if (c && c.status !== 'UNRESOLVED' && c.status !== 'RESOLVED') E.push(at(`data_conflicts[${i}].status phải là UNRESOLVED|RESOLVED`)); });
    }
    if (t.observations !== undefined && t.observations !== null) for (const who of ['auto_key', 'menu']) {
        const o = t.observations[who]; if (o === undefined || o === null) continue;
        if (typeof o.raw !== 'string') E.push(at(`observations.${who}.raw phải là chuỗi (nguyên văn người kiểm thử)`));
        if (o.key !== null && o.key !== undefined && !parseKey(o.key)) E.push(at(`observations.${who}.key không hợp lệ`));
        if (o.chain !== undefined && (!Array.isArray(o.chain) || o.chain.length < 2 || o.chain.some((k) => !parseKey(k)))) E.push(at(`observations.${who}.chain phải là mảng ≥2 key hợp lệ`));
    }
    return { errors: E, warnings: W };
}

// Trạng thái dữ liệu của 1 track theo đĩa: audio có/không, hash khớp không.
function audioStatus(t, audioRoot) {
    const ref = t.audio_reference || {};
    if (!ref.path) return { status: 'BLOCKED_NO_AUDIO', reason: 'chưa có file audio (chỉ có tham chiếu URL hoặc không có)' };
    const p = path.resolve(audioRoot || '.', ref.path);
    if (!fs.existsSync(p)) return { status: 'BLOCKED_NO_AUDIO', reason: `không thấy file: ${ref.path}` };
    if (!t.audio_hash) return { status: 'BLOCKED_NO_HASH', reason: 'có file nhưng manifest chưa ghi audio_hash', file: p };
    const h = sha256File(p);
    if (h !== t.audio_hash) return { status: 'BLOCKED_HASH_MISMATCH', reason: `sha256 file ${h.slice(0, 12)}… ≠ manifest ${String(t.audio_hash).slice(0, 12)}…`, file: p };
    return { status: 'AUDIO_OK', file: p };
}

// Kiểm tra cả manifest (schema + ràng buộc chéo: id duy nhất, một audio_hash không nằm ở cả dev lẫn test).
function validateManifest(m) {
    const errors = [], warnings = [];
    if (!m || typeof m !== 'object' || !Array.isArray(m.tracks)) return { errors: ['manifest cần trường tracks[]'], warnings, tracks: [] };
    const ids = new Set(), hashSplit = new Map();
    m.tracks.forEach((t, i) => {
        const r = validateTrack(t, i); errors.push(...r.errors); warnings.push(...r.warnings);
        if (t && t.track_id) { if (ids.has(t.track_id)) errors.push(`${t.track_id}: track_id trùng`); ids.add(t.track_id); }
        if (t && t.audio_hash) { const o = hashSplit.get(t.audio_hash); if (o && o !== t.split) errors.push(`${t.track_id}: cùng audio_hash xuất hiện ở cả dev và test (rò rỉ)`); hashSplit.set(t.audio_hash, t.split); }
    });
    return { errors, warnings, tracks: m.tracks };
}
module.exports = { NOTE, pc, parseKey, validateTrack, validateManifest, audioStatus, sha256File, REF_STATUS, SPLITS, MODES, LABEL_STATES, parseKeyString, keyLabel };
