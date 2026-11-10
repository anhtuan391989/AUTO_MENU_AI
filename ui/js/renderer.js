(function loadAppSettingsModule() {
    if (typeof loadSetup === "function") {
        return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "appSettings.js", false);
    xhr.send();

    if (xhr.status >= 200 && xhr.status < 300) {
        Function(xhr.responseText)();
    }
})();

// Nạp dữ liệu đã lưu từ localStorage vào biến appSettings ngay khi renderer.js chạy.
// Thiếu dòng này thì appSettings ở main window luôn giữ giá trị mặc định rỗng,
// bất kể cửa sổ Setup đã lưu gì — đây là nguyên nhân chính khiến status bar
// không bao giờ hiển thị đúng DAW/Auto-Tune/Soundcard đã chọn.
loadSetup?.();

/* ==========================================================
   TASK A20 — SOUND EFFECT ENGINE (Built-in Clap/Laugh, Internal Audio Backend)
   ----------------------------------------------------------
   Audio backend NỘI BỘ cho 2 hiệu ứng âm thanh built-in bundle sẵn trong app
   (Vo-Tay.MP3 = CLAP, Cuoi-Deu.mp3 = LAUGH). Dùng HTMLAudioElement thuần —
   KHÔNG qua MIDI, KHÔNG qua DAW, KHÔNG qua PluginController/EventBus/Core AI
   (đúng ranh giới Task A20 mục 5/7). Hoàn toàn tách biệt khỏi AI_CONTROL/
   ManualState/ManualPriorityGuard/Key/Mod/BPM/BEAT_INPUT_VOLUME/
   MASTER_OUTPUT_VOLUME.

   Đặt TRỰC TIẾP trong renderer.js (thay vì file riêng trong ui/js/engines/)
   vì Task A20 yêu cầu KHÔNG được thêm thẻ <script> mới vào ui/index.html —
   không có cách nạp file riêng nào đảm bảo an toàn 100% (không đổi HTML,
   không phụ thuộc timing async, không phụ thuộc hành vi global-scope của
   eval) tốt hơn là khai báo cùng scope với phần code sẽ gọi tới nó.

   State machine (mục 2/3 của task, giống hệt cho cả Clap/Laugh):
       IDLE --click--> PLAYING --click--> STOP --(tự động)--> IDLE
       PLAYING --ended (tự chạy hết)--> IDLE
   STOP và 'ended' đều reset playback position về 0 và không loop.
   ========================================================== */
const SoundEffectEngine = (() => {

    // Built-in asset — đường dẫn TƯƠNG ĐỐI tới ui/index.html (Electron loadFile dùng
    // file:// trỏ thẳng vào ui/index.html cả ở dev lẫn khi đóng gói — xem app/main.js
    // mainWin.loadFile(...ui/index.html)) nên đường dẫn tương đối này resolve đúng ở
    // CẢ 2 môi trường mà không cần sửa app/main.js/preload.js. Giữ NGUYÊN tên file gốc
    // Khói cung cấp (đúng mục 4), đặt trong ui/assets/sounds/ (tách khỏi assets/ gốc ở
    // repo root vốn dùng cho icon/app assets, không phải audio media).
    const SOUND_SOURCES = Object.freeze({
        CLAP: "assets/sounds/Vo-Tay.MP3",
        LAUGH: "assets/sounds/Cuoi-Deu.mp3"
    });

    const DEFAULT_VOLUME_0_100 = 40; // khớp defaultValue của clapKnob/laughKnob (knobData bên dưới)

    // Mỗi effect giữ 1 HTMLAudioElement + state IDLE/PLAYING RIÊNG — không chia sẻ bất kỳ
    // biến nào giữa CLAP và LAUGH (đúng mục 6: volume/playback hoàn toàn độc lập).
    const effects = {};
    const listeners = [];
    // Âm lượng chung (knob "Hiệu Ứng") và thiết bị ra hiện tại — để hiệu ứng thêm SAU (thư viện) dùng đúng giá trị.
    let allVolume = DEFAULT_VOLUME_0_100 / 100;
    let lastSinkId = "";
    const LIB_PREFIX = "LIB:";

    function notify(effectId, isPlaying) {
        listeners.forEach((cb) => {
            try { cb(effectId, isPlaying); } catch (err) { console.error("[SoundEffectEngine] listener lỗi:", err); }
        });
    }

    function createEffect(effectId, src) {
        const audio = new Audio(src);
        audio.loop = false; // TUYỆT ĐỐI không loop — đúng mục 2/3
        audio.volume = DEFAULT_VOLUME_0_100 / 100;
        audio.addEventListener("ended", () => {
            // Mục 2/3 "File tự chạy hết": PLAYING -> IDLE, reset position về 0, không loop.
            audio.currentTime = 0;
            effects[effectId].playing = false;
            notify(effectId, false);
        });
        audio.addEventListener("error", () => {
            console.error(`[SoundEffectEngine] Lỗi tải/phát ${effectId} (${src}):`, audio.error);
        });
        effects[effectId] = { audio, playing: false };
    }

    Object.keys(SOUND_SOURCES).forEach((id) => createEffect(id, SOUND_SOURCES[id]));

    /**
     * Toggle play/stop cho 1 effect. Đúng state machine mục 2/3:
     *   IDLE -> PLAYING: phát từ đầu (currentTime=0), không loop.
     *   PLAYING -> STOP -> IDLE: dừng ngay, reset currentTime=0, không để lại state playing.
     *   Bấm lại sau STOP/ended -> luôn phát lại từ đầu.
     * @param {"CLAP"|"LAUGH"} effectId
     * @returns {boolean} trạng thái playing SAU khi toggle
     */
    function toggle(effectId) {
        const effect = effects[effectId];
        if (!effect) {
            console.error(`[SoundEffectEngine] effect không tồn tại: ${effectId}`);
            return false;
        }
        if (effect.playing) {
            effect.audio.pause();
            effect.audio.currentTime = 0;
            effect.playing = false;
        } else {
            effect.audio.currentTime = 0;
            const playPromise = effect.audio.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch((err) => {
                    console.error(`[SoundEffectEngine] play() ${effectId} lỗi:`, err);
                    effect.playing = false;
                    notify(effectId, false);
                });
            }
            effect.playing = true;
        }
        notify(effectId, effect.playing);
        return effect.playing;
    }

    /**
     * Set volume cho 1 effect, thang 0-100 (khớp thang knob hiện có) -> tự quy đổi 0-1
     * cho HTMLAudioElement.volume. Hoàn toàn độc lập giữa CLAP/LAUGH (mục 6).
     * @param {"CLAP"|"LAUGH"} effectId
     * @param {number} value0to100
     */
    function setVolume(effectId, value0to100) {
        const clamped = Math.max(0, Math.min(100, Number(value0to100) || 0));
        // "ALL" = âm lượng CHUNG cho cả Bảng Hiệu Ứng (knob "Hiệu Ứng"): áp cho mọi effect.
        if (effectId === "ALL") {
            allVolume = clamped / 100;
            Object.values(effects).forEach((e) => { e.audio.volume = clamped / 100; });
            return;
        }
        const effect = effects[effectId];
        if (!effect) return;
        effect.audio.volume = clamped / 100;
    }

    function isPlaying(effectId) {
        return !!effects[effectId]?.playing;
    }

    /**
     * Đăng ký callback được gọi mỗi khi trạng thái playing của 1 effect đổi — kể cả tự đổi
     * do 'ended', không chỉ do gọi toggle(). renderer.js dùng callback này để đồng bộ UI
     * (class "active" của clapPlayBtn/laughPlayBtn) luôn phản ánh ĐÚNG trạng thái audio
     * thật, thay vì tự toggle mù theo mỗi lần click.
     * @param {(effectId: "CLAP"|"LAUGH", isPlaying: boolean) => void} callback
     */
    function onChange(callback) {
        if (typeof callback === "function") listeners.push(callback);
    }

    /**
     * TASK B72 (gộp B72+B72.1) — chọn thiết bị ĐẦU RA cho Internal Audio Backend bằng
     * HTMLMediaElement.setSinkId() (Chromium/Electron hỗ trợ). CHỈ áp dụng cho âm thanh do chính
     * app phát (CLAP/LAUGH) — KHÔNG điều khiển đường phát của DAW/nhạc, KHÔNG đổi output mặc định
     * của Windows. deviceId rỗng = output mặc định của OS.
     * Trả về kết quả THẬT của setSinkId (không giả lập thành công): nếu thiết bị không tồn tại /
     * bị từ chối, promise của setSinkId reject -> ok:false + error; KHÔNG tự rơi về thiết bị khác
     * (audio element giữ nguyên sink trước đó khi setSinkId thất bại).
     * @param {string} deviceId
     * @returns {Promise<{ok:boolean, requested:string, actual:(string|null), error:(string|null)}>}
     */
    async function setOutputDevice(deviceId) {
        const requested = deviceId || "";
        const list = Object.values(effects);
        if (list.length === 0) {
            return { ok: false, requested, actual: null, error: "Không có audio element nào để áp dụng" };
        }
        const results = await Promise.allSettled(list.map((e) => (
            typeof e.audio.setSinkId === "function"
                ? e.audio.setSinkId(requested)
                : Promise.reject(new Error("setSinkId không được hỗ trợ trong môi trường này"))
        )));
        const failed = results.find((r) => r.status === "rejected");
        if (!failed) lastSinkId = requested;
        return {
            ok: !failed,
            requested,
            actual: getOutputDeviceId(),
            error: failed ? String(failed.reason?.message || failed.reason) : null,
        };
    }

    /**
     * Thư viện hiệu ứng (Bảng Hiệu Ứng nhiều nút): đồng bộ danh sách audio theo `items` do main gửi
     * ({ id, src }). Mỗi mục có id nội bộ "LIB:<id>" — KHÔNG chạm tới CLAP/LAUGH. Mục bị xoá/đổi file
     * sẽ được dừng và tạo lại. preload="none" để 40+ file không bị nạp sẵn vào bộ nhớ.
     */
    function loadLibrary(items) {
        const wanted = new Map();
        (Array.isArray(items) ? items : []).forEach((it) => {
            if (it && typeof it.id === "string" && typeof it.src === "string") wanted.set(LIB_PREFIX + it.id, it.src);
        });
        Object.keys(effects).forEach((key) => {
            if (!key.startsWith(LIB_PREFIX)) return;
            const e = effects[key];
            if (!wanted.has(key) || e.src !== wanted.get(key)) {
                e.audio.pause();
                e.audio.removeAttribute("src");
                e.audio.load();
                if (e.playing) { e.playing = false; notify(key, false); }
                delete effects[key];
            }
        });
        wanted.forEach((src, key) => {
            if (effects[key]) return;
            createEffect(key, src);
            effects[key].src = src;
            effects[key].audio.preload = "none";
            effects[key].audio.volume = allVolume;
            if (lastSinkId && typeof effects[key].audio.setSinkId === "function") {
                effects[key].audio.setSinkId(lastSinkId).catch(() => {});
            }
        });
    }

    /** Dừng mọi hiệu ứng thư viện đang phát (nút "Dừng" của Bảng Hiệu Ứng). exceptId: id được giữ lại (nếu có). */
    function stopAll(exceptId) {
        Object.keys(effects).forEach((key) => {
            if (!key.startsWith(LIB_PREFIX) || key === exceptId) return;
            const e = effects[key];
            if (!e.playing) return;
            e.audio.pause();
            e.audio.currentTime = 0;
            e.playing = false;
            notify(key, false);
        });
    }

    /** sinkId THẬT mà audio element đang dùng ("" = mặc định OS). null nếu chưa đọc được. */
    function getOutputDeviceId() {
        const first = Object.values(effects)[0];
        return first && typeof first.audio.sinkId === "string" ? first.audio.sinkId : null;
    }

    return { toggle, setVolume, isPlaying, onChange, setOutputDevice, getOutputDeviceId, loadLibrary, stopAll, SOUND_SOURCES };

})();

/* ==========================================================
   1. CLOCK (Cập nhật thời gian thực)
   ========================================================== */
function updateClock() {
    const clock = document.getElementById("clock");
    const n = new Date();
    if (clock) {
        clock.textContent = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
    }
}
setInterval(updateClock, 1000);
updateClock();

/* ==========================================================
   1B. NOW PLAYING (Header) — marquee, đọc dữ liệu từ WindowsMediaSession
   ----------------------------------------------------------
   Phần render/marquee thuần UI, KHÔNG tự đọc IPC (việc nhận IPC nằm ở
   mục 1C ngay bên dưới, theo đúng yêu cầu "renderer nhận IPC chỉ gọi
   lại 2 hàm này, không tự xử lý UI khác" — tách biệt 2 việc rõ ràng).
   Mặc định hiển thị "Unavailable" cho tới khi mục 1C nhận được event
   đầu tiên từ main process — trung thực, không bịa dữ liệu.

   Hợp đồng dữ liệu (contract) khớp ĐÚNG với snapshot mà
   core/integration/WindowsMediaSession.js phát ra:
     - window.AutoMenuAI.updateNowPlaying(snapshot)
         snapshot = { title, artist, application, album, thumbnail, timestamp }
         hoặc null (không có gì đang phát) -> hiển thị "No media"
     - window.AutoMenuAI.setNowPlayingUnavailable()
         gọi khi WindowsMediaSession phát event "unavailable"
   ========================================================== */
(function setupNowPlaying() {

    const viewport = document.getElementById("nowPlayingViewport");
    const track = document.getElementById("nowPlayingTrack");
    const copyA = document.getElementById("nowPlayingCopyA");
    const copyB = document.getElementById("nowPlayingCopyB");

    if (!viewport || !track || !copyA || !copyB) return; // an toàn nếu HTML thiếu phần tử

    const MARQUEE_SPEED_PX_PER_SEC = 45; // tốc độ chạy chữ, vừa mắt, không giật
    const COPY_GAP_PX = 44; // PHẢI khớp padding-right của .now-playing-text-copy trong CSS (v3.0: 48->44)
    const MIN_DURATION_SEC = 4;

    // Key đang áp dụng, hiện CẠNH tên bài ("Tên bài - Ca sĩ  •  Key: D Minor"). Chỉ là chữ thêm vào cùng
    // 1 phần tử có sẵn — không đổi HTML/CSS. Rỗng = chưa có Key đã chốt cho bài này (không hiện gì).
    let keySuffix = "";
    let lastSnapshot = "unavailable";
    let lastSongId = null; // "title|artist" của bài đang hiển thị — đổi bài thì Key cũ bị xoá ngay

    function textForSnapshot(snapshot) {

        if (snapshot === "unavailable") return "Unavailable";
        if (!snapshot) return "No media";

        const title = String(snapshot.title || "").trim();
        const artist = String(snapshot.artist || "").trim();

        if (!title) return "No media"; // không có title coi như chưa xác định được gì đáng tin

        return artist ? `${title} - ${artist}` : title;

    }

    // Chữ hiển thị đầy đủ = tên bài (+ Key nếu đã có). "Unavailable"/"No media" không bao giờ kèm Key.
    function displayText(snapshot) {

        const base = textForSnapshot(snapshot);
        const isRealSong = snapshot && snapshot !== "unavailable" && base !== "No media";
        return isRealSong && keySuffix ? `${base}  •  Key: ${keySuffix}` : base;

    }

    function stopMarquee() {

        track.classList.remove("marquee");
        track.style.animationDuration = "";
        copyB.style.display = "none";
        copyB.textContent = "";

    }

    // Chỉ chạy marquee khi tràn (đúng yêu cầu: ngắn hơn vùng hiển thị thì đứng yên).
    // Không làm thay đổi kích thước menu: viewport có overflow:hidden cố định theo
    // layout header sẵn có, marquee chỉ dịch chuyển bên trong, không đẩy layout.
    function startMarqueeIfNeeded() {

        copyB.style.display = "none"; // tạm ẩn bản sao 2 để đo đúng chiều rộng 1 bản

        const overflow = copyA.scrollWidth > viewport.clientWidth;

        if (!overflow) {

            stopMarquee();
            return;

        }

        // Kỹ thuật marquee liền mạch (seamless loop): 2 bản sao giống hệt nhau nối
        // tiếp, animation dịch đúng -50% (= đúng 1 bản) rồi lặp lại -> mắt người
        // không thấy điểm "giật" giữa vòng lặp.
        copyB.style.display = "inline-block";
        copyB.textContent = copyA.textContent;

        const singleCopyWidth = copyA.scrollWidth + COPY_GAP_PX;
        const durationSec = Math.max(MIN_DURATION_SEC, singleCopyWidth / MARQUEE_SPEED_PX_PER_SEC);

        track.style.animationDuration = `${durationSec}s`;
        track.classList.add("marquee");

    }

    function render(snapshot) {

        lastSnapshot = snapshot;

        // Đổi bài -> xoá Key của bài trước (Key bài mới sẽ được đẩy vào sau qua setNowPlayingKey).
        // Cùng bài (vd. cập nhật lần 2 kèm Key từ server) -> giữ nguyên Key đang hiện.
        const songId = snapshot && snapshot !== "unavailable"
            ? `${String(snapshot.title || "").trim()}|${String(snapshot.artist || "").trim()}`
            : null;
        if (songId !== lastSongId) {
            keySuffix = "";
            lastSongId = songId;
        }

        copyA.textContent = displayText(snapshot);
        stopMarquee();

        // Đợi layout ổn định (2 frame) rồi mới đo chiều rộng thật, tránh đo nhầm
        // lúc DOM chưa kịp cập nhật xong.
        requestAnimationFrame(() => requestAnimationFrame(startMarqueeIfNeeded));

    }

    // Trạng thái mặc định khi renderer khởi động — trung thực, không có dữ liệu thật.
    render("unavailable");

    // Đo lại khi cửa sổ đổi kích thước (viewport rộng/hẹp lại làm thay đổi việc có
    // tràn hay không).
    window.addEventListener("resize", () => {

        requestAnimationFrame(startMarqueeIfNeeded);

    });

    // Đo lại khi chính vùng hiển thị đổi độ rộng (vd. bấm nút xoay dọc Menu — lúc này
    // không có sự kiện "resize" của cửa sổ). Chỉ đo, không đổi kích thước layout.
    if (typeof ResizeObserver === "function") {

        new ResizeObserver(() => {

            requestAnimationFrame(startMarqueeIfNeeded);

        }).observe(viewport);

    }

    // API công khai cho 1 task nối dây sau này (IPC từ WindowsMediaSession).
    window.AutoMenuAI = window.AutoMenuAI || {};
    window.AutoMenuAI.updateNowPlaying = render;
    window.AutoMenuAI.setNowPlayingUnavailable = () => render("unavailable");

    // Đẩy Key đang áp dụng vào dòng tên bài. Không đổi gì nếu Key không đổi (tránh khởi động lại chữ chạy).
    window.AutoMenuAI.setNowPlayingKey = (keyText) => {

        const next = typeof keyText === "string" ? keyText.trim() : "";
        if (next === keySuffix) return;

        keySuffix = next;
        if (lastSnapshot && lastSnapshot !== "unavailable") render(lastSnapshot);

    };

})();

/* ==========================================================
   NÚT "HIỆU ỨNG" -> mở/đóng CỬA SỔ RIÊNG của Bảng Hiệu Ứng (app/EffectsWindow.js).
   index.html đang gắn onclick="openEffectModal()" (lớp phủ cũ trong menu); vì không được sửa
   HTML nên chặn click ở pha capture của document, TRƯỚC onclick inline. Nếu không có
   electronAPI (vd. mở index.html bằng trình duyệt thường) thì không chặn -> lớp phủ cũ vẫn chạy.
   ========================================================== */
(function setupEffectsWindowButton() {

    // EFFECT-LIT-01 — nút EFFECT SÁNG khi Bảng Hiệu Ứng đang mở, TẮT khi đóng (kể cả khi đóng bằng nút ✕ trong cửa sổ hiệu ứng). Mở app: tắt.
    if (window.electronAPI && typeof window.electronAPI.onEffectsState === "function") {
        window.electronAPI.onEffectsState((open) => document.getElementById("effectPopupBtn")?.classList.toggle("active", !!open));
    }

    document.addEventListener("click", (event) => {

        const btn = event.target && event.target.closest ? event.target.closest("#effectPopupBtn") : null;
        if (!btn) return;

        const api = window.electronAPI;
        if (!api || typeof api.toggleEffectsWindow !== "function") return;

        event.preventDefault();
        event.stopImmediatePropagation();
        api.toggleEffectsWindow();

    }, true);

})();

/* ==========================================================
   1C. NOW PLAYING — nhận IPC từ main process (WindowsMediaSession)
   ----------------------------------------------------------
   Gọi window.AutoMenuAI.updateNowPlaying()/setNowPlayingUnavailable()
   (mục 1B, hiển thị Header) VÀ dispatchNowPlayingPayload() (mục 7B, Key
   Source Manager — Song Database). Không tự xử lý UI Header trực tiếp ở
   đây. Không poll, không timer — chỉ cập nhật khi main process bắn event.
   ========================================================== */
if (window.electronAPI?.onNowPlayingChange) {

    window.electronAPI.onNowPlayingChange((payload) => {
        window.AutoMenuAI?.updateNowPlaying(payload);
        dispatchNowPlayingPayload(payload); // mục 7B — Song Database/Manual/AI priority
        if (typeof syncNowPlayingKeyText === "function") syncNowPlayingKeyText(); // bài mới: hiện Key đang áp dụng (hoặc xoá nếu chưa có)
    });

}

if (window.electronAPI?.onNowPlayingUnavailable) {

    window.electronAPI.onNowPlayingUnavailable(() => {
        window.AutoMenuAI?.setNowPlayingUnavailable();
        dispatchNowPlayingPayload(null); // mất Now Playing -> coi như No Media cho Key Source Manager
    });

}

/* ==========================================================
   2. INITIAL DATA (Dữ liệu mẫu)
   -----------------------------------------------------------
   TASK (Khói xác nhận cho phép sửa, 25/08/2026 — xem TASK_A36 addendum): Key/BPM hiển thị
   PHẢI là "LISTENING" khi chưa có audio thật, chỉ hiện tone/BPM thật khi ĐÃ dò được từ audio.
   appState.originalKey/currentKey (bên dưới) GIỮ NGUYÊN "G# Minor" làm giá trị nội bộ an toàn
   (dùng cho transposeKey()/Mod delta/gửi Plugin) — CHỈ đổi chữ hiển thị ở đây và ở
   applyActiveKeyToPlugin()/refreshKeySourceDisplay() (xem cờ keyEverDetected), không đổi giá
   trị nhạc lý nội bộ để tránh vỡ logic Mod/plugin dispatch đang phụ thuộc 1 tên nốt hợp lệ.
   ========================================================== */
document.getElementById("currentKey").textContent = "LISTENING";
document.getElementById("currentBpm").textContent = "LISTENING";
document.getElementById("modTime").textContent = "";

const appState = {
    originalKey: "G# Minor",
    currentKey: "G# Minor",
    currentBpm: 128,
    autoKeyDetect: true,
    aiEngineRunning: true,
    modEnabled: false,
    modOffset: 0
};

const modTimeline = [
    { time: "02:15", shift: +1 },
    { time: "03:48", shift: -2 },
    { time: "05:10", shift: +3 }
];

let originalKey = appState.originalKey;
let modAutoOffTimer = null;

/* ==========================================================
   3. WINDOW & MODAL SETUP (Xử lý nút đóng/setup)
   ========================================================== */
const setupBtn = document.getElementById("setupBtn");
if (setupBtn) {
    setupBtn.addEventListener("click", async () => {
        setupBtn.style.opacity = "0.5";
        setTimeout(() => { setupBtn.style.opacity = "1"; }, 150);

        if (window.electronAPI?.openSetup) {
            try {
                await window.electronAPI.openSetup();
            } catch (err) {
                console.error("openSetup lỗi:", err);
            }
        } else {
            console.warn("electronAPI.openSetup không khả dụng");
        }
    });
}

document.getElementById("closeBtn")?.addEventListener("click", () => window.close?.());
// TASK B — MENU RUNTIME: minBtn trước đây chỉ console.log("MINIMIZE") (UI-only, không tác
// dụng thật). Nối vào IPC thật (main.js: "minimize-window") để thu nhỏ cửa sổ thật.
document.getElementById("minBtn")?.addEventListener("click", () => {
    if (window.electronAPI?.minimizeWindow) {
        window.electronAPI.minimizeWindow();
    } else {
        console.error("[MenuControl] minimizeWindow không khả dụng (electronAPI thiếu).");
    }
});

// MENU-UI-01B — Công tắc Always on Top cạnh nút Settings. Tạo bằng JS (KHÔNG sửa index.html).
// UI chỉ hiện ON/OFF theo giá trị THẬT main process trả về (isAlwaysOnTop()), không tự giả định.
(function initAlwaysOnTopSwitch() {
    const container = document.querySelector(".window-buttons");
    if (!container) return;
    const api = window.electronAPI;
    const LABEL = "Always on Top — Luôn ở phía trên";

    const sw = document.createElement("button");
    sw.id = "aotSwitch";
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", LABEL);
    container.insertBefore(sw, document.getElementById("setupBtn") || container.firstChild);

    let busy = false;

    function render(state, errMsg) {
        sw.dataset.state = state; // on | off | pending | error
        sw.setAttribute("aria-checked", state === "on" ? "true" : "false");
        if (errMsg) sw.classList.add("aot-error"); else sw.classList.remove("aot-error");
        let tip = LABEL;
        if (state === "on") tip += " — ĐANG BẬT (bấm để tắt)";
        else if (state === "off") tip += " — ĐANG TẮT (bấm để bật)";
        else if (state === "pending") tip += " — đang kiểm tra...";
        else tip += " — không xác định";
        if (errMsg) tip += " | Lỗi: " + errMsg;
        sw.title = tip;
    }

    if (!api || typeof api.getAlwaysOnTop !== "function" || typeof api.setAlwaysOnTop !== "function") {
        console.error("[AlwaysOnTop] electronAPI thiếu getAlwaysOnTop/setAlwaysOnTop.");
        sw.disabled = true;
        render("error", "electronAPI không khả dụng");
        return;
    }

    render("pending");
    sw.disabled = true;

    Promise.resolve()
        .then(() => api.getAlwaysOnTop())
        .then((r) => {
            if (r && typeof r.value === "boolean" && r.ok) render(r.value ? "on" : "off");
            else render("error", (r && r.error) || "Không đọc được trạng thái");
        })
        .catch((err) => {
            console.error("[AlwaysOnTop] getAlwaysOnTop lỗi:", err);
            render("error", String((err && err.message) || err));
        })
        .finally(() => { sw.disabled = false; });

    sw.addEventListener("click", async () => {
        if (busy) return; // chặn bấm dồn: mỗi lần chỉ 1 IPC đang chờ
        busy = true;
        sw.disabled = true;
        try {
            const next = sw.getAttribute("aria-checked") !== "true";
            const r = await api.setAlwaysOnTop(next);
            if (r && typeof r.value === "boolean") {
                render(r.value ? "on" : "off", r.ok ? null : (r.error || "Thao tác thất bại"));
            } else {
                render("error", "Phản hồi không hợp lệ từ main process");
            }
            if (r && !r.ok) console.error("[AlwaysOnTop] thao tác thất bại:", r.error);
        } catch (err) {
            console.error("[AlwaysOnTop] setAlwaysOnTop lỗi:", err);
            render("error", String((err && err.message) || err));
        } finally {
            busy = false;
            sw.disabled = false;
        }
    });
})();

document.getElementById("closeModal")?.addEventListener("click", () => {
    console.log("Close modal (setup window is separate)");
});

document.getElementById("saveSetup")?.addEventListener("click", () => {
    const dawName = document.getElementById("dawSelect")?.value;
    const dawDisplay = document.getElementById("dawName");

    if (dawDisplay && dawName) {
        dawDisplay.textContent = dawName;
    }

    console.log("Save setup request sent to setup window");
});

/* ==========================================================
   4. PRESETS & CONTROLS (Nút chọn chế độ)
   ========================================================== */
// MIDI-MASTER-01 / MENU-CONTROL-01 — thêm executeAction() SONG SONG với toggle CSS đã có
// (không thay thế). ACTIONS.PRESET_* đã được actionRegistry.js khai báo sẵn, KHÔNG có mapping
// mặc định — executeAction() tự trả NOT_CONFIGURED nếu user chưa gán MIDI/mouse cho preset đó,
// không hề giả vờ thành công. Đây là "Plugin Preset", ngoài phạm vi MIDI-MASTER-01 (đã ghi rõ
// trong actionRegistry.js: "KHÔNG kèm backend audio/preset thật") — chỉ nối đường DISPATCH,
// không tự phát minh hành vi đổi preset thật của Plugin.
const PRESET_NAME_TO_ACTION = {
    NORM: "PRESET_NORM",
    LOFI: "PRESET_LOFI",
    RAP: "PRESET_RAP",
    REMIX: "PRESET_REMIX",
    "TUNE OFF": "PRESET_TUNE_OFF",
};
// TASK A79/A80 — nút TUNE KHÔNG thuộc nhóm chọn-một của Preset: nó là công tắc bypass Auto-Tune (cả 4 plugin) chạy ĐỘC LẬP.
// Mặc định (mở app): nút SÁNG, chữ "TUNE ON" = Auto-Tune chạy, Bypass TẮT.
// Bấm: nút TẮT SÁNG, chữ "TUNE OFF" = Bypass BẬT (Auto-Tune bị bỏ qua, cả 2 mic). Bấm lần nữa: về TUNE ON.
// HTML giữ nguyên (nút vẫn khai báo "TUNE OFF", không có class active) — JS nhận diện nút theo chữ MỘT LẦN rồi gắn data-tune-btn.
document.querySelectorAll(".preset-btn").forEach((b) => { if (b.textContent.trim() === "TUNE OFF") b.dataset.tuneBtn = "1"; });
const isTuneOffBtn = (b) => !!(b && b.dataset && b.dataset.tuneBtn === "1");
// TASK A94 — nút LOFI KHÔNG thuộc nhóm chọn-một: là công tắc ON/OFF ĐỘC LẬP (kết hợp được với NORM/RAP/REMIX). Mặc định TẮT (không sáng).
// Bấm: nút SÁNG = LOFI BẬT (CC 127), bấm lần nữa: TẮT (CC 0). Không đổi HTML — JS nhận diện nút theo chữ "LOFI" một lần. Không lưu/khôi phục (Menu không đọc được trạng thái DAW): luôn mở ở TẮT.
document.querySelectorAll(".preset-btn").forEach((b) => { if (!b.closest(".custom-modal") && b.textContent.trim() === "LOFI") b.dataset.lofiBtn = "1"; });
const isLofiBtn = (b) => !!(b && b.dataset && b.dataset.lofiBtn === "1");
const isIndependentPresetBtn = (b) => isTuneOffBtn(b) || isLofiBtn(b);
let currentPresetName = "NORM"; // A95 — preset đang sáng (chỉ đổi khi BẤM; mở app không gửi gì); RAP giữ Verb dài TẮT nên knob FX không được bật lại bus này
function renderTuneBtn(btn, tuneOn) {
    btn.classList.toggle("active", tuneOn);
    btn.textContent = tuneOn ? "TUNE ON" : "TUNE OFF";
}
document.querySelectorAll(".preset-btn").forEach((b) => { if (isTuneOffBtn(b)) renderTuneBtn(b, true); }); // mặc định TUNE ON (bypass tắt)
document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        if (isTuneOffBtn(e.target)) {
            const tuneOnNow = !e.target.classList.contains("active"); // trạng thái ĐÍCH sau cú bấm
            renderTuneBtn(e.target, tuneOnNow);
            const bypassOn = !tuneOnNow; // TUNE OFF = Bypass BẬT
            reportDawStateResult(e.target, "TUNE", window.ActionRegistry?.setDawControlState?.("TUNE", bypassOn, { reason: "menu-button" }));
            return;
        }
        if (isLofiBtn(e.target)) {
            const lofiOnNow = !e.target.classList.contains("active"); // trạng thái ĐÍCH sau cú bấm
            e.target.classList.toggle("active", lofiOnNow);
            reportDawStateResult(e.target, "LOFI", window.ActionRegistry?.setDawControlState?.("LOFI", lofiOnNow, { reason: "menu-button" }));
            return;
        }
        // TASK A95 — NORM/RAP/REMIX chọn-một thật: nút trước TẮT (gửi OFF + hoàn tác hiệu ứng), nút mới SÁNG (gửi ON + áp hiệu ứng). Xem applyPresetTransition (actionRegistry.js).
        const prevLit = [...document.querySelectorAll(".preset-btn")].find(b => !isIndependentPresetBtn(b) && !b.closest(".custom-modal") && b.classList.contains("active"));
        const prevName = prevLit ? prevLit.textContent.trim() : null;
        document.querySelectorAll(".preset-btn").forEach(b => { if (!isIndependentPresetBtn(b)) b.classList.remove("active"); });
        e.target.classList.add("active");
        saveData();
        const nextName = e.target.textContent.trim();
        currentPresetName = nextName;
        if (window.ActionRegistry?.applyPresetTransition && ["NORM", "RAP", "REMIX"].includes(nextName)) {
            window.ActionRegistry.applyPresetTransition(["NORM", "RAP", "REMIX"].includes(prevName) ? prevName : null, nextName, {
                getKnob: (id) => { const k = knobData.find(x => x.id === id); return k ? k.value : undefined; },
                setKnob: (id, v) => { const k = knobData.find(x => x.id === id); if (k) { k.value = v; updateKnob(k); saveData(); } }
            }).catch(err => console.error(`[MenuControl] PRESET (${nextName}) lỗi:`, err));
            return;
        }
        const actionName = PRESET_NAME_TO_ACTION[nextName];
        if (actionName && window.ActionRegistry?.executeAction) {
            window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "menu-button" })
                .catch(err => console.error(`[MenuControl] PRESET (${actionName}) lỗi:`, err));
        }
    });
});

document.getElementById("autoDetectBtn")?.classList.add("active");

