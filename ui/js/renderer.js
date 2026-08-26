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
        const effect = effects[effectId];
        if (!effect) return;
        const clamped = Math.max(0, Math.min(100, Number(value0to100) || 0));
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

    return { toggle, setVolume, isPlaying, onChange, SOUND_SOURCES };

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

    function textForSnapshot(snapshot) {

        if (snapshot === "unavailable") return "Unavailable";
        if (!snapshot) return "No media";

        const title = String(snapshot.title || "").trim();
        const artist = String(snapshot.artist || "").trim();

        if (!title) return "No media"; // không có title coi như chưa xác định được gì đáng tin

        return artist ? `${title} - ${artist}` : title;

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

        copyA.textContent = textForSnapshot(snapshot);
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

    // API công khai cho 1 task nối dây sau này (IPC từ WindowsMediaSession).
    window.AutoMenuAI = window.AutoMenuAI || {};
    window.AutoMenuAI.updateNowPlaying = render;
    window.AutoMenuAI.setNowPlayingUnavailable = () => render("unavailable");

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
document.getElementById("minBtn")?.addEventListener("click", () => console.log("MINIMIZE"));

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
};
document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        saveData();
        const actionName = PRESET_NAME_TO_ACTION[e.target.textContent.trim()];
        if (actionName && window.ActionRegistry?.executeAction) {
            window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "menu-button" })
                .catch(err => console.error(`[MenuControl] PRESET (${actionName}) lỗi:`, err));
        }
    });
});

document.getElementById("autoDetectBtn")?.classList.add("active");

document.getElementById("musicBtn")?.addEventListener("click", (e) => {
    e.target.classList.toggle("disabled");
    saveData();
    // TASK B12 — nối song song executeAction() (không thay đổi hành vi toggle CSS đã có).
    // NOT_CONFIGURED mặc định — chỉ hoạt động thật nếu user tự cấu hình MIDI qua Setup.
    window.ActionRegistry?.executeAction?.(window.ActionRegistry.ACTIONS.MONITOR_BEAT_TOGGLE, { reason: "menu-button" })
        ?.catch?.((err) => console.error("[MenuControl] MONITOR_BEAT_TOGGLE lỗi:", err));
});

const MONITOR_BTN_TO_ACTION = { mic1Btn: "MONITOR_MIC1", mic2Btn: "MONITOR_MIC2", fxBtn: "MONITOR_FX" };
["mic1Btn", "mic2Btn", "fxBtn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", (e) => {
        e.target.classList.toggle("active");
        saveData();
        // MIDI-MASTER-01 / MENU-CONTROL-01 — nối SONG SONG tới executeAction() (không thay
        // thế toggle CSS). Chưa có audio-routing backend thật (BACKEND_MISSING — xem báo cáo),
        // nên executeAction() sẽ trả NOT_CONFIGURED trừ khi user tự gán MIDI/mouse trong Setup.
        const actionName = MONITOR_BTN_TO_ACTION[id];
        if (actionName && window.ActionRegistry?.executeAction) {
            window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "menu-button" })
                .catch(err => console.error(`[MenuControl] ${actionName} lỗi:`, err));
        }
    });
});

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

/* ==========================================================
   5b. EXPAND / COLLAPSE CONTROL PANEL (UI Final v1.0)
   Chỉ thao tác DOM/CSS — không gọi IPC, không đổi EventBus,
   không đụng AI/Key/BPM/Mod Engine.
   ========================================================== */
