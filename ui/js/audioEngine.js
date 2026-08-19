/* ==========================================================
   audioEngine.js — TASK B13 (sửa lại ở A22: path sai + mất state machine)
   -----------------------------------------------------------
   Bằng chứng (đã xác nhận từ B6, tài liệu xlsx tham chiếu): "Âm lượng của vỗ tay/cười TRÊN
   MENU (file đi kèm trong menu)" — target là audio engine NỘI BỘ của chính app (phát file mẫu
   bundled sẵn), KHÔNG phải MIDI/DAW. Vì vậy Clap/Laugh Volume KHÔNG đi qua
   executeAction()/dawMidiOutMappings (đường đó dành cho MIDI) — module này là 1 backend TÁCH
   BIỆT hoàn toàn, dùng `<audio>` (HTMLAudioElement) — `.volume` tự nhiên là 0.0-1.0, không
   liên quan gì tới MIDI CC/channel.

   ===== A22 — SỬA GAP THẬT (không phải audit lại) =====
   1) ASSET PATH SAI: bản B13 dùng "assets/sounds/clap.mp3" / "assets/sounds/laugh.mp3" —
      2 file này KHÔNG TỒN TẠI. Task A20 đã bundle asset THẬT tại ui/assets/sounds/Vo-Tay.MP3
      (CLAP) và ui/assets/sounds/Cuoi-Deu.mp3 (LAUGH) — Khói đã chốt đây là canonical asset,
      KHÔNG được đổi tên. Sửa lại đúng 2 đường dẫn này (tương đối từ ui/index.html).
   2) STATE MACHINE BỊ MẤT: bản B13 chỉ có playClap()/playLaugh() — luôn phát lại từ đầu,
      KHÔNG có khái niệm PLAYING, KHÔNG dừng được khi bấm lần 2, KHÔNG tự về IDLE khi hết bài
      (không nghe 'ended'). Đây chính là hành vi Task A20 đã yêu cầu và đã cài đặt xong
      (SoundEffectEngine trong renderer.js) trước khi B13 vô tình ghi đè mất. Khôi phục lại:
      IDLE --click--> PLAYING --click--> STOP(reset về 0) --> IDLE
      PLAYING --ended (tự hết bài)--> IDLE (reset về 0), không loop.
   Giữ nguyên các hàm khác của B13 (setClapVolume/setLaughVolume/setClapSamplePath/...) vì
   không có gap gì ở đó — chỉ thêm/sửa đúng 2 phần trên.
   ========================================================== */
(function () {
    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    /**
     * Tạo 1 controller ĐỘC LẬP cho 1 sample (Clap hoặc Laugh). Mỗi lần gọi factory này tạo ra
     * state RIÊNG (closure riêng) — Clap và Laugh không bao giờ chia sẻ `audioEl`/`volume01`/
     * `configuredPath`/`playing` với nhau, đúng yêu cầu "giữ Clap và Laugh độc lập".
     */
    function createSampleController(label, conventionalPath) {
        let audioEl = null;
        let configuredPath = null; // do user cấu hình (nếu Setup UI sau này cho phép) — ưu tiên hơn quy ước
        let volume01 = 1; // mặc định full — sẽ được knob ghi đè ngay khi user xoay lần đầu
        let playing = false;
        const listeners = [];

        function notify() {
            listeners.forEach((cb) => {
                try { cb(playing); } catch (err) { console.error(`[AudioEngine] ${label} listener lỗi:`, err); }
            });
        }

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
                audioEl.loop = false; // TUYỆT ĐỐI không loop — đúng yêu cầu Task A20 mục 2/3
                if (typeof audioEl.addEventListener === "function") {
                    audioEl.addEventListener("ended", () => {
                        // "File tự chạy hết": PLAYING -> IDLE, reset position về 0, không loop.
                        audioEl.currentTime = 0;
                        playing = false;
                        notify();
                    });
                }
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
                playing = false;
            },
            getResolvedPath() {
                return resolvePath();
            },
            isPlaying() {
                return playing;
            },
            onChange(callback) {
                if (typeof callback === "function") listeners.push(callback);
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
                    playing = true;
                    notify();
                    return { ok: true };
                } catch (err) {
                    // Lỗi thật (file không tồn tại/404, format không hỗ trợ, autoplay bị chặn, v.v.)
                    // — KHÔNG bao giờ báo ok:true khi play() thật sự lỗi.
                    playing = false;
                    return { ok: false, reason: "PLAYBACK_FAILED", detail: `${label}: ${err.message} (đường dẫn đang dùng: "${el.__srcPath}")` };
                }
            },
            /**
             * Dừng ngay, reset playback position về 0. Không throw nếu chưa từng play().
             */
            stop(AudioCtor) {
                if (!audioEl) return { ok: true };
                if (typeof audioEl.pause === "function") audioEl.pause();
                audioEl.currentTime = 0;
                playing = false;
                notify();
                return { ok: true };
            },
            /**
             * Toggle play/stop đúng state machine Task A20 mục 2/3:
             *   IDLE -> PLAYING: phát từ đầu.
             *   PLAYING -> STOP -> IDLE: dừng ngay, reset về 0.
             *   Bấm lại sau STOP/ended -> luôn phát lại từ đầu (vì play() luôn set currentTime=0).
             * @param {typeof Audio} AudioCtor — inject được cho test.
             */
            async toggle(AudioCtor) {
                if (playing) {
                    return this.stop(AudioCtor);
                }
                return this.play(AudioCtor);
            },
        };
    }

    // A22 — CANONICAL ASSET (Khói đã chốt, không được đổi tên): CLAP = Vo-Tay.MP3,
    // LAUGH = Cuoi-Deu.mp3, bundle sẵn tại ui/assets/sounds/ (Task A20). Đường dẫn TƯƠNG ĐỐI
    // tới ui/index.html (Electron loadFile trỏ thẳng vào file này cả ở dev lẫn khi đóng gói —
    // xem app/main.js) nên resolve đúng ở cả 2 môi trường mà không cần sửa app/main.js.
    const clapController = createSampleController("Clap", "assets/sounds/Vo-Tay.MP3");
    const laughController = createSampleController("Laugh", "assets/sounds/Cuoi-Deu.mp3");

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
        // A22 — khôi phục API bị mất: stop/toggle/isPlaying/onChange, cho CẢ 2 sample,
        // để renderer.js có thể hiện đúng state machine IDLE/PLAYING/STOP/ended.
        stopClap: (AudioCtor) => clapController.stop(AudioCtor),
        stopLaugh: (AudioCtor) => laughController.stop(AudioCtor),
        toggleClap: (AudioCtor) => clapController.toggle(AudioCtor),
        toggleLaugh: (AudioCtor) => laughController.toggle(AudioCtor),
        isClapPlaying: () => clapController.isPlaying(),
        isLaughPlaying: () => laughController.isPlaying(),
        onClapChange: (cb) => clapController.onChange(cb),
        onLaughChange: (cb) => laughController.onChange(cb),
    };
})();
