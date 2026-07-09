/* ==========================================================
   MOD ENGINE — tự quản lý việc theo dõi chuyển giọng (modulation)
   liên tục suốt bài hát
   -----------------------------------------------------------
   Độc lập với BPMEngine hoàn toàn. Chỉ PHỤ THUỘC 1 CHIỀU vào KeyEngine
   (đọc estimateKeyFromChroma() qua watchContinuous() — không sửa/không
   biết gì về nội bộ KeyEngine), giống như 1 đồng hồ đo đọc nhiệt kế chứ
   không sở hữu nhiệt kế đó.

   Cách dùng từ renderer.js:
     ModEngine.start(originalRootIndex, (data) => { ...applyModEvent... }, isManualOverrideActiveFn);
     ModEngine.stop();
   ========================================================== */
const ModEngine = (() => {
    let watcherStop = null;
    let lastFiredRoot = null;

    /**
     * @param {number} originalRootIndex  Chỉ số nốt gốc (0-11) của Key đã chốt lúc đầu bài
     * @param {(data: {semitone: number}) => void} onModulation  gọi khi phát hiện lệch khỏi Key gốc
     * @param {() => boolean} isManualOverrideActiveFn  hàm renderer.js cung cấp để biết có đang bị ghi đè tay không
     */
    function start(originalRootIndex, onModulation, isManualOverrideActiveFn) {
        stop(); // tránh chạy trùng nhiều watcher

        lastFiredRoot = null;

        watcherStop = KeyEngine.watchContinuous((result) => {
            if (isManualOverrideActiveFn?.()) return; // đang bị ghi đè tay -> không tranh lệnh
            if (result.rootIndex === lastFiredRoot) return; // đã gửi rồi, key vẫn giữ nguyên, bỏ qua

            const delta = KeyEngine.shortestSemitoneDelta(originalRootIndex, result.rootIndex);
            lastFiredRoot = result.rootIndex;

            if (delta === 0) return; // trùng key gốc, không phải modulation

            onModulation({ semitone: delta });
        });
    }

    function stop() {
        if (watcherStop) watcherStop();
        watcherStop = null;
    }

    return { start, stop };
})();

window.ModEngine = ModEngine;
