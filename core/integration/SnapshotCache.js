/**
 * ==========================================================
 * Auto Menu AI — Windows Media Session Integration
 * SnapshotCache
 * ----------------------------------------------------------
 * Giữ snapshot "Now Playing" gần nhất và QUYẾT ĐỊNH xem dữ liệu mới
 * có thực sự đáng thông báo hay không — đúng yêu cầu đề bài:
 *   - Không parse/emit lại nếu dữ liệu giống nhau.
 *   - Chỉ coi là "đổi bài" khi Title/Artist/Application đổi (Album,
 *     Thumbnail, timestamp đổi KHÔNG tính, vì timestamp luôn đổi mỗi
 *     lần poll — nếu tính cả timestamp thì coi như lúc nào cũng "đổi").
 *
 * Module THUẦN — không spawn process, không đọc SMTC, không log. Chỉ
 * giữ state trong bộ nhớ (1 snapshot duy nhất, không phải danh sách
 * phình to dần) — không có gì tích luỹ theo thời gian, không rủi ro
 * memory leak.
 * ==========================================================
 */

function isEmpty(snapshot) {

    return !snapshot || typeof snapshot !== "object";

}

function normalize(value) {

    return value === undefined || value === null ? null : String(value).trim();

}

// So sánh 2 snapshot CHỈ theo 3 field quyết định "có phải bài khác không":
// application, title, artist. Đây là quyết định có chủ đích — Album/
// Thumbnail của cùng 1 bài có thể được app cập nhật trễ hơn Title/Artist
// (vd Chrome trả Title trước, Thumbnail load sau) — không nên coi đó là
// "đổi bài" và phát sinh log/event thừa.
function isSameTrack(a, b) {

    if (isEmpty(a) && isEmpty(b)) return true;
    if (isEmpty(a) !== isEmpty(b)) return false;

    return (
        normalize(a.application) === normalize(b.application) &&
        normalize(a.title) === normalize(b.title) &&
        normalize(a.artist) === normalize(b.artist)
    );

}

class SnapshotCache {

    constructor() {

        this._current = null;

    }

    get() {

        return this._current;

    }

    /**
     * Nạp 1 snapshot mới nhận được từ tầng thu thập dữ liệu (WindowsMediaSession).
     * @param {object|null} nextSnapshot Snapshot mới (hoặc null nếu không có gì đang phát).
     * @returns {{changed: boolean, reason: string, snapshot: object|null}}
     *   reason: "no_change" | "became_empty" | "became_available" |
     *           "application_changed" | "title_changed" | "artist_changed" | "track_changed"
     */
    update(nextSnapshot) {

        const previous = this._current;
        const next = isEmpty(nextSnapshot) ? null : nextSnapshot;

        if (isSameTrack(previous, next)) {

            // Vẫn cập nhật lại object (Album/Thumbnail/timestamp có thể mới hơn)
            // NHƯNG không coi là "thay đổi" — không log, không emit event.
            this._current = next;

            return { changed: false, reason: "no_change", snapshot: this._current };

        }

        let reason;

        if (isEmpty(previous) && !isEmpty(next)) {

            reason = "became_available";

        } else if (!isEmpty(previous) && isEmpty(next)) {

            reason = "became_empty";

        } else if (normalize(previous.application) !== normalize(next.application)) {

            reason = "application_changed";

        } else if (normalize(previous.title) !== normalize(next.title)) {

            reason = "title_changed";

        } else if (normalize(previous.artist) !== normalize(next.artist)) {

            reason = "artist_changed";

        } else {

            reason = "track_changed";

        }

        this._current = next;

        return { changed: true, reason, snapshot: this._current };

    }

    clear() {

        this._current = null;

    }

}

module.exports = SnapshotCache;
