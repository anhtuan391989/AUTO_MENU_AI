// ==================================================
// AUTO_MENU_AI — KEY-SERVER-CORRECT-01 (Bước B)
// Đường dẫn: app/keyCorrect.js
// Sửa Key của BÀI ĐANG PHÁT trên Key Server (POST /set-key, cần mật khẩu admin của Server)
// và trong songs.json trên máy (nếu bài có ở đó). Chạy ở main process; renderer chỉ gửi {key, token}.
//
// Nguyên tắc an toàn:
//  - Tên bài / ca sĩ lấy từ main (getSong), KHÔNG tin renderer.
//  - Mật khẩu admin chỉ nằm trong RAM của main (nhớ tới khi tắt app), KHÔNG ghi file, KHÔNG log,
//    KHÔNG trả ngược về renderer.
//  - Server từ chối (401/403/409/404/400) -> không sửa gì ở máy. Chỉ khi Server báo OK mới sửa songs.json.
//  - Không bao giờ throw: luôn trả { ok, reason }.
// ==================================================
"use strict";

const SHARP = { "C": "C", "C#": "C#", "DB": "C#", "D": "D", "D#": "D#", "EB": "D#", "E": "E", "F": "F", "F#": "F#", "GB": "F#", "G": "G", "G#": "G#", "AB": "G#", "A": "A", "A#": "A#", "BB": "A#", "B": "B" };

// "A# Major" / "Bb Minor" / "F#m" -> { name: "A#", mode: "major"|"minor" } hoặc null
function parseKey(input) {
    if (typeof input !== "string") return null;
    const s = input.trim().replace(/♯/g, "#").replace(/♭/g, "b");
    const m = s.match(/^([A-Ga-g])\s*([#b]?)\s*(major|minor|maj|min|m)?$/i);
    if (!m) return null;
    const name = SHARP[(m[1] + m[2]).toUpperCase()];
    if (!name) return null;
    const raw = m[3] || "major";
    const isMinor = /^min(or)?$/i.test(raw) || raw === "m"; // "m" thường = minor (Am); "M" hoa = major
    return { name, mode: isMinor ? "minor" : "major" };
}
function displayKey(p) { return p.name + " " + (p.mode === "minor" ? "Minor" : "Major"); }

function createKeyCorrector(deps) {
    const d = deps || {};
    const log = d.logger || { log() {}, error() {} };
    let rememberedToken = null; // chỉ trong RAM

    async function correct(req) {
        try {
            const r = req && typeof req === "object" ? req : {};
            const parsed = parseKey(r.key);
            if (!parsed) return { ok: false, reason: "bad-key" };

            const cur = typeof d.getSong === "function" ? d.getSong() : null;
            if (!cur || !cur.title) return { ok: false, reason: "no-song" };

            const typed = typeof r.token === "string" ? r.token.trim() : "";
            const token = typed || rememberedToken;
            if (!token) return { ok: false, reason: "need-token" };

            let found;
            try { found = await d.lookup(cur.title, cur.artist || ""); } catch (e) { found = null; }
            if (!found || !found.found || !found.songId) return { ok: false, reason: "not-on-server" };

            const url = String(d.getServerUrl ? d.getServerUrl() : "").replace(/\/+$/, "");
            if (!url) return { ok: false, reason: "no-server" };

            let res, body;
            try {
                res = await d.fetchFn(url + "/set-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                    body: JSON.stringify({ songId: found.songId, key: parsed.name, mode: parsed.mode })
                });
                try { body = await res.json(); } catch (e) { body = {}; }
            } catch (e) {
                return { ok: false, reason: "network" };
            }

            const st = res.status;
            if (st === 401) { rememberedToken = null; return { ok: false, reason: "wrong-password" }; }
            if (st === 403) return { ok: false, reason: "server-no-admin-token" };
            if (st === 409) return { ok: false, reason: "multi-segment", tongDoan: body && body.tongDoan };
            if (st === 404) return { ok: false, reason: (body && body.error === "khong_co_bai") ? "not-on-server" : "no-segment" };
            if (st === 400) return { ok: false, reason: "bad-key" };
            if (!(st >= 200 && st < 300) || !body || body.ok !== true) return { ok: false, reason: "server-error" };

            rememberedToken = token; // đúng mật khẩu -> nhớ tới khi tắt app
            const key = displayKey(parsed);

            // Server đã nhận. Sửa tiếp songs.json trên máy (nếu có bài này) để Menu dùng Key mới NGAY.
            let localUpdated = 0, localError = null;
            try {
                if (d.db && typeof d.db.load === "function" && typeof d.db.save === "function") {
                    const nt = d.normalizeTitle(cur.title), na = d.normalizeTitle(cur.artist || "");
                    const list = d.db.load();
                    list.forEach((s) => {
                        if (!s) return;
                        const sameId = s.songId && s.songId === found.songId;
                        const sameName = d.normalizeTitle(s.title) === nt && (!na || !s.artist || d.normalizeTitle(s.artist) === na);
                        if (sameId || sameName) { s.key = key; localUpdated++; }
                    });
                    if (localUpdated > 0) d.db.save(list);
                }
            } catch (e) { localError = String((e && e.message) || e); localUpdated = 0; }

            log.log(`[KeyCorrect] Đã sửa Key bài "${cur.title}" -> ${key} (Server OK, songs.json: ${localUpdated} mục)`);
            return { ok: true, reason: "corrected", key, localUpdated, localError, songId: found.songId, title: cur.title, artist: cur.artist || "" };
        } catch (err) {
            log.error("[KeyCorrect] lỗi bất ngờ:", err && err.message);
            return { ok: false, reason: "error" };
        }
    }

    return { correct, forgetToken() { rememberedToken = null; }, hasToken() { return !!rememberedToken; } };
}

module.exports = { createKeyCorrector, parseKey, displayKey };