// PRESET-LIT-01 — nhóm NORM/LOFI/RAP/REMIX LUÔN có đúng 1 nút sáng (không bao giờ để tắt hết). Mở app / sau khi khôi phục cấu hình: nếu chưa có nút nào sáng -> NORM sáng.
// Chỉ chỉnh giao diện, KHÔNG gửi MIDI. Nút TUNE (công tắc bypass) không thuộc nhóm này.
function ensurePresetLit() {
    const group = [...document.querySelectorAll(".preset-btn")].filter((b) => !isIndependentPresetBtn(b) && !b.closest(".custom-modal") && ["NORM", "RAP", "REMIX"].includes(b.textContent.trim())); // A94: LOFI là công tắc độc lập, không thuộc nhóm
    if (!group.length) return;
    const lit = group.filter((b) => b.classList.contains("active"));
    if (lit.length === 1) return;
    group.forEach((b) => b.classList.remove("active"));
    (lit[0] || group.find((b) => b.textContent.trim() === "NORM") || group[0]).classList.add("active");
}
ensurePresetLit();

// MIDI-DAW-CONTROL-01 — hiển thị kết quả gửi lệnh ON/OFF trên tooltip của nút (KHÔNG đổi HTML/CSS). Chỉ nói "đã GỬI lệnh":
// Menu không có phản hồi từ Studio One nên KHÔNG BAO GIỜ hiện "DAW đã xác nhận".
function reportDawStateResult(btn, control, promise) {
    Promise.resolve(promise).then((res) => {
        if (!btn || !res) return;
        btn.title = res.text || "";
        btn.dataset.dawSync = res.ok ? "sent-unconfirmed" : (res.reason === "NOT_CONFIGURED" || res.status === "NOT_CONFIGURED" ? "not-configured" : "failed");
        return res;
    }).catch((err) => console.error(`[MenuControl] ${control} lỗi:`, err));
}

document.getElementById("musicBtn")?.addEventListener("click", (e) => {
    e.target.classList.toggle("disabled");
    saveData();
    // MIDI-DAW-CONTROL-01 — ý nghĩa class (VERIFIED_FILE: style.css #musicBtn / #musicBtn.disabled): KHÔNG có class
    // "disabled" = sáng = MUSIC BẬT; có "disabled" = mờ = MUSIC TẮT. Trạng thái ĐÍCH đọc SAU khi toggle ở trên.
    // setDawControlState() gửi đúng MỘT lệnh: ON/OFF riêng nếu đã cấu hình, nếu chưa thì lệnh toggle cũ như trước.
    const targetOn = !e.target.classList.contains("disabled");
    reportDawStateResult(e.target, "MUSIC", window.ActionRegistry?.setDawControlState?.("MUSIC", targetOn, { reason: "menu-button" }));
});

const MONITOR_BTN_TO_ACTION = { mic1Btn: "MONITOR_MIC1", mic2Btn: "MONITOR_MIC2", fxBtn: "MONITOR_FX" };
const MONITOR_BTN_TO_CONTROL = { mic1Btn: "MIC1", mic2Btn: "MIC2", fxBtn: "FX" }; // MIDI-DAW-CONTROL-01
// ==========================================================
// MIC-VOLUME-KNOB-01 — Bấm CHUỘT PHẢI vào MIC 1 / MIC 2 -> hiện núm âm lượng của đúng mic đó (thẻ nổi tạo bằng JS, KHÔNG sửa HTML).
// Núm dùng lại NGUYÊN cơ chế Knob có sẵn (cuộn chuột / kéo lên-xuống / nhấp đúp = về mặc định -> dispatchKnobVolume -> ActionRegistry
// MIC1_VOLUME / MIC2_VOLUME -> CC theo mapping Setup). Đóng bằng: bấm ra ngoài, phím Esc, hoặc chuột phải lần nữa. Bấm trái MIC 1/MIC 2
// vẫn là bật/tắt Monitor như cũ (không đổi).
// ==========================================================
// POPUP-AUTOHIDE-01 (A97) — MỌI popup chuột phải (MUSIC / MIC 1 / MIC 2 / FX) tự ẩn sau 5 giây. Đếm lại từ đầu mỗi khi người dùng thao tác TRONG thẻ
// (kéo knob, cuộn chuột, bấm) để thẻ không biến mất giữa lúc đang chỉnh; mỗi lần mở thẻ đếm lại 5 s. Ẩn bằng đúng hàm ẩn sẵn có của từng popup.
const POPUP_AUTO_HIDE_MS = 5000;
function createPopupAutoHide(card, hide) {
    let timer = null;
    const disarm = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const arm = () => { disarm(); timer = setTimeout(() => { timer = null; hide(); }, POPUP_AUTO_HIDE_MS); };
    ["mousemove", "wheel", "keydown", "change"].forEach((ev) => card.addEventListener(ev, () => { if (timer) arm(); }));
    // Đang GIỮ chuột trên thẻ (kéo knob, kể cả kéo ra ngoài thẻ) thì không ẩn; thả chuột -> đếm lại 5 s.
    let pressed = false;
    card.addEventListener("mousedown", () => { if (timer) { pressed = true; disarm(); } });
    document.addEventListener("mouseup", () => { if (pressed) { pressed = false; if (card.style.display !== "none") arm(); } });
    return { arm, disarm };
}
const MIC_VOLUME_POPUPS = [
    { btnId: "mic1Btn", knobId: "mic1VolKnob", valueId: "mic1VolValue", label: "MIC 1 VOLUME" },
    { btnId: "mic2Btn", knobId: "mic2VolKnob", valueId: "mic2VolValue", label: "MIC 2 VOLUME" },
];
function initMicVolumePopups() {
    const cards = [];
    const autos = [];
    const hideAll = () => { cards.forEach((c) => { c.style.display = "none"; }); autos.forEach((x) => x.disarm()); };
    MIC_VOLUME_POPUPS.forEach((cfg) => {
        const btn = document.getElementById(cfg.btnId);
        if (!btn || document.getElementById(cfg.knobId)) return; // thiếu nút, hoặc đã tạo rồi (idempotent)
        const card = document.createElement("div");
        card.className = "knob-card mic-volume-popup";
        card.style.cssText = "position:fixed;display:none;width:190px;height:96px;z-index:3000;background:#081523;"; // nền đặc (CSS .knob-card dùng nền mờ)
        card.innerHTML = `<div class="knob-label">${cfg.label}</div><div id="${cfg.valueId}" class="knob-number">90</div>`
            + `<div class="knob" id="${cfg.knobId}"><div class="led-ring"></div><div class="led-active"></div><div class="cap"></div><div class="pointer"></div></div>`;
        document.body.appendChild(card);
        const k = knobData.find((x) => x.id === cfg.knobId);
        if (k) updateKnob(k); // vẽ giá trị đã khôi phục từ lần dùng trước (loadData chạy trước hàm này)
        const auto = createPopupAutoHide(card, () => { card.style.display = "none"; }); // A97: tự ẩn sau 5 s
        autos.push(auto);
        btn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const wasOpen = card.style.display !== "none";
            hideAll();
            if (wasOpen) return;
            const r = btn.getBoundingClientRect();
            const left = Math.max(4, Math.min(window.innerWidth - 194, r.left + r.width / 2 - 95));
            let top = r.top - 96 - 6; // ưu tiên hiện PHÍA TRÊN nút; không đủ chỗ thì hiện bên dưới
            if (top < 4) top = r.bottom + 6;
            card.style.left = left + "px";
            card.style.top = top + "px";
            card.style.display = "flex";
            auto.arm();
        });
        cards.push(card);
    });
    if (!cards.length) return;
    document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (cards.some((c) => c.contains && c.contains(t))) return; // đang thao tác ngay trên núm
        if (t && t.closest && t.closest("#mic1Btn, #mic2Btn")) return; // chuột phải mở/đóng do handler contextmenu lo
        hideAll();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideAll(); });
}

// ==========================================================
// AUDIO-CHILL-01 (A96) — Bấm CHUỘT PHẢI vào nút MUSIC -> thẻ nổi giống popup Mic: TRÊN là nút "AUDIO CHILL" (ON/OFF), DƯỚI là knob điều khiển 1 VST.
// Tất cả qua MIDI (ActionRegistry: AUDIO_CHILL_STATE / AUDIO_CHILL_KNOB). Nút và knob ĐỘC LẬP: xoay knob không đổi nút, bấm nút không đổi knob.
// Nút: sáng = ON (gửi 127), tắt = OFF (gửi 0). Mở app luôn ở OFF và knob luôn về mặc định 50 (KHÔNG lưu/khôi phục), không gửi gì (Menu không đọc được trạng thái DAW). Tạo bằng JS, KHÔNG sửa HTML/CSS.
// Bấm trái MUSIC giữ nguyên như cũ. Đóng thẻ: bấm ra ngoài, phím Esc, hoặc chuột phải lần nữa.
// ==========================================================
function initAudioChillPopup() {
    const btn = document.getElementById("musicBtn");
    if (!btn || document.getElementById("audioChillKnob")) return; // thiếu nút, hoặc đã tạo rồi (idempotent)
    const card = document.createElement("div");
    card.className = "knob-card audio-chill-popup";
    card.style.cssText = "position:fixed;display:none;width:190px;height:142px;z-index:3000;background:#081523;"; // nền đặc (CSS .knob-card dùng nền mờ)
    // Bố cục: HÀNG TRÊN = nút AUDIO CHILL (rộng gần hết thẻ); HÀNG DƯỚI = chữ + số bên trái, knob bên phải (CSS .knob-label/.knob-number/.knob là absolute nên dời xuống bằng style riêng, không sửa CSS).
    card.innerHTML = '<button id="audioChillBtn" class="preset-btn" style="position:absolute;left:12px;top:8px;width:166px;height:30px;cursor:pointer;">AUDIO CHILL</button>'
        + '<div class="knob-label" style="top:46px;">CHILL</div><div id="audioChillValue" class="knob-number" style="top:70px;">50</div>'
        + '<div class="knob" id="audioChillKnob" style="top:54px;"><div class="led-ring"></div><div class="led-active"></div><div class="cap"></div><div class="pointer"></div></div>';
    document.body.appendChild(card);
    const k = knobData.find((x) => x.id === "audioChillKnob");
    if (k) updateKnob(k); // vẽ giá trị đã khôi phục (loadData chạy trước hàm này)
    const chillBtn = card.querySelector("#audioChillBtn");
    chillBtn.dataset.noPreset = "1"; // không thuộc nhóm preset NORM/RAP/REMIX
    chillBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const onNow = !chillBtn.classList.contains("active"); // trạng thái ĐÍCH sau cú bấm
        chillBtn.classList.toggle("active", onNow);
        Promise.resolve(window.ActionRegistry?.setDawControlState?.("AUDIO_CHILL", onNow, { reason: "menu-button" }))
            .catch((err) => console.error("[MenuControl] AUDIO CHILL lỗi:", err));
    });
    const auto = createPopupAutoHide(card, () => { card.style.display = "none"; }); // A97: tự ẩn sau 5 s
    const hide = () => { card.style.display = "none"; auto.disarm(); };
    btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (card.style.display !== "none") { hide(); return; }
        const r = btn.getBoundingClientRect();
        const left = Math.max(4, Math.min(window.innerWidth - 194, r.left + r.width / 2 - 95));
        let top = r.top - 142 - 6; // ưu tiên hiện PHÍA TRÊN nút; không đủ chỗ thì hiện bên dưới
        if (top < 4) top = r.bottom + 6;
        card.style.left = left + "px";
        card.style.top = top + "px";
        card.style.display = "flex";
        auto.arm();
    });
    document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (card.contains(t)) return;
        if (t && t.closest && t.closest("#musicBtn")) return; // chuột phải mở/đóng do handler contextmenu lo
        hide();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}

// ==========================================================
// FX-AUTO-TOGGLE-01 — Bấm CHUỘT PHẢI vào nút FX -> thẻ nổi có ô tích "Auto bật FX khi có nhạc" (tạo bằng JS, KHÔNG sửa HTML/CSS).
// Tích = BẬT Auto FX (setting fxAutoEnabled = true, mặc định). Bỏ tích = TẮT (fxAutoEnabled = false -> Auto không bật/tắt FX nữa).
// Dùng đúng cờ fxAutoEnabled sẵn có (createFxAutoWiring đã đọc cờ này), lưu qua setSetting nên nhớ sau khi mở lại app.
// Bấm trái FX giữ nguyên như cũ. Đóng thẻ: bấm ra ngoài, phím Esc, hoặc chuột phải lần nữa.
// ==========================================================
function initFxAutoMenu() {
    const btn = document.getElementById("fxBtn");
    if (!btn || document.getElementById("fxAutoMenuCard")) return; // thiếu nút, hoặc đã tạo rồi (idempotent)
    const card = document.createElement("div");
    card.id = "fxAutoMenuCard";
    card.style.cssText = "position:fixed;display:none;z-index:3000;background:#081523;border:1px solid #1f3a57;border-radius:8px;padding:8px 12px;color:#cfe3f7;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.5);";
    card.innerHTML = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;">'
        + '<input type="checkbox" id="fxAutoEnabledChk" style="cursor:pointer;"><span>Auto bật FX khi có nhạc</span></label>';
    document.body.appendChild(card);
    const chk = card.querySelector("#fxAutoEnabledChk");
    const auto = createPopupAutoHide(card, () => { card.style.display = "none"; }); // A97: tự ẩn sau 5 s
    const hide = () => { card.style.display = "none"; auto.disarm(); };
    chk.addEventListener("change", () => {
        setSetting("fxAutoEnabled", !!chk.checked);
        if (chk.checked) window.__fxAuto?.resume?.(); // tích lại => Auto chạy NGAY theo nhạc hiện tại (có nhạc bật / không nhạc tắt), bỏ qua giữ quyền 60 s
    });
    btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (card.style.display !== "none") { hide(); return; }
        chk.checked = getSetting("fxAutoEnabled", true) !== false; // đọc trạng thái hiện tại mỗi lần mở
        card.style.display = "block";
        const r = btn.getBoundingClientRect();
        const w = card.offsetWidth, h = card.offsetHeight;
        const left = Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2));
        let top = r.top - h - 6; // ưu tiên hiện PHÍA TRÊN nút; không đủ chỗ thì hiện bên dưới
        if (top < 4) top = r.bottom + 6;
        card.style.left = left + "px";
        card.style.top = top + "px";
        auto.arm();
    });
    document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (card.contains(t)) return;
        if (t && t.closest && t.closest("#fxBtn")) return; // chuột phải mở/đóng do handler contextmenu lo
        hide();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}

// AUTODETECT-MODE-01 — Bấm CHUỘT PHẢI nút AUTO DETECT -> thẻ nổi 2 ô tích, CHỈ CHỌN 1 TRONG 2 (luôn có đúng 1 ô được tích):
//   [ ] Tự dò bằng tay  = chế độ Auto-Key (plugin trong DAW tự dò; Menu bấm điểm dò + Send)   -> appSettings.autoKeyMode.enabled = true
//   [x] Dò bằng AI      = AI của Menu dò Key rồi gửi xuống Auto-Tune (mặc định, như cũ)       -> appSettings.autoKeyMode.enabled = false
// Dùng đúng khoá autoKeyMode của Setup > Calibration (cùng 1 nguồn dữ liệu, giữ nguyên waitSec). Tự ẩn sau 5 giây (A97). KHÔNG sửa HTML.
function initAutoDetectModePopup() {
    const btn = document.getElementById("autoDetectBtn");
    if (!btn || document.getElementById("autoDetectModeCard")) return; // thiếu nút, hoặc đã tạo rồi (idempotent)
    const card = document.createElement("div");
    card.id = "autoDetectModeCard";
    card.style.cssText = "position:fixed;display:none;z-index:3000;background:#081523;border:1px solid #1f3a57;border-radius:8px;padding:8px 12px;color:#cfe3f7;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.5);";
    card.innerHTML = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;">'
        + '<input type="checkbox" id="autoDetectManualChk" style="cursor:pointer;"><span>Tự dò bằng tay</span></label>'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;margin-top:6px;">'
        + '<input type="checkbox" id="autoDetectAiChk" style="cursor:pointer;"><span>Dò bằng AI</span></label>';
    document.body.appendChild(card);
    const manualChk = card.querySelector("#autoDetectManualChk");
    const aiChk = card.querySelector("#autoDetectAiChk");
    const auto = createPopupAutoHide(card, () => { card.style.display = "none"; }); // A97: tự ẩn sau 5 s
    const hide = () => { card.style.display = "none"; auto.disarm(); };
    const readManual = () => { const c = getSetting("autoKeyMode", null); return !!(c && typeof c === "object" && c.enabled === true); };
    const show = (manual) => { manualChk.checked = manual; aiChk.checked = !manual; };
    const choose = (manual) => {
        const c = getSetting("autoKeyMode", null);
        const prev = c && typeof c === "object" ? c : {};
        setSetting("autoKeyMode", { ...prev, enabled: manual, waitSec: prev.waitSec === undefined ? 8 : prev.waitSec });
        try { if (typeof __aiCoreCache !== "undefined") __aiCoreCache.t = 0; } catch (e) { /* bỏ qua */ } // hiệu lực ngay, không chờ cache 2 s
        show(manual);
    };
    // Chọn 1 trong 2: tích ô này => ô kia tự bỏ; bỏ tích ô đang chọn => giữ nguyên (luôn còn đúng 1 ô).
    manualChk.addEventListener("change", () => choose(true));
    aiChk.addEventListener("change", () => choose(false));
    btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (card.style.display !== "none") { hide(); return; }
        show(readManual()); // đọc trạng thái hiện tại mỗi lần mở
        card.style.display = "block";
        const r = btn.getBoundingClientRect();
        const w = card.offsetWidth, h = card.offsetHeight;
        const left = Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2));
        let top = r.top - h - 6; // ưu tiên hiện PHÍA TRÊN nút; không đủ chỗ thì hiện bên dưới
        if (top < 4) top = r.bottom + 6;
        card.style.left = left + "px";
        card.style.top = top + "px";
        auto.arm();
    });
    document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (card.contains(t)) return;
        if (t && t.closest && t.closest("#autoDetectBtn")) return; // chuột phải mở/đóng do handler contextmenu lo
        hide();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}

// KEY-SERVER-CORRECT-01 (Bước B) — Bấm CHUỘT PHẢI nút SEND của khối KEY -> thẻ nổi "Lưu Key vào Server":
// Key được chọn ở ô chọn Key bên cạnh sẽ được lưu làm Key ĐÚNG của bài đang phát (Key Server + songs.json trên máy),
// cần mật khẩu admin của Server (nhớ tới khi tắt app, không ghi ra file). Server từ chối thì không đổi gì. KHÔNG sửa HTML.
function initKeyServerCorrectCard() {
    const btn = document.getElementById("applyKeyBtn");
    const sel = document.getElementById("keySelector");
    if (!btn || !sel || document.getElementById("keyServerCorrectCard")) return; // thiếu nút, hoặc đã tạo rồi (idempotent)
    const card = document.createElement("div");
    card.id = "keyServerCorrectCard";
    card.style.cssText = "position:fixed;display:none;z-index:3000;width:230px;background:#081523;border:1px solid #1f3a57;border-radius:8px;padding:10px 12px;color:#cfe3f7;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.5);";
    card.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">Lưu Key vào Server</div>'
        + '<div id="keySrvCorrectInfo" style="margin-bottom:8px;line-height:1.35;"></div>'
        + '<input id="keySrvCorrectPass" type="password" autocomplete="off" placeholder="Mật khẩu Server" style="width:100%;box-sizing:border-box;background:#0b1d30;border:1px solid #1f3a57;border-radius:4px;color:#cfe3f7;padding:5px 7px;margin-bottom:8px;">'
        + '<div style="display:flex;gap:8px;"><button id="keySrvCorrectSave" style="flex:1;cursor:pointer;">Lưu</button><button id="keySrvCorrectClose" style="cursor:pointer;">Đóng</button></div>'
        + '<div id="keySrvCorrectMsg" style="margin-top:8px;line-height:1.35;"></div>';
    document.body.appendChild(card);
    const infoEl = card.querySelector("#keySrvCorrectInfo"), passEl = card.querySelector("#keySrvCorrectPass");
    const saveEl = card.querySelector("#keySrvCorrectSave"), closeEl = card.querySelector("#keySrvCorrectClose"), msgEl = card.querySelector("#keySrvCorrectMsg");
    const hide = () => { card.style.display = "none"; passEl.value = ""; };
    const chosenKey = () => (sel.value && sel.value !== "AI Key Detect") ? sel.value : null;
    const refreshInfo = () => {
        const k = chosenKey();
        infoEl.textContent = k ? `Lưu ${k} làm Key ĐÚNG của bài đang phát?` : "Chọn Key ĐÚNG ở ô chọn Key bên cạnh, rồi bấm chuột phải nút SEND lại.";
        saveEl.disabled = !k;
    };
    const MSG = {
        "need-token": "Nhập mật khẩu Server.",
        "wrong-password": "Sai mật khẩu Server.",
        "server-no-admin-token": "Server chưa cài mật khẩu admin nên không ai sửa được.",
        "not-on-server": "Bài này chưa có trên Server.",
        "server-disabled": "Đồng bộ Key Server đang tắt trong Setup.",
        "no-song": "Chưa biết tên bài đang phát.",
        "network": "Không kết nối được Server.",
        "bad-key": "Key không hợp lệ.",
        "no-segment": "Server không có đoạn Key nào để sửa.",
        "not-allowed": "Cửa sổ này không được phép sửa Key.",
    };
    saveEl.addEventListener("click", async () => {
        const k = chosenKey();
        if (!k) { refreshInfo(); return; }
        if (!window.electronAPI || typeof window.electronAPI.correctServerKey !== "function") { msgEl.textContent = "Bản app này chưa hỗ trợ sửa Key trên Server."; return; }
        saveEl.disabled = true; msgEl.textContent = "Đang lưu...";
        let r = null;
        try { r = await window.electronAPI.correctServerKey({ key: k, token: passEl.value }); } catch (e) { r = { ok: false, reason: "error" }; }
        passEl.value = ""; // không giữ mật khẩu trong ô nhập
        saveEl.disabled = false;
        if (r && r.ok) {
            msgEl.textContent = `Đã lưu ${r.key} lên Server` + (r.localUpdated ? ` và songs.json (${r.localUpdated} mục).` : ".");
            try { // Menu dùng Key mới ngay (chỉ khi Key đang áp dụng là của Database/Server; Manual vẫn ưu tiên cao nhất)
                if (keySource.songDb && keySource.songDb.active) {
                    keySource.songDb.value = r.key;
                    __dbBypassClear();
                    refreshKeySourceDisplay();
                    if (!(keySource.manual && keySource.manual.active)) applyActiveKeyToPlugin("Song Database");
                }
            } catch (e) { /* phần hiển thị phụ — không làm hỏng việc đã lưu */ }
        } else {
            const why = r && r.reason;
            msgEl.textContent = why === "multi-segment" ? `Bài có ${r.tongDoan || "nhiều"} đoạn Key khác nhau - hãy sửa trong trang quản lý của Server.` : (MSG[why] || "Không lưu được (lỗi từ Server).");
        }
    });
    closeEl.addEventListener("click", hide);
    sel.addEventListener("change", () => { if (card.style.display !== "none") refreshInfo(); });
    passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") saveEl.click(); });
    btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (card.style.display !== "none") { hide(); return; }
        refreshInfo(); msgEl.textContent = ""; passEl.value = "";
        card.style.display = "block";
        const r = btn.getBoundingClientRect();
        const w = card.offsetWidth, h = card.offsetHeight;
        card.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)) + "px";
        let top = r.top - h - 6; // ưu tiên hiện PHÍA TRÊN nút; không đủ chỗ thì hiện bên dưới
        if (top < 4) top = r.bottom + 6;
        card.style.top = top + "px";
    });
    document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (card.contains(t)) return;
        if (t && t.closest && t.closest("#applyKeyBtn")) return; // chuột phải mở/đóng do handler contextmenu lo
        hide();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}

["mic1Btn", "mic2Btn", "fxBtn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", (e) => {
        e.target.classList.toggle("active");
        saveData();
        if (id === "fxBtn") {
            // MENU-FX-FIX: bấm tay => Auto nhường quyền 60 s (không ghi đè), rồi tiếp quản theo trạng thái nhạc HIỆN TẠI.
            // Toàn bộ đường gửi + báo kết quả (đã gửi/chưa cấu hình/lỗi) nằm trong __fxManualToggle để UI không tự suy diễn.
            if (window.__fxManualToggle) { window.__fxManualToggle(e.target.classList.contains("active")); return; }
            window.__fxAuto?.notifyManual();
            // MIDI-DAW-CONTROL-01 — đã cấu hình FX ON/OFF (mute bus) => dùng nó, KHÔNG gửi thêm Send/toggle cũ cho cùng cú bấm.
            if (window.ActionRegistry?.getDawStateMode?.("FX") === "explicit") {
                reportDawStateResult(e.target, "FX", window.ActionRegistry.setDawControlState("FX", e.target.classList.contains("active"), { reason: "menu-button" }));
                return;
            }
            // Nếu đã cấu hình Send Reverb/Delay: bấm tay cũng điều khiển ĐÚNG các Send đó (nhất quán với Auto) thay vì
            // chỉ MONITOR_FX cũ. Chưa cấu hình => hành vi cũ giữ NGUYÊN (rơi xuống executeAction MONITOR_FX bên dưới).
            const grp = window.__fxSendGroup;
            if (grp && grp.managed().some((n) => n !== "MONITOR_FX")) {
                grp.apply(e.target.classList.contains("active"), { force: true })
                    .then((r) => { if (!r.ok) console.warn("[FX] Bấm tay: một số Send gửi lỗi — trạng thái DAW có thể chưa đồng bộ:", r); })
                    .catch((err) => console.error("[FX] Bấm tay lỗi:", err));
                return;
            }
        }
        // MIDI-DAW-CONTROL-01 — "active" = BẬT (VERIFIED_FILE: style.css .control-btn.active). Trạng thái ĐÍCH đọc SAU toggle.
        // setDawControlState(): ON/OFF riêng nếu đã cấu hình; chưa cấu hình => lệnh toggle cũ (MONITOR_*) như trước. MỘT lệnh/cú bấm.
        const control = MONITOR_BTN_TO_CONTROL[id];
        if (control && window.ActionRegistry?.setDawControlState) {
            reportDawStateResult(e.target, control, window.ActionRegistry.setDawControlState(control, e.target.classList.contains("active"), { reason: "menu-button" }));
        }
    });
});

// ==========================================================
// TASK AI-FX-01 — AUTO FX/SEND theo NHẠC (SYSTEM_AUDIO, KHÔNG dùng MIC).
// Logic phát hiện + máy trạng thái nằm ở AudioSource.createFxAutoController (audioSource.js).
// Ở đây chỉ nối: (1) mức dBFS từ BPMEngine.onLevel (cùng nguồn Music VU), (2) trạng thái SYSTEM_AUDIO,
// (3) applyFx -> ActionRegistry.executeAction(MONITOR_FX) — ĐƯỜNG GỬI MIDI DUY NHẤT sẵn có.
// Không có feedback từ DAW => UI chỉ đổi khi lệnh gửi ok (SEND_SENT_UNCONFIRMED), lỗi thì giữ nguyên UI.
// Cờ tắt khẩn cấp (không có UI): setting "fxAutoEnabled" = false. Chế độ MIDI: "fxAutoMidiMode" =
// "toggle" (mặc định: gửi đúng message như bấm tay) hoặc "absolute" (CC: BẬT=value đã map, TẮT=0).
// ==========================================================
function createFxAutoWiring() {
    if (window.__fxAuto || typeof AudioSource === "undefined" || !AudioSource.createFxAutoController) return window.__fxAuto || null;
    const fxBtn = document.getElementById("fxBtn");
    const AR0 = () => window.ActionRegistry;
    const group = AudioSource.createFxSendGroup({
        actions: ["FX_SEND_REVERB", "FX_SEND_DELAY"],
        legacyAction: "MONITOR_FX",
        timeoutMs: 5000, // MENU-FX-FIX: runtime không trả lời => TIMEOUT (không kẹt hàng đợi, không báo đã gửi)
        isConfigured: (n) => { const AR = AR0(); const m = AR?.getMidiOutMapping?.(AR.ACTIONS[n]); return !!(m && m.kind && Number.isFinite(m.number)) || !!AR?.getMouseCoordinate?.(AR.ACTIONS[n]); },
        execute: async (n, target) => {
            const AR = AR0(); if (!AR?.executeAction) return { ok: false, reason: "NO_ACTION_REGISTRY" };
            const ctx = { reason: "fx-send" };
            const map = AR.getMidiOutMapping?.(AR.ACTIONS[n]);
            if (getSetting("fxAutoMidiMode", "toggle") === "absolute" && map && map.kind === "cc") ctx.value = target ? (map.value ?? 127) : 0;
            return AR.executeAction(AR.ACTIONS[n], ctx);
        },
    });
    // BUTTON-RESET: nút FX KHÔNG còn được lưu qua phiên => lúc khởi động nút luôn ở MẶC ĐỊNH HTML (TẮT). seed() lấy trạng thái nút này làm
    // GIẢ ĐỊNH khởi động (UNKNOWN — không có feedback DAW, KHÔNG phải trạng thái DAW đã xác nhận). Giữ seed để Auto không gửi lệnh "TẮT" vô cớ lúc
    // khởi động (ở chế độ toggle mặc định lệnh đó ĐẢO trạng thái DAW). Nếu DAW thực tế khác giả định, lần chuyển nhạc được xác nhận đầu tiên sẽ gửi lệnh.
    group.seed(!!fxBtn?.classList.contains("active"));
    window.__fxSendGroup = group;
    // FSP8-LIVE-MONITOR-FX-AUTO-FIX-01 — ĐƯỜNG FX AUTO THẬT = FX_ON/FX_OFF (đặt Mute 4 bus đích danh), KHÔNG phải nhóm Send ở trên.
    // Trước đây Auto chỉ gọi `group` (FX_SEND_REVERB/DELAY, fallback MONITOR_FX): nút FX sáng nhưng 4 bus vẫn Mute vì không có lệnh FX_ON nào được gửi.
    // `busGroup` dùng lại đúng createFxSendGroup (hàng đợi tuần tự, timeout 5 s, không gửi trùng, chỉ coi ok khi lệnh gửi ok) với MỘT mục tiêu "FX_BUS".
    // Đã cấu hình = chế độ "explicit" của ActionRegistry (đã lưu ÍT NHẤT một trong FX_ON/FX_OFF). Chưa cấu hình => managed() rỗng => NOT_CONFIGURED
    // (Auto KHÔNG âm thầm rơi sang Send/MONITOR_FX). Thiếu riêng chiều đích (vd có FX_ON, thiếu FX_OFF) => setDawControlState trả NOT_CONFIGURED, không gửi toggle.
    const busGroup = AudioSource.createFxSendGroup({
        actions: ["FX_BUS"],
        legacyAction: "FX_BUS_NO_LEGACY",
        timeoutMs: 5000,
        isConfigured: (n) => n === "FX_BUS" && AR0()?.getDawStateMode?.("FX") === "explicit",
        execute: async (n, target) => {
            const AR = AR0(); if (!AR?.setDawControlState) return { ok: false, reason: "NO_ACTION_REGISTRY" };
            return AR.setDawControlState("FX", !!target, { reason: "fx-auto" });
        },
    });
    busGroup.seed(!!fxBtn?.classList.contains("active"));
    window.__fxBusGroup = busGroup;
    // AI-FIX-06 — TÁCH 3 trạng thái: (1) YÊU CẦU (nút FX sáng/tắt theo nhạc nền ngay khi chuyển trạng thái được xác nhận),
    // (2) ĐÃ GỬI (group.aggregate(), dùng để quyết định gửi/không gửi lại), (3) DAW ĐÃ XÁC NHẬN (KHÔNG tồn tại: không có feedback).
    // Trước đây nút chỉ sáng khi gửi MIDI thành công => chưa cấu hình Send / MIDI lỗi => nút KHÔNG BAO GIỜ sáng và không có dấu vết nào.
    // Trạng thái đồng bộ hiện ở tooltip (title) + data-fx-sync của nút (không đổi HTML/CSS); chuyển trạng thái được ghi vào log telemetry.
    // MENU-FX-FIX: văn bản Send tách khỏi "ai đang điều khiển" để cả Auto lẫn thủ công đều hiện đúng trạng thái Send thật.
    const sendText = (info) => {
        // Đường đang hiển thị: lần bấm tay gần nhất đi đường Send cũ (chưa cấu hình FX ON/OFF) => văn bản Send; còn lại (Auto, hoặc bấm tay đi FX ON/OFF) => văn bản FX bus.
        const viaSend = info.manualOverride && window.__fxLastManualVia === "send";
        const lr = info.lastResult;
        if (viaSend) {
            if (info.pending) return "đang gửi lệnh Send — CHƯA có phản hồi, chưa đồng bộ";
            if (!lr) return null;
            if (lr.ok) return "đã GỬI lệnh Send Reverb/Delay — DAW chưa xác nhận (không có phản hồi)";
            if (lr.reason === "NOT_CONFIGURED") return "CHƯA cấu hình Send Reverb/Delay trong Setup — DAW KHÔNG nhận lệnh";
            if (lr.reason === "TIMEOUT") return "lệnh Send KHÔNG phản hồi (hết thời gian) — DAW có thể chưa đồng bộ";
            return "gửi lệnh Send LỖI" + (lr.partial ? " một phần" : "") + " — DAW có thể chưa đồng bộ";
        }
        if (info.pending) return "đang gửi lệnh FX ON/OFF (mute 4 bus) — CHƯA có phản hồi";
        if (!lr) return null;
        if (lr.ok) return window.__dawStateLast?.FX?.text || "đã GỬI lệnh FX ON/OFF (mute 4 bus) — DAW chưa xác nhận";
        if (lr.reason === "NOT_CONFIGURED") return "CHƯA cấu hình FX ON/OFF (mute 4 bus) trong Setup — DAW KHÔNG nhận lệnh (FX Auto không dùng Send)";
        if (lr.reason === "TIMEOUT") return "lệnh FX ON/OFF KHÔNG phản hồi (hết thời gian) — DAW có thể chưa đồng bộ";
        return "gửi lệnh FX ON/OFF LỖI" + (lr.partial ? " một phần" : "") + " — DAW KHÔNG nhận lệnh";
    };
    const syncText = (info) => {
        const st = sendText(info);
        if (info.manualOverride) return "FX THỦ CÔNG (Auto nhường quyền " + Math.round(AudioSource.FX_AUTO_DEFAULTS.manualHoldMs / 1000) + " s kể từ lần bấm) — " + (st || "chưa có kết quả gửi");
        if (info.musicState === "SOURCE_UNAVAILABLE") return "FX Auto: nguồn nhạc (SYSTEM_AUDIO) không khả dụng — giữ nguyên trạng thái" + (st ? " — " + st : " (trạng thái nút = mặc định lúc mở/yêu cầu; Send DAW CHƯA được xác nhận)");
        return "FX Auto: " + (st || "đang theo dõi nhạc nền");
    };
    const syncKey = (info) => info.pending ? "pending" : (info.lastResult ? (info.lastResult.ok ? "sent-unconfirmed" : (info.lastResult.reason === "NOT_CONFIGURED" ? "not-configured" : (info.lastResult.reason === "TIMEOUT" ? "timeout" : "failed"))) : "idle");
    let __lastFxLogKey = "";
    const ctl = AudioSource.createFxAutoController({
        getFxState: () => busGroup.aggregate(),
        isEnabled: () => getSetting("fxAutoEnabled", true) !== false, // FX-AUTO-TOGGLE-02: ô tích chuột phải FX
        onRequest: (target) => { if (getSetting("fxAutoEnabled", true) !== false) { fxBtn?.classList.toggle("active", !!target); } }, // BUTTON-RESET: Auto FX KHÔNG lưu trạng thái nút FX
        applyFx: async (target) => {
            if (getSetting("fxAutoEnabled", true) === false) return { ok: false, reason: "DISABLED" };
            const res = await busGroup.apply(target);
            if (!(res && res.ok)) console.warn("[FX-AUTO] Gửi lệnh FX ON/OFF (mute 4 bus) thất bại/chưa cấu hình — nút giữ trạng thái YÊU CẦU, DAW có thể chưa đồng bộ:", res);
            return res;
        },
        // MENU-FX-AUTO-OFF: ghi mức dBFS thực (min/avg/max ~1 s, số khung im lặng số 0) mỗi 30 s để lần test thật sau có số liệu hiệu chuẩn ngưỡng.
        onDiag: (info) => { window.electronAPI?.sendTelemetry?.({ event: "FX_AUTO_DIAG", musicState: info.musicState, levelStats: info.levelStats, msSinceFrame: info.msSinceFrame, visibility: (typeof document !== "undefined" ? document.visibilityState : null), framesSeen: info.framesSeen, fxOn: !!fxBtn?.classList.contains("active"), timestamp: Date.now() }); },
        onState: (info) => {
            window.__fxAutoInfo = info;
            if (fxBtn) { fxBtn.title = syncText(info); fxBtn.dataset.fxSync = syncKey(info); fxBtn.dataset.fxControl = info.manualOverride ? "manual" : "auto"; }
            const k = `${info.musicState}|${info.actionState}|${info.fxTarget}|${info.pending ? "pending" : ""}|${info.lastResult ? info.lastResult.ok + ":" + info.lastResult.reason : ""}`;
            if (k !== __lastFxLogKey) { __lastFxLogKey = k; window.electronAPI?.sendTelemetry?.({ event: "FX_AUTO", musicState: info.musicState, actionState: info.actionState, target: info.fxTarget, lastResult: info.lastResult, lastDbfs: info.lastDbfs, levelStats: info.levelStats, msSinceFrame: info.msSinceFrame, framesSeen: info.framesSeen, timestamp: Date.now() }); }
        },
    });
    window.__fxAuto = ctl;
    // MENU-FX-FIX: đường điều khiển THỦ CÔNG duy nhất của nút FX (xem click handler): báo yêu cầu -> gửi -> báo kết quả THẬT cho bộ điều khiển.
    window.__fxManualToggle = async (target) => {
        ctl.notifyManual(!!target); const seq = ctl.getManualSeq();
        let res;
        try {
            // MIDI-DAW-CONTROL-01 — FX ON/OFF (mute 4 bus) đã cấu hình => CHỈ gửi lệnh đó cho cú bấm này (không gửi thêm Send/toggle cũ,
            // không đụng nhóm Send của FX Auto). Mốc 60 s "Auto nhường quyền" (notifyManual) giữ nguyên như trước.
            if (AR0()?.getDawStateMode?.("FX") === "explicit") {
                window.__fxLastManualVia = "daw-state";
                res = await AR0().setDawControlState("FX", !!target, { reason: "menu-button" });
                if (res && res.ok) busGroup.markSent("FX_BUS", !!target); // trạng thái "đã GỬI" để Auto tiếp quản sau 60 s không gửi trùng/ngược (chưa phải xác nhận DAW)
                if (fxBtn) { fxBtn.title = res.text || ""; fxBtn.dataset.dawSync = res.ok ? "sent-unconfirmed" : (res.reason === "NOT_CONFIGURED" ? "not-configured" : "failed"); }
                ctl.reportManualResult(res, seq);
                return res;
            }
            window.__fxLastManualVia = "send";
            if (group.managed().some((n) => n !== "MONITOR_FX")) res = await group.apply(!!target, { force: true });
            else {
                const AR = AR0();
                res = AR?.executeAction ? await AR.executeAction(AR.ACTIONS.MONITOR_FX, { reason: "menu-button" }) : { ok: false, reason: "NO_ACTION_REGISTRY" };
                if (res && res.ok) group.markSent("MONITOR_FX", !!target);
            }
        } catch (err) { res = { ok: false, error: String(err) }; }
        if (!(res && res.ok)) console.warn("[FX] Bấm tay: Send chưa gửi được/chưa cấu hình — nút giữ trạng thái YÊU CẦU, DAW chưa đồng bộ:", res);
        ctl.reportManualResult(res, seq);
        return res;
    };
    window.__fxAutoDebug = () => Object.assign({}, ctl.getInfo(), { sends: group.getSent(), managed: group.managed(), bus: busGroup.getSent(), busManaged: busGroup.managed(), params: ctl.params });
    setInterval(() => { ctl.tick(); }, 100); // FX-AUTO-TOGGLE-02: luôn theo dõi nhạc; có gửi lệnh hay không do isEnabled (ô tích) quyết định // ĐÚNG 1 interval cho cả vòng đời trang
    return ctl;
}
createFxAutoWiring();

