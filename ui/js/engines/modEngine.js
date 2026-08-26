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

   TASK B16 (MOD API Contract Implementation, theo docs/MOD_API_SPEC.md) — CHỈ thêm 1 tham số
   TUỲ CHỌN thứ 4, onStateChange(state, payload), để phát ra đúng 3/4 state đã có bằng chứng
   trong contract: LISTENING, MOD_CANDIDATE, MODULATION_DETECTED (KHÔNG có APPLIED — xem GAP
   trong B16_RESULT, ModEngine không có cách nào tự biết lệnh có thật sự được gửi/áp dụng hay
   không, vì nó chỉ phát event chứ không tự gửi lệnh — đúng ranh giới kiến trúc hiện tại).
   Tham số này HOÀN TOÀN tuỳ chọn — mọi lời gọi start() không truyền tham số thứ 4 (kể cả toàn
   bộ renderer.js và test hiện có) chạy Y HỆT 100% như trước, KHÔNG có gì đổi về logic/timing/
   payload của onModulation. onStateChange chỉ là 1 "tap" quan sát thêm vào đúng những điểm
   chuyển trạng thái đã tồn tại sẵn trong code (chỗ đang gọi sendModTelemetry và chỗ sắp gọi
   onModulation), không tạo thêm điều kiện/threshold/logic quyết định nào mới. Không tự thêm
   trường leadTime (OPEN theo MOD_API_SPEC.md — giữ nguyên hệ thống reactive, KHÔNG dự đoán).
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
     * @param {(state: "LISTENING"|"MOD_CANDIDATE"|"MODULATION_DETECTED", payload: object) => void} [onStateChange]
     *        TUỲ CHỌN (Task B16) — quan sát state contract theo docs/MOD_API_SPEC.md. KHÔNG bắt
     *        buộc, KHÔNG ảnh hưởng gì tới onModulation/isManualOverrideActiveFn nếu không truyền.
     */
    /**
     * Key Engine V9/Mod Engine V4 (Mục 10/16) — gửi telemetry NHẸ, an toàn no-op nếu không có
     * window.electronAPI.sendTelemetry (giống hệt cơ chế đã có trong keyEngine.js, tự chứa ở
     * đây thay vì gọi qua KeyEngine để không đổi public API của keyEngine.js). KHÔNG gửi mỗi
     * tick — chỉ gửi lúc 1 candidate MỚI bắt đầu được theo dõi và lúc modulation được XÁC NHẬN,
     * tránh spam console/IPC (đúng Mục 16: "nhẹ, không spam, không đổi logic").
     */
    function sendModTelemetry(record) {
        if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.sendTelemetry === "function") {
            window.electronAPI.sendTelemetry(record);
        }
    }

    function start(originalRootIndex, onModulation, isManualOverrideActiveFn, onStateChange) {
        stop(); // tránh chạy trùng nhiều watcher

        // Task B16 — "tap" tuỳ chọn, không throw ra ngoài poll loop nếu caller lỡ truyền callback lỗi.
        const emitState = (state, payload) => {
            if (typeof onStateChange !== "function") return;
            try { onStateChange(state, payload); } catch (_) { /* không để lỗi ở phía observer làm hỏng vòng lặp poll thật */ }
        };

        lastFiredRoot = null;
        let pendingRoot = null;   // root MỚI đang "chờ xác nhận" (chưa đủ streak để báo thật)
        let pendingStreak = 0;

        emitState("LISTENING", { timestamp: Date.now() }); // trạng thái mặc định lúc bắt đầu theo dõi

        pollTimerId = setInterval(() => {

            if (isManualOverrideActiveFn?.()) {
                if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "manual_override" });
                pendingRoot = null; pendingStreak = 0; return; // đang bị ghi đè tay -> không tranh lệnh, reset streak đang chờ
            }

            const result = KeyEngine.estimateKeyFromChroma(); // mặc định dùng chromaVector (ổn định), KHÔNG dùng bản "nhanh"/tạm

            if (result.confidence < KeyEngine.MIN_CONFIDENCE) {
                if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "low_confidence" });
                pendingRoot = null; pendingStreak = 0; return; // không đủ tin cậy -> không tính vào streak, tránh nhiễu
            }

            const baseline = lastFiredRoot === null ? originalRootIndex : lastFiredRoot; // đã mod trước đó thì so với key ĐANG áp dụng, không so lại key gốc ban đầu

            if (result.rootIndex === baseline) {
                // Về lại đúng key hiện hành (gốc hoặc đã mod trước đó) -> không phải chuyển giọng,
                // reset hẳn streak đang chờ (tránh cộng dồn qua các lần dao động qua lại).
                if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "returned_to_baseline" });
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
                // Mục 10/16 — chỉ 1 sự kiện lúc bắt đầu theo dõi 1 candidate mới, không spam mỗi tick.
                sendModTelemetry({
                    event: "MOD_CANDIDATE", candidate: `${KeyEngine.NOTE_NAMES[result.rootIndex]} ${result.mode}`,
                    confidence: result.confidence, persistence: pendingStreak, sustainRequired: SUSTAIN_REQUIRED, timestamp: Date.now()
                });
                emitState("MOD_CANDIDATE", {
                    candidateRoot: result.rootIndex, candidateLabel: `${KeyEngine.NOTE_NAMES[result.rootIndex]} ${result.mode}`,
                    confidence: result.confidence, streakCount: pendingStreak, sustainRequired: SUSTAIN_REQUIRED, timestamp: Date.now()
                });
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
            const modData = {
                semitone: delta,
                originalKey: `${KeyEngine.NOTE_NAMES[originalRootIndex]}`,
                targetKey: `${KeyEngine.NOTE_NAMES[result.rootIndex]} ${result.mode}`,
                confidence: result.confidence,
                stable: true, // đã qua sustain-confirm mới gọi tới đây -> luôn true tại điểm này
                timestamp: Date.now(),
            };

            sendModTelemetry({ event: "MOD_CONFIRMED", ...modData, persistence: SUSTAIN_REQUIRED });
            // Task B16 — MODULATION_DETECTED phát NGAY TRƯỚC onModulation, cùng payload modData
            // (không thêm/bớt field so với những gì onModulation nhận). APPLIED KHÔNG được phát ở
            // đây — ModEngine chỉ phát event, không biết renderer/downstream có thật sự gửi lệnh
            // thành công hay không (xem GAP trong B16_RESULT).
            emitState("MODULATION_DETECTED", modData);
            onModulation(modData);

        }, POLL_INTERVAL_MS);
    }

    function stop() {
        if (pollTimerId) clearInterval(pollTimerId);
        pollTimerId = null;
    }

    return { start, stop };
})();

window.ModEngine = ModEngine;
