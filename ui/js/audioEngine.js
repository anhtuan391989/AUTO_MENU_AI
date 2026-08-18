/* ==========================================================
   audioEngine.js — TASK B13: CLAP_VOLUME / LAUGH_VOLUME backend nội bộ
   -----------------------------------------------------------
   Bằng chứng (đã xác nhận từ B6, tài liệu xlsx tham chiếu): "Âm lượng của vỗ tay/cười TRÊN
   MENU (file đi kèm trong menu)" — target là audio engine NỘI BỘ của chính app (phát file mẫu
   bundled sẵn), KHÔNG phải MIDI/DAW. Vì vậy Clap/Laugh Volume KHÔNG đi qua
   executeAction()/dawMidiOutMappings (đường đó dành cho MIDI) — module này là 1 backend TÁCH
   BIỆT hoàn toàn, dùng `<audio>` (HTMLAudioElement) — `.volume` tự nhiên là 0.0-1.0, không
   liên quan gì tới MIDI CC/channel.

   ===== GIỚI HẠN THẬT — KHÔNG ĐOÁN FILE ĐÃ TỒN TẠI =====
   Repo KHÔNG có file .mp3/.wav nào (đã xác nhận lại ở B13 — `find . -iname "*.mp3" -o -iname
   "*.wav"` = rỗng). Thư mục `assets/` tồn tại nhưng RỖNG — đây là bằng chứng gợi ý (không phải
   xác nhận) rằng đây có thể là nơi dự định đặt file mẫu. Module này dùng đường dẫn QUY ƯỚC
   `assets/sounds/clap.mp3` / `assets/sounds/laugh.mp3` làm fallback mặc định — đây là QUYẾT
   ĐỊNH THIẾT KẾ cho code MỚI do tôi viết (không phải "đoán" 1 sự thật bên ngoài như CC MIDI),
   nhưng KHÔNG giả định file đã có mặt — play() luôn kiểm tra thật và trả BLOCKED/NOT_CONFIGURED
   rõ ràng nếu file không load được, không bao giờ báo thành công giả.
   ========================================================== */
(function () {
    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    /**
     * Tạo 1 controller ĐỘC LẬP cho 1 sample (Clap hoặc Laugh). Mỗi lần gọi factory này tạo ra
     * state RIÊNG (closure riêng) — Clap và Laugh không bao giờ chia sẻ `audioEl`/`volume01`/
     * `configuredPath` với nhau, đúng yêu cầu "giữ Clap và Laugh độc lập".
     */
    function createSampleController(label, conventionalPath) {
        let audioEl = null;
        let configuredPath = null; // do user cấu hình (nếu Setup UI sau này cho phép) — ưu tiên hơn quy ước
        let volume01 = 1; // mặc định full — sẽ được knob ghi đè ngay khi user xoay lần đầu

        function resolvePath() {
            return configuredPath || conventionalPath;
        }

        function ensureElement(AudioCtor) {
            const path = resolvePath();
            if (!path) return null;
            if (!audioEl || audioEl.__srcPath !== path) {
                audioEl = new AudioCtor(path);
                audioEl.__srcPath = path;
                audioEl.volume = volume01;
            }
            return audioEl;
        }

        return {
            setVolume(value0to100) {
                if (!Number.isFinite(value0to100)) return;
                volume01 = clamp01(value0to100 / 100);
                if (audioEl) audioEl.volume = volume01;
            },
            getVolume01() {
                return volume01;
            },
            setSamplePath(path) {
                configuredPath = path || null;
                audioEl = null; // buộc tạo lại element ở lần play() kế tiếp với path mới
            },
            getResolvedPath() {
                return resolvePath();
            },
            /**
             * @param {typeof Audio} AudioCtor — inject được cho test (Node không có `Audio`
             * toàn cục thật); trong renderer thật, gọi play() không cần truyền tham số này.
             */
            async play(AudioCtor) {
                const Ctor = AudioCtor || (typeof Audio !== "undefined" ? Audio : null);
                if (!Ctor) {
                    return { ok: false, reason: "NOT_CONFIGURED", detail: "Không có HTMLAudioElement khả dụng (không phải môi trường renderer/browser)." };
                }
                const el = ensureElement(Ctor);
                if (!el) {
                    return { ok: false, reason: "NOT_CONFIGURED", detail: `Chưa có đường dẫn file audio cho ${label}.` };
                }
                try {
                    el.currentTime = 0;
                    await el.play();
                    return { ok: true };
                } catch (err) {
                    // Lỗi thật (file không tồn tại/404, format không hỗ trợ, autoplay bị chặn, v.v.)
                    // — KHÔNG bao giờ báo ok:true khi play() thật sự lỗi.
                    return { ok: false, reason: "PLAYBACK_FAILED", detail: `${label}: ${err.message} (đường dẫn đang dùng: "${el.__srcPath}")` };
                }
            },
        };
    }

    const clapController = createSampleController("Clap", "assets/sounds/clap.mp3");
    const laughController = createSampleController("Laugh", "assets/sounds/laugh.mp3");

    window.AudioEngine = {
        setClapVolume: (v) => clapController.setVolume(v),
        setLaughVolume: (v) => laughController.setVolume(v),
        getClapVolume01: () => clapController.getVolume01(),
        getLaughVolume01: () => laughController.getVolume01(),
        setClapSamplePath: (p) => clapController.setSamplePath(p),
        setLaughSamplePath: (p) => laughController.setSamplePath(p),
        getClapResolvedPath: () => clapController.getResolvedPath(),
        getLaughResolvedPath: () => laughController.getResolvedPath(),
        playClap: (AudioCtor) => clapController.play(AudioCtor),
        playLaugh: (AudioCtor) => laughController.play(AudioCtor),
    };
})();