/* ==========================================================
   5. PLAY BUTTONS (Logic chuyển đổi PLAY/PLAYING)
   ========================================================== */
const PRESET_SOUND_BTN_TO_ACTION = { clapPlayBtn: "CLAP", laughPlayBtn: "LAUGH" };
// TASK A20 — giờ ĐÃ có Internal Audio Backend thật (SoundEffectEngine, khai báo đầu file).
// Class "active" của nút KHÔNG còn tự toggle mù theo click nữa — nó được điều khiển bởi
// SoundEffectEngine.onChange() bên dưới, để LUÔN phản ánh đúng trạng thái audio thật, kể
// cả khi audio tự kết thúc (event 'ended') mà không có click nào xảy ra (đúng mục 2/3:
// "ended -> UI trở về IDLE" phải tự xảy ra, không chờ user bấm lại).
SoundEffectEngine.onChange((effectId, isPlaying) => {
    if (effectId !== "CLAP" && effectId !== "LAUGH") return; // hiệu ứng thư viện (LIB:...) không có nút trong menu
    const btnId = effectId === "CLAP" ? "clapPlayBtn" : "laughPlayBtn";
    document.getElementById(btnId)?.classList.toggle("active", isPlaying);
});
["clapPlayBtn", "laughPlayBtn"].forEach(id => {
    const btn = document.getElementById(id);
    // UI Final v1.0: nút đã chuyển lên hàng Preset với nhãn cố định (CLAP/LAUGH).
    // TASK A20: click -> SoundEffectEngine.toggle() phát/dừng file built-in NGAY LẬP TỨC,
    // không qua MIDI/DAW/PluginController (đúng mục 5/7). Giữ SONG SONG lời gọi
    // executeAction() đã có từ trước (Mục 16/19, actionRegistry.js) — đây là 1 kênh
    // MIDI-mapping TÙY CHỌN, ĐỘC LẬP với việc phát âm thanh, mặc định NOT_CONFIGURED trừ
    // khi user tự MIDI Learn trong Setup; không rollback/không sửa hệ thống MIDI/DAW mapping
    // đã khai báo trước đó (đúng ràng buộc mục 7 "không đụng hệ thống khác").
    btn?.addEventListener("click", () => {
        const actionName = PRESET_SOUND_BTN_TO_ACTION[id];
        SoundEffectEngine.toggle(actionName);
        if (actionName && window.ActionRegistry?.executeAction) {
            window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "menu-button" })
                .catch(err => console.error(`[MenuControl] ${actionName} lỗi:`, err));
        }
    });
});

// Bảng Hiệu Ứng ĐỘC LẬP là cửa sổ riêng (app/EffectsWindow.js, ui/effects.html) nên không gọi trực
// tiếp được SoundEffectEngine ở đây: nút bấm gửi IPC "effects-play" qua main, về lại đây. Xử lý GIỐNG
// HỆT nút CLAP/LAUGH cũ ở trên (toggle phát/dừng + executeAction MIDI tuỳ chọn). Âm lượng do knob
// "Hiệu Ứng" quyết định (SoundEffectEngine.setVolume("ALL", ...)).
window.electronAPI?.onEffectsPlay?.((effectId) => {
    if (effectId !== "CLAP" && effectId !== "LAUGH") return;
    SoundEffectEngine.toggle(effectId);
    if (window.ActionRegistry?.executeAction) {
        window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[effectId], { reason: "menu-button" })
            .catch(err => console.error(`[MenuControl] ${effectId} lỗi:`, err));
    }
});

// Thư viện hiệu ứng: danh sách nút lấy từ main (đổi trong Cài đặt -> "effects-lib-changed" tự cập nhật).
// Nút trong Bảng Hiệu Ứng gửi id qua main, về đây phát/dừng bằng cùng SoundEffectEngine (âm lượng = knob "Hiệu Ứng").
window.electronAPI?.getEffectsLibrary?.()
    .then((r) => { if (r && r.ok) SoundEffectEngine.loadLibrary(r.items); })
    .catch((err) => console.error("getEffectsLibrary lỗi:", err));
window.electronAPI?.onEffectsLibChanged?.((items) => SoundEffectEngine.loadLibrary(items));
// Bấm hiệu ứng KHÁC khi đang có hiệu ứng chạy -> tắt ngay hiệu ứng cũ rồi chạy hiệu ứng mới. Bấm lại đúng nút đang chạy -> dừng.
window.electronAPI?.onEffectsLibPlay?.((id) => {
    if (typeof id !== "string") return;
    SoundEffectEngine.stopAll("LIB:" + id);
    SoundEffectEngine.toggle("LIB:" + id);
});
window.electronAPI?.onEffectsLibStop?.(() => SoundEffectEngine.stopAll());

/* ==========================================================
   5b. EXPAND / COLLAPSE CONTROL PANEL (UI Final v1.0)
   Thao tác DOM/CSS + gọi IPC resize-window có sẵn (preload.js:
   electronAPI.resizeWindow) để cửa sổ THẬT tự co/giãn theo đúng
   nội dung — không đổi EventBus, không đụng AI/Key/BPM/Mod Engine.
   ========================================================== */
(function () {
    const expandBtn = document.getElementById("expandBtn");
    const panel = document.getElementById("controlPanel");
    if (!expandBtn || !panel) return;

    const AUTO_COLLAPSE_MS = 20000; // 20s — theo yêu cầu người dùng (Task: auto-collapse timing update)
    let collapseTimer = null;

    // Co/giãn cửa sổ THẬT (Electron BrowserWindow) khớp đúng chiều cao nội dung
    // thực tế (.app), dùng kênh IPC "resize-window" đã có sẵn ở app/main.js +
    // app/preload.js (electronAPI.resizeWindow) nhưng trước đây chưa được gọi.
    function syncWindowHeight() {
        if (!window.electronAPI || typeof window.electronAPI.resizeWindow !== "function") return;
        const appEl = document.querySelector(".app");
        if (!appEl) return;
        const height = Math.ceil(appEl.getBoundingClientRect().height);
        if (height > 0) window.electronAPI.resizeWindow(height);
    }

    function setLabel(expanded) {
        const textSpan = expandBtn.querySelector(".text");
        const iconSpan = expandBtn.querySelector(".icon");
        if (textSpan) textSpan.textContent = expanded ? "COLLAPSE" : "EXPAND";
        if (iconSpan) iconSpan.textContent = expanded ? "▴" : "▾";
    }

    function clearCollapseTimer() {
        if (collapseTimer) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
        }
    }

    function scheduleAutoCollapse() {
        clearCollapseTimer();
        collapseTimer = setTimeout(collapsePanel, AUTO_COLLAPSE_MS);
    }

    function expandPanel() {
        panel.classList.add("expanded");
        syncWindowHeight(); // display:grid đã áp dụng ngay, đo được chiều cao mới luôn
        // Thêm class "show" ở frame kế tiếp để CSS transition (opacity/translateY) chạy mượt — chỉ là animation.
        requestAnimationFrame(() => panel.classList.add("show"));
        expandBtn.classList.add("active");
        expandBtn.setAttribute("aria-expanded", "true");
        setLabel(true);
        scheduleAutoCollapse();
    }

    function collapsePanel() {
        panel.classList.remove("show");
        expandBtn.classList.remove("active");
        expandBtn.setAttribute("aria-expanded", "false");
        setLabel(false);
        clearCollapseTimer();
        // Đợi hiệu ứng mờ dần (200ms, khớp CSS transition — Mục XIV: Collapse ≈200ms) xong mới display:none.
        setTimeout(() => {
            panel.classList.remove("expanded");
            syncWindowHeight(); // co cửa sổ lại đúng chiều cao thu gọn, hết khoảng trống thừa
        }, 200);
    }

    expandBtn.addEventListener("click", () => {
        if (panel.classList.contains("expanded")) {
            collapsePanel();
        } else {
            expandPanel();
        }
    });

    // Bất kỳ thao tác nào trong Control (bấm, kéo knob, đổi select...) reset lại giờ tự Collapse
    ["mousedown", "click", "input", "change"].forEach(evt => {
        panel.addEventListener(evt, () => {
            if (panel.classList.contains("expanded")) scheduleAutoCollapse();
        });
    });

    // Đồng bộ chiều cao cửa sổ ngay khi tải trang xong (trạng thái mặc định = thu gọn)
    // để cửa sổ không còn to hơn nội dung như trước.
    requestAnimationFrame(syncWindowHeight);
})();

/* ==========================================================
   6. KNOB LOGIC (Xử lý vòng xoay & LED)
   ========================================================== */
const knobData = [
    { id: "retune1", valueId: "retune1Value", value: 20, defaultValue: 20 },
    { id: "retune2", valueId: "retune2Value", value: 20, defaultValue: 20 },
    { id: "musicKnob", valueId: "musicValue", value: 90, defaultValue: 90 },
    { id: "masterKnob", valueId: "masterValue", value: 90, defaultValue: 90 },
    { id: "clapKnob", valueId: "clapValue", value: 40, defaultValue: 40 },
    { id: "laughKnob", valueId: "laughValue", value: 40, defaultValue: 40 },
    // Knob "Hiệu Ứng" (index.html: #fxSoundVolKnob) = âm lượng CHUNG của cả Bảng Hiệu Ứng độc lập.
    { id: "fxSoundVolKnob", valueId: "fxSoundVolValue", value: 50, defaultValue: 50 },
    // MIC-VOLUME-KNOB-01 — âm lượng track Mic / Không Dây. Núm KHÔNG có sẵn trong index.html: được tạo bằng JS (initMicVolumePopups)
    // và chỉ hiện khi bấm CHUỘT PHẢI vào nút MIC 1 / MIC 2. Mặc định 90 = 0 dB (cùng đường cong fader Beat).
    // FX-BUS-KNOB-01 — Knob "FX" (index.html: #fxMasterKnob) = cộng/trừ volume 4 bus hiệu ứng trong DAW. 50 = giữ mức gốc.
    { id: "fxMasterKnob", valueId: "fxMasterValue", value: 50, defaultValue: 50 },
    { id: "mic1VolKnob", valueId: "mic1VolValue", value: 90, defaultValue: 90 },
    { id: "mic2VolKnob", valueId: "mic2VolValue", value: 90, defaultValue: 90 },
    // A96 — knob AUDIO CHILL (popup chuột phải MUSIC): 1 tham số VST qua MIDI, độc lập với nút AUDIO CHILL ON/OFF. Mặc định 50.
    { id: "audioChillKnob", valueId: "audioChillValue", value: 50, defaultValue: 50 }
];

// TASK A20 — clapKnob/laughKnob đi tới Internal Audio Backend (SoundEffectEngine), KHÔNG
// qua ActionRegistry/MIDI (KNOB_ID_TO_ACTION bên dưới CỐ TÌNH KHÔNG có 2 knob này — giữ
// nguyên, không đụng). Khai báo ở top-level (không phải trong closure DOMContentLoaded)
// để cả dispatchKnobVolume() lẫn loadData() đều dùng chung được 1 map duy nhất.
const KNOB_ID_TO_SOUND_EFFECT = Object.freeze({
    clapKnob: "CLAP",
    laughKnob: "LAUGH",
    fxSoundVolKnob: "ALL" // "ALL" = mọi hiệu ứng trong Bảng Hiệu Ứng (xem SoundEffectEngine.setVolume)
});

function updateKnob(k) {
    const knob = document.getElementById(k.id);
    const valEl = document.getElementById(k.valueId);
    if (!knob) return;
    if (valEl) valEl.textContent = k.value;
    const angle = -135 + (k.value / 100) * 270;
    knob.querySelector(".pointer").style.transform = `translateX(-50%) rotate(${angle}deg)`;
    const led = knob.querySelector(".led-active");
    if (led) led.style.background = `conic-gradient(#13dfff 0deg, #13dfff ${(k.value / 100) * 270}deg, transparent 0deg)`;
}

const modPowerBtn = document.getElementById("modPowerBtn");
const toneSelector = document.getElementById("toneSelector");
const applyToneBtn = document.getElementById("applyToneBtn"); // tham chiếu 1 lần để toggle disabled đồng bộ (Mục VI)

if (modPowerBtn) {
    modPowerBtn.classList.remove("active");
    modPowerBtn.textContent = "OFF";
}

if (toneSelector) {
    toneSelector.value = "0";
    toneSelector.disabled = true; // Mục VI: MOD OFF -> Dropdown disabled
}
if (applyToneBtn) {
    applyToneBtn.disabled = true; // Mục VI: MOD OFF -> SET disabled
}

// TASK MANUAL-KEY-MOD-RESTORE-01 — danh sách lựa chọn Tone (+10…-10) và Key (24 Key) đã bị mất khỏi index.html
// (commit a9776ef ghi đè cả file, chỉ còn 3 mục). KHÔNG sửa HTML (yêu cầu của Khói) -> khôi phục bằng JS,
// đúng thứ tự/nhãn của bản gốc. Idempotent: chỉ nạp lại khi danh sách đang thiếu; giữ nguyên giá trị đang chọn.
const MANUAL_TONE_VALUES = ["+10", "+9", "+8", "+7", "+6", "+5", "+4", "+3", "+2", "+1", "0", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "-9", "-10"];
const MANUAL_KEY_VALUES = [
    "AI Key Detect",
    "C Major", "Db Major", "D Major", "Eb Major", "E Major", "F Major", "F# Major", "G Major", "Ab Major", "A Major", "Bb Major", "B Major",
    "C Minor", "C# Minor", "D Minor", "Eb Minor", "E Minor", "F Minor", "F# Minor", "G Minor", "G# Minor", "A Minor", "Bb Minor", "B Minor",
];
function restoreSelectOptions(selectEl, values) {
    if (!selectEl || !selectEl.options) return;
    const have = Array.from(selectEl.options).map((o) => o.value);
    if (have.length === values.length && values.every((v, i) => have[i] === v)) return; // đã đủ -> không đụng
    const keep = selectEl.value;
    while (selectEl.options.length) selectEl.remove(0);
    values.forEach((v) => selectEl.add(new Option(v, v)));
    selectEl.value = values.includes(keep) ? keep : values[0];
}
restoreSelectOptions(toneSelector, MANUAL_TONE_VALUES);
if (toneSelector) toneSelector.value = "0";

// Trạng thái Tone THỦ CÔNG (chỉ có nghĩa khi MOD ON): manualToneOffset = độ lệch tuyệt đối so với Key gốc đã yêu cầu ở lần SET
// gần nhất; manualToneSet = đã SET ít nhất 1 lần trong phiên MOD ON này; soundShifterApplied = tổng bán cung đã gửi cho SoundShifter.
let manualToneOffset = 0;
let manualToneSet = false;
let soundShifterApplied = 0;
let manualToneChain = Promise.resolve(); // tuần tự hoá các lần SET bấm liên tiếp
// MOD theo đoạn Key Server (Claude C): kế hoạch "phút - tone" của bài đang phát (null = bài không có đoạn / chưa có). Xem mục 12.
let __serverTimelinePlan = null;
let __serverTimelineNextIdx = 0;   // lần đổi tone sắp tới (chỉ số trong plan.changes); = changes.length khi đã qua hết
let __serverTimelinePending = null; // sự kiện đến lúc MOD tay đang bật: giữ lại, áp khi tắt MOD tay

/* ==========================================================
   7. KEY TRANSPOSE (hỗ trợ cả dấu thăng # và dấu giáng b)
   ========================================================== */
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Bảng quy đổi các nốt giáng (Db, Eb, Ab, Bb...) về nốt thăng tương ứng
const flatToSharp = {
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#"
};

// === Control Source (LEGACY_CONTROL / AI_CONTROL) — lấy 1 lần lúc khởi động từ Core
// (core/shared/ControlSource.js, qua IPC) để quyết định applyDetectedKey()/applyModEvent()
// có tự gửi lệnh xuống Plugin hay không. KHÔNG có giao diện nào để đổi lúc chạy — đổi ở
// core/shared/ControlSource.js. Mặc định LEGACY_CONTROL trong lúc chờ IPC trả lời, để hệ
// cũ không bao giờ vô tình bị tắt do lỗi/độ trễ IPC.
let controlSource = "LEGACY_CONTROL";

window.electronAPI?.getControlSource?.().then((mode) => {
    if (mode) controlSource = mode;
    console.log("[ControlSource] Đang ở chế độ:", controlSource);
}).catch((err) => console.warn("[ControlSource] Không lấy được, giữ mặc định LEGACY_CONTROL:", err));

function isAiControlActive() {
    return controlSource === "AI_CONTROL";
}

