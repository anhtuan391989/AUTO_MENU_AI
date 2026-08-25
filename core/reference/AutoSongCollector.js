const SongDatabase = require("./SongDatabase");
const SongMatcher = require("./SongMatcher");
const SongCollectorState = require("./SongCollectorState");
const { isSnapshotStable, keyChanged, bpmChanged } = require("./SongCollectorUtils");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * AutoSongCollector
 * ----------------------------------------------------------
 * Mục tiêu: AUTO_MENU_AI tự xây Song Database theo thời gian, người
 * dùng KHÔNG phải nhập tay. Người dùng chỉ cần mở bài hát (YouTube
 * hoặc file nhạc) — nếu Key/BPM Engine đã cho kết quả ỔN ĐỊNH, module
 * này tự động lưu vào songs.json. Không popup, không hỏi xác nhận,
 * không tự bịa dữ liệu.
 *
 * ĐỘC LẬP với AI Core / Event Flow / IPC hiện tại: module này KHÔNG
 * require EventBus, KHÔNG require keyEngine.js/bpmEngine.js, KHÔNG
 * tự lắng nghe sự kiện nào cả. Chỉ export 1 API duy nhất — collect().
 * Nơi gọi (ở 1 task nối dây sau này, NGOÀI phạm vi task này) tự đọc
 * kết quả từ Key/BPM Engine rồi truyền vào dưới dạng object thuần
 * (snapshot), viết ở bước sau. Task này CHƯA nối vào project.
 *
 * Snapshot đầu vào kỳ vọng (object thuần, không phải class):
 *   {
 *     title:          string   — tên bài hát (lấy từ tiêu đề YouTube/tên file)
 *     artist:         string   — ca sĩ/tác giả (có thể để trống nếu không rõ)
 *     key:            string   — Key hiện tại, đúng định dạng keyEngine.js trả
 *                                về (vd "G Major"), KHÔNG tính toán lại ở đây
 *     bpm:            number   — BPM hiện tại từ bpmEngine.js
 *     keyLocked:      boolean  — đúng bằng field `locked` mà keyEngine.js trả
 *                                về (Phase 1.5/2, biến willLock) — Lock CHƯA
 *                                xong thì tuyệt đối không lưu
 *     keyConfidence:  number   — độ tin cậy đã chuẩn hoá [0,1] của Key hiện
 *                                tại (vd confidenceV2.combined, Phase 3)
 *     bpmStable:      boolean  — do bpmEngine.js tự xác định "đã ổn định",
 *                                KHÔNG tính lại/đoán ở module này
 *   }
 *
 * Module này không tự quyết định thế nào là "ổn định" cho Key Lock hay
 * BPM — nó chỉ ĐỌC LẠI đúng các cờ (keyLocked/bpmStable) mà 2 Engine đó
 * đã tự tính, để tránh trùng lặp logic và tránh đụng vào 2 file bị cấm
 * sửa (keyEngine.js, bpmEngine.js).
 * ==========================================================
 */

class AutoSongCollector {

    /**
     * @param {object} snapshot Xem mô tả field ở đầu file.
     * @returns {{saved: boolean, action: string, reason?: string[], song?: object}}
     *   action: "added" | "updated" | "skipped_unstable" | "skipped_no_change" | "skipped_invalid"
     */
    collect(snapshot) {

        // BƯỚC 1 — Chống dữ liệu sai: Confidence chưa đủ / Key chưa Lock /
        // BPM chưa ổn định / thiếu field bắt buộc -> KHÔNG làm gì cả, không
        // popup, không throw. Im lặng bỏ qua đúng như yêu cầu.
        const stability = isSnapshotStable(snapshot);

        if (!stability.stable) {

            return { saved: false, action: "skipped_unstable", reason: stability.reasons };

        }

        const title = String(snapshot.title).trim();
        const artist = String(snapshot.artist || "").trim();

        // BƯỚC 2 — Tối ưu: nếu y hệt kết quả đã xử lý gần nhất trong phiên
        // này rồi thì bỏ qua luôn, không cần đọc/ghi đĩa lại (Key/BPM Engine
        // có thể bắn snapshot ổn định liên tục nhiều lần cho cùng 1 bài).
        const cached = SongCollectorState.get(title, artist);

        if (cached && !keyChanged(cached.key, snapshot.key) && !bpmChanged(cached.bpm, snapshot.bpm)) {

            return { saved: false, action: "skipped_no_change" };

        }

        // BƯỚC 3 — Kiểm tra SongDatabase (qua SongMatcher để bắt được cả
        // trường hợp title có hậu tố nhiễu như "(Karaoke)"/"Official MV").
        const existing = SongMatcher.findReference(title, artist);

        // BƯỚC 3a — Chưa có trong DB -> tự động addSong(), không hỏi gì cả.
        if (!existing) {

            const song = SongDatabase.addSong({
                title,
                artist,
                key: snapshot.key,
                bpm: snapshot.bpm
            });

            SongCollectorState.set(title, artist, { key: snapshot.key, bpm: snapshot.bpm });

            return { saved: true, action: "added", song };

        }

        // BƯỚC 3b — Đã có trong DB -> CHỐNG GHI TRÙNG: chỉ update khi Key
        // hoặc BPM thực sự thay đổi so với dữ liệu đã lưu, không ghi thêm
        // bản ghi mới, không ghi lại y hệt dữ liệu cũ.
        const changedKey = keyChanged(existing.key, snapshot.key);
        const changedBpm = bpmChanged(existing.bpm, snapshot.bpm);

        if (!changedKey && !changedBpm) {

            SongCollectorState.set(title, artist, { key: snapshot.key, bpm: snapshot.bpm });

            return { saved: false, action: "skipped_no_change" };

        }

        const updates = {};
        if (changedKey) updates.key = snapshot.key;
        if (changedBpm) updates.bpm = snapshot.bpm;

        const updatedSong = SongDatabase.updateSong(existing.title, existing.artist, updates);

        SongCollectorState.set(title, artist, { key: snapshot.key, bpm: snapshot.bpm });

        return { saved: true, action: "updated", changed: { key: changedKey, bpm: changedBpm }, song: updatedSong };

    }

}

module.exports = new AutoSongCollector();
