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
    // TASK AI-ALG-05 — tỷ lệ năng lượng ngắn hạn NGOÀI thang âm của Key hiện hành tối thiểu để xác nhận chuyển điệu/đổi mode (chỉ áp ở chế độ nhãn).
    const MOD_MIN_OUT_OF_SCALE = 0.15;
    const MOD_NEWKEY_MAX_OUT = 0.2;  // AI-FIX-06: Key mới phải giải thích đoạn trung hạn (ngoài-thang ≤ 15%)
    const MOD_EXPLAIN_GAP = 0.08;     // ... và Key cũ ngoài-thang lớn hơn ≥ 15 điểm %
    const MOD_LABEL_COOLDOWN_TICKS = 20; // đổi nhãn Mode/relative: tối thiểu 20 tick (≈20 s) từ lần đổi trước
    let ticksSinceLabelChange = 1e9;
    const LONGMOD_SUSTAIN = 4; // đường 2: Key dài hạn khác Key hiện hành liên tục ≥ 4 tick (poll 1 s)

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

    /**
     * TASK AI-ALG-03 (D2/D3) — tham số TUỲ CHỌN thứ 5 `options = { originalMode: "Major"|"Minor" }`.
     * - KHÔNG truyền (caller cũ): hành vi CŨ giữ nguyên 100% (so sánh theo rootIndex).
     * - CÓ truyền: ModEngine phân loại thay đổi theo NHÃN (root+mode):
     *     MODULATION   = tonic đổi, không phải giọng tương đối  -> onModulation(modData) như cũ (semitone tính theo root, KHÔNG đổi),
     *                    modData cộng thêm: kind:"MODULATION", mode.
     *     MODE_CHANGE  = cùng tonic, đổi Major<->Minor           -> CHỈ state "KEY_LABEL_CHANGED" {kind:"MODE_CHANGE", pitchShift:false}
     *     RELATIVE_KEY = giọng tương đối (cùng tập nốt, vd C Major<->A Minor) -> CHỈ state "KEY_LABEL_CHANGED" {kind:"RELATIVE_KEY", pitchShift:false}
     *   Hai loại sau KHÔNG gọi onModulation => không có lệnh dịch pitch nào được tạo ra từ chúng.
     *   (Menu hiện chưa có kênh điều khiển "mode" xuống Auto-Tune — chỉ gửi root — nên MODE_CHANGE là sự kiện quan sát, chưa có hành động; xem báo cáo AI-ALG-03.)
     */
    function start(originalRootIndex, onModulation, isManualOverrideActiveFn, onStateChange, options) {
        stop(); // tránh chạy trùng nhiều watcher

        // Task B16 — "tap" tuỳ chọn, không throw ra ngoài poll loop nếu caller lỡ truyền callback lỗi.
        const emitState = (state, payload) => {
            if (typeof onStateChange !== "function") return;
            try { onStateChange(state, payload); } catch (_) { /* không để lỗi ở phía observer làm hỏng vòng lặp poll thật */ }
        };

        lastFiredRoot = null;
        // TASK AI-ALG-04 (D10) — Key gốc CHƯA xác nhận / không hợp lệ (vd "LISTENING" => rootIndex -1): KHÔNG theo dõi, KHÔNG phát bất kỳ
        // sự kiện dịch/reset nào (nếu không, delta tính từ chỉ số rác sẽ tạo lệnh dịch pitch sai).
        if (!Number.isInteger(originalRootIndex) || originalRootIndex < 0 || originalRootIndex > 11) {
            emitState("LISTENING", { timestamp: Date.now(), reason: "original_key_unconfirmed" });
            return;
        }
        let pendingRoot = null;   // root MỚI đang "chờ xác nhận" (chưa đủ streak để báo thật). AI-ALG-03: ở chế độ nhãn (labelMode) giá trị này là chuỗi "root-mode".
        let pendingStreak = 0;
        let longPendKey = null, longPendCount = 0; // AI-ALG-05 (đường 2)

        // TASK AI-ALG-03 — chế độ phân loại theo NHÃN, chỉ bật khi caller truyền originalMode hợp lệ.
        const labelMode = !!(options && (options.originalMode === "Major" || options.originalMode === "Minor"));
        let baseline = labelMode ? { root: originalRootIndex, mode: options.originalMode } : null; // nhãn đang được coi là "hiện hành"
        const relativeMajorRoot = (k) => (k.mode === "Minor" ? (k.root + 3) % 12 : k.root); // tonic của giọng trưởng có cùng tập nốt
        const labelOf = (k) => `${KeyEngine.NOTE_NAMES[k.root]} ${k.mode}`;

        emitState("LISTENING", { timestamp: Date.now() }); // trạng thái mặc định lúc bắt đầu theo dõi

        ticksSinceLabelChange = 1e9;
        pollTimerId = setInterval(() => {
            if (ticksSinceLabelChange < 1e9) ticksSinceLabelChange++;

            if (isManualOverrideActiveFn?.()) {
                if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "manual_override" });
                pendingRoot = null; pendingStreak = 0; return; // đang bị ghi đè tay -> không tranh lệnh, reset streak đang chờ
            }

            let result = KeyEngine.estimateKeyFromChroma(); // mặc định dùng chromaVector (ổn định), KHÔNG dùng bản "nhanh"/tạm

            if (result.confidence < KeyEngine.MIN_CONFIDENCE) {
                if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "low_confidence" });
                pendingRoot = null; pendingStreak = 0; return; // không đủ tin cậy -> không tính vào streak, tránh nhiễu
            }

            if (labelMode) {
                // ---- TASK AI-ALG-05: ĐƯỜNG 2 — Key DÀI HẠN. Bộ đo tức thời bám theo hợp âm nên có thể không bao giờ cho "Key mới" đủ 3 lần liên tiếp trong nhạc pop
                // dù đã chuyển điệu thật (hợp âm chủ của giọng mới chỉ xuất hiện thoáng qua). Khi Key dài hạn (đã neo lại khi có năng lượng ngoài thang) khác Key hiện hành
                // liên tục ≥ LONGMOD_SUSTAIN tick VÀ có bằng chứng ngoài thang (cổng bên dưới) => coi là Key mới đã xác nhận. KeyEngine không có API => bỏ qua (hành vi cũ). ----
                if (typeof KeyEngine.estimateKeyLong === "function") {
                    const L = KeyEngine.estimateKeyLong();
                    const lk = L && L.confidence >= KeyEngine.MIN_CONFIDENCE ? `${L.rootIndex}-${L.mode}` : null;
                    if (lk && lk !== `${baseline.root}-${baseline.mode}`) {
                        longPendKey === lk ? longPendCount++ : (longPendKey = lk, longPendCount = 1);
                        if (longPendCount >= LONGMOD_SUSTAIN) { result = { rootIndex: L.rootIndex, mode: L.mode, confidence: L.confidence }; pendingRoot = lk; pendingStreak = SUSTAIN_REQUIRED; }
                    } else { longPendKey = null; longPendCount = 0; }
                }
                // ---- AI-ALG-03: phân loại theo nhãn (root+mode). Debounce/streak/confidence GIỮ NGUYÊN như đường cũ. ----
                const cur = { root: result.rootIndex, mode: result.mode };
                if (cur.root === baseline.root && cur.mode === baseline.mode) {
                    if (pendingRoot !== null) emitState("LISTENING", { timestamp: Date.now(), reason: "returned_to_baseline" });
                    pendingRoot = null; pendingStreak = 0; return;
                }
                const curKey = `${cur.root}-${cur.mode}`;
                if (curKey === pendingRoot) {
                    pendingStreak++;
                } else {
                    pendingRoot = curKey; pendingStreak = 1;
                    sendModTelemetry({ event: "MOD_CANDIDATE", candidate: labelOf(cur), confidence: result.confidence, persistence: pendingStreak, sustainRequired: SUSTAIN_REQUIRED, timestamp: Date.now() });
                    emitState("MOD_CANDIDATE", { candidateRoot: cur.root, candidateLabel: labelOf(cur), confidence: result.confidence, streakCount: pendingStreak, sustainRequired: SUSTAIN_REQUIRED, timestamp: Date.now() });
                }
                if (pendingStreak < SUSTAIN_REQUIRED) return;

                // TASK AI-ALG-05 — CỔNG "NGOÀI THANG ÂM": chromaVector tức thời BÁM THEO HỢP ÂM nên hợp âm đổi TRONG cùng giọng (vd C Major: Am, Dm, G...) bị đọc
                // thành "Key khác" => báo chuyển điệu/đổi nhãn GIẢ (đo: 12/16 bài giữ nguyên Key vẫn có báo giả; log nhạc thật có MOD_CONFIRMED ±2 liên tục).
                // Chuyển điệu/đổi mode THẬT thì có năng lượng NGOÀI thang âm của Key hiện hành. KeyEngine không có hàm (stub/phiên bản cũ) => không chặn (hành vi cũ).
                if (typeof KeyEngine.outOfScaleRatio === "function") {
                    const ratio = KeyEngine.outOfScaleRatio(baseline.root, baseline.mode, "mid"); // trung hạn (τ≈6 s): bền qua các hợp âm của giọng mới
                    if (typeof ratio === "number" && ratio < MOD_MIN_OUT_OF_SCALE) {
                        pendingStreak = SUSTAIN_REQUIRED - 1; // chưa đủ bằng chứng NGOÀI thang: giữ ứng viên, kiểm lại ở tick sau (không báo, không đếm thừa)
                        return;
                    }
                }
                const kind = cur.root === baseline.root ? "MODE_CHANGE"
                    : (relativeMajorRoot(cur) === relativeMajorRoot(baseline) ? "RELATIVE_KEY" : "MODULATION");
                // AI-FIX-06 — hiệu chỉnh theo "chance": chroma loãng (nhiễu/bộ gõ/giọng) luôn có ≥33% ngoài MỌI thang nên cổng trên không chặn được gì trên nhạc thật
                // (log 15/10: MOD_CONFIRMED ±5/±1/±3/±6 và nhãn B Minor<->B Major đảo qua lại cách 4 s). Thêm: (1) chuyển điệu THẬT cần Key mới giải thích tốt đoạn
                // trung hạn (ngoài-thang Key mới thấp) và Key cũ kém hơn rõ rệt; (2) đổi nhãn MODE_CHANGE cùng tonic (không đổi pitch) cần ≥ MOD_LABEL_COOLDOWN_TICKS giây từ lần đổi trước.
                if (kind === "MODULATION" && typeof KeyEngine.outOfScaleRatio === "function") {
                    const nOut = KeyEngine.outOfScaleRatio(cur.root, cur.mode, "mid"), bOut = KeyEngine.outOfScaleRatio(baseline.root, baseline.mode, "mid");
                    if (typeof nOut === "number" && typeof bOut === "number" && !(nOut <= MOD_NEWKEY_MAX_OUT && bOut - nOut >= MOD_EXPLAIN_GAP)) {
                        pendingStreak = SUSTAIN_REQUIRED - 1; return;
                    }
                } else if (kind === "MODE_CHANGE" && ticksSinceLabelChange < MOD_LABEL_COOLDOWN_TICKS) {
                    pendingStreak = SUSTAIN_REQUIRED - 1; return;
                }
                ticksSinceLabelChange = 0;
                const fromLabel = labelOf(baseline);
                baseline = cur; pendingRoot = null; pendingStreak = 0; longPendKey = null; longPendCount = 0;

                if (kind !== "MODULATION") {
                    // Đổi mode cùng tonic / giọng tương đối: KHÔNG tạo lệnh dịch pitch (không gọi onModulation).
                    const labelData = { kind, from: fromLabel, to: labelOf(cur), pitchShift: false, confidence: result.confidence, timestamp: Date.now() };
                    sendModTelemetry({ event: "KEY_LABEL_CHANGED", ...labelData, persistence: SUSTAIN_REQUIRED });
                    emitState("KEY_LABEL_CHANGED", labelData);
                    return;
                }

                // TASK AI-ALG-04 (D8/D10) — QUY ƯỚC: `semitone` = độ lệch TUYỆT ĐỐI so với Key GỐC (0 = đang ở Key gốc), KHÔNG phải delta so với
                // lần modulation trước. Giọng tương đối CỦA KEY GỐC (cùng tập nốt, vd gốc C Major -> A Minor) = vẫn ở Key gốc => 0, không phải -3.
                const origLabel = { root: originalRootIndex, mode: options.originalMode };
                const sameSetAsOriginal = relativeMajorRoot(cur) === relativeMajorRoot(origLabel);
                // TASK AI-ALG-05 — độ dịch theo TẬP NỐT (khoá nhạc): so tonic của giọng trưởng tương ứng. Cùng mode với Key gốc => đúng bằng chênh tonic (như cũ);
                // khác mode (vd gốc C Major, nhận "B Minor" = tương đối của D Major) => +2 (đúng tập nốt) thay vì -1 (sai 3 bán cung). Nhầm Major/Minor TƯƠNG ĐỐI là lỗi phổ biến nhất của dò Key.
                const deltaL = sameSetAsOriginal ? 0 : KeyEngine.shortestSemitoneDelta(relativeMajorRoot(origLabel), relativeMajorRoot(cur));
                lastFiredRoot = cur.root;
                if (deltaL === 0) {
                    // D10 — QUAY VỀ Key gốc: phát sự kiện reset RÕ RÀNG (không phải "không có gì xảy ra"). Consumer phải đưa offset về 0.
                    const retL = {
                        semitone: 0, kind: "RETURN_TO_ORIGINAL", resetOffset: true,
                        originalKey: `${KeyEngine.NOTE_NAMES[originalRootIndex]}`, targetKey: labelOf(cur), mode: cur.mode,
                        confidence: result.confidence, stable: true, timestamp: Date.now(),
                    };
                    sendModTelemetry({ event: "MOD_RETURN_TO_ORIGINAL", ...retL, persistence: SUSTAIN_REQUIRED });
                    emitState("MODULATION_DETECTED", retL);
                    onModulation(retL);
                    return;
                }
                const modDataL = {
                    semitone: deltaL,
                    originalKey: `${KeyEngine.NOTE_NAMES[originalRootIndex]}`,
                    targetKey: labelOf(cur),
                    confidence: result.confidence,
                    stable: true,
                    timestamp: Date.now(),
                    kind: "MODULATION", mode: cur.mode, // AI-ALG-03: field cộng thêm, field cũ không đổi
                };
                sendModTelemetry({ event: "MOD_CONFIRMED", ...modDataL, persistence: SUSTAIN_REQUIRED });
                emitState("MODULATION_DETECTED", modDataL);
                onModulation(modDataL);
                return;
            }

            const baseline_legacy = lastFiredRoot === null ? originalRootIndex : lastFiredRoot; // đã mod trước đó thì so với key ĐANG áp dụng, không so lại key gốc ban đầu

            if (result.rootIndex === baseline_legacy) {
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

            if (delta === 0) {
                // TASK AI-ALG-04 (D10) — đến đây nghĩa là ĐÃ modulation trước đó (baseline_legacy != gốc) rồi nay QUAY VỀ root gốc:
                // phát sự kiện reset rõ ràng (semitone 0 = Key gốc, TUYỆT ĐỐI), thay vì im lặng làm consumer giữ offset cũ.
                const retData = {
                    semitone: 0, kind: "RETURN_TO_ORIGINAL", resetOffset: true,
                    originalKey: `${KeyEngine.NOTE_NAMES[originalRootIndex]}`,
                    targetKey: `${KeyEngine.NOTE_NAMES[result.rootIndex]} ${result.mode}`,
                    confidence: result.confidence, stable: true, timestamp: Date.now(),
                };
                sendModTelemetry({ event: "MOD_RETURN_TO_ORIGINAL", ...retData, persistence: SUSTAIN_REQUIRED });
                emitState("MODULATION_DETECTED", retData);
                onModulation(retData);
                return;
            }

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