function transposeKey(currentKey, steps) {
    // Bắt cả nốt có dấu thăng (C#) lẫn dấu giáng (Db)
    const match = currentKey.match(/^([A-G](?:#|b)?)/);
    if (!match) return currentKey;

    let note = match[1];
    const type = currentKey.slice(note.length); // phần còn lại, ví dụ " Major" / " Minor"

    // Quy đổi nốt giáng về nốt thăng để tra cứu trong mảng notes
    const normalizedNote = flatToSharp[note] || note;

    let idx = notes.indexOf(normalizedNote);
    if (idx === -1) return currentKey; // an toàn: không nhận diện được nốt thì trả về nguyên bản

    const stepN = parseInt(steps, 10) || 0;
    let newIndex = (((idx + stepN) % 12) + 12) % 12; // đúng cho mọi số nguyên (kể cả < -12, > 12)

    return notes[newIndex] + type;
}

// Chuẩn hoá tên Key trước khi gửi xuống Auto-Tune: sendKeyToAutotune() (vocalCommandRouter.js) chỉ hiểu nốt thăng (C#, D#...);
// tên giáng (Db, Eb...) bị đọc nhầm thành "D", "E" -> sai Key. Chỉ đổi tên gửi đi, nhãn hiển thị vẫn là nhãn người dùng chọn.
function normalizeKeyForSend(keyName) {
    if (typeof keyName !== "string") return keyName;
    const m = keyName.match(/^([A-G]b)(.*)$/);
    return m && flatToSharp[m[1]] ? flatToSharp[m[1]] + m[2] : keyName;
}

// Chữ hiển thị trong ô Key: LISTENING khi AI chưa có kết quả thật; nếu đã SET Tone thủ công (MOD ON) thì hiện Key SAU khi dịch tone
// (phân biệt rõ Key gốc = originalKey/keySource, Tone dịch = manualToneOffset).
function displayKeyText(value, source) {
    if (source === "ai" && !keyEverDetected) return "LISTENING";
    if (manualToneSet && isManualOverrideActive()) return transposeKey(value, manualToneOffset);
    return value;
}

// Vẽ lại 3 ô MOD + ô Key theo Tone thủ công hiện hành (không gửi lệnh nào).
function renderManualToneDisplay(statusOverride) {
    const keyText = displayKeyText(getActiveKeyValue(), getActiveSourceName());
    const off = manualToneOffset;
    const modTimeEl = document.getElementById("modTime");
    const modStatusEl = document.getElementById("modStatus");
    const modTimelineEl = document.getElementById("modTimeline");
    if (currentKeyEl) currentKeyEl.textContent = keyText;
    if (modTimeEl) modTimeEl.textContent = "--:--";
    if (modStatusEl) modStatusEl.textContent = statusOverride || (keyText === "LISTENING" ? ((off > 0 ? "+" : "") + off + " SEMITONES") : keyText);
    if (modTimelineEl) modTimelineEl.textContent = (off > 0 ? "+" : "") + off + " SEMITONES";
}

document.getElementById("applyToneBtn")?.addEventListener("click", () => {
    const powerBtn = document.getElementById("modPowerBtn");
    if (!powerBtn || !powerBtn.classList.contains("active")) {
        return;
    }

    // Giá trị dropdown = độ lệch TUYỆT ĐỐI so với Key gốc (+3 nghĩa là Key gốc + 3 bán cung), KHÔNG phải "nhấn thêm 3 lần".
    // Mỗi lần SET chỉ gửi đúng phần CHÊNH so với tone đang áp (sendToneTarget lo Auto-Tune; SoundShifter tự tính bên dưới),
    // nên SET +1 rồi +2 rồi +3 = mỗi bước đúng 1 bán cung; SET lại cùng giá trị = không gửi gì.
    const toneVal = parseInt(document.getElementById("toneSelector")?.value ?? "0", 10) || 0;
    manualToneOffset = toneVal;
    manualToneSet = true;
    renderManualToneDisplay("Đang gửi...");
    setStatus("dot-mod", "pending"); // cam: đang gửi, chờ kết quả thực thi

    const run = () => Promise.all([
        sendToneTarget(toneVal),
        (async () => {
            const r = await sendToneStepToSoundShifter(toneVal - soundShifterApplied);
            if (r && r.ok) soundShifterApplied = toneVal;
            return r;
        })(),
    ]);
    manualToneChain = manualToneChain.then(run, run);
    manualToneChain.then(([autotuneResult, soundshifterResult]) => {
        if (manualToneOffset !== toneVal || !manualToneSet) return; // đã có lần SET mới hơn / MOD đã tắt -> kết quả cũ không được ghi đè hiển thị
        if (autotuneResult.ok && soundshifterResult.ok) {
            setStatus("dot-mod", "online"); // xanh: cả 2 plugin đã nhận lệnh thành công
            renderManualToneDisplay();
        } else {
            setStatus("dot-mod", "offline"); // đỏ: ít nhất 1 trong 2 plugin gửi lỗi
            const which = !autotuneResult.ok && !soundshifterResult.ok
                ? "Auto-Tune & SoundShifter"
                : (!autotuneResult.ok ? "Auto-Tune" : "SoundShifter");
            const modStatusEl = document.getElementById("modStatus");
            if (modStatusEl) modStatusEl.textContent = `⚠️ Lỗi gửi Mod (${which})`;
            if (!autotuneResult.ok) console.error("sendToneTarget (Auto-Tune) lỗi:", autotuneResult.detail);
            if (!soundshifterResult.ok) console.error("sendToneStepToSoundShifter lỗi:", soundshifterResult.detail);
        }
    });
});

/* ==========================================================
   7B. KEY SOURCE MANAGER — Manual Override > Song Database > AI Realtime
   ----------------------------------------------------------
   Lớp quản lý MỚI theo đúng thứ tự ưu tiên bắt buộc:
       Manual Override
              ↑
         Song Database
              ↑
       AI Realtime Detect

   KHÔNG đụng KeyEngine.js/ModEngine.js (logic dò AI thật), KHÔNG đụng
   cơ chế sendKeyToAutotune() (vẫn là hàm DUY NHẤT thật sự gửi xuống
   Plugin) — module này chỉ ĐIỀU PHỐI: nguồn nào đang có hiệu lực,
   khi nào áp dụng xuống Plugin, và bộ đếm 4 phút Manual Override.
   ========================================================== */
const MANUAL_OVERRIDE_DURATION_MS = 4 * 60 * 1000;

const aiKeyDetectLineEl = document.getElementById("aiKeyDetectLine");
const manualOverrideStatusEl = document.getElementById("manualOverrideStatus");

const keySource = {
    // REWRITE — Manual tách field rõ ràng selectedKey (preview, ghi mỗi lần đổi dropdown) vs
    // committedKey (chỉ ghi SAU KHI Auto-Tune xác nhận SEND thành công). Không dùng 1 field
    // "value" chung cho cả 2 ý nghĩa nữa (đúng yêu cầu boundary mới — xem báo cáo).
    manual: { active: false, selectedKey: null, committedKey: null, deadlineAt: null, tickHandle: null, sending: false }, // sending: lệnh SEND Manual đang bay (chưa xác nhận) — AI không được chen vào
    songDb: { active: false, value: null, bpm: null, title: null, artist: null },
    ai: { value: appState.originalKey, provisional: null }
};

// TASK AUTO-RELISTEN-01 — bấm AUTO DETECT khi bài đang dùng Key Database: AI nghe lại, và khi AI CHỐT xong
// thì Key AI được dùng cho bài HIỆN TẠI (Database không còn tuyệt đối). pending = đã bấm, chờ AI chốt;
// active = AI đang thay Database cho bài này. Tự xoá khi đổi bài / mất bài / Database miss.
// KHÔNG ghi gì lên Server (Key Server vẫn giữ nguyên Key cũ — xem điều kiện submitDetectedKey bên dưới).
const __dbBypass = { pending: false, active: false };
let __autoDetectInternal = false; // true khi CODE (không phải người dùng) gọi autoDetectBtn.click() lúc đổi bài
function __dbBypassClear() { __dbBypass.pending = false; __dbBypass.active = false; }
// TASK AUTO-DETECT-TRUST-01 — Auto Detect dò lại THẬT dù bài đang lấy Key từ Database; AI CHỈ chốt Key mới thay Database khi
// đáng tin hơn Database: Key AI KHÁC Key Database, độ tin cậy >= ngưỡng dưới (cao hơn ngưỡng khoá thường 0.80), và không phải cặp
// "láng giềng cách 5" (F <-> A#, dễ nhầm hợp âm át với nhà — cùng luật KEY-CORRECT-02). Không đạt -> giữ Key Database.
const AUTO_DETECT_DB_OVERRIDE_MIN_CONF = 0.85; // TẠM THỜI (đề xuất) — chỉnh theo log thật
function __aiBeatsDatabase(aiKey, aiConf, dbKey) {
    if (typeof aiKey !== "string" || typeof dbKey !== "string" || !dbKey) return { ok: false, why: "no-db-or-key" };
    if (aiKey === dbKey) return { ok: false, why: "same-as-db" };
    if (!Number.isFinite(aiConf) || aiConf < AUTO_DETECT_DB_OVERRIDE_MIN_CONF) return { ok: false, why: "low-confidence" };
    if (typeof __keyIsFifthNeighbor === "function" && __keyIsFifthNeighbor(aiKey, dbKey)) return { ok: false, why: "fifth-neighbor" };
    return { ok: true, why: "ai-more-trusted" };
}

let lastPluginKey = appState.originalKey; // giá trị THẬT đã gửi xuống Plugin lần gần nhất (chống gửi trùng)
// TASK AI-KEY-FAST-08 — chống gửi lại + log lặp khi Mouse Control TẮT (status "MOUSE_DISABLED"). KHÔNG có vòng retry nền: chỉ quyết định
// tại thời điểm applyActiveKeyToPlugin() được gọi. Phát hiện "bật lại" bằng cách ĐỌC LẠI đúng 2 setting mà sendKeyToAutotune() đọc
// (mouseControlEnabled, midiOutputPort) — chữ ký đổi => thử gửi lại ngay, không cần bài/Key đổi. Lỗi KHÁC MOUSE_DISABLED: giữ nguyên hành vi cũ.
// Chỉ áp cho đường AI/Database (applyActiveKeyToPlugin); nút SEND thủ công của người dùng giữ nguyên.
const __pluginMouseBlock = { active: false, sig: null, keys: {}, logged: false, episodes: 0, suppressedSends: 0, suppressedLogs: 0, recoveries: 0 };
function pluginMouseSig() { try { return typeof getSetting === "function" ? `${getSetting("mouseControlEnabled")}|${getSetting("midiOutputPort")}` : "n/a"; } catch (e) { return "err"; } }
function pluginSendShouldSkip(value) {
    const b = __pluginMouseBlock;
    if (!b.active) return false;
    // TASK MIDI-01 — nếu ĐÃ cấu hình cổng MIDI thì KHÔNG bỏ qua lần gửi: đường MIDI có thể hồi phục mà KHÔNG đổi setting nào (cắm lại cổng/loopMIDI
    // bật lại), nên phải thử lại mỗi lần như trước FAST-08. FAST-08 vẫn nuốt log lỗi lặp (pluginSendOutcome) trong cùng đợt lỗi.
    try { if (typeof getSetting === "function" && getSetting("midiOutputPort")) return false; } catch (e) {}
    if (b.sig !== pluginMouseSig()) { b.active = false; b.keys = {}; b.logged = false; b.recoveries++; return false; } // Mouse Control/MIDI đổi => cho gửi lại
    if (b.keys[value]) { b.suppressedSends++; return true; } // cùng Key đã thử trong đợt lỗi này
    return false; // Key mới: vẫn thử (hành vi cũ), nhưng log lỗi không lặp
}
// Trả true nếu NÊN nuốt console.error (chỉ với MOUSE_DISABLED lặp trong cùng đợt lỗi).
function pluginSendOutcome(value, result) {
    const b = __pluginMouseBlock;
    if (result && result.ok) { b.active = false; b.keys = {}; b.logged = false; return false; }
    if (result && result.status === "MOUSE_DISABLED") {
        if (!b.active) { b.active = true; b.sig = pluginMouseSig(); b.keys = {}; b.logged = false; b.episodes++; }
        b.keys[value] = true;
        if (b.logged) { b.suppressedLogs++; return true; }
        b.logged = true; return false;
    }
    b.active = false; b.keys = {}; b.logged = false; // lỗi khác: kết thúc đợt MOUSE_DISABLED, giữ log như cũ
    return false;
}
let lastNowPlayingKey = null;             // "<title>|<artist>" gần nhất, để tự phát hiện đổi bài (mục IX)

// TASK (Khói xác nhận cho phép sửa, 25/08/2026) — true SAU KHI đã có ít nhất 1 kết quả Key
// THẬT từ audio (KeyEngine.detectOnce khoá được). CHỈ dùng để quyết định CHỮ hiển thị
// ("LISTENING" hay giá trị thật) ở applyActiveKeyToPlugin()/refreshKeySourceDisplay() — không
// đụng gì tới keySource.ai.value/originalKey/lastPluginKey (vẫn giữ nguyên giá trị nhạc lý nội
// bộ hợp lệ, không có rủi ro gửi chuỗi "LISTENING" xuống Auto-Tune). autoDetectBtn (mục 13B)
// đặt lại về false để RESET hiển thị mỗi lần bấm Auto Detect.
let keyEverDetected = false;

// TASK A74-02 — AI STATE UI (đề xuất, xem A73-REPORT.md để Khói duyệt ngưỡng; KHÔI PHỤC lại ở
// A74 vì bị thất lạc trong lần reconcile B73 trước đó — không có trong baseline A74 nhận được).
// CHỈ điều khiển nhãn phụ trợ #aiSourceState (NO SOURCE/STARTING/NO SIGNAL/ANALYZING/ERROR) —
// KHÔNG đụng currentKey/currentBpm/sentinel "LISTENING" (Auto-Tune có kiểm tra chuỗi này).
const __aiState = { sysState: "NO_DEVICE", lastSignalTime: 0, hasConfirmed: false };
// Ngưỡng TẠM THỜI (đề xuất, CHƯA phải tiêu chuẩn chính thức, theo đúng mục A74-01 đề bài — giữ
// nguyên giá trị A73, KHÔNG tự đổi vì chưa có log thật để hiệu chỉnh lại).
const AI_NO_SIGNAL_TIMEOUT_MS_TENTATIVE = 3000;
const AI_SIGNAL_VU_FLOOR_TENTATIVE = 2;

function updateAiSourceStateLabel() {
    const el = document.getElementById("aiSourceState");
    if (!el) return;
    const s = __aiState;
    let text = "";
    if (s.sysState === "NO_DEVICE") text = "NO SOURCE";
    else if (s.sysState === "STARTING") text = "STARTING";
    else if (s.sysState === "ERROR") text = "ERROR";
    else if (s.sysState === "STOPPING") text = "STOPPED";
    else if (s.sysState === "RUNNING") {
        const noSignal = (Date.now() - s.lastSignalTime) > AI_NO_SIGNAL_TIMEOUT_MS_TENTATIVE;
        if (noSignal) text = "NO SIGNAL";
        else if (!s.hasConfirmed) text = "ANALYZING";
        else text = ""; // đã có kết quả xác nhận hiển thị ở #currentBpm/#currentKey rồi — khỏi lặp chữ
    }
    el.textContent = text;
}

function logKeySource(sourceLabel) {
    console.log(`[Key Source] ${sourceLabel}`);
}

// resolveActiveKey() / getActiveSourceName() / getActiveKeyValue() — CHỈ ĐỌC. Tuyệt đối không
// được thêm dòng ghi (mutate) nào vào 3 hàm này — đây là "Active Key Resolver", nhiệm vụ DUY
// NHẤT là xác định nguồn nào đang có quyền + giá trị tương ứng, không được copy Key giữa
// AI/Manual/Database qua lại dưới bất kỳ hình thức nào.
function getActiveSourceName() {
    if (keySource.manual.active) return "manual";
    if (keySource.songDb.active && !__dbBypass.active) return "songDb";
    return "ai";
}

function getActiveKeyValue() {
    if (keySource.manual.active) return keySource.manual.committedKey;
    if (keySource.songDb.active && !__dbBypass.active) return keySource.songDb.value;
    return keySource.ai.value;
}

// Alias tường minh theo đúng thuật ngữ task (resolver "READ only") — dùng chung logic ở trên,
// không tạo thêm state hay nhánh rẽ mới.
function resolveActiveKey() {
    return { source: getActiveSourceName(), key: getActiveKeyValue() };
}

// Key hiện CẠNH tên bài (header NOW PLAYING). CHỈ ĐỌC state Key Source — không ghi gì vào keySource.
//  - Manual / Database(Server) đang hiệu lực: hiện Key đó.
//  - AI: chỉ hiện khi AI đã CHỐT Key cho bài này (keyEverDetected); đang "LISTENING"/"đang dò..." thì không hiện,
//    để không hiện Key hạt giống nội bộ hay Key tạm chưa đáng tin.
function syncNowPlayingKeyText() {
    try {
        const source = getActiveSourceName();
        let key = null;
        if (source === "manual" || source === "songDb") key = getActiveKeyValue();
        else if (keyEverDetected) key = keySource.ai.value;
        window.AutoMenuAI?.setNowPlayingKey?.(typeof key === "string" ? key : "");
    } catch (e) { /* hiển thị phụ — không bao giờ được làm hỏng luồng Key */ }
}

function formatCountdownMMSS(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 1 hàm DUY NHẤT vẽ lại 2 dòng hiển thị mới trong card Key — tránh nhiều nơi tự
// set textContent lệch nhau. KHÔNG đụng #keyInfo (giữ nguyên hành vi/text hiện có).
function refreshKeySourceDisplay() {

    if (typeof syncNowPlayingKeyText === "function") syncNowPlayingKeyText(); // Key cạnh tên bài luôn theo Key đang áp dụng

    // UI Final v3.0 — Mục XII (ACTIVE SOURCE): 1 dòng badge duy nhất, đọc lại
    // getActiveSourceName() đã có sẵn (KHÔNG đổi hàm đó/logic chọn nguồn).
    // #keyInfo và #manualOverrideStatus vẫn được JS cập nhật như cũ bên dưới,
    // chỉ ẩn đi bằng CSS để tránh hiện nhiều dòng trạng thái cùng lúc.
    const activeSourceLabelEl = document.getElementById("activeSourceLabel");
    if (activeSourceLabelEl) {
        const labelMap = { manual: "MANUAL", songDb: "DATABASE", ai: "AI DETECT" };
        activeSourceLabelEl.textContent = "ACTIVE: " + (labelMap[getActiveSourceName()] || "AI DETECT")
            + ((getActiveSourceName() === "songDb" && keySource.songDb.value) ? " - " + keySource.songDb.value : ""); // AUTO-DETECT-TRUST-01: nguồn Database luôn hiện kèm Key -> ACTIVE: DATABASE - G Major
    }

    if (aiKeyDetectLineEl) {

        // Mục A ("Key tạm"): nếu có ước lượng tạm mới hơn giá trị ĐÃ KHOÁ -> hiện kèm nhãn
        // "đang dò" cho cảm giác tức thì. Giá trị thật dùng để gửi Plugin (keySource.ai.value)
        // KHÔNG đổi ở đây — chỉ đổi hiển thị.
        const showProvisional = keySource.ai.provisional && keySource.ai.provisional !== keySource.ai.value;
        // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — chưa có kết quả AI thật nào (kể cả
        // provisional) -> hiện LISTENING, không hiện giá trị hạt giống nội bộ.
        aiKeyDetectLineEl.textContent = (!keyEverDetected && !keySource.ai.provisional && getActiveSourceName() === "ai")
            ? "AI Detect: LISTENING"
            : showProvisional
                ? `AI Detect: ${keySource.ai.provisional} (đang dò...)`
                : `AI Detect: ${keySource.ai.value}`;

    }

    if (!manualOverrideStatusEl) return;

    if (keySource.manual.active) {

        const remainMs = keySource.manual.deadlineAt - Date.now();
        manualOverrideStatusEl.textContent = `Auto Detect · ${formatCountdownMMSS(remainMs)}`;

    } else {

        manualOverrideStatusEl.textContent = "AI Key Detect"; // đúng yêu cầu: KHÔNG hiện timer ở chế độ AI/Song Database

    }

}

// Áp dụng key của nguồn ĐANG có hiệu lực (theo đúng thứ tự ưu tiên) xuống Plugin + UI.
// KHÔNG gọi hàm này cho bước "xem trước" khi mới chọn Manual (chưa bấm SEND) — đó là
// hành vi riêng trong keySelector "change" bên dưới, đúng yêu cầu giữ nguyên Logic Send.
// A113/A114 — "Lõi AI" (Setup): 12 núm nối thật — aiCore.autoApply (mặc định BẬT = hành vi cũ), aiCore.debug, aiCore.threshold + aiCore.confidence (0..100, 50 = mặc định = KHÔNG đổi KeyEngine) + realtime/instant/speed (A116; mặc định BẬT/BẬT/medium = như cũ)
// (mặc định TẮT: chỉ tắt 3 dòng console debug tạm; aiDiag/file log KHÔNG đổi). Menu không tự đồng bộ appSettings
// với Setup, nên đọc lại file dùng chung (loadSettingsSync, chỉ đọc) tối đa 2 giây/lần. Lỗi => dùng mặc định.
const __AI_CORE_DEFAULT = { autoApply: true, debug: false, threshold: 50, confidence: 50, realtime: true, instant: true, speed: "medium", lockHold: true, predict: true, learn: false, memory: "default", autoKeyMode: false, autoKeyWait: 8 };
let __aiCoreCache = { t: 0, v: __AI_CORE_DEFAULT };
let __aiCoreTuned = null; // chữ ký tuning đã áp xuống KeyEngine lần cuối (null = chưa chỉnh gì)
const __AI_SPEED_SCALE = { fast: 0.6, medium: 1, slow: 1.6 }; // A116: Tốc độ phản ứng -> hệ số nhân thời gian chờ chốt Key
// A114 — vị trí thanh 0..100 (50 = mặc định = đúng giá trị gốc của KeyEngine) -> ngưỡng thật.
function __aiThresholdToMinConf(v) { v = Math.min(100, Math.max(0, v)); return v >= 50 ? 0.55 + (v - 50) / 50 * 0.15 : 0.55 - (50 - v) / 50 * 0.10; }  // 0.45 .. 0.55 .. 0.70
function __aiConfidenceToLock(v) { v = Math.min(100, Math.max(0, v)); return v >= 50 ? 0.80 + (v - 50) / 50 * 0.12 : 0.80 - (50 - v) / 50 * 0.10; }       // 0.70 .. 0.80 .. 0.92
function __aiCoreApplyTuning(v) {
    try {
        if (typeof KeyEngine === "undefined" || typeof KeyEngine.setTuning !== "function") return;
        const isDefault = v.threshold === 50 && v.confidence === 50 && v.instant === true && v.speed === "medium" && v.lockHold === true;
        const sig = isDefault ? "default" : [v.threshold, v.confidence, v.instant, v.speed, v.lockHold].join("|");
        if (sig === (__aiCoreTuned === null ? "default" : __aiCoreTuned)) return; // không đổi (hoặc vẫn mặc định) -> không đụng KeyEngine
        __aiCoreTuned = sig;
        const r = isDefault ? KeyEngine.setTuning(null) : KeyEngine.setTuning({ minConfidence: __aiThresholdToMinConf(v.threshold), lockConfidence: __aiConfidenceToLock(v.confidence), fastPath: v.instant, reactionScale: __AI_SPEED_SCALE[v.speed], holdLock: v.lockHold });
        console.log("[AI-Core] Đã áp tuning:", JSON.stringify(r));
    } catch (e) {}
}
function __aiCoreCfg() {
    const now = Date.now();
    if (now - __aiCoreCache.t < 2000) return __aiCoreCache.v;
    let v = __AI_CORE_DEFAULT;
    try {
        const st = window.electronAPI?.loadSettingsSync?.();
        const c = st && typeof st === "object" ? st.aiCore : null;
        if (c && typeof c === "object") {
            const n = (x) => (typeof x === "number" && isFinite(x) ? Math.round(Math.min(100, Math.max(0, x))) : 50);
            v = { autoApply: c.autoApply !== false, debug: c.debug === true, threshold: n(c.threshold), confidence: n(c.confidence), realtime: c.realtime !== false, instant: c.instant !== false, speed: (c.speed === "fast" || c.speed === "slow") ? c.speed : "medium", lockHold: c.lockHold !== false, predict: c.predict !== false, learn: c.learn === true, memory: (c.memory === "few" || c.memory === "many") ? c.memory : "default", autoKeyMode: false, autoKeyWait: 8 };
        }
        // A119: Chế độ Auto-Key (khoá riêng `autoKeyMode` = {enabled, waitSec}, không nằm trong aiCore)
        const ak = st && typeof st === "object" ? st.autoKeyMode : null;
        if (ak && typeof ak === "object" && ak.enabled === true) {
            const w = typeof ak.waitSec === "number" && isFinite(ak.waitSec) ? Math.min(60, Math.max(1, Math.round(ak.waitSec))) : 8;
            v = Object.assign({}, v, { autoKeyMode: true, autoKeyWait: w });
        }
    } catch (e) {}
    __aiCoreCache = { t: now, v };
    __aiCoreApplyTuning(v);
    return v;
}
try { setInterval(__aiCoreCfg, 2000); } catch (e) {} // A114: áp Ngưỡng/Độ tin cậy ngay cả khi Debug tắt

function applyActiveKeyToPlugin(sourceLabel) {

    const value = getActiveKeyValue();
    const source = getActiveSourceName();

    originalKey = value;
    // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — nguồn AI mà CHƯA có kết quả thật lần nào
    // -> hiển thị LISTENING, KHÔNG hiện giá trị hạt giống nội bộ (vd "G# Minor"). `value` vẫn
    // giữ nguyên (không đổi) cho các dòng bên dưới (sendKeyToAutotune/dedupe/originalKey) — CHỈ
    // chữ hiển thị bị thay, không có rủi ro gửi "LISTENING" xuống Plugin.
    const sendValue = typeof normalizeKeyForSend === "function" ? normalizeKeyForSend(value) : value; // tên giáng -> thăng cho sendKeyToAutotune (nhãn hiển thị giữ nguyên)
    if (currentKeyEl) currentKeyEl.textContent = (source === "songDb" && __dbBypass.pending) ? "LISTENING" : (typeof displayKeyText === "function" ? displayKeyText(value, source) : ((source === "ai" && !keyEverDetected) ? "LISTENING" : value)); // TASK AUTO-DETECT-TRUST-01: bấm Auto Detect trên bài Database -> ô Key về LISTENING trong lúc dò lại (Plugin vẫn dùng Key Database)
    // ===== QUY TẮC KIẾN TRÚC VĨNH VIỄN (đọc kỹ trước khi sửa vùng này) =====
    // AI Key và Manual Key là 2 nguồn điều khiển tách biệt hoàn toàn.
    // Khi AI (hoặc Song Database) đang active:
    //   - Dropdown Manual CHỈ được hiển thị nhãn mode "AI Key Detect", KHÔNG BAO GIỜ được gán
    //     giá trị Key thật (vd "G# Minor") vào keySelector.value.
    //   - Giá trị Key thật của AI tuyệt đối không được copy vào keySource.manual.selectedKey
    //     hay keySource.manual.committedKey dưới bất kỳ hình thức nào.
    //   - AI phải gửi Auto-Tune qua đường riêng (nhánh "ai" ngay bên dưới hàm này), không bao
    //     giờ được giả lập bằng cách gọi applyKeyBtn.click() hay Manual SEND.
    // "AI Key Detect" là NHÃN MODE của dropdown, không phải một giá trị Key.
    // ========================================================================
    // MANUAL-KEY-MOD-RESTORE-01: chỉ đặt nhãn mode khi người dùng KHÔNG đang giữ lựa chọn Key tay (selectedKey) — AI không được ghi đè lựa chọn của người dùng.
    if (keySelector && source !== "manual" && !keySource.manual?.selectedKey) keySelector.value = "AI Key Detect"; // KHÔNG gán key thật (mục 3/4/14/16)

    logKeySource(sourceLabel);
    refreshKeySourceDisplay();

    if (value === lastPluginKey) return; // giá trị không đổi thật -> khỏi gửi lại, tránh spam Plugin
    if (sendValue === lastPluginKey) return; // cùng Key nhưng khác cách viết (Db = C#): lastPluginKey lưu dạng đã chuẩn hoá

    if (source === "ai" && isAiControlActive()) {

        // AI_CONTROL: renderer KHÔNG tự gửi lệnh AI xuống Plugin nữa (giữ NGUYÊN hành vi cũ) —
        // Workflow -> PluginController -> Bridge lo phần gửi thật (xem onPluginCommand cuối file).
        console.log("[ControlSource] AI_CONTROL — bỏ qua gửi Key trực tiếp, chờ Bridge từ Core.");
        setStatus("dot-key", "online");
        lastPluginKey = sendValue;
        return;

    }

    if (source === "ai" && typeof __aiCoreCfg === "function" && !__aiCoreCfg().autoApply) { // A113: Setup > Lõi AI > "Tự áp dụng" TẮT -> hiển thị Key nhưng KHÔNG tự gửi Plugin (không ghi lastPluginKey => bật lại là gửi)
        console.log("[AI-Core] Tự áp dụng TẮT — không gửi Key AI xuống Plugin.");
        return;
    }
    if (source === "ai" && typeof __aiCoreCfg === "function" && __aiCoreCfg().autoKeyMode) { // A119: Chế độ Auto-Key BẬT -> plugin Auto-Key tự dò + tự gửi Auto-Tune; Menu CHỈ hiển thị Key AI, không gửi Key AI (tránh đè nhau)
        console.log("[Auto-Key] Chế độ Auto-Key BẬT — Menu không gửi Key AI xuống Auto-Tune (Key AI chỉ để hiển thị).");
        return;
    }

    if (typeof pluginSendShouldSkip === "function" && pluginSendShouldSkip(value)) return; // TASK AI-KEY-FAST-08: MOUSE_DISABLED cùng Key, setting chưa đổi

    setStatus("dot-key", "pending");

    // TASK MIDI-01 — correlation ID cho 1 lần áp dụng Key (đọc bởi midiDiag trong appSettings.js); AI_KEY_READY ≠ MIDI_SEND_ATTEMPTED.
    try { window.__midiCorrelation = { id: `k${Date.now().toString(36)}-${(window.__midiCorrSeq = (window.__midiCorrSeq || 0) + 1)}`, key: value, caller: sourceLabel || null };
          if (typeof midiDiag === "function") midiDiag("AI_KEY_READY", { key: value, caller: sourceLabel || null }); } catch (e) {}
    sendKeyToAutotune(sendValue).then((result) => {

        if (typeof aiRecordPluginSend === "function") aiRecordPluginSend(value, result, sourceLabel); // TASK AI-KEY-FAST-07 (chỉ đếm/log)
        try { if (typeof midiDiag === "function") midiDiag("PLUGIN_SEND_RESULT", { key: value, ok: !!result.ok, driver: result.driverUsed || null, status: result.status || null, midi: result.midi || null, confirmation: result.confirmation || null }); } catch (e) {}
        if (result.ok) {
            if (typeof pluginSendOutcome === "function") pluginSendOutcome(value, result);
            setStatus("dot-key", "online");
            lastPluginKey = sendValue;
        } else {
            setStatus("dot-key", "offline");
            if (!(typeof pluginSendOutcome === "function" && pluginSendOutcome(value, result))) console.error("sendKeyToAutotune lỗi:", result.detail);
        }

        refreshKeySourceDisplay();

    });

}

function cancelManualOverride() {

    if (keySource.manual.tickHandle) {
        clearInterval(keySource.manual.tickHandle);
        keySource.manual.tickHandle = null;
    }

    const wasActive = keySource.manual.active;
    keySource.manual.active = false;
    keySource.manual.deadlineAt = null;

    if (wasActive) console.log("[Manual Override] OFF");
    if (wasActive) reportManualStateSnapshot(); // TASK B3-C — Manual Key vừa TẮT thật, báo Core ngay (chỉ khi thực sự đổi, không gọi thừa)

}

// Gọi ngay sau khi SEND gửi Manual Key thành công xuống Plugin.
function startManualOverrideCountdown() {

    if (keySource.manual.tickHandle) clearInterval(keySource.manual.tickHandle);

    keySource.manual.deadlineAt = Date.now() + MANUAL_OVERRIDE_DURATION_MS;

    console.log("[Manual Override] ON");
    console.log(`[Manual Timer] ${formatCountdownMMSS(MANUAL_OVERRIDE_DURATION_MS)}`);

    keySource.manual.tickHandle = setInterval(() => {

        const remainMs = keySource.manual.deadlineAt - Date.now();

        if (remainMs <= 0) {

            console.log("[Manual Timer] Expired");
            cancelManualOverride();
            keySource.manual.selectedKey = null; // hết hạn Manual: nhả lựa chọn cũ để dropdown quay về "AI Key Detect" (không kẹt Key cũ)
            // Mục VII: Plugin tự nhận Key AI hiện tại, HOẶC quay về Song Database nếu đó đang
            // là nguồn hiện tại (không quay về Manual — Manual đã tắt hẳn).
            applyActiveKeyToPlugin(getActiveSourceName() === "songDb" ? "Song Database" : "AI Detect");
            return;

        }

        refreshKeySourceDisplay();

    }, 1000);

    refreshKeySourceDisplay();

}

// ---- Song Database (từ WindowsMediaSession/NowPlayingResolver qua IPC, xem mục 1C) ----

function onSongDatabaseMatch(song) {

    console.log("[NowPlaying] Database Match");

    keySource.songDb.active = true;
    keySource.songDb.value = song.key;
    keySource.songDb.bpm = song.bpm;
    keySource.songDb.title = song.title;
    keySource.songDb.artist = song.artist;

    if (!keySource.manual.active) {
        applyActiveKeyToPlugin("Song Database"); // Manual vẫn ưu tiên cao nhất -> không đè nếu đang Manual
    } else {
        refreshKeySourceDisplay();
    }

}

function onSongDatabaseMiss() {

    console.log("[NowPlaying] Database Miss");

    const wasActive = keySource.songDb.active;
    __dbBypassClear(); // TASK AUTO-RELISTEN-01
    keySource.songDb.active = false;
    keySource.songDb.value = null;

    if (wasActive && !keySource.manual.active) {
        applyActiveKeyToPlugin("AI Detect"); // Mục IV: không nhận diện được bài -> tự quay về Realtime FFT
    }

}

// Mục X: mất Now Playing (No Media/Unavailable) -> Song Database OFF, Realtime FFT ON.
// KHÔNG chủ động huỷ Manual — Manual vẫn giữ quyền ưu tiên cao nhất theo đúng mục I nếu
// người dùng đang chủ động điều khiển tay.
function onNowPlayingLost() {

    onSongDatabaseMiss();

}

// ==========================================================
// TASK AI-ALG-01-NOWPLAYING / AI-NOWPLAYING-OPT — NowPlaying đổi bài => TỰ chuyển KEY/BPM/MOD về
// LISTENING và dò lại, KHÔNG cần bấm AUTO DETECT. NowPlaying CHỈ là tín hiệu bắt đầu chu trình
// (không cung cấp Key/BPM). Tái dùng NGUYÊN chu trình AUTO DETECT (A75-06): reset chữ + stop/init
// BPM+Key trên nguồn SYSTEM_AUDIO đang chạy + ModEngine.stop() + triggerAiKeyDetect(). KHÔNG tạo
// pipeline thứ hai, KHÔNG mở MIC/thiết bị mới, KHÔNG đổi thuật toán/ngưỡng.
//  - __aiCycleGen: generation token, tăng mỗi lần đổi bài. Callback/timer của chu trình cũ so token
//    và tự bỏ nếu đã lỗi thời (kết quả bài trước đến muộn không ghi đè bài mới).
//  - __npLastSongKey: bài (khác rỗng) gần nhất đã khởi động chu trình -> sự kiện lặp cùng bài KHÔNG
//    khởi động lại; A->B->A vẫn khởi động mỗi lần vì key đổi.
//  - metadata rỗng thoáng qua: chỉ coi là "mất bài" sau NOWPLAYING_EMPTY_GRACE_MS_TENTATIVE (TẠM
//    THỜI, chưa hiệu chuẩn); quay lại đúng bài cũ trong khoảng đó = cùng bài, không dò lại.
// ==========================================================
let __aiCycleGen = 0;
let __npLastSongKey = null;
let __npEmptyTimer = null;
const NOWPLAYING_EMPTY_GRACE_MS_TENTATIVE = 5000;

// TASK AI-NOWPLAYING-OPT-02 — LOG CHẨN ĐOÁN tối thiểu (chỉ ghi log + bộ đếm; KHÔNG đổi thuật toán,
// thứ tự gọi hay âm thanh). Gắn mã chu trình (gen) + tên bài vào mọi dòng để phân biệt kết quả giữa
// các bài. Xem tổng hợp bằng DevTools: __aiDiagReport(). Tắt: setSetting("aiDiagLogEnabled", false).
const __aiDiagState = { t0: null, song: null, cur: null, history: [] };
function aiDiag(event, extra) {
    try {
        const enabled = typeof getSetting === "function" ? getSetting("aiDiagLogEnabled", true) : true;
        if (enabled === false || enabled === "false") return;
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (event === "CYCLE_START") {
            if (__aiDiagState.cur) __aiDiagState.history.push(__aiDiagState.cur);
            if (__aiDiagState.history.length > 30) __aiDiagState.history.shift();
            __aiDiagState.t0 = now;
            __aiDiagState.cur = { gen: __aiCycleGen, song: __aiDiagState.song, triggers: 0, cancels: 0, staleDrops: 0, bpmUpdates: 0, keyResults: 0, firstKeyMs: null, firstBpmMs: null,
                // TASK AI-KEY-FAST-03 — chỉ chẩn đoán: nguồn lúc bắt đầu chu trình + số lần bind/giữ watcher/không chạy vì nguồn chưa RUNNING
                srcStateAtStart: (extra && extra.source) || null, binds: 0, keptWatcher: 0, skippedNotRunning: 0 };
        } else if (!__aiDiagState.cur) {
            // Sự kiện xảy ra TRƯỚC chu trình NowPlaying đầu tiên (vd. bootstrap 2s sau khi mở app): trước đây bị bỏ rơi
            // (không có bộ đếm) => report không thấy. Nay gom vào chu trình gen hiện tại (0) với song=null.
            __aiDiagState.t0 = now;
            __aiDiagState.cur = { gen: __aiCycleGen, song: null, triggers: 0, cancels: 0, staleDrops: 0, bpmUpdates: 0, keyResults: 0, firstKeyMs: null, firstBpmMs: null,
                srcStateAtStart: null, binds: 0, keptWatcher: 0, skippedNotRunning: 0 };
        }
        const c = __aiDiagState.cur, dt = __aiDiagState.t0 === null ? null : Math.round(now - __aiDiagState.t0);
        if (c) {
            if (event === "KEY_TRIGGER") c.triggers++;
            else if (event === "WATCHER_CANCEL") c.cancels++;
            else if (event === "KEY_RESULT_STALE_DROPPED") c.staleDrops++;
            else if (event === "KEY_RESULT") { c.keyResults++; if (c.firstKeyMs === null) c.firstKeyMs = dt; }
            else if (event === "BPM_UPDATE") { c.bpmUpdates++; if (c.firstBpmMs === null) c.firstBpmMs = dt; }
            else if (event === "ENGINE_BIND") c.binds++;
            else if (event === "KEY_TRIGGER_KEPT_VALID_WATCHER") c.keptWatcher++;
            else if (event === "NP_RESTART_SKIPPED_SOURCE_NOT_RUNNING") c.skippedNotRunning++;
        }
        console.log(`[AI-DIAG] cycle=${__aiCycleGen} song="${__aiDiagState.song}" +${dt}ms ${event}`, extra === undefined ? "" : extra);
    } catch (e) { /* diagnostics không bao giờ được làm hỏng luồng AI */ }
}
window.__aiDiagReport = () => [...__aiDiagState.history, ...(__aiDiagState.cur ? [__aiDiagState.cur] : [])];
// TASK AI-KEY-FAST-07 — CHỈ CHẨN ĐOÁN (không đổi hành vi): lịch sử kết quả Key (mọi KEY_RESULT đều là kết quả ĐÃ KHÓA vì
// onWinner chỉ chạy khi khóa) + bộ đếm gửi Key sang Plugin theo từng giá trị (thành công/thất bại/thử lại).
const __aiKeyHistory = [];
const __aiPluginSend = { total: 0, ok: 0, fail: 0, byKey: {}, lastStatus: null, lastDetail: null };
function aiRecordKeyResult(result, meta) {
    try {
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        __aiKeyHistory.push({ tMs: Math.round(now), wall: Date.now(), gen: __aiCycleGen, epoch: window.__aiEngineEpoch ?? null, key: result.key, rootIndex: result.rootIndex, mode: result.mode,
            confidence: result.confidence, margin: result.margin ?? null, top1: result.top1 ?? null, top2: result.top2 ?? null, bassAgreement: result.bassAgreement ?? null,
            hasMusicalContent: result.hasMusicalContent ?? null, locked: true, ...(meta || {}) });
        if (__aiKeyHistory.length > 20) __aiKeyHistory.shift();
    } catch (e) {}
}
function aiRecordPluginSend(value, result, sourceLabel) {
    try {
        const k = __aiPluginSend.byKey[value] || (__aiPluginSend.byKey[value] = { attempts: 0, ok: 0, fail: 0, retriesAfterFail: 0, lastStatus: null });
        const retry = k.fail > 0 && k.ok === 0; // thử lại cùng Key sau khi chưa từng thành công
        k.attempts++; __aiPluginSend.total++;
        if (retry) k.retriesAfterFail++;
        if (result && result.ok) { k.ok++; __aiPluginSend.ok++; } else { k.fail++; __aiPluginSend.fail++; }
        k.lastStatus = (result && result.status) || null;
        __aiPluginSend.lastStatus = k.lastStatus; __aiPluginSend.lastDetail = (result && result.detail) || null;
        if (typeof aiDiag === "function") aiDiag("PLUGIN_SEND", { key: value, ok: !!(result && result.ok), status: k.lastStatus, attempt: k.attempts, retry, caller: sourceLabel || null });
    } catch (e) {}
}
window.__aiKeyHistory = () => __aiKeyHistory.slice();
window.__aiPluginSendStats = () => ({ ...JSON.parse(JSON.stringify(__aiPluginSend)), mouseBlock: JSON.parse(JSON.stringify(__pluginMouseBlock)) });
// TASK AI-KEY-FAST-03 — trạng thái SỐNG (đọc trực tiếp tại thời điểm gọi, KHÔNG phải snapshot): dùng để biết luồng đứt ở đâu.
// Chỉ đọc; không đổi hành vi. Gọi trong DevTools: JSON.stringify(window.__aiDiagStatus(), null, 2)
window.__aiDiagStatus = () => {
    const out = { cycleGen: __aiCycleGen, engineEpoch: window.__aiEngineEpoch ?? null, hasEngineSrc: !!window.__aiEngineSrc,
        watcherActive: !!window.__keyDetectStopWatcher, watcherMeta: window.__keyWatcherMeta ? { ...window.__keyWatcherMeta, src: window.__keyWatcherMeta.src ? "[node]" : null } : null,
        metaMatchesCurrent: !!(window.__keyWatcherMeta && window.__keyWatcherMeta.gen === __aiCycleGen && window.__keyWatcherMeta.epoch === window.__aiEngineEpoch && window.__keyWatcherMeta.src === window.__aiEngineSrc),
        systemAudioExists: !!window.__systemAudioSource, systemAudioState: null, audioMonitorStarted: typeof audioMonitorStarted !== "undefined" ? audioMonitorStarted : null,
        keyEngineFrames: null, keyEngineHasMusicalContent: null, aiDiagEnabled: null };
    try { out.systemAudioState = window.__systemAudioSource?.getState?.() ?? null; } catch (e) {}
    try { const d = typeof KeyEngine !== "undefined" && KeyEngine.getDebugSnapshot ? KeyEngine.getDebugSnapshot() : null; if (d) { out.keyEngineFrames = d.frameCounter; out.keyEngineHasMusicalContent = d.hasMusicalContent; out.keyInput = d.inputProbe || null; out.keyInputState = d.inputState || null; /* AI-KEY-ENGINE-COMPLETE-01: NO_SIGNAL / SIGNAL_NO_MUSIC / MUSIC_EVIDENCE / LOCKED */ out.keyChroma = d.chromaVector; out.keyLoops = d.loopStats || null; } } catch (e) {}
    // TASK AI-KEY-FAST-05 — mức VU (analyser BPMEngine, cùng raw source node với KeyEngine) + thông tin track/AudioContext thật của SYSTEM_AUDIO.
    try { out.musicVuLevel = window.__aiLastLevel ? { ...window.__aiLastLevel, ageMs: Date.now() - window.__aiLastLevel.t } : null; } catch (e) {}
    try { out.sourceInfo = window.__systemAudioSource?.getDiagnostics?.() ?? null; } catch (e) {}
    // TASK AI-KEY-FAST-07 — lịch sử Key đã khóa + thống kê gửi Plugin.
    try { out.keyHistory = __aiKeyHistory.slice(-10); out.pluginSend = JSON.parse(JSON.stringify(__aiPluginSend)); } catch (e) {}
    try { const en = typeof getSetting === "function" ? getSetting("aiDiagLogEnabled", true) : true; out.aiDiagEnabled = !(en === false || en === "false"); } catch (e) {}
    return out;
};

// A117 — Học + Bộ nhớ: nhớ Key AI đã chốt theo bài (khoá "<title>|<artist>") trong app-settings (aiSongMemory).
// Lần sau gặp lại bài (và Song Database không có) => hiện Key đã nhớ như "Key tạm (đang dò...)" — CHỈ HIỂN THỊ,
// KHÔNG tự gửi Plugin; AI vẫn dò và Key thật vẫn do AI chốt. Mặc định TẮT. Lỗi bất kỳ => nuốt, không ảnh hưởng luồng AI.
const __AI_MEMORY_CAP = { few: 20, default: 50, many: 200 };
function __aiMemoryRead() { try { const m = typeof getSetting === "function" ? getSetting("aiSongMemory", {}) : {}; return m && typeof m === "object" && !Array.isArray(m) ? m : {}; } catch (e) { return {}; } }
function __aiMemoryRemember(songKey, key) {
    try {
        if (typeof __aiCoreCfg !== "function") return;
        const cfg = __aiCoreCfg(); if (!cfg.learn || !songKey || songKey === "|" || !key) return;
        const mem = Object.assign({}, __aiMemoryRead()); const cur = mem[songKey];
        if (cur && cur.key === key) return; // không đổi -> khỏi ghi file
        mem[songKey] = { key: String(key), t: Date.now() };
        const cap = __AI_MEMORY_CAP[cfg.memory] || 50, ks = Object.keys(mem);
        if (ks.length > cap) ks.sort((a, b) => (mem[a].t || 0) - (mem[b].t || 0)).slice(0, ks.length - cap).forEach((k) => delete mem[k]); // bỏ bài cũ nhất
        if (typeof setSetting === "function") setSetting("aiSongMemory", mem);
    } catch (e) {}
}
function __aiMemoryRecall(songKey) {
    try {
        if (typeof __aiCoreCfg !== "function") return;
        const cfg = __aiCoreCfg(); if (!cfg.learn || !songKey) return;
        const m = __aiMemoryRead()[songKey]; if (!m || !m.key || (keySource.songDb && keySource.songDb.active)) return;
        keySource.ai.provisional = m.key; refreshKeySourceDisplay();
    } catch (e) {}
}

// A119 — CHẾ ĐỘ AUTO-KEY (Tự dò riêng): plugin Auto-Key trong DAW tự dò Key và tự gửi sang Auto-Tune.
// Quy trình: bấm "điểm dò Key" (autokey1) -> chờ N giây (Setup) -> bấm "điểm Send Auto-Tune" (autokey2).
// AUTOKEY-MIDI-01: bấm bằng MIDI (AUTOKEY_DETECT / AUTOKEY_SEND), KHÔNG dùng chuột/toạ độ. Chỉ chạy khi: chế độ BẬT, KHÔNG ở Dò tay, KHÔNG có Key Song Database.
// Menu vẫn hiển thị Key của AI Menu (Menu không đọc được Key mà Auto-Key dò ra) nhưng không gửi nó xuống Auto-Tune.
const __autoKeyRun = { busy: false, last: 0, status: "" };
function __autoKeyPoints(key) {
    try {
        const raw = typeof getCoordinate === "function" ? getCoordinate(key) : "";
        const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        return arr.filter((q) => q && typeof q.x === "number" && typeof q.y === "number");
    } catch (e) { return []; }
}
const __autoKeySleep = (ms) => new Promise((res) => setTimeout(res, ms));
// SILENT-CLICK-01: Auto-Key không cho DAW điều khiển nút bằng MIDI -> Menu BẤM NGẦM (không di chuyển con trỏ chuột) vào 2 toạ độ đã lưu ở Setup:
// Auto-Key 1 = điểm dò Key, Auto-Key 2 = Send Auto-Tune. Chỉ chạy khi: chế độ BẬT, KHÔNG ở Dò tay, KHÔNG có Key Song Database.
async function runAutoKeyDetect(reason) {
    try {
        if (typeof __aiCoreCfg !== "function") return { ran: false, why: "no-cfg" };
        const cfg = __aiCoreCfg();
        if (!cfg.autoKeyMode) return { ran: false, why: "mode-off" };
        const srcNow = typeof getActiveSourceName === "function" ? getActiveSourceName() : "ai";
        if (srcNow === "manual") return { ran: false, why: "manual" };
        if (srcNow === "songDb") return { ran: false, why: "song-db" };
        if (__autoKeyRun.busy) return { ran: false, why: "busy" };
        if (Date.now() - __autoKeyRun.last < 8000) return { ran: false, why: "cooldown" };
        const click = window.electronAPI?.clickAtPointSilent;
        const p1 = __autoKeyPoints("autokey1"), p2 = __autoKeyPoints("autokey2");
        if (!p1.length || !p2.length || !click) { __autoKeyRun.status = "Chưa lấy đủ toạ độ Auto-Key 1 (điểm dò Key) / 2 (Send Auto-Tune)"; console.log("[Auto-Key] " + __autoKeyRun.status); return { ran: false, why: "no-coords" }; }
        __autoKeyRun.busy = true; __autoKeyRun.last = Date.now();
        console.log("[Auto-Key] Chạy (" + (reason || "?") + "): bấm ngầm điểm dò Key -> chờ " + cfg.autoKeyWait + "s -> bấm ngầm Send Auto-Tune");
        const press = async (pts) => { for (const q of pts) { const r = await click(q); if (!r || !r.ok) return r || { ok: false, detail: "không phản hồi" }; await __autoKeySleep(300); } return { ok: true }; };
        try {
            await __autoKeySleep(1500); // để bài/âm thanh vào ổn định rồi mới bắt đầu dò
            const r1 = await press(p1);
            if (!r1.ok) { __autoKeyRun.status = "Bấm điểm dò Key không được: " + r1.detail; console.log("[Auto-Key] " + __autoKeyRun.status); return { ran: false, why: "click-fail" }; }
            await __autoKeySleep(cfg.autoKeyWait * 1000);
            const c2 = __aiCoreCfg();
            if (!c2.autoKeyMode || (typeof getActiveSourceName === "function" && getActiveSourceName() === "manual")) { __autoKeyRun.status = "Dừng trước bước Send (đã tắt chế độ hoặc chuyển sang Dò tay)"; return { ran: true, sent: false, why: "aborted" }; }
            const r2 = await press(p2);
            if (!r2.ok) { __autoKeyRun.status = "Bấm Send không được: " + r2.detail; console.log("[Auto-Key] " + __autoKeyRun.status); return { ran: true, sent: false, why: "click-fail" }; }
            __autoKeyRun.status = "Đã dò + Send (bấm ngầm) lúc " + new Date().toLocaleTimeString();
            return { ran: true, sent: true };
        } finally { __autoKeyRun.busy = false; }
    } catch (e) { __autoKeyRun.busy = false; __autoKeyRun.status = "Lỗi: " + (e && e.message); return { ran: false, why: "error" }; }
}

function restartAiForNewSong(songKey) {
    __dbBypassClear(); // TASK AUTO-RELISTEN-01
    __aiCycleGen++; // vô hiệu hoá mọi callback/timer của bài trước
    __aiDiagState.song = songKey;
    aiDiag("CYCLE_START", { source: window.__systemAudioSource?.getState?.() });
    console.log(`[NowPlaying][AI] Bài mới -> reset KEY/BPM/MOD về LISTENING và dò lại (gen=${__aiCycleGen})`);
    const sys = window.__systemAudioSource;
    if (typeof AudioSourceState !== "undefined" && sys?.getState?.() === AudioSourceState.RUNNING) {
        // Đúng chu trình AUTO DETECT đã có (A75-06) — không sao chép logic.
        __autoDetectInternal = true; // TASK AUTO-RELISTEN-01: đây là đổi bài, KHÔNG phải người dùng bấm -> không bỏ qua Database
        try { document.getElementById("autoDetectBtn")?.click(); } finally { __autoDetectInternal = false; }
    } else {
        // Chưa có nguồn/frame: chỉ về trạng thái chờ, KHÔNG giả lập Key/BPM. Khi SYSTEM_AUDIO RUNNING,
        // bindAiEnginesToSystemAudio() tự khởi động lại việc dò như cũ.
        aiDiag("NP_RESTART_SKIPPED_SOURCE_NOT_RUNNING", { source: sys?.getState?.() ?? (sys ? "?" : "no-source-yet") }); // TASK AI-KEY-FAST-03 (chỉ log)
        resetAiDisplaysToListening();
        if (window.__keyDetectStopWatcher) { window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null; }
        if (typeof ModEngine !== "undefined") ModEngine.stop();
    }
    if (typeof __aiMemoryRecall === "function") __aiMemoryRecall(songKey); // A117: Học BẬT & đã nhớ bài này -> hiện Key đã nhớ làm Key tạm (không gửi Plugin)
}

// songKey: "<title>|<artist>" hoặc null khi metadata rỗng/mất.
function handleNowPlayingForAi(songKey) {
    if (typeof aiDiag === "function") aiDiag("NP_EVENT", songKey === null ? "empty" : (songKey === __npLastSongKey ? "duplicate" : "new"));
    if (songKey === null) {
        if (__npLastSongKey !== null && __npEmptyTimer === null) {
            __npEmptyTimer = setTimeout(() => { __npEmptyTimer = null; __npLastSongKey = null; }, NOWPLAYING_EMPTY_GRACE_MS_TENTATIVE);
        }
        return;
    }
    if (__npEmptyTimer !== null) { clearTimeout(__npEmptyTimer); __npEmptyTimer = null; }
    if (songKey === __npLastSongKey) return; // sự kiện lặp / quay lại cùng bài sau khoảng trống ngắn
    __npLastSongKey = songKey;
    restartAiForNewSong(songKey);
}

// Mục IX: bài hát đổi -> huỷ Timer Manual, xoá trạng thái bài cũ. Dữ liệu bài mới (match/miss)
// sẽ được nạp ngay sau đó qua onSongDatabaseMatch()/onSongDatabaseMiss() (do main process gửi).
function dispatchNowPlayingPayload(payload) {

    const key = payload ? `${payload.title || ""}|${payload.artist || ""}` : null;

    if (key !== lastNowPlayingKey) {
        console.log("[NowPlaying] Song Changed");
        __dbBypassClear(); // TASK AUTO-RELISTEN-01: bài mới -> Database lại có hiệu lực
        cancelManualOverride();
        lastNowPlayingKey = key;
    }

    // TASK AI-ALG-01-NOWPLAYING — metadata rỗng (không title lẫn artist) coi như "không có bài".
    handleNowPlayingForAi(payload && (payload.title || payload.artist) ? key : null);

    if (!payload) {
        onNowPlayingLost();
    } else if (payload.databaseMatch) {
        onSongDatabaseMatch({
            key: payload.databaseMatch.key,
            bpm: payload.databaseMatch.bpm,
            title: payload.title,
            artist: payload.artist
        });
    } else {
        onSongDatabaseMiss();
    }

}

// ---- AI Realtime Detect — vòng lặp LIÊN TỤC, chạy nền bất kể nguồn nào đang active (mục II) ----

function startAiRealtimeLoop() {

    const cycleGen = __aiCycleGen; // TASK AI-ALG-01-NOWPLAYING — token của chu trình này
    // TASK AI-KEY-FAST-02 — "danh tính" của watcher: token chu trình + epoch engine + nguồn audio lúc tạo.
    // triggerAiKeyDetect() dùng nó để biết watcher đang chạy còn hợp lệ hay không (đặt TRƯỚC detectOnce).
    window.__keyWatcherMeta = { gen: cycleGen, epoch: window.__aiEngineEpoch, src: window.__aiEngineSrc };
    window.__keyDetectStopWatcher = KeyEngine.detectOnce((result) => {

        // Kết quả của bài trước đến muộn: bỏ, KHÔNG ghi đè trạng thái bài mới (chu trình mới đã có vòng dò riêng).
        if (cycleGen !== __aiCycleGen) { if (typeof aiDiag === "function") aiDiag("KEY_RESULT_STALE_DROPPED", { resultGen: cycleGen, key: result.key }); return; }
        if (typeof aiDiag === "function") {
            // TASK AI-KEY-FAST-06 — stack rút gọn tại thời điểm có kết quả (phân biệt callback lồng nhau với vòng chạy song song) + số vòng đang chạy.
            let st = null; try { st = String(new Error().stack || "").split("\n").slice(1, 7).map((x) => x.trim().replace(/^at\s+/, "")); } catch (e) {}
            let loops = null; try { loops = KeyEngine.getDebugSnapshot().loopStats; } catch (e) {}
            aiDiag("KEY_RESULT", { key: result.key, confidence: result.confidence, margin: result.margin ?? null, bassAgreement: result.bassAgreement ?? null, locked: true, gen: cycleGen, epoch: window.__aiEngineEpoch ?? null, loops, stack: st });
            if (typeof aiRecordKeyResult === "function") aiRecordKeyResult(result, { loops: loops ? { started: loops.started, stopped: loops.stopped, active: loops.active, maxActive: loops.maxActive } : null });
        }

        window.__keyDetectStopWatcher = null;

        keySource.ai.value = result.key;
        if (__dbBypass.pending) { // TASK AUTO-RELISTEN-01 + AUTO-DETECT-TRUST-01: AI chỉ thay Database khi đáng tin hơn
            __dbBypass.pending = false;
            const __v = __aiBeatsDatabase(result.key, result.confidence, keySource.songDb.value);
            if (__v.ok) { __dbBypass.active = true; if (typeof aiDiag === "function") aiDiag("DB_BYPASS_ON", { db: keySource.songDb.value, ai: result.key, conf: result.confidence }); }
            else {
                if (typeof aiDiag === "function") aiDiag("DB_BYPASS_REJECTED", { db: keySource.songDb.value, ai: result.key, conf: result.confidence, why: __v.why });
                if (getActiveSourceName() === "songDb") applyActiveKeyToPlugin("Song Database"); // trả ô Key từ LISTENING về Key Database (cùng Key nên không gửi lại Plugin)
            }
        }
        if (typeof __aiMemoryRemember === "function") __aiMemoryRemember(typeof lastNowPlayingKey !== "undefined" ? lastNowPlayingKey : null, result.key); // A117: Học BẬT -> nhớ Key theo bài
        keyEverDetected = true; // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — có kết quả THẬT từ audio
        __aiState.hasConfirmed = true; updateAiSourceStateLabel(); // TASK A74-02
        window.electronAPI?.reportAiResult("key", { key: result.key, confidence: result.confidence });
        // Task C — Key này do AI tự dò (Database/Key Server CHƯA có bài): gửi lên Key Server.
        // main process tự kiểm tra tên bài, độ tin cậy, trùng lặp và lỗi mạng — lỗi ở đây KHÔNG được ảnh hưởng luồng AI.
        // Điều kiện nằm TRONG try: chỉ gửi khi chắc chắn songDb tồn tại và chưa có bài; mọi lỗi đều bị nuốt.
        try {
            if (keySource.songDb && !keySource.songDb.active) {
                window.electronAPI?.submitDetectedKey?.({ key: result.key, confidence: result.confidence })?.catch?.(() => {});
            }
        } catch (e) {}
        refreshKeySourceDisplay();

        if (getActiveSourceName() === "ai" && !(keySource.manual && keySource.manual.sending)) { // sending: người dùng vừa bấm SEND Manual, chưa xác nhận -> AI không chen vào

            if (keyInfoEl) keyInfoEl.textContent = `Auto Detect (${Math.round(result.confidence * 100)}% tin cậy)`;
            applyActiveKeyToPlugin("AI Detect");
            startModulationWatcher();

        }

        if (typeof __aiCoreCfg !== "function" || __aiCoreCfg().realtime) startAiRealtimeLoop(); // luôn chạy tiếp — kể cả khi AI KHÔNG phải nguồn active lúc này. A116: Setup > Lõi AI > "Chế độ thời gian thực" TẮT => dò 1 lần rồi dừng (bài mới/nút Auto vẫn dò lại)

    });

}

// Điểm DUY NHẤT xử lý "quay lại Auto" — dùng cho: nút autoDetectBtn có sẵn, dropdown chọn lại
// "AI Key Detect" + SEND, và khởi động lần đầu. Huỷ Manual (nếu có), áp NGAY nguồn hiện có
// hiệu lực (Song Database nếu có, không thì đợi AI), đảm bảo vòng dò AI đang chạy.
function triggerAiKeyDetect() {

    cancelManualOverride();
    if (keySource.manual) keySource.manual.selectedKey = null; // người dùng chủ động quay về Auto: nhả lựa chọn Key tay

    // "Manual OFF -> Plugin lập tức dùng AI. Không mất dữ liệu. Không Detect lại từ đầu."
    // AI luôn chạy NỀN liên tục suốt lúc Manual bật (startAiRealtimeLoop không bao giờ dừng),
    // nên keySource.ai.value LUÔN đã có sẵn giá trị mới nhất ngay tại thời điểm này -> áp dụng
    // NGAY LẬP TỨC, không cần chờ vòng dò tiếp theo. (Khôi phục fix đã bị mất do revert ngoài
    // ý muốn — xem báo cáo.)
    if (getActiveSourceName() === "songDb") {

        applyActiveKeyToPlugin("Song Database");

    } else {

        applyActiveKeyToPlugin("AI Detect");

    }

    if (typeof aiDiag === "function") {
        // TASK AI-KEY-FAST-05 — ghi NGƯỜI GỌI (dòng stack ngay sau triggerAiKeyDetect) + trạng thái watcher/epoch để chứng minh
        // lần gọi nào KEEP/CANCEL/START. Chỉ log (không đổi luồng, không đổi chữ ký hàm nên A61 không bị ảnh hưởng).
        let caller = null; try { caller = String(new Error().stack || "").split("\n").slice(2, 4).map((x) => x.trim().replace(/^at\s+/, "")).join(" <- "); } catch (e) {}
        aiDiag("KEY_TRIGGER", { caller, gen: __aiCycleGen, epoch: window.__aiEngineEpoch ?? null, hasSrc: !!window.__aiEngineSrc, watcherActive: !!window.__keyDetectStopWatcher,
            metaEpoch: window.__keyWatcherMeta ? (window.__keyWatcherMeta.epoch ?? null) : null, srcState: window.__systemAudioSource?.getState?.() ?? null });
    } // AI-NOWPLAYING-OPT-02 (log)
    // TASK AI-KEY-FAST-02 — watcher đang chạy VÀ cùng chu trình (token) + cùng epoch engine + cùng nguồn
    // audio => KHÔNG huỷ/khởi động lại (giữ tiến độ tích luỹ, ví dụ timer 2s của bindAiEnginesToSystemAudio).
    // Khác token/epoch/nguồn (đổi bài, bind lại/reconnect/đổi thiết bị) hoặc không còn watcher => huỷ + tạo mới.
    const __meta = window.__keyWatcherMeta;
    if (window.__keyDetectStopWatcher && __meta && __meta.gen === __aiCycleGen
        && __meta.epoch === window.__aiEngineEpoch && __meta.src === window.__aiEngineSrc) {
        if (typeof aiDiag === "function") aiDiag("KEY_TRIGGER_KEPT_VALID_WATCHER");
        return;
    }
    if (window.__keyDetectStopWatcher) {
        if (typeof aiDiag === "function") aiDiag("WATCHER_CANCEL");
        window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null;
    }
    startAiRealtimeLoop();

}

// Khởi tạo hiển thị lần đầu khi renderer chạy — khớp với appState.originalKey mặc định.
refreshKeySourceDisplay();

/* ==========================================================
   8. KEY SELECTOR (chọn key thủ công / AI detect)
   ========================================================== */
const keySelector = document.getElementById("keySelector");
const applyKeyBtn = document.getElementById("applyKeyBtn");
const currentKeyEl = document.getElementById("currentKey");
const keyInfoEl = document.getElementById("keyInfo");
restoreSelectOptions(keySelector, MANUAL_KEY_VALUES); // MANUAL-KEY-MOD-RESTORE-01: khôi phục 24 Key + "AI Key Detect" (HTML chỉ còn 3 mục)

applyKeyBtn?.addEventListener("click", () => {
    // REWRITE — lấy đúng giá trị Manual ĐANG CHỌN từ chính state của Manual (selectedKey),
    // KHÔNG lấy từ getActiveKeyValue()/keySource.ai.value/lastPluginKey hay bất kỳ nguồn nào
    // khác (Mục 7: "không được lấy keySource.ai.value/getActiveKeyValue() để thay thế Manual
    // selection"). keySelector.value và keySource.manual.selectedKey luôn đồng bộ vì handler
    // "change" bên dưới ghi cả 2 cùng lúc — đọc qua state cho đúng tinh thần "Manual state là
    // nguồn sự thật", không đọc DOM trực tiếp.
    const selectedKey = keySource.manual.selectedKey ?? keySelector.value;

    if (selectedKey === "AI Key Detect") {
        triggerAiKeyDetect();
        return;
    }

    // MANUAL-KEY-MOD-RESTORE-01: KHÔNG huỷ watcher AI nữa (bản cũ huỷ rồi không ai chạy lại -> sau Manual AI "chết"). Thay vào đó
    // đánh dấu `sending`: kết quả AI đến trong lúc lệnh Manual đang bay sẽ không được áp đè (xem startAiRealtimeLoop).
    // SEND-HARDEN: lệnh trước còn đang bay (chưa có kết quả) -> bỏ qua cú bấm này, tránh 2 lệnh Key chạy song song làm Auto-Tune/hiển thị lệch nhau.
    if (keySource.manual.sending) return;
    keySource.manual.sending = true;

    // Chỉ cập nhật hiển thị NGAY (preview, cosmetic) — KHÔNG commit keySource.manual ở đây.
    // Lý do (Mục 6: "Không được commit trước khi Auto-Tune xác nhận thành công"): nếu commit
    // active=true/committedKey=... NGAY LÚC CLICK rồi sendKeyToAutotune() sau đó thất bại, hệ
    // thống sẽ kẹt ở "ACTIVE: MANUAL" vĩnh viễn (không có countdown vì startManualOverrideCountdown()
    // chỉ chạy khi thành công) — khoá luôn AI/Database Auto Apply dù Auto-Tune chưa hề nhận Key này.
    const previousDisplayValue = getActiveKeyValue(); // để khôi phục đúng nếu lần gửi này thất bại

    originalKey = selectedKey;
    if (currentKeyEl) currentKeyEl.textContent = selectedKey;
    if (keyInfoEl) keyInfoEl.textContent = "Manual Key";
    setStatus("dot-key", "pending"); // cam: đang gửi, chờ kết quả thực thi

    // sendKeyToAutotune() định nghĩa trong ui/js/vocalCommandRouter.js, NGOÀI renderer.js —
    // theo đúng ranh giới task (Mục 20 "nếu cần sửa ngoài renderer.js: DỪNG và báo cáo trước"),
    // KHÔNG thêm tham số {source:"manual"} vào chữ ký hàm thật ở đây. Nguồn gọi (AI/Manual) vẫn
    // được phân biệt rõ 100% qua VỊ TRÍ gọi (3 call site cố định, xem báo cáo) + logKeySource().
    sendKeyToAutotune(normalizeKeyForSend(selectedKey)).then((result) => {
        keySource.manual.sending = false;
        if (result.ok) {
            // CHỈ commit Manual state khi Auto-Tune xác nhận nhận được Key (Mục 6: preview -> validate -> committed).
            keySource.manual.committedKey = selectedKey;
            keySource.manual.active = true;
            reportManualStateSnapshot(); // TASK B3-C — Manual Key vừa BẬT thật (đã được Auto-Tune xác nhận), báo Core ngay

            setStatus("dot-key", "online"); // xanh: đã gửi thành công (qua MIDI hoặc click)
            if (keyInfoEl) keyInfoEl.textContent = `Manual Key (${result.driverUsed})`;
            logKeySource("Manual Override");

            // SEND thành công -> Plugin chính thức đổi, bắt đầu đếm ngược 4 phút.
            lastPluginKey = normalizeKeyForSend(selectedKey);
            startManualOverrideCountdown();
            if (manualToneSet && isManualOverrideActive()) renderManualToneDisplay(); // Key gốc đổi -> Key sau dịch tone đổi theo
        } else {
            // Gửi thất bại -> KHÔNG commit Manual (committedKey/active giữ nguyên giá trị cũ,
            // đúng Test 7), KHÔNG chiếm quyền AI/Database. Khôi phục lại đúng originalKey/hiển
            // thị của giá trị ĐANG THẬT SỰ có hiệu lực (vd nếu đây là lần gửi lại trong lúc
            // Manual cũ vẫn còn active, không được để hiển thị kẹt ở giá trị mới trong khi
            // Auto-Tune thực ra vẫn giữ giá trị cũ).
            originalKey = previousDisplayValue;
            if (currentKeyEl) currentKeyEl.textContent = previousDisplayValue;
            setStatus("dot-key", "offline"); // đỏ: gửi thất bại
            if (keyInfoEl) keyInfoEl.textContent = "Lỗi gửi Key";
            console.error("sendKeyToAutotune lỗi:", result.detail);
        }
        refreshKeySourceDisplay();
    }, (err) => {
        // SEND-HARDEN: gửi ném lỗi bất ngờ (không phải kết quả {ok:false} thông thường) — xử lý TRỌN như "gửi thất bại": trả hiển thị cũ, chấm đỏ, không kẹt màu cam.
        keySource.manual.sending = false;
        originalKey = previousDisplayValue;
        if (currentKeyEl) currentKeyEl.textContent = previousDisplayValue;
        setStatus("dot-key", "offline");
        if (keyInfoEl) keyInfoEl.textContent = "Lỗi gửi Key";
        console.error("sendKeyToAutotune ném lỗi:", err);
        refreshKeySourceDisplay();
    });

    // AI Realtime vẫn chạy nền liên tục (startAiRealtimeLoop tự lặp lại vô điều kiện từ lúc khởi
    // động, mục 7B) — không cần khởi động lại riêng ở đây.
});

// Người dùng CHỈ chọn trong dropdown (chưa bấm SEND) -> "Key" cập nhật NGAY để xem trước, nhưng
// Plugin CHƯA đổi (không gọi sendKeyToAutotune ở đây — đúng yêu cầu giữ nguyên Logic Send: Send
// vẫn là hành động DUY NHẤT thật sự gửi xuống Plugin). REWRITE Mục 5: ghi thêm
// keySource.manual.selectedKey — CHỈ ghi field này, tuyệt đối không gọi Auto-Tune/AI/DB/MOD.
keySelector?.addEventListener("change", () => {

    const selectedKey = keySelector.value;

    if (selectedKey === "AI Key Detect") {
        keySource.manual.selectedKey = null; // không phải 1 Key thật -> không lưu làm Manual selection
        return; // chưa áp dụng gì, chờ bấm SEND
    }

    keySource.manual.selectedKey = selectedKey; // Mục 5: PREVIEW ONLY — chỉ ghi field này
    if (currentKeyEl) currentKeyEl.textContent = selectedKey;

});

/* ==========================================================
   9. STATUS DOTS
   ========================================================== */
function setStatus(id, status) {
    const dot = document.getElementById(id);
    if (dot) {
        dot.className = `status-dot ${status}`;
    }
}

async function checkAllSystems() {
    // 1. Check Online
    setStatus('dot-online', navigator.onLine ? 'online' : 'offline');

    // 2. Check Audio Interface (MIC)
    updateAudioInterfaceDot();

    // 3. Check DAW (nếu có hàm kiểm tra DAW riêng thì bổ sung ở đây)
    // setStatus('dot-daw', isDawRunning ? 'online' : 'offline');
}

// TASK B72 (gộp B72+B72.1) — tách riêng logic dot-audio ra 1 hàm DUY NHẤT, gọi từ CẢ
// checkAllSystems() lẫn updateMainStatus() (xem bên dưới). PHÁT HIỆN (đã từng sửa 1 lần ở B72
// trước, nhưng bị mất khi origin/main được đồng bộ lại từ 1 nhánh khác — xem B72-REPORT.md mục
// Baseline): updateMainStatus() có 1 dòng RIÊNG "setStatus('dot-audio', soundcard ? 'online' :
// 'offline')" — tức là dot-audio có 2 NGƯỜI VIẾT với 2 LOGIC KHÁC NHAU (bản cũ dùng chuỗi tên đã
// lưu, không xác minh AudioSource thật có RUNNING hay không). Gộp về 1 hàm duy nhất — không còn
// 2 nơi quyết định cùng 1 phần tử DOM.
function updateAudioInterfaceDot() {
    try {
        const micState = __micSource?.getState?.();
        const dotEl = document.getElementById('dot-audio');
        const selectedMicId = (typeof getSetting === "function" ? getSetting("selectedMicDeviceId", "") : "") || "";
        let label;
        if (micState === AudioSourceState.RUNNING) {
            setStatus('dot-audio', 'online');
            label = selectedMicId ? "Mic đã chọn — đang hoạt động" : "Mic mặc định hệ thống — đang hoạt động";
        } else if (micState === AudioSourceState.STARTING) {
            setStatus('dot-audio', 'pending');
            label = "Đang mở mic...";
        } else if (micState === AudioSourceState.ERROR) {
            setStatus('dot-audio', 'offline');
            label = "Lỗi mở mic";
        } else if (selectedMicId) {
            // NO_DEVICE nhưng ĐÃ có deviceId lưu -> khác "chưa từng chọn" (phân biệt "thiết bị
            // đã lưu nhưng không khả dụng" với "chưa chọn thiết bị").
            setStatus('dot-audio', 'offline');
            label = "Mic đã chọn hiện không khả dụng";
        } else {
            setStatus('dot-audio', 'offline');
            label = "Chưa khởi động mic (chưa tương tác với app)";
        }
        // Chỉ set thuộc tính title (tooltip khi rê chuột) trên chính chấm tròn, KHÔNG đổi bố
        // cục/CSS/HTML nào khác — cách an toàn nhất để hiện đủ trạng thái mà không động tới
        // giao diện đã có (đúng ràng buộc "Không thay đổi giao diện" của dự án).
        if (dotEl) dotEl.title = label;
    } catch (e) {
        setStatus('dot-audio', 'offline');
    }
}

function updateOnlineStatus() {
    setStatus("dot-online", navigator.onLine ? "online" : "offline");
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

function updateCacheDot() {
    const cache = getSetting?.("songDatabase");
    setStatus("dot-cache", cache ? "online" : "offline");
}

function updateNextModTime() {
    const modTimeEl = document.getElementById("modTime");
    if (!modTimeEl) return;
    modTimeEl.textContent = modTimeline[0].time;
}

/* ==========================================================
   10. SAVE / LOAD DATA
   ========================================================== */
// BUTTON-RESET (yêu cầu chính thức của Khói): 4 nút Music / Mic 1 / Mic 2 / FX KHÔNG được lưu trạng thái qua phiên.
//   - saveData() KHÔNG ghi 4 nút; loadData() KHÔNG đọc/khôi phục 4 nút; không có beforeunload/Auto FX nào lưu lại chúng.
//   - Mở lại Menu => 4 nút ở mặc định của HTML (không có class active/disabled): Music = KHÔNG disabled, Mic 1 = tắt, Mic 2 = tắt, FX = tắt.
//   - Nút khởi tạo ở trạng thái nào cũng KHÔNG có nghĩa DAW đang ở trạng thái đó (không có feedback DAW; trạng thái DAW đã xác nhận không tồn tại).
// Các cài đặt khác (Key, tone, Mod, preset, knobs) vẫn lưu như cũ.

function saveData() {
    const data = {
        currentKey: document.getElementById("currentKey")?.textContent,
        tone: document.getElementById("toneSelector")?.value,
        modEnabled: document.getElementById("modPowerBtn")?.classList.contains("active"),
        preset: (() => { // A79: nút TUNE là công tắc bypass, không phải preset -> không lưu làm preset
            const isTune = (b) => !!(b && b.dataset && (b.dataset.tuneBtn === "1" || b.dataset.lofiBtn === "1")); // A79/A94: TUNE và LOFI là công tắc, không lưu làm preset
            const a = document.querySelector(".preset-btn.active");
            if (a && !isTune(a)) return a.textContent.trim();
            return [...document.querySelectorAll(".preset-btn.active")].find(b => !isTune(b))?.textContent.trim();
        })(),
        knobs: knobData.map(k => ({ id: k.id, value: k.value }))
    };

    if (typeof appSettings !== "undefined") {
        appSettings.autoMenuData = data;
    }
    const ok = saveSetup?.();
    if (ok === false) { // ghi file thất bại: không im lặng
        console.error("[Menu] Không ghi được cấu hình Menu (Key/preset/knobs) — sẽ thử lại ở lần lưu kế tiếp.");
        window.electronAPI?.sendTelemetry?.({ event: "MENU_STATE_SAVE_FAILED", timestamp: Date.now() });
    }
    return ok;
}


function loadData() {
    const data = typeof appSettings !== "undefined" ? appSettings.autoMenuData : null;
    if (!data) return;

    // TASK A36 (UI Truth State Audit) — BUG THẬT đã tìm thấy và vá: saveData() lưu THẲNG
    // textContent hiển thị của #currentKey (dòng ~1171). Nếu người dùng thao tác bất kỳ gì
    // gọi saveData() (bấm preset, MUSIC/MIC/FX, xoay knob, SEND...) ĐÚNG lúc màn hình đang
    // hiện "LISTENING" (mới mở app / vừa bấm Auto Detect / đang chờ audio dò lại) thì chuỗi
    // "LISTENING" bị lưu vào appSettings.autoMenuData.currentKey. Lần load lại sau đó (dòng
    // dưới) sẽ gán "LISTENING" thẳng vào `originalKey` — biến state nội bộ dùng cho
    // transposeKey()/Mod delta/startModulationWatcher() — vi phạm đúng yêu cầu "originalKey
    // KHÔNG BAO GIỜ được là LISTENING". Vá bằng cách coi "LISTENING" đã lưu = "chưa có giá trị
    // thật nào được lưu", giống hệt như không có data.currentKey — display/originalKey giữ
    // nguyên mặc định LISTENING/"G# Minor" nội bộ như lúc app mới mở, không đụng gì khác.
    if (data.currentKey && data.currentKey !== "LISTENING") {
        const el = document.getElementById("currentKey");
        if (el) el.textContent = data.currentKey;
        originalKey = data.currentKey;
    }

    if (data.tone) {
        const el = document.getElementById("toneSelector");
        if (el) el.value = data.tone;
    }

    // MANUAL-KEY-MOD-RESTORE-01: KHÔNG khôi phục MOD "ON" nữa. Bản cũ chỉ gắn chữ "ON" mà không bật ô chọn Tone/nút SET, không bật
    // SoundShifter, không đặt hẹn giờ tự tắt -> giao diện ON nhưng không dùng được (phải bấm 2 lần mới bật thật). MOD luôn khởi động ở OFF
    // (đúng thực tế: SoundShifter chưa được bật sau khi mở app). Giá trị modEnabled cũ trong file cấu hình được bỏ qua.

    if (data.preset) {
        document.querySelectorAll(".preset-btn").forEach(btn => {
            if (btn.dataset && (btn.dataset.tuneBtn === "1" || btn.dataset.lofiBtn === "1")) return; // A79/A94: TUNE/LOFI không khôi phục (không có phản hồi từ DAW) — luôn mở ở TUNE ON / LOFI TẮT
            btn.classList.remove("active");
            if (btn.textContent.trim() === data.preset) {
                btn.classList.add("active");
            }
        });
    }

    // BUTTON-RESET: 4 nút Music/Mic1/Mic2/FX KHÔNG được khôi phục ở đây (yêu cầu chính thức của Khói) — luôn khởi tạo theo mặc định HTML.
    // Dữ liệu cũ (musicDisabled/mic1/mic2/fx/fxRequested) có thể còn trong file cấu hình: bị BỎ QUA khi đọc và biến mất ở lần saveData() kế tiếp.

    if (Array.isArray(data.knobs)) { // MENU-FX-AUTO-OFF: cấu hình hỏng (knobs không phải mảng) không được làm đổ cả khởi tạo
        data.knobs.forEach(saved => {
            const knob = knobData.find(k => k.id === saved.id);
            // A96c: Audio chill luôn về mặc định (50) khi mở lại Menu. POPUP-RESET-01: núm âm lượng MIC 1 / MIC 2 (popup chuột phải) cũng về mặc định (90), không khôi phục giá trị cũ.
            if (knob && knob.id !== "audioChillKnob" && knob.id !== "mic1VolKnob" && knob.id !== "mic2VolKnob") {
                knob.value = saved.value;
                updateKnob(knob);
                // TASK A20 — đồng bộ ngay volume Clap/Laugh vào SoundEffectEngine khi khôi
                // phục giá trị đã lưu, để lần play ĐẦU TIÊN (trước khi user chạm knob) phát
                // đúng âm lượng đang hiển thị trên UI, không bị lệch với DEFAULT_VOLUME_0_100.
                if (typeof KNOB_ID_TO_SOUND_EFFECT !== "undefined" && typeof SoundEffectEngine !== "undefined") {
                    const soundEffectId = KNOB_ID_TO_SOUND_EFFECT[knob.id];
                    if (soundEffectId) {
                        SoundEffectEngine.setVolume(soundEffectId, knob.value);
                    }
                }
            }
        });
    }
}

/* ==========================================================
   11. NÚT GHI ĐÈ TAY (bật/tắt quyền chỉnh tone bằng tay, tự tắt sau 5 phút)
   Lưu ý: đây KHÔNG phải nút tắt MOD — MOD (AI dịch tone tự động theo timeline
   bài hát) luôn chạy liên tục, không có khái niệm tắt. Nút này chỉ bật/tắt việc
   CHO PHÉP người dùng ghi đè tạm thời lên trên giá trị AI đang tính.
   ========================================================== */
// Điểm DUY NHẤT chịu trách nhiệm tắt ghi đè tay — dùng chung cho tắt tay và tự động
// tắt sau 5 phút. Khi tắt, phải trả quyền lại cho AI ĐÚNG offset AI đang giữ tại thời
// điểm đó (aiSemitoneOffset, xem mục 12), KHÔNG được ép cứng về 0 — vì lúc tắt ghi đè,
// bài hát có thể đang ở đoạn AI đã tính sẵn +2/+5 bán cung, không phải key gốc.
function turnManualOverrideOff() {
    modPowerBtn.classList.remove("active");
    modPowerBtn.textContent = "OFF";
    reportManualStateSnapshot(); // TASK B3-C — Manual Mod vừa TẮT thật (click OFF hoặc auto-timeout 5 phút), báo Core ngay
    if (toneSelector) { toneSelector.value = "0"; toneSelector.disabled = true; } // Mục VI
    if (applyToneBtn) applyToneBtn.disabled = true; // Mục VI
    setStatus("dot-mod", "pending"); // cam: đang trả quyền lại cho AI, chưa xong

    const modStatusEl = document.getElementById("modStatus");
    if (modStatusEl) modStatusEl.textContent = "Đang tắt SoundShifter & trả quyền cho AI...";

    // Khi tắt ghi đè tay: (1) tắt hẳn SoundShifter (nó chỉ dùng cho ghi đè tay, không
    // dùng cho AI tự động), (2) đưa Auto-Tune về đúng offset AI đang giữ tại thời điểm
    // này (aiSemitoneOffset, mục 12) — KHÔNG ép cứng về 0.
    // MANUAL-KEY-MOD-RESTORE-01: trả SoundShifter về 0 (đúng phần đã dịch tay) TRƯỚC khi tắt nguồn, để lần bật MOD sau không mang theo tone cũ.
    // MOD-MIDI-RESET-01: MOD OFF -> SoundShifter về mặc định bằng lệnh TUYỆT ĐỐI (Semitones 0 rồi Bypass BẬT), không dùng độ lệch tương đối nữa.
    manualToneOffset = 0; manualToneSet = false; soundShifterApplied = 0;
    Promise.all([
        resetSoundShifterToDefault(),
        sendToneTarget(aiSemitoneOffset), // TASK AI-ALG-04 (D8): aiSemitoneOffset là TUYỆT ĐỐI so với Key gốc -> đưa Auto-Tune về đúng offset, không gửi tương đối sai
    ]).then(([shifterResult, autotuneResult]) => {
        const newKey = transposeKey(originalKey, aiSemitoneOffset);
        const currentKeyElLocal = document.getElementById("currentKey");
        if (currentKeyElLocal) currentKeyElLocal.textContent = newKey;

        if (shifterResult.ok && autotuneResult.ok) {
            setStatus("dot-mod", "online"); // xanh: AI đang chủ động điều khiển trở lại, đúng offset
            if (modStatusEl) modStatusEl.textContent = newKey;
        } else {
            setStatus("dot-mod", "offline"); // đỏ: LỖI thật sự (không phải "đã tắt")
            if (modStatusEl) modStatusEl.textContent = "⚠️ Lỗi trả quyền cho AI — kiểm tra Auto-Tune/SoundShifter";
            if (!shifterResult.ok) console.error("setSoundShifterPower(false) lỗi:", shifterResult.detail);
            if (!autotuneResult.ok) console.error("Trả quyền cho AI (Auto-Tune) lỗi:", autotuneResult.detail);
        }
    });

    if (typeof applyPendingServerTimeline === "function") applyPendingServerTimeline(); // đoạn Key server đến lúc MOD tay đang bật -> áp bây giờ
    saveData();
}

modPowerBtn?.addEventListener("click", () => {
    const isActive = modPowerBtn.classList.toggle("active");

    if (isActive) {
        reportManualStateSnapshot(); // TASK B3-C — Manual Mod vừa BẬT thật, báo Core ngay. (Nhánh TẮT dùng chung turnManualOverrideOff() bên dưới — đã tự báo ở đó, không gọi trùng ở đây.)
        modPowerBtn.textContent = "ON";
        // Phiên MOD mới: Tone thủ công bắt đầu từ 0 (đồng bộ với Auto-Tune/SoundShifter thật), dropdown về "0".
        manualToneOffset = 0; manualToneSet = false; soundShifterApplied = 0;
        if (toneSelector) toneSelector.value = "0";
        if (toneSelector) toneSelector.disabled = false; // Mục VII: MOD ON -> Dropdown cho phép chọn Preview
        if (applyToneBtn) applyToneBtn.disabled = false; // Mục VII: MOD ON -> SET cho phép gửi
        setStatus("dot-mod", "pending"); // cam: đang bật SoundShifter, chờ xác nhận

        clearTimeout(modAutoOffTimer);
        modAutoOffTimer = setTimeout(turnManualOverrideOff, 300000);

        const modStatusEl = document.getElementById("modStatus");
        setSoundShifterPower(true).then((result) => {
            if (result.ok) {
                setStatus("dot-mod", "online");
            } else {
                setStatus("dot-mod", "offline");
                if (modStatusEl) modStatusEl.textContent = "⚠️ Lỗi bật SoundShifter";
                console.error("setSoundShifterPower(true) lỗi:", result.detail);
            }
        });

        saveData();
    } else {
        clearTimeout(modAutoOffTimer);
        turnManualOverrideOff();
    }
});

/* ==========================================================
   12. SONG POSITION / MOD PREDICTION ENGINE
   ========================================================== */
function updateModInfo(timeString, oldKey, newKey, semitones) {
    const modTimeEl = document.getElementById("modTime");
    if (modTimeEl) modTimeEl.textContent = timeString;

    const modStatusEl = document.getElementById("modStatus");
    if (modStatusEl) modStatusEl.textContent = oldKey + " → " + newKey;

    const modTimelineEl = document.getElementById("modTimeline");
    if (modTimelineEl) modTimelineEl.textContent = (semitones > 0 ? "+" : "") + semitones + " SEMITONES";
}

// Đã XÓA hệ thống timeline giả cũ (modPredictions/checkModTimeline/simulateModPrediction) —
// nó chọn ngẫu nhiên/theo giờ cố định rồi GỬI LỆNH THẬT xuống Auto-Tune/SoundShifter, chạy
// song song và tranh lệnh với engine dò Mod THẬT (startModulationWatcher, mục 13B) dựa trên
// audio thật. Giữ cả 2 sẽ khiến app tự dịch tone sai vào đúng phút cố định khi đang hát live.

// Offset (bán cung) mà AI đang chủ động giữ tại thời điểm hiện tại của bài hát.
// turnManualOverrideOff() (mục 11) đọc biến này để biết phải trả quyền lại cho AI ở
// đúng giá trị nào, thay vì ép cứng về 0.
let aiSemitoneOffset = 0;

// TASK AI-ALG-03 (D6) — CHUỖI TRẠNG THÁI modulation -> hành động, CHỈ để quan sát/chẩn đoán (không đổi UI, không đổi lệnh gửi).
// Các mức tách biệt: MODULATION_DETECTED (ModEngine thấy) -> ACTION_REQUESTED (renderer định gửi lệnh) ->
// ACTION_SENT_UNCONFIRMED (API gửi không ném lỗi; KHÔNG chứng minh đích đã áp dụng) | ACTION_FAILED |
// ACTION_DEFERRED_MANUAL | ACTION_DELEGATED_AI_CONTROL. KHÔNG có mức "APPLIED": Menu không có cách xác nhận phía Auto-Tune/SoundShifter.
const modPipelineLog = [];
window.__modPipeline = modPipelineLog;
function recordModStage(stage, info) {
    try {
        modPipelineLog.push({ stage, t: Date.now(), ...(info || {}) });
        if (modPipelineLog.length > 50) modPipelineLog.shift();
        if (typeof aiDiag === "function") aiDiag("MOD_STAGE", { stage, ...(info || {}) });
    } catch (e) { /* chẩn đoán không bao giờ được làm hỏng luồng MOD */ }
}

function isManualOverrideActive() {
    return !!(modPowerBtn && modPowerBtn.classList.contains("active"));
}

// ================================
// TASK B3-C — REAL MANUAL STATE IPC. Gửi snapshot Manual Key/Mod THẬT lên Core khi state
// thực sự đổi (không polling). Dùng ĐÚNG 2 nguồn đã tồn tại, không tự suy ra state khác:
//   keyActive -> keySource.manual.active  (Manual Key override, ui/js/renderer.js ~dòng 532+)
//   modActive -> isManualOverrideActive() (Manual Mod override — tên hàm chung chung nhưng
//                thực chất chỉ đọc modPowerBtn.classList, xem định nghĩa ngay trên)
// timestamp = Date.now() tại ĐÚNG lúc renderer tạo snapshot này (không phải lúc Core nhận).
// ================================
function reportManualStateSnapshot() {
    if (!window.electronAPI?.reportManualState) return; // không phải Electron renderer (dev/test) -> bỏ qua, không throw
    window.electronAPI.reportManualState({
        keyActive: !!keySource.manual.active,
        modActive: isManualOverrideActive(),
        timestamp: Date.now(),
    });
}
reportManualStateSnapshot(); // TASK B3-C — báo snapshot ban đầu ngay lúc renderer khởi tạo (cả 2 field false lúc app vừa mở), để Core không phải chờ tới lần đổi state đầu tiên mới có dữ liệu.

// Điểm DUY NHẤT thực sự áp 1 sự kiện mod — được gọi từ startModulationWatcher() (mục 13B)
// khi engine dò Mod thật (chromagram) phát hiện Key hiện tại lệch khỏi Key gốc.
// Vừa cập nhật UI, vừa gửi lệnh thật xuống Auto-Tune, trừ khi đang bị ghi đè tay.
async function applyModEvent(data) {
    const newKey = transposeKey(originalKey, data.semitone);
    if (!(typeof manualToneSet !== "undefined" && manualToneSet && isManualOverrideActive())) updateModInfo(data.time, originalKey, newKey, data.semitone); // MOD tay đang hiển thị -> AI không ghi đè (giá trị AI vẫn được ghi nhận bên dưới)
    aiSemitoneOffset = data.semitone;

    // Gửi kết quả sang Core (AIContext) qua IPC — không ảnh hưởng logic gửi lệnh Auto-Tune bên dưới
    window.electronAPI?.reportAiResult("mod", { from: originalKey, to: newKey, semitone: data.semitone, time: data.time });

    if (isManualOverrideActive()) {
        // Đang bị ghi đè tay -> chỉ ghi nhận giá trị AI muốn áp, KHÔNG gửi lệnh thật lúc
        // này để tránh đánh nhau với lệnh tay đang chủ động điều khiển Auto-Tune. Giá trị
        // này sẽ được áp khi người dùng tắt ghi đè tay (xem turnManualOverrideOff).
        console.log(`[MOD-AI] Muốn dịch ${data.semitone} bán cung (${data.time}) nhưng đang bị ghi đè tay, tạm hoãn.`);
        recordModStage("ACTION_DEFERRED_MANUAL", { semitone: data.semitone });
        return;
    }

    if (isAiControlActive()) {

        // AI_CONTROL: renderer KHÔNG tự gửi lệnh AI xuống Plugin nữa — giá trị đã báo cáo
        // AIContext ở trên (reportAiResult). Việc gửi thật để dành cho Workflow ->
        // PluginController -> Bridge (xem onPluginCommand ở cuối file).
        console.log(`[ControlSource] AI_CONTROL — bỏ qua gửi Mod trực tiếp (${data.semitone} bán cung), chờ Bridge từ Core.`);
        recordModStage("ACTION_DELEGATED_AI_CONTROL", { semitone: data.semitone });
        setStatus("dot-mod", "online");
        return;

    }

    setStatus("dot-mod", "pending"); // cam: AI đang gửi lệnh dịch tone theo modulation thật dò được
    // TASK AI-ALG-04 (D8/D10) — data.semitone = độ lệch TUYỆT ĐỐI so với Key gốc (0 = quay về Key gốc). sendToneTarget() tự tính số bước
    // cần gửi = target - tone đã gửi trước đó (toneState), nên modulation nối tiếp / quay về gốc / khởi động lại watcher không dịch dư.
    recordModStage("ACTION_REQUESTED", { semitone: data.semitone, kind: data.kind ?? null });
    const result = await sendToneTarget(data.semitone);
    recordModStage(result.ok ? "ACTION_SENT_UNCONFIRMED" : "ACTION_FAILED", {
        semitone: data.semitone, kind: data.kind ?? null, driverUsed: result.driverUsed ?? null, confirmation: result.confirmation ?? null,
        appliedBefore: result.appliedBefore, delta: result.delta, stepsRequested: result.stepsRequested, stepsSent: result.stepsSent,
        appliedAfter: result.appliedAfter, uncertain: result.uncertain || result.toneStateUncertain || false, status: result.status ?? null,
        detail: result.ok ? undefined : result.detail,
    });

    if (result.ok) {
        setStatus("dot-mod", "online"); // xanh: AI đã GỬI lệnh (chưa phải "đã áp dụng" — xem recordModStage ở trên)
    } else {
        setStatus("dot-mod", "offline"); // đỏ: LỖI thật sự, không phải "đã tắt"
        const modStatusEl = document.getElementById("modStatus");
        if (modStatusEl) modStatusEl.textContent = "⚠️ Lỗi gửi Mod (AI)";
        console.error("[MOD-AI] sendToneStep lỗi:", result.detail);
    }
}

// ==========================================================
// MOD THEO ĐOẠN KEY SERVER (Claude C). Bài có >= 2 đoạn Key khác nhau trên server:
//  - main gửi KẾ HOẠCH (key-timeline-plan): hiện "02:23 | Eb → E | +1 SEMITONES" trong khung MOD.
//  - tới đúng phút, main bắn key-timeline-fire 1 lần: đổi Key của Song Database sang tone mới rồi để KHỐI KEY gửi xuống Auto-Tune
//    (đúng đường applyActiveKeyToPlugin có sẵn). KHÔNG chạm SoundShifter (SoundShifter chỉ chạy khi người dùng bấm SET).
//  - Key chọn tay (Manual) luôn thắng; MOD tay đang bật thì giữ lại, áp khi tắt MOD tay.
// ==========================================================
function renderServerTimelineDisplay() {
    const plan = __serverTimelinePlan;
    if (!plan || !plan.changes || !plan.changes.length) return;
    if (typeof manualToneSet !== "undefined" && manualToneSet && isManualOverrideActive()) return; // Tone tay đang hiển thị -> không ghi đè
    const c = plan.changes[Math.min(__serverTimelineNextIdx, plan.changes.length - 1)];
    updateModInfo(c.time, c.from, c.to, c.semitone);
}

function applyServerTimelineFire(evt) {
    const plan = __serverTimelinePlan;
    if (!plan || !evt || typeof evt.toKeyName !== "string") return false;
    if (keySource.manual.active || keySource.manual.sending) {
        console.log(`[KeyTimeline] ${evt.time}: Key đang chọn TAY -> không tự đổi sang ${evt.toKeyName}`);
        return false;
    }
    if (!keySource.songDb.active) {
        console.log(`[KeyTimeline] ${evt.time}: Song Database không còn hiệu lực -> bỏ qua`);
        return false;
    }
    if (__dbBypass.active) { // TASK AUTO-RELISTEN-01: người dùng đã bấm dò lại, AI đang thay Database cho bài này
        console.log(`[KeyTimeline] ${evt.time}: AI đang thay Database (bấm Auto Detect) -> không đổi sang ${evt.toKeyName}`);
        return false;
    }
    if (isManualOverrideActive()) {
        __serverTimelinePending = evt; // MOD tay đang chạy: không đánh nhau với lệnh tay, áp khi tắt MOD tay
        console.log(`[KeyTimeline] ${evt.time}: MOD tay đang bật -> giữ ${evt.toKeyName}, áp khi tắt MOD tay`);
        return false;
    }
    __serverTimelinePending = null;
    __serverTimelineNextIdx = plan.changes.filter((c) => c.index <= evt.index).length;
    keySource.songDb.value = evt.toKeyName;
    applyActiveKeyToPlugin("Server Timeline " + evt.time); // Key gửi tone mới xuống Auto-Tune (có dedupe, Scale, Mic2 như mọi lần gửi Key)
    const done = plan.changes.find((c) => c.index === evt.index);
    recordModStage("SERVER_TIMELINE_KEY", { time: evt.time, from: evt.fromName, to: evt.toName, semitone: done ? done.semitone : null });
    window.electronAPI?.reportAiResult?.("mod", { from: evt.fromName, to: evt.toName, semitone: done ? done.semitone : 0, time: evt.time });
    renderServerTimelineDisplay();
    return true;
}

function applyPendingServerTimeline() {
    if (__serverTimelinePending && !isManualOverrideActive()) {
        const evt = __serverTimelinePending;
        __serverTimelinePending = null;
        applyServerTimelineFire(evt);
    }
}

if (window.electronAPI?.onKeyTimelinePlan) {
    window.electronAPI.onKeyTimelinePlan((plan) => {
        __serverTimelinePending = null;
        if (plan && Array.isArray(plan.changes) && plan.changes.length) {
            __serverTimelinePlan = plan;
            __serverTimelineNextIdx = 0;
            console.log("[KeyTimeline] Bài có đoạn đổi tone: " + plan.changes.map((c) => c.label).join(" | "));
            renderServerTimelineDisplay();
        } else {
            __serverTimelinePlan = null;
            __serverTimelineNextIdx = 0;
        }
    });
}
if (window.electronAPI?.onKeyTimelineFire) {
    window.electronAPI.onKeyTimelineFire((evt) => { applyServerTimelineFire(evt); });
}

// TASK A72-04/05/06 — tách riêng phần RESET HIỂN THỊ (không đụng thuật toán/engine) thành 1 hàm
// dùng chung, để dùng lại được ở CẢ nút "Auto Detect" (người dùng tự bấm, ĐANG chạy engine, chỉ
// xoá chữ tạm) LẪN ở chỗ mất SYSTEM_AUDIO (đóng engine luôn — xem systemAudio.onDeviceLost bên
// dưới). Hành vi 2 nơi gọi hàm này VẪN KHÁC NHAU (nơi nào cần stop() engine thì tự gọi thêm,
// hàm này chỉ lo phần chữ) — không gộp logic khác nhau vào chung 1 chỗ.
// TASK KEY-CORRECT-01 — Key AI đã chốt nhưng sai thì phải tự sửa được.
// Vấn đề: KeyEngine chốt Key rất khó đổi (nhiều cổng chống nhảy) nên Key chốt sớm sai bị giữ mãi,
// trong khi dòng "AI Detect: ... (đang dò...)" cho thấy AI đã dò ra Key khác.
// Quy tắc: khi nguồn đang dùng là AI (không phải Manual / Song Database), nếu Key đang dò (provisional)
// KHÁC Key đã chốt và giữ NGUYÊN MỘT Key như vậy liên tục >= KEY_CORRECT_HOLD_MS thì đổi sang Key đó.
// Không đụng KeyEngine; không đụng Manual / Database; chỉ đổi keySource.ai.value rồi áp qua đường có sẵn.
const KEY_CORRECT_HOLD_MS = 10000;
let __keyCorrectCand = null;
let __keyCorrectSince = 0;
function __keyCorrectionReset() { __keyCorrectCand = null; __keyCorrectSince = 0; }
// Key "láng giềng cách 5 đúng" (cùng chế độ, lệch 5 hoặc 7 nửa cung, vd F <-> A#/Bb): bản dò nhanh hay nhầm Key HỢP ÂM ÁT
// (F7) thành "nhà" (B♭) nên KHÔNG cho tự sửa theo cặp này — Key đã chốt được giữ nguyên (xem báo cáo FIX KEY-CORRECT-02).
const __KC_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function __kcParse(k) {
    const m = typeof k === "string" ? k.trim().match(/^([A-G])([#b♯♭]?)\s*(Major|Minor)$/i) : null;
    if (!m) return null;
    let pc = __KC_PC[m[1].toUpperCase()];
    if (m[2] === "#" || m[2] === "♯") pc += 1; else if (m[2] === "b" || m[2] === "♭") pc -= 1;
    return { pc: (pc + 12) % 12, mode: m[3].toLowerCase() };
}
function __keyIsFifthNeighbor(a, b) {
    const x = __kcParse(a), y = __kcParse(b);
    if (!x || !y || x.mode !== y.mode) return false;
    const d = (x.pc - y.pc + 12) % 12;
    return d === 5 || d === 7;
}
function __keyCorrectionTick(provKey) {
    try {
        if (!keyEverDetected || typeof provKey !== "string" || !provKey
            || provKey === keySource.ai.value
            || getActiveSourceName() !== "ai"
            || (keySource.manual && keySource.manual.sending)) { __keyCorrectionReset(); return; }
        if (__keyIsFifthNeighbor(provKey, keySource.ai.value)) { __keyCorrectionReset(); return; } // F <-> A#: giữ Key đã chốt
        const now = Date.now();
        if (provKey !== __keyCorrectCand) { __keyCorrectCand = provKey; __keyCorrectSince = now; return; }
        if (now - __keyCorrectSince < KEY_CORRECT_HOLD_MS) return;
        const oldKey = keySource.ai.value;
        keySource.ai.value = provKey;
        __keyCorrectionReset();
        if (typeof aiDiag === "function") aiDiag("KEY_CORRECTED", { from: oldKey, to: provKey, holdMs: KEY_CORRECT_HOLD_MS });
        refreshKeySourceDisplay();
        applyActiveKeyToPlugin("AI Detect");
        startModulationWatcher();
    } catch (e) { /* hiển thị/sửa phụ — không bao giờ được làm hỏng luồng Key */ }
}

function resetAiDisplaysToListening() {
    __aiState.hasConfirmed = false; updateAiSourceStateLabel(); // TASK A74-02
    keyEverDetected = false;
    __keyCorrectionReset();
    if (currentKeyEl) currentKeyEl.textContent = "LISTENING";
    if (aiKeyDetectLineEl) aiKeyDetectLineEl.textContent = "AI Detect: LISTENING";

    const bpmDisplayEl = document.getElementById("currentBpm");
    if (bpmDisplayEl) bpmDisplayEl.textContent = "LISTENING";

    const modTimeResetEl = document.getElementById("modTime");
    const modStatusResetEl = document.getElementById("modStatus");
    const modTimelineResetEl = document.getElementById("modTimeline");
    if (modTimeResetEl) modTimeResetEl.textContent = "";
    if (modStatusResetEl) modStatusResetEl.textContent = "LISTENING";
    if (modTimelineResetEl) modTimelineResetEl.textContent = "";
    renderServerTimelineDisplay(); // bài có đoạn Key từ server: giữ hiện "phút - tone" (không bị chữ LISTENING đè)
    if (typeof manualToneSet !== "undefined" && manualToneSet && isManualOverrideActive()) renderManualToneDisplay(); // AUTO DETECT chỉ reset phần AI; Tone tay người dùng đã SET vẫn hiển thị đúng
}

document.getElementById("autoDetectBtn")?.addEventListener("click", () => { // A119: Chế độ Auto-Key — nút AUTO DETECT (kể cả bấm tự động khi đổi bài) kích hoạt Auto-Key dò + Send
    if (typeof runAutoKeyDetect === "function") runAutoKeyDetect("AUTO DETECT");
});
document.getElementById("autoDetectBtn")?.addEventListener("click", () => {
    console.log("RESET AI SCAN — reset BPM + KEY + MOD, dò lại từ đầu trên CÙNG nguồn SYSTEM_AUDIO đang chạy");

    // TASK AUTO-RELISTEN-01 — người dùng bấm AUTO DETECT khi bài đang dùng Key Database: đánh dấu "chờ AI chốt".
    // Trong lúc AI đang nghe lại, Auto-Tune vẫn dùng Key Database (không im/lệch); AI chốt xong mới thay.
    if (!__autoDetectInternal) { __dbBypass.active = false; __dbBypass.pending = !!keySource.songDb.active; }

    // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — Auto Detect = reset THẬT về chế độ nghe
    // (LISTENING) cho cả Key/BPM/MOD, không giữ hiển thị giá trị cũ trong lúc chờ kết quả mới.
    // CHỈ đổi CHỮ hiển thị ở đây — KHÔNG đụng originalKey/keySource.ai.value/lastPluginKey, nên
    // Auto-Tune vẫn tiếp tục dùng đúng Key thật đang chạy cho tới khi có kết quả THẬT mới (không
    // im lặng/lệch tiếng giữa chừng bài hát).
    resetAiDisplaysToListening();

    // TASK A75-06 — ĐÃ ĐỔI: trước đây chỉ reset chữ hiển thị, BPMEngine/ModEngine "vẫn chạy nền
    // như cũ, không bị restart" (xem lịch sử git) — KHÔNG đúng ý nghĩa thật của "reset AI scan".
    // Nay Auto Detect reset THẬT cả 3 engine, dùng LẠI đúng nguồn SYSTEM_AUDIO đang RUNNING (không
    // tạo AudioContext/MediaStreamSource mới, không đóng/mở lại thiết bị — chỉ reset trạng thái
    // phân tích nội bộ của từng engine, nhẹ hơn và nhanh hơn 1 chu kỳ stop()/start() đầy đủ).
    if (window.__systemAudioSource?.getState?.() === AudioSourceState.RUNNING) {
        // bindAiEnginesToSystemAudio() tự gọi BPMEngine.stop()+init() và KeyEngine.stop()+init()
        // với CHÍNH XÁC audioContext/source hiện tại — không duplicate AudioContext/analyser (đúng
        // cơ chế C62 có sẵn, không viết logic mới). __systemAudioListenersRegistered vẫn giữ
        // nguyên true nên KHÔNG đăng ký thêm listener trùng.
        bindAiEnginesToSystemAudio(window.__systemAudioSource);
    }
    if (window.__keyDetectStopWatcher) { window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null; }
    if (typeof ModEngine !== "undefined") ModEngine.stop();

    triggerAiKeyDetect();
});

// Bộ dò modulation chạy NGẦM LIÊN TỤC suốt bài hát — do ModEngine (ui/js/engines/modEngine.js)
// quản lý toàn bộ vòng lặp + state. Hàm này chỉ có nhiệm vụ: tính rootIndex của Key gốc rồi
// giao cho ModEngine, và định nghĩa applyModEvent làm callback khi ModEngine phát hiện lệch key.
function startModulationWatcher() {
    const rootMatch = originalKey.match(/^([A-G](?:#|b)?)/);
    const normalizedRoot = flatToSharp[rootMatch?.[1]] || rootMatch?.[1];
    const originalRootIndex = KeyEngine.NOTE_NAMES.indexOf(normalizedRoot);

    // TASK B14 (MOD Tone-Change Analysis) — reset UI về đúng trạng thái LISTENING mỗi lần bắt
    // đầu dò lại (bài mới / RESET AI) — TRƯỚC bản vá này, 3 ô modTime/modStatus/modTimeline chỉ
    // có dữ liệu TĨNH giả trong index.html ("02:15", "G#m → Am", "+5 SEMITONES") và KHÔNG BAO
    // GIỜ được ghi đè trừ khi modulation thật đã xảy ra — nghĩa là 1 bài KHÔNG modulation vẫn
    // hiển thị y hệt như đã phát hiện modulation giả, sai đúng yêu cầu Mục 5 "Nếu bài không có
    // modulation: LISTENING". Không đụng logic phát hiện/dispatch, chỉ thêm đúng bước reset UI.
    const modTimeEl = document.getElementById("modTime");
    const modStatusEl = document.getElementById("modStatus");
    const modTimelineEl = document.getElementById("modTimeline");
    if (modTimeEl) modTimeEl.textContent = "";
    if (modStatusEl) modStatusEl.textContent = "LISTENING";
    if (modTimelineEl) modTimelineEl.textContent = "";
    renderServerTimelineDisplay(); // bài có đoạn Key từ server: hiện lại "phút - tone" thay cho LISTENING
    if (typeof manualToneSet !== "undefined" && manualToneSet && isManualOverrideActive()) renderManualToneDisplay(); // không xoá Tone tay đang hiển thị

    // TASK AI-ALG-03 — truyền mode của Key gốc để ModEngine phân biệt đổi mode / giọng tương đối / modulation thật.
    // Không parse được mode (định dạng lạ) => undefined => ModEngine chạy đúng hành vi cũ (root-only).
    const originalMode = /minor/i.test(originalKey) ? "Minor" : (/major/i.test(originalKey) ? "Major" : null);
    ModEngine.start(originalRootIndex, (data) => {
        // Bài đã có kế hoạch đổi tone từ Key Server -> server là nguồn đúng, không để dò audio gửi thêm lệnh dịch tone chồng lên.
        if (__serverTimelinePlan) { recordModStage("SKIPPED_SERVER_TIMELINE", { semitone: data.semitone }); return; }
        const mins = String(Math.floor(songSeconds / 60)).padStart(2, "0");
        const secs = String(songSeconds % 60).padStart(2, "0");
        applyModEvent({ time: `${mins}:${secs}`, semitone: data.semitone });
    }, isManualOverrideActive, (state, payload) => {
        // Chỉ ghi nhận (không điều khiển gì). KEY_LABEL_CHANGED = đổi nhãn Key/mode, KHÔNG có lệnh dịch pitch.
        if (state === "MODULATION_DETECTED" || state === "KEY_LABEL_CHANGED") recordModStage(state, { semitone: payload?.semitone, kind: payload?.kind, from: payload?.from, to: payload?.to ?? payload?.targetKey });
    }, originalMode ? { originalMode } : undefined);
}

let songSeconds = 0;
// Lúc gần nhất songSeconds được kéo theo vị trí THẬT của bài (từ đồng hồ Now Playing bên dưới). 0 = chưa từng.
// Đang "đồng bộ" (<3s) thì KHÔNG tự cộng thêm nữa; nguồn không báo vị trí -> đếm tự do như cũ.
let __songClockSyncedAt = 0;
function updateSongPosition() {
    const posEl = document.getElementById("songPosition");
    if (!posEl) return;

    const mins = String(Math.floor(songSeconds / 60)).padStart(2, "0");
    const secs = String(songSeconds % 60).padStart(2, "0");
    posEl.textContent = `${mins}:${secs}`;
    if (Date.now() - __songClockSyncedAt > 3000) songSeconds++;
}
setInterval(updateSongPosition, 1000);

/* ==========================================================
   ĐỒNG HỒ NOW PLAYING — "01:23 / 04:05" cạnh tên bài, phía nút ⚙ (Claude C)
   ----------------------------------------------------------
   Main process (app/main.js) gửi "now-playing-position" với vị trí/thời lượng THẬT của bài đang phát
   (MPC-HC hoặc trình duyệt qua Windows SMTC). Phần tử được tạo bằng JS và gắn vào hàng NOW PLAYING sẵn có
   (không sửa index.html). Nguồn không báo thời lượng -> hiện "--:-- / --:--" (không bịa số).
   Mỗi lần nhận vị trí thật còn kéo songSeconds (đồng hồ MOD) theo, nên người nghe tua tới đoạn lên tone thì
   đồng hồ hiển thị + MOD đi theo đúng đoạn đó.
   ========================================================== */
(function setupNowPlayingClock() {

    const host = document.querySelector(".now-playing");
    if (!host) return; // an toàn nếu HTML thiếu phần tử

    // Kiểu đặt thẳng bằng JS (không thêm gì vào style.css) để KHÔNG đổi file giao diện nào. Giữ cùng tông màu/cỡ chữ với NOW PLAYING.
    const el = document.createElement("span");
    el.id = "nowPlayingClock";
    el.style.cssText = "font-size:12px;font-weight:600;color:#8fe9ff;letter-spacing:.3px;white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums;";
    el.style.display = "none"; // chưa có bài -> ẩn
    host.appendChild(el);

    // CLOCK-VERTICAL-01: bản thứ 2 của đồng hồ bài hát, đặt NỬA PHẢI thẻ TIME (thẻ TIME chia đôi: giờ hệ thống | thời lượng bài).
    // Chỉ hiện ở chế độ dọc (CSS body.vertical-mode); chế độ ngang vẫn dùng bản cạnh tên bài như cũ. Tạo bằng JS, không sửa HTML.
    const timeCard = document.querySelector("#clock")?.closest(".status-card");
    let cardEl = null;
    if (timeCard) {
        const box = document.createElement("div");
        box.id = "nowPlayingClockCard";
        box.className = "status-left";
        box.innerHTML = '<div><div class="status-title">THỜI LƯỢNG BÀI</div><div id="nowPlayingClockCardValue" class="status-sub status-sub-time">--:-- / --:--</div></div>';
        timeCard.appendChild(box);
        cardEl = box.querySelector("#nowPlayingClockCardValue");
        // Kiểu cho nửa phải thẻ TIME đặt bằng JS (không sửa style.css/HTML, giống đồng hồ bên cạnh tên bài).
        if (document.head) {
            const st = document.createElement("style");
            st.textContent = "#nowPlayingClockCard{display:none;}"
                + "body.vertical-mode .status-card:has(#clock){justify-content:space-between;}"
                + "body.vertical-mode .status-card:has(#clock)>.status-left{flex:1 1 0;min-width:0;}"
                + "body.vertical-mode #nowPlayingClockCard{display:flex;justify-content:flex-end;text-align:right;}"
                + "body.vertical-mode #nowPlayingClock{display:none !important;}";
            document.head.appendChild(st);
        }
    }

    // 125 -> "02:05"; từ 1 giờ -> "1:02:05"; không hợp lệ -> "--:--" (cùng quy ước NowPlayingClock.formatClock bên main).
    function fmt(sec) {
        if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "--:--";
        const s = Math.floor(sec);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, "0");
        return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
    }

    function render(data) {

        if (!data) {
            el.style.display = "none";
            el.textContent = "";
            if (cardEl) { cardEl.textContent = "--:-- / --:--"; cardEl.style.opacity = "0.4"; } // CLOCK-VERTICAL-01: chưa có bài
            return;
        }

        el.style.display = "";

        if (!data.hasTimeline) {
            el.textContent = "--:-- / --:--";
            el.style.opacity = "0.4"; // mờ: nguồn này không báo thời lượng
            el.title = "Nguồn nhạc này chưa báo thời lượng bài cho Windows";
            if (cardEl) { cardEl.textContent = "--:-- / --:--"; cardEl.style.opacity = "0.4"; }
            return;
        }

        el.style.opacity = data.playing ? "1" : "0.6"; // tạm dừng: mờ nhẹ
        el.textContent = `${fmt(data.positionSec)} / ${fmt(data.durationSec)}`;
        el.title = data.playing ? "Thời gian bài đang phát / thời lượng" : "Đang tạm dừng";
        if (cardEl) { cardEl.style.opacity = data.playing ? "1" : "0.6"; cardEl.textContent = el.textContent; } // CLOCK-VERTICAL-01

        // Kéo đồng hồ MOD theo vị trí thật (xem updateSongPosition ở trên).
        songSeconds = Math.floor(data.positionSec);
        __songClockSyncedAt = Date.now();

    }

    if (window.electronAPI && typeof window.electronAPI.onNowPlayingPosition === "function") {
        window.electronAPI.onNowPlayingPosition(render);
    }

})();

/* ==========================================================
   13. AUDIO ENGINE — khởi tạo audio dùng chung, giao việc cho 3 engine riêng
   -----------------------------------------------------------
   renderer.js CHỈ lo phần chung bắt buộc phải làm 1 LẦN (xin quyền
   getUserMedia đúng soundcard đã chọn, tạo 1 AudioContext + 1 source node) —
   vì mở 2 lần getUserMedia cho cùng 1 thiết bị vừa lãng phí vừa dễ lỗi.
   Từ đó trở đi, BPMEngine/KeyEngine (ui/js/engines/) TỰ tạo analyser riêng,
   TỰ chạy vòng lặp riêng, TỰ quản lý toàn bộ state của mình — renderer.js
   không còn giữ biến DSP nào (không analyser, không chromaVector...) nữa.
   ModEngine (mục 12) lại tự quản lý phần dò modulation của nó, chỉ đọc
   kết quả 1 chiều từ KeyEngine.
   ========================================================== */
let audioMonitorStarted = false;
let __lastKnownSystemAudioDeviceId = null; // TASK C62 — theo dõi đổi Soundcard từ Setup khi app đang chạy
let __lastKnownMicDeviceId = null; // TASK B72 (gộp B72+B72.1) — theo dõi đổi MIC Input từ Setup khi app đang chạy

// ---- DEBUG TẠM THỜI: in ra Console mỗi ~1 giây để kiểm tra mức tín hiệu thật ----
// Xoá 2 hàm này sau khi đã xác định app chạy ổn định lâu dài.
let __debugLastLog = 0;
function __debugLogAudioLevel(bassEnergy, localAvg, maxByte) {
    if (typeof __aiCoreCfg !== "function" || !__aiCoreCfg().debug) return; // A113: Setup > Lõi AI > "Gỡ lỗi"
    const now = Date.now();
    if (now - __debugLastLog < 1000) return;
    __debugLastLog = now;
    console.log(
        `[DEBUG audio] bassEnergy=${bassEnergy.toFixed(1)} | avg gần nhất=${localAvg.toFixed(1)} | max byte (0-255)=${maxByte}`
    );
}

// VU METER V2 — log RIÊNG cho RMS/dBFS/vuPercent, tách khỏi __debugLogAudioLevel (bassEnergy/flux)
// để không gây nhầm lẫn 2 metric khi đọc console lúc calibrate.
let __debugLastVuLog = 0;
function __debugLogVuLevel(rms, dbfs, vuPercent, peak) {
    if (typeof __aiCoreCfg !== "function" || !__aiCoreCfg().debug) return; // A113: Setup > Lõi AI > "Gỡ lỗi"
    const now = Date.now();
    if (now - __debugLastVuLog < 1000) return; // throttle 1s — đủ để đọc, không spam console
    __debugLastVuLog = now;
    console.log(
        `[DEBUG VU] rms=${rms.toFixed(4)} | peak=${peak.toFixed(4)} | dBFS=${dbfs === -Infinity ? "-Inf" : dbfs.toFixed(1)} | vuPercent=${vuPercent.toFixed(1)}%`
    );
}

let __debugLastKeyLog = 0;
function __debugLogKeyConfidence() {
    if (typeof __aiCoreCfg !== "function" || !__aiCoreCfg().debug) return; // A113: Setup > Lõi AI > "Gỡ lỗi"
    const now = Date.now();
    if (now - __debugLastKeyLog < 3000) return; // giãn ra 3s/lần cho dễ đọc (trước: 1s)
    __debugLastKeyLog = now;
    const result = KeyEngine.estimateKeyFromChroma();
    console.log(`[DEBUG key] best=${result.key} confidence=${result.confidence.toFixed(3)} (ngưỡng cần=${KeyEngine.MIN_CONFIDENCE})`);

    // DEBUG SÂU: in đủ 12 giá trị để xem THẬT SỰ nốt nào đang mạnh nhất, không suy đoán qua confidence nữa.
    const snap = KeyEngine.getDebugSnapshot();
    const fmt = (arr) => KeyEngine.NOTE_NAMES.map((n, i) => `${n}=${arr[i].toFixed(2)}`).join(" ");
    console.log(`[DEBUG chroma] ${fmt(snap.chromaVector)}`);
    console.log(`[DEBUG bassVotes] ${fmt(snap.bassRootVotes)}`);
}

// TASK B58 — Mic VU và Master VU là 2 AudioSource ĐỘC LẬP với SYSTEM_AUDIO, khởi động
// song song ở updateVuMetersOnly(), KHÔNG chờ/không phụ thuộc startAudioMonitor() (SYSTEM_AUDIO)
// bên dưới. Giữ biến ở scope module để không tạo trùng nếu hàm được gọi lại.
let __micSource = null;
let __dawMasterSource = null;
let __lastKnownMasterDeviceId = ""; // TASK MASTER-VU-01 — theo dõi đổi MASTER Input từ Setup khi app đang chạy

function startMicAndMasterVu() {
    // Mic VU — nguồn HOÀN TOÀN riêng, KHÔNG bao giờ nối onFrame/BPMEngine/KeyEngine.
    if (!__micSource && typeof AudioSource !== "undefined") {
        __micSource = AudioSource.createMicSource();
        __micSource.onLevel(({ vuPercent }) => {
            const meter = document.getElementById("vu-mic-fill");
            if (meter) meter.style.width = Math.max(0, Math.min(100, vuPercent)) + "%";
        });
        __micSource.onDeviceLost((reason) => {
            console.warn("[Audio][MIC] Mất thiết bị mic:", reason);
            const meter = document.getElementById("vu-mic-fill");
            if (meter) { meter.style.width = "0%"; meter.classList.add("vu-bar--nodata"); }
        });
        // TASK B71/B72 — dot-audio (Menu, "AUDIO INTERFACE") phản ánh AudioSourceState THẬT của
        // MIC (xem updateAudioInterfaceDot()) thay vì chỉ đọc 1 chuỗi tên đã lưu. Vì
        // startAudioMonitor() (nơi tạo __micSource) chỉ chạy sau cú click đầu tiên của người
        // dùng (autoplay policy), lần checkAllSystems() đầu tiên lúc DOMContentLoaded sẽ luôn
        // thấy __micSource=null (offline). Đăng ký lại ở đây để chấm cập nhật NGAY khi mic thật
        // sự đổi trạng thái. Đồng thời báo cáo trạng thái MIC qua IPC cho cửa sổ Setup, cùng cơ
        // chế đã có cho SYSTEM_AUDIO (xem listener systemAudio.onStateChange bên dưới).
        __micSource.onStateChange((state) => {
            window.electronAPI?.reportMicState?.({ state });
            checkAllSystems();
            // TASK A76-FIX-R1 (R1-04) — khi MIC không còn RUNNING (STOP / đổi thiết bị / lỗi) vòng
            // lặp level dừng nhưng thanh VU giữ nguyên mức cuối -> trông như MIC vẫn có tiếng.
            if (state !== AudioSourceState.RUNNING) {
                const micMeter = document.getElementById("vu-mic-fill");
                if (micMeter) micMeter.style.width = "0%";
            }
        });
        __micSource.start().catch((err) => console.warn("[Audio][MIC] Không mở được mic (Mic VU sẽ trống):", err));
        // TASK B71/B72 — mốc so sánh khi Setup đổi "MIC Input" (giống hệt cơ chế C62 đã có cho
        // SYSTEM_AUDIO). AudioSource.getMicDeviceId() export riêng cho renderer.js (1 nguồn sự thật).
        __lastKnownMicDeviceId = typeof AudioSource.getMicDeviceId === "function" ? AudioSource.getMicDeviceId() : null;
    }

    // Master VU — TASK MASTER-VU-01: đường âm thanh RIÊNG (selectedMasterDeviceId = đầu vào soundcard
    // nhận lại Main/Output 1+2). Chưa chọn thiết bị => NO_DEVICE + vạch "nodata" như cũ. KHÔNG lấy
    // số liệu từ MIC/SYSTEM_AUDIO, KHÔNG nối AI.
    if (!__dawMasterSource && typeof AudioSource !== "undefined") {
        __dawMasterSource = AudioSource.createDawMasterSource();
        const masterMeter = document.getElementById("vu-master-fill");
        if (masterMeter) masterMeter.classList.add("vu-bar--nodata");
        __dawMasterSource.onLevel(({ vuPercent, noDevice }) => {
            if (!masterMeter) return;
            if (noDevice) { masterMeter.style.width = "0%"; masterMeter.classList.add("vu-bar--nodata"); return; }
            masterMeter.classList.remove("vu-bar--nodata");
            masterMeter.style.width = Math.max(0, Math.min(100, vuPercent)) + "%";
        });
        __dawMasterSource.onStateChange((state) => {
            if (!masterMeter) return;
            if (state !== AudioSourceState.RUNNING) { masterMeter.style.width = "0%"; masterMeter.classList.add("vu-bar--nodata"); }
        });
        __dawMasterSource.onDeviceLost(() => {
            if (masterMeter) { masterMeter.style.width = "0%"; masterMeter.classList.add("vu-bar--nodata"); }
        });
        __lastKnownMasterDeviceId = typeof AudioSource.getMasterDeviceId === "function" ? AudioSource.getMasterDeviceId() : "";
        __dawMasterSource.start();
    }
}

// TASK C62 — đảm bảo BPMEngine.onUpdate()/onLevel()/KeyEngine.onProvisionalEstimate() chỉ được
// đăng ký ĐÚNG 1 LẦN cho toàn bộ vòng đời trang, dù bindAiEnginesToSystemAudio() được gọi lại
// nhiều lần (mỗi lần reconnect) — các hàm onXxx() này là "push vào mảng listener", gọi lại sẽ
// cộng dồn callback trùng lặp (mỗi BPM tick sẽ update DOM/gửi IPC nhiều lần) nếu không có cờ này.
let __systemAudioListenersRegistered = false;

// TASK C62 — (Re)bind BPMEngine/KeyEngine vào audioContext/source hiện tại của systemAudio. Được
// gọi qua systemAudio.onStateChange("RUNNING") — DÙNG CHUNG cho cả lần start() đầu tiên lẫn mọi
// lần audioSource.js tự reconnect sau khi mất thiết bị (1 code path duy nhất, không rẽ nhánh
// riêng cho "lần đầu" và "reconnect" để tránh 2 chỗ code dễ lệch nhau).
function bindAiEnginesToSystemAudio(systemAudio) {
    try {
        // BPMEngine.init()/KeyEngine.init() tự tạo AnalyserNode MỚI mỗi lần gọi nhưng KHÔNG tự
        // huỷ vòng lặp requestAnimationFrame cũ nếu có — phải stop() trước để tránh 2 vòng lặp
        // song song sau mỗi lần reconnect (đúng yêu cầu "không duplicate analyser/loop" mục 7 C62).
        // An toàn khi gọi trước lần init() đầu tiên (stop() tự no-op nếu chưa từng chạy).
        BPMEngine.stop();
        KeyEngine.stop();

        // ADAPTER BOUNDARY (Mục 7/16 B58): audioContext + raw MediaStreamAudioSourceNode lấy
        // ĐÚNG từ AudioSource(SYSTEM_AUDIO) — KHÔNG tự tạo getUserMedia/AudioContext thứ hai ở
        // đây nữa. BPMEngine.init()/KeyEngine.init() được gọi Y NGUYÊN như trước, KHÔNG đổi 1
        // dòng thuật toán AI của Claude A.
        const audioContext = systemAudio.getAudioContextForAdapter();
        const source = systemAudio.getRawSourceNodeForAdapter();

        console.log("[DEBUG audio] SYSTEM_AUDIO RUNNING — audioContext.state:", audioContext.state);

        // Từ đây, mỗi engine tự tạo analyser riêng + tự chạy vòng lặp riêng của nó.
        BPMEngine.init(audioContext, source);
        KeyEngine.init(audioContext, source);
        // TASK AI-KEY-FAST-02 — mỗi lần bind (AUTO DETECT, reconnect, đổi thiết bị) = engine mới => epoch mới;
        // watcher tạo trước đó (epoch/nguồn cũ) bị triggerAiKeyDetect() coi là không còn hợp lệ.
        window.__aiEngineEpoch = (window.__aiEngineEpoch || 0) + 1;
        window.__aiEngineSrc = source;
        if (typeof aiDiag === "function") { let caller = null; try { caller = String(new Error().stack || "").split("\n").slice(2, 4).map((x) => x.trim().replace(/^at\s+/, "")).join(" <- "); } catch (e) {} aiDiag("ENGINE_BIND", { epoch: window.__aiEngineEpoch, caller, srcState: systemAudio?.getState?.() ?? null }); } // TASK AI-KEY-FAST-03 (chỉ log)

        if (!__systemAudioListenersRegistered) {
            __systemAudioListenersRegistered = true;

            BPMEngine.onUpdate((bpm) => {
                aiDiag("BPM_UPDATE", bpm); // AI-NOWPLAYING-OPT-02 (chỉ log)
                const bpmEl1 = document.getElementById("currentBpm");
                const bpmEl2 = document.getElementById("bpmValue");
                if (bpmEl1) bpmEl1.textContent = bpm;
                if (bpmEl2) bpmEl2.textContent = bpm + " BPM";
                setStatus("dot-bpm", "online"); // xanh: đã dò được BPM ổn định, đủ phiếu đồng thuận
                __aiState.hasConfirmed = true; updateAiSourceStateLabel(); // TASK A74-02

                // Gửi kết quả sang Core (AIContext) qua IPC — không ảnh hưởng logic hiển thị phía trên
                window.electronAPI?.reportAiResult("bpm", { bpm });
            });

            BPMEngine.onLevel(({ bassEnergy, localAvg, maxByte, vuPercent, rms, dbfs, dbfsFloat, peak }) => {
                // TASK AI-KEY-FAST-05 — lưu mức mới nhất của analyser BPMEngine (chính là nguồn của Music VU) để đối chiếu với probe KeyEngine.
                (window.__aiLastLevel = window.__aiLastLevel || {}); Object.assign(window.__aiLastLevel, { rms, dbfs, dbfsFloat, peak, vuPercent, maxByte, bassFlux: bassEnergy, t: Date.now() });
                // TASK B58 — Music VU: RMS/dBFS toàn dải của SYSTEM_AUDIO (vuPercent, KHÔNG đổi
                // nguồn số liệu so với #vu-fill cũ — chỉ đổi element đích sang #vu-music-fill).
                window.__fxAuto?.feedLevel(dbfsFloat !== undefined ? dbfsFloat : dbfs); // AI-FX-01: mức nhạc thật của SYSTEM_AUDIO. MENU-FX-AUTO-OFF: dùng dBFS Float (dbfs 8-bit luôn ≈ -45 dB khi có nền nhiễu => không bao giờ xác nhận được im lặng)
                const musicMeter = document.getElementById("vu-music-fill");
                if (musicMeter) musicMeter.style.width = Math.max(0, Math.min(100, vuPercent)) + "%";

                // TASK A74-02 — AI State UI: coi là "có tín hiệu" khi vuPercent vượt ngưỡng tạm thời.
                // KHÔNG dùng riêng điều này để kết luận "AI đang phân tích THÀNH CÔNG" (đề bài cấm) —
                // chỉ dùng để phân biệt NO SIGNAL (im lặng) với ANALYZING (có tín hiệu, chờ xác nhận).
                if (vuPercent > AI_SIGNAL_VU_FLOOR_TENTATIVE) { __aiState.lastSignalTime = Date.now(); }
                updateAiSourceStateLabel();

                // TASK A69 — Bỏ hiển thị Beat VU riêng (gộp VU còn MUSIC/MIC/MASTER). KHÔNG đụng
                // BPMEngine: bassEnergy/localAvg vẫn được tính y nguyên bên trong BPMEngine và vẫn
                // được truyền ra đây (dùng cho __debugLogAudioLevel), chỉ bỏ đoạn ghi ra DOM
                // "vu-beat-fill" vì phần tử đó không còn tồn tại trong HTML.

                __debugLogAudioLevel(bassEnergy, localAvg, maxByte); // <-- DEBUG TẠM THỜI (vẫn log flux/BPM như cũ)
                __debugLogVuLevel(rms, dbfs, vuPercent, peak);       // <-- DEBUG TẠM THỜI (log RMS/dBFS/peak để calibrate)
            });

            KeyEngine.onLevel(() => {
                __debugLogKeyConfidence(); // <-- DEBUG TẠM THỜI (tự throttle 1 lần/giây bên trong)
            });

            // Mục A ("Key tạm" — cải thiện tốc độ cảm nhận): CHỈ cập nhật hiển thị, KHÔNG đụng
            // keySource.ai.value/lock/gửi Plugin — những việc đó vẫn 100% qua startAiRealtimeLoop()
            // (mục 7B) như cũ.
            KeyEngine.onProvisionalEstimate((estimate) => {
                if (typeof __aiCoreCfg === "function" && !__aiCoreCfg().predict) { // A117: Setup > Lõi AI > "Dự đoán" TẮT -> không hiện "Key tạm (đang dò...)", chỉ hiện Key đã chốt
                    if (keySource.ai.provisional) { keySource.ai.provisional = null; refreshKeySourceDisplay(); }
                    return;
                }
                keySource.ai.provisional = estimate.key;
                refreshKeySourceDisplay();
                __keyCorrectionTick(estimate.key); // TASK KEY-CORRECT-01: tự sửa Key AI đã chốt sai
            });
        }

        console.log("Audio Engine đã sẵn sàng! (BPMEngine + KeyEngine tự chạy độc lập)");

        // Chroma cần vài giây tích lũy dữ liệu mới đủ tin cậy — đợi 1 nhịp ngắn trước khi
        // bắt đầu dò, tránh dò ngay lúc chromaVector còn gần như rỗng. triggerAiKeyDetect() đã tự
        // huỷ watcher cũ (window.__keyDetectStopWatcher) trước khi tạo watcher mới, nên an toàn
        // khi gọi lại nhiều lần qua các lần reconnect khác nhau — không tạo vòng dò trùng lặp.
        setTimeout(() => triggerAiKeyDetect(), 2000);
    } catch (err) {
        console.error("Lỗi khởi tạo Audio:", err);
        setStatus("dot-bpm", "offline"); // đỏ: chưa dò được (lỗi mic/quyền truy cập)
    }
}

// TASK A68 — chỉ hiển thị: đánh dấu Music/Beat VU (SYSTEM_AUDIO) là "chưa có dữ liệu thật"
// TASK A68/A69 — chỉ hiển thị: đánh dấu MUSIC VU (SYSTEM_AUDIO) là "chưa có dữ liệu thật"
// (hatch pattern dùng lại đúng class .vu-bar--nodata đã có sẵn từ B58 cho Master VU) khi
// SYSTEM_AUDIO không ở trạng thái RUNNING, để không lẫn với "im lặng/vẫn chạy nhưng 0%".
// KHÔNG đổi audioSource.js/BPMEngine, KHÔNG tạo state machine mới — chỉ đọc lại state đã có.
// A69: bỏ "vu-beat-fill" khỏi danh sách (Beat VU đã bị gộp/xoá khỏi HTML — xem A69-REPORT.md).
function setSystemAudioVuNoData(isNoData) {
    ["vu-music-fill"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (isNoData) {
            el.style.width = "0%";
            el.classList.add("vu-bar--nodata");
        } else {
            el.classList.remove("vu-bar--nodata");
        }
    });
}

async function startAudioMonitor() {
    if (audioMonitorStarted) return; // tránh khởi tạo lặp / mở nhiều stream mic
    audioMonitorStarted = true;
    setStatus("dot-bpm", "pending"); // cam: bắt đầu nghe/phân tích

    // TASK B58 — Mic VU / Master VU khởi động độc lập, không chờ SYSTEM_AUDIO.
    startMicAndMasterVu();

    // TASK B58 — SYSTEM_AUDIO giờ đi qua AudioSource.createSystemAudioSource() (ui/js/audioSource.js).
    // Hành vi audio KHÔNG đổi so với trước (vẫn đúng 1 device do Setup chọn, vẫn tắt echoCancellation/
    // noiseSuppression/autoGainControl, vẫn không rơi về mic mặc định nếu chưa chọn) — chỉ đổi CHỖ
    // các bước này được thực hiện (audioSource.js), để tách rõ semantic SYSTEM_AUDIO khỏi MIC/DAW_MASTER.
    if (typeof AudioSource === "undefined") {
        console.error("[Audio] audioSource.js chưa được nạp — không thể khởi tạo SYSTEM_AUDIO.");
        audioMonitorStarted = false;
        setStatus("dot-bpm", "offline");
        return;
    }

    const systemAudio = AudioSource.createSystemAudioSource();
    window.__systemAudioSource = systemAudio; // giữ tham chiếu cho debug/dừng sau này, không bắt buộc dùng
    __lastKnownSystemAudioDeviceId = AudioSource.getSystemAudioDeviceId(); // TASK C62 — mốc so sánh khi Setup đổi thiết bị

    systemAudio.onDeviceLost((reason) => {
        console.error("[Audio][SYSTEM_AUDIO] Mất thiết bị hoặc lỗi khởi tạo:", reason);
        setStatus("dot-bpm", "offline");
        setSystemAudioVuNoData(true); // TASK A68 — hiển thị lại đúng trạng thái "chưa có dữ liệu" khi mất thiết bị
        // TASK A72-04/05 — PHÁT HIỆN: trước A72, mất SYSTEM_AUDIO chỉ đổi màu chấm trạng thái +
        // VU, nhưng KHÔNG dừng BPMEngine/KeyEngine (vòng lặp cũ vẫn chạy trên analyser đã chết)
        // VÀ không xoá chữ BPM/Key/Mod cũ trên Menu -> đúng hiện tượng "hiển thị kết quả cũ như
        // đang hoạt động" mà A72 cảnh báo. Sửa: dừng BPMEngine/KeyEngine (an toàn — được
        // bindAiEnginesToSystemAudio() khởi tạo lại đối xứng mỗi lần RUNNING, xem hàm đó) + xoá
        // chữ hiển thị. Không đổi thuật toán bên trong 2 file engine — chỉ gọi đúng .stop() đã có
        // sẵn nhưng chưa từng được gọi ở đây.
        //
        // TASK A74-03 — ĐÍNH CHÍNH A72-06 (từng SAI, xem A73-REPORT.md "ModEngine lifecycle" để
        // biết chi tiết điều tra lại): A72 tưởng ModEngine.start() chỉ chạy 1 lần/phiên nên không
        // dám stop(). Audit lại: modEngine.js start() tự gọi stop() ngay dòng đầu ("tránh chạy
        // trùng nhiều watcher") -> TỰ AN TOÀN khi gọi lại. Và startAiRealtimeLoop() (renderer.js)
        // tự TÁI VŨ TRANG sau MỖI lần detect Key mới -> ModEngine.start() thực ra được gọi lại
        // nhiều lần/phiên, không phải đúng 1 lần. Vấn đề THẬT: (1) watcher detectOnce cũ
        // (window.__keyDetectStopWatcher) không bị huỷ khi mất nguồn -> treo chờ dữ liệu từ
        // source đã chết; (2) ModEngine vẫn poll KeyEngine.estimateKeyFromChroma() trên
        // chromaVector ĐÓNG BĂNG (KeyEngine.stop() không xoá nó) -> có thể phát sự kiện modulation
        // giả từ dữ liệu cũ. Sửa cả 2. Reconnect đã có sẵn cơ chế tự khởi động lại (xem
        // setTimeout(triggerAiKeyDetect, 2000) trong bindAiEnginesToSystemAudio bên dưới) — không
        // cần thêm gì cho chiều reconnect.
        if (typeof BPMEngine !== "undefined") BPMEngine.stop();
        if (typeof KeyEngine !== "undefined") KeyEngine.stop();
        if (window.__keyDetectStopWatcher) { window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null; }
        if (typeof ModEngine !== "undefined") ModEngine.stop();
        resetAiDisplaysToListening();
        // TASK C62 — KHÔNG đặt lại audioMonitorStarted=false ở đây nữa: startAudioMonitor() chỉ
        // được gọi ĐÚNG 1 LẦN (click đầu tiên, xem listener {once:true} bên dưới file), nên đặt
        // lại cờ này không còn tạo ra đường "gọi lại" nào — audioSource.js (autoReconnect:true)
        // giờ tự lo việc thử lại, và systemAudio.onStateChange() bên dưới sẽ tự nối lại Key/BPM
        // khi thiết bị quay lại, KHÔNG cần reload app, KHÔNG cần click lại (đúng mục tiêu C62).
    });

    // TASK C62 — (Re)bind Key/BPM mỗi khi SYSTEM_AUDIO chuyển sang RUNNING: bao gồm CẢ lần start()
    // đầu tiên (fire ngay trong lúc await bên dưới, vì setState(RUNNING) chạy đồng bộ trước khi
    // start() trả về) LẪN mọi lần audioSource.js tự reconnect thành công sau này.
    systemAudio.onStateChange((state) => {
        if (state !== AudioSourceState.RUNNING) return;
        setSystemAudioVuNoData(false); // TASK A68 — có dữ liệu thật trở lại, bỏ hatch "nodata"
        bindAiEnginesToSystemAudio(systemAudio);
    });

    // TASK A71 — listener RIÊNG (không gộp vào listener trên) chỉ để báo MỌI transition sang cửa
    // sổ Setup qua IPC, hiển thị badge trạng thái sống. Tách riêng để không đụng vào đúng hình
    // dạng code mà AiSystemBoundaryA56.verify.js đang audit (bindAiEnginesToSystemAudio() vẫn là
    // hàm DUY NHẤT trong listener CŨ, không đổi gì ở đó).
    // TASK B72 (gộp B72+B72.1) — PHÁT HIỆN: listener này đã BỊ MẤT trong bản A72 hiện có trên
    // origin/main (đối chiếu trực tiếp `git show origin/main:ui/js/renderer.js` — không có bất
    // kỳ dòng "reportSystemAudioState" nào), nhiều khả năng thất lạc khi A72 thêm đoạn
    // BPMEngine.stop()/KeyEngine.stop() vào onDeviceLost ở trên. Hậu quả: badge trạng thái sống
    // "SYSTEM_AUDIO Input" trong Setup (A71) bị ĐỨNG HÌNH ở giá trị cache cuối cùng, không còn
    // cập nhật theo thời gian thực — đúng kiểu lỗi mà B72 (Phần B3/B72-08) yêu cầu audit. Khôi
    // phục lại nguyên trạng A71, không đổi gì khác.
    // TASK A76-FIX-R1 (R1-04/R1-01) — PHÁT HIỆN: stop() chủ động (Setup đổi SYSTEM_AUDIO sang
    // thiết bị khác hoặc về None) chỉ phát STOPPING/NO_DEVICE, KHÔNG phát onDeviceLost, nên
    // BPM/Key/Mod vẫn chạy trên nguồn đã đóng, Music VU đứng ở mức cuối và chữ BPM/Key cũ còn
    // đó. Listener riêng (không đổi onDeviceLost ở trên): NO_DEVICE => dừng AI + xoá hiển thị.
    // Khi nguồn mới RUNNING, bindAiEnginesToSystemAudio() khởi tạo lại như cũ.
    // (gộp vào listener báo IPC ngay bên dưới — test A71 khoá đúng 2 lời gọi onStateChange.)
    systemAudio.onStateChange((state) => {
        window.electronAPI?.reportSystemAudioState?.({ state });
        __aiState.sysState = state; updateAiSourceStateLabel(); // TASK A74-02
        window.__fxAuto?.setSourceState(state === AudioSourceState.RUNNING); // AI-FX-01
        if (state === AudioSourceState.NO_DEVICE) {
            setSystemAudioVuNoData(true);
            if (typeof BPMEngine !== "undefined") BPMEngine.stop();
            if (typeof KeyEngine !== "undefined") KeyEngine.stop();
            if (window.__keyDetectStopWatcher) { window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null; }
            if (typeof ModEngine !== "undefined") ModEngine.stop();
            resetAiDisplaysToListening();
        }
    });

    setSystemAudioVuNoData(true); // TASK A68 — mặc định "chưa có dữ liệu" cho tới khi RUNNING lần đầu

    await systemAudio.start();

    if (systemAudio.getState() !== AudioSourceState.RUNNING) {
        // NO_DEVICE hoặc ERROR — không rơi về mic mặc định (KHÔNG đổi hành vi này).
        // TASK A65 — cập nhật lại NỘI DUNG thông điệp (chỉ console.error, KHÔNG phải text hiển
        // thị trên UI — xem A65-REPORT.md mục 5): kể từ A65, "Setup > Soundcard" (selectedSoundcardId)
        // KHÔNG còn cấp device cho SYSTEM_AUDIO nữa (xem GAP-1 trong A64-REPORT.md — dropdown đó trên
        // máy thật là Mix 01/MIC). SYSTEM_AUDIO giờ đọc riêng "selectedSystemAudioDeviceId".
        // TASK B71 — nay ĐÃ có Setup UI riêng ("SYSTEM_AUDIO Input", xem setup.js
        // initSystemAudioInputSection()); trước đó chỉ cấu hình được qua DevTools thủ công.
        console.error(
            systemAudio.getState() === AudioSourceState.NO_DEVICE
                ? "[Audio][B71] SYSTEM_AUDIO chưa được cấu hình (selectedSystemAudioDeviceId rỗng) -> " +
                  "KHÔNG khởi tạo Key/BPM/MOD (không dùng selectedSoundcardId/MIC làm SYSTEM_AUDIO). " +
                  "Cấu hình tại Setup > Audio > \"SYSTEM_AUDIO Input\"."
                : "[Audio] Thiết bị SYSTEM_AUDIO đã cấu hình không còn khả dụng hoặc lỗi khởi tạo -- sẽ tự thử lại " +
                  "ngầm khi thiết bị quay lại (không cần reload)."
        );
        setStatus("dot-bpm", "offline");
        const bpmEl2 = document.getElementById("bpmValue");
        // TASK B71 — Mục D: phân biệt RÕ "chưa cấu hình" (NO_DEVICE) với "lỗi/mất thiết bị"
        // (ERROR), thay vì chỉ có 1 thông điệp cho NO_DEVICE và im lặng (giữ "-- BPM") cho
        // ERROR. Đồng thời đổi chữ "Soundcard" (dễ nhầm với card "Audio Interface" trong Setup)
        // thành đúng tên "SYSTEM_AUDIO" khớp với tên mục Setup mới — xem B70-REPORT.md Mục D
        // "Soundcard status discrepancy" (nguyên nhân gốc của nghịch lý nêu trong đề bài B70/B71).
        if (bpmEl2) {
            if (systemAudio.getState() === AudioSourceState.NO_DEVICE) {
                bpmEl2.textContent = "Chưa chọn SYSTEM_AUDIO (Setup)";
            } else if (systemAudio.getState() === AudioSourceState.ERROR) {
                bpmEl2.textContent = "Lỗi thiết bị SYSTEM_AUDIO";
            }
        }
        // TASK C62 — không đặt lại audioMonitorStarted=false: nếu là ERROR (không phải NO_DEVICE),
        // audioSource.js đã tự lên lịch retry — onStateChange ở trên tự lo phần còn lại.
        return;
    }
    // Không cần làm gì thêm ở đây — bindAiEnginesToSystemAudio() đã chạy qua onStateChange() ở trên.
}

async function listAudioInputDevices() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();

        devices.forEach(device => {
            if (device.kind === "audioinput") {
                console.log(device.label, device.deviceId);
            }
        });

        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error("Không thể liệt kê thiết bị audio:", err);
    }
}

// TASK A75-08 — enumerate ĐẦY ĐỦ audioinput + audiooutput, phân loại DUY NHẤT bằng `device.kind`
// (KHÔNG suy đoán theo tên như "Mix 01"/"Speaker 01" — đúng cấm mục A75-08 đề bài). Đây là hàm
// CHẨN ĐOÁN/tiện ích enumerate thuần (trả về danh sách phân loại đúng kind) — KHÔNG kèm UI chọn
// output/routing nào (routing/Audio Output UI vẫn thuộc phạm vi B72, không triển khai ở A75).
async function enumerateAudioDevices() {
    try {
        // TASK A75-08 — KHÔNG tự xin quyền mic riêng ở đây (tránh thêm 1 lệnh mở mic không ràng
        // buộc thứ hai trong file — AiSystemBoundaryA56/AudioRoutingClosureC61 khoá CHẶT bất biến
        // "đúng 1 lệnh mở mic kiểu này", đề phòng vô tình mở thêm 1 đường mic thật). Nếu quyền mic
        // chưa từng được cấp (chưa chạy listAudioInputDevices() hay mở SYSTEM_AUDIO lần nào), label
        // có thể trống — chấp nhận được cho 1 hàm chẩn đoán gọi tay qua DevTools.
        const devices = await navigator.mediaDevices.enumerateDevices();
        const result = { audioinput: [], audiooutput: [], other: [] };
        devices.forEach((d) => {
            const entry = { label: d.label || "(không có tên)", deviceId: d.deviceId, groupId: d.groupId };
            if (d.kind === "audioinput") result.audioinput.push(entry);
            else if (d.kind === "audiooutput") result.audiooutput.push(entry);
            else result.other.push({ ...entry, kind: d.kind });
        });
        return result;
    } catch (err) {
        console.error("[A75-08] enumerateAudioDevices() lỗi:", err);
        return { audioinput: [], audiooutput: [], other: [], error: String(err) };
    }
}
window.enumerateAudioDevices = enumerateAudioDevices; // gọi tay trong DevTools để chẩn đoán

/* ==========================================================
   14. ELECTRON API HOOKS (có kiểm tra tồn tại trước khi gọi)
   ========================================================== */
(async () => {
    try {
        console.log("electronAPI =", window.electronAPI);
        if (window.electronAPI?.ping) {
            const result = await window.electronAPI.ping();
            console.log("Electron OK:", result);
        }
    } catch (err) {
        console.error(err);
    }
})();

document.addEventListener("keydown", async (e) => {
    if (e.key === "F8") {
        console.log("F8 DETECTED");
        if (window.electronAPI?.runAHK) {
            try {
                await window.electronAPI.runAHK();
            } catch (err) {
                console.error("runAHK lỗi:", err);
            }
        }
    }
});

/* ==========================================================
   PHÍM TẮT TỰ ĐỊNH NGHĨA (cấu hình ở cửa sổ Setup > Hệ thống phím tắt)
   ========================================================== */
function clickPresetByName(name) {
    const btn = [...document.querySelectorAll(".preset-btn")]
        .find(b => b.textContent.trim().toUpperCase() === name);
    btn?.click();
}

const SHORTCUT_ACTIONS = {
    normal: () => clickPresetByName("NORM"),
    lofi: () => clickPresetByName("LOFI"),
    rap: () => clickPresetByName("RAP"),
    doTone: () => document.getElementById("autoDetectBtn")?.click(),
    remix: () => clickPresetByName("REMIX")
};

document.addEventListener("keydown", (e) => {
    // Không bắt phím tắt khi đang gõ vào ô nhập liệu
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
    }

    const shortcuts = getSetting?.("shortcuts");
    if (!shortcuts) return;

    const combo = formatKeyCombo(e);

    Object.entries(shortcuts).forEach(([action, keyCombo]) => {
        if (keyCombo && keyCombo === combo && SHORTCUT_ACTIONS[action]) {
            e.preventDefault();
            SHORTCUT_ACTIONS[action]();
        }
    });
});

// TASK B72 (gộp B72+B72.1) — Audio Output cho Internal Audio Backend (CLAP/LAUGH).
// Trạng thái báo về Setup là kết quả THẬT của setSinkId(), không suy từ việc "đã lưu setting":
//   DEFAULT = chưa chọn (dùng output mặc định OS) và áp dụng thành công
//   APPLIED = đã chọn thiết bị cụ thể và setSinkId() thành công (sinkId thật khớp yêu cầu)
//   ERROR   = setSinkId() thất bại (thiết bị mất/không hợp lệ) — KHÔNG tự rơi về thiết bị khác,
//             KHÔNG tự xoá setting đã lưu.
let __lastKnownOutputDeviceId = null;
async function applyAudioOutputSetting() {
    const id = (typeof getSetting === "function" ? getSetting("selectedAudioOutputDeviceId", "") : "") || "";
    __lastKnownOutputDeviceId = id;
    let payload;
    try {
        const r = await SoundEffectEngine.setOutputDevice(id);
        if (!r.ok) {
            payload = { state: "ERROR", requested: id, actual: r.actual, error: r.error };
        } else if (id && r.actual !== id) {
            // setSinkId resolve nhưng sinkId thật không khớp yêu cầu -> không báo APPLIED.
            payload = { state: "ERROR", requested: id, actual: r.actual, error: "sinkId thực tế không khớp thiết bị đã chọn" };
        } else {
            payload = { state: id ? "APPLIED" : "DEFAULT", requested: id, actual: r.actual, error: null };
        }
    } catch (err) {
        payload = { state: "ERROR", requested: id, actual: null, error: String(err?.message || err) };
    }
    if (payload.state === "ERROR") console.warn("[Audio][OUTPUT] Không áp dụng được thiết bị đầu ra:", payload.error);
    window.electronAPI?.reportOutputState?.(payload);
    return payload;
}

window.electronAPI?.onSetupChanged?.(() => {
    // appSettings là cache trong bộ nhớ của renderer này — cửa sổ Setup ghi vào
    // localStorage ở tiến trình của NÓ, nên phải load lại thì mới thấy dữ liệu mới.
    loadSetup?.();
    updateMainStatus();

    // TASK C62 (Test L) — nếu user vừa đổi Soundcard (System Audio) ở Setup trong lúc Menu
    // đang chạy, tự stop() + start() lại SYSTEM_AUDIO với deviceId MỚI — không cần reload cả
    // app. systemAudio.stop() huỷ mọi retry timer cũ (nếu đang chờ reconnect với ID cũ) trước
    // khi start() lại với ID mới, nên không có 2 nguồn/2 retry loop nào cùng tồn tại.
    if (window.__systemAudioSource && typeof AudioSource !== "undefined") {
        const newDeviceId = AudioSource.getSystemAudioDeviceId();
        if (newDeviceId !== __lastKnownSystemAudioDeviceId) {
            console.log("[Audio][SYSTEM_AUDIO] Soundcard vừa đổi ở Setup -> ngắt thiết bị cũ, kết nối lại với thiết bị mới.");
            __lastKnownSystemAudioDeviceId = newDeviceId;
            window.__systemAudioSource.stop();
            window.__systemAudioSource.start();
        }
    }

    // TASK B72 (gộp B72+B72.1) — cùng cơ chế như trên nhưng cho MIC Input. __micSource dùng
    // chung 1 object trong suốt vòng đời trang (không tạo lại) — stop() rồi start() lại là đủ
    // để resolveDeviceId() (getMicDeviceId) được đọc lại với giá trị mới (audioSource.js
    // createMediaDeviceSource().start() luôn gọi resolveDeviceId() lại từ đầu, không cache).
    // MIC không có requireExplicitDevice nên đổi về "" (None) vẫn start() thành công bình
    // thường với mic mặc định hệ thống — không rơi về NO_DEVICE như SYSTEM_AUDIO.
    if (__micSource && typeof AudioSource !== "undefined" && typeof AudioSource.getMicDeviceId === "function") {
        const newMicDeviceId = AudioSource.getMicDeviceId();
        if (newMicDeviceId !== __lastKnownMicDeviceId) {
            console.log("[Audio][MIC] MIC Input vừa đổi ở Setup -> ngắt mic cũ, mở lại với thiết bị mới.");
            __lastKnownMicDeviceId = newMicDeviceId;
            __micSource.stop();
            __micSource.start().catch((err) => console.warn("[Audio][MIC] Không mở được mic sau khi đổi thiết bị:", err));
        }
    }

    // TASK MASTER-VU-01 — MASTER Input đổi ở Setup: ngắt rồi mở lại với thiết bị mới (None => NO_DEVICE).
    if (typeof __dawMasterSource !== "undefined" && __dawMasterSource && typeof AudioSource !== "undefined" && typeof AudioSource.getMasterDeviceId === "function") {
        const newMasterId = AudioSource.getMasterDeviceId();
        if (newMasterId !== __lastKnownMasterDeviceId) {
            console.log("[Audio][MASTER] MASTER Input vừa đổi ở Setup -> mở lại với thiết bị mới.");
            __lastKnownMasterDeviceId = newMasterId;
            __dawMasterSource.stop();
            __dawMasterSource.start();
        }
    }

    // TASK B72 — Audio Output: chỉ áp dụng lại khi lựa chọn thực sự đổi (tránh setSinkId lặp).
    if (typeof SoundEffectEngine !== "undefined" &&
        (getSetting?.("selectedAudioOutputDeviceId", "") || "") !== __lastKnownOutputDeviceId) {
        applyAudioOutputSetting();
    }
});

// Đã bỏ cơ chế "khoá menu chính khi Setup chưa xong 10/10" — checklist đó dựa trên
// mô hình cũ (capture tọa độ chuột là bắt buộc), không còn khớp với kiến trúc hiện tại
// (một số phần đã chuyển hẳn sang MIDI, ví dụ SoundShifter không còn tọa độ nào để kiểm).
// Setup vẫn còn đó để cấu hình, chỉ là không ép buộc phải xong 100% mới cho dùng menu.

function updateMainStatus() {
    const daw = getSetting?.("selectedDAW", "---") ?? "---";
    const autoTune = getSetting?.("selectedAutoTune", "") ?? "";
    const soundcard = getSetting?.("selectedSoundcard", "") ?? "";
    const midiPort = getSetting?.("midiOutputPort", "") ?? "";

    // --- DAW ---
    const dawEl = document.getElementById("statusDAWMain");
    if (dawEl) dawEl.textContent = "" + daw;
    setStatus("dot-daw", getSetting?.("selectedDAW") ? "online" : "offline");

    // --- AUTO TUNE ---
    const atEl = document.getElementById("statusATMain");
    if (atEl) atEl.textContent = autoTune || "Chưa Chọn...";
    setStatus("dot-autotune", autoTune ? "online" : "offline");

    // --- AUDIO INTERFACE / SOUNDCARD ---
    const soundcardEl = document.getElementById("soundcardName");
    if (soundcardEl) {
        const displayName = soundcard || "Chưa Chọn...";
        const MAX_LEN = 22;
        soundcardEl.textContent = displayName.length > MAX_LEN
            ? displayName.slice(0, MAX_LEN - 1).trimEnd() + "…"
            : displayName;
        soundcardEl.title = displayName; // rê chuột để xem tên đầy đủ
    }
    // TASK B72 — KHÔNG còn "setStatus('dot-audio', soundcard ? 'online' : 'offline')" ở đây
    // (dòng cũ — xem ghi chú tại updateAudioInterfaceDot() phía trên). Gọi lại đúng 1 hàm duy
    // nhất để dot-audio không bao giờ có 2 logic khác nhau ghi đè nhau.
    updateAudioInterfaceDot();

    // --- Các ô trạng thái phụ (chỉ cập nhật nếu tồn tại trong DOM) ---
    // Đã bỏ checklist "SETUP: X/10" — không còn phản ánh đúng yêu cầu thực tế (một số
    // phần đã chuyển sang MIDI, không còn cần capture tọa độ chuột). Hiện chỉ báo đúng
    // 1 điều kiện thật sự bắt buộc chung cho cả Key/Tone/SoundShifter: đã cấu hình MIDI chưa.
    const setupEl = document.getElementById("statusSetupMain");
    if (setupEl) setupEl.textContent = midiPort ? "MIDI : Đã cấu hình" : "MIDI : Chưa cấu hình";
    setStatus("dot-midi", midiPort ? "online" : "offline");

    const cacheEl = document.getElementById("statusCacheMain");
    if (cacheEl) {
        cacheEl.textContent = (typeof appSettings !== "undefined" && appSettings.autoMenuPreset)
            ? "CACHE : Ready"
            : "CACHE : Empty";
    }

    const readyEl = document.getElementById("systemReady");
    if (readyEl) {
        readyEl.textContent = "🟢 SYSTEM READY";
    }
}

/* ==========================================================
   15. KHỞI TẠO HỆ THỐNG (DOM LOADED)
   ========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // Trạng thái ban đầu
    setStatus("dot-daw", "offline");
    setStatus("dot-autotune", "offline");
    updateOnlineStatus();
    updateCacheDot();
    checkAllSystems();
    applyAudioOutputSetting(); // TASK B72 — áp dụng thiết bị đầu ra đã lưu (nếu có) lúc khởi động
    setSetting("fxAutoEnabled", true); // POPUP-RESET-01: ô tích "Auto bật FX khi có nhạc" (popup chuột phải FX) luôn về mặc định BẬT mỗi lần mở app
    loadData();
    ensurePresetLit(); // PRESET-LIT-01
    if (typeof initMicVolumePopups === "function") initMicVolumePopups(); // MIC-VOLUME-KNOB-01 — SAU loadData() để hiện đúng giá trị đã lưu
    if (typeof initAudioChillPopup === "function") initAudioChillPopup(); // AUDIO-CHILL-01 — chuột phải MUSIC: nút Audio chill + knob VST
    if (typeof initFxAutoMenu === "function") initFxAutoMenu(); // FX-AUTO-TOGGLE-01 — chuột phải FX: ô tích Auto bật FX khi có nhạc
    if (typeof initAutoDetectModePopup === "function") initAutoDetectModePopup(); // AUTODETECT-MODE-01 — chuột phải AUTO DETECT: Tự dò bằng tay / Dò bằng AI (chọn 1)
if (typeof initKeyServerCorrectCard === "function") initKeyServerCorrectCard(); // KEY-SERVER-CORRECT-01 — chuột phải SEND (khối KEY): lưu Key đúng vào Server + songs.json

    // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — ĐÃ BỎ 2 lệnh demo cứng ở đây
    // (updateNextModTime() dùng modTimeline giả + updateModInfo("02:15","G# Minor",...) dùng
    // dữ liệu ví dụ giả). Trước bản vá này, mở app lên là panel MOD lập tức bị ghi đè dữ liệu
    // demo dù đang KHÔNG có audio thật. Bây giờ panel MOD giữ đúng mặc định "LISTENING" có sẵn
    // trong index.html cho tới khi có modulation THẬT được ModEngine phát hiện từ audio.

    // 1. Khởi tạo Knobs — dùng 1 cặp mousemove/mouseup chung cho toàn bộ knob
    let activeKnob = null;
    let startY = 0;
    let startValue = 0;

    // TASK B6 (Beat/Master) — dispatch RIÊNG cho đúng 2 knob này, KHÔNG áp dụng cho
    // retune1/retune2/clapKnob/laughKnob (target của 4 knob đó vẫn UNKNOWN/chưa audit xong —
    // xem TASK_B5_REPORT.md/TASK_B6_REPORT.md — cố tình KHÔNG đụng, tránh mở rộng phạm vi).
    // Map 1-1 rõ ràng, không suy luận theo tên — đúng yêu cầu "Beat = INPUT MUSIC LEVEL,
    // Master = FINAL DAW OUTPUT LEVEL" là 2 khái niệm khác nhau, không gộp chung "volume".
    const KNOB_ID_TO_ACTION = {
        retune1: "RETUNE_SPEED_MIC1",
        retune2: "RETUNE_SPEED_MIC2",
        musicKnob: "BEAT_INPUT_VOLUME",
        masterKnob: "MASTER_OUTPUT_VOLUME",
        mic1VolKnob: "MIC1_VOLUME", // MIC-VOLUME-KNOB-01 (fader track Mic)
        mic2VolKnob: "MIC2_VOLUME", // MIC-VOLUME-KNOB-01 (fader track Không Dây)
        audioChillKnob: "AUDIO_CHILL_KNOB", // A96 (knob Audio chill — popup chuột phải MUSIC)
        // TASK B12 — clapKnob/laughKnob CỐ TÌNH KHÔNG có trong map này: bằng chứng (xlsx
        // tham chiếu "Âm lượng ... trên Menu, file đi kèm trong menu") chỉ ra target là
        // audio engine NỘI BỘ (phát file mẫu bundled), KHÔNG phải MIDI/DAW — nối vào dispatch
        // MIDI ở đây sẽ SAI theo đúng bằng chứng đã có (xem TASK_B6_REPORT.md/B5). Audio
        // engine nội bộ chưa tồn tại trong repo — BLOCKED, không tự bịa hướng khác.
    };
    // FX-BUS-KNOB-01 — 1 Knob -> NHIỀU action (bus Delay/Verb ngắn/Verb dài/Com Verb). Tách map riêng để không đổi KNOB_ID_TO_ACTION (1-1).
    const KNOB_ID_TO_ACTION_GROUP = {
        fxMasterKnob: ["FX_BUS_DELAY_VOLUME", "FX_BUS_VERB_SHORT_VOLUME", "FX_BUS_VERB_LONG_VOLUME", "FX_BUS_COM_VERB_VOLUME"]
    };
    function dispatchKnobVolume(knobId, value) {
        const group = KNOB_ID_TO_ACTION_GROUP[knobId];
        if (group && window.ActionRegistry?.executeAction) {
            (currentPresetName === "RAP" ? group.filter((n) => n !== "FX_BUS_VERB_LONG_VOLUME") : group).forEach((name) => window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[name], { reason: "knob", value })
                .catch((err) => console.error(`[KnobControl] ${name} lỗi:`, err)));
            return;
        }
        // TASK A20 — clapKnob/laughKnob: set volume THẲNG vào SoundEffectEngine (Internal
        // Audio Backend), độc lập hoàn toàn với nhánh MIDI bên dưới (mục 6/7). Guard bằng
        // typeof (không phải !window...) vì KNOB_ID_TO_SOUND_EFFECT/SoundEffectEngine là
        // biến top-level cùng file, không phải property của window — typeof tránh
        // ReferenceError khi hàm này được trích xuất chạy độc lập (vd trong test sandbox
        // KnobBeatMaster.verify.js) mà không kéo theo 2 khai báo đó. Không return sớm ở đây
        // vì clapKnob/laughKnob không có trong KNOB_ID_TO_ACTION nên nhánh MIDI phía dưới tự
        // nhiên no-op cho chúng — không cần if/else lồng nhau.
        if (typeof KNOB_ID_TO_SOUND_EFFECT !== "undefined" && typeof SoundEffectEngine !== "undefined") {
            const soundEffectId = KNOB_ID_TO_SOUND_EFFECT[knobId];
            if (soundEffectId) {
                SoundEffectEngine.setVolume(soundEffectId, value);
            }
        }

        const actionName = KNOB_ID_TO_ACTION[knobId];
        if (!actionName || !window.ActionRegistry?.executeAction) return;
        // Không await — đây là handler UI tần suất cao (wheel/mousemove), không được chặn vẽ
        // lại UI để chờ kết quả gửi MIDI. Lỗi (nếu có) chỉ log, không throw ra ngoài listener.
        window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "knob", value })
            .catch((err) => console.error(`[KnobControl] ${actionName} lỗi:`, err));
    }

    knobData.forEach(k => {
        updateKnob(k);
        // Đồng bộ âm lượng hiệu ứng theo giá trị đang hiển thị ngay từ đầu (chỉ audio nội bộ,
        // KHÔNG gửi MIDI) để lần phát đầu tiên đúng âm lượng trên knob, không lệch mặc định engine.
        // Chỉ knob "ALL" (Hiệu Ứng): clapKnob/laughKnob cũ đã khớp sẵn mặc định engine (40) nên giữ nguyên.
        if (typeof KNOB_ID_TO_SOUND_EFFECT !== "undefined" && typeof SoundEffectEngine !== "undefined" && KNOB_ID_TO_SOUND_EFFECT[k.id] === "ALL") {
            SoundEffectEngine.setVolume("ALL", k.value);
        }
        const knob = document.getElementById(k.id);
        if (!knob) return;

        knob.addEventListener("wheel", (e) => {
            e.preventDefault();
            k.value = Math.max(0, Math.min(100, k.value + (e.deltaY < 0 ? 1 : -1)));
            updateKnob(k);
            saveData();
            dispatchKnobVolume(k.id, k.value);
        });

        knob.addEventListener("mousedown", (e) => {
            activeKnob = k;
            startY = e.clientY;
            startValue = k.value;
            document.body.style.cursor = "ns-resize";
        });

        knob.addEventListener("dblclick", () => {
            k.value = k.defaultValue;
            updateKnob(k);
            saveData();
            dispatchKnobVolume(k.id, k.value);
        });
    });

    document.addEventListener("mousemove", (e) => {
        if (!activeKnob) return;
        const delta = startY - e.clientY;
        const newValue = Math.max(0, Math.min(100, startValue + Math.round(delta / 2)));
        if (newValue === activeKnob.value) return; // TASK B6 Test Case 7 — không dispatch nếu giá trị chưa thực sự đổi (chống duplicate execution)
        activeKnob.value = newValue;
        updateKnob(activeKnob);
        saveData();
        dispatchKnobVolume(activeKnob.id, activeKnob.value);
    });

    document.addEventListener("mouseup", () => {
        if (!activeKnob) return;
        activeKnob = null;
        document.body.style.cursor = "default";
    });

    // 2. Liệt kê thiết bị audio đầu vào (chỉ để debug/log) — ĐÃ TẮT gọi tự động: hàm này mở
    // 1 MediaStream/getUserMedia RIÊNG, không liên quan Key/BPM/MOD, chỉ để log console, chạy
    // mỗi lần khởi động app -> vi phạm nguyên tắc "không tạo MediaStream thừa" (mục XVI). Giữ
    // lại hàm để gọi tay từ DevTools console khi cần debug danh sách thiết bị, không tự chạy nữa.
    // listAudioInputDevices();

    // 3. Kích hoạt Audio Engine (BPM) khi người dùng tương tác lần đầu
    document.body.addEventListener('click', () => {
        console.log("Kích hoạt Audio...");
        startAudioMonitor();
    }, { once: true });

    console.log("Renderer đã sẵn sàng!");
    updateMainStatus();

    // "Mở DAW cùng Menu" là công tắc chính: bật lên thì tự mở DAW + Project (nếu tick) +
    // Youtube bằng đúng trình duyệt đã chọn (nếu tick) — chỉ chạy 1 lần lúc mở app.
    runAutoStartupSequence?.()
        .then(result => {
            if (result?.errors?.length) {
                console.warn("Mở kèm DAW/Project/Youtube có lỗi:", result.errors);
            } else if (!result?.skipped) {
                console.log("Đã tự động mở DAW/Project/Youtube");
            }
        })
        .catch(err => console.error("runAutoStartupSequence lỗi:", err));
});

console.log("Renderer Loaded");

// ================================
// BRIDGE: nhận PLUGIN_COMMAND từ Core (WorkflowManager -> PluginController) qua IPC,
// gọi ĐÚNG hàm đã có sẵn trong vocalCommandRouter.js — KHÔNG đổi logic file đó, KHÔNG
// tạo cơ chế MIDI/AHK mới ở đây.
//
// AN TOÀN VỚI HỆ THỐNG CŨ: nếu Core chưa bao giờ phát PLUGIN_COMMAND (vd chưa gắn
// BootLoader vào main.js — hiện đúng là như vậy), callback dưới đây đơn giản không bao
// giờ được gọi tới. Toàn bộ luồng AI cũ (keyEngine/bpmEngine/modEngine -> applyDetectedKey/
// applyModEvent -> vocalCommandRouter.js) và luồng chọn tay vẫn chạy y nguyên như trước,
// không phụ thuộc gì vào đoạn Bridge này.
// ================================
window.electronAPI?.onPluginCommand?.(async (message) => {
    console.log("[Bridge] Nhận PLUGIN_COMMAND từ Core:", message);

    switch (message.command) {

        case "SET_KEY":
        case "LOAD_NEW_SONG": {
            if (typeof message.value !== "string") {
                console.warn("[Bridge] Bỏ qua — value không phải tên Key hợp lệ:", message.value);
                break;
            }
            const result = await sendKeyToAutotune(message.value);
            console.log("[Bridge] sendKeyToAutotune() ->", result);
            break;
        }

        case "SHIFT_KEY": {
            if (typeof message.value !== "string") {
                console.warn("[Bridge] Bỏ qua — value không phải tên Key hợp lệ:", message.value);
                break;
            }
            // sendToneStep() cần SỐ bán cung lệch, còn DecisionAction chỉ mang tên Key đích
            // -> quy đổi bằng đúng cách notes/flatToSharp mà transposeKey() ở trên đã dùng
            // (tái sử dụng biến có sẵn, không phải logic MIDI/AHK mới).
            const delta = bridgeSemitoneDelta(originalKey, message.value);
            // TASK B3-A / MOD-DUAL-TARGET — Manual Mod (dòng ~490-507) đã gửi ĐỒNG THỜI tới cả
            // Auto-Tune VÀ SoundShifter bằng Promise.all từ trước; nhánh AI SHIFT_KEY này TRƯỚC
            // bản vá chỉ gọi sendToneStep() (Auto-Tune), bỏ sót SoundShifter — đúng gap A6 đã
            // xác nhận. Vá bằng ĐÚNG semantics Manual đang dùng: cùng delta, chạy song song,
            // không coi là thành công nếu 1 trong 2 lỗi (không báo giả tạo).
            const [autotuneResult, soundshifterResult] = await Promise.all([
                sendToneStep(delta), // (AI-ALG-04: KHÔNG đổi — delta ở đây là tuyệt đối so với Key gốc nhưng gửi như tương đối; cùng lớp lỗi D8, chờ quyết định, xem báo cáo D12)
                sendToneStepToSoundShifter(delta),
            ]);
            console.log("[Bridge] sendToneStep() ->", autotuneResult, "(delta =", delta, ")");
            console.log("[Bridge] sendToneStepToSoundShifter() ->", soundshifterResult, "(delta =", delta, ")");
            if (!autotuneResult.ok) console.error("[Bridge] sendToneStep (Auto-Tune) lỗi:", autotuneResult.detail);
            if (!soundshifterResult.ok) console.error("[Bridge] sendToneStepToSoundShifter lỗi:", soundshifterResult.detail);
            break;
        }

        case "UPDATE_BPM":
            // vocalCommandRouter.js hiện KHÔNG có hàm nào gửi BPM xuống plugin (đã xác nhận
            // ở audit Plugin Control Pipeline) -> Bridge KHÔNG tự tạo cơ chế mới, chỉ ghi log.
            console.log("[Bridge] UPDATE_BPM: chưa có hàm plugin tương ứng trong vocalCommandRouter.js, bỏ qua. value =", message.value);
            break;

        default:
            console.warn("[Bridge] Không nhận diện được command:", message.command);

    }
});

// Quy đổi tên Key ("A Major") sang số bán cung lệch so với 1 tên Key khác — dùng lại ĐÚNG
// cách tách nốt mà transposeKey() ở trên đã dùng (notes/flatToSharp), chỉ để chọn tham số
// gọi sendToneStep() có sẵn. Không phải logic MIDI/AHK, không đụng keyEngine.js.
function bridgeSemitoneDelta(fromKeyName, toKeyName) {
    const fromMatch = fromKeyName?.match(/^([A-G](?:#|b)?)/);
    const toMatch = toKeyName?.match(/^([A-G](?:#|b)?)/);
    if (!fromMatch || !toMatch) return 0;

    const fromIdx = notes.indexOf(flatToSharp[fromMatch[1]] || fromMatch[1]);
    const toIdx = notes.indexOf(flatToSharp[toMatch[1]] || toMatch[1]);
    if (fromIdx === -1 || toIdx === -1) return 0;

    let delta = (toIdx - fromIdx + 12) % 12;
    if (delta > 6) delta -= 12;
    return delta;
}
/* ==========================================================
   UI FINAL v3.2 — Mục IV: Giá trị KEY tự co font theo độ dài,
   không bao giờ tràn card. Có ~8 chỗ khác nhau set textContent
   cho #currentKey (chọn tay, AI detect, song database, load lại
   settings...) — thay vì sửa từng chỗ (rủi ro sót/đụng logic),
   dùng MutationObserver quan sát nội dung #currentKey và tự đo/co
   font mỗi khi giá trị đổi, không đụng bất kỳ dòng gán textContent
   nào ở trên. Thuần DOM, không thêm thư viện/canvas/WebGL.
   ========================================================== */
(function () {
    const keyValueEl = document.getElementById("currentKey");
    if (!keyValueEl) return;

    const MAX_FONT = 38; // px — kích thước gốc, khớp trần của clamp() trong CSS
    const MIN_FONT = 20; // px — không co nhỏ hơn mức này để vẫn dễ đọc

    function fitKeyFont() {
        let size = MAX_FONT;
        keyValueEl.style.fontSize = size + "px";
        while (keyValueEl.scrollWidth > keyValueEl.clientWidth && size > MIN_FONT) {
            size -= 1;
            keyValueEl.style.fontSize = size + "px";
        }
    }

    new MutationObserver(fitKeyFont).observe(keyValueEl, { characterData: true, childList: true, subtree: true });
    fitKeyFont(); // áp dụng luôn cho giá trị mặc định lúc mở app
})();


/* MENU-LAYOUT-MEMORY-01 BEGIN
   Ghi nhớ chế độ DỌC / NGANG của Menu ở lần dùng cuối (app-settings.json > menuVerticalMode, qua đúng getSetting/setSetting có sẵn).
   KHÔNG sửa HTML: nút 📐 vẫn gọi toggleVerticalMode() như cũ (chỉ đổi class "vertical-mode" trên <body>). Ở đây chỉ (1) lúc mở app áp lại class đã lưu,
   (2) theo dõi class của <body> để lưu mỗi khi người dùng đổi. Lần cuối ở chế độ NGANG (hoặc chưa lưu gì) => giữ nguyên như cũ, không thêm gì.
   Mọi lỗi chỉ bị bỏ qua, không làm hỏng Menu. */
(function setupMenuLayoutMemory() {
    try {
        const body = document.body;
        if (!body || typeof getSetting !== "function" || typeof setSetting !== "function") return;
        const KEY = "menuVerticalMode";
        if (getSetting(KEY, false) === true) body.classList.add("vertical-mode");
        let last = body.classList.contains("vertical-mode");
        if (typeof MutationObserver !== "function") return;
        new MutationObserver(() => {
            try {
                const now = body.classList.contains("vertical-mode");
                if (now === last) return; // class khác đổi (không liên quan) => khỏi ghi file
                last = now;
                setSetting(KEY, now);
            } catch (err) { console.error("MENU-LAYOUT-MEMORY-01: lưu chế độ dọc/ngang lỗi (bỏ qua):", err); }
        }).observe(body, { attributes: true, attributeFilter: ["class"] });
    } catch (err) { console.error("MENU-LAYOUT-MEMORY-01 lỗi (bỏ qua):", err); }
})();
/* MENU-LAYOUT-MEMORY-01 END */
