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
   2. INITIAL DATA (Dữ liệu mẫu)
   ========================================================== */
document.getElementById("currentKey").textContent = "G# Minor";
document.getElementById("currentBpm").textContent = "128";
document.getElementById("modTime").textContent = "02:15";

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
document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        saveData();
    });
});

document.getElementById("autoDetectBtn")?.classList.add("active");

document.getElementById("musicBtn")?.addEventListener("click", (e) => {
    e.target.classList.toggle("disabled");
    saveData();
});

["mic1Btn", "mic2Btn", "fxBtn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", (e) => {
        e.target.classList.toggle("active");
        saveData();
    });
});

/* ==========================================================
   5. PLAY BUTTONS (Logic chuyển đổi PLAY/PLAYING)
   ========================================================== */
["clapPlayBtn", "laughPlayBtn"].forEach(id => {
    const btn = document.getElementById(id);
    btn?.addEventListener("click", () => {
        btn.classList.toggle("active");
        const textSpan = btn.querySelector(".text");
        if (textSpan) textSpan.textContent = btn.classList.contains("active") ? "PLAYING" : "PLAY";
    });
});

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

if (modPowerBtn) {
    modPowerBtn.classList.remove("active");
    modPowerBtn.textContent = "OFF";
}

if (toneSelector) {
    toneSelector.value = "0";
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
   8. KEY SELECTOR (chọn key thủ công / AI detect)
   ========================================================== */
const keySelector = document.getElementById("keySelector");
const applyKeyBtn = document.getElementById("applyKeyBtn");
const currentKeyEl = document.getElementById("currentKey");
const keyInfoEl = document.getElementById("keyInfo");

let autoDetectTimeout;

// Điểm DUY NHẤT chịu trách nhiệm bật chế độ AI Key Detect — trước đây có 2 chỗ tự chép lại
// logic này (khi bấm Apply chọn "AI Key Detect", và khi tự động hết 10s sau khi chọn tay),
// nên dễ bị lệch nhau. Giờ gộp về 1 chỗ để sau này nối engine AI thật chỉ cần sửa ở đây.
function triggerAiKeyDetect() {
    if (keyInfoEl) keyInfoEl.textContent = "AI Detecting...";
    setStatus("dot-key", "pending"); // cam: đang dò tone
    console.log("AI KEY DETECT MODE (KeyEngine.detectOnce — xem ui/js/engines/keyEngine.js)");

    // Nếu đang có 1 lượt dò dở dang từ trước (vd bấm Reset lần 2 khi chưa xong lần 1) -> hủy nó,
    // tránh 2 watcher chạy song song cùng lúc gọi applyDetectedKey() 2 lần chồng nhau.
    if (window.__keyDetectStopWatcher) window.__keyDetectStopWatcher();

    window.__keyDetectStopWatcher = KeyEngine.detectOnce((result) => {
        window.__keyDetectStopWatcher = null;
        applyDetectedKey(result);
    });
}

// Tách riêng khỏi triggerAiKeyDetect() để có thể tái sử dụng nếu sau này có nguồn phát
// hiện Key khác (vd nút "bài hát mới" tự reset), không phải chỉ gọi được từ 1 chỗ.
function applyDetectedKey(result) {
    originalKey = result.key; // vd "D Minor" — khớp đúng định dạng transposeKey/sendKeyToAutotune cần

    if (currentKeyEl) currentKeyEl.textContent = originalKey;
    if (keySelector) keySelector.value = originalKey; // có thể không khớp option nào nếu là dấu giáng hiếm, chỉ ảnh hưởng hiển thị dropdown, không ảnh hưởng logic
    if (keyInfoEl) keyInfoEl.textContent = `Auto Detect (${Math.round(result.confidence * 100)}% tin cậy)`;

    sendKeyToAutotune(originalKey).then((sendResult) => {
        if (sendResult.ok) {
            setStatus("dot-key", "online"); // xanh: đã dò được + gửi thành công xuống Auto-Tune
        } else {
            setStatus("dot-key", "offline");
            if (keyInfoEl) keyInfoEl.textContent = "⚠️ Lỗi gửi Key (AI)";
            console.error("sendKeyToAutotune (AI) lỗi:", sendResult.detail);
        }
    });

    // Đã chốt được Key gốc -> bắt đầu theo dõi modulation liên tục suốt phần còn lại của bài hát
    startModulationWatcher();
}

applyKeyBtn?.addEventListener("click", () => {
    const selectedKey = keySelector.value;

    if (selectedKey === "AI Key Detect") {
        triggerAiKeyDetect();
        return;
    }

    originalKey = selectedKey;
    if (currentKeyEl) currentKeyEl.textContent = selectedKey;
    if (keyInfoEl) keyInfoEl.textContent = "Manual Key";
    setStatus("dot-key", "pending"); // cam: đang gửi, chờ kết quả thực thi

    sendKeyToAutotune(selectedKey).then((result) => {
        if (result.ok) {
            setStatus("dot-key", "online"); // xanh: đã gửi thành công (qua MIDI hoặc click)
            if (keyInfoEl) keyInfoEl.textContent = `Manual Key (${result.driverUsed})`;
        } else {
            setStatus("dot-key", "offline"); // đỏ: gửi thất bại
            if (keyInfoEl) keyInfoEl.textContent = "Lỗi gửi Key";
            console.error("sendKeyToAutotune lỗi:", result.detail);
        }
    });

    // Sau 10s tự động nhường lại quyền cho AI — dùng ĐÚNG hàm triggerAiKeyDetect() ở trên,
    // thay vì tự đổi chữ trực tiếp như code cũ (khiến menu nói "đang AI Detect" trong khi
    // Auto-Tune thực tế vẫn giữ nguyên key chọn tay, không có gì thật sự chạy phía sau).
    clearTimeout(autoDetectTimeout);
    autoDetectTimeout = setTimeout(() => {
        keySelector.value = "AI Key Detect";
        console.log("Back To AI Key Detect (tự động sau 10s)");
        triggerAiKeyDetect();
    }, 10000);
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
    if (toneSelector) toneSelector.value = "0";
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
        modPowerBtn.textContent = "ON";
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

// Điểm DUY NHẤT thực sự áp 1 sự kiện mod — được gọi từ startModulationWatcher() (mục 13B)
// khi engine dò Mod thật (chromagram) phát hiện Key hiện tại lệch khỏi Key gốc.
// Vừa cập nhật UI, vừa gửi lệnh thật xuống Auto-Tune, trừ khi đang bị ghi đè tay.
async function applyModEvent(data) {
    const newKey = transposeKey(originalKey, data.semitone);
    updateModInfo(data.time, originalKey, newKey, data.semitone);
    aiSemitoneOffset = data.semitone;

    if (isManualOverrideActive()) {
        // Đang bị ghi đè tay -> chỉ ghi nhận giá trị AI muốn áp, KHÔNG gửi lệnh thật lúc
        // này để tránh đánh nhau với lệnh tay đang chủ động điều khiển Auto-Tune. Giá trị
        // này sẽ được áp khi người dùng tắt ghi đè tay (xem turnManualOverrideOff).
        console.log(`[MOD-AI] Muốn dịch ${data.semitone} bán cung (${data.time}) nhưng đang bị ghi đè tay, tạm hoãn.`);
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
    triggerAiKeyDetect();
});

// Bộ dò modulation chạy NGẦM LIÊN TỤC suốt bài hát — do ModEngine (ui/js/engines/modEngine.js)
// quản lý toàn bộ vòng lặp + state. Hàm này chỉ có nhiệm vụ: tính rootIndex của Key gốc rồi
// giao cho ModEngine, và định nghĩa applyModEvent làm callback khi ModEngine phát hiện lệch key.
function startModulationWatcher() {
    const rootMatch = originalKey.match(/^([A-G](?:#|b)?)/);
    const normalizedRoot = flatToSharp[rootMatch?.[1]] || rootMatch?.[1];
    const originalRootIndex = KeyEngine.NOTE_NAMES.indexOf(normalizedRoot);

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

    if (!soundcardId) {
        console.warn(
            "[Audio] Chưa chọn Soundcard ở Setup -> đang tạm dùng thiết bị mặc định của hệ điều hành. " +
            "Vào Setup > Soundcard để chọn đúng kênh loopback/audio interface đang phát nhạc, " +
            "nếu không BPM/Key sẽ dò từ mic thay vì từ nhạc."
        );
    }

    const audioConstraints = soundcardId
        ? {
              deviceId: { exact: soundcardId },
              // Tắt hết các bộ lọc dành cho giọng nói: chúng được thiết kế để "làm sạch" tiếng người,
              // nên sẽ bóp méo/triệt tiêu nhạc cụ và làm sai lệch kết quả phân tích BPM/Key.
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
          }
        : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
          };

    let stream;
    try {
        console.log("Đang khởi tạo Audio từ thiết bị:", soundcardId || "(mặc định — chưa cấu hình Setup)");
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
        });

        BPMEngine.onLevel(({ bassEnergy, localAvg, maxByte }) => {
            const meter = document.getElementById("vu-fill");
            if (meter) meter.style.width = Math.min(bassEnergy * 2, 100) + "%";
            __debugLogAudioLevel(bassEnergy, localAvg, maxByte); // <-- DEBUG TẠM THỜI
        });

        KeyEngine.onLevel(() => {
            __debugLogKeyConfidence(); // <-- DEBUG TẠM THỜI (tự throttle 1 lần/giây bên trong)
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
    updateNextModTime();
    updateCacheDot();
    checkAllSystems();
    loadData();

    // Ví dụ minh hoạ mod info ban đầu
    updateModInfo("02:15", "G# Minor", "C# Minor", 5);

    // 1. Khởi tạo Knobs — dùng 1 cặp mousemove/mouseup chung cho toàn bộ knob
    let activeKnob = null;
    let startY = 0;
    let startValue = 0;

    knobData.forEach(k => {
        updateKnob(k);
        const knob = document.getElementById(k.id);
        if (!knob) return;

        knob.addEventListener("wheel", (e) => {
            e.preventDefault();
            k.value = Math.max(0, Math.min(100, k.value + (e.deltaY < 0 ? 1 : -1)));
            updateKnob(k);
            saveData();
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
        });
    });

    document.addEventListener("mousemove", (e) => {
        if (!activeKnob) return;
        const delta = startY - e.clientY;
        activeKnob.value = Math.max(0, Math.min(100, startValue + Math.round(delta / 2)));
        updateKnob(activeKnob);
        saveData();
    });

    document.addEventListener("mouseup", () => {
        if (!activeKnob) return;
        activeKnob = null;
        document.body.style.cursor = "default";
    });

    // 2. Liệt kê thiết bị audio đầu vào (chỉ để debug/log)
    listAudioInputDevices();

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