(function () {
    const expandBtn = document.getElementById("expandBtn");
    const panel = document.getElementById("controlPanel");
    if (!expandBtn || !panel) return;

    const AUTO_COLLAPSE_MS = 12000; // 12s — trong khoảng 10–15s theo yêu cầu Mục IX
    let collapseTimer = null;

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
        setTimeout(() => panel.classList.remove("expanded"), 200);
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
    { id: "laughKnob", valueId: "laughValue", value: 40, defaultValue: 40 }
];

// TASK A20 — clapKnob/laughKnob đi tới Internal Audio Backend (SoundEffectEngine), KHÔNG
// qua ActionRegistry/MIDI (KNOB_ID_TO_ACTION bên dưới CỐ TÌNH KHÔNG có 2 knob này — giữ
// nguyên, không đụng). Khai báo ở top-level (không phải trong closure DOMContentLoaded)
// để cả dispatchKnobVolume() lẫn loadData() đều dùng chung được 1 map duy nhất.
const KNOB_ID_TO_SOUND_EFFECT = Object.freeze({
    clapKnob: "CLAP",
    laughKnob: "LAUGH"
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

    let newIndex = (idx + parseInt(steps, 10) + 12) % 12;

    return notes[newIndex] + type;
}

document.getElementById("applyToneBtn")?.addEventListener("click", () => {
    const powerBtn = document.getElementById("modPowerBtn");
    if (!powerBtn || !powerBtn.classList.contains("active")) {
        return;
    }

    const toneVal = parseInt(document.getElementById("toneSelector")?.value ?? "0", 10);
    const newKey = transposeKey(originalKey, toneVal);

    const currentKeyEl = document.getElementById("currentKey");
    if (currentKeyEl) currentKeyEl.textContent = newKey;

    const modTimeEl = document.getElementById("modTime");
    if (modTimeEl) modTimeEl.textContent = "--:--";

    const modStatusEl = document.getElementById("modStatus");
    if (modStatusEl) modStatusEl.textContent = "Đang gửi...";

    const modTimelineEl = document.getElementById("modTimeline");
    if (modTimelineEl) modTimelineEl.textContent = (toneVal > 0 ? "+" : "") + toneVal + " SEMITONES";

    setStatus("dot-mod", "pending"); // cam: đang gửi, chờ kết quả thực thi

    // SET có 2 nhiệm vụ cùng lúc: gửi tone tới Auto-Tune (đúng số bán cung trên menu)
    // VÀ gửi tới SoundShifter (tự nhân theo SOUNDSHIFTER_STEP_RATIO bên trong hàm) —
    // chạy song song để không bị lệch thời điểm giữa 2 plugin.
    Promise.all([
        sendToneStep(toneVal),
        sendToneStepToSoundShifter(toneVal),
    ]).then(([autotuneResult, soundshifterResult]) => {
        if (autotuneResult.ok && soundshifterResult.ok) {
            setStatus("dot-mod", "online"); // xanh: cả 2 plugin đã nhận lệnh thành công
            if (modStatusEl) modStatusEl.textContent = newKey;
        } else {
            setStatus("dot-mod", "offline"); // đỏ: ít nhất 1 trong 2 plugin gửi lỗi
            const which = !autotuneResult.ok && !soundshifterResult.ok
                ? "Auto-Tune & SoundShifter"
                : (!autotuneResult.ok ? "Auto-Tune" : "SoundShifter");
            if (modStatusEl) modStatusEl.textContent = `⚠️ Lỗi gửi Mod (${which})`;
            if (!autotuneResult.ok) console.error("sendToneStep (Auto-Tune) lỗi:", autotuneResult.detail);
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
    manual: { active: false, selectedKey: null, committedKey: null, deadlineAt: null, tickHandle: null },
    songDb: { active: false, value: null, bpm: null, title: null, artist: null },
    ai: { value: appState.originalKey, provisional: null }
};

let lastPluginKey = appState.originalKey; // giá trị THẬT đã gửi xuống Plugin lần gần nhất (chống gửi trùng)
let lastNowPlayingKey = null;             // "<title>|<artist>" gần nhất, để tự phát hiện đổi bài (mục IX)

// TASK (Khói xác nhận cho phép sửa, 25/08/2026) — true SAU KHI đã có ít nhất 1 kết quả Key
// THẬT từ audio (KeyEngine.detectOnce khoá được). CHỈ dùng để quyết định CHỮ hiển thị
// ("LISTENING" hay giá trị thật) ở applyActiveKeyToPlugin()/refreshKeySourceDisplay() — không
// đụng gì tới keySource.ai.value/originalKey/lastPluginKey (vẫn giữ nguyên giá trị nhạc lý nội
// bộ hợp lệ, không có rủi ro gửi chuỗi "LISTENING" xuống Auto-Tune). autoDetectBtn (mục 13B)
// đặt lại về false để RESET hiển thị mỗi lần bấm Auto Detect.
let keyEverDetected = false;

function logKeySource(sourceLabel) {
    console.log(`[Key Source] ${sourceLabel}`);
}

// resolveActiveKey() / getActiveSourceName() / getActiveKeyValue() — CHỈ ĐỌC. Tuyệt đối không
// được thêm dòng ghi (mutate) nào vào 3 hàm này — đây là "Active Key Resolver", nhiệm vụ DUY
// NHẤT là xác định nguồn nào đang có quyền + giá trị tương ứng, không được copy Key giữa
// AI/Manual/Database qua lại dưới bất kỳ hình thức nào.
function getActiveSourceName() {
    if (keySource.manual.active) return "manual";
    if (keySource.songDb.active) return "songDb";
    return "ai";
}

function getActiveKeyValue() {
    if (keySource.manual.active) return keySource.manual.committedKey;
    if (keySource.songDb.active) return keySource.songDb.value;
    return keySource.ai.value;
}

// Alias tường minh theo đúng thuật ngữ task (resolver "READ only") — dùng chung logic ở trên,
// không tạo thêm state hay nhánh rẽ mới.
function resolveActiveKey() {
    return { source: getActiveSourceName(), key: getActiveKeyValue() };
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

    // UI Final v3.0 — Mục XII (ACTIVE SOURCE): 1 dòng badge duy nhất, đọc lại
    // getActiveSourceName() đã có sẵn (KHÔNG đổi hàm đó/logic chọn nguồn).
    // #keyInfo và #manualOverrideStatus vẫn được JS cập nhật như cũ bên dưới,
    // chỉ ẩn đi bằng CSS để tránh hiện nhiều dòng trạng thái cùng lúc.
    const activeSourceLabelEl = document.getElementById("activeSourceLabel");
    if (activeSourceLabelEl) {
        const labelMap = { manual: "MANUAL", songDb: "DATABASE", ai: "AI DETECT" };
        activeSourceLabelEl.textContent = "ACTIVE: " + (labelMap[getActiveSourceName()] || "AI DETECT");
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
function applyActiveKeyToPlugin(sourceLabel) {

    const value = getActiveKeyValue();
    const source = getActiveSourceName();

    originalKey = value;
    // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — nguồn AI mà CHƯA có kết quả thật lần nào
    // -> hiển thị LISTENING, KHÔNG hiện giá trị hạt giống nội bộ (vd "G# Minor"). `value` vẫn
    // giữ nguyên (không đổi) cho các dòng bên dưới (sendKeyToAutotune/dedupe/originalKey) — CHỈ
    // chữ hiển thị bị thay, không có rủi ro gửi "LISTENING" xuống Plugin.
    if (currentKeyEl) currentKeyEl.textContent = (source === "ai" && !keyEverDetected) ? "LISTENING" : value;
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
    if (keySelector && source !== "manual") keySelector.value = "AI Key Detect"; // KHÔNG gán key thật (mục 3/4/14/16)

    logKeySource(sourceLabel);
    refreshKeySourceDisplay();

    if (value === lastPluginKey) return; // giá trị không đổi thật -> khỏi gửi lại, tránh spam Plugin

    if (source === "ai" && isAiControlActive()) {

        // AI_CONTROL: renderer KHÔNG tự gửi lệnh AI xuống Plugin nữa (giữ NGUYÊN hành vi cũ) —
        // Workflow -> PluginController -> Bridge lo phần gửi thật (xem onPluginCommand cuối file).
        console.log("[ControlSource] AI_CONTROL — bỏ qua gửi Key trực tiếp, chờ Bridge từ Core.");
        setStatus("dot-key", "online");
        lastPluginKey = value;
        return;

    }

    setStatus("dot-key", "pending");

    sendKeyToAutotune(value).then((result) => {

        if (result.ok) {
            setStatus("dot-key", "online");
            lastPluginKey = value;
        } else {
            setStatus("dot-key", "offline");
            console.error("sendKeyToAutotune lỗi:", result.detail);
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
            // Mục VII: Plugin tự nhận Key AI hiện tại, HOẶC quay về Song Database nếu đó đang
            // là nguồn hiện tại (không quay về Manual — Manual đã tắt hẳn).
            applyActiveKeyToPlugin(keySource.songDb.active ? "Song Database" : "AI Detect");
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

// Mục IX: bài hát đổi -> huỷ Timer Manual, xoá trạng thái bài cũ. Dữ liệu bài mới (match/miss)
// sẽ được nạp ngay sau đó qua onSongDatabaseMatch()/onSongDatabaseMiss() (do main process gửi).
function dispatchNowPlayingPayload(payload) {

    const key = payload ? `${payload.title || ""}|${payload.artist || ""}` : null;

    if (key !== lastNowPlayingKey) {
        console.log("[NowPlaying] Song Changed");
        cancelManualOverride();
        lastNowPlayingKey = key;
    }

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

    window.__keyDetectStopWatcher = KeyEngine.detectOnce((result) => {

        window.__keyDetectStopWatcher = null;

        keySource.ai.value = result.key;
        keyEverDetected = true; // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — có kết quả THẬT từ audio
        window.electronAPI?.reportAiResult("key", { key: result.key, confidence: result.confidence });
        refreshKeySourceDisplay();

        if (getActiveSourceName() === "ai") {

            if (keyInfoEl) keyInfoEl.textContent = `Auto Detect (${Math.round(result.confidence * 100)}% tin cậy)`;
            applyActiveKeyToPlugin("AI Detect");
            startModulationWatcher();

        }

        startAiRealtimeLoop(); // luôn chạy tiếp — kể cả khi AI KHÔNG phải nguồn active lúc này

    });

}

// Điểm DUY NHẤT xử lý "quay lại Auto" — dùng cho: nút autoDetectBtn có sẵn, dropdown chọn lại
// "AI Key Detect" + SEND, và khởi động lần đầu. Huỷ Manual (nếu có), áp NGAY nguồn hiện có
// hiệu lực (Song Database nếu có, không thì đợi AI), đảm bảo vòng dò AI đang chạy.
function triggerAiKeyDetect() {

    cancelManualOverride();

    // "Manual OFF -> Plugin lập tức dùng AI. Không mất dữ liệu. Không Detect lại từ đầu."
    // AI luôn chạy NỀN liên tục suốt lúc Manual bật (startAiRealtimeLoop không bao giờ dừng),
    // nên keySource.ai.value LUÔN đã có sẵn giá trị mới nhất ngay tại thời điểm này -> áp dụng
    // NGAY LẬP TỨC, không cần chờ vòng dò tiếp theo. (Khôi phục fix đã bị mất do revert ngoài
    // ý muốn — xem báo cáo.)
    if (keySource.songDb.active) {

        applyActiveKeyToPlugin("Song Database");

    } else {

        applyActiveKeyToPlugin("AI Detect");

    }

    if (window.__keyDetectStopWatcher) { window.__keyDetectStopWatcher(); window.__keyDetectStopWatcher = null; }
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

    // Nếu AI đang dò dở (foreground) từ trước -> huỷ, tránh nó tự áp kết quả đè lên Manual vừa chọn
    if (window.__keyDetectStopWatcher) {
        window.__keyDetectStopWatcher();
        window.__keyDetectStopWatcher = null;
    }

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
    sendKeyToAutotune(selectedKey).then((result) => {
        if (result.ok) {
            // CHỈ commit Manual state khi Auto-Tune xác nhận nhận được Key (Mục 6: preview -> validate -> committed).
            keySource.manual.committedKey = selectedKey;
            keySource.manual.active = true;
            reportManualStateSnapshot(); // TASK B3-C — Manual Key vừa BẬT thật (đã được Auto-Tune xác nhận), báo Core ngay

            setStatus("dot-key", "online"); // xanh: đã gửi thành công (qua MIDI hoặc click)
            if (keyInfoEl) keyInfoEl.textContent = `Manual Key (${result.driverUsed})`;
            logKeySource("Manual Override");

            // SEND thành công -> Plugin chính thức đổi, bắt đầu đếm ngược 4 phút.
            lastPluginKey = selectedKey;
            startManualOverrideCountdown();
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

    // 2. Check Audio Interface
    try {
        setStatus('dot-audio', 'pending');
        const selectedCard = getSetting?.("selectedSoundcard");
        setStatus('dot-audio', selectedCard ? 'online' : 'offline');
    } catch (e) {
        setStatus('dot-audio', 'offline');
    }

    // 3. Check DAW (nếu có hàm kiểm tra DAW riêng thì bổ sung ở đây)
    // setStatus('dot-daw', isDawRunning ? 'online' : 'offline');
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
function saveData() {
    const data = {
        currentKey: document.getElementById("currentKey")?.textContent,
        tone: document.getElementById("toneSelector")?.value,
        modEnabled: document.getElementById("modPowerBtn")?.classList.contains("active"),
        preset: document.querySelector(".preset-btn.active")?.textContent.trim(),
        musicDisabled: document.getElementById("musicBtn")?.classList.contains("disabled"),
        mic1: document.getElementById("mic1Btn")?.classList.contains("active"),
        mic2: document.getElementById("mic2Btn")?.classList.contains("active"),
        fx: document.getElementById("fxBtn")?.classList.contains("active"),
        knobs: knobData.map(k => ({ id: k.id, value: k.value }))
    };

    if (typeof appSettings !== "undefined") {
        appSettings.autoMenuData = data;
    }
    saveSetup?.();
}

function loadData() {
    const data = typeof appSettings !== "undefined" ? appSettings.autoMenuData : null;
    if (!data) return;

    if (data.currentKey) {
        const el = document.getElementById("currentKey");
        if (el) el.textContent = data.currentKey;
        originalKey = data.currentKey;
    }

    if (data.tone) {
        const el = document.getElementById("toneSelector");
        if (el) el.value = data.tone;
    }

    if (data.modEnabled) {
        const modBtn = document.getElementById("modPowerBtn");
        if (modBtn) {
            modBtn.classList.add("active");
            modBtn.textContent = "ON";
        }
    }

    if (data.preset) {
        document.querySelectorAll(".preset-btn").forEach(btn => {
            btn.classList.remove("active");
            if (btn.textContent.trim() === data.preset) {
                btn.classList.add("active");
            }
        });
    }

    if (data.musicDisabled) {
        document.getElementById("musicBtn")?.classList.add("disabled");
    }

    if (data.mic1) {
        document.getElementById("mic1Btn")?.classList.add("active");
    }

    if (data.mic2) {
        document.getElementById("mic2Btn")?.classList.add("active");
    }

    if (data.fx) {
        document.getElementById("fxBtn")?.classList.add("active");
    }

    if (data.knobs) {
        data.knobs.forEach(saved => {
            const knob = knobData.find(k => k.id === saved.id);
            if (knob) {
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
    Promise.all([
        setSoundShifterPower(false),
        sendToneStep(aiSemitoneOffset),
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

    saveData();
}

modPowerBtn?.addEventListener("click", () => {
    const isActive = modPowerBtn.classList.toggle("active");

    if (isActive) {
        reportManualStateSnapshot(); // TASK B3-C — Manual Mod vừa BẬT thật, báo Core ngay. (Nhánh TẮT dùng chung turnManualOverrideOff() bên dưới — đã tự báo ở đó, không gọi trùng ở đây.)
        modPowerBtn.textContent = "ON";
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
    updateModInfo(data.time, originalKey, newKey, data.semitone);
    aiSemitoneOffset = data.semitone;

    // Gửi kết quả sang Core (AIContext) qua IPC — không ảnh hưởng logic gửi lệnh Auto-Tune bên dưới
    window.electronAPI?.reportAiResult("mod", { from: originalKey, to: newKey, semitone: data.semitone, time: data.time });

    if (isManualOverrideActive()) {
        // Đang bị ghi đè tay -> chỉ ghi nhận giá trị AI muốn áp, KHÔNG gửi lệnh thật lúc
        // này để tránh đánh nhau với lệnh tay đang chủ động điều khiển Auto-Tune. Giá trị
        // này sẽ được áp khi người dùng tắt ghi đè tay (xem turnManualOverrideOff).
        console.log(`[MOD-AI] Muốn dịch ${data.semitone} bán cung (${data.time}) nhưng đang bị ghi đè tay, tạm hoãn.`);
        return;
    }

    if (isAiControlActive()) {

        // AI_CONTROL: renderer KHÔNG tự gửi lệnh AI xuống Plugin nữa — giá trị đã báo cáo
        // AIContext ở trên (reportAiResult). Việc gửi thật để dành cho Workflow ->
        // PluginController -> Bridge (xem onPluginCommand ở cuối file).
        console.log(`[ControlSource] AI_CONTROL — bỏ qua gửi Mod trực tiếp (${data.semitone} bán cung), chờ Bridge từ Core.`);
        setStatus("dot-mod", "online");
        return;

    }

    setStatus("dot-mod", "pending"); // cam: AI đang gửi lệnh dịch tone theo modulation thật dò được
    const result = await sendToneStep(data.semitone);

    if (result.ok) {
        setStatus("dot-mod", "online"); // xanh: AI đã gửi thành công
    } else {
        setStatus("dot-mod", "offline"); // đỏ: LỖI thật sự, không phải "đã tắt"
        const modStatusEl = document.getElementById("modStatus");
        if (modStatusEl) modStatusEl.textContent = "⚠️ Lỗi gửi Mod (AI)";
        console.error("[MOD-AI] sendToneStep lỗi:", result.detail);
    }
}

document.getElementById("autoDetectBtn")?.addEventListener("click", () => {
    console.log("RESET AI SCAN — chỉ dò lại Key, KHÔNG gửi lệnh Mod nào khác");

    // TASK (Khói xác nhận cho phép sửa, 25/08/2026) — Auto Detect = reset THẬT về chế độ nghe
    // (LISTENING) cho cả Key/BPM/MOD, không giữ hiển thị giá trị cũ trong lúc chờ kết quả mới.
    // CHỈ đổi CHỮ hiển thị ở đây — KHÔNG đụng originalKey/keySource.ai.value/lastPluginKey, nên
    // Auto-Tune vẫn tiếp tục dùng đúng Key thật đang chạy cho tới khi có kết quả THẬT mới (không
    // im lặng/lệch tiếng giữa chừng bài hát). BPMEngine/ModEngine vẫn chạy nền như cũ, không bị
    // restart — chỉ hiển thị được xoá tạm để không gây hiểu lầm là giá trị cũ vẫn còn đúng.
    keyEverDetected = false;
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

    ModEngine.start(originalRootIndex, (data) => {
        const mins = String(Math.floor(songSeconds / 60)).padStart(2, "0");
        const secs = String(songSeconds % 60).padStart(2, "0");
        applyModEvent({ time: `${mins}:${secs}`, semitone: data.semitone });
    }, isManualOverrideActive);
}

let songSeconds = 0;
function updateSongPosition() {
    const posEl = document.getElementById("songPosition");
    if (!posEl) return;

    const mins = String(Math.floor(songSeconds / 60)).padStart(2, "0");
    const secs = String(songSeconds % 60).padStart(2, "0");
    posEl.textContent = `${mins}:${secs}`;
    songSeconds++;
}
setInterval(updateSongPosition, 1000);

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

// ---- DEBUG TẠM THỜI: in ra Console mỗi ~1 giây để kiểm tra mức tín hiệu thật ----
// Xoá 2 hàm này sau khi đã xác định app chạy ổn định lâu dài.
let __debugLastLog = 0;
function __debugLogAudioLevel(bassEnergy, localAvg, maxByte) {
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
    const now = Date.now();
    if (now - __debugLastVuLog < 1000) return; // throttle 1s — đủ để đọc, không spam console
    __debugLastVuLog = now;
    console.log(
        `[DEBUG VU] rms=${rms.toFixed(4)} | peak=${peak.toFixed(4)} | dBFS=${dbfs === -Infinity ? "-Inf" : dbfs.toFixed(1)} | vuPercent=${vuPercent.toFixed(1)}%`
    );
}

let __debugLastKeyLog = 0;
function __debugLogKeyConfidence() {
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

async function startAudioMonitor() {
    if (audioMonitorStarted) return; // tránh khởi tạo lặp / mở nhiều stream mic
    audioMonitorStarted = true;
    setStatus("dot-bpm", "pending"); // cam: bắt đầu nghe/phân tích

    // QUAN TRỌNG: phải dùng ĐÚNG soundcard đã chọn ở Setup (selectedSoundcardId),
    // không được để trình duyệt tự chọn mic mặc định. Mục đích của app là dò Key/BPM
    // từ NHẠC NỀN (qua soundcard/loopback), không phải giọng hát qua mic.
    const soundcardId = getSetting?.("selectedSoundcardId", "");

    // HARD AUDIO ROUTING RULE: Key/BPM/MOD chỉ được init trên ĐÚNG thiết bị input mà người
    // dùng đã chọn ở Setup (selectedSoundcardId) — deviceId khớp chính xác, không rơi về mặc định.
    //
    // GIỚI HẠN THẬT (không được nói quá): getUserMedia({deviceId: exact}) CHỈ chứng minh "đúng
    // thiết bị đã chọn", KHÔNG chứng minh thiết bị đó là desktop loopback thật. Nếu người dùng
    // chọn nhầm mic vật lý làm "soundcard" ở Setup, code này KHÔNG có cách nào phát hiện ra —
    // nó vẫn coi đó là nguồn hợp lệ vì đúng deviceId đã chọn. "System Audio" ở đây phụ thuộc
    // 100% vào việc Setup đã cấu hình đúng kênh loopback/virtual-cable, không phải điều renderer.js
    // tự xác minh được. Không tuyên bố "đã cách ly khỏi mic" — chỉ đúng là "đã cách ly khỏi việc
    // rơi về input KHÔNG DO NGƯỜI DÙNG CHỌN".
    if (!soundcardId) {
        console.error(
            "[Audio] Chưa chọn Soundcard ở Setup -> KHÔNG khởi tạo Key/BPM/MOD (để tránh phân tích nhầm mic). " +
            "Vào Setup > Soundcard để chọn đúng kênh loopback/audio interface đang phát nhạc."
        );
        audioMonitorStarted = false;
        setStatus("dot-bpm", "offline");
        const bpmEl2 = document.getElementById("bpmValue");
        if (bpmEl2) bpmEl2.textContent = "Chưa chọn Soundcard (Setup)";
        return;
    }

    const audioConstraints = {
        deviceId: { exact: soundcardId },
        // Tắt hết các bộ lọc dành cho giọng nói: chúng được thiết kế để "làm sạch" tiếng người,
        // nên sẽ bóp méo/triệt tiêu nhạc cụ và làm sai lệch kết quả phân tích BPM/Key.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
    };

    let stream;
    try {
        console.log("Đang khởi tạo Audio từ thiết bị (soundcard đã chọn):", soundcardId);
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
        // deviceId đã lưu có thể không còn tồn tại (rút dây, cài lại driver, đổi tên cổng...)
        // -> báo rõ cho người dùng thay vì âm thầm rơi về mic mặc định (dễ gây hiểu lầm như lần trước).
        if (soundcardId && err.name === "OverconstrainedError") {
            console.error(
                "[Audio] Soundcard đã chọn ở Setup không còn khả dụng (deviceId cũ: " + soundcardId + "). " +
                "Vào Setup > Soundcard để chọn lại thiết bị."
            );
        } else {
            console.error("Lỗi khởi tạo Audio:", err);
        }
        audioMonitorStarted = false;
        setStatus("dot-bpm", "offline");
        return;
    }

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);

        // CHẨN ĐOÁN: AudioContext có thể bị tạo ra ở trạng thái "suspended" (chính sách
        // autoplay của Chromium) vì nó được tạo SAU 1 lệnh await, không còn nằm ngay trong
        // chuỗi gọi đồng bộ của cú click chuột nữa -> analyser đọc toàn số 0 dù stream có
        // tín hiệu thật. resume() để đảm bảo nó thật sự chạy.
        console.log("[DEBUG audio] audioContext.state TRƯỚC resume:", audioContext.state);
        if (audioContext.state !== "running") {
            await audioContext.resume();
        }
        console.log("[DEBUG audio] audioContext.state SAU resume:", audioContext.state);

        const track = stream.getAudioTracks()[0];
        console.log("[DEBUG audio] audio track:", track?.label, "| readyState:", track?.readyState, "| muted:", track?.muted, "| enabled:", track?.enabled);

        // Từ đây, mỗi engine tự tạo analyser riêng + tự chạy vòng lặp riêng của nó.
        BPMEngine.init(audioContext, source);
        KeyEngine.init(audioContext, source);

        BPMEngine.onUpdate((bpm) => {
            const bpmEl1 = document.getElementById("currentBpm");
            const bpmEl2 = document.getElementById("bpmValue");
            if (bpmEl1) bpmEl1.textContent = bpm;
            if (bpmEl2) bpmEl2.textContent = bpm + " BPM";
            setStatus("dot-bpm", "online"); // xanh: đã dò được BPM ổn định, đủ phiếu đồng thuận

            // Gửi kết quả sang Core (AIContext) qua IPC — không ảnh hưởng logic hiển thị phía trên
            window.electronAPI?.reportAiResult("bpm", { bpm });
        });

        BPMEngine.onLevel(({ bassEnergy, localAvg, maxByte, vuPercent, rms, dbfs, peak }) => {
            // VU METER V2 — dùng vuPercent (RMS/dBFS, metric RIÊNG cho level meter), KHÔNG dùng
            // bassEnergy nữa (đó là spectral flux, metric của BPM/beat detection — vẫn giữ nguyên
            // cho BPMEngine, chỉ không còn dùng để vẽ VU). VU là READ-ONLY consumer: chỉ đọc field
            // đã tính sẵn từ callback, không gọi ngược lại bất kỳ hàm nào của BPMEngine/KeyEngine.
            const meter = document.getElementById("vu-fill");
            if (meter) meter.style.width = Math.max(0, Math.min(100, vuPercent)) + "%";
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
            keySource.ai.provisional = estimate.key;
            refreshKeySourceDisplay();
        });

        console.log("Audio Engine đã sẵn sàng! (BPMEngine + KeyEngine tự chạy độc lập)");

        // Chroma cần vài giây tích lũy dữ liệu mới đủ tin cậy — đợi 1 nhịp ngắn trước khi
        // bắt đầu dò, tránh dò ngay lúc chromaVector còn gần như rỗng.
        setTimeout(() => triggerAiKeyDetect(), 2000);
    } catch (err) {
        console.error("Lỗi khởi tạo Audio:", err);
        audioMonitorStarted = false;
        setStatus("dot-bpm", "offline"); // đỏ: chưa dò được (lỗi mic/quyền truy cập)
    }
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
    // Chưa có nút "REMIX" trong giao diện chính hiện tại, nên phím tắt này tạm thời không có hành động.
    remix: () => console.warn("Phím tắt REMIX đã lưu nhưng chưa có chế độ REMIX trong menu chính.")
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

window.electronAPI?.onSetupChanged?.(() => {
    // appSettings là cache trong bộ nhớ của renderer này — cửa sổ Setup ghi vào
    // localStorage ở tiến trình của NÓ, nên phải load lại thì mới thấy dữ liệu mới.
    loadSetup?.();
    updateMainStatus();
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
    setStatus("dot-audio", soundcard ? "online" : "offline");

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
    loadData();

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
        // TASK B12 — clapKnob/laughKnob CỐ TÌNH KHÔNG có trong map này: bằng chứng (xlsx
        // tham chiếu "Âm lượng ... trên Menu, file đi kèm trong menu") chỉ ra target là
        // audio engine NỘI BỘ (phát file mẫu bundled), KHÔNG phải MIDI/DAW — nối vào dispatch
        // MIDI ở đây sẽ SAI theo đúng bằng chứng đã có (xem TASK_B6_REPORT.md/B5). Audio
        // engine nội bộ chưa tồn tại trong repo — BLOCKED, không tự bịa hướng khác.
    };
    function dispatchKnobVolume(knobId, value) {
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
                sendToneStep(delta),
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
