const EventBus = require("../../events/EventBus");
const Events = require("../../events/Events");
const Logger = require("../../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * ResultQueue  (Analysis Aggregator)
 * ----------------------------------------------------------
 * Nằm giữa InferenceEngine và DecisionEngine. Nhiệm vụ DUY NHẤT:
 * gom nhiều AnalysisResult đến GẦN NHAU về thời gian, loại trùng,
 * ưu tiên kết quả quan trọng hơn, rồi phát ĐÚNG 1 danh sách cuối
 * cùng qua ANALYSIS_READY.
 *
 * TUYỆT ĐỐI KHÔNG: gọi Driver/Workflow/AutoTune/MIDI, không sửa
 * AIContext/AnalysisState/InferenceEngine — chỉ ĐỌC các
 * AnalysisResult nhận được qua ANALYSIS_RESULT, không tự quyết định
 * "nên làm gì" với chúng (đó là việc của DecisionEngine).
 *
 * KHÔNG dùng setInterval/polling — chỉ dùng ĐÚNG 1 setTimeout
 * "một lần" cho mỗi đợt gom, bắt đầu đếm khi phần tử ĐẦU TIÊN của
 * đợt đó tới, và KHÔNG tự gia hạn thêm khi có phần tử mới trong
 * lúc đang đếm (cửa sổ CỐ ĐỊNH) — tránh 1 chuỗi sự kiện dồn dập
 * làm trễ ANALYSIS_READY vô thời hạn.
 * ==========================================================
 */

// -- Bảng ưu tiên: TẬP TRUNG duy nhất ở đây, không rải rác nơi khác --
const PRIORITY = {
    NEW_SONG: 100,
    KEY_CHANGE: 80,
    MODULATION: 60,
    BPM_CHANGE: 40,
    NOISE: 0
};

// -- Nhóm theo "trục dữ liệu": quyết định 2 type có MÂU THUẪN (tranh nhau, chỉ giữ 1) hay
//    ĐỘC LẬP (giữ cả 2) với nhau. KEY_CHANGE và MODULATION cùng xuất phát từ trục Key/hoà âm
//    -> tranh nhau. BPM_CHANGE là trục nhịp độ, độc lập với trục Key -> không tranh với
//    KEY_CHANGE/MODULATION. NEW_SONG đứng riêng, đè lên TẤT CẢ (xem mục "quy tắc gom" bên
//    dưới) vì về ý nghĩa, nếu bài hát đã đổi thì mọi kết quả khác trong cùng cửa sổ đều
//    hết ý nghĩa (chúng được suy ra TỪ Key/BPM cũ, không còn đúng nữa). --
const AXIS = {
    NEW_SONG: "SONG",
    KEY_CHANGE: "KEY_AXIS",
    MODULATION: "KEY_AXIS",
    BPM_CHANGE: "BPM_AXIS",
    NOISE: "NOISE_AXIS"
};

const AGGREGATION_WINDOW_MS = 400; // 300-500ms theo đề nghị — xem giải thích ở đầu file

class ResultQueue {

    constructor() {

        this.buffer = [];

        this.windowTimer = null;

        this._registerListeners();

    }

    _registerListeners() {

        EventBus.subscribe(Events.ANALYSIS_RESULT, (result) => this._onAnalysisResult(result));

    }

    _onAnalysisResult(result) {

        this.buffer.push(result);

        // Chỉ bắt đầu đếm giờ khi đây là phần tử ĐẦU TIÊN của đợt gom hiện tại — nếu đã có
        // timer đang chạy (tức đợt gom đã bắt đầu), KHÔNG reset lại nó, chỉ thêm vào buffer.
        if (!this.windowTimer) {

            this.windowTimer = setTimeout(() => this._flush(), AGGREGATION_WINDOW_MS);

        }

    }

    _flush() {

        const finalList = this._reduce(this.buffer);

        this.buffer = [];
        this.windowTimer = null;

        Logger.info("ResultQueue", `ANALYSIS_READY: [${finalList.map((r) => r.type).join(", ")}]`);

        EventBus.publish(Events.ANALYSIS_READY, finalList);

    }

    /**
     * Chữ ký nhận dạng "trùng nhau thật sự" — cùng type, cùng nguồn, cùng giá trị đích
     * (key.to / bpm.to / modulation.to). Dùng để gộp các bản ghi giống hệt thành 1.
     */
    _signature(result) {
        const target = result.key?.to ?? result.bpm?.to ?? result.modulation?.to ?? "";
        return `${result.type}:${result.source}:${target}`;
    }

    /**
     * Lõi thuật toán gom — nhận mảng AnalysisResult thô trong 1 cửa sổ, trả về danh sách
     * cuối cùng đã lọc trùng + xử lý mâu thuẫn theo priority.
     * Các bước, đúng theo thứ tự:
     *   1. Loại trùng lặp giống hệt (cùng signature) -> giữ bản có confidence cao nhất.
     *   2. Nếu có bất kỳ NEW_SONG nào -> NEW_SONG đè lên tất cả, chỉ giữ lại đúng 1 NEW_SONG.
     *   3. Ngược lại, gom theo AXIS -> trong mỗi trục, chỉ giữ đúng 1 kết quả priority cao nhất.
     *   4. NOISE (trục riêng) chỉ được giữ lại nếu KHÔNG có trục nào khác có kết quả (tức cả
     *      cửa sổ chỉ toàn nhiễu) -> tránh NOISE lấn át tín hiệu thật, nhưng vẫn trả về được
     *      1 kết quả có ý nghĩa khi thực sự không có gì xảy ra.
     */
    _reduce(results) {

        if (results.length === 0) return [];

        // Bước 1: loại trùng lặp giống hệt
        const bySignature = new Map();
        for (const r of results) {
            const sig = this._signature(r);
            const existing = bySignature.get(sig);
            if (!existing || r.confidence > existing.confidence) {
                bySignature.set(sig, r);
            }
        }
        const deduped = Array.from(bySignature.values());

        // Bước 2: NEW_SONG đè lên tất cả
        const newSongs = deduped.filter((r) => r.type === "NEW_SONG");
        if (newSongs.length > 0) {
            // Nhiều NEW_SONG khác signature (vd 1 từ nguồn KEY, 1 từ nguồn MOD) hiếm khi xảy ra
            // trong 400ms, nhưng nếu có, chỉ giữ bản confidence cao nhất — vẫn đúng 1 kết quả.
            const best = newSongs.reduce((a, b) => (b.confidence > a.confidence ? b : a));
            return [best];
        }

        // Bước 3: gom theo AXIS, mỗi trục chỉ giữ 1 kết quả priority cao nhất
        const byAxis = new Map();
        for (const r of deduped) {
            const axis = AXIS[r.type] || "UNKNOWN_AXIS";
            const existing = byAxis.get(axis);
            if (!existing || (PRIORITY[r.type] ?? 0) > (PRIORITY[existing.type] ?? 0)) {
                byAxis.set(axis, r);
            }
        }

        const nonNoise = Array.from(byAxis.entries()).filter(([axis]) => axis !== "NOISE_AXIS").map(([, r]) => r);

        if (nonNoise.length > 0) {
            // Bước 4: có tín hiệu thật -> bỏ NOISE, chỉ giữ các trục có ý nghĩa
            return nonNoise.sort((a, b) => (PRIORITY[b.type] ?? 0) - (PRIORITY[a.type] ?? 0));
        }

        // Cả cửa sổ chỉ toàn NOISE -> vẫn trả về đúng 1 NOISE để Decision Engine biết
        // "đã kiểm tra, không có gì đáng chú ý", thay vì im lặng hoàn toàn.
        const noiseResult = byAxis.get("NOISE_AXIS");
        return noiseResult ? [noiseResult] : [];

    }

}

module.exports = new ResultQueue();
