/**
 * ==========================================================
 * Auto Menu AI — Now Playing Source Arbitration
 * NowPlayingArbitrator
 * ----------------------------------------------------------
 * Module THUẦN (pure function) — không giữ state, không I/O, không
 * side-effect. Nhận snapshot gần nhất từ 2 nguồn (SMTC qua
 * WindowsMediaSession, MPC-HC qua MpcHcSession), quyết định NGUỒN NÀO
 * đang thực sự là "đang nghe" theo quy tắc CỐ ĐỊNH (deterministic) —
 * không random, không "ai trả lời sau thì thắng" (last-response-wins),
 * không race condition, vì hàm chỉ đọc 2 tham số đưa vào, không đọc
 * biến toàn cục/timer nào.
 *
 * QUY TẮC ƯU TIÊN (ghi rõ để dễ audit/thay đổi sau nếu cần):
 *
 *   1. Nếu MPC-HC đang ở trạng thái State=2 (Playing) -> MPC-HC THẮNG,
 *      bất kể SMTC có snapshot gì. Lý do: SMTC hoàn toàn không biết gì
 *      về MPC-HC (MPC-HC không đăng ký SMTC — đã kiểm chứng thật, xem
 *      báo cáo), nên session SMTC hiện có (nếu còn) rất có thể là dữ
 *      liệu CŨ từ trước khi người dùng chuyển sang MPC-HC — hiện tượng
 *      này đã QUAN SÁT THẬT lúc kiểm thử thủ công: khi người dùng đang
 *      thực sự phát video trong MPC-HC, SMTC vẫn hiển thị "brave.exe"
 *      từ phiên trình duyệt trước đó, IsCurrent=True nhưng không phải
 *      thứ người dùng đang nghe. Quy tắc này CHƯA được kiểm chứng bằng
 *      1 lần chạy thật với CẢ HAI nguồn cùng hoạt động song song ở
 *      cùng 1 thời điểm — xem KNOWN_LIMITATIONS trong báo cáo.
 *
 *   2. Nếu MPC-HC KHÔNG ở trạng thái Playing (null, Stopped, hoặc chỉ
 *      Paused) nhưng SMTC có snapshot -> dùng SMTC.
 *
 *   3. Nếu SMTC không có gì nhưng MPC-HC có snapshot (kể cả đang
 *      Paused, chỉ không phải Stopped/null) -> dùng tạm MPC-HC (còn
 *      hơn không có gì — người dùng vừa pause, thông tin bài vẫn còn
 *      giá trị tham khảo).
 *
 *   4. Không nguồn nào có gì -> null.
 *
 *   NGUỒN THỨ 3 — YouTube qua tiện ích trình duyệt (YoutubeExtensionSession), tham số TUỲ CHỌN thứ 3:
 *   YouTube đang PHÁT (isPlaying) thắng SMTC (tiện ích biết chính xác video + vị trí thật, SMTC thì chỉ đoán),
 *   nhưng vẫn thua MPC-HC đang Playing (quy tắc 1 giữ nguyên). YouTube chỉ TẠM DỪNG thì xếp sau SMTC / MPC-HC có dữ liệu.
 *   Không truyền tham số thứ 3 (như các lời gọi cũ) => hành vi y hệt trước đây.
 * ==========================================================
 */

const MPC_STATE_PLAYING = 2;

/**
 * @param {object|null} smtcSnapshot Snapshot gần nhất từ WindowsMediaSession ("change" event), hoặc null.
 * @param {object|null} mpcHcSnapshot Snapshot gần nhất từ MpcHcSession ("change" event), hoặc null.
 * @param {object|null} [youtubeSnapshot] Snapshot gần nhất từ YoutubeExtensionSession ("change" event), hoặc null/bỏ trống.
 * @returns {{ snapshot: object, source: "smtc"|"mpc-hc"|"youtube" } | null}
 */
function resolveActiveSource(smtcSnapshot, mpcHcSnapshot, youtubeSnapshot) {

    const mpcHcIsPlaying = !!mpcHcSnapshot && mpcHcSnapshot.state === MPC_STATE_PLAYING;

    if (mpcHcIsPlaying) {
        return { snapshot: mpcHcSnapshot, source: "mpc-hc" };
    }

    if (youtubeSnapshot && youtubeSnapshot.isPlaying === true) {
        return { snapshot: youtubeSnapshot, source: "youtube" };
    }

    if (smtcSnapshot) {
        return { snapshot: smtcSnapshot, source: "smtc" };
    }

    if (mpcHcSnapshot) {
        return { snapshot: mpcHcSnapshot, source: "mpc-hc" };
    }

    if (youtubeSnapshot) {
        return { snapshot: youtubeSnapshot, source: "youtube" };
    }

    return null;

}

module.exports = { resolveActiveSource, MPC_STATE_PLAYING };
