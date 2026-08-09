/* ==========================================================
   MOD ENGINE V2 — theo dõi chuyển giọng (modulation) liên tục suốt
   bài hát, dựa trên TIMELINE + CONFIDENCE + SUSTAINED TRANSITION
   -----------------------------------------------------------
   Độc lập với BPMEngine hoàn toàn. Chỉ PHỤ THUỘC 1 CHIỀU vào KeyEngine
   (đọc estimateKeyFromChroma()/MIN_CONFIDENCE/shortestSemitoneDelta() —
   toàn bộ API CÔNG KHAI có sẵn, không sửa/không biết gì về nội bộ
   KeyEngine), giống như 1 đồng hồ đo đọc nhiệt kế chứ không sở hữu
   nhiệt kế đó.

   ĐIỂM KHÁC BẢN CŨ (V2, nghiên cứu lại theo yêu cầu Key Engine V3 + Mod
   Engine V2): bản cũ dùng KeyEngine.watchContinuous() — hàm này CHỈ báo
   khi kết quả bỏ phiếu của KeyEngine THAY ĐỔI, nên không thể tự đếm
   "cùng 1 root mới xuất hiện liên tục mấy lần" (mỗi lần watchContinuous
   gọi callback ĐÃ LÀ 1 giá trị khác trước đó, theo đúng định nghĩa "on
   change"). Mod Engine V2 tự polling estimateKeyFromChroma() (rẻ — chỉ
   đọc lại chromaVector đã có sẵn, KHÔNG tính FFT mới, không tăng CPU
   đáng kể) theo chu kỳ riêng, tự giữ 1 "streak" ngắn, và CHỈ báo
   modulation khi root mới được xác nhận LIÊN TỤC đủ số lần — đúng yêu
   cầu "không phát hiện modulation chỉ vì 1 frame", ví dụ minh hoạ:
       G Minor, G Minor, G Minor -> A Minor, A Minor, A Minor -> Mod +2
   KHÔNG sửa gì trong keyEngine.js để làm việc này (watchContinuous()
   vẫn còn nguyên, không đổi — chỉ đơn giản là ModEngine V2 không dùng
   tới nó nữa, tự polling độc lập qua API công khai khác).

   API CÔNG KHAI GIỮ NGUYÊN 100% so với bản cũ:
     ModEngine.start(originalRootIndex, (data) => { ...applyModEvent... }, isManualOverrideActiveFn);
     ModEngine.stop();
   ========================================================== */
const ModEngine = (() => {
    let pollTimerId = null;
    let lastFiredRoot = null;

    // Chu kỳ polling — cùng bậc với CHECK_INTERVAL_MS của KeyEngine (1500ms), không cần nhanh
    // hơn vì bản chất modulation là hiện tượng diễn ra trong vài giây, không phải vài trăm ms.
    const POLL_INTERVAL_MS = 1000;

    // Số lần đo LIÊN TỤC phải cùng 1 root MỚI (khác root hiện tại) mới coi là modulation thật —
    // đây chính là "Sustained Transition" theo đúng yêu cầu, thay vì tin ngay 1 lần đo lẻ.
    const SUSTAIN_REQUIRED = 3;

    /**
     * @param {number} originalRootIndex  Chỉ số nốt gốc (0-11) của Key đã chốt lúc đầu bài
     * @param {(data: {semitone: number}) => void} onModulation  gọi khi phát hiện lệch khỏi Key gốc (đã xác nhận sustained)
     * @param {() => boolean} isManualOverrideActiveFn  hàm renderer.js cung cấp để biết có đang bị ghi đè tay không
     */
    function start(originalRootIndex, onModulation, isManualOverrideActiveFn) {
        stop(); // tránh chạy trùng nhiều watcher

        lastFiredRoot = null;
        let pendingRoot = null;   // root MỚI đang "chờ xác nhận" (chưa đủ streak để báo thật)
        let pendingStreak = 0;

        pollTimerId = setInterval(() => {

            if (isManualOverrideActiveFn?.()) { pendingRoot = null; pendingStreak = 0; return; } // đang bị ghi đè tay -> không tranh lệnh, reset streak đang chờ

            const result = KeyEngine.estimateKeyFromChroma(); // mặc định dùng chromaVector (ổn định), KHÔNG dùng bản "nhanh"/tạm

            if (result.confidence < KeyEngine.MIN_CONFIDENCE) { pendingRoot = null; pendingStreak = 0; return; } // không đủ tin cậy -> không tính vào streak, tránh nhiễu

            const baseline = lastFiredRoot === null ? originalRootIndex : lastFiredRoot; // đã mod trước đó thì so với key ĐANG áp dụng, không so lại key gốc ban đầu

            if (result.rootIndex === baseline) {
                // Về lại đúng key hiện hành (gốc hoặc đã mod trước đó) -> không phải chuyển giọng,
                // reset hẳn streak đang chờ (tránh cộng dồn qua các lần dao động qua lại).
                pendingRoot = null;
                pendingStreak = 0;
                return;
            }

            if (result.rootIndex === pendingRoot) {
                pendingStreak++;
            } else {
                // Root mới KHÁC với root đang chờ xác nhận trước đó -> bắt đầu đếm lại streak mới.
                pendingRoot = result.rootIndex;
                pendingStreak = 1;
            }

            if (pendingStreak < SUSTAIN_REQUIRED) return; // CHƯA đủ liên tục -> chưa báo, tiếp tục chờ

            const delta = KeyEngine.shortestSemitoneDelta(originalRootIndex, result.rootIndex);
            lastFiredRoot = result.rootIndex;
            pendingRoot = null;
            pendingStreak = 0;

            if (delta === 0) return; // trùng key gốc theo bán cung ngắn nhất (hiếm khi xảy ra ở đây, phòng hờ)

            // MOD Output Contract (Section XI) — field CŨ `semitone` giữ nguyên 100% (renderer.js/
            // vocalCommandRouter.js đang đọc field này, không đổi gì ở đó). Các field MỚI chỉ CỘNG
            // THÊM, không thay thế gì — nơi gọi cũ (data.semitone) vẫn chạy y hệt trước.
            onModulation({
                semitone: delta,
                originalKey: `${KeyEngine.NOTE_NAMES[originalRootIndex]}`,
                targetKey: `${KeyEngine.NOTE_NAMES[result.rootIndex]} ${result.mode}`,
                confidence: result.confidence,
                // BUG ĐÃ SỬA: trước đây đọc `pendingStreak >= SUSTAIN_REQUIRED` NHƯNG pendingStreak
                // đã bị reset về 0 ở dòng 85 ngay TRƯỚC đó -> stable LUÔN LÀ false dù comment cũ ghi
                // "luôn true tại điểm này". Code chỉ chạy tới đây sau khi guard ở dòng 80 đã xác nhận
                // đủ streak liên tục -> tại điểm này stable chắc chắn là true, không cần đọc biến đã reset.
                stable: true,
                timestamp: Date.now(),
            });

        }, POLL_INTERVAL_MS);
    }

    function stop() {
        if (pollTimerId) clearInterval(pollTimerId);
        pollTimerId = null;
    }

    return { start, stop };
})();

window.ModEngine = ModEngine;